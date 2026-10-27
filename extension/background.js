'use strict';

// 后台：负责和本地学习中心通信。
// 有 host_permissions，所以这里可以检查服务是否开着，再把确认页打开。

const HUB_URL = 'http://127.0.0.1:4173/';

async function isHubRunning() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${HUB_URL}api/session`, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
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
    if (!alive) {
      sendResponse({ ok: false, error: 'offline' });
      return;
    }

    const url = `${HUB_URL}?collect=${encodeURIComponent(encodePayload(message.payload))}`;
    try {
      await chrome.tabs.create({ url, active: true });
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  })();

  return true; // 保持消息通道，等异步结果
});
