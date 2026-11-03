'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fsp = require('node:fs').promises;

const { createUpdateChecker, compareVersions } = require('../lib/updates.js');
const { createHubServer } = require('../server.js');

const quietLogger = { info() {}, warn() {}, error() {} };

// Windows 上系统临时目录可能不可写，测试产生的数据放在仓库内的 .tmp/ 里
async function makeTempDir(prefix) {
  const root = path.join(__dirname, '.tmp');
  await fsp.mkdir(root, { recursive: true });
  return fsp.mkdtemp(path.join(root, prefix));
}

function startFixture(version, notes = '测试更新') {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        version,
        notes,
        url: 'https://example.com/download',
      }),
    );
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/version.json`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test('版本号比较按数字段走', () => {
  assert.equal(compareVersions('2.6.0', '2.5.1'), 1);
  assert.equal(compareVersions('2.10.0', '2.9.9'), 1);
  assert.equal(compareVersions('v2.5.1', '2.5.1'), 0);
  assert.equal(compareVersions('2.5.1-beta', '2.5.1'), -1);
  assert.equal(compareVersions('2.5', '2.5.0'), 0);
});

test('检查器发现新版本、写盘，重启后能直接读到', async () => {
  const dir = await makeTempDir('lh-update-');
  const fixture = await startFixture('2.6.0', '支持应用内推送');
  const checker = createUpdateChecker({
    currentVersion: '2.5.1',
    dataDir: dir,
    customUrl: fixture.url,
    logger: quietLogger,
  });

  try {
    await checker.start();
    const snapshot = await checker.check({ force: true });
    assert.equal(snapshot.hasUpdate, true);
    assert.equal(snapshot.latestVersion, '2.6.0');
    assert.equal(snapshot.notes, '支持应用内推送');
    assert.equal(snapshot.downloadUrl, 'https://example.com/download');
    assert.ok(snapshot.checkedAt);
  } finally {
    checker.stop();
  }

  const restarted = createUpdateChecker({
    currentVersion: '2.5.1',
    dataDir: dir,
    customUrl: fixture.url,
    logger: quietLogger,
  });
  try {
    await restarted.start();
    const snapshot = restarted.snapshot();
    assert.equal(snapshot.latestVersion, '2.6.0');
    assert.equal(snapshot.hasUpdate, true);
  } finally {
    restarted.stop();
    await fixture.close();
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('同时点两次「检查更新」会共用一次检查，不会返回空结果', async () => {
  const dir = await makeTempDir('lh-update-');
  const fixture = await startFixture('2.6.2');
  const checker = createUpdateChecker({
    currentVersion: '2.5.1',
    dataDir: dir,
    customUrl: fixture.url,
    logger: quietLogger,
  });

  try {
    await checker.start();
    const [first, second] = await Promise.all([
      checker.check({ force: true }),
      checker.check({ force: true }),
    ]);
    assert.equal(first.latestVersion, '2.6.2');
    assert.equal(second.latestVersion, '2.6.2');
    assert.equal(first.hasUpdate, true);
  } finally {
    checker.stop();
    await fixture.close();
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('自定义更新源不通时自动回退到官方线路', async () => {
  const dir = await makeTempDir('lh-update-');
  const checker = createUpdateChecker({
    currentVersion: '2.5.1',
    dataDir: dir,
    customUrl: 'http://127.0.0.1:1/version.json',
    logger: quietLogger,
    fetchImpl: async (url) => {
      if (new URL(url).hostname === 'cdn.jsdelivr.net') {
        return new Response(JSON.stringify({ version: '2.7.0', notes: '来自备用线路' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new TypeError('fetch failed');
    },
  });

  try {
    await checker.start();
    const snapshot = await checker.check({ force: true });
    assert.equal(snapshot.hasUpdate, true);
    assert.equal(snapshot.latestVersion, '2.7.0');
    assert.match(snapshot.source, /备用线路/);
    assert.equal(snapshot.providers.filter((item) => item.ok).length, 1);
  } finally {
    checker.stop();
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('服务端通过 SSE 把新版本推给已打开的窗口', async () => {
  const dir = await makeTempDir('lh-hub-');
  const fixture = await startFixture('9.9.9', 'SSE 推送测试');
  const hub = createHubServer({
    dataDir: dir,
    port: 0,
    host: '127.0.0.1',
    password: 'test-password',
    persistPassword: false,
    quiet: true,
    banner: false,
  });

  let controller;
  try {
    await hub.store.saveSettings({ title: '测试', updateUrl: fixture.url });
    const info = await hub.listen();
    const base = info.url;

    const login = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-password' }),
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    assert.match(cookie, /xy_session=/);

    const cached = await fetch(`${base}/api/update`, { headers: { cookie } });
    assert.equal(cached.status, 200);
    assert.equal((await cached.json()).currentVersion, require('../package.json').version);

    const deniedApply = await fetch(`${base}/api/update/apply`, { method: 'POST', headers: { cookie } });
    assert.equal(deniedApply.status, 409);
    assert.match((await deniedApply.json()).error, /不支持应用内更新/);

    controller = new AbortController();
    const stream = await fetch(`${base}/api/events`, { headers: { cookie }, signal: controller.signal });
    assert.match(stream.headers.get('content-type') || '', /text\/event-stream/);

    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    async function nextUpdate() {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const split = buffer.indexOf('\n\n');
        if (split >= 0) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
          if (dataLine) return JSON.parse(dataLine.slice(6));
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error('SSE 提前结束');
        buffer += decoder.decode(value, { stream: true });
      }
      throw new Error('等待 SSE 推送超时');
    }

    const initial = await nextUpdate();
    assert.equal(initial.hasUpdate, false);

    const manual = await fetch(`${base}/api/update/check`, { method: 'POST', headers: { cookie } });
    assert.equal(manual.status, 200);
    assert.equal((await manual.json()).hasUpdate, true);

    let pushed = null;
    for (let i = 0; i < 4; i += 1) {
      const event = await nextUpdate();
      if (event.hasUpdate) {
        pushed = event;
        break;
      }
    }
    assert.ok(pushed, '应该收到 hasUpdate=true 的推送');
    assert.equal(pushed.latestVersion, '9.9.9');
    assert.equal(pushed.notes, 'SSE 推送测试');
    assert.ok(pushed.downloadUrl);
  } finally {
    controller?.abort();
    await hub.close();
    await fixture.close();
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
