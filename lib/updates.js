'use strict';

/**
 * 版本更新检查器
 *
 * 以前是浏览器打开页面时 fetch 一次 version.json：页面不开就不查、GitHub raw 被墙就
 * 静默失败，用户只能自己反复点「检查更新」。这里把检查搬到本地服务端：
 *
 *   - 服务启动后很快查一次，之后每 30 分钟查一次（窗口关着也照查）
 *   - 默认同时问 GitHub raw / jsDelivr / GitHub Releases，取能连通且版本最高的结果
 *   - 自定义更新地址优先；自定义地址不通时自动切回官方线路
 *   - 结果写到 data/update-state.json，重启后立刻知道上次查到什么
 *   - 状态变化通过 EventEmitter 通知 server.js，再由 SSE 推给所有打开的窗口
 */

const fsp = require('node:fs').promises;
const path = require('node:path');
const { EventEmitter } = require('node:events');

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 128 * 1024;
const FORCE_COOLDOWN_MS = 4000;
const AUTO_COOLDOWN_MS = 20 * 1000;
const STATE_FILE = 'update-state.json';
const DEFAULT_REPOSITORY = 'https://github.com/Reese-X08/learning-hub';

/* ── 版本号 ─────────────────────────────────────────────────── */

function parseVersionParts(value) {
  const raw = String(value ?? '').trim().replace(/^v/i, '');
  const match = /^(\d+(?:\.\d+){0,4})(?:[-+]([0-9A-Za-z.-]+))?$/.exec(raw);
  if (!match) return null;
  return { core: match[1].split('.').map((n) => Number.parseInt(n, 10)), suffix: match[2] || '' };
}

function normalizeVersion(value) {
  const parts = parseVersionParts(value);
  if (!parts) return '';
  return String(value ?? '')
    .trim()
    .replace(/^v/i, '');
}

function compareVersions(left, right) {
  const a = parseVersionParts(left);
  const b = parseVersionParts(right);
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  const length = Math.max(a.core.length, b.core.length);
  for (let i = 0; i < length; i += 1) {
    const x = a.core[i] || 0;
    const y = b.core[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }

  // 1.0.0 比 1.0.0-beta 新
  if (a.suffix === b.suffix) return 0;
  if (!a.suffix) return 1;
  if (!b.suffix) return -1;
  return a.suffix.localeCompare(b.suffix, 'en');
}

/* ── 小工具 ─────────────────────────────────────────────────── */

function cleanUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href;
  } catch {
    return '';
  }
}

function isoDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function clip(text, max) {
  return String(text ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function friendlyError(error) {
  const message = String(error?.message || error || '未知错误');
  if (/abort|timeout|timed out/i.test(message)) return '连接超时';
  if (/fetch failed|network|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(message)) return '网络不可达';
  if (/^HTTP \d{3}$/.test(message)) return message;
  return message.slice(0, 120);
}

/* ── 更新源 ─────────────────────────────────────────────────── */

function repositoryInfo(repositoryUrl) {
  const raw = String(repositoryUrl || DEFAULT_REPOSITORY);
  const match = /github\.com[/:]([^/]+)\/([^/#?]+)/i.exec(raw);
  const owner = (match?.[1] || 'Reese-X08').trim();
  const repo = (match?.[2] || 'learning-hub').replace(/\.git$/i, '').trim();
  return { owner, repo, releaseUrl: `https://github.com/${owner}/${repo}/releases/latest` };
}

function officialSources(repositoryUrl) {
  const { owner, repo, releaseUrl } = repositoryInfo(repositoryUrl);
  return [
    {
      id: 'github-raw',
      label: 'GitHub',
      kind: 'version-json',
      releaseUrl,
      url: `https://raw.githubusercontent.com/${owner}/${repo}/main/version.json`,
    },
    {
      id: 'jsdelivr',
      label: 'jsDelivr',
      kind: 'version-json',
      releaseUrl,
      url: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/version.json`,
    },
    {
      id: 'fastly',
      label: 'jsDelivr Fastly',
      kind: 'version-json',
      releaseUrl,
      url: `https://fastly.jsdelivr.net/gh/${owner}/${repo}@main/version.json`,
    },
    {
      id: 'github-release',
      label: 'GitHub Releases',
      kind: 'github-release',
      releaseUrl,
      url: `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    },
  ];
}

function customSource(url, releaseUrl) {
  const isGithubRelease = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/releases/i.test(url);
  return {
    id: 'custom',
    label: '自定义更新源',
    kind: isGithubRelease ? 'github-release' : 'version-json',
    releaseUrl,
    url,
  };
}

async function requestJson(url, { fetchImpl, currentVersion }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': `learning-hub/${currentVersion}`,
        'Cache-Control': 'no-cache',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_RESPONSE_BYTES) throw new Error('返回内容过大');

    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error('返回内容过大');

    try {
      return JSON.parse(text);
    } catch {
      throw new Error('返回的不是 JSON');
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('连接超时');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// version.json 旁边放 update-manifest.json，自更新时按清单只下载有变化的文件
function siblingManifestUrl(url) {
  if (!/\/version\.json$/i.test(String(url || ''))) return '';
  return String(url).replace(/\/version\.json$/i, '/update-manifest.json');
}

function readVersionJson(json, source) {
  if (!json || typeof json !== 'object') throw new Error('返回内容为空');
  const version = normalizeVersion(json.version);
  if (!version) throw new Error('缺少 version 字段');

  return {
    version,
    notes: clip(json.notes || json.body || json.description || '', 2000),
    url: cleanUrl(json.url) || cleanUrl(json.downloadUrl) || source.releaseUrl,
    releaseUrl: cleanUrl(json.releaseUrl) || cleanUrl(json.html_url) || source.releaseUrl,
    publishedAt: isoDate(json.publishedAt || json.published_at || json.date),
    manifestUrl: cleanUrl(siblingManifestUrl(source.url)),
  };
}

function readGithubRelease(json, source) {
  if (!json || typeof json !== 'object') throw new Error('返回内容为空');
  // 少数仓库的 tag 不是版本号（比如 tag 叫 update），退一步用 Release 标题
  const version = normalizeVersion(json.tag_name) || normalizeVersion(json.name);
  if (!version) throw new Error('Release 里没有版本号');

  return {
    version,
    notes: clip(json.body || json.name || '', 2000),
    url: cleanUrl(json.html_url) || source.releaseUrl,
    releaseUrl: cleanUrl(json.html_url) || source.releaseUrl,
    publishedAt: isoDate(json.published_at),
    manifestUrl: '',
  };
}

/* ── 检查器 ─────────────────────────────────────────────────── */

function createUpdateChecker(options = {}) {
  const currentVersion = normalizeVersion(options.currentVersion) || String(options.currentVersion || '0.0.0');
  const dataDir = path.resolve(options.dataDir || path.join(process.cwd(), 'data'));
  const intervalMs = Math.max(5 * 60 * 1000, Number(options.intervalMs) || DEFAULT_INTERVAL_MS);
  const logger = options.logger || console;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const repositoryUrl = options.repositoryUrl || DEFAULT_REPOSITORY;
  const repo = repositoryInfo(repositoryUrl);
  const sources = officialSources(repositoryUrl);
  const stateFile = path.join(dataDir, STATE_FILE);
  const emitter = new EventEmitter();

  let customUrl = cleanUrl(options.customUrl);
  let started = false;
  let inflight = null;
  let runToken = 0;
  let lastRunAt = 0;
  let firstTimer = null;
  let intervalTimer = null;

  const state = {
    latest: null,
    checkedAt: '',
    attemptedAt: '',
    checking: false,
    error: '',
    source: '',
    manifestUrl: '',
    providers: [],
  };

  function snapshot() {
    const reportedVersion = state.latest?.version || '';
    const hasUpdate = Boolean(reportedVersion && compareVersions(reportedVersion, currentVersion) > 0);
    return {
      currentVersion,
      // 更新源还没同步到新版时可能报回比当前更低的版本，界面上按「已是最新」显示
      latestVersion: hasUpdate ? reportedVersion : currentVersion,
      hasUpdate,
      notes: hasUpdate ? state.latest?.notes || '' : '',
      downloadUrl: state.latest?.url || repo.releaseUrl,
      releaseUrl: state.latest?.releaseUrl || repo.releaseUrl,
      publishedAt: state.latest?.publishedAt || '',
      source: state.source,
      checkedAt: state.checkedAt,
      attemptedAt: state.attemptedAt,
      checking: state.checking,
      error: state.error,
      manifestUrl: state.manifestUrl,
      canSelfUpdate: hasUpdate && Boolean(state.manifestUrl),
      intervalMinutes: Math.round(intervalMs / 60000),
      providers: state.providers.map((item) => ({
        label: item.label,
        ok: item.ok,
        version: item.version || '',
        error: item.error || '',
      })),
    };
  }

  function emitChange() {
    emitter.emit('change', snapshot());
  }

  async function loadPersisted() {
    let raw;
    try {
      raw = JSON.parse(await fsp.readFile(stateFile, 'utf8'));
    } catch {
      return;
    }
    if (!raw || typeof raw !== 'object') return;
    if ((cleanUrl(raw.customUrl) || '') !== customUrl) return; // 换过地址，旧结果不算数

    const version = normalizeVersion(raw?.latest?.version);
    if (!version) return;

    state.latest = {
      version,
      notes: clip(raw.latest.notes, 2000),
      url: cleanUrl(raw.latest.url) || repo.releaseUrl,
      releaseUrl: cleanUrl(raw.latest.releaseUrl) || repo.releaseUrl,
      publishedAt: isoDate(raw.latest.publishedAt),
    };
    state.checkedAt = isoDate(raw.checkedAt);
    state.source = clip(raw.source, 80);
    state.manifestUrl = cleanUrl(raw.manifestUrl) || '';
  }

  async function persist() {
    try {
      await fsp.mkdir(dataDir, { recursive: true });
      const payload = {
        customUrl,
        latest: state.latest,
        checkedAt: state.checkedAt,
        source: state.source,
        manifestUrl: state.manifestUrl,
        savedAt: new Date().toISOString(),
      };
      const tmp = `${stateFile}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      await fsp.rename(tmp, stateFile);
    } catch (error) {
      logger.warn?.('[update] 保存检查结果失败：', error?.message || error);
    }
  }

  async function loadSource(source) {
    const json = await requestJson(source.url, { fetchImpl, currentVersion });
    return source.kind === 'github-release' ? readGithubRelease(json, source) : readVersionJson(json, source);
  }

  async function runSources(list) {
    return Promise.all(
      list.map(async (source) => {
        try {
          const info = await loadSource(source);
          return { source, ok: true, info };
        } catch (error) {
          return { source, ok: false, error: friendlyError(error) };
        }
      }),
    );
  }

  function pickBest(results) {
    let best = null;
    for (const result of results) {
      if (!result.ok || !result.info) continue;
      if (!best || compareVersions(result.info.version, best.info.version) > 0) best = result;
    }
    return best;
  }

  async function check({ force = false } = {}) {
    // 已经有一次检查在跑：等它的结果，不要并发打更新源
    if (inflight) {
      await inflight;
      return snapshot();
    }

    const now = Date.now();
    if (!force && now - lastRunAt < AUTO_COOLDOWN_MS) return snapshot();
    if (force && now - lastRunAt < FORCE_COOLDOWN_MS) return snapshot();
    lastRunAt = now;

    if (typeof fetchImpl !== 'function') {
      state.error = '当前 Node 版本不支持自动检查更新（需要 Node 18 及以上）';
      emitChange();
      return snapshot();
    }

    state.checking = true;
    state.attemptedAt = new Date(now).toISOString();
    emitChange();

    const token = ++runToken;

    inflight = (async () => {
      let results;
      let usedFallback = false;

      if (customUrl) {
        results = await runSources([customSource(customUrl, repo.releaseUrl)]);
        if (!results.some((item) => item.ok)) {
          usedFallback = true;
          results = results.concat(await runSources(sources));
        }
      } else {
        results = await runSources(sources);
      }

      if (token !== runToken) return; // 更新地址被改过，这批结果不算数

      state.providers = results.map((item) => ({
        label: item.source.label,
        ok: item.ok,
        version: item.ok ? item.info.version : '',
        error: item.ok ? '' : item.error,
      }));

      const best = pickBest(results);
      if (best) {
        const previousVersion = state.latest?.version || '';
        state.latest = { ...best.info };
        state.checkedAt = new Date().toISOString();
        state.error = '';
        state.source = `${best.source.label}${usedFallback ? '（备用线路）' : ''}`;
        state.manifestUrl = best.info.manifestUrl || '';
        await persist();

        if (previousVersion !== state.latest.version) {
          if (compareVersions(state.latest.version, currentVersion) > 0) {
            logger.info?.(`[update] 发现新版本 ${state.latest.version}（当前 ${currentVersion}）`);
          } else {
            logger.info?.(`[update] 已是最新版本 ${currentVersion}`);
          }
        }
      } else {
        const reasons = [...new Set(results.map((item) => item.error).filter(Boolean))].slice(0, 2);
        state.error = reasons.length
          ? `暂时连不上更新服务（${reasons.join('；')}）`
          : '暂时连不上更新服务';
        logger.warn?.(`[update] ${state.error}`);
      }
    })()
      .catch((error) => {
        if (token !== runToken) return;
        state.error = `检查更新时出错：${friendlyError(error)}`;
        logger.warn?.('[update]', error);
      })
      .finally(() => {
        if (token !== runToken) return;
        state.checking = false;
        inflight = null;
        emitChange();
      });

    await inflight;
    return snapshot();
  }

  function setCustomUrl(value) {
    const next = cleanUrl(value);
    if (next === customUrl) return;
    customUrl = next;
    runToken += 1; // 让还在路上的旧检查结果作废
    inflight = null;
    state.latest = null;
    state.checkedAt = '';
    state.attemptedAt = '';
    state.error = '';
    state.source = '';
    state.manifestUrl = '';
    state.providers = [];
    emitChange();
    if (started) check({ force: true }).catch(() => {});
  }

  async function start() {
    if (started) return snapshot();
    started = true;
    await loadPersisted();
    emitChange();

    firstTimer = setTimeout(() => {
      check({ force: false }).catch(() => {});
    }, FIRST_CHECK_DELAY_MS);
    firstTimer.unref?.();

    intervalTimer = setInterval(() => {
      check({ force: false }).catch(() => {});
    }, intervalMs);
    intervalTimer.unref?.();

    return snapshot();
  }

  function stop() {
    if (firstTimer) clearTimeout(firstTimer);
    if (intervalTimer) clearInterval(intervalTimer);
    firstTimer = null;
    intervalTimer = null;
    started = false;
  }

  return {
    start,
    stop,
    check,
    snapshot,
    setCustomUrl,
    on: (event, handler) => {
      emitter.on(event, handler);
      return () => emitter.off(event, handler);
    },
    get customUrl() {
      return customUrl;
    },
    intervalMs,
  };
}

module.exports = {
  createUpdateChecker,
  compareVersions,
  normalizeVersion,
  officialSources,
  repositoryInfo,
  DEFAULT_INTERVAL_MS,
};
