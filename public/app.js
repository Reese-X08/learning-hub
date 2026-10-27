'use strict';

/* ─────────────────────────────────────────────────────────────
   学习中心 · 前端
   ───────────────────────────────────────────────────────────── */

// 脚本能跑起来，就先撤掉纯 HTML 的「加载中」兜底
document.getElementById('boot-fallback')?.remove();

// 任何没接住的错误都尽量显示出来，而不是留一个白屏
window.addEventListener('error', (event) => {
  if (event.error) showBootError(event.error);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason instanceof AuthError || reason?.name === 'AuthError') return;
  showBootError(reason instanceof Error ? reason : new Error(String(reason)));
});

const $ = (selector, root = document) => root.querySelector(selector);

const PALETTE = ['#4f63ff', '#12b3a8', '#8b5cf6', '#f59e0b', '#0ea5e9', '#f43f5e', '#22c55e', '#ec4899'];
const STATUSES = ['未开始', '进行中', '已完成', '暂停'];
const THEMES = [
  { value: 'auto', icon: '◐', label: '跟随系统' },
  { value: 'light', icon: '☀', label: '浅色' },
  { value: 'dark', icon: '☾', label: '深色' },
];
const DAY = 86400000;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const PRIORITY_LABELS = ['低', '中', '高'];
const AVAILABLE_VIEWS = ['courses', 'tasks', 'affairs'];
// 固定的下载 / 更新入口：地址不变，发版只换内容，用户不用再问
const RELEASES_URL = 'https://github.com/Reese-X08/learning-hub/releases/latest';
// 没填「更新检查地址」时默认也检查一次，老用户不用做任何设置
const DEFAULT_UPDATE_URL = 'https://raw.githubusercontent.com/Reese-X08/learning-hub/main/version.json';

const state = {
  settings: { title: '学习中心', subtitle: '', semester: '' },
  courses: [],
  categories: [],
  tasks: [],
  filter: { q: '', status: 'all', platform: 'all', sort: 'updated' },
  view: 'courses',
  taskFilter: 'open',
  affair: {
    view: 'calendar',
    scope: 'all',
    category: 'all',
    month: new Date(),
  },
  version: '',
  needsRestart: false,
  restartNoticeShown: false,
};

class AuthError extends Error {
  constructor() {
    super('登录状态已失效');
    this.name = 'AuthError';
  }
}

// 书签小工具带过来的数据，等界面就绪后再弹窗
let pendingCollect = null;

/* ── DOM 小工具 ───────────────────────────────────────────── */

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(node, children);
  return node;
}

/* ── 网络 ─────────────────────────────────────────────────── */

async function api(path, { skipAuthRedirect = false, ...options } = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });

  if (response.status === 401 && !skipAuthRedirect) {
    showLogin();
    throw new AuthError();
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
  return payload;
}

/* ── 时间 ─────────────────────────────────────────────────── */

function daysUntil(iso) {
  if (!iso) return null;
  const target = new Date(iso);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / DAY);
}

function fmtDue(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / DAY);
  if (Number.isNaN(days)) return '';
  if (days <= 0) return '今天更新';
  if (days === 1) return '昨天更新';
  if (days < 30) return `${days} 天前更新`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

function dueBadge(due) {
  const days = daysUntil(due);
  let kind = 'ok';
  let label = '';
  if (days < 0) {
    kind = 'overdue';
    label = `已逾期 ${-days} 天`;
  } else if (days === 0) {
    kind = 'urgent';
    label = '今天截止';
  } else if (days === 1) {
    kind = 'urgent';
    label = '明天截止';
  } else if (days <= 3) {
    kind = 'soon';
    label = `剩 ${days} 天`;
  } else {
    label = `剩 ${days} 天`;
  }
  return el('span', { class: `due-chip ${kind}` }, label);
}

/* ── 数据派生 ─────────────────────────────────────────────── */

function nextDeadline(course) {
  const list = (course.deadlines || []).filter((d) => d.due && !d.done);
  list.sort((a, b) => new Date(a.due) - new Date(b.due));
  return list[0] || null;
}

function allDeadlines() {
  const out = [];
  for (const course of state.courses) {
    for (const deadline of course.deadlines || []) {
      if (!deadline.due) continue;
      out.push({ ...deadline, course });
    }
  }
  out.sort((a, b) => new Date(a.due) - new Date(b.due));
  return out;
}

function platformIndex() {
  const map = new Map();
  for (const course of state.courses) {
    const name = course.platform || '未归类';
    const record = map.get(name) || { name, count: 0, url: '', color: course.color };
    record.count += 1;
    if (!record.url && course.url) record.url = course.url;
    map.set(name, record);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
}

function uniqueValues(key) {
  const set = new Set();
  for (const course of state.courses) {
    const value = (course[key] || '').trim();
    if (value) set.add(value);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}

function visibleCourses() {
  const { q, status, platform, sort } = state.filter;
  const needle = q.trim().toLowerCase();

  const list = state.courses.filter((course) => {
    if (status !== 'all' && course.status !== status) return false;
    if (platform !== 'all' && (course.platform || '未归类') !== platform) return false;
    if (!needle) return true;
    const haystack = [course.name, course.platform, course.category, course.notes].join(' ').toLowerCase();
    return haystack.includes(needle);
  });

  if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  else if (sort === 'progress') list.sort((a, b) => b.progress - a.progress);
  else if (sort === 'deadline') {
    list.sort((a, b) => {
      const da = nextDeadline(a);
      const db = nextDeadline(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return new Date(da.due) - new Date(db.due);
    });
  } else {
    list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  return list;
}

/* ── 渲染 ─────────────────────────────────────────────────── */

function render() {
  renderHeader();
  renderStats();
  renderPlatforms();
  renderView();
  renderTaskFilters();
  renderFilters();
  renderGrid();
  renderTaskView();
  renderDue();
  renderAffairs();

  // 没开密码时，"退出登录"没有意义
  const logoutButton = document.querySelector('[data-action="logout"]');
  if (logoutButton) logoutButton.hidden = state.settings.requirePassword === false;
}

function renderView() {
  const isTasks = state.view === 'tasks';
  const isAffairs = state.view === 'affairs';
  $('#course-view').hidden = isTasks || isAffairs;
  $('#task-view').hidden = !isTasks;
  const affairsView = $('#affairs-view');
  if (affairsView) affairsView.hidden = !isAffairs;

  for (const button of document.querySelectorAll('#view-switch .seg')) {
    const active = button.dataset.view === state.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }

  const search = $('#search');
  if (search) {
    search.placeholder = isAffairs ? '搜索事务 / 备注' : '搜索课程 / 平台 / 备注';
  }
}

// 视图切换统一入口：顺便把 ?view=affairs 写进地址栏，
// 这样任务栏快捷方式、书签、PWA 快捷方式都能直接落到事务中心。
function setView(view) {
  state.view = AVAILABLE_VIEWS.includes(view) ? view : 'courses';
  renderView();
  if (state.view === 'tasks') renderTaskView();
  else if (state.view === 'affairs') {
    renderAffairs();
    if (state.needsRestart) showRestartNotice();
  } else {
    renderGrid();
  }

  try {
    const url = new URL(location.href);
    if (state.view === 'courses') url.searchParams.delete('view');
    else url.searchParams.set('view', state.view);
    history.replaceState(null, '', `${url.pathname}${url.search}`);
  } catch {
    /* file:// / 旧浏览器不支持也无所谓 */
  }
}

function applyViewFromUrl() {
  try {
    const view = new URLSearchParams(location.search).get('view');
    if (view && AVAILABLE_VIEWS.includes(view)) state.view = view;
  } catch {
    /* ignore */
  }
}

function renderHeader() {
  const { title, subtitle, semester } = state.settings;
  document.title = title || '学习中心';
  $('#site-title').textContent = title || '学习中心';
  $('#site-subtitle').textContent = [semester, subtitle].filter(Boolean).join(' · ') || '把所有课程收进一个页面';
}

function renderStats() {
  const total = state.courses.length;
  const active = state.courses.filter((c) => c.status === '进行中').length;
  const avg = total ? Math.round(state.courses.reduce((sum, c) => sum + (c.progress || 0), 0) / total) : 0;
  const soon = allDeadlines().filter((d) => {
    if (d.done) return false;
    const days = daysUntil(d.due);
    return days !== null && days >= 0 && days <= 7;
  }).length;

  const box = $('#stats');
  box.replaceChildren(
    statTile(String(total), '门课程'),
    statTile(String(active), '门进行中'),
    statTile(`${avg}%`, '平均进度'),
    statTile(String(soon), '项 7 天内截止'),
  );
}

function statTile(value, label) {
  return el('div', { class: 'stat' }, el('div', { class: 'stat-value' }, value), el('div', { class: 'stat-label' }, label));
}

function renderPlatforms() {
  const box = $('#platforms');
  const platforms = platformIndex();
  const links = Array.isArray(state.settings.links) ? state.settings.links : [];

  const children = [];

  if (platforms.length) {
    children.push(el('span', { class: 'platforms-label muted tiny' }, '平台入口'));
    children.push(
      ...platforms.map((platform) =>
        el(
          'button',
          {
            type: 'button',
            class: 'platform-chip',
            title: platform.url ? `打开 ${platform.name}` : `筛选 ${platform.name} 的课程`,
            onclick: () => {
              if (!platform.url) {
                setFilter({ platform: platform.name });
                return;
              }
              window.open(platform.url, '_blank', 'noopener');            },
          },
          el('span', { class: 'count' }, String(platform.count)),
          platform.name,
          platform.url ? el('span', { class: 'arrow' }, '↗') : null,
        ),
      ),
    );
  }

  if (links.length) {
    children.push(el('span', { class: 'platforms-label muted tiny' }, '网址'));
    children.push(...links.map(customLinkEl));
  }

  children.push(
    el(
      'button',
      { type: 'button', class: 'platform-chip add-link', title: '添加一个自定义网址', onclick: () => openLinkModal() },
      '＋ 自定义网址',
    ),
  );

  box.replaceChildren(...children);
}

function customLinkEl(link) {
  return el(
    'span',
    { class: 'platform-chip custom-link' },
    el(
      'button',
      {
        type: 'button',
        class: 'custom-link-open',
        title: link.url,
        onclick: () => window.open(link.url, '_blank', 'noopener'),
      },
      link.title,
      el('span', { class: 'arrow' }, '↗'),
    ),
    el(
      'button',
      {
        type: 'button',
        class: 'custom-link-remove',
        title: '删除这个网址',
        'aria-label': `删除 ${link.title}`,
        onclick: (event) => {
          event.stopPropagation();
          removeLink(link);
        },
      },
      '×',
    ),
  );
}

async function saveLinks(links) {
  const result = await api('/api/settings', {
    method: 'POST',
    body: JSON.stringify({ links }),
  });
  state.settings = { ...state.settings, ...result.settings };
  render();
}

async function removeLink(link) {
  const links = (state.settings.links || []).filter((item) => item.id !== link.id);
  try {
    await saveLinks(links);
    toast(`已删除「${link.title}」`);
  } catch (error) {
    if (error instanceof AuthError) return;
    toast(error.message, 'error');
  }
}

function openLinkModal() {
  const titleInput = el('input', { type: 'text', maxlength: '40', placeholder: '例如：教务系统' });
  const urlInput = el('input', { type: 'text', maxlength: '600', placeholder: 'https://…' });

  const saveButton = el('button', { type: 'submit', class: 'btn primary' }, '添加');

  const form = openModal({
    title: '添加自定义网址',
    body: [
      el('p', { class: 'muted tiny' }, '会显示在顶部「网址」那一排，和课程分开。点一下直接打开。'),
      el('label', { class: 'field' }, el('span', {}, '名称 *'), titleInput),
      el('label', { class: 'field' }, el('span', {}, '网址 *'), urlInput),
    ],
    footer: [el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消'), saveButton],
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    const url = urlInput.value.trim();

    if (!title) {
      showModalError('名称不能为空');
      titleInput.focus();
      return;
    }
    if (!url) {
      showModalError('网址不能为空');
      urlInput.focus();
      return;
    }

    saveButton.disabled = true;
    try {
      const links = [...(state.settings.links || []), { title, url }];
      await saveLinks(links);
      closeModal();
      toast(`已添加「${title}」`);
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
      saveButton.disabled = false;
    }
  });
}

function renderFilters() {
  const box = $('#status-filter');
  const options = [{ value: 'all', label: '全部' }, ...STATUSES.map((s) => ({ value: s, label: s }))];
  box.replaceChildren(
    ...options.map((option) => {
      const count =
        option.value === 'all' ? state.courses.length : state.courses.filter((c) => c.status === option.value).length;
      return el(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: `seg${state.filter.status === option.value ? ' active' : ''}`,
          'aria-selected': String(state.filter.status === option.value),
          onclick: () => setFilter({ status: option.value }),
        },
        option.label,
        el('span', { class: 'seg-count' }, String(count)),
      );
    }),
  );

  const platformSelect = $('#platform-filter');
  const platforms = platformIndex();
  if (state.filter.platform !== 'all' && !platforms.some((p) => p.name === state.filter.platform)) {
    state.filter.platform = 'all';
  }
  platformSelect.replaceChildren(
    el('option', { value: 'all' }, '全部平台'),
    ...platforms.map((p) => el('option', { value: p.name }, `${p.name}（${p.count}）`)),
  );
  platformSelect.value = state.filter.platform;
  $('#sort-select').value = state.filter.sort;
}

function renderGrid() {
  const list = visibleCourses();
  const grid = $('#course-grid');
  grid.replaceChildren(...list.map(courseCard));

  const empty = $('#empty-state');
  empty.hidden = list.length > 0;
  if (list.length === 0) {
    const filtered = state.courses.length > 0;
    $('.empty-title', empty).textContent = filtered ? '没有符合条件的课程' : '这里还没有课程';
    $('.empty .muted', empty).textContent = filtered
      ? '换个关键词，或者把筛选项调回「全部」。'
      : '把第一门课加进来，之后所有入口都在一个页面里。';
    $('[data-action="add"]', empty).hidden = filtered;
  }
}

function courseCard(course) {
  const accent = course.color || PALETTE[0];
  const deadline = nextDeadline(course);

  const card = el('article', { class: 'card', 'data-id': course.id, tabindex: '0' });
  card.style.setProperty('--accent', accent);
  card.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) return;
    openEditor(course);
  });
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target === card) openEditor(course);
  });

  const progressBar = el('i', {});
  progressBar.style.width = `${course.progress}%`;

  card.append(
    el(
      'div',
      { class: 'card-head' },
      el('span', { class: 'chip platform', title: course.platform || '未归类' }, course.platform || '未归类'),
      el('span', { class: 'chip status', 'data-status': course.status }, course.status),
    ),
    el('h3', { class: 'card-title', title: course.name }, course.name),
    el(
      'p',
      { class: 'card-sub muted' },
      [course.category, relTime(course.updatedAt)].filter(Boolean).join(' · ') || '—',
    ),
    el('div', { class: 'progress-row' }, el('div', { class: 'progress' }, progressBar), el('span', { class: 'progress-num' }, `${course.progress}%`)),
    el(
      'div',
      { class: 'card-foot' },
      deadline ? dueBadge(deadline.due) : el('span', { class: 'muted tiny' }, '暂无截止事项'),
      el(
        'div',
        { class: 'card-btns' },
        course.url
          ? el('a', { class: 'btn ghost small', href: course.url, target: '_blank', rel: 'noopener noreferrer' }, '打开')
          : el('button', { class: 'btn ghost small', type: 'button', disabled: true, title: '还没填写网址' }, '打开'),
        el('button', { class: 'icon-btn small', type: 'button', title: '编辑', 'aria-label': '编辑', onclick: () => openEditor(course) }, '✎'),
        el('button', { class: 'icon-btn small danger', type: 'button', title: '删除', 'aria-label': '删除', onclick: () => confirmDelete(course) }, '✕'),
      ),
    ),
  );

  return card;
}

