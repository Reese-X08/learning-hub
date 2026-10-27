'use strict';

/**
 * 数据层：课程、事务、分类与设置的读写、校验。
 * 被 server.js（网页版）和桌面端（desktop/main.js）共用，两边操作同一个 data/db.json。
 *
 * 结构（version 2）：
 *   { version, settings, courses, categories, tasks }
 *   - courses    课程（网址入口 + 进度 + 截止事项）
 *   - categories 事务分类（家庭作业 / 日程安排 / 个人事务 …）
 *   - tasks      事务（日期、分类、优先级、备注、附件）
 */

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');

const STATUSES = ['未开始', '进行中', '已完成', '暂停'];
const PALETTE = ['#4f63ff', '#12b3a8', '#8b5cf6', '#f59e0b', '#0ea5e9', '#f43f5e', '#22c55e', '#ec4899'];

// 默认分类沿用旧版「我的事务管理」的三个分类，颜色也一样，方便导入后不串色
const DEFAULT_CATEGORIES = [
  { id: 'hw', name: '家庭作业', color: '#3b82f6' },
  { id: 'sch', name: '日程安排', color: '#22c55e' },
  { id: 'per', name: '个人事务', color: '#f59e0b' },
];

const MAX_TASKS = 5000;
const MAX_TASK_FILES = 20;

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
const pad2 = (value) => String(value).padStart(2, '0');

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

function cleanColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// 事务的日期统一成 YYYY-MM-DD；兼容带时间的 ISO 字符串和旧数据
function normalizeDateKey(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const probe = new Date(Number(y), Number(m) - 1, Number(d));
    if (Number.isNaN(probe.getTime())) return '';
    if (probe.getFullYear() !== Number(y) || probe.getMonth() !== Number(m) - 1 || probe.getDate() !== Number(d)) {
      return '';
    }
    return `${y}-${m}-${d}`;
  }
  const time = new Date(raw);
  if (Number.isNaN(time.getTime())) return '';
  return `${time.getFullYear()}-${pad2(time.getMonth() + 1)}-${pad2(time.getDate())}`;
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

/* ── 事务 / 分类 ──────────────────────────────────────────── */

function normalizeFileMeta(item) {
  if (!item || typeof item !== 'object') return null;
  const name = str(item.name, 200);
  if (!name) return null;
  const id = typeof item.id === 'string' && /^[\w-]{1,64}$/.test(item.id) ? item.id : uid();
  return {
    id,
    name,
    size: clampInt(item.size, 0, 200 * 1024 * 1024, 0),
    type: str(item.type, 120),
  };
}

function normalizeCategories(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const item of list.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue;
    const name = str(item.name, 30);
    if (!name) continue;
    let id = typeof item.id === 'string' && /^[\w-]{1,64}$/.test(item.id) ? item.id : '';
    if (!id || seen.has(id)) id = uid();
    seen.add(id);
    out.push({ id, name, color: cleanColor(item.color, PALETTE[out.length % PALETTE.length]) });
  }
  return out;
}

function normalizeTasks(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list.slice(0, MAX_TASKS)) {
    if (!item || typeof item !== 'object') continue;
    const title = str(item.title, 120);
    const date = normalizeDateKey(item.date);
    if (!title || !date) continue;

    let id = typeof item.id === 'string' && /^[\w-]{1,64}$/.test(item.id) ? item.id : '';
    if (!id || seen.has(id)) id = uid();
    seen.add(id);

    const files = Array.isArray(item.files)
      ? item.files.map(normalizeFileMeta).filter(Boolean).slice(0, MAX_TASK_FILES)
      : [];
    const now = new Date().toISOString();

    out.push({
      id,
      title,
      date,
      // 旧版「我的事务管理」用 cat 字段，这里一并兼容
      categoryId: str(item.categoryId === undefined ? item.cat : item.categoryId, 64),
      note: str(item.note, 2000),
      priority: clampInt(item.priority, 1, 3, 2),
      done: Boolean(item.done),
      files,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
    });
  }
  return out;
}

