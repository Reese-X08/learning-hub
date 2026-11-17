'use strict';

// 后台：负责和本地学习中心通信。
// 有 host_permissions，所以这里可以检查服务是否开着，再把确认页打开。
//
// 2026-11-17 改：探测结果现在只用来决定提示文案，**不再拦截**。
// 之前是探测失败就直接回 offline，于是只要 fetch 被别的东西挡一下
// （扩展的站点权限被收走 / Local Network Access / 代理 / 冷启动超时），
// 插件就永远显示「学习中心没开着」，哪怕服务明明在跑。
// 现在探测失败也照样打开确认页——真的没开时，浏览器自己会显示连不上。

const HUB_URL = 'http://127.0.0.1:4173/';

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, cache: 'no-store', signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

// 只要服务器有响应就算「开着」：200、401、404 都行，那说明进程活着。
async function isHubRunning() {
  try {
    // 正常请求：能看到状态码，也能确认是不是我们的服务
    await fetchWithTimeout(`${HUB_URL}api/session`, {}, 1800);
    return true;
  } catch (error) {
    // 可能是 host 权限被收走、CORS 或代理拦了；换个不透明请求再探一次
    console.warn('[学习中心] 普通探活失败，改用 no-cors 再试一次：', error && error.name);
  }

  try {
    // no-cors：只看「连不连得上」，不受 CORS / 权限影响
    await fetchWithTimeout(`${HUB_URL}api/session`, { mode: 'no-cors' }, 1800);
    return true;
  } catch (error) {
    // 探活失败也不阻止打开确认页，只记一笔方便排查
    console.warn('[学习中心] no-cors 探活也失败，仍然会打开确认页：', error && error.name);
    return false;
  }
}

function encodePayload(payload) {
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json)));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'hub:collect' || !message.payload) return false;

  (async () => {
    const alive = await isHubRunning();
    const url = `${HUB_URL}?collect=${encodeURIComponent(encodePayload(message.payload))}`;

    // 不管探测结果如何都打开；探测失败最多是服务真的没开，
    // 那时浏览器会跳自己的「无法访问此网站」，比误报「没开着」清楚。
    try {
      await chrome.tabs.create({ url, active: true });
      sendResponse({ ok: true, alive });
    } catch (error) {
      sendResponse({ ok: false, alive, error: String((error && error.message) || error) });
    }
  })();

  return true; // 保持消息通道，等异步结果
});
