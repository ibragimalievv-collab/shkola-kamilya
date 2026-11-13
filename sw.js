// РАБОТА БЕЗ ИНТЕРНЕТА. При первом открытии приложение целиком сохраняется на устройстве,
// после этого всё берётся из сохранённой копии. Приложение ни к каким чужим адресам не обращается.

// При любом изменении файлов приложения увеличьте номер версии — устройства скачают обновление.
const VERSION = 'shkola-kamilya-4';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/art.js', 'js/audio.js', 'js/canvas.js', 'js/curriculum.js', 'js/cursive.js', 'js/data.js', 'js/db.js',
  'js/mechanics.js', 'js/parent.js', 'js/pen.js', 'js/store.js', 'js/tasks.js', 'js/util.js', 'js/voice.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // Удаляем сохранённые копии прошлых версий.
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Сначала ищем в сохранённой копии; в сеть идём, только если файла там нет.
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).catch(() => caches.match('index.html'))));
});
