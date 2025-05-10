/*
Скрипт service worker для кэширования ресурсов Car Controller.
Обеспечивает установку веб-приложения.
*/

const CACHE_NAME = 'car-controller-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './controller.js',
    './config.js',
    './foundation.js',
    './favicon.ico',
    './icon-192.png',
    './icon-512.png'
  ];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});