function renderDue() {
  const list = $('#due-list');
  const items = allDeadlines().filter((d) => !d.done).slice(0, 9);

  list.replaceChildren(
    ...items.map((deadline) => {
      const target = deadline.url || deadline.course.url || '';
      const item = el(
        'li',
        {
          class: 'due-item',
          'data-course': deadline.course.id,
          title: target ? `打开 ${target}` : '这条任务还没绑定网址',
          onclick: () => openTaskTarget(deadline),
        },
        el('span', { class: 'due-dot' }),
        el(
          'div',
          { class: 'due-main' },
          el('div', { class: 'due-title', title: deadline.title }, deadline.title),
          el(
            'div',
            { class: 'due-meta' },
            `${deadline.course.name} · ${fmtDue(deadline.due)}`,
            deadline.url ? el('span', { class: 'due-link-mark', title: '已绑定自己的网址' }, ' ↗') : null,
          ),
        ),
        el('span', { class: 'due-when' }, dueBadge(deadline.due)),
      );
      item.style.setProperty('--accent', deadline.course.color || PALETTE[0]);
      return item;
    }),
  );

  $('#due-count').textContent = items.length ? `${items.length} 项` : '';
  $('#due-empty').hidden = items.length > 0;
}

// 任务绑了网址就开那个页面，否则退回课程主页
function openTaskTarget(deadline) {
  const target = deadline.url || deadline.course?.url;
  if (!target) {
    toast('这条任务还没绑定网址', 'error');
    return;
  }
  window.open(target, '_blank', 'noopener');
}

/* ── 任务视图（按课程分组，按截止时间排序）───────────────── */

function dueValue(deadline) {
  if (!deadline.due) return Number.POSITIVE_INFINITY;
  const time = new Date(deadline.due).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function taskGroups() {
  const onlyOpen = state.taskFilter === 'open';
  const groups = [];

  for (const course of state.courses) {
    const all = course.deadlines || [];
    const tasks = (onlyOpen ? all.filter((d) => !d.done) : all).slice();
    if (!tasks.length) continue;

    // 离截止越近排越前，没有日期的排最后
    tasks.sort((a, b) => dueValue(a) - dueValue(b));

    const next = tasks.find((d) => !d.done && d.due);
    groups.push({
      course,
      tasks,
      next: next ? dueValue(next) : Number.POSITIVE_INFINITY,
      openCount: all.filter((d) => !d.done).length,
    });
  }

  groups.sort((a, b) => a.next - b.next);
  return groups;
}

function renderTaskFilters() {
  const all = state.courses.reduce((n, c) => n + (c.deadlines || []).length, 0);
  const open = state.courses.reduce((n, c) => n + (c.deadlines || []).filter((d) => !d.done).length, 0);

  const options = [
    { value: 'open', label: '未完成', count: open },
    { value: 'all', label: '全部', count: all },
  ];

  $('#task-filter').replaceChildren(
    ...options.map((option) =>
      el(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: `seg${state.taskFilter === option.value ? ' active' : ''}`,
          'aria-selected': String(state.taskFilter === option.value),
          onclick: () => {
            state.taskFilter = option.value;
            renderTaskFilters();
            renderTaskView();
          },
        },
        option.label,
        el('span', { class: 'seg-count' }, String(option.count)),
      ),
    ),
  );
}

function renderTaskView() {
  const groups = taskGroups();
  const box = $('#task-groups');

  box.replaceChildren(...groups.map(taskGroupEl));

  const open = state.courses.reduce((n, c) => n + (c.deadlines || []).filter((d) => !d.done).length, 0);
  $('#task-summary').textContent = open ? `${open} 项未完成` : '全部完成';
  $('#task-empty').hidden = groups.length > 0;
}

function taskGroupEl(group) {
  const { course, tasks, openCount } = group;

  const header = el(
    'div',
    { class: 'task-group-head' },
    el('span', { class: 'task-group-dot' }),
    el('strong', { class: 'task-group-name' }, course.name),
    el('span', { class: 'muted tiny' }, openCount ? `${openCount} 项未完成` : '已完成'),
    el(
      'button',
      {
        type: 'button',
        class: 'link-btn task-group-open',
        onclick: () => {
          if (course.url) window.open(course.url, '_blank', 'noopener');
          else toast('这门课还没填网址', 'error');
        },
      },
      '打开课程 ↗',
    ),
  );
  header.style.setProperty('--accent', course.color || PALETTE[0]);

  return el('section', { class: 'task-group' }, header, el('div', { class: 'task-rows' }, ...tasks.map((task) => taskRowEl(course, task))));
}

function taskRowEl(course, deadline) {
  const done = Boolean(deadline.done);

  const checkbox = el('input', {
    type: 'checkbox',
    checked: done,
    'aria-label': '标记完成',
    onchange: (event) => toggleTaskDone(course, deadline, event.target.checked),
  });

  const row = el(
    'div',
    { class: `task-row${done ? ' done' : ''}`, title: deadline.url ? `打开 ${deadline.url}` : '' },
    el('label', { class: 'task-check' }, checkbox),
    el(
      'div',
      { class: 'task-main' },
      el('div', { class: 'task-title' }, deadline.title),
      deadline.url ? el('div', { class: 'task-sub muted tiny' }, hostOf(deadline.url)) : null,
    ),
    el('span', { class: 'task-due' }, deadline.due ? dueBadge(deadline.due) : el('span', { class: 'muted tiny' }, '无日期')),
    el(
      'button',
      {
        type: 'button',
        class: 'icon-btn small',
        'aria-label': '打开绑定网址',
        onclick: (event) => {
          event.stopPropagation();
          openTaskTarget(deadline);
        },
      },
      '↗',
    ),
    el(
      'button',
      {
        type: 'button',
        class: 'icon-btn small task-edit',
        title: '编辑这条任务',
        'aria-label': '编辑任务',
        onclick: (event) => {
          event.stopPropagation();
          openTaskEditor(course, deadline);
        },
      },
      '✎',
    ),
    el(
      'button',
      {
        type: 'button',
        class: 'icon-btn small danger task-delete',
        title: '删除这条任务',
        'aria-label': '删除任务',
        onclick: (event) => {
          event.stopPropagation();
          confirmDeleteTask(course, deadline);
        },
      },
      '✕',
    ),
  );

  row.addEventListener('click', (event) => {
    if (event.target.closest('input, button, label')) return;
    openTaskTarget(deadline);
  });

  return row;
}

function confirmDeleteTask(course, deadline) {
  const form = openModal({
    title: '删除任务',
    body: [
      el('p', {}, `确定删除「${deadline.title}」吗？`),
      el('p', { class: 'muted tiny' }, '删除后无法恢复；课程本身不受影响。'),
    ],
    footer: [
      el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消'),
      el('button', { type: 'submit', class: 'btn danger' }, '删除'),
    ],
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const deadlines = (course.deadlines || []).filter((item) => item.id !== deadline.id);
      await api(`/api/courses/${course.id}`, { method: 'PATCH', body: JSON.stringify({ deadlines }) });
      closeModal();
      await refresh();
      toast('任务已删除');
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
      if (button) button.disabled = false;
    }
  });
}

async function toggleTaskDone(course, deadline, done) {  const deadlines = (course.deadlines || []).map((item) => (item.id === deadline.id ? { ...item, done } : item));
  try {
    await api(`/api/courses/${course.id}`, { method: 'PATCH', body: JSON.stringify({ deadlines }) });
    await refresh();
  } catch (error) {
    if (error instanceof AuthError) return;
    toast(error.message, 'error');
    await refresh();
  }
}

