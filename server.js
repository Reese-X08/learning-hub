'use strict';

/**
 * 学习中心 · HTTP 服务
 *
 * 既可以直接 `node server.js` 当本地网站跑，也可以被桌面端（desktop/main.js）
 * 以 `createHubServer({ host: '127.0.0.1', port: 0 })` 的方式内嵌启动。
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const { createStore, StoreError } = require('./lib/store.js');

// 版本号：打包时会从 package.json 同步，界面上用来确认有没有更新成功
const APP_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

const COOKIE_NAME = 'xy_session';
const SESSION_TTL = 14 * 24 * 60 * 60 * 1000;
const MAX_BODY = 512 * 1024;
// 事务附件（Base64 后约 1.33 倍）和整包备份需要更大的上限
const MAX_UPLOAD_BODY = 32 * 1024 * 1024;
const MAX_IMPORT_BODY = 96 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ── 密码与会话 ───────────────────────────────────────────── */

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function makeAuthRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: hashPassword(password, salt), createdAt: new Date().toISOString() };
}

function verifyAgainst(record, password) {
  if (!record || !record.salt || !record.hash) return false;
  const actual = Buffer.from(hashPassword(password, record.salt), 'hex');
  const expected = Buffer.from(record.hash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

async function writeJsonAtomic(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fsp.rename(tmp, file);
}

function parseCookies(header) {
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key) out[key] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, '提交的内容太大了'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, '请求内容不是合法的 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function decodeDataUrl(value) {
  if (typeof value !== 'string') return null;
  const match = /^data:([^,]*),([\s\S]*)$/.exec(value);
  if (!match) return null;
  const meta = match[1];
  const isBase64 = /;base64$/i.test(meta);
  const type = meta.replace(/;base64$/i, '').split(';')[0] || '';
  try {
    const buffer = isBase64
      ? Buffer.from(match[2], 'base64')
      : Buffer.from(decodeURIComponent(match[2]), 'utf8');
    return { buffer, type };
  } catch {
    return null;
  }
}

// Content-Disposition 里的 ASCII 兜底文件名
function asciiFileName(name) {
  const safe = String(name || '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_')
    .trim();
  return safe || 'download';
}

// RFC 5987 的 filename* 编码，去掉 encodeURIComponent 不处理但规范不允许的字符
function encodedFileName(name) {
  return encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/* ── 服务工厂 ─────────────────────────────────────────────── */

function createHubServer(options = {}) {
  const dataDir = path.resolve(options.dataDir || path.join(__dirname, 'data'));
  const publicDir = path.resolve(options.publicDir || path.join(__dirname, 'public'));
  const host = options.host || '0.0.0.0';
  const port = options.port === undefined ? 4173 : Number(options.port);
  const quiet = options.quiet === true;
  const persistPassword = options.persistPassword !== false;

  const store = createStore(dataDir);
  const authFile = path.join(dataDir, 'auth.json');
  const filesDir = path.join(dataDir, 'files');

  /* 事务附件：内容存 data/files/<id>，db.json 里只留元信息 */

  function storedFilePath(id) {
    if (!/^[0-9a-f-]{1,64}$/i.test(String(id || ''))) throw new HttpError(400, '附件编号不合法');
    return path.join(filesDir, id);
  }

  async function writeStoredFile({ name, type, buffer }) {
    await fsp.mkdir(filesDir, { recursive: true });
    const id = crypto.randomUUID();
    await fsp.writeFile(path.join(filesDir, id), buffer);
    return { id, name: String(name).slice(0, 200), size: buffer.length, type: String(type || '').slice(0, 120) };
  }

  async function dropStoredFile(id) {
    try {
      await fsp.rm(storedFilePath(id), { force: true });
    } catch {
      /* 文件已经不在了就算了 */
    }
  }

  /**
   * 把备份 / 导入数据里内嵌的 Base64 附件落盘，替换成 {id,name,size,type} 元信息。
   * 失败时把这次已经写出去的文件清掉，避免留下孤儿文件。
   */
  async function materializeFiles(tasks) {
    if (!Array.isArray(tasks)) return tasks;

    const created = [];
    try {
      for (const task of tasks) {
        if (!task || typeof task !== 'object' || !Array.isArray(task.files)) continue;
        const out = [];
        for (const file of task.files.slice(0, 20)) {
          if (!file || typeof file !== 'object' || typeof file.name !== 'string' || !file.name.trim()) continue;

          if (typeof file.data === 'string' && file.data.startsWith('data:')) {
            const decoded = decodeDataUrl(file.data);
            if (!decoded) continue;
            if (decoded.buffer.length > MAX_FILE_BYTES) {
              throw new HttpError(413, `附件「${file.name}」超过 20MB`);
            }
            const meta = await writeStoredFile({
              name: file.name.trim(),
              type: file.type || decoded.type,
              buffer: decoded.buffer,
            });
            created.push(meta.id);
            out.push(meta);
          } else if (typeof file.id === 'string' && /^[0-9a-f-]{1,64}$/i.test(file.id)) {
            out.push({
              id: file.id,
              name: file.name.trim().slice(0, 200),
              size: Number(file.size) || 0,
              type: String(file.type || '').slice(0, 120),
            });
          }
        }
        task.files = out;
      }
    } catch (error) {
      await Promise.all(created.map((id) => dropStoredFile(id)));
      throw error;
    }

    return tasks;
  }

  // 导出备份时把附件内容一起塞进去，换电脑也能完整恢复
  async function embedFileData(db) {
    for (const task of db.tasks || []) {
      for (const file of task.files || []) {
        try {
          const buffer = await fsp.readFile(storedFilePath(file.id));
          file.data = `data:${file.type || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
        } catch {
          /* 文件丢了就只导出元信息 */
        }
      }
    }
    return db;
  }

  // 导入备份后清理不再被引用的旧附件
  async function pruneStoredFiles(db) {
    const keep = new Set();
    for (const task of db.tasks || []) {
      for (const file of task.files || []) keep.add(file.id);
    }
    let names = [];
    try {
      names = await fsp.readdir(filesDir);
    } catch {
      return;
    }
    await Promise.all(names.filter((name) => !keep.has(name)).map((name) => dropStoredFile(name)));
  }

  let auth = null;
  let generatedPassword = null;
  let requirePassword = true; // 由 settings.requirePassword 控制，可在站点设置里关掉
  const attempts = new Map();

  const MAX_FAILS = 5;
  const LOCK_MS = 60 * 1000;

  /* 认证 */

  async function readAuthFile() {
    try {
      return JSON.parse(await fsp.readFile(authFile, 'utf8'));
    } catch {
      return null;
    }
  }

  async function initAuth() {
    await fsp.mkdir(dataDir, { recursive: true });

    if (options.password) {
      if (persistPassword) {
        const existing = await readAuthFile();
        if (existing && verifyAgainst(existing, options.password)) {
          auth = existing;
          return;
        }
        auth = makeAuthRecord(options.password);
        await writeJsonAtomic(authFile, auth);
        return;
      }
      // 桌面端：密码只存在于内存，不落盘，也不覆盖用户网页版的密码
      auth = makeAuthRecord(options.password);
      return;
    }

    const existing = await readAuthFile();
    if (existing) {
      auth = existing;
      return;
    }

    generatedPassword = crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x');
    auth = makeAuthRecord(generatedPassword);
    await writeJsonAtomic(authFile, auth);
  }

  function sign(payload) {
    return crypto.createHmac('sha256', auth.hash).update(payload).digest('base64url');
  }

  function issueToken() {
    const payload = Buffer.from(
      JSON.stringify({ exp: Date.now() + SESSION_TTL, nonce: crypto.randomBytes(8).toString('hex') }),
    ).toString('base64url');
    return `${payload}.${sign(payload)}`;
  }

  function verifyToken(token) {
    if (!token || typeof token !== 'string') return false;
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return false;
    const payload = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    const expected = sign(payload);
    const actual = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (actual.length !== wanted.length) return false;
    if (!crypto.timingSafeEqual(actual, wanted)) return false;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return typeof data.exp === 'number' && data.exp > Date.now();
    } catch {
      return false;
    }
  }

  function isAuthed(req) {
    if (!requirePassword) return true;
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    return verifyToken(token);
  }

  function lockSeconds(ip) {
    const record = attempts.get(ip);
    if (!record) return 0;
    if (record.until && record.until > Date.now()) return Math.ceil((record.until - Date.now()) / 1000);
    if (record.until) attempts.delete(ip);
    return 0;
  }

  function noteFailure(ip) {
    const record = attempts.get(ip) || { fails: 0, until: 0 };
    record.fails += 1;
    if (record.fails >= MAX_FAILS) {
      record.until = Date.now() + LOCK_MS;
      record.fails = 0;
    }
    attempts.set(ip, record);
  }

  /* 响应 */

  function baseHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', CSP);
  }

  function sendJson(res, status, payload, headers = {}) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    baseHeaders(res);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      ...headers,
    });
    res.end(body);
  }

  /* 静态文件 */

  async function serveStatic(req, res, url) {
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      throw new HttpError(400, '路径不合法');
    }
    if (pathname === '/') pathname = '/index.html';
    if (pathname.includes('\0')) throw new HttpError(400, '路径不合法');

    const root = publicDir;
    const target = path.resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new HttpError(403, '无权访问');
    }

    let stat;
    try {
      stat = await fsp.stat(target);
    } catch {
      throw new HttpError(404, '页面不存在');
    }
    if (!stat.isFile()) throw new HttpError(404, '页面不存在');

    const ext = path.extname(target).toLowerCase();
    baseHeaders(res);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      // HTML 绝不缓存：避免更新后浏览器还拿着旧页面、新脚本对不上
      'Cache-Control': ext === '.html' ? 'no-store' : 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(target).pipe(res);
  }

  /* API */

  async function handleApi(req, res, url) {
    const route = url.pathname;
    const method = req.method || 'GET';

    if (route === '/api/session' && method === 'GET') {
      return sendJson(res, 200, { authenticated: isAuthed(req), requirePassword, version: APP_VERSION });
    }

    if (route === '/api/version' && method === 'GET') {
      return sendJson(res, 200, { version: APP_VERSION });
    }

    if (route === '/api/login' && method === 'POST') {
      if (!requirePassword) return sendJson(res, 200, { ok: true, disabled: true });

      const ip = req.socket.remoteAddress || 'unknown';
      const wait = lockSeconds(ip);
      if (wait > 0) return sendJson(res, 429, { error: `尝试次数过多，请 ${wait} 秒后再试` });

      const body = await readBody(req);
      const password = typeof body.password === 'string' ? body.password : '';
      if (!password) return sendJson(res, 400, { error: '请输入密码' });

      if (!verifyAgainst(auth, password)) {
        noteFailure(ip);
        return sendJson(res, 401, { error: '密码不正确' });
      }
      attempts.delete(ip);
      const cookie = [
        `${COOKIE_NAME}=${encodeURIComponent(issueToken())}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${Math.floor(SESSION_TTL / 1000)}`,
      ].join('; ');
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie });
    }

    if (route === '/api/logout' && method === 'POST') {
      return sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` },
      );
    }

    if (!isAuthed(req)) {
      return sendJson(res, 401, { error: '登录状态已失效，请重新登录' });
    }

    if (route === '/api/data' && method === 'GET') {
      const data = await store.snapshot();
      return sendJson(res, 200, {
        settings: data.settings,
        courses: data.courses,
        categories: data.categories,
        tasks: data.tasks,
      });
    }

    if (route === '/api/export' && method === 'GET') {
      const data = await embedFileData(await store.snapshot());
      const stamp = new Date().toISOString().slice(0, 10);
      return sendJson(res, 200, data, {
        'Content-Disposition': `attachment; filename="learning-hub-${stamp}.json"`,
      });
    }

    if (route === '/api/import' && method === 'POST') {
      const body = await readBody(req, MAX_IMPORT_BODY);
      if (!body || typeof body !== 'object') throw new HttpError(400, '文件内容不对');
      await materializeFiles(body.tasks);
      try {
        const result = await store.replaceAll(body);
        await pruneStoredFiles(await store.snapshot());
        return sendJson(res, 200, { ok: true, count: result.count, tasks: result.tasks });
      } catch (error) {
        // 导入失败：把这次刚写出去、还没被引用的附件清掉
        await pruneStoredFiles(await store.snapshot());
        throw error;
      }
    }

    // 从旧版「我的事务管理」导出的数据（taskApp2）也可以直接导进来
    if (route === '/api/affairs/import' && method === 'POST') {
      const body = await readBody(req, MAX_IMPORT_BODY);
      if (!body || typeof body !== 'object' || !Array.isArray(body.tasks)) {
        throw new HttpError(400, '文件里没有 tasks 列表');
      }
      await materializeFiles(body.tasks);
      try {
        const result = await store.importAffairs(body);
        return sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        await pruneStoredFiles(await store.snapshot());
        throw error;
      }
    }

    /* ── 事务 ── */

    if (route === '/api/tasks' && method === 'POST') {
      const body = await readBody(req);
      const task = await store.createTask(body);
      return sendJson(res, 201, { task });
    }

    const taskFilesMatch = /^\/api\/tasks\/([\w-]{1,64})\/files$/.exec(route);
    if (taskFilesMatch && method === 'POST') {
      const body = await readBody(req, MAX_UPLOAD_BODY);
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
      if (!name) throw new HttpError(400, '缺少文件名');
      const decoded = decodeDataUrl(body.data);
      if (!decoded) throw new HttpError(400, '文件内容格式不对');
      if (!decoded.buffer.length) throw new HttpError(400, '文件是空的');
      if (decoded.buffer.length > MAX_FILE_BYTES) throw new HttpError(413, '单个附件不能超过 20MB');

      const meta = await writeStoredFile({ name, type: body.type || decoded.type, buffer: decoded.buffer });
      try {
        const result = await store.addTaskFile(taskFilesMatch[1], meta);
        return sendJson(res, 201, { file: result.file, task: result.task });
      } catch (error) {
        await dropStoredFile(meta.id);
        throw error;
      }
    }

    const taskFileMatch = /^\/api\/tasks\/([\w-]{1,64})\/files\/([\w-]{1,64})$/.exec(route);
    if (taskFileMatch && method === 'DELETE') {
      const { file } = await store.removeTaskFile(taskFileMatch[1], taskFileMatch[2]);
      await dropStoredFile(file.id);
      return sendJson(res, 200, { ok: true });
    }

    const taskMatch = /^\/api\/tasks\/([\w-]{1,64})$/.exec(route);
    if (taskMatch) {
      if (method === 'PATCH' || method === 'PUT') {
        const body = await readBody(req);
        const task = await store.updateTask(taskMatch[1], body);
        return sendJson(res, 200, { task });
      }

      if (method === 'DELETE') {
        const task = await store.deleteTask(taskMatch[1]);
        for (const file of task.files || []) await dropStoredFile(file.id);
        return sendJson(res, 200, { ok: true });
      }
    }

    /* ── 分类 ── */

    if (route === '/api/categories' && method === 'POST') {
      const body = await readBody(req);
      const category = await store.createCategory(body);
      return sendJson(res, 201, { category });
    }

    const categoryMatch = /^\/api\/categories\/([\w-]{1,64})$/.exec(route);
    if (categoryMatch) {
      if (method === 'PATCH' || method === 'PUT') {
        const body = await readBody(req);
        const category = await store.updateCategory(categoryMatch[1], body);
        return sendJson(res, 200, { category });
      }
      if (method === 'DELETE') {
        await store.deleteCategory(categoryMatch[1]);
        return sendJson(res, 200, { ok: true });
      }
    }

    /* ── 附件下载 ── */

    const fileMatch = /^\/api\/files\/([\w-]{1,64})$/.exec(route);
    if (fileMatch && method === 'GET') {
      const found = await store.findTaskFile(fileMatch[1]);
      if (!found) throw new HttpError(404, '找不到这个附件');
      const target = storedFilePath(found.file.id);
      let stat;
      try {
        stat = await fsp.stat(target);
      } catch {
        throw new HttpError(404, '附件文件已经丢失了');
      }
      const name = found.file.name || '附件';
      baseHeaders(res);
      res.writeHead(200, {
        'Content-Type': found.file.type || 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${asciiFileName(name)}"; filename*=UTF-8''${encodedFileName(name)}`,
        'Cache-Control': 'private, max-age=0',
      });
      fs.createReadStream(target).pipe(res);
      return;
    }

    if (route === '/api/settings' && method === 'POST') {
      const body = await readBody(req);
      const settings = await store.saveSettings(body);
      requirePassword = settings.requirePassword !== false;
      return sendJson(res, 200, { settings });
    }

    if (route === '/api/courses' && method === 'POST') {
      const body = await readBody(req);
      const course = await store.createCourse(body);
      return sendJson(res, 201, { course });
    }

    const deadlineMatch = /^\/api\/courses\/([\w-]{1,64})\/deadlines$/.exec(route);
    if (deadlineMatch && method === 'POST') {
      const body = await readBody(req);
      if (!Array.isArray(body.deadlines)) throw new HttpError(400, 'deadlines 必须是数组');
      const result = await store.addDeadlines(deadlineMatch[1], body.deadlines);
      return sendJson(res, 200, result);
    }

    const match = /^\/api\/courses\/([\w-]{1,64})$/.exec(route);
    if (match) {
      const id = match[1];

      if (method === 'PATCH' || method === 'PUT') {
        const body = await readBody(req);
        const course = await store.updateCourse(id, body);
        return sendJson(res, 200, { course });
      }

      if (method === 'DELETE') {
        await store.deleteCourse(id);
        return sendJson(res, 200, { ok: true });
      }
    }

    throw new HttpError(404, '接口不存在');
  }

  /* 服务器 */

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        await serveStatic(req, res, url);
      } else {
        throw new HttpError(405, '不支持的请求方法');
      }
    } catch (err) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (err instanceof HttpError || err instanceof StoreError) {
        sendJson(res, err.status || 400, { error: err.message });
      } else {
        console.error('[error]', err);
        sendJson(res, 500, { error: '服务器内部错误' });
      }
    }
  });

  async function listen() {
    await initAuth();
    const initial = await store.snapshot(); // 确保 data/db.json 存在
    requirePassword = initial.settings?.requirePassword !== false;

    await new Promise((resolve, reject) => {
      const onError = (err) => reject(err);
      server.once('error', onError);
      server.listen(port, host, () => {
        server.off('error', onError);
        resolve();
      });
    });

    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    const shownHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;

    if (!quiet && options.banner !== false) {
      printBanner(host, actualPort);
    }

    return { port: actualPort, host, url: `http://${shownHost}:${actualPort}`, password: generatedPassword };
  }

  function close() {
    return new Promise((resolve) => {
      server.close(() => resolve());
      setTimeout(() => resolve(), 1500).unref();
    });
  }

  return { listen, close, server, store, dataDir, publicDir };
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function printBanner(host, port) {
  console.log('');
  console.log('  学习中心已启动');
  console.log('');
  console.log(`  本机访问   http://localhost:${port}`);
  if (host === '0.0.0.0') {
    for (const ip of lanAddresses()) console.log(`  局域网     http://${ip}:${port}`);
    console.log('');
    console.log('  提示：同一 WiFi 下的手机/平板可以用上面的局域网地址打开。');
  }
  console.log('');
  console.log('  停止服务   Ctrl + C');
  console.log('');
}

