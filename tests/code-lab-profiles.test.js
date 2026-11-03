'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs').promises;
const path = require('node:path');

const { createHubServer } = require('../server.js');

async function makeTempDir(prefix) {
  const root = path.join(__dirname, '.tmp');
  await fsp.mkdir(root, { recursive: true });
  return fsp.mkdtemp(path.join(root, prefix));
}

test('配置记忆 API：登录后才能读写，重启后仍保留', async () => {
  const dir = await makeTempDir('lh-profiles-');
  const db = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'templates', 'db.template.json'), 'utf8'));
  db.settings.requirePassword = true;
  await fsp.writeFile(path.join(dir, 'db.json'), JSON.stringify(db, null, 2), 'utf8');

  const hub = createHubServer({
    dataDir: dir,
    port: 0,
    host: '127.0.0.1',
    password: 'test-password',
    persistPassword: false,
    quiet: true,
    selfUpdate: false,
    banner: false,
  });

  try {
    const info = await hub.listen();
    const base = info.url;

    const denied = await fetch(base + '/api/code-lab/profiles');
    assert.equal(denied.status, 401);
    assert.ok(!(await denied.text()).includes('sk-secret'));

    const login = await fetch(base + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-password' }),
    });
    assert.equal(login.status, 200);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];

    const empty = await fetch(base + '/api/code-lab/profiles', { headers: { cookie } });
    assert.equal(empty.status, 200);
    assert.deepEqual((await empty.json()).profiles, []);

    const profiles = [
      {
        id: 'p1', name: 'DeepSeek 日常', provider: 'deepseek',
        apiBase: 'https://api.deepseek.com/v1', apiKey: 'sk-secret',
        model: 'deepseek-flash', proxy: '',
        createdAt: '2026-11-03T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z',
      },
      {
        id: 'p2', name: '智谱免费额度', provider: 'zhipu',
        apiBase: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'sk-zhipu',
        model: 'glm-4-flash', proxy: '',
      },
    ];
    const saved = await fetch(base + '/api/code-lab/profiles', {
      method: 'PUT',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles, activeProfileId: 'p1' }),
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).count, 2);

    const read = await fetch(base + '/api/code-lab/profiles', { headers: { cookie } });
    const data = await read.json();
    assert.equal(data.profiles.length, 2);
    assert.equal(data.activeProfileId, 'p1');
    assert.equal(data.profiles.find((p) => p.id === 'p1').apiKey, 'sk-secret');
    assert.ok(fs.existsSync(path.join(dir, 'code-lab-profiles.json')));

    const bad = await fetch(base + '/api/code-lab/profiles', {
      method: 'PUT',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles: 'nope' }),
    });
    assert.equal(bad.status, 400);

    // 重新读一次，确认落盘内容完整
    const persisted = JSON.parse(await fsp.readFile(path.join(dir, 'code-lab-profiles.json'), 'utf8'));
    assert.equal(persisted.profiles.length, 2);
  } finally {
    await hub.close();
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