function focusCourse(id) {
  const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 1300);
}

/* ── 视图切换 ─────────────────────────────────────────────── */

function showLogin() {
  closeModal();
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  $('#login-password').value = '';
  $('#login-error').hidden = true;
  setTimeout(() => $('#login-password').focus(), 60);
}

function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
}

async function enterApp() {
  const data = await api('/api/data');
  applyData(data);
  applyViewFromUrl();
  showApp();
  render();

  // 由书签小工具带过来的数据，进到界面后弹确认框
  if (pendingCollect) {
    const payload = pendingCollect;
    pendingCollect = null;
    history.replaceState(null, '', location.pathname);
    openCollectModal(payload);
  }

  checkUpdate();
}

/* ── 新版本检查 ───────────────────────────────────────────── */

function compareVersion(a, b) {
  const parse = (value) =>
    String(value || '')
      .split(/[.\-+]/)
      .map((part) => Number.parseInt(part, 10))
      .filter((n) => Number.isFinite(n));
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const x = left[i] || 0;
    const y = right[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function checkUpdate() {
  const url = state.settings.updateUrl || DEFAULT_UPDATE_URL;
  if (!url) return;

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return;
    const info = await response.json();
    const latest = String(info.version || '').trim();
    if (!latest || compareVersion(latest, state.version || '0.0.0') <= 0) return;
    if (sessionStorage.getItem('learning-hub-skip-update') === latest) return;

    $('#update-text').textContent = `有新版本 ${latest}${info.notes ? `：${String(info.notes).slice(0, 80)}` : ''}`;
    const link = $('#update-link');
    link.href = String(info.url || ctxDownloadUrl(url));
    $('#update-bar').hidden = false;
  } catch {
    /* 没网或地址不对就不提示 */
  }
}

function ctxDownloadUrl(configUrl) {
  try {
    return new URL('.', configUrl).href;
  } catch {
    return configUrl;
  }
}

// 更新入口内置在平台里：地址固定，用户不用再去问「网站是多少」
function openUpdatePage() {
  const link = el(
    'a',
    { class: 'btn primary', href: RELEASES_URL, target: '_blank', rel: 'noopener noreferrer' },
    '打开发布页',
  );

  const form = openModal({
    title: '获取更新',
    body: [
      el('p', {}, `当前版本：${state.version || '—'}`),
      el(
        'p',
        { class: 'muted tiny' },
        '发布页地址是固定的，每次发版只换里面的文件，不会换网址。以后要更新，从这里进就行，不用再找别人要网站。',
      ),
      el(
        'p',
        { class: 'muted tiny' },
        el('a', { href: RELEASES_URL, target: '_blank', rel: 'noopener noreferrer', class: 'update-url' }, RELEASES_URL),
      ),
    ],
    footer: [el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '关闭'), link],
  });

  form.addEventListener('submit', (event) => event.preventDefault());
}

let lastRefreshAt = 0;

function applyData(data) {
  state.settings = { ...state.settings, ...(data.settings || {}) };
  state.courses = data.courses || [];
  state.categories = data.categories || [];
  state.tasks = data.tasks || [];
  // 页面文件更新了、但后台还是旧进程时，事务接口还不存在
  state.needsRestart = !Array.isArray(data.categories) || !Array.isArray(data.tasks);
  // 选中的分类被删掉时回到「全部」
  if (state.affair.category !== 'all' && !state.categories.some((c) => c.id === state.affair.category)) {
    state.affair.category = 'all';
  }
}

async function refresh() {
  const data = await api('/api/data');
  applyData(data);
  lastRefreshAt = Date.now();
  render();
}

// 手动刷新：扩展收集完回来点一下
async function refreshNow() {
  const button = $('#refresh-btn');
  if (button) {
    button.disabled = true;
    button.classList.add('spinning');
  }
  try {
    await refresh();
    toast('已刷新');
  } catch (error) {
    if (!(error instanceof AuthError)) toast(error.message || '刷新失败', 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('spinning');
    }
  }
}

/* ── 筛选 ─────────────────────────────────────────────────── */

function setFilter(patch) {
  Object.assign(state.filter, patch);
  renderFilters();
  renderGrid();
  // 顶部搜索框在「事务」视图里也用来筛事务
  if (state.view === 'affairs') renderAffairs();
}

/* ── 弹窗 ─────────────────────────────────────────────────── */

let modalEl = null;

function closeModal() {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  document.body.classList.remove('modal-open');
}

function openModal({ title, body, footer }) {
  closeModal();

  const overlay = el('div', { class: 'modal-overlay' });
  const form = el('form', {
    class: 'modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title,
    novalidate: true,
  });

  const closeButton = el(
    'button',
    { class: 'icon-btn small', type: 'button', 'aria-label': '关闭', onclick: closeModal },
    '✕',
  );

  append(form, [
    el('header', { class: 'modal-head' }, el('h2', {}, title), closeButton),
    el('div', { class: 'modal-body' }, body),
    footer ? el('footer', { class: 'modal-foot' }, footer) : null,
  ]);

  overlay.append(form);
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) closeModal();
  });

  document.body.append(overlay);
  document.body.classList.add('modal-open');
  modalEl = overlay;

  setTimeout(() => {
    const target = form.querySelector('input:not([type="hidden"]):not([type="checkbox"]), textarea, select');
    (target || closeButton).focus();
  }, 40);

  return form;
}

function showModalError(message) {
  if (!modalEl) return;
  let box = $('.modal .error', modalEl);
  if (!box) {
    box = el('p', { class: 'error', role: 'alert' });
    $('.modal-body', modalEl).prepend(box);
  }
  box.textContent = message;
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest' });
}

function clearModalError() {
  const box = modalEl && $('.modal .error', modalEl);
  if (box) box.hidden = true;
}

/* ── 课程编辑 ─────────────────────────────────────────────── */

function openEditor(course) {
  const isNew = !course;
  const draft = course
    ? JSON.parse(JSON.stringify(course))
    : {
        name: '',
        platform: '',
        url: '',
        category: '',
        status: '进行中',
        progress: 0,
        color: PALETTE[state.courses.length % PALETTE.length],
        notes: '',
        deadlines: [],
      };

  let color = draft.color || PALETTE[0];

  const nameInput = el('input', { type: 'text', maxlength: '80', value: draft.name, placeholder: '例如：高等数学 A' });
  const platformInput = el('input', {
    type: 'text',
    maxlength: '40',
    value: draft.platform,
    placeholder: '雨课堂 / 小雅 / 中国大学MOOC…',
    list: 'platform-options',
  });
  const urlInput = el('input', { type: 'text', value: draft.url, placeholder: 'https://…' });
  const categoryInput = el('input', {
    type: 'text',
    maxlength: '30',
    value: draft.category,
    placeholder: '必修 / 选修 / 自学…',
    list: 'category-options',
  });
  const statusSelect = el('select', {}, ...STATUSES.map((s) => el('option', { value: s }, s)));
  statusSelect.value = draft.status;

  const progressInput = el('input', { type: 'range', min: '0', max: '100', step: '1', value: String(draft.progress || 0) });
  const progressValue = el('span', { class: 'range-value' }, `${draft.progress || 0}%`);

  const notesInput = el('textarea', { rows: '3', maxlength: '2000', placeholder: '课程要求、上课方式、考试的坑…' });
  notesInput.value = draft.notes || '';

  const swatcher = el(
    'div',
    { class: 'swatches', role: 'group', 'aria-label': '课程颜色' },
    ...PALETTE.map((value) =>
      el('button', {
        type: 'button',
        class: 'swatch',
        'aria-label': `选择颜色 ${value}`,
        'aria-pressed': String(value === color),
        onclick: (event) => {
          color = value;
          for (const btn of swatcher.querySelectorAll('.swatch')) {
            btn.setAttribute('aria-pressed', String(btn === event.currentTarget));
          }
        },
      }),
    ),
  );
  for (const swatch of swatcher.querySelectorAll('.swatch')) {
    swatch.style.setProperty('--swatch', PALETTE[[...swatcher.children].indexOf(swatch)]);
  }

  progressInput.addEventListener('input', () => {
    progressValue.textContent = `${progressInput.value}%`;
  });
  statusSelect.addEventListener('change', () => {
    if (statusSelect.value === '已完成') {
      progressInput.value = '100';
      progressValue.textContent = '100%';
    }
  });

  const deadlineList = el('div', { class: 'deadline-list' });
  const addDeadlineRow = (deadline) => deadlineList.append(deadlineRow(deadline));
  (draft.deadlines || []).forEach(addDeadlineRow);

  const datalists = el(
    'div',
    {},
    el(
      'datalist',
      { id: 'platform-options' },
      ...uniqueValues('platform').map((value) => el('option', { value })),
    ),
    el(
      'datalist',
      { id: 'category-options' },
      ...uniqueValues('category').map((value) => el('option', { value })),
    ),
  );

  const body = [
    el('label', { class: 'field' }, el('span', {}, '课程名 *'), nameInput),
    el(
      'div',
      { class: 'row-2' },
      el('label', { class: 'field' }, el('span', {}, '平台'), platformInput),
      el('label', { class: 'field' }, el('span', {}, '分类'), categoryInput),
    ),
    el('label', { class: 'field' }, el('span', {}, '网址'), urlInput, el('small', { class: 'field-hint' }, '点卡片上的「打开」会跳到这里；留空也可以，只当记录用。')),
    el(
      'div',
      { class: 'row-2' },
      el('label', { class: 'field' }, el('span', {}, '状态'), statusSelect),
      el(
        'div',
        { class: 'field' },
        el('span', {}, '进度'),
        el('div', { class: 'range-row' }, progressInput, progressValue),
      ),
    ),
    el('div', { class: 'field' }, el('span', {}, '颜色'), swatcher),
    el('label', { class: 'field' }, el('span', {}, '备注'), notesInput),
    el(
      'div',
      { class: 'field' },
      el('span', {}, '截止事项'),
      deadlineList,
      el('button', { type: 'button', class: 'link-btn', onclick: () => addDeadlineRow({}) }, '＋ 添加一条'),
    ),
    datalists,
  ];

  const cancelButton = el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消');
  const saveButton = el('button', { type: 'submit', class: 'btn primary' }, isNew ? '添加课程' : '保存');

  const form = openModal({ title: isNew ? '添加课程' : '编辑课程', body, footer: [cancelButton, saveButton] });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearModalError();

    const payload = {
      name: nameInput.value.trim(),
      platform: platformInput.value.trim(),
      url: urlInput.value.trim(),
      category: categoryInput.value.trim(),
      status: statusSelect.value,
      progress: Number(progressInput.value),
      color,
      notes: notesInput.value,
      deadlines: collectDeadlines(deadlineList),
    };

    if (!payload.name) {
      showModalError('课程名不能为空');
      nameInput.focus();
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = '保存中…';

    try {
      if (isNew) await api('/api/courses', { method: 'POST', body: JSON.stringify(payload) });
      else await api(`/api/courses/${course.id}`, { method: 'PATCH', body: JSON.stringify(payload) });

      closeModal();
      await refresh();
      toast(isNew ? '课程已添加' : '已保存');
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = isNew ? '添加课程' : '保存';
    }
  });
}

