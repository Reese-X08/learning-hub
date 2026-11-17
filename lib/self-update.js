'use strict';

/**
 * 应用内自更新：只下载有变化的程序文件，校验后替换，再由 restart-helper 重启服务。
 *
 * 不重新下载 31MB 的便携包，也不碰 node/ 和 data/：
 *   - 从 version.json 旁边的 update-manifest.json 读取文件清单
 *   - 和本地文件比 SHA-256，只下载变了的那几个（通常几百 KB）
 *   - 每个文件校验大小和哈希，JS 文件先跑 node --check
 *   - 替换前备份到 data/update-backup/<version>/，失败自动回滚
 *
 * 清单只允许改运行时代码和前端资源；data/、node/、local.bat、restart-helper.js
 * 都在白名单之外，避免更新把用户数据或重启逻辑弄坏。
 */

const fsp = require('node:fs').promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { compareVersions, normalizeVersion } = require('./updates.js');

const MANIFEST_NAME = 'update-manifest.json';
const MAX_MANIFEST_BYTES = 512 * 1024;
const MAX_FILES = 80;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;

// 允许自动更新的文件。刻意写死，清单里出现别的路径一律拒绝。
const ALLOWED_PATHS = [
  /^server\.js$/,
  /^package\.json$/,
  /^version\.json$/,
  /^updater\.ps1$/,
  /^lib\/[A-Za-z0-9_-]+\.js$/,
  /^public\/[A-Za-z0-9._-]+\.(?:js|css|html|webmanifest|png|ico|svg)$/i,
];

// 文本文件统一按 LF 计算哈希/写盘，避免 Windows 的 CRLF 和 GitHub 上的 LF 对不上
const TEXT_FILE = /\.(?:js|json|html|css|webmanifest|svg|txt|ps1)$/i;

function normalizeBuffer(buffer, relative) {
  if (!TEXT_FILE.test(relative)) return buffer;
  return Buffer.from(buffer.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function hashFile(file, relative) {
  const buffer = await fsp.readFile(file);
  return sha256(normalizeBuffer(buffer, relative));
}

function validateRelativePath(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.includes('\0') || raw.includes('\\')) return '';

  const rel = raw.replace(/\\/g, '/');
  if (rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return '';

  const normalized = path.posix.normalize(rel);
  if (normalized !== rel || normalized === '..' || normalized.startsWith('../')) return '';
  if (normalized === 'lib/restart-helper.js') return '';
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(normalized))) return '';
  return normalized;
}

function safeTarget(root, relative) {
  const rel = validateRelativePath(relative);
  if (!rel) throw new Error(`更新清单里有不安全的路径：${relative}`);
  const base = path.resolve(root);
  const target = path.resolve(base, ...rel.split('/'));
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`更新路径超出程序目录：${relative}`);
  }
  return target;
}

function candidateBases(manifestUrl) {
  const url = String(manifestUrl || '');
  const raw = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/main\/update-manifest\.json$/i.exec(url);
  const cdn = /^https:\/\/(?:cdn|fastly)\.jsdelivr\.net\/gh\/([^/]+)\/([^/]+)@main\/update-manifest\.json$/i.exec(url);
  const match = raw || cdn;
  if (match) {
    const owner = match[1];
    const repo = match[2];
    return [
      `https://raw.githubusercontent.com/${owner}/${repo}/main/`,
      `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/`,
      `https://fastly.jsdelivr.net/gh/${owner}/${repo}@main/`,
    ];
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];
    parsed.hash = '';
    parsed.search = '';
    if (parsed.pathname.endsWith('/' + MANIFEST_NAME)) {
      parsed.pathname = parsed.pathname.slice(0, -MANIFEST_NAME.length);
    } else {
      parsed.pathname = parsed.pathname.replace(/[^/]*$/, '');
    }
    return [parsed.href];
  } catch {
    return [];
  }
}

function fileUrl(base, relative) {
  const encoded = relative
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return new URL(encoded, base).href;
}

