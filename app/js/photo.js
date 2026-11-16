// РАСКРАСЬ ФОТО. Ребёнок фотографирует себя, маму, кота — или выбирает готовый снимок, — и приложение
// превращает фотографию в раскраску: остаются только контуры. Потом её можно раскрашивать пальцем.
// Сама фотография нигде не сохраняется и никуда не отправляется: на устройстве остаются только контуры.

import { h, today } from './util.js';
import { idb } from './db.js';
import { P } from './phrases.js';
import { sfx } from './audio.js';
import { makeBoard } from './canvas.js';

const KEEP = 12; // сколько раскрасок храним

// Контуры из картинки. gray — яркость точек (0…255), w и h — размер. Возвращает непрозрачность линии для каждой точки (0…255).
// Способ: слегка размыть (чтобы не рисовать каждую пылинку), найти места, где яркость резко меняется, и оставить самые заметные.
// Файл не трогает экран в этой функции, поэтому она проверяется автоматически.
export function contours(gray, w, h) {
  const blur = new Float32Array(w * h), mag = new Float32Array(w * h), out = new Uint8ClampedArray(w * h);
  const at = (x, y) => gray[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += at(x + dx, y + dy);
    blur[y * w + x] = s / 25;
  }
  const b = (x, y) => blur[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const sorted = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = b(x + 1, y - 1) + 2 * b(x + 1, y) + b(x + 1, y + 1) - b(x - 1, y - 1) - 2 * b(x - 1, y) - b(x - 1, y + 1);
    const gy = b(x - 1, y + 1) + 2 * b(x, y + 1) + b(x + 1, y + 1) - b(x - 1, y - 1) - 2 * b(x, y - 1) - b(x + 1, y - 1);
    const m = Math.hypot(gx, gy);
    mag[y * w + x] = m;
    if ((x + y * 7) % 13 === 0) sorted.push(m); // для порога хватит части точек
  }
  // Порог подстраивается под снимок: линиями становится примерно десятая часть точек — самые резкие перепады.
  sorted.sort((p, q) => p - q);
  const hi = Math.max(24, sorted[Math.floor(sorted.length * 0.9)] || 0), lo = hi * 0.55;
  for (let i = 0; i < mag.length; i++) out[i] = ((mag[i] - lo) / (hi - lo)) * 255;
  return out;
}

// Фотография → картинка с контурами (чёрные линии на прозрачном фоне), не больше 900 точек по длинной стороне.
async function toPage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { bmp = await createImageBitmap(file); }
  const k = Math.min(1, 900 / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), hh = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh);
  g.drawImage(bmp, 0, 0, w, hh);
  const img = g.getImageData(0, 0, w, hh), d = img.data, gray = new Uint8Array(w * hh);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
  const a = contours(gray, w, hh);
  for (let i = 0; i < gray.length; i++) { d[i * 4] = 43; d[i * 4 + 1] = 45; d[i * 4 + 2] = 66; d[i * 4 + 3] = a[i]; }
  g.putImageData(img, 0, 0);
  return new Promise((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error('пусто'))), 'image/png'));
}
// Сделать раскраску из файла и запомнить её. Возвращает её номер.
export async function addPage(store, file) {
  const blob = await toPage(file), id = 'cl-' + Date.now(), list = store.part('colorings', []);
  await idb.put('photos', id, blob);
  list.unshift({ id, d: today() });
  while (list.length > KEEP) idb.del('photos', list.pop().id).catch(() => {});
  store.save();
  return id;
}

// ---------- экран: мои раскраски ----------
export function photoScreen(x, back, note) {
  const { store, screen, ibtn, say } = x;
  const list = store.part('colorings', []), again = n => photoScreen(x, back, n);
  const take = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { openPage(x, await addPage(store, f), again); } catch { say(P.photoFail); }
  };
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'user', hidden: true, onchange: take });
  const pick = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: take });
  const shelf = h('div', { class: 'shelf' });
  screen('library', h('div', { class: 'bar' }, ibtn('🗺️', 'на карту', back), h('span', { class: 'grow' }), ibtn('🔊', 'послушать', () => say(P.photoHello), 'speak')),
    h('div', { class: 'opts' }, ibtn('📷', 'сфотографировать', () => cam.click(), 'play'), ibtn('🖼️', 'выбрать готовую фотографию', () => pick.click(), 'play')), cam, pick, shelf);
  // Готовые раскраски — картинками.
  list.forEach(async it => {
    const btn = h('button', { class: 'book page-thumb', 'aria-label': 'раскраска', onclick: () => { sfx('tap'); openPage(x, it.id, again); } });
    shelf.append(btn);
    try { const b = await idb.get('photos', it.id); if (b) btn.append(h('img', { src: URL.createObjectURL(b), alt: '' })); } catch { /* картинка не открылась — кнопка останется пустой */ }
  });
  say(note || P.photoHello);
}

// ---------- экран: раскрашиваем ----------
async function openPage(x, id, back) {
  const { store, screen, ibtn, say } = x;
  let blob = null;
  try { blob = await idb.get('photos', id); } catch { /* ниже скажем, что не получилось */ }
  if (!blob) return back(P.photoFail);
  const bmp = await createImageBitmap(blob), b = makeBoard({ brush: 28 });
  // Контуры лежат поверх красок и не мешают рисовать: линии всегда видны.
  const over = h('canvas', { width: b.W, height: b.H, class: 'layer over' });
  const k = Math.min(b.W / bmp.width, b.H / bmp.height), w = bmp.width * k, hh = bmp.height * k;
  over.getContext('2d').drawImage(bmp, (b.W - w) / 2, (b.H - hh) / 2, w, hh);
  b.stage.append(over);
  const save = () => {
    if (b.ink() < 150) return say(P.needDraw2);
    const c = document.createElement('canvas'), q = 480 / b.W;
    c.width = 480; c.height = Math.round(b.H * q);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(b.stage.querySelector('.ink'), 0, 0, c.width, c.height);
    g.drawImage(over, 0, 0, c.width, c.height);
    store.addArt(c.toDataURL('image/jpeg', 0.75));
    sfx('star');
    back(P.photoSaved);
  };
  const remove = () => {
    const list = store.part('colorings', []), i = list.findIndex(it => it.id === id);
    if (i >= 0) list.splice(i, 1);
    idb.del('photos', id).catch(() => {});
    store.save(); back();
  };
  screen('level', h('div', { class: 'bar' }, ibtn('◀', 'к раскраскам', () => back()), ibtn('🗑️', 'убрать эту раскраску', remove, 'small'), h('span', { class: 'grow' }), ibtn('🔊', 'послушать', () => say(P.photoReady), 'speak')),
    h('div', { class: 'task' }, h('div', { class: 'copy-top' }, h('div', { class: 'sample' }, '🎨'), h('button', { class: 'check', onclick: save }, '✔')), b.el));
  say(P.photoReady);
}