function deadlineRow(deadline = {}) {
  const titleInput = el('input', { type: 'text', maxlength: '80', value: deadline.title || '', placeholder: '作业 / 测验 / 考试' });
  const dueInput = el('input', { type: 'datetime-local', value: toLocalInput(deadline.due) });
  const doneInput = el('input', { type: 'checkbox', checked: Boolean(deadline.done) });

  const item = el('div', { class: 'deadline-item' });
  const row = el('div', { class: 'deadline-row' });
  const remove = el(
    'button',
    { type: 'button', class: 'icon-btn small danger', 'aria-label': '删除这条截止事项', onclick: () => item.remove() },
    '✕',
  );

  const urlInput = el('input', {
    type: 'text',
    class: 'deadline-url',
    maxlength: '600',
    value: deadline.url || '',
    placeholder: '绑定网址（可选）：留空就用本课程的网址',
  });

  row.append(titleInput, dueInput, el('label', { class: 'check' }, doneInput, '已完成'), remove);
  item.append(row, urlInput);
  return item;
}

function collectDeadlines(container) {
  const out = [];
  for (const item of container.querySelectorAll('.deadline-item')) {
    const row = item.querySelector('.deadline-row');
    const titleInput = row.querySelector('input[type="text"]');
    const dueInput = row.querySelector('input[type="datetime-local"]');
    const title = titleInput.value.trim();
    if (!title) continue;

    const done = row.querySelector('input[type="checkbox"]').checked;
    const url = (item.querySelector('.deadline-url')?.value || '').trim();
    let due = '';
    if (dueInput.value) {
      const date = new Date(dueInput.value);
      if (!Number.isNaN(date.getTime())) due = date.toISOString();
    }
    out.push({ title, due, done, url });
  }
  return out;
}

/* ── 删除 / 设置 / 导入导出 ───────────────────────────────── */

function confirmDelete(course) {
  const cancelButton = el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消');
  const deleteButton = el('button', { type: 'button', class: 'btn danger' }, '删除');

  const form = openModal({
    title: '删除课程',
    body: el(
      'p',
      { class: 'confirm-text' },
      '确定要删除「',
      el('strong', {}, course.name),
      '」吗？这门课的进度、备注和截止事项都会一起删掉，无法撤销。',
    ),
    footer: [cancelButton, deleteButton],
  });

  deleteButton.addEventListener('click', async () => {
    deleteButton.disabled = true;
    deleteButton.textContent = '删除中…';
    try {
      await api(`/api/courses/${course.id}`, { method: 'DELETE' });
      closeModal();
      await refresh();
      toast('已删除');
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
      deleteButton.disabled = false;
      deleteButton.textContent = '删除';
    }
  });

  form.addEventListener('submit', (event) => event.preventDefault());
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/* ── 新建任务（绑定到指定网址）───────────────────────────── */

function openTaskModal(presetCourseId) {  if (!state.courses.length) {
    toast('先添加一个课程（网址），任务要绑定到它上面', 'error');
    openEditor(null);
    return;
  }

  const titleInput = el('input', { type: 'text', maxlength: '80', placeholder: '例如：第三章作业' });
  const dueInput = el('input', { type: 'datetime-local' });

  const courseSelect = el(
    'select',
    {},
    ...state.courses.map((course) =>
      el('option', { value: course.id }, `${course.name}${course.url ? ` — ${hostOf(course.url)}` : '（无网址）'}`),
    ),
  );

  const preferred = state.courses.find((c) => c.id === presetCourseId) || state.courses.find((c) => c.url) || state.courses[0];
  courseSelect.value = preferred.id;

  const urlInput = el('input', {
    type: 'text',
    maxlength: '600',
    placeholder: '留空就用所选课程 / 网址',
  });

  const updateHint = () => {
    const course = state.courses.find((c) => c.id === courseSelect.value);
    urlInput.placeholder = course?.url ? `留空就用 ${hostOf(course.url)}` : '这门课还没有网址，建议在这里填一个';
  };
  courseSelect.addEventListener('change', updateHint);
  updateHint();

  const saveButton = el('button', { type: 'submit', class: 'btn primary' }, '创建任务');

  const form = openModal({
    title: '新建任务',
    body: [
      el('label', { class: 'field' }, el('span', {}, '任务名 *'), titleInput),
      el('label', { class: 'field' }, el('span', {}, '截止时间'), dueInput),
      el(
        'label',
        { class: 'field' },
        el('span', {}, '绑定到哪个网址'),
        courseSelect,
        el('small', { class: 'field-hint' }, '点任务时会直接打开这个地址。'),
      ),
      el(
        'label',
        { class: 'field' },
        el('span', {}, '指定具体页面（可选）'),
        urlInput,
        el('small', { class: 'field-hint' }, '比如某次作业的详情页；留空就用上面那个网址。'),
      ),
    ],
    footer: [el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消'), saveButton],
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearModalError();

    const title = titleInput.value.trim();
    if (!title) {
      showModalError('任务名不能为空');
      titleInput.focus();
      return;
    }

    const deadline = { title, due: '', url: urlInput.value.trim() };
    if (dueInput.value) {
      const date = new Date(dueInput.value);
      if (!Number.isNaN(date.getTime())) deadline.due = date.toISOString();
    }

    saveButton.disabled = true;
    try {
      const result = await api(`/api/courses/${courseSelect.value}/deadlines`, {
        method: 'POST',
        body: JSON.stringify({ deadlines: [deadline] }),
      });
      closeModal();
      await refresh();
      toast(result.added ? '任务已创建' : '这个任务已经存在了');
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
    } finally {
      saveButton.disabled = false;
    }
  });
}

// 编辑已有任务：改名、改截止时间、重新绑定网址
function openTaskEditor(course, deadline) {
  const titleInput = el('input', { type: 'text', maxlength: '80', value: deadline.title });
  const dueInput = el('input', { type: 'datetime-local', value: toLocalInput(deadline.due) });
  const urlInput = el('input', {
    type: 'text',
    maxlength: '600',
    value: deadline.url || '',
    placeholder: course.url ? `留空就用 ${hostOf(course.url)}` : 'https://…',
  });

  const saveButton = el('button', { type: 'submit', class: 'btn primary' }, '保存');

  const form = openModal({
    title: '编辑任务',
    body: [
      el('label', { class: 'field' }, el('span', {}, '任务名 *'), titleInput),
      el('label', { class: 'field' }, el('span', {}, '截止时间'), dueInput),
      el(
        'label',
        { class: 'field' },
        el('span', {}, '绑定到哪个网址'),
        urlInput,
        el('small', { class: 'field-hint' }, '点这条任务时会打开这个地址；留空就用课程自己的网址。'),
      ),
      el('p', { class: 'muted tiny' }, `所属课程：${course.name}`),
    ],
    footer: [el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消'), saveButton],
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearModalError();

    const title = titleInput.value.trim();
    if (!title) {
      showModalError('任务名不能为空');
      titleInput.focus();
      return;
    }

    const updated = { ...deadline, title, url: urlInput.value.trim() };
    if (dueInput.value) {
      const date = new Date(dueInput.value);
      updated.due = Number.isNaN(date.getTime()) ? '' : date.toISOString();
    } else {
      updated.due = '';
    }

    saveButton.disabled = true;
    try {
      const deadlines = (course.deadlines || []).map((item) => (item.id === deadline.id ? updated : item));
      await api(`/api/courses/${course.id}`, { method: 'PATCH', body: JSON.stringify({ deadlines }) });
      closeModal();
      await refresh();
      toast('任务已更新');
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
    } finally {
      saveButton.disabled = false;
    }
  });
}

function openSettings() {
  const titleInput = el('input', { type: 'text', maxlength: '40', value: state.settings.title || '' });
  const semesterInput = el('input', { type: 'text', maxlength: '40', value: state.settings.semester || '', placeholder: '例如：2026 秋季学期' });
  const subtitleInput = el('input', { type: 'text', maxlength: '120', value: state.settings.subtitle || '' });

  const passwordInput = el('input', {
    type: 'checkbox',
    checked: state.settings.requirePassword !== false,
  });

  const updateUrlInput = el('input', {
    type: 'text',
    maxlength: '600',
    value: state.settings.updateUrl || '',
    placeholder: 'https://raw.githubusercontent.com/…/version.json',
  });

  const saveButton = el('button', { type: 'submit', class: 'btn primary' }, '保存');

  const form = openModal({
    title: '站点设置',
    body: [
      el('label', { class: 'field' }, el('span', {}, '标题'), titleInput),
      el('label', { class: 'field' }, el('span', {}, '学期'), semesterInput),
      el('label', { class: 'field' }, el('span', {}, '副标题'), subtitleInput),
      el(
        'label',
        { class: 'field checkbox-field' },
        el('span', { class: 'check' }, passwordInput, '打开时需要输入密码'),
        el(
          'small',
          { class: 'field-hint' },
          '关掉后，同一 WiFi 下的设备打开这个地址会直接进入。只在自己电脑上用可以关；如果家里/宿舍有其他人同一网络，建议保留。',
        ),
      ),
      el(
        'div',
        { class: 'field' },
        el('span', {}, '浏览器扩展'),
        el(
          'div',
          { class: 'field-hint extension-hint' },
          el(
            'p',
            {},
            '装一次，之后在任意课程网站都能用：雨课堂、学习通、智慧树、学校自建的平台（*.*edu.cn）会直接显示「收进学习中心」和「记住此页」；其它网站会收成一个小圆点，点一下才展开，不挡内容。',
          ),
          el('p', {}, '安装：Edge 打开 ', el('code', {}, 'edge://extensions'), ' → 打开「开发人员模式」→ 点「加载解压缩的扩展」→ 选择本程序目录下的 ', el('code', {}, 'extension'), ' 文件夹。'),
        ),
      ),
      el(
        'label',
        { class: 'field' },
        el('span', {}, '更新检查地址（可选）'),
        updateUrlInput,
        el(
          'small',
          { class: 'field-hint' },
          '填一个返回 {"version":"2.2.1","notes":"…","url":"下载地址"} 的网址；打开时会自动检查，有新版本会在顶部提示。不填就不检查。',
        ),
      ),
    ],
    footer: [
      el('span', { class: 'muted tiny settings-version' }, `版本 ${state.version || '—'}`),
      el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消'),
      saveButton,
    ],
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    saveButton.disabled = true;
    try {
      const result = await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
          title: titleInput.value,
          semester: semesterInput.value,
          subtitle: subtitleInput.value,
          requirePassword: passwordInput.checked,
          updateUrl: updateUrlInput.value,
        }),
      });
      state.settings = { ...state.settings, ...result.settings };
      closeModal();
      render();
      toast(passwordInput.checked ? '设置已保存，需要密码' : '设置已保存，已取消密码');
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
    } finally {
      saveButton.disabled = false;
    }
  });
}

function exportData() {
  const link = document.createElement('a');
  link.href = '/api/export';
  link.download = '';
  document.body.append(link);
  link.click();
  link.remove();
  toast('已开始下载备份（含事务与附件）');
}

async function importFile(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    toast('文件不是合法的 JSON', 'error');
    return;
  }
  try {
    const result = await api('/api/import', { method: 'POST', body: JSON.stringify(payload) });
    await refresh();
    toast(`已导入 ${result.count} 门课程、${result.tasks || 0} 条事务`);
  } catch (error) {
    if (error instanceof AuthError) return;
    toast(error.message, 'error');
  }
}

/* ── 事务：月历 / 列表 / 分类 / 附件 ─────────────────────── */

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dateKeyOf(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayKey() {
  return dateKeyOf(new Date());
}

function categoryOf(id) {
  return state.categories.find((category) => category.id === id) || null;
}

function getFileIcon(filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  const icons = {
    pdf: '📄',
    doc: '📝',
    docx: '📝',
    txt: '📃',
    md: '📃',
    xls: '📊',
    xlsx: '📊',
    csv: '📊',
    ppt: '📽️',
    pptx: '📽️',
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    gif: '🖼️',
    svg: '🖼️',
    webp: '🖼️',
    mp3: '🎵',
    wav: '🎵',
    m4a: '🎵',
    mp4: '🎬',
    mov: '🎬',
    avi: '🎬',
    zip: '📦',
    rar: '📦',
    '7z': '📦',
    js: '💻',
    html: '💻',
    css: '💻',
    py: '💻',
    json: '💻',
  };
  return icons[ext] || '📎';
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`读取「${file.name}」失败`));
    reader.readAsDataURL(file);
  });
}

