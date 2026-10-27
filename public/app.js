'use strict';

/* ─────────────────────────────────────────────────────────────
   学习中心 · 前端
   ───────────────────────────────────────────────────────────── */

const $ = (selector, root = document) => root.querySelector(selector);

const PALETTE = ['#4f63ff', '#12b3a8', '#8b5cf6', '#f59e0b', '#0ea5e9', '#f43f5e', '#22c55e', '#ec4899'];
const STATUSES = ['未开始', '进行中', '已完成', '暂停'];
const THEMES = [
  { value: 'auto', icon: '◐', label: '跟随系统' },
  { value: 'light', icon: '☀', label: '浅色' },
  { value: 'dark', icon: '☾', label: '深色' },
];
const DAY = 86400000;

const state = {
  settings: { title: '学习中心', subtitle: '', semester: '' },
  courses: [],
  filter: { q: '', status: 'all', platform: 'all', sort: 'updated' },
  view: 'courses',
  taskFilter: 'open',
  version: '',
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

  // 没开密码时，"退出登录"没有意义
  const logoutButton = document.querySelector('[data-action="logout"]');
  if (logoutButton) logoutButton.hidden = state.settings.requirePassword === false;
}

function renderView() {
  const isTasks = state.view === 'tasks';
  $('#course-view').hidden = isTasks;
  $('#task-view').hidden = !isTasks;

  for (const button of document.querySelectorAll('#view-switch .seg')) {
    const active = button.dataset.view === state.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
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
  state.settings = { ...state.settings, ...(data.settings || {}) };
  state.courses = data.courses || [];
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
  const url = state.settings.updateUrl;
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

let lastRefreshAt = 0;

async function refresh() {
  const data = await api('/api/data');
  state.settings = { ...state.settings, ...(data.settings || {}) };
  state.courses = data.courses || [];
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

function openTaskModal(presetCourseId) {
  if (!state.courses.length) {
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
  toast('已开始下载备份');
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
    toast(`已导入 ${result.count} 门课程`);
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
    if (!button) return;
    state.view = button.dataset.view;
    renderView();
    if (state.view === 'tasks') renderTaskView();
    else renderGrid();
  });

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


  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalEl) {
      closeModal();
      return;
    }
    const tag = (event.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable;
    if (typing || modalEl) return;

    if (event.key === '/') {
      event.preventDefault();
      $('#search').focus();
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      openEditor(null);
    } else if (event.key.toLowerCase() === 't') {
      event.preventDefault();
      openTaskModal();
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

  const urlInput = el('input', { type: 'text', value: payload.url || '', placeholder: 'https://…' });
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

  const syncNameField = () => {
    nameField.hidden = courseSelect.value !== '__new__';
  };
  courseSelect.addEventListener('change', syncNameField);
  syncNameField();

  const saveButton = el('button', { type: 'submit', class: 'btn primary' }, '保存');

  const form = openModal({
    title: '记住这个网址',
    body: [
      el('p', { class: 'muted tiny' }, `来自 ${host || '当前页面'}${payload.title ? ` · ${payload.title.slice(0, 60)}` : ''}`),
      el('label', { class: 'field' }, el('span', {}, '网址'), urlInput),
      el('label', { class: 'field' }, el('span', {}, '存为'), courseSelect),
      nameField,
    ],
    footer: [el('button', { type: 'button', class: 'btn ghost', onclick: closeModal }, '取消'), saveButton],
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = urlInput.value.trim();
    if (!url) {
      showModalError('网址不能为空');
      urlInput.focus();
      return;
    }

    saveButton.disabled = true;
    try {
      if (courseSelect.value === '__new__') {
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
        toast('网址已更新');
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
        const result = await api(`/api/courses/${courseId}/deadlines`, {
          method: 'POST',
          body: JSON.stringify({ deadlines: chosen.map((t) => ({ title: t.title, due: t.due })) }),
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
}

boot();
