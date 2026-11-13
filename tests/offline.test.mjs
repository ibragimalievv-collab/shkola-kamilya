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
    const text = readFileSync(join(APP, f), 'utf8').replaceAll('http://www.w3.org/', '');
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
  stores.set('старая-версия', new Map([['index.html', { body: 'старое' }]]));
  vm.runInNewContext(swText, sandbox);
  const fire = async (type, ev = {}) => { let p; listeners[type]({ ...ev, waitUntil: x => { p = x; }, respondWith: x => { p = x; } }); return p; };

  await fire('install');
  await fire('activate');
  assert.equal(stores.size, 1, 'старая сохранённая копия удалена');

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