async function fetchBuffer(url, { fetchImpl, maxBytes, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持网络请求');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: '*/*',
        'Cache-Control': 'no-cache',
        'User-Agent': 'learning-hub-self-update',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error('文件太大');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('文件太大');
    return buffer;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('连接超时');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, { fetchImpl, maxBytes, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持网络请求');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache',
        'User-Agent': 'learning-hub-self-update',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error('返回内容过大');
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('返回内容过大');
    return text;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('连接超时');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseManifest(json, expectedVersion) {
  if (!json || typeof json !== 'object') throw new Error('更新清单为空');
  if (json.format !== undefined && Number(json.format) !== 1) throw new Error('更新清单格式不支持');

  const version = normalizeVersion(json.version);
  if (!version) throw new Error('更新清单缺少版本号');
  if (expectedVersion && compareVersions(version, expectedVersion) !== 0) {
    throw new Error(`更新清单版本 ${version} 与提示的 ${expectedVersion} 不一致`);
  }

  if (!Array.isArray(json.files) || !json.files.length) throw new Error('更新清单里没有文件');
  if (json.files.length > MAX_FILES) throw new Error('更新清单文件太多');

  const seen = new Set();
  const files = [];
  let total = 0;

  for (const item of json.files) {
    if (!item || typeof item !== 'object') throw new Error('更新清单里有无效条目');
    const relative = validateRelativePath(item.path);
    if (!relative) throw new Error(`更新清单里有不允许更新的路径：${item.path}`);
    if (seen.has(relative)) throw new Error(`更新清单重复列出：${relative}`);
    seen.add(relative);

    const size = Number(item.size);
    if (!Number.isInteger(size) || size < 0 || size > MAX_FILE_BYTES) {
      throw new Error(`文件大小不合法：${relative}`);
    }
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new Error('更新包总大小超过限制');

    const digest = String(item.sha256 || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`文件校验值不合法：${relative}`);

    files.push({ path: relative, size, sha256: digest });
  }

  if (!seen.has('package.json') || !seen.has('version.json')) {
    throw new Error('更新清单缺少 package.json / version.json');
  }

  return { version, files };
}

async function fetchManifest(manifestUrl, expectedVersion, fetchImpl) {
  const bases = candidateBases(manifestUrl);
  if (!bases.length) throw new Error('更新清单地址不合法');

  const errors = [];
  for (const base of bases) {
    const url = fileUrl(base, MANIFEST_NAME);
    try {
      const text = await fetchText(url, { fetchImpl, maxBytes: MAX_MANIFEST_BYTES });
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('返回的不是 JSON');
      }
      const manifest = parseManifest(json, expectedVersion);
      const ordered = [base, ...bases.filter((item) => item !== base)];
      return { manifest, baseUrl: base, bases: ordered, manifestUrl: url };
    } catch (error) {
      errors.push(`${new URL(url).host}：${error.message}`);
    }
  }

  throw new Error(`拿不到更新清单（${errors.slice(0, 2).join('；')}）`);
}

async function downloadFromBases(file, bases, fetchImpl) {
  const errors = [];
  for (const base of bases) {
    const url = fileUrl(base, file.path);
    try {
      const raw = await fetchBuffer(url, { fetchImpl, maxBytes: MAX_FILE_BYTES });
      const buffer = normalizeBuffer(raw, file.path);
      if (buffer.length !== file.size) throw new Error(`大小不一致（${buffer.length}/${file.size}）`);
      if (sha256(buffer) !== file.sha256) throw new Error('SHA-256 不一致');
      return buffer;
    } catch (error) {
      errors.push(`${new URL(url).host}：${error.message}`);
    }
  }
  throw new Error(`下载 ${file.path} 失败（${errors.slice(-2).join('；')}）`);
}

function checkSyntax(files) {
  for (const file of files) {
    if (!/\.js$/i.test(file.path)) continue;
    const result = spawnSync(process.execPath, ['--check', file.stagedPath], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true,
    });
    if (result.error) throw new Error(`无法校验 ${file.path}：${result.error.message}`);
    if (result.status !== 0) {
      const detail = String(result.stderr || '').trim().split('\n').slice(-2).join(' ').slice(0, 300);
      throw new Error(`新版本的 ${file.path} 语法检查失败：${detail}`);
    }
  }
}

async function readStagedJson(stagedMap, appDir, relative) {
  const staged = stagedMap.get(relative);
  const file = staged ? staged.stagedPath : path.join(appDir, ...relative.split('/'));
  const text = await fsp.readFile(file, 'utf8');
  return JSON.parse(text);
}

async function rollbackFiles(plan, logger = console) {
  const failures = [];
  for (const file of plan.files || []) {
    const target = safeTarget(plan.appDir, file.path);
    const backup = safeTarget(plan.backupDir, file.path);
    try {
      if (file.existed) {
        await fsp.copyFile(backup, target);
      } else {
        await fsp.rm(target, { force: true });
      }
    } catch (error) {
      failures.push(file.path);
      logger.warn?.(`[update] 回滚 ${file.path} 失败：`, error?.message || error);
    }
  }
  return failures;
}

async function applySelfUpdate(options) {
  const {
    appDir,
    dataDir,
    currentVersion,
    expectedVersion,
    manifestUrl,
    onProgress,
    fetchImpl = globalThis.fetch,
    logger = console,
  } = options;

  if (!appDir || !dataDir) throw new Error('缺少程序目录');
  if (!manifestUrl) throw new Error('这个更新源没有提供文件清单，请下载完整包');

  const progress = (phase, extra = {}) => {
    try {
      onProgress?.({ phase, ...extra });
    } catch {
      /* 进度推送失败不影响更新 */
    }
  };

  progress('manifest', { message: '正在获取更新清单…' });
  const { manifest, bases } = await fetchManifest(manifestUrl, expectedVersion, fetchImpl);

  if (compareVersions(manifest.version, currentVersion) <= 0) {
    throw new Error('更新清单不比当前版本新，请先重新检查更新');
  }

  const changed = [];
  for (const file of manifest.files) {
    const target = safeTarget(appDir, file.path);
    let same = false;
    try {
      const stat = await fsp.stat(target);
      if (stat.size === file.size || TEXT_FILE.test(file.path)) {
        same = (await hashFile(target, file.path)) === file.sha256;
      }
    } catch {
      same = false;
    }
    if (!same) changed.push(file);
  }

  if (!changed.length) throw new Error('清单和本地文件一致，没有需要下载的内容');

  // package.json / version.json 最后写：中途断电时，启动恢复能通过版本号判断是否装完
  const applyOrder = (file) => (file.path === 'package.json' ? 2 : file.path === 'version.json' ? 3 : 1);
  changed.sort((a, b) => applyOrder(a) - applyOrder(b));

  const stagingRoot = path.join(dataDir, 'update-staging');
  await fsp.rm(stagingRoot, { recursive: true, force: true });
  const stagingDir = path.join(stagingRoot, manifest.version);
  await fsp.mkdir(stagingDir, { recursive: true });

  const total = changed.length;
  const staged = [];
  let done = 0;

  try {
    for (const file of changed) {
      progress('download', {
        done,
        total,
        message: `正在下载 ${file.path}（${done + 1}/${total}）`,
      });
      const buffer = await downloadFromBases(file, bases, fetchImpl);
      const stagedPath = safeTarget(stagingDir, file.path);
      await fsp.mkdir(path.dirname(stagedPath), { recursive: true });
      await fsp.writeFile(stagedPath, buffer);
      staged.push({ ...file, stagedPath });
      done += 1;
    }

    progress('verify', { message: '正在校验新版本…' });

    const stagedMap = new Map(staged.map((file) => [file.path, file]));
    const pkg = await readStagedJson(stagedMap, appDir, 'package.json');
    if (normalizeVersion(pkg.version) !== manifest.version) {
      throw new Error('新版本 package.json 的版本号与更新清单不一致');
    }
    const meta = await readStagedJson(stagedMap, appDir, 'version.json');
    if (normalizeVersion(meta.version) !== manifest.version) {
      throw new Error('新版本 version.json 的版本号与更新清单不一致');
    }

    checkSyntax(staged);

    const backupRoot = path.join(dataDir, 'update-backup');
    await fsp.rm(backupRoot, { recursive: true, force: true });
    const backupDir = path.join(backupRoot, manifest.version);
    const plan = {
      version: manifest.version,
      fromVersion: currentVersion,
      appDir: path.resolve(appDir),
      backupDir,
      files: [],
    };

    // 先把所有旧文件完整备份，再写 plan、再替换；这样任何一步断电都能回滚
    for (const file of staged) {
      const target = safeTarget(appDir, file.path);
      let existed = false;
      try {
        const stat = await fsp.lstat(target);
        if (stat.isSymbolicLink()) throw new Error(`不覆盖符号链接：${file.path}`);
        existed = true;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      plan.files.push({ path: file.path, existed });
      if (existed) {
        const backup = safeTarget(backupDir, file.path);
        await fsp.mkdir(path.dirname(backup), { recursive: true });
        await fsp.copyFile(target, backup);
      }
    }

    const planFile = path.join(dataDir, 'update-plan.json');
    await fsp.writeFile(planFile, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

    progress('apply', { message: '正在替换程序文件…', total, done: total });

    try {
      for (const file of staged) {
        const target = safeTarget(appDir, file.path);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.copyFile(file.stagedPath, target);
      }
    } catch (error) {
      const failures = await rollbackFiles(plan, logger);
      if (!failures.length) {
        await fsp.rm(planFile, { force: true });
        throw new Error(`替换文件失败，已恢复上一版：${error.message}`);
      }
      throw new Error(`替换文件失败，而且这些文件没能回滚：${failures.join('、')}；请用完整包覆盖`);
    }

    await fsp.rm(stagingRoot, { recursive: true, force: true });
    return {
      version: manifest.version,
      changed: staged.length,
      planFile,
      backupDir,
    };
  } catch (error) {
    await fsp.rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

module.exports = {
  applySelfUpdate,
  parseManifest,
  validateRelativePath,
  candidateBases,
  rollbackFiles,
  MANIFEST_NAME,
};
