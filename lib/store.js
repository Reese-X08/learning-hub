'use strict';

/**
 * 数据层：课程与设置的读写、校验。
 * 被 server.js（网页版）和 desktop/main.js（桌面版）共用，两边操作同一个 data/db.json。
 */

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');

const STATUSES = ['未开始', '进行中', '已完成', '暂停'];
const PALETTE = ['#4f63ff', '#12b3a8', '#8b5cf6', '#f59e0b', '#0ea5e9', '#f43f5e', '#22c55e', '#ec4899'];

const DEFAULT_SETTINGS = {
  title: '学习中心',
  subtitle: '把散落在各个平台的课程，收进一个页面',
  semester: '',
  requirePassword: true,
  links: [],
  updateUrl: '',
};

class StoreError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'StoreError';
    this.status = status;
  }
}

const uid = () => crypto.randomUUID();

function str(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim().slice(0, max);
}

function cleanUrl(value) {
  const raw = str(value, 600);
  if (!raw) return '';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeDeadlines(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const title = str(item.title, 80);
    if (!title) continue;
    let due = '';
    if (item.due) {
      const time = new Date(item.due);
      if (!Number.isNaN(time.getTime())) due = time.toISOString();
    }
    out.push({
      id: typeof item.id === 'string' && item.id ? item.id.slice(0, 64) : uid(),
      title,
      due,
      done: Boolean(item.done),
      // 这条任务绑定的具体网址；留空就用所属课程的网址
      url: cleanUrl(item.url) || '',
    });
  }
  return out;
}

// 自定义网址（不属于任何课程的快捷入口）
function normalizeLinks(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list.slice(0, 24)) {
    if (!item || typeof item !== 'object') continue;
    const title = str(item.title, 40);
    const url = cleanUrl(item.url);
    if (!title || !url) continue;
    out.push({
      id: typeof item.id === 'string' && item.id ? item.id.slice(0, 64) : uid(),
      title,
      url,
    });
  }
  return out;
}

function buildCourse(input, base) {  const name = str(input.name, 80);
  if (!name) throw new StoreError('课程名不能为空');

  const url = cleanUrl(input.url);
  if (url === null) throw new StoreError('网址格式不对，请以 http:// 或 https:// 开头');

  const rawStatus = str(input.status, 10);
  const status = STATUSES.includes(rawStatus) ? rawStatus : '进行中';

  let progress = clampInt(input.progress, 0, 100, base ? base.progress : 0);
  if (status === '已完成') progress = 100;
  if (status === '未开始') progress = Math.min(progress, 99);

  const color = /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? String(input.color) : PALETTE[0];
  const now = new Date().toISOString();

  return {
    id: base ? base.id : uid(),
    name,
    platform: str(input.platform, 40),
    url,
    category: str(input.category, 30),
    color,
    status,
    progress,
    notes: str(input.notes, 2000),
    deadlines: input.deadlines === undefined && base ? base.deadlines : normalizeDeadlines(input.deadlines),
    createdAt: base ? base.createdAt : now,
    updatedAt: now,
  };
}

function normalizeDb(raw) {
  const settings = {
    title: str(raw?.settings?.title, 40) || DEFAULT_SETTINGS.title,
    subtitle: str(raw?.settings?.subtitle, 120),
    semester: str(raw?.settings?.semester, 40),
    requirePassword: raw?.settings?.requirePassword !== false,
    links: normalizeLinks(raw?.settings?.links),
    updateUrl: cleanUrl(raw?.settings?.updateUrl) || '',
  };
  const courses = Array.isArray(raw?.courses) ? raw.courses.filter((c) => c && typeof c === 'object' && c.id) : [];
  return { version: 1, settings, courses };
}