function downloadAffairFile(file) {
  const link = document.createElement('a');
  link.href = `/api/files/${encodeURIComponent(file.id)}`;
  link.download = file.name || '';
  document.body.append(link);
  link.click();
  link.remove();
}

// 把某一天的事务和课程截止事项整理成「日历 / 列表」共用的数据
function affairItemsByDate() {
  const map = new Map();
  const scope = state.affair.scope;
  const category = state.affair.category;
  const needle = state.filter.q.trim().toLowerCase();

  const add = (dateKey, item) => {
    if (!dateKey) return;
    const list = map.get(dateKey) || [];
    list.push(item);
    map.set(dateKey, list);
  };

  const matches = (text) => !needle || String(text || '').toLowerCase().includes(needle);

  if (scope !== 'course') {
    for (const task of state.tasks) {
      if (category !== 'all' && task.categoryId !== category) continue;
      const categoryName = categoryOf(task.categoryId)?.name || '未分类';
      if (!matches(`${task.title} ${task.note} ${categoryName}`)) continue;
      add(task.date, { kind: 'task', task });
    }
  }

  if (scope !== 'task' && (category === 'all' || scope === 'course')) {
    for (const deadline of allDeadlines()) {
      if (!matches(`${deadline.title} ${deadline.course.name}`)) continue;
      if (!deadline.due) continue;
      add(dateKeyOf(new Date(deadline.due)), { kind: 'course', deadline, course: deadline.course });
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'task' ? -1 : 1;
      if (a.kind === 'task') {
        return (b.task.priority || 2) - (a.task.priority || 2) || a.task.title.localeCompare(b.task.title, 'zh');
      }
      return dueValue(a.deadline) - dueValue(b.deadline);
    });
  }

  return map;
}

function renderAffairs() {
  // 旧页面 + 新脚本的混搭场景：没有事务视图就安静跳过，别让整个应用白屏
  if (!document.getElementById('affairs-view')) return;

  const month = state.affair.month;
  $('#month-title').textContent = `${month.getFullYear()}年${month.getMonth() + 1}月`;

  for (const button of document.querySelectorAll('#affair-scope .seg')) {
    const active = button.dataset.scope === state.affair.scope;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }
  for (const button of document.querySelectorAll('#affair-view-switch .seg')) {
    const active = button.dataset.affairView === state.affair.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }

  renderAffairStats();
  renderAffairCategories();

  const calendar = $('#affairs-calendar');
  const list = $('#affairs-list');
  const empty = $('#affairs-empty');
  const isCalendar = state.affair.view === 'calendar';

  calendar.hidden = !isCalendar;
  list.hidden = isCalendar;

  if (isCalendar) {
    renderAffairCalendar();
    empty.hidden = true;
  } else {
    const count = renderAffairList();
    empty.hidden = count > 0;
    if (!count) {
      const filtered = Boolean(state.filter.q.trim()) || state.affair.category !== 'all';
      $('.empty-title', empty).textContent = filtered ? '没有符合条件的事务' : '这个月还没有事务';
      $('.muted', empty).textContent = filtered
        ? '换个关键词，或者把分类切回「全部」。'
        : '点日历上的任意一格，或点上面的「＋ 新建事务」。';
    }
  }
}

function renderAffairStats() {
  const total = state.tasks.length;
  const done = state.tasks.filter((task) => task.done).length;
  const pending = total - done;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const ring = el('div', { class: 'stat affair-ring-stat' });
  ring.innerHTML = `<svg class="affair-ring" viewBox="0 0 44 44" width="46" height="46" aria-hidden="true"><circle class="affair-ring-bg" cx="22" cy="22" r="${radius}"/><circle class="affair-ring-fill" cx="22" cy="22" r="${radius}" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/><text class="affair-ring-text" x="22" y="26" text-anchor="middle">${pct}%</text></svg>`;
  ring.append(el('div', {}, el('div', { class: 'stat-label' }, '事务完成度')));

  $('#affairs-stats').replaceChildren(
    statTile(String(total), '条事务'),
    statTile(String(done), '已完成'),
    statTile(String(pending), '待办'),
    ring,
  );
}

function renderAffairCategories() {
  const box = $('#affairs-categories');
  const chips = [];

  chips.push(
    el(
      'button',
      {
        type: 'button',
        class: `platform-chip affair-cat${state.affair.category === 'all' ? ' active' : ''}`,
        onclick: () => {
          state.affair.category = 'all';
          renderAffairs();
        },
      },
      '全部',
      el('span', { class: 'count' }, String(state.tasks.length)),
    ),
  );

  for (const category of state.categories) {
    const count = state.tasks.filter((task) => task.categoryId === category.id).length;
    const active = state.affair.category === category.id;

    const chip = el('div', {
      class: `platform-chip affair-cat${active ? ' active' : ''}`,
      role: 'button',
      tabindex: '0',
      title: '点击筛选',
    });
    chip.append(
      el('span', { class: 'category-dot' }),
      el('span', { class: 'affair-cat-name' }, category.name),
      el('span', { class: 'count' }, String(count)),
      el(
        'button',
        {
          type: 'button',
          class: 'affair-cat-edit',
          title: '改名 / 换颜色',
          'aria-label': `编辑分类 ${category.name}`,
          onclick: (event) => {
            event.stopPropagation();
            openCategoryModal(category);
          },
        },
        '✎',
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'affair-cat-remove',
          title: '删除这个分类',
          'aria-label': `删除分类 ${category.name}`,
          onclick: (event) => {
            event.stopPropagation();
            confirmDeleteCategory(category);
          },
        },
        '×',
      ),
    );
    chip.querySelector('.category-dot').style.background = category.color;

    const activate = () => {
      if (active) {
        state.affair.category = 'all';
      } else {
        state.affair.category = category.id;
        if (state.affair.scope === 'course') state.affair.scope = 'all';
      }
      renderAffairs();
    };
    chip.addEventListener('click', (event) => {
      if (event.target.closest('.affair-cat-remove, .affair-cat-edit')) return;
      activate();
    });
    chip.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });

    chips.push(chip);
  }

  chips.push(
    el(
      'button',
      { type: 'button', class: 'platform-chip add-link', title: '新建分类', onclick: () => openCategoryModal(null) },
      '＋ 新建分类',
    ),
  );

  box.replaceChildren(...chips);
}

