// РАБОТА БЕЗ ИНТЕРНЕТА. При первом открытии приложение целиком сохраняется на устройстве,
// после этого всё берётся из сохранённой копии. Приложение ни к каким чужим адресам не обращается.

// При любом изменении файлов приложения увеличьте номер версии — устройства скачают обновление.
const VERSION = 'shkola-kamilya-39';
const FILES = [
  './', 'index.html', 'privacy.html', 'install.html', 'manifest.webmanifest', 'css/style.css', 'css/install.css',
  'qr.html', 'css/qr.css', 'js/progress.js', 'js/progress-receive.js', 'js/qr.js', 'js/vendor/qrcode.mjs', 'js/vendor/qrcode-license.txt',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/album.js', 'js/art.js', 'js/audio.js', 'js/canvas.js', 'js/counter.js', 'js/crafts.js', 'js/curriculum.js', 'js/cursive.js', 'js/data.js', 'js/db.js',
  'js/books.js', 'js/extra.js', 'js/fun.js', 'js/mail.js', 'js/mechanics.js', 'js/parent.js', 'js/parent2.js', 'js/pen.js', 'js/phrases.js', 'js/photo.js', 'js/pictures.js', 'js/review.js', 'js/speech.js', 'js/store.js', 'js/stories.js', 'js/tasks.js', 'js/things.js', 'js/util.js', 'js/voice.js',
  'js/artwork.js', 'js/paint-game.js', 'js/assembly.js', 'js/relief.js', 'js/record.js', 'js/adult.js', 'js/transfer.js', 'js/pair.js', 'js/transfer-screen.js',
  'artwork/lighthouse-puppies.jpg', 'artwork/turtle-octopus.jpg', 'artwork/spider-rescuer.jpg', 'artwork/night-glider.jpg',
  'artwork/cats-and-race-car.jpg', 'artwork/winter-capybara.jpg', 'artwork/sea-sponge.jpg', 'artwork/moon-music.jpg',
  'mobile/Shkola_Kamilya_Android.yaml',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
// Записи голоса большие, поэтому лежат отдельно и при обновлении приложения заново не скачиваются.
const AUDIO = 'shkola-audio';

self.addEventListener('activate', e => {
  // Удаляем сохранённые копии прошлых версий (записи голоса не трогаем).
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && /^shkola-kamilya-\d+$/.test(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  const here = self.location?.origin;
  if (here && !url.startsWith(here)) return; // чужой адрес (счётчик владельца) не трогаем и не сохраняем
  if (url.includes('/audio/')) {
    // Список наборов: сначала свежий из сети, без сети — сохранённый. Сами наборы: сохранённый, иначе скачиваем и сохраняем.
    const keep = async res => {
      if (res.ok) {
        try { const cache = await caches.open(AUDIO); await cache.put(e.request, res.clone()); }
        catch { /* при нехватке места отдаём уже полученную запись */ }
      }
      return res;
    };
    e.respondWith(url.endsWith('manifest.json')
      ? fetch(e.request).then(res => res.ok ? keep(res) : Promise.reject()).catch(async () =>
          (await caches.match(e.request, { cacheName: AUDIO })) || new Response(null, { status: 503 }))
      : caches.match(e.request, { cacheName: AUDIO }).then(hit => hit || fetch(e.request).then(keep)));
    return;
  }
  // Сначала ищем в сохранённой копии; в сеть идём, только если файла там нет.
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).catch(() => caches.match('index.html'))));
});
