'use strict';

/**
 * 自更新重启助手。
 *
 * self-update 替换完文件后把本脚本以 detached 方式拉起，然后旧服务退出。
 * 这里等旧进程退出 → 启动新 server.js → 轮询 /api/version：
 *   - 版本号正确：删掉 update-plan.json，助手退出，新服务继续跑
 *   - 新服务起不来 / 版本不对：杀掉新进程，按 update-plan.json 恢复上一版，再启动旧服务
 *
 * 这个文件不在自动更新白名单里，保证重启逻辑本身不会被一次坏更新换掉。
 */

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    out[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const appDir = path.resolve(args.app || path.join(__dirname, '..'));
const planFile = path.resolve(args.plan || '');
const dataDir = path.dirname(planFile);
const port = Number(args.port || process.env.PORT || 4173);
const host = args.host || process.env.HOST || '127.0.0.1';
const expectedVersion = String(args.version || '').replace(/^v/i, '');
const parentPid = Number(args.pid || 0);
const logFile = path.join(dataDir, 'update-restart.log');
const healthHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host;

function log(message) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {
    /* 日志写不进去也不影响重启 */
  }
}

function safeJoin(root, relative) {
  const rel = String(relative || '').replace(/\\/g, '/');
  if (!rel || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) throw new Error('路径不合法');
  if (rel === '..' || rel.startsWith('../') || rel.includes('/../')) throw new Error('路径不合法');
  const base = path.resolve(root);
  const target = path.resolve(base, ...rel.split('/'));
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('路径超出目录');
  return target;
}

async function waitForParent(pid, timeoutMs = 15000) {
  if (!pid) return true;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await sleep(250);
  }
  return false;
}

function startServer() {
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: host,
    UPDATE_RESTARTED: '1',
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: appDir,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return child;
}

function requestVersion() {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { host: healthHost, port, path: '/api/version', timeout: 2500 },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          try {
            const info = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            resolve(String(info.version || '').replace(/^v/i, ''));
          } catch {
            reject(new Error('返回内容不是 JSON'));
          }
        });
      },
    );
    request.on('timeout', () => request.destroy(new Error('请求超时')));
    request.on('error', reject);
  });
}

async function waitForVersion(timeoutMs = 25000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const version = await requestVersion();
      if (version === expectedVersion) return true;
      lastError = new Error(`版本还是 ${version || '未知'}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(600);
  }
  throw lastError || new Error('新版本没有按时启动');
}

async function restore(plan) {
  const failures = [];
  for (const file of plan.files || []) {
    try {
      const target = safeJoin(appDir, file.path);
      const backup = safeJoin(plan.backupDir, file.path);
      if (file.existed) {
        await fsp.copyFile(backup, target);
      } else {
        await fsp.rm(target, { force: true });
      }
    } catch (error) {
      failures.push(`${file.path}（${error.message}）`);
    }
  }
  return failures;
}

function writeError(version, message) {
  try {
    fs.writeFileSync(
      path.join(dataDir, 'update-error.json'),
      `${JSON.stringify({ version, message, at: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    );
  } catch {
    /* 忽略 */
  }
}

(async () => {
  log(`启动重启助手：pid=${process.pid} parent=${parentPid} port=${port} version=${expectedVersion}`);

  let plan;
  try {
    plan = JSON.parse(await fsp.readFile(planFile, 'utf8'));
  } catch (error) {
    log('读不到 update-plan.json：' + error.message);
    process.exit(1);
  }

  if (!(await waitForParent(parentPid))) {
    log('旧服务一直没有退出，放弃重启');
    writeError(expectedVersion, '旧服务没有退出，更新文件已下载，但没有自动重启');
    process.exit(1);
  }

  await sleep(700);
  log('旧服务已退出，启动新版本');
  let child = startServer();

  try {
    await waitForVersion();
    log(`新版本 ${expectedVersion} 启动成功`);
    await fsp.rm(planFile, { force: true });
    await fsp.rm(path.join(dataDir, 'update-error.json'), { force: true });
    process.exit(0);
  } catch (error) {
    log('新版本启动失败：' + error.message + '，开始回滚');
    try {
      child.kill();
    } catch {
      /* 已经退出 */
    }
    await sleep(600);

    const failures = await restore(plan);
    if (failures.length) {
      log('回滚不完整：' + failures.join('；'));
      writeError(expectedVersion, `新版本启动失败，且回滚不完整（${failures.join('、')}），请用完整包覆盖`);
    } else {
      log('回滚完成，重新启动旧版本：' + error.message);
      writeError(expectedVersion, '新版本启动失败，已自动恢复上一版。请稍后重试，或下载完整包。');
    }

    await fsp.rm(planFile, { force: true });
    startServer();
    process.exit(1);
  }
})().catch((error) => {
  log('重启助手异常：' + (error?.stack || error));
  process.exit(1);
});
