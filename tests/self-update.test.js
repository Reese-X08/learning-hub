'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fsp = require('node:fs').promises;
const crypto = require('node:crypto');

const { applySelfUpdate, parseManifest } = require('../lib/self-update.js');

const quietLogger = { info() {}, warn() {}, error() {} };
const TEXT_FILE = /\.(?:js|json|html|css|webmanifest|svg|txt)$/i;

function normalize(buffer, relative) {
  if (!TEXT_FILE.test(relative)) return Buffer.from(buffer);
  return Buffer.from(buffer.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
}

function entry(relative, buffer) {
  const normalized = normalize(buffer, relative);
  return {
    path: relative,
    size: normalized.length,
    sha256: crypto.createHash('sha256').update(normalized).digest('hex'),
  };
}

function text(value) {
  return Buffer.from(value, 'utf8');
}

async function makeTempDir(prefix) {
  const root = path.join(__dirname, '.tmp');
  await fsp.mkdir(root, { recursive: true });
  return fsp.mkdtemp(path.join(root, prefix));
}

async function writeFile(root, relative, data) {
  const file = path.join(root, ...relative.split('/'));
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, data);
}

async function readFile(root, relative) {
  return fsp.readFile(path.join(root, ...relative.split('/')));
}

function startFixture(files) {
  const counts = new Map();
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname).replace(/^\//, '');
    counts.set(pathname, (counts.get(pathname) || 0) + 1);
    const data = files[pathname];
    if (!data) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': data.length,
    });
    res.end(data);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        counts,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function baseApp() {
  return {
    'package.json': text(JSON.stringify({ version: '2.6.0' }, null, 2)),
    'version.json': text(JSON.stringify({ version: '2.6.0' }, null, 2)),
    'server.js': text("'use strict';\nconsole.log('old');\n"),
    'lib/updates.js': text("'use strict';\nmodule.exports = { old: true };\n"),
    'public/app.js': text("'use strict';\nconsole.log('old app');\n"),
    'public/icon.png': Buffer.from([1, 2, 3, 4]),
  };
}

function nextApp() {
  return {
    'package.json': text(JSON.stringify({ version: '2.6.1' }, null, 2)),
    'version.json': text(JSON.stringify({ version: '2.6.1' }, null, 2)),
    'server.js': text("'use strict';\nconsole.log('new');\n"),
    'lib/updates.js': text("'use strict';\nmodule.exports = { old: true };\n"),
    'public/app.js': text("'use strict';\nconsole.log('new app');\n"),
    'public/icon.png': Buffer.from([9, 8, 7, 6, 5]),
  };
}

function manifestFor(files, version = '2.6.1') {
  return {
    format: 1,
    version,
    files: Object.entries(files).map(([relative, data]) => entry(relative, data)),
  };
}

async function setup() {
  const appDir = await makeTempDir('lh-self-app-');
  const dataDir = path.join(appDir, 'data');
  const old = baseApp();
  for (const [relative, data] of Object.entries(old)) await writeFile(appDir, relative, data);
  return { appDir, dataDir, old };
}

test('只下载变化的文件，校验后替换并保留备份', async () => {
  const { appDir, dataDir } = await setup();
  const next = nextApp();
  const fixture = await startFixture({
    'update-manifest.json': text(JSON.stringify(manifestFor(next))),
    ...next,
  });

  try {
    const progress = [];
    const result = await applySelfUpdate({
      appDir,
      dataDir,
      currentVersion: '2.6.0',
      expectedVersion: '2.6.1',
      manifestUrl: `${fixture.url}/update-manifest.json`,
      logger: quietLogger,
      onProgress: (item) => progress.push(item),
    });

    assert.equal(result.version, '2.6.1');
    assert.equal(result.changed, 5);
    assert.equal((await readFile(appDir, 'server.js')).toString(), "'use strict';\nconsole.log('new');\n");
    assert.deepEqual([...await readFile(appDir, 'public/icon.png')], [9, 8, 7, 6, 5]);
    assert.equal(JSON.parse((await readFile(appDir, 'package.json')).toString()).version, '2.6.1');
    assert.equal(fixture.counts.get('lib/updates.js'), undefined, '没变化的文件不应该下载');

    const backup = await readFile(dataDir, 'update-backup/2.6.1/server.js');
    assert.equal(backup.toString(), "'use strict';\nconsole.log('old');\n");

    const plan = JSON.parse((await readFile(dataDir, 'update-plan.json')).toString());
    assert.equal(plan.version, '2.6.1');
    assert.ok(plan.files.some((file) => file.path === 'server.js' && file.existed));
    await assert.rejects(readFile(dataDir, 'update-staging'), /ENOENT/);
    assert.ok(progress.some((item) => item.phase === 'download'));
    assert.ok(progress.some((item) => item.phase === 'apply'));
  } finally {
    await fixture.close();
    await fsp.rm(appDir, { recursive: true, force: true });
  }
});