function seedDatabase() {
  const stamp = new Date().toISOString();

  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, semester: '2026 秋季学期' },
    courses: [
      {
        id: uid(),
        name: '学习通',
        platform: '学习通',
        url: 'https://i.chaoxing.com/',
        category: '必修',
        color: '#f59e0b',
        status: '进行中',
        progress: 0,
        notes: '超星学习通网页版，登录后就是自己的课程列表。',
        deadlines: [],
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: uid(),
        name: '高等数学 A',
        platform: '雨课堂',
        url: 'https://www.yuketang.cn/v2/web/index',
        category: '必修',
        color: '#4f63ff',
        status: '进行中',
        progress: 46,
        notes: '每周二、四上课；课件在雨课堂的「资料」里，课后 24 小时内会出回放。',
        deadlines: [],
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: uid(),
        name: '大学英语（学术写作）',
        platform: '小雅',
        url: '',
        category: '必修',
        color: '#12b3a8',
        status: '进行中',
        progress: 30,
        notes: '小雅平台每个学校的入口地址不同，把你的学校地址填进「网址」里就能一键打开。',
        deadlines: [],
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: uid(),
        name: '数据结构与算法',
        platform: '中国大学MOOC',
        url: 'https://www.icourse163.org/',
        category: '专业核心',
        color: '#8b5cf6',
        status: '进行中',
        progress: 72,
        notes: '',
        deadlines: [],
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: uid(),
        name: 'Python 数据分析',
        platform: 'B站',
        url: 'https://www.bilibili.com/',
        category: '自学',
        color: '#0ea5e9',
        status: '进行中',
        progress: 88,
        notes: '收藏夹里那个 40 集的系列课，看到第 34 集。',
        deadlines: [],
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: uid(),
        name: '机器学习的数学基础',
        platform: 'YouTube',
        url: 'https://www.youtube.com/',
        category: '自学',
        color: '#f43f5e',
        status: '已完成',
        progress: 100,
        notes: '',
        deadlines: [],
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
  };
}