function printPasswordBox(password) {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │  首次启动，已生成访问密码：                   │');
  console.log(`  │      ${password.padEnd(38)}│`);
  console.log('  │  忘了密码可以重设：                           │');
  console.log('  │      node server.js set-password 新密码       │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
}

/* ── 命令行 ───────────────────────────────────────────────── */

async function setPassword(dataDir, password) {
  const authFile = path.join(dataDir, 'auth.json');
  await writeJsonAtomic(authFile, makeAuthRecord(password));
  return authFile;
}

async function cli() {
  const argv = process.argv.slice(2);

  if (argv[0] === 'set-password') {
    const password = argv[1];
    if (!password || password.length < 4) {
      console.error('用法：node server.js set-password 你的新密码   （至少 4 位）');
      process.exitCode = 1;
      return;
    }
    await setPassword(path.join(__dirname, 'data'), password);
    console.log('访问密码已更新。如果服务正在运行，重启后生效。');
    return;
  }

  const hub = createHubServer({
    port: Number(process.env.PORT || 4173),
    host: process.env.HOST || '0.0.0.0',
    password: process.env.APP_PASSWORD || null,
    banner: false,
  });

  const info = await hub.listen();

  if (info.password) printPasswordBox(info.password);
  printBanner(info.host, info.port);

  const shutdown = () => {
    console.log('\n正在关闭…');
    hub.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createHubServer, setPassword };

if (require.main === module) {
  cli().catch((err) => {
    console.error('启动失败：', err);
    process.exit(1);
  });
}