test('CRLF 本地文件不会被误判成改动', async () => {
  const { appDir, dataDir } = await setup();
  await writeFile(appDir, 'server.js', text("'use strict';\r\nconsole.log('same');\r\n"));

  const next = nextApp();
  next['server.js'] = text("'use strict';\nconsole.log('same');\n");
  next['lib/updates.js'] = text("'use strict';\nmodule.exports = { old: true };\n");
  const fixture = await startFixture({
    'update-manifest.json': text(JSON.stringify(manifestFor(next))),
    ...next,
  });

  try {
    const result = await applySelfUpdate({
      appDir,
      dataDir,
      currentVersion: '2.6.0',
      expectedVersion: '2.6.1',
      manifestUrl: `${fixture.url}/update-manifest.json`,
      logger: quietLogger,
    });
    assert.equal(result.changed, 4);
    assert.equal(fixture.counts.get('server.js'), undefined);
    assert.equal((await readFile(appDir, 'server.js')).toString(), "'use strict';\r\nconsole.log('same');\r\n");
  } finally {
    await fixture.close();
    await fsp.rm(appDir, { recursive: true, force: true });
  }
});

test('清单里的路径必须在上传白名单内', () => {
  assert.throws(
    () => parseManifest({
      version: '2.6.1',
      files: [
        { path: '../data/db.json', size: 2, sha256: 'a'.repeat(64) },
        { path: 'package.json', size: 2, sha256: 'b'.repeat(64) },
        { path: 'version.json', size: 2, sha256: 'c'.repeat(64) },
      ],
    }),
    /不允许/,
  );
  assert.throws(
    () => parseManifest({
      version: '2.6.1',
      files: [
        { path: 'data/db.json', size: 2, sha256: 'a'.repeat(64) },
        { path: 'package.json', size: 2, sha256: 'b'.repeat(64) },
        { path: 'version.json', size: 2, sha256: 'c'.repeat(64) },
      ],
    }),
    /不允许/,
  );
});

test('哈希不一致时不动任何文件', async () => {
  const { appDir, dataDir } = await setup();
  const oldServer = (await readFile(appDir, 'server.js')).toString();
  const next = nextApp();
  const manifest = manifestFor(next);
  manifest.files.find((file) => file.path === 'public/app.js').sha256 = 'f'.repeat(64);
  const fixture = await startFixture({
    'update-manifest.json': text(JSON.stringify(manifest)),
    ...next,
  });

  try {
    await assert.rejects(
      applySelfUpdate({
        appDir,
        dataDir,
        currentVersion: '2.6.0',
        expectedVersion: '2.6.1',
        manifestUrl: `${fixture.url}/update-manifest.json`,
        logger: quietLogger,
      }),
      /SHA-256 不一致/,
    );
    assert.equal((await readFile(appDir, 'server.js')).toString(), oldServer);
    await assert.rejects(readFile(dataDir, 'update-plan.json'), /ENOENT/);
  } finally {
    await fixture.close();
    await fsp.rm(appDir, { recursive: true, force: true });
  }
});

test('新版本 JS 语法错误时拒绝安装', async () => {
  const { appDir, dataDir } = await setup();
  const oldServer = (await readFile(appDir, 'server.js')).toString();
  const next = nextApp();
  next['server.js'] = text('function {');
  const fixture = await startFixture({
    'update-manifest.json': text(JSON.stringify(manifestFor(next))),
    ...next,
  });

  try {
    await assert.rejects(
      applySelfUpdate({
        appDir,
        dataDir,
        currentVersion: '2.6.0',
        expectedVersion: '2.6.1',
        manifestUrl: `${fixture.url}/update-manifest.json`,
        logger: quietLogger,
      }),
      /语法检查失败/,
    );
    assert.equal((await readFile(appDir, 'server.js')).toString(), oldServer);
  } finally {
    await fixture.close();
    await fsp.rm(appDir, { recursive: true, force: true });
  }
});

test('清单版本和提示版本不一致时拒绝', () => {
  assert.throws(
    () => parseManifest({ version: '2.6.2', files: [] }, '2.6.1'),
    /不一致/,
  );
});