function createStore(dataDir) {
  const dbFile = path.join(dataDir, 'db.json');

  let cache = null;
  let cacheMtime = 0;
  let queue = Promise.resolve();

  async function writeDb(next) {
    await fsp.mkdir(dataDir, { recursive: true });
    try {
      await fsp.copyFile(dbFile, `${dbFile}.bak`);
    } catch {
      /* 首次写入没有旧文件 */
    }
    const tmp = `${dbFile}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await fsp.rename(tmp, dbFile);
    const stat = await fsp.stat(dbFile);
    cache = next;
    cacheMtime = stat.mtimeMs;
  }

  async function readDbFile() {
    let raw;
    try {
      raw = await fsp.readFile(dbFile, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.courses)) return null;
      return normalizeDb(parsed);
    } catch {
      const backup = `${dbFile}.corrupt-${Date.now()}`;
      await fsp.rename(dbFile, backup).catch(() => {});
      console.warn(`[store] db.json 解析失败，已备份为 ${path.basename(backup)}`);
      return null;
    }
  }

  /**
   * 读取当前数据。用文件 mtime 做缓存判断，这样网页版和桌面版同时开着时，
   * 任何一边改了数据，另一边下次读取就会看到最新内容。
   */
  async function load() {
    await fsp.mkdir(dataDir, { recursive: true });
    const stat = await fsp.stat(dbFile).catch(() => null);

    if (!stat) {
      if (cache) return cache;
      const seeded = seedDatabase();
      await writeDb(seeded);
      return seeded;
    }
    if (cache && stat.mtimeMs === cacheMtime) return cache;

    const parsed = await readDbFile();
    if (!parsed) {
      const seeded = seedDatabase();
      await writeDb(seeded);
      return seeded;
    }
    cache = parsed;
    cacheMtime = stat.mtimeMs;
    return parsed;
  }

  function mutate(task) {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function readSnapshot() {
    const db = await load();
    return structuredClone(db);
  }

  return {
    file: dbFile,

    async snapshot() {
      return readSnapshot();
    },

    async createCourse(input) {
      return mutate(async () => {
        const db = await load();
        const course = buildCourse(input, null);
        db.courses.unshift(course);
        await writeDb(db);
        return structuredClone(course);
      });
    },

    async updateCourse(id, patch) {
      return mutate(async () => {
        const db = await load();
        const index = db.courses.findIndex((c) => c.id === id);
        if (index < 0) throw new StoreError('找不到这门课程', 404);
        const merged = buildCourse({ ...db.courses[index], ...patch }, db.courses[index]);
        db.courses[index] = merged;
        await writeDb(db);
        return structuredClone(merged);
      });
    },

    async deleteCourse(id) {
      return mutate(async () => {
        const db = await load();
        const before = db.courses.length;
        db.courses = db.courses.filter((c) => c.id !== id);
        if (db.courses.length === before) throw new StoreError('找不到这门课程', 404);
        await writeDb(db);
        return true;
      });
    },

    // 从平台页面扫出来的任务，按「标题 + 截止时间」去重后追加
    async addDeadlines(id, list) {
      return mutate(async () => {
        const db = await load();
        const course = db.courses.find((c) => c.id === id);
        if (!course) throw new StoreError('找不到这门课程', 404);

        const incoming = normalizeDeadlines(list);
        if (!course.deadlines) course.deadlines = [];
        const seen = new Set(course.deadlines.map((d) => `${d.title}|${d.due}`));

        let added = 0;
        for (const item of incoming) {
          const key = `${item.title}|${item.due}`;
          if (seen.has(key)) continue;
          seen.add(key);
          course.deadlines.push(item);
          added += 1;
        }

        if (added > 0) {
          course.updatedAt = new Date().toISOString();
          await writeDb(db);
        }
        return { added, skipped: incoming.length - added, total: course.deadlines.length };
      });
    },

    async saveSettings(input) {
      return mutate(async () => {
        const db = await load();
        // 没传的字段保持原值，避免局部提交把别的设置清空
        db.settings = {
          title: input.title === undefined ? db.settings.title : str(input.title, 40) || DEFAULT_SETTINGS.title,
          subtitle: input.subtitle === undefined ? db.settings.subtitle : str(input.subtitle, 120),
          semester: input.semester === undefined ? db.settings.semester : str(input.semester, 40),
          requirePassword:
            input.requirePassword === undefined ? db.settings.requirePassword !== false : input.requirePassword !== false,
          links: input.links === undefined ? db.settings.links || [] : normalizeLinks(input.links),
          updateUrl: input.updateUrl === undefined ? db.settings.updateUrl || '' : cleanUrl(input.updateUrl) || '',
        };
        await writeDb(db);
        return structuredClone(db.settings);
      });
    },

    async replaceAll(payload) {
      return mutate(async () => {
        if (!payload || !Array.isArray(payload.courses)) {
          throw new StoreError('文件格式不对：缺少 courses 列表');
        }
        const db = await load();
        const now = new Date().toISOString();
        // 保留备份里已有的 id / 创建时间，导入后卡片不会“换身份”
        const courses = payload.courses.map((course) => {
          const base =
            course && typeof course.id === 'string' && course.id
              ? {
                  id: course.id.slice(0, 64),
                  createdAt: typeof course.createdAt === 'string' ? course.createdAt : now,
                  progress: 0,
                  deadlines: [],
                }
              : null;
          return buildCourse(course, base);
        });
        const settings = payload.settings
          ? {
              title: str(payload.settings.title, 40) || DEFAULT_SETTINGS.title,
              subtitle: str(payload.settings.subtitle, 120),
              semester: str(payload.settings.semester, 40),
            }
          : db.settings;
        const next = { version: 1, settings, courses };
        await writeDb(next);
        return { count: courses.length };
      });
    },
  };
}

module.exports = {
  createStore,
  buildCourse,
  normalizeDb,
  seedDatabase,
  StoreError,
  STATUSES,
  PALETTE,
  DEFAULT_SETTINGS,
};
