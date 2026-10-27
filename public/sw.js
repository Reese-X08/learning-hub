'use strict';

// 最小可用的 Service Worker：只为让浏览器允许「安装成应用」，并提供一个离线兜底。
// 策略是「网络优先，失败才用缓存」，所以正常联网时不会拿到旧版本文件。

const VERSION = '2.5.1';
const CACHE = `learning-hub-${VERSION}`;
const PRECACHE = [
  '/',
  `/styles.css?v=${VERSION}`,
  `/app.js?v=${VERSION}`,
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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