function buildTask(input, base) {
  const title = str(input.title, 120);
  if (!title) throw new StoreError('事务标题不能为空');

  const date = normalizeDateKey(input.date === undefined && base ? base.date : input.date);
  if (!date) throw new StoreError('日期格式不对，应为 YYYY-MM-DD');

  let rawCategory = input.categoryId;
  if (rawCategory === undefined) rawCategory = input.cat;
  if (rawCategory === undefined && base) rawCategory = base.categoryId;

  const rawPriority = input.priority === undefined && base ? base.priority : input.priority;
  const now = new Date().toISOString();

  return {
    id: base ? base.id : uid(),
    title,
    date,
    categoryId: str(rawCategory, 64),
    note: input.note === undefined && base ? base.note : str(input.note, 2000),
    priority: clampInt(rawPriority, 1, 3, base ? base.priority : 2),
    done: input.done === undefined && base ? base.done : Boolean(input.done),
    files:
      input.files === undefined && base
        ? (base.files || []).map((file) => ({ ...file }))
        : normalizeTasksFiles(input.files),
    createdAt: base ? base.createdAt : now,
    updatedAt: now,
  };
}

function normalizeTasksFiles(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeFileMeta).filter(Boolean).slice(0, MAX_TASK_FILES);
}

/* ── 课程 / 数据库 ────────────────────────────────────────── */

function buildCourse(input, base) {
  const name = str(input.name, 80);
  if (!name) throw new StoreError('课程名不能为空');

  const url = cleanUrl(input.url);
  if (url === null) throw new StoreError('网址格式不对，请以 http:// 或 https:// 开头');

  const rawStatus = str(input.status, 10);
  const status = STATUSES.includes(rawStatus) ? rawStatus : '进行中';

  let progress = clampInt(input.progress, 0, 100, base ? base.progress : 0);
  if (status === '已完成') progress = 100;
  if (status === '未开始') progress = Math.min(progress, 99);

  const color = cleanColor(input.color, PALETTE[0]);
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
    deadlines:
      input.deadlines === undefined && base ? base.deadlines : normalizeDeadlines(input.deadlines),
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
  const courses = Array.isArray(raw?.courses)
    ? raw.courses.filter((c) => c && typeof c === 'object' && c.id)
    : [];

  // 没有 categories 字段 = 旧版数据，补上默认分类；
  // 显式存成空数组 = 用户把分类都删了，保持为空。
  const categories = Array.isArray(raw?.categories)
    ? normalizeCategories(raw.categories)
    : DEFAULT_CATEGORIES.map((item) => ({ ...item }));

  const tasks = Array.isArray(raw?.tasks) ? normalizeTasks(raw.tasks) : [];
  const categoryIds = new Set(categories.map((c) => c.id));
  for (const task of tasks) {
    if (task.categoryId && !categoryIds.has(task.categoryId)) task.categoryId = '';
  }

  return { version: 2, settings, courses, categories, tasks };
}

