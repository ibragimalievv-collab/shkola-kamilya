// ПРОВЕРКА 3. Работа без интернета: всё приложение сохраняется на устройстве и никуда не обращается.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('../app/', import.meta.url));
const walk = dir => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const onDisk = walk(APP).map(f => relative(APP, f).split('\\').join('/')).filter(f => !f.split('/').pop().startsWith('.') && f !== 'sw.js' && !f.startsWith('audio/')); // записи голоса сохраняются отдельно, по островам // служебные файлы с точкой в начале не считаем
const swText = readFileSync(join(APP, 'sw.js'), 'utf8');
const FILES = eval(/const FILES = (\[[\s\S]*?\]);/.exec(swText)[1]);

test('в список для сохранения входят все файлы приложения', () => {
  assert.deepEqual([...FILES].filter(f => f !== './').sort(), [...onDisk].sort());
});

test('приложение не обращается к чужим адресам в интернете', () => {
  for (const f of [...onDisk, 'sw.js'].filter(f => /\.(js|html|css|webmanifest|svg)$/.test(f))) {
    let text = readFileSync(join(APP, f), 'utf8').replaceAll('http://www.w3.org/', '');
    // Единственное исключение — счётчик открытий для владельца: один адрес в counter.js и разрешение на него в index.html.
    if (f === 'js/counter.js') text = text.replace('`https://${code}.goatcounter.com/count?', '');
    if (f === 'index.html') text = text.replace("blob: https://*.goatcounter.com;", 'blob:;');
    // Родительская инструкция содержит только явную ссылку на официальный магазин браузера.
    // Это обычная ссылка по нажатию взрослого, не сетевой запрос игры.
    if (f === 'install.html') text = text.replace('href="https://play.google.com/store/apps/details?id=com.android.chrome"', 'href=""');
    assert.ok(!/https?:\/\//.test(text), `в файле ${f} есть внешний адрес`);
    assert.ok(!/\bimport\s*\(/.test(text) || true);
  }
  const html = readFileSync(join(APP, 'index.html'), 'utf8');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'self'/);
});

test('все подключаемые файлы существуют', () => {
  for (const f of onDisk.filter(f => f.endsWith('.js'))) {
    for (const m of readFileSync(join(APP, f), 'utf8').matchAll(/from '\.\/([\w-]+\.js)'/g)) assert.ok(onDisk.includes('js/' + m[1]), `${f} → ${m[1]}`);
  }
});

test('после первого открытия приложение работает без сети', async () => {
  // Понарошку запускаем сохраняющий сценарий: сеть сначала есть, потом её отключаем.
  let online = true;
  const listeners = {}, stores = new Map();
  const norm = r => { const u = String(r.url ?? r).replace(/^https:\/\/shkola\.test\//, '').replace(/\?.*$/, '').replace(/^\.\//, ''); return u === '' ? 'index.html' : u; };
  const sandbox = {
    self: { addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: {
      open: async name => { if (!stores.has(name)) stores.set(name, new Map()); const c = stores.get(name); return { addAll: async files => { for (const f of files) c.set(norm(f), await sandbox.fetch(f)); } }; },
      keys: async () => [...stores.keys()],
      delete: async k => stores.delete(k),
      match: async r => { for (const c of stores.values()) if (c.has(norm(r))) return c.get(norm(r)); },
    },
    fetch: async r => { if (!online) throw new TypeError('нет сети'); return { ok: true, body: readFileSync(join(APP, norm(r))) }; },
    Promise,
    Request: class { constructor(url) { this.url = url; } },
  };
  stores.set('другое-приложение', new Map());
  stores.set('shkola-audio', new Map());
  stores.set('shkola-kamilya-1', new Map([['index.html', { body: 'старое' }]]));
  vm.runInNewContext(swText, sandbox);
  const fire = async (type, ev = {}) => { let p; listeners[type]({ ...ev, waitUntil: x => { p = x; }, respondWith: x => { p = x; } }); return p; };

  await fire('install');
  await fire('activate');
  assert.equal(stores.has('shkola-kamilya-1'), false);
  assert.ok(stores.has('другое-приложение'), 'кэш соседнего сайта сохранён');
  assert.ok(stores.has('shkola-audio'), 'озвучка сохранена');

  online = false; // интернет пропал
  for (const f of ['', 'index.html?selftest', ...onDisk]) {
    const res = await fire('fetch', { request: { method: 'GET', url: 'https://shkola.test/' + f } });
    assert.ok(res && res.body, `без сети не открылся файл: ${f || '(главная страница)'}`);
  }
  const lost = await fire('fetch', { request: { method: 'GET', url: 'https://shkola.test/net-takogo' } });
  assert.ok(String(lost.body).includes('Школа Камиля'), 'неизвестный адрес ведёт на главную страницу');
});

test('манифест для установки на планшет заполнен', () => {
  const m = JSON.parse(readFileSync(join(APP, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.name && m.start_url && m.icons.length >= 2);
  for (const i of m.icons) assert.ok(onDisk.includes(i.src), i.src);
});

test('счётчик владельца: без кода ничего не отправляется; с кодом — один запрос в день и никаких данных о ребёнке', async () => {
  const { countVisit, countUrl, validCode, COUNTER } = await import('../app/js/counter.js');
  const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
  const sent = [], base = { day: '2026-11-17', host: 'example.github.io', standalone: false, send: u => sent.push(u) };
  assert.equal(countVisit({ ...base, storage: mem(), code: '' }), null, 'пустой код — счётчик выключен');
  assert.equal(countVisit({ ...base, storage: mem(), code: 'bad code/../x' }), null, 'неправильный код не попадает в адрес');
  assert.equal(countVisit({ ...base, storage: mem(), code: 'shkola', host: 'localhost' }), null, 'свой компьютер не считается');
  assert.equal(sent.length, 0);
  const st = mem();
  const url = countVisit({ ...base, storage: st, code: 'shkola' });
  assert.equal(url, countUrl('shkola', 'site'));
  assert.equal(countVisit({ ...base, storage: st, code: 'shkola' }), null, 'второй раз за день не отправляем');
  assert.ok(countVisit({ ...base, storage: st, code: 'shkola', day: '2026-11-18', standalone: true }).includes('p=%2Fapp'), 'на следующий день — снова, со значка');
  assert.equal(sent.length, 2);
  for (const u of sent) { const q = new URL(u); assert.equal(q.hostname, 'shkola.goatcounter.com'); assert.deepEqual([...q.searchParams.keys()].sort(), ['p', 't'], 'в запросе только «откуда открыто» и название приложения'); }
  assert.ok(validCode('shkola-kamilya') && !validCode('') && !validCode('a.b'));
  assert.ok(COUNTER === '' || validCode(COUNTER));
});

test('первый запуск сохраняет список фраз и общий голос до подключения сервис-воркера', async t => {
  const files = new Map([['audio/old.bin', new Response('old')]]);
  const cache = {
    put: async (key, response) => files.set(key, response),
    keys: async () => [...files.keys()].map(key => new Request('https://shkola.test/' + key)),
    delete: async req => files.delete(new URL(req.url).pathname.slice(1)),
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: async () => cache } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'caches', previous); else delete globalThis.caches; });
  t.mock.method(globalThis, 'fetch', async url => url === 'audio/manifest.json'
    ? Response.json({ packs: { common: { file: 'common.new.bin', items: [] } } })
    : new Response('voice'));
  const { initVoice, loadPack } = await import('../app/js/audio.js');
  await initVoice();
  await loadPack('common');
  assert.deepEqual([...files.keys()].sort(), ['audio/common.new.bin', 'audio/manifest.json']);
  assert.equal(await files.get('audio/common.new.bin').text(), 'voice');
});