function renderAffairCalendar() {
  const month = state.affair.month;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const startDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const prevDays = new Date(year, monthIndex, 0).getDate();
  const today = todayKey();
  const itemsByDate = affairItemsByDate();
  const nodes = WEEKDAYS.map((label) => el('div', { class: 'cal-head' }, label));

  for (let i = 0; i < 42; i += 1) {
    let day;
    let dateKey;
    let other = false;

    if (i < startDay) {
      day = prevDays - startDay + i + 1;
      dateKey = dateKeyOf(new Date(year, monthIndex - 1, day));
      other = true;
    } else if (i >= startDay + daysInMonth) {
      day = i - startDay - daysInMonth + 1;
      dateKey = dateKeyOf(new Date(year, monthIndex + 1, day));
      other = true;
    } else {
      day = i - startDay + 1;
      dateKey = `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
    }

    const cell = el('div', {
      class: `cal-cell${dateKey === today ? ' today' : ''}${other ? ' other-month' : ''}`,
      role: 'button',
      tabindex: '0',
      title: '点击新建事务',
      onclick: (event) => {
        if (event.target.closest('.cal-item, .cal-more')) return;
        openAffairEditor(null, dateKey);
      },
      onkeydown: (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target !== cell) return;
        event.preventDefault();
        openAffairEditor(null, dateKey);
      },
    });
    cell.append(el('div', { class: 'cal-date' }, String(day)));

    const items = itemsByDate.get(dateKey) || [];
    for (const item of items.slice(0, 4)) cell.append(calItemEl(item));
    if (items.length > 4) {
      cell.append(
        el(
          'button',
          {
            type: 'button',
            class: 'cal-more',
            onclick: (event) => {
              event.stopPropagation();
              openDayModal(dateKey);
            },
          },
          `+${items.length - 4} 更多`,
        ),
      );
    }

    nodes.push(cell);
  }

  $('#affairs-calendar').replaceChildren(...nodes);
}

function calItemEl(item) {
  if (item.kind === 'course') {
    const { deadline, course } = item;
    const node = el(
      'button',
      {
        type: 'button',
        class: `cal-item course${deadline.done ? ' done' : ''}`,
        title: `${deadline.title}\n${course.name}${deadline.due ? ` · ${fmtDue(deadline.due)}` : ''}`,
        onclick: (event) => {
          event.stopPropagation();
          openTaskEditor(course, deadline);
        },
      },
      el('span', { class: 'cal-kind' }, '课'),
      el('span', { class: 'cal-item-title' }, deadline.title),
    );
    node.style.setProperty('--accent', course.color || PALETTE[0]);
    return node;
  }

  const { task } = item;
  const category = categoryOf(task.categoryId);
  const node = el(
    'button',
    {
      type: 'button',
      class: `cal-item${task.done ? ' done' : ''}`,
      title: `${task.title}\n${category ? category.name : '未分类'} · 优先级${PRIORITY_LABELS[(task.priority || 2) - 1]}`,
      onclick: (event) => {
        event.stopPropagation();
        openAffairEditor(task.id);
      },
    },
    task.priority === 3 ? el('span', { class: 'cal-flag', title: '高优先级' }, '!') : null,
    el('span', { class: 'cal-item-title' }, task.title),
    task.files && task.files.length ? el('span', { class: 'cal-files' }, `📎${task.files.length}`) : null,
  );
  node.style.setProperty('--accent', category ? category.color : 'var(--muted)');
  return node;
}

function renderAffairList() {
  const month = state.affair.month;
  const prefix = `${month.getFullYear()}-${pad2(month.getMonth() + 1)}`;
  const map = affairItemsByDate();
  const dates = [...map.keys()].filter((key) => key.startsWith(prefix)).sort();

  const rows = [];
  for (const date of dates) {
    for (const item of map.get(date)) rows.push(affairRowEl(item));
  }

  $('#affairs-list').replaceChildren(...rows);
  return rows.length;
}

function affairRowEl(item) {
  if (item.kind === 'course') {
    const { deadline, course } = item;
    const checkbox = el('input', {
      type: 'checkbox',
      checked: Boolean(deadline.done),
      'aria-label': '标记完成',
      onchange: (event) => toggleTaskDone(course, deadline, event.target.checked),
    });

    const row = el(
      'div',
      {
        class: `affair-row${deadline.done ? ' done' : ''}`,
        title: deadline.url ? `打开 ${deadline.url}` : '',
      },
      el('label', { class: 'task-check' }, checkbox),
      el(
        'div',
        { class: 'affair-main' },
        el('div', { class: 'affair-title' }, deadline.title),
        el(
          'div',
          { class: 'affair-meta' },
          el('span', { class: 'affair-badge course' }, course.name),
          el('span', { class: 'muted tiny' }, deadline.due ? fmtDue(deadline.due) : '无日期'),
          deadline.due ? dueBadge(deadline.due) : null,
        ),
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'icon-btn small',
          title: '打开绑定网址',
          'aria-label': '打开绑定网址',
          onclick: (event) => {
            event.stopPropagation();
            openTaskTarget(deadline);
          },
        },
        '↗',
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'icon-btn small task-edit',
          title: '编辑这条课程任务',
          'aria-label': '编辑任务',
          onclick: (event) => {
            event.stopPropagation();
            openTaskEditor(course, deadline);
          },
        },
        '✎',
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'icon-btn small danger task-delete',
          title: '删除这条课程任务',
          'aria-label': '删除任务',
          onclick: (event) => {
            event.stopPropagation();
            confirmDeleteTask(course, deadline);
          },
        },
        '✕',
      ),
    );
    row.style.setProperty('--accent', course.color || PALETTE[0]);
    row.querySelector('.affair-badge').style.setProperty('--accent', course.color || PALETTE[0]);
    row.addEventListener('click', (event) => {
      if (event.target.closest('input, button, label')) return;
      openTaskEditor(course, deadline);
    });
    return row;
  }

  const { task } = item;
  const category = categoryOf(task.categoryId);
  const checkbox = el('input', {
    type: 'checkbox',
    checked: Boolean(task.done),
    'aria-label': '标记完成',
    onchange: async (event) => {
      const done = event.target.checked;
      try {
        await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ done }) });
        await refresh();
      } catch (error) {
        if (error instanceof AuthError) return;
        toast(error.message, 'error');
        await refresh();
      }
    },
  });

  const fileChips = (task.files || []).map((file) =>
    el(
      'button',
      {
        type: 'button',
        class: 'file-chip',
        title: `下载 ${file.name}`,
        onclick: (event) => {
          event.stopPropagation();
          downloadAffairFile(file);
        },
      },
      `${getFileIcon(file.name)} ${file.name}`,
    ),
  );

  const row = el(
    'div',
    { class: `affair-row${task.done ? ' done' : ''}`, 'data-id': task.id },
    el('label', { class: 'task-check' }, checkbox),
    el(
      'div',
      { class: 'affair-main' },
      el('div', { class: 'affair-title' }, task.title),
      el(
        'div',
        { class: 'affair-meta' },
        el('span', { class: 'affair-badge' }, category ? category.name : '未分类'),
        el(
          'span',
          { class: `affair-priority p${task.priority || 2}` },
          PRIORITY_LABELS[(task.priority || 2) - 1],
        ),
        el('span', { class: 'muted tiny' }, task.date),
        task.note ? el('span', { class: 'affair-note', title: task.note }, task.note) : null,
        task.files && task.files.length ? el('span', { class: 'muted tiny' }, `📎 ${task.files.length}`) : null,
      ),
      fileChips.length ? el('div', { class: 'affair-files' }, ...fileChips) : null,
    ),
    el(
      'button',
      {
        type: 'button',
        class: 'icon-btn small task-edit',
        title: '编辑这条事务',
        'aria-label': '编辑事务',
        onclick: (event) => {
          event.stopPropagation();
          openAffairEditor(task.id);
        },
      },
      '✎',
    ),
    el(
      'button',
      {
        type: 'button',
        class: 'icon-btn small danger task-delete',
        title: '删除这条事务',
        'aria-label': '删除事务',
        onclick: (event) => {
          event.stopPropagation();
          confirmDeleteAffair(task.id);
        },
      },
      '✕',
    ),
  );

  row.querySelector('.affair-badge').style.setProperty('--accent', category ? category.color : 'var(--muted)');
  row.addEventListener('click', (event) => {
    if (event.target.closest('input, button, label')) return;
    openAffairEditor(task.id);
  });

  return row;
}

function openDayModal(dateKey) {
  const items = affairItemsByDate().get(dateKey) || [];
  const [year, month, day] = dateKey.split('-');
  const list = el('div', { class: 'day-list' });

  for (const item of items) {
    if (item.kind === 'task') {
      list.append(
        el(
          'button',
          {
            type: 'button',
            class: 'day-row',
            onclick: () => {
              closeModal();
              openAffairEditor(item.task.id);
            },
          },
          el('span', { class: 'day-check' }, item.task.done ? '✓' : '○'),
          el(
            'div',
            { class: 'day-main' },
            el('div', { class: 'day-title' }, item.task.title),
            el(
              'div',
              { class: 'muted tiny' },
              `${categoryOf(item.task.categoryId)?.name || '未分类'} · 优先级${PRIORITY_LABELS[(item.task.priority || 2) - 1]}`,
            ),
          ),
        ),
      );
    } else {
      list.append(
        el(
          'button',
          {
            type: 'button',
            class: 'day-row course',
            onclick: () => {
              closeModal();
              openTaskEditor(item.course, item.deadline);
            },
          },
          el('span', { class: 'day-check' }, item.deadline.done ? '✓' : '课'),
          el(
            'div',
            { class: 'day-main' },
            el('div', { class: 'day-title' }, item.deadline.title),
            el('div', { class: 'muted tiny' }, `${item.course.name}${item.deadline.due ? ` · ${fmtDue(item.deadline.due)}` : ''}`),
          ),
        ),
      );
    }
  }

  const form = openModal({
    title: `${year} 年 ${Number(month)} 月 ${Number(day)} 日`,
    body: [
      el('p', { class: 'muted tiny' }, `共 ${items.length} 条，按优先级 / 截止时间排列。`),
      list,
    ],
    footer: [
      el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '关闭'),
      el('button', { type: 'submit', class: 'btn primary' }, '＋ 在这天新建事务'),
    ],
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    closeModal();
    openAffairEditor(null, dateKey);
  });
}

/* ── 事务编辑弹窗 ─────────────────────────────────────────── */

function openAffairEditor(taskId, presetDate) {
  const task = taskId ? state.tasks.find((item) => item.id === taskId) : null;
  const defaultCategory = state.categories[0]?.id || '';
  const draft = task
    ? JSON.parse(JSON.stringify(task))
    : {
        title: '',
        date: presetDate || todayKey(),
        categoryId: defaultCategory,
        note: '',
        priority: 2,
        done: false,
        files: [],
      };

  let files = (draft.files || []).map((file) => ({ ...file }));
  let pending = [];
  let removed = [];
  let colorPriority = draft.priority || 2;

  const titleInput = el('input', {
    type: 'text',
    maxlength: '120',
    value: draft.title || '',
    placeholder: '例如：完成数学作业',
  });
  const dateInput = el('input', { type: 'date', value: draft.date || todayKey() });

  const categorySelect = el(
    'select',
    {},
    el('option', { value: '' }, '未分类'),
    ...state.categories.map((category) => el('option', { value: category.id }, category.name)),
  );
  categorySelect.value = draft.categoryId || '';

  const priorityInput = el('input', {
    type: 'range',
    min: '1',
    max: '3',
    step: '1',
    value: String(draft.priority || 2),
    oninput: () => updatePriorityLabel(),
  });
  const priorityLabel = el('span', { class: 'range-value' }, PRIORITY_LABELS[colorPriority - 1]);

  function updatePriorityLabel() {
    colorPriority = Number(priorityInput.value);
    priorityLabel.textContent = PRIORITY_LABELS[colorPriority - 1];
  }

  const noteInput = el('textarea', { rows: '3', maxlength: '2000', placeholder: '可选：作业要求、要带的东西…' });
  noteInput.value = draft.note || '';

  const doneInput = el('input', { type: 'checkbox', checked: Boolean(draft.done) });

  const fileListEl = el('div', { class: 'file-list' });

  const dropzone = el(
    'div',
    {
      class: 'drop-zone',
      role: 'button',
      tabindex: '0',
      onclick: () => fileInput.click(),
      onkeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          fileInput.click();
        }
      },
      ondragover: (event) => {
        event.preventDefault();
        dropzone.classList.add('over');
      },
      ondragleave: (event) => {
        event.preventDefault();
        dropzone.classList.remove('over');
      },
      ondrop: (event) => {
        event.preventDefault();
        dropzone.classList.remove('over');
        handleFiles(event.dataTransfer?.files);
      },
    },
    el('div', { class: 'drop-zone-icon' }, '📎'),
    el(
      'div',
      { class: 'drop-zone-text' },
      '点击选择，或把文件拖到这里',
      el('br'),
      el('span', { class: 'muted tiny' }, '单个文件不超过 20MB，可以一次选多个'),
    ),
  );

  const fileInput = el('input', {
    type: 'file',
    multiple: true,
    hidden: true,
    onchange: (event) => {
      handleFiles(event.target.files);
      event.target.value = '';
    },
  });

  function renderFiles() {
    const rows = [];
    const removedIds = new Set(removed.map((file) => file.id));

    for (const file of files) {
      if (removedIds.has(file.id)) continue;
      rows.push(
        el(
          'div',
          { class: 'file-row' },
          el('span', { class: 'file-icon' }, getFileIcon(file.name)),
          el('span', { class: 'file-name', title: file.name }, file.name),
          el('span', { class: 'file-size' }, formatFileSize(file.size)),
          el(
            'button',
            {
              type: 'button',
              class: 'icon-btn small',
              title: '下载',
              'aria-label': '下载附件',
              onclick: () => downloadAffairFile(file),
            },
            '↓',
          ),
          el(
            'button',
            {
              type: 'button',
              class: 'icon-btn small danger',
              title: '删除附件',
              'aria-label': '删除附件',
              onclick: () => removeExistingFile(file),
            },
            '×',
          ),
        ),
      );
    }

    pending.forEach((file, index) => {
      rows.push(
        el(
          'div',
          { class: 'file-row pending' },
          el('span', { class: 'file-icon' }, getFileIcon(file.name)),
          el('span', { class: 'file-name', title: file.name }, file.name),
          el('span', { class: 'file-size' }, formatFileSize(file.size)),
          el('span', { class: 'file-pending tiny' }, '保存后上传'),
          el(
            'button',
            {
              type: 'button',
              class: 'icon-btn small danger',
              title: '移除',
              'aria-label': '移除附件',
              onclick: () => {
                pending.splice(index, 1);
                renderFiles();
              },
            },
            '×',
          ),
        ),
      );
    });

    fileListEl.replaceChildren(...rows);
  }

  // 附件删除也等「保存」时再生效，这样点取消不会误删
  function removeExistingFile(file) {
    removed.push(file);
    renderFiles();
    toast(`保存后删除「${file.name}」`);
  }

  function handleFiles(fileList) {
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_FILE_BYTES) {
        toast(`「${file.name}」超过 20MB`, 'error');
        continue;
      }
      pending.push(file);
    }
    renderFiles();
  }

  renderFiles();

  const body = [
    el('label', { class: 'field' }, el('span', {}, '标题 *'), titleInput),
    el(
      'div',
      { class: 'row-2' },
      el('label', { class: 'field' }, el('span', {}, '日期 *'), dateInput),
      el('label', { class: 'field' }, el('span', {}, '分类'), categorySelect),
    ),
    el(
      'div',
      { class: 'field' },
      el('span', {}, '优先级'),
      el('div', { class: 'range-row' }, priorityInput, priorityLabel),
    ),
    el('label', { class: 'field' }, el('span', {}, '备注'), noteInput),
    el('div', { class: 'field' }, el('span', {}, '相关文件'), dropzone, fileInput, fileListEl),
    el(
      'label',
      { class: 'field checkbox-field' },
      el('span', { class: 'check' }, doneInput, '已完成'),
      el('small', { class: 'field-hint' }, '勾上后，这条事务在月历和列表里会变灰。'),
    ),
  ];

  const saveButton = el('button', { type: 'submit', class: 'btn primary' }, task ? '保存' : '创建事务');
  const form = openModal({
    title: task ? '编辑事务' : '新建事务',
    body,
    footer: [el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消'), saveButton],
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearModalError();

    const title = titleInput.value.trim();
    if (!title) {
      showModalError('事务标题不能为空');
      titleInput.focus();
      return;
    }
    if (!dateInput.value) {
      showModalError('请选一个日期');
      dateInput.focus();
      return;
    }

    const payload = {
      title,
      date: dateInput.value,
      categoryId: categorySelect.value,
      note: noteInput.value.trim(),
      priority: Number(priorityInput.value),
      done: doneInput.checked,
    };

    saveButton.disabled = true;
    saveButton.textContent = '保存中…';

    try {
      let taskId = task?.id || '';
      if (task) {
        await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        const created = await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
        taskId = created.task.id;
      }

      let failed = [];
      for (const file of pending) {
        try {
          const data = await readFileAsDataURL(file);
          await api(`/api/tasks/${taskId}/files`, {
            method: 'POST',
            body: JSON.stringify({ name: file.name, type: file.type, data }),
          });
        } catch (error) {
          if (error instanceof AuthError) return;
          failed.push(`上传「${file.name}」：${error.message}`);
          break;
        }
      }
      for (const file of removed) {
        try {
          await api(`/api/tasks/${taskId}/files/${file.id}`, { method: 'DELETE' });
        } catch (error) {
          if (error instanceof AuthError) return;
          failed.push(`删除「${file.name}」：${error.message}`);
        }
      }
      pending = [];
      removed = [];

      closeModal();
      await refresh();
      if (failed.length) toast(`事务已保存，但附件没处理完：${failed.join('；')}`, 'error');
      else toast(task ? '已保存' : '事务已创建');
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
      saveButton.disabled = false;
      saveButton.textContent = task ? '保存' : '创建事务';
    }
  });
}

function confirmDeleteAffair(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  const deleteButton = el('button', { type: 'button', class: 'btn danger' }, '删除');
  const form = openModal({
    title: '删除事务',
    body: [
      el('p', { class: 'confirm-text' }, `确定删除「${task.title}」吗？`),
      el(
        'p',
        { class: 'muted tiny' },
        task.files && task.files.length
          ? `它的 ${task.files.length} 个附件也会一起删掉，无法恢复。`
          : '删除后无法恢复。',
      ),
    ],
    footer: [el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消'), deleteButton],
  });

  deleteButton.addEventListener('click', async () => {
    deleteButton.disabled = true;
    deleteButton.textContent = '删除中…';
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
      closeModal();
      await refresh();
      toast('事务已删除');
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
      deleteButton.disabled = false;
      deleteButton.textContent = '删除';
    }
  });

  form.addEventListener('submit', (event) => event.preventDefault());
}

/* ── 分类编辑 ─────────────────────────────────────────────── */

function openCategoryModal(category) {
  const isNew = !category;
  const nameInput = el('input', {
    type: 'text',
    maxlength: '30',
    value: category?.name || '',
    placeholder: '例如：考试、社团',
  });

  let color = category?.color || PALETTE[state.categories.length % PALETTE.length];
  const swatches = el('div', { class: 'swatches', role: 'group', 'aria-label': '分类颜色' });

  for (const value of PALETTE) {
    const swatch = el('button', {
      type: 'button',
      class: 'swatch',
      'aria-label': `选择颜色 ${value}`,
      'aria-pressed': String(value === color),
      onclick: (event) => {
        color = value;
        for (const node of swatches.querySelectorAll('.swatch')) {
          node.setAttribute('aria-pressed', String(node === event.currentTarget));
        }
      },
    });
    swatch.style.setProperty('--swatch', value);
    swatches.append(swatch);
  }

  const saveButton = el('button', { type: 'submit', class: 'btn primary' }, isNew ? '新建' : '保存');
  const form = openModal({
    title: isNew ? '新建分类' : '编辑分类',
    body: [
      el('p', { class: 'muted tiny' }, '分类用来给事务分组，会显示成月历上的颜色。双击分类可以改名。'),
      el('label', { class: 'field' }, el('span', {}, '分类名 *'), nameInput),
      el('div', { class: 'field' }, el('span', {}, '颜色'), swatches),
    ],
    footer: [el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消'), saveButton],
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearModalError();

    const name = nameInput.value.trim();
    if (!name) {
      showModalError('分类名不能为空');
      nameInput.focus();
      return;
    }

    saveButton.disabled = true;
    try {
      if (isNew) await api('/api/categories', { method: 'POST', body: JSON.stringify({ name, color }) });
      else await api(`/api/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ name, color }) });
      closeModal();
      await refresh();
      toast(isNew ? '分类已创建' : '分类已保存');
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
      saveButton.disabled = false;
    }
  });
}

