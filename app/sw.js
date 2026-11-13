// РАБОТА БЕЗ ИНТЕРНЕТА. При первом открытии приложение целиком сохраняется на устройстве,
// после этого всё берётся из сохранённой копии. Приложение ни к каким чужим адресам не обращается.

// При любом изменении файлов приложения увеличьте номер версии — устройства скачают обновление.
const VERSION = 'shkola-kamilya-16';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/art.js', 'js/audio.js', 'js/canvas.js', 'js/curriculum.js', 'js/cursive.js', 'js/data.js', 'js/db.js',
  'js/books.js', 'js/fun.js', 'js/mechanics.js', 'js/parent.js', 'js/parent2.js', 'js/pen.js', 'js/phrases.js', 'js/review.js', 'js/speech.js', 'js/store.js', 'js/stories.js', 'js/tasks.js', 'js/things.js', 'js/util.js', 'js/voice.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
// Записи голоса большие, поэтому лежат отдельно и при обновлении приложения заново не скачиваются.
const AUDIO = 'shkola-audio';

self.addEventListener('activate', e => {
  // Удаляем сохранённые копии прошлых версий (записи голоса не трогаем).
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== AUDIO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (url.includes('/audio/')) {
    // Список наборов: сначала свежий из сети, без сети — сохранённый. Сами наборы: сохранённый, иначе скачиваем и сохраняем.
    const keep = res => { if (res.ok) { const copy = res.clone(); caches.open(AUDIO).then(c => c.put(e.request, copy)); } return res; };
    e.respondWith(url.endsWith('manifest.json')
      ? fetch(e.request).then(keep).catch(() => caches.match(e.request))
      : caches.match(e.request).then(hit => hit || fetch(e.request).then(keep)));
    return;
  }
  // Сначала ищем в сохранённой копии; в сеть идём, только если файла там нет.
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).catch(() => caches.match('index.html'))));
});
