'use strict';

// 内容脚本：在平台页面右下角放一个浮动按钮。
// 点一下 → 从当前页提取「作业 + 截止时间」和「学习进度」→ 交给后台打开确认页。
//
// 提取逻辑和 public/app.js 里的书签版本是同一套，改动时两边要同步。

(function () {
  if (window.__hubCollectorMounted) return;
  window.__hubCollectorMounted = true;

  /* ── 提取任务 ─────────────────────────────────────────── */

  function extractTasks() {
    const KEY = /(截止|截至|deadline|ddl|结束时间|提交时间|剩余时间)/i;
    const TASK = /(作业|测验|考试|测试|讨论|问卷|任务|实验|报告|论文|互评|练习)/;
    const DATE_FULL = /(\d{4})\s*[-\/年.]\s*(\d{1,2})\s*[-\/月.]\s*(\d{1,2})\s*日?/;
    const DATE_SHORT = /(\d{1,2})\s*[-\/月.]\s*(\d{1,2})\s*日?/;
    const TIME = /(\d{1,2})\s*[:：]\s*(\d{2})/;
    const NOT_A_TITLE = /^(时间|截止|截止时间|剩余时间|状态|操作|查看|详情|更多|编辑|删除|提交|附件|成绩|评分|进行中|已完成|未开始)$/;

    const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();

    const iso = (year, month, day, hour, minute) => {
      const date = new Date(year, month - 1, day, hour == null ? 23 : hour, minute == null ? 59 : minute, 0, 0);
      if (Number.isNaN(date.getTime())) return '';
      if (date.getFullYear() < 2000 || date.getFullYear() > 2100) return '';
      return date.toISOString();
    };

    const parseDue = (text) => {
      // 一个单元格里通常同时有「发布时间」和「截止时间」两个日期。
      // 给每个日期打分：前面是「截止/提交」加分，是「发布/创建」减分，
      // 取分最高的那个，避免把发布时间当成截止时间。
      const DEADLINE_WORD = /(截止|截至|deadline|ddl|到期|结束|提交(时间|截止)?|最后)/i;
      const PUBLISH_WORD = /(发布|开始时间|创建|上线|开课|更新于|开课时间)/i;

      const candidates = [];

      const collect = (regex, withYear) => {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
          const before = text.slice(Math.max(0, match.index - 16), match.index);
          const after = text.slice(match.index);

          let due;
          if (withYear) {
            const time = after.match(TIME);
            due = iso(+match[1], +match[2], +match[3], time ? +time[1] : 23, time ? +time[2] : 59);
          } else {
            const time = after.match(TIME);
            due = iso(new Date().getFullYear(), +match[1], +match[2], time ? +time[1] : 23, time ? +time[2] : 59);
          }
          if (!due) continue;

          let score = 0;
          if (DEADLINE_WORD.test(before)) score += 10;
          if (PUBLISH_WORD.test(before)) score -= 10;
          if (DEADLINE_WORD.test(after.slice(0, 24))) score += 6;

          candidates.push({ due, score, index: match.index });
        }
      };

      collect(new RegExp(DATE_FULL.source, 'g'), true);
      if (!candidates.length) collect(new RegExp(DATE_SHORT.source, 'g'), false);
      if (!candidates.length) return '';

      candidates.sort((a, b) => b.score - a.score || a.index - b.index);
      // 只有发布时间、找不到任何截止线索时，宁可不给日期
      if (candidates[0].score <= -10) return '';
      return candidates[0].due;
    };

    const results = [];
    const seen = new Set();

    const push = (title, due, context) => {
      let text = clean(title).replace(/[（(]?\s*(已截止|未开始|进行中|已完成)\s*[)）]?$/g, '').trim();
      text = text.replace(/^(作业|测验|考试)\s*[:：]\s*/, '$1 ').trim();
      if (text.length < 3 || text.length > 90) return;
      if (NOT_A_TITLE.test(text)) return;

      const scope = `${text} ${clean(context)}`;
      if (!TASK.test(scope) && !KEY.test(scope)) return;

      const key = `${text}|${due}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({ title: text, due });
    };

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (results.length >= 40) break;

      const text = clean(el.textContent);
      if (!text || text.length > 160) continue;
      if (el.querySelectorAll('tr').length > 1) continue;
      if (el.querySelectorAll('a[href]').length > 2) continue;

      const hasKey = KEY.test(text);
      const hasDate = DATE_FULL.test(text) || DATE_SHORT.test(text);
      if (!hasKey && !(TASK.test(text) && hasDate)) continue;

      const link = el.querySelector('a[href]');
      let title = '';

      if (link) {
        title = clean(link.textContent);
      } else if (el.tagName && el.tagName.toUpperCase() === 'TR') {
        const cell = el.querySelector('td, th');
        if (cell) title = clean(cell.textContent);
      }

      if (!title) {
        const inner = typeof el.innerText === 'string' ? el.innerText : text;
        const firstLine = clean(inner.split(/\n/).find((line) => clean(line)) || '');
        title = firstLine
          .replace(DATE_FULL, ' ')
          .replace(DATE_SHORT, ' ')
          .replace(/\d{1,2}\s*[:：]\s*\d{2}/g, ' ')
          .replace(KEY, ' ')
          .replace(/[·|,，:：]\s*$/, '')
          .trim();
      }

      if (!title || title.length > 90) continue;
      push(title, parseDue(text), text);
    }

    if (!results.length) {
      for (const link of Array.from(document.querySelectorAll('a[href]')).slice(0, 200)) {
        const title = clean(link.textContent);
        if (title.length < 2 || title.length > 90) continue;
        const box = link.closest('li, tr, div');
        const due = box ? parseDue(clean(box.textContent).slice(0, 200)) : '';
        if (due) push(title, due, box ? box.textContent : title);
        if (results.length >= 20) break;
      }
    }

    return results;
  }

  /* ── 提取进度 ─────────────────────────────────────────── */

  function extractProgress() {
    if (!document.body) return [];

    const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();

    const PATTERNS = [
      { score: 12, re: /(?:学习)?进度[^%\d]{0,8}(\d{1,3})\s*%/i },
      { score: 11, re: /完成度[^%\d]{0,8}(\d{1,3})\s*%/i },
      { score: 10, re: /已(?:完成|学完|观看)[^%\d]{0,8}(\d{1,3})\s*%/i },
      { score: 9, re: /(\d{1,3})\s*%[^。；\n]{0,8}(?:完成|进度|已学)/i },
      { score: 8, re: /(\d{1,3})\s*\/\s*(\d{1,3})\s*(?:讲|节|章|集|个视频|课时)/i },
      { score: 3, re: /(\d{1,3})\s*%/i },
    ];

    const candidates = [];
    const seen = new Set();

    const push = (percent, score, evidence) => {
      const value = Math.round(Number(percent));
      if (!Number.isFinite(value) || value < 0 || value > 100) return;
      const key = String(value);
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ percent: value, score, text: evidence.slice(0, 120) });
    };

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (el.children.length > 3) continue;
      const text = clean(el.textContent);
      if (!text || text.length > 160) continue;
      if (!text.includes('%') && !/\d\s*\/\s*\d/.test(text)) continue;

      for (const pattern of PATTERNS) {
        const match = text.match(pattern.re);
        if (!match) continue;

        let percent;
        if (match.length > 2 && match[2] !== undefined) {
          const part = Number(match[1]);
          const total = Number(match[2]);
          if (!total) continue;
          percent = (part / total) * 100;
        } else {
          percent = Number(match[1]);
        }

        push(percent, pattern.score, text);
        break;
      }
    }

    candidates.sort((a, b) => b.score - a.score || a.text.length - b.text.length);
    return candidates.slice(0, 5).map((c) => ({ percent: c.percent, text: c.text }));
  }

  /* ── 浮动按钮（可拖动） ───────────────────────────────── */

  const POS_KEY = 'hub:position';
  const host = document.createElement('div');
  host.setAttribute('data-hub-collector', '');
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }
    .wrap.dragging { cursor: grabbing; }
    button {
      all: unset;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 9px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      line-height: 1;
      text-align: center;
      white-space: nowrap;
      cursor: inherit;
      opacity: 0.62;
      transition: opacity 0.15s ease;
    }
    .wrap:hover button { opacity: 1; }
    .primary {
      background: #4f63ff;
      color: #fff;
      box-shadow: 0 6px 20px rgba(79, 99, 255, 0.35);
    }
    .secondary {
      background: #fff;
      color: #4f63ff;
      border: 1px solid rgba(79, 99, 255, 0.38);
      box-shadow: 0 4px 14px rgba(20, 24, 36, 0.12);
    }
    button[disabled] { opacity: 0.4; }
    .dot {
      display: none;
      width: 34px;
      height: 34px;
      padding: 0;
      border-radius: 50%;
      background: #4f63ff;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      box-shadow: 0 6px 20px rgba(79, 99, 255, 0.35);
      opacity: 0.5;
    }
    .wrap.compact .dot { display: inline-flex; }
    .wrap.compact .primary,
    .wrap.compact .secondary,
    .wrap.compact .toast { display: none; }
    .wrap:hover .dot { opacity: 1; }
    .toast {
      max-width: 230px;
      padding: 7px 11px;
      border-radius: 8px;
      background: rgba(20, 24, 36, 0.92);
      color: #fff;
      font-size: 12px;
      line-height: 1.5;
      text-align: left;
      white-space: normal;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 0.18s ease, transform 0.18s ease;
      pointer-events: none;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
  `;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const toast = document.createElement('div');
  toast.className = 'toast';

  const dotButton = document.createElement('button');
  dotButton.type = 'button';
  dotButton.className = 'dot';
  dotButton.title = '学习中心：点一下展开 / 拖动可移动';
  dotButton.textContent = '书';

  const collectButton = document.createElement('button');
  collectButton.type = 'button';
  collectButton.className = 'primary';
  collectButton.textContent = '收进学习中心';

  const rememberButton = document.createElement('button');
  rememberButton.type = 'button';
  rememberButton.className = 'secondary';
  rememberButton.textContent = '记住此页';

  wrap.append(toast, dotButton, collectButton, rememberButton);
  shadow.append(style, wrap);
  document.documentElement.append(host);

  dotButton.addEventListener('click', () => wrap.classList.remove('compact'));

  // 认识的平台（含所有 *.edu.cn 学校平台）直接展开；
  // 其它网站先收成一个圆点，不挡内容，点一下再展开。
  const KNOWN_HOSTS = [
    'yuketang.cn',
    'zhihuishu.com',
    'icourse163.org',
    'chaoxing.com',
    'xuetangx.com',
    'icve.com.cn',
    'educoder.net',
    'pintia.cn',
    'lanqiao.cn',
    'bilibili.com',
    'youtube.com',
  ];

  function isKnownHost(hostname) {
    const name = String(hostname || '').toLowerCase();
    if (!name) return false;
    if (name === 'edu.cn' || name.endsWith('.edu.cn')) return true;
    return KNOWN_HOSTS.some((domain) => name === domain || name.endsWith(`.${domain}`));
  }

  if (!isKnownHost(location.hostname)) wrap.classList.add('compact');

  let toastTimer = 0;
  const say = (text) => {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  };

  /* 位置：拖动后记住，下次打开还在原地 */

  let current = null;

  function applyPosition(left, top) {
    const width = host.offsetWidth || 130;
    const height = host.offsetHeight || 80;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    const x = Math.min(Math.max(8, Math.round(left)), maxLeft);
    const y = Math.min(Math.max(8, Math.round(top)), maxTop);

    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    current = { x, y };
    return current;
  }

  function savePosition() {
    try {
      if (current && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [POS_KEY]: current });
      }
    } catch {
      /* 存不下就算了 */
    }
  }

  try {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(POS_KEY, (data) => {
        const pos = data && data[POS_KEY];
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) applyPosition(pos.x, pos.y);
      });
    }
  } catch {
    /* 忽略 */
  }

  window.addEventListener('resize', () => {
    if (current) applyPosition(current.x, current.y);
  });

  /* 拖动：按下后移动超过 5px 视为拖动。
     注意不能用 setPointerCapture：它会把后续的 click 重定向到外层容器，
     按钮就再也收不到点击了。这里改成在 window 上监听移动，拖动结束后
     再在捕获阶段拦掉这一次 click。 */

  let drag = null;
  let suppressClick = false;

  function onMove(event) {
    if (!drag) return;
    if (drag.id !== undefined && event.pointerId !== undefined && event.pointerId !== drag.id) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;

    if (!drag.moved) {
      drag.moved = true;
      wrap.classList.add('dragging');
    }
    applyPosition(drag.left + dx, drag.top + dy);
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);

    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    wrap.classList.remove('dragging');

    if (moved) {
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 0);
      savePosition();
    }
  }

  host.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  });

  // 拖动之后的那一次 click 不要传下去
  host.addEventListener(
    'click',
    (event) => {
      if (!suppressClick) return;
      event.stopPropagation();
      event.preventDefault();
    },
    true,
  );

  /* 收进学习中心 */

  collectButton.addEventListener('click', async () => {
    collectButton.disabled = true;
    try {
      let tasks = [];
      let progress = null;
      try {
        tasks = extractTasks() || [];
      } catch {
        tasks = [];
      }
      try {
        progress = (extractProgress() || [])[0] || null;
      } catch {
        progress = null;
      }

      if (!tasks.length && !progress) {
        say('这个页面上没找到作业或进度。先切到作业列表 / 学习进度页再点一次。');
        return;
      }

      const payload = {
        kind: 'collect',
        v: 1,
        url: location.href,
        title: document.title,
        host: location.hostname,
        tasks: tasks.slice(0, 30),
        progress,
      };

      const result = await chrome.runtime.sendMessage({ type: 'hub:collect', payload });

      if (result && result.ok) {
        say(`已发送 ${tasks.length} 条任务${progress ? ' + 进度' : ''}`);
      } else if (result && result.error === 'offline') {
        say('学习中心没开着。先双击「启动.bat」，再点一次。');
      } else {
        say('发送失败，看看学习中心是否在运行。');
      }
    } catch (error) {
      say('出错了：' + String(error && error.message ? error.message : error));
    } finally {
      collectButton.disabled = false;
    }
  });

  /* 记住此页 */

  rememberButton.addEventListener('click', async () => {
    rememberButton.disabled = true;
    try {
      const payload = {
        kind: 'remember',
        v: 1,
        url: location.href,
        title: document.title,
        host: location.hostname,
      };

      const result = await chrome.runtime.sendMessage({ type: 'hub:collect', payload });

      if (result && result.ok) {
        say('已发送，在学习中心里确认保存');
      } else if (result && result.error === 'offline') {
        say('学习中心没开着。先双击「启动.bat」，再点一次。');
      } else {
        say('发送失败，看看学习中心是否在运行。');
      }
    } catch (error) {
      say('出错了：' + String(error && error.message ? error.message : error));
    } finally {
      rememberButton.disabled = false;
    }
  });
})();