function confirmDeleteCategory(category) {
  const count = state.tasks.filter((task) => task.categoryId === category.id).length;
  const deleteButton = el('button', { type: 'button', class: 'btn danger' }, '删除分类');
  const form = openModal({
    title: '删除分类',
    body: [
      el('p', { class: 'confirm-text' }, `确定删除分类「${category.name}」吗？`),
      el(
        'p',
        { class: 'muted tiny' },
        count ? `其中 ${count} 条事务会变成「未分类」，事务本身不会删除。` : '这个分类下还没有事务。',
      ),
    ],
    footer: [el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消'), deleteButton],
  });

  deleteButton.addEventListener('click', async () => {
    deleteButton.disabled = true;
    try {
      await api(`/api/categories/${category.id}`, { method: 'DELETE' });
      if (state.affair.category === category.id) state.affair.category = 'all';
      closeModal();
      await refresh();
      toast('分类已删除');
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
      deleteButton.disabled = false;
    }
  });

  form.addEventListener('submit', (event) => event.preventDefault());
}

/* ── 导入旧版事务数据 ─────────────────────────────────────── */

function showRestartNotice() {
  if (state.restartNoticeShown) return;
  state.restartNoticeShown = true;
  openModal({
    title: '需要重启程序',
    body: [
      el('p', {}, '页面文件已经更新，但后台服务还是旧版本，所以「事务」现在还不能保存。'),
      el('p', { class: 'muted tiny' }, '关掉这个窗口，重新双击「启动.bat」就好了；课程和任务不会丢。'),
    ],
    footer: [el('button', { type: 'button', class: 'btn primary', onclick: closeModal }, '知道了')],
  });
}

async function importAffairsFile(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    toast('文件不是合法的 JSON', 'error');
    return;
  }

  try {
    const result = await api('/api/affairs/import', { method: 'POST', body: JSON.stringify(payload) });
    await refresh();
    const parts = [`${result.added} 条事务`];
    if (result.categories) parts.push(`${result.categories} 个分类`);
    if (result.skipped) parts.push(`跳过 ${result.skipped} 条重复`);
    toast(`已导入${parts.join('、')}`);
  } catch (error) {
    if (error instanceof AuthError) return;
    toast(error.message, 'error');
  }
}

/* ── 提示 ─────────────────────────────────────────────────── */

let toastTimer = 0;

function toast(message, kind = 'ok') {
  const box = $('#toast');
  box.textContent = message;
  box.className = `toast${kind === 'error' ? ' error' : ''}`;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.hidden = true;
  }, 2400);
}

// 页面起不来时给一个能看懂、能自己修的提示，而不是白屏
function showBootError(error) {
  if (!document.body || $('#boot-error')) return;

  const detail = error && error.stack ? String(error.stack).split('\n').slice(0, 3).join('\n') : String(error || '未知错误');

  const box = el('div', { class: 'boot-error', id: 'boot-error' });
  box.append(
    el('strong', {}, '页面没能正常加载'),
    el(
      'p',
      {},
      '多半是更新过程序后，浏览器里还留着旧页面或旧脚本。先按 Ctrl+F5 强制刷新；还不行就关掉这个窗口，重新双击「启动.bat」。',
    ),
    el('p', { class: 'boot-error-detail' }, detail),
    el(
      'button',
      {
        type: 'button',
        class: 'btn primary small',
        onclick: () => location.reload(),
      },
      '重新加载',
    ),
  );

  document.body.append(box);
}

/* ── 主题 ─────────────────────────────────────────────────── */

function applyTheme(value) {
  document.documentElement.dataset.theme = value;
  localStorage.setItem('learning-hub-theme', value);
  const current = THEMES.find((t) => t.value === value) || THEMES[0];
  $('#theme-btn').textContent = current.icon;
  $('#theme-btn').title = `主题：${current.label}（点击切换）`;
}

function cycleTheme() {
  const current = document.documentElement.dataset.theme || 'auto';
  const index = THEMES.findIndex((t) => t.value === current);
  const next = THEMES[(index + 1) % THEMES.length];
  applyTheme(next.value);
  toast(`主题：${next.label}`);
}

/* ── 事件绑定 ─────────────────────────────────────────────── */

function bindEvents() {
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = $('#login-error');
    const button = $('#login-submit');
    errorBox.hidden = true;
    button.disabled = true;
    button.textContent = '进入中…';
    try {
      await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ password: $('#login-password').value }),
        skipAuthRedirect: true,
      });
      await enterApp();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      $('#login-password').select();
    } finally {
      button.disabled = false;
      button.textContent = '进入';
    }
  });

  $('#add-btn').addEventListener('click', () => openEditor(null));
  $('#task-btn').addEventListener('click', () => openTaskModal());
  $('#refresh-btn').addEventListener('click', refreshNow);

  $('#update-close').addEventListener('click', () => {
    $('#update-bar').hidden = true;
    const text = $('#update-text').textContent || '';
    const match = text.match(/有新版本\s+([\d.]+)/);
    if (match) sessionStorage.setItem('learning-hub-skip-update', match[1]);
  });

  // 从别的标签页/窗口切回来时自动拉一次，避免手动点
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if ($('#app-view').hidden) return;
    if (Date.now() - lastRefreshAt < 4000) return;
    refresh().catch(() => {});
  });
  $('#theme-btn').addEventListener('click', cycleTheme);

  let searchTimer = 0;
  $('#search').addEventListener('input', (event) => {
    const value = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setFilter({ q: value }), 120);
  });

  $('#platform-filter').addEventListener('change', (event) => setFilter({ platform: event.target.value }));
  $('#sort-select').addEventListener('change', (event) => setFilter({ sort: event.target.value }));

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'add') openEditor(null);
    else if (action.dataset.action === 'new-task') openTaskModal();
  });

  $('#view-switch').addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (button) setView(button.dataset.view);
  });

  $('#affairs-btn')?.addEventListener('click', () => setView('affairs'));

  /* 事务视图的控制条（旧页面里没有这些元素，跳过即可） */
  if ($('#affairs-view')) {
    $('#month-prev').addEventListener('click', () => {
      const month = state.affair.month;
      state.affair.month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
      renderAffairs();
    });
    $('#month-next').addEventListener('click', () => {
      const month = state.affair.month;
      state.affair.month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      renderAffairs();
    });
    $('#month-today').addEventListener('click', () => {
      state.affair.month = new Date();
      renderAffairs();
    });
    $('#affair-scope').addEventListener('click', (event) => {
      const button = event.target.closest('[data-scope]');
      if (!button) return;
      state.affair.scope = button.dataset.scope;
      renderAffairs();
    });
    $('#affair-view-switch').addEventListener('click', (event) => {
      const button = event.target.closest('[data-affair-view]');
      if (!button) return;
      state.affair.view = button.dataset.affairView;
      renderAffairs();
    });
    const openNewAffair = () => {
      if (state.needsRestart) {
        showRestartNotice();
        return;
      }
      openAffairEditor(null, todayKey());
    };
    $('#affair-add-btn').addEventListener('click', openNewAffair);
    $('#affair-empty-add').addEventListener('click', openNewAffair);
  }

  const menu = $('#menu');
  const menuButton = $('#menu-btn');

  const closeMenu = () => {
    menu.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
  };

  menuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (event) => {
    if (!menu.hidden && !event.target.closest('.menu-wrap')) closeMenu();
  });

  menu.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    closeMenu();

    if (action === 'settings') openSettings();
    else if (action === 'export') exportData();
    else if (action === 'import') $('#import-file').click();
    else if (action === 'import-affairs') $('#affair-import-file')?.click();
    else if (action === 'update') openUpdatePage();
    else if (action === 'logout') {
      try {
        await api('/api/logout', { method: 'POST' });
      } finally {
        showLogin();
      }
    }
  });

  $('#import-file').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) importFile(file);
    event.target.value = '';
  });

  const affairImportInput = $('#affair-import-file');
  if (affairImportInput) {
    affairImportInput.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) importAffairsFile(file);
      event.target.value = '';
    });
  }


  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalEl) {
      closeModal();
      return;
    }
    const tag = (event.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable;
    if (typing || modalEl) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === '/') {
      event.preventDefault();
      $('#search').focus();
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      openEditor(null);
    } else if (event.key.toLowerCase() === 't') {
      event.preventDefault();
      openTaskModal();
    } else if (event.key.toLowerCase() === 'a') {
      event.preventDefault();
      if (state.needsRestart) showRestartNotice();
      else openAffairEditor(null, todayKey());
    }
  });
}