function seedDatabase() {
  const stamp = new Date().toISOString();

  return {
    version: 2,
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
    categories: DEFAULT_CATEGORIES.map((item) => ({ ...item })),
    tasks: [],
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

  async function findTask(id) {
    const db = await load();
    const task = db.tasks.find((item) => item.id === id);
    if (!task) throw new StoreError('找不到这条事务', 404);
    return { db, task };
  }

  return {
    file: dbFile,

    async snapshot() {
      return readSnapshot();
    },

    /* ── 课程 ── */

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
            input.requirePassword === undefined
              ? db.settings.requirePassword !== false
              : input.requirePassword !== false,
          links: input.links === undefined ? db.settings.links || [] : normalizeLinks(input.links),
          updateUrl: input.updateUrl === undefined ? db.settings.updateUrl || '' : cleanUrl(input.updateUrl) || '',
        };
        await writeDb(db);
        return structuredClone(db.settings);
      });
    },

    /* ── 事务 ── */

    async createTask(input) {
      return mutate(async () => {
        const db = await load();
        const task = buildTask(input, null);
        if (task.categoryId && !db.categories.some((c) => c.id === task.categoryId)) task.categoryId = '';
        db.tasks.unshift(task);
        await writeDb(db);
        return structuredClone(task);
      });
    },

    async updateTask(id, patch) {
      return mutate(async () => {
        const db = await load();
        const index = db.tasks.findIndex((t) => t.id === id);
        if (index < 0) throw new StoreError('找不到这条事务', 404);
        const merged = buildTask({ ...db.tasks[index], ...patch }, db.tasks[index]);
        if (merged.categoryId && !db.categories.some((c) => c.id === merged.categoryId)) merged.categoryId = '';
        db.tasks[index] = merged;
        await writeDb(db);
        return structuredClone(merged);
      });
    },

    async deleteTask(id) {
      return mutate(async () => {
        const db = await load();
        const index = db.tasks.findIndex((t) => t.id === id);
        if (index < 0) throw new StoreError('找不到这条事务', 404);
        const [task] = db.tasks.splice(index, 1);
        await writeDb(db);
        return structuredClone(task);
      });
    },

    async addTaskFile(id, meta) {
      return mutate(async () => {
        const { db, task } = await findTask(id);
        if (!Array.isArray(task.files)) task.files = [];
        if (task.files.length >= MAX_TASK_FILES) {
          throw new StoreError(`一条事务最多 ${MAX_TASK_FILES} 个附件`);
        }
        const file = normalizeFileMeta(meta);
        if (!file) throw new StoreError('附件信息不完整');
        task.files.push(file);
        task.updatedAt = new Date().toISOString();
        await writeDb(db);
        return { task: structuredClone(task), file: structuredClone(file) };
      });
    },

    async removeTaskFile(taskId, fileId) {
      return mutate(async () => {
        const { db, task } = await findTask(taskId);
        const files = task.files || [];
        const file = files.find((item) => item.id === fileId);
        if (!file) throw new StoreError('找不到这个附件', 404);
        task.files = files.filter((item) => item.id !== fileId);
        task.updatedAt = new Date().toISOString();
        await writeDb(db);
        return { task: structuredClone(task), file: structuredClone(file) };
      });
    },

    async findTaskFile(fileId) {
      const db = await load();
      for (const task of db.tasks) {
        for (const file of task.files || []) {
          if (file.id === fileId) return { task, file };
        }
      }
      return null;
    },

    /* ── 分类 ── */

    async createCategory(input) {
      return mutate(async () => {
        const db = await load();
        const name = str(input.name, 30);
        if (!name) throw new StoreError('分类名不能为空');
        if (db.categories.some((c) => c.name === name)) throw new StoreError('已经有同名分类了');
        const category = {
          id: uid(),
          name,
          color: cleanColor(input.color, PALETTE[db.categories.length % PALETTE.length]),
        };
        db.categories.push(category);
        await writeDb(db);
        return structuredClone(category);
      });
    },

    async updateCategory(id, patch) {
      return mutate(async () => {
        const db = await load();
        const index = db.categories.findIndex((c) => c.id === id);
        if (index < 0) throw new StoreError('找不到这个分类', 404);
        const current = db.categories[index];
        const name = patch.name === undefined ? current.name : str(patch.name, 30);
        if (!name) throw new StoreError('分类名不能为空');
        if (db.categories.some((c) => c.id !== id && c.name === name)) throw new StoreError('已经有同名分类了');
        const color = patch.color === undefined ? current.color : cleanColor(patch.color, current.color);
        db.categories[index] = { id: current.id, name, color };
        await writeDb(db);
        return structuredClone(db.categories[index]);
      });
    },

    async deleteCategory(id) {
      return mutate(async () => {
        const db = await load();
        const before = db.categories.length;
        db.categories = db.categories.filter((c) => c.id !== id);
        if (db.categories.length === before) throw new StoreError('找不到这个分类', 404);
        // 分类删掉，事务本身保留，只是变成「未分类」
        for (const task of db.tasks) {
          if (task.categoryId === id) task.categoryId = '';
        }
        await writeDb(db);
        return true;
      });
    },

    /**
     * 导入事务数据：兼容旧版「我的事务管理」的 { categories, tasks } 结构。
     * 分类按 id / 名称匹配，事务按「标题 + 日期」去重后追加。
     * 附件已由 server.js 解码成 data/files 里的真实文件，这里只收元信息。
     */
    async importAffairs(payload) {
      return mutate(async () => {
        const db = await load();
        const incomingCategories = normalizeCategories(payload?.categories) || [];
        const categoryMap = new Map();
        let categoriesAdded = 0;

        for (const category of incomingCategories) {
          let target =
            db.categories.find((c) => c.id === category.id) ||
            db.categories.find((c) => c.name === category.name);
          if (!target) {
            const id = db.categories.some((c) => c.id === category.id) ? uid() : category.id;
            target = { id, name: category.name, color: category.color };
            db.categories.push(target);
            categoriesAdded += 1;
          }
          categoryMap.set(category.id, target.id);
        }

        const incomingTasks = normalizeTasks(payload?.tasks);
        const seen = new Set(db.tasks.map((t) => `${t.title}|${t.date}`));
        let added = 0;
        let skipped = 0;

        for (const item of incomingTasks) {
          const key = `${item.title}|${item.date}`;
          if (seen.has(key)) {
            skipped += 1;
            continue;
          }
          seen.add(key);
          const task = buildTask(
            { ...item, categoryId: categoryMap.get(item.categoryId) || item.categoryId },
            null,
          );
          if (task.categoryId && !db.categories.some((c) => c.id === task.categoryId)) task.categoryId = '';
          db.tasks.push(task);
          added += 1;
        }

        if (added || categoriesAdded) await writeDb(db);
        return { added, skipped, categories: categoriesAdded, total: db.tasks.length };
      });
    },

    /**
     * 用备份文件整体替换数据。课程、事务、分类都会一起恢复；
     * 密码开关保持当前值，避免导入别人的备份把密码关掉。
     */
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

        const categories = Array.isArray(payload.categories)
          ? normalizeCategories(payload.categories)
          : db.categories;

        // 老备份里没有事务字段：保留现有事务，避免导入旧备份把它们清空
        const tasks = Array.isArray(payload.tasks) ? normalizeTasks(payload.tasks) : db.tasks;
        const categoryIds = new Set(categories.map((c) => c.id));
        for (const task of tasks) {
          if (task.categoryId && !categoryIds.has(task.categoryId)) task.categoryId = '';
        }

        const settings = payload.settings
          ? {
              title: str(payload.settings.title, 40) || DEFAULT_SETTINGS.title,
              subtitle: str(payload.settings.subtitle, 120),
              semester: str(payload.settings.semester, 40),
              // 密码开关永远沿用当前设置，不从备份里恢复
              requirePassword: db.settings.requirePassword !== false,
              links:
                payload.settings.links === undefined
                  ? db.settings.links || []
                  : normalizeLinks(payload.settings.links),
              // 更新检查地址属于本机配置，导入备份时不跟着换
              updateUrl: db.settings.updateUrl || '',
            }
          : db.settings;

        const next = { version: 2, settings, courses, categories, tasks };
        await writeDb(next);
        return { count: courses.length, tasks: tasks.length };
      });
    },
  };
}

module.exports = {
  createStore,
  buildCourse,
  buildTask,
  normalizeDb,
  seedDatabase,
  StoreError,
  STATUSES,
  PALETTE,
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  MAX_TASK_FILES,
};
