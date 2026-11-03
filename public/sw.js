'use strict';

// 最小可用的 Service Worker：只为让浏览器允许「安装成应用」，并提供一个离线兜底。
// 策略是「网络优先，失败才用缓存」，所以正常联网时不会拿到旧版本文件。

const VERSION = '2.9.0';
const CACHE = `learning-hub-${VERSION}`;
const PRECACHE = [
  '/',
  `/styles.css?v=${VERSION}`,
  `/app.js?v=${VERSION}`,
  '/code-lab.css',
  '/code-lab.js',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// 点开「有新版本」的系统通知时，把已经打开的应用窗口叫到前面
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        try {
          if (new URL(client.url).origin !== self.location.origin) continue;
          await client.focus();
          client.postMessage({ type: 'update-notification-click' });
          return;
        } catch {
          /* 这个窗口已经关掉了，看下一个 */
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