function readCollectPayload() {
  const raw = new URLSearchParams(location.search).get('collect');
  if (!raw) return null;
  try {
    const json = decodeURIComponent(escape(atob(raw)));
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') return null;
    if (data.kind === 'remember') return data;
    if (!Array.isArray(data.tasks) && !data.progress) return null;
    return data;
  } catch {
    return null;
  }
}

function hostOfUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function cleanPageTitle(title) {
  const text = String(title || '')
    .split(/[-_|·—]/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 40);
}

function openRememberModal(payload) {
  const host = hostOfUrl(payload.url || '');
  const matched = state.courses.find((course) => course.url && hostOfUrl(course.url) === host);

  const urlInput = el('input', { type: 'text', maxlength: '600', value: payload.url || '', placeholder: 'https://…' });

  const kindSelect = el(
    'select',
    {},
    el('option', { value: 'course' }, '这门课的入口网址'),
    el('option', { value: 'task' }, '某条任务的网址'),
  );

  // 页面看起来像作业页时，默认选「任务」
  if (payload.looksLikeTask) kindSelect.value = 'task';

  const courseSelect = el(
    'select',
    {},
    ...state.courses.map((course) => el('option', { value: course.id }, course.name)),
    el('option', { value: '__new__' }, '＋ 新建课程'),
  );
  courseSelect.value = matched ? matched.id : '__new__';

  const nameInput = el('input', {
    type: 'text',
    maxlength: '80',
    value: cleanPageTitle(payload.title) || host || '',
    placeholder: '课程名',
  });
  const nameField = el('label', { class: 'field' }, el('span', {}, '新课程名'), nameInput);

  const taskSelect = el('select', {});
  const taskNameInput = el('input', {
    type: 'text',
    maxlength: '80',
    value: cleanPageTitle(payload.title) || '',
    placeholder: '任务名',
  });
  const taskField = el('label', { class: 'field' }, el('span', {}, '存到哪条任务'), taskSelect);
  const taskNameField = el('label', { class: 'field' }, el('span', {}, '新任务名'), taskNameInput);

  function fillTasks() {
    const course = state.courses.find((item) => item.id === courseSelect.value);
    const tasks = course?.deadlines || [];
    taskSelect.replaceChildren(
      el('option', { value: '__new_task' }, '＋ 新建任务'),
      ...tasks.map((task) => el('option', { value: task.id }, task.title)),
    );
    taskSelect.value = '__new_task';
  }

  function syncFields() {
    const isTask = kindSelect.value === 'task';
    const isNewCourse = courseSelect.value === '__new__';

    nameField.hidden = !isNewCourse;
    taskField.hidden = !isTask || isNewCourse;
    taskNameField.hidden = !isTask || (!isNewCourse && taskSelect.value !== '__new_task');
  }

  courseSelect.addEventListener('change', () => {
    fillTasks();
    syncFields();
  });
  taskSelect.addEventListener('change', syncFields);
  kindSelect.addEventListener('change', () => {
    fillTasks();
    syncFields();
  });

  fillTasks();
  syncFields();

  const saveButton = el('button', { type: 'submit', class: 'btn primary' }, '保存');

  const form = openModal({
    title: '记住这个网址',
    body: [
      el('p', { class: 'muted tiny' }, `来自 ${host || '当前页面'}${payload.title ? ` · ${payload.title.slice(0, 60)}` : ''}`),
      el('label', { class: 'field' }, el('span', {}, '网址'), urlInput),
      el(
        'label',
        { class: 'field' },
        el('span', {}, '存为'),
        kindSelect,
        el('small', { class: 'field-hint' }, '存成课程入口：点课程卡片时打开。存成任务网址：点这条任务时打开。'),
      ),
      el('label', { class: 'field' }, el('span', {}, '哪门课'), courseSelect),
      nameField,
      taskField,
      taskNameField,
    ],
    footer: [el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消'), saveButton],
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearModalError();

    const url = urlInput.value.trim();
    if (!url) {
      showModalError('网址不能为空');
      urlInput.focus();
      return;
    }

    const isTask = kindSelect.value === 'task';
    const isNewCourse = courseSelect.value === '__new__';

    saveButton.disabled = true;
    try {
      if (!isTask) {
        if (isNewCourse) {
          const name = nameInput.value.trim();
          if (!name) {
            showModalError('课程名不能为空');
            nameInput.focus();
            saveButton.disabled = false;
            return;
          }
          await api('/api/courses', {
            method: 'POST',
            body: JSON.stringify({ name, url, status: '进行中', progress: 0 }),
          });
          toast('已新建课程并记住网址');
        } else {
          await api(`/api/courses/${courseSelect.value}`, {
            method: 'PATCH',
            body: JSON.stringify({ url }),
          });
          toast('课程网址已更新');
        }
      } else {
        let courseId = courseSelect.value;
        let deadlines = [];

        if (isNewCourse) {
          const name = nameInput.value.trim() || cleanPageTitle(payload.title) || host;
          const created = await api('/api/courses', {
            method: 'POST',
            body: JSON.stringify({ name, url: '', status: '进行中', progress: 0 }),
          });
          courseId = created.course.id;
        } else {
          const course = state.courses.find((item) => item.id === courseId);
          deadlines = [...(course?.deadlines || [])];
        }

        if (isNewCourse || taskSelect.value === '__new_task') {
          const title = taskNameInput.value.trim() || cleanPageTitle(payload.title) || '新任务';
          deadlines.push({ title, due: '', url });
          toast('已新建任务并绑定这个网址');
        } else {
          deadlines = deadlines.map((item) => (item.id === taskSelect.value ? { ...item, url } : item));
          toast('任务网址已更新');
        }

        await api(`/api/courses/${courseId}`, {
          method: 'PATCH',
          body: JSON.stringify({ deadlines }),
        });
      }

      closeModal();
      await refresh();
      if (window.opener) setTimeout(() => window.close(), 600);
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
      saveButton.disabled = false;
    }
  });
}

function openCollectModal(payload) {
  if (payload.kind === 'remember') {
    openRememberModal(payload);
    return;
  }

  if (!state.courses.length) {
    toast('先添加一门课程，再收集任务', 'error');
    openEditor(null);
    return;
  }

  const host = hostOfUrl(payload.url || '');
  const matched = state.courses.find((course) => course.url && hostOfUrl(course.url) === host);

  const courseSelect = el(
    'select',
    {},
    ...state.courses.map((course) => el('option', { value: course.id }, course.name)),
  );
  if (matched) courseSelect.value = matched.id;

  const rows = [];
  const taskList = el('div', { class: 'scan-list' });

  for (const task of payload.tasks || []) {
    const checkbox = el('input', { type: 'checkbox', checked: true });
    rows.push({ checkbox, task });
    taskList.append(
      el(
        'label',
        { class: 'scan-row' },
        checkbox,
        el(
          'div',
          { class: 'scan-main' },
          el('div', { class: 'scan-title' }, task.title),
          el('div', { class: 'scan-due muted tiny' }, task.due ? fmtDue(task.due) : '没识别到时间'),
        ),
      ),
    );
  }

  const body = [
    el('p', { class: 'muted tiny' }, `来自 ${host || '当前页面'}${payload.title ? ` · ${payload.title.slice(0, 60)}` : ''}`),
    el('label', { class: 'field' }, el('span', {}, '存到哪门课'), courseSelect),
  ];

  const bindCheckbox = payload.url ? el('input', { type: 'checkbox', checked: true }) : null;
  if (bindCheckbox) {
    body.push(
      el(
        'label',
        { class: 'field checkbox-field' },
        el('span', { class: 'check' }, bindCheckbox, '每条任务都绑定到这个页面'),
        el('small', { class: 'field-hint' }, '以后点任务会直接打开这一页；不想绑可以不勾。'),
      ),
    );
  }

  if (rows.length) {
    body.push(el('div', { class: 'field' }, el('span', {}, `识别到 ${rows.length} 条任务`), taskList));
  }

  let progressCheckbox = null;
  if (payload.progress && Number.isFinite(payload.progress.percent)) {
    progressCheckbox = el('input', { type: 'checkbox', checked: true });
    body.push(
      el(
        'label',
        { class: 'field checkbox-field' },
        el('span', { class: 'check' }, progressCheckbox, `把进度更新为 ${payload.progress.percent}%`),
        el('small', { class: 'field-hint' }, `页面原文：「${(payload.progress.text || '').slice(0, 80)}」`),
      ),
    );
  }

  const saveButton = el('button', { type: 'submit', class: 'btn primary' }, '保存');
  const form = openModal({
    title: '从网页收集',
    body,
    footer: [el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消'), saveButton],
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const courseId = courseSelect.value;
    const chosen = rows.filter((row) => row.checkbox.checked).map((row) => row.task);

    saveButton.disabled = true;
    try {
      let added = 0;
      if (chosen.length) {
        const bindUrl = Boolean(bindCheckbox && bindCheckbox.checked && payload.url);
        const result = await api(`/api/courses/${courseId}/deadlines`, {
          method: 'POST',
          body: JSON.stringify({
            deadlines: chosen.map((t) => ({ title: t.title, due: t.due, url: bindUrl ? payload.url : '' })),
          }),
        });
        added = result.added;
      }
      if (progressCheckbox && progressCheckbox.checked) {
        await api(`/api/courses/${courseId}`, {
          method: 'PATCH',
          body: JSON.stringify({ progress: payload.progress.percent }),
        });
      }

      closeModal();
      await refresh();

      const parts = [];
      if (added) parts.push(`${added} 条任务`);
      if (progressCheckbox && progressCheckbox.checked) parts.push('进度');
      toast(parts.length ? `已保存：${parts.join('、')}` : '没有新的内容');

      if (window.opener) setTimeout(() => window.close(), 600);
    } catch (error) {
      if (error instanceof AuthError) return;
      showModalError(error.message);
      saveButton.disabled = false;
    }
  });
}

/* ── 启动 ─────────────────────────────────────────────────── */

async function boot() {
  try {
    applyTheme(localStorage.getItem('learning-hub-theme') || 'auto');
    bindEvents();
    pendingCollect = readCollectPayload();

    // 注册 Service Worker：浏览器才允许「安装成应用」
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* 装不上也不影响正常使用 */
      });
    }

    try {
      const session = await api('/api/session', { skipAuthRedirect: true });
      if (session.version) state.version = session.version;
      if (session.authenticated) await enterApp();
      else showLogin();
    } catch {
      showLogin();
    }
  } catch (error) {
    console.error(error);
    showBootError(error);
  }
}

boot();
