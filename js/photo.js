// РАСКРАСЬ ФОТО. Ребёнок фотографирует себя, маму, кота — или выбирает готовый снимок, — и приложение
// превращает фотографию в раскраску: толстые контуры на белом листе. Области заливаются одним касанием,
// есть кисть, ластик и отмена; недокрашенное сохраняется.
// Уменьшенная фотография, контуры и краска хранятся только на этом устройстве и никуда не отправляются.

import { h, today } from './util.js';
import { idb } from './db.js';
import { P } from './phrases.js';
import { sfx } from './audio.js';

const KEEP = 12;   // сколько раскрасок храним
const SIDE = 720;  // длинная сторона листа в точках
const COLORS = ['#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#2a9d8f', '#1982c4', '#8ecae6', '#6a4c93', '#f15bb5', '#ffb3c6', '#f6c9a0', '#c68642', '#7b4a23', '#2b2d42', '#adb5bd', '#ffffff'];

// ================= РАСЧЁТЫ (без экрана — проверяются автоматически) =================

// Размытие: среднее по квадрату со стороной 2r+1.
function blur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[y * w + x] = s / n; s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}
// Настройки трёх уровней: 0 — мало линий (только крупные формы), 1 — средне, 2 — подробно.
// r — размытие, top — какая доля самых резких перепадов даёт линии, floor — ниже этого перепад не считается линией,
// min — линии короче этого выбрасываются как мусор, grow — на сколько точек утолщать.
const LEVELS = [{ r: 3, top: 0.05, floor: 5, min: 70, grow: 2 }, { r: 2, top: 0.08, floor: 7, min: 40, grow: 2 }, { r: 1, top: 0.12, floor: 9, min: 18, grow: 1 }];

// Линии раскраски. gray — яркость точек (0…255). Возвращает маску: 1 — линия, 0 — чистое место.
// Шаги: размыть → найти резкие перепады яркости → оставить только «гребень» перепада (тонкая линия) →
// выбросить короткие обрывки и слабые линии → утолстить, чтобы линии были ровной толщины и смыкались.
export function lineMask(gray, w, h, level = 1) {
  const cfg = LEVELS[level] || LEVELS[1], b = blur(blur(blur(gray, w, h, cfg.r), w, h, cfg.r), w, h, cfg.r), // три прохода — плавное размытие, у перепада появляется чёткая вершина
     mag = new Float32Array(w * h), dir = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = b[i - w + 1] + 2 * b[i + 1] + b[i + w + 1] - b[i - w - 1] - 2 * b[i - 1] - b[i + w - 1];
    const gy = b[i + w - 1] + 2 * b[i + w] + b[i + w + 1] - b[i - w - 1] - 2 * b[i - w] - b[i - w + 1];
    mag[i] = Math.hypot(gx, gy);
    const a = Math.abs(gx), c = Math.abs(gy);
    dir[i] = a > 2.4 * c ? 0 : c > 2.4 * a ? 1 : gx * gy > 0 ? 2 : 3; // куда направлен перепад: вбок, вверх-вниз, по одной из диагоналей
  }
  const sample = [];
  for (let i = 0; i < mag.length; i += 7) sample.push(mag[i]);
  sample.sort((p, q) => p - q);
  const hi = Math.max(cfg.floor * 2, sample[Math.floor(sample.length * (1 - cfg.top))] || 0), lo = Math.max(cfg.floor, hi * 0.4);
  // гребень: точка сильнее обеих соседок поперёк линии
  const ridge = new Uint8Array(w * h), step = [1, w, w + 1, w - 1];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, m = mag[i];
    if (m >= lo && m >= mag[i + step[dir[i]]] && m > mag[i - step[dir[i]]]) ridge[i] = 1;
  }
  // связные линии: оставляем длинные и содержащие хотя бы одну сильную точку
  const keep = new Uint8Array(w * h), seen = new Uint8Array(w * h), stack = new Int32Array(w * h);
  for (let s = 0; s < ridge.length; s++) {
    if (!ridge[s] || seen[s]) continue;
    let top = 0, n = 0, strong = false;
    const members = [];
    stack[top++] = s; seen[s] = 1;
    while (top) {
      const i = stack[--top]; members.push(i); n++;
      if (mag[i] >= hi) strong = true;
      const x = i % w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = i + dy * w + dx;
        if ((dx || dy) && j >= 0 && j < ridge.length && x + dx >= 0 && x + dx < w && ridge[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
      }
    }
    if (strong && n >= cfg.min) for (const i of members) keep[i] = 1;
  }
  return grow(keep, w, h, cfg.grow);
}
// Утолщение маски на r точек во все стороны.
function grow(mask, w, h, r) {
  let cur = mask;
  for (let k = 0; k < r; k++) {
    const next = new Uint8Array(cur);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cur[i]) continue;
      if ((x > 0 && cur[i - 1]) || (x < w - 1 && cur[i + 1]) || (y > 0 && cur[i - w]) || (y < h - 1 && cur[i + w])) next[i] = 1;
    }
    cur = next;
  }
  return cur;
}
// Заливка: область без линий вокруг точки (x, y). Возвращает маску области (1 — залить) или null, если рядом нет чистого места.
// Линии с фотографии редко смыкаются идеально, поэтому заливка «не пролезает» в щели уже 12 точек:
// сначала область ищется по утолщённым линиям (щели в них закрыты), потом возвращается к настоящим линиям.
// Заливка заходит на пару точек под линию, чтобы у линий не оставалось белой каёмки.
const GAP = 6, thickOf = new WeakMap();
function spread(free, w, h, start) { // все точки, до которых можно дойти от start по разрешённым (free[i] === 0) местам
  const out = new Uint8Array(w * h), stack = new Int32Array(w * h);
  let top = 0;
  stack[top++] = start; out[start] = 1;
  while (top) {
    const i = stack[--top], px = i % w;
    if (px > 0 && !free[i - 1] && !out[i - 1]) { out[i - 1] = 1; stack[top++] = i - 1; }
    if (px < w - 1 && !free[i + 1] && !out[i + 1]) { out[i + 1] = 1; stack[top++] = i + 1; }
    if (i >= w && !free[i - w] && !out[i - w]) { out[i - w] = 1; stack[top++] = i - w; }
    if (i < w * h - w && !free[i + w] && !out[i + w]) { out[i + w] = 1; stack[top++] = i + w; }
  }
  return out;
}
const nearest = (m, w, h, x, y, r) => { // ближайшая к (x, y) точка, где m равно нулю, не дальше r
  for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
    const nx = x + dx, ny = y + dy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) === d && nx >= 0 && ny >= 0 && nx < w && ny < h && !m[ny * w + nx]) return ny * w + nx;
  }
  return -1;
};
export function floodFill(mask, w, h, x, y) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  if (!thickOf.has(mask)) thickOf.set(mask, grow(mask, w, h, GAP));
  const thick = thickOf.get(mask), wide = nearest(thick, w, h, x, y, 10);
  let out;
  if (wide >= 0) {
    out = spread(thick, w, h, wide);
    for (let k = 0; k < GAP + 1; k++) { // возвращаемся от утолщённых линий к настоящим
      const next = new Uint8Array(out);
      for (let i = 0; i < out.length; i++) {
        if (out[i] || mask[i]) continue;
        const px = i % w;
        if ((px > 0 && out[i - 1]) || (px < w - 1 && out[i + 1]) || (i >= w && out[i - w]) || (i < out.length - w && out[i + w])) next[i] = 1;
      }
      out = next;
    }
  } else { // тесное место (глаз, пуговица): заливаем как есть, но только если оно и правда маленькое
    const start = nearest(mask, w, h, x, y, 8);
    if (start < 0) return null;
    out = spread(mask, w, h, start);
    let n = 0;
    for (let i = 0; i < out.length; i++) n += out[i];
    if (n > w * h * 0.04) return null;
  }
  return grow(out, w, h, 2);
}

// ================= ХРАНЕНИЕ =================
// Для каждой раскраски на устройстве лежат: уменьшенное фото (номер), краска (номер + '-p') и картинка для полки (номер + '-t').

const canvasOf = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
const toBlob = (c, type = 'image/png', q) => new Promise(ok => c.toBlob(ok, type, q));
async function bitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return createImageBitmap(file); }
}
// Сделать раскраску из файла и запомнить её. Возвращает её номер.
export async function addPage(store, file) {
  const bmp = await bitmap(file), k = Math.min(1, SIDE / Math.max(bmp.width, bmp.height));
  const c = canvasOf(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k))), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const id = 'cl-' + Date.now(), list = store.part('colorings', []);
  await idb.put('photos', id, await toBlob(c, 'image/jpeg', 0.85));
  list.unshift({ id, d: today(), v: 2, lv: 1 });
  while (list.length > KEEP) dropPage(list.pop().id);
  store.save();
  return id;
}
const dropPage = id => { for (const k of [id, id + '-p', id + '-t']) idb.del('photos', k).catch(() => {}); };

// ================= ЭКРАН: МОИ РАСКРАСКИ =================
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
  list.forEach(async it => {
    const btn = h('button', { class: 'book page-thumb', 'aria-label': 'раскраска', onclick: () => { sfx('tap'); openPage(x, it.id, again); } });
    shelf.append(btn);
    try { const b = (await idb.get('photos', it.id + '-t')) || (it.v ? null : await idb.get('photos', it.id)); if (b) btn.append(h('img', { src: URL.createObjectURL(b), alt: '' })); else btn.append(h('span', { class: 'cover' }, '🎨')); } catch { /* картинка не открылась — кнопка останется пустой */ }
  });
  say(note || P.photoHello);
}

// ================= ЭКРАН: РАСКРАШИВАЕМ =================
async function openPage(x, id, back) {
  const { store, screen, ibtn, say } = x;
  const item = store.part('colorings', []).find(it => it.id === id);
  let src = null, saved = null;
  try { src = await idb.get('photos', id); saved = await idb.get('photos', id + '-p'); } catch { /* ниже скажем, что не получилось */ }
  if (!src || !item) return back(P.photoFail);
  const bmp = await createImageBitmap(src), W = bmp.width, H = bmp.height;
  const paint = canvasOf(W, H), lines = canvasOf(W, H), pg = paint.getContext('2d', { willReadFrequently: true }), lg = lines.getContext('2d');
  paint.className = 'layer ink'; lines.className = 'layer over';
  if (saved) { try { pg.drawImage(await createImageBitmap(saved), 0, 0, W, H); } catch { /* начнём с чистого листа */ } }

  // Яркость точек фото (для раскрасок старого вида фото нет — там хранились готовые линии).
  const tmp = canvasOf(W, H), tg = tmp.getContext('2d');
  tg.drawImage(bmp, 0, 0);
  const px = tg.getImageData(0, 0, W, H).data, gray = new Uint8Array(W * H);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2];
  let mask = null;
  const setLines = () => {
    if (item.v) mask = lineMask(gray, W, H, item.lv ?? 1);
    else { mask = new Uint8Array(W * H); for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4 + 3] > 110 ? 1 : 0; }
    const img = lg.createImageData(W, H);
    for (let i = 0; i < mask.length; i++) if (mask[i]) { img.data[i * 4] = 43; img.data[i * 4 + 1] = 45; img.data[i * 4 + 2] = 66; img.data[i * 4 + 3] = 255; }
    lg.putImageData(img, 0, 0);
  };
  setLines();

  // --- инструменты ---
  let color = COLORS[0], tool = 'fill', size = 26, drawing = null, dirty = false;
  const undo = [];
  const remember = () => { undo.push(pg.getImageData(0, 0, W, H)); if (undo.length > 10) undo.shift(); dirty = true; };
  const pos = e => { const r = paint.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  function fillAt(p) {
    const area = floodFill(mask, W, H, p[0], p[1]);
    if (!area) return;
    const img = pg.getImageData(0, 0, W, H), d = img.data, [r, g, b] = rgb(color);
    for (let i = 0; i < area.length; i++) if (area[i]) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
    pg.putImageData(img, 0, 0);
    sfx('pop');
  }
  function stroke(a, b) {
    pg.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    pg.strokeStyle = color; pg.lineWidth = size; pg.lineCap = pg.lineJoin = 'round';
    pg.beginPath(); pg.moveTo(a[0], a[1]); pg.lineTo(b[0], b[1]); pg.stroke();
    pg.globalCompositeOperation = 'source-over';
  }
  paint.addEventListener('pointerdown', e => {
    e.preventDefault();
    remember();
    const p = pos(e);
    if (tool === 'fill') return fillAt(p);
    try { paint.setPointerCapture(e.pointerId); } catch { /* не страшно */ }
    drawing = p; stroke(p, p);
  });
  paint.addEventListener('pointermove', e => { if (!drawing) return; e.preventDefault(); const p = pos(e); stroke(drawing, p); drawing = p; });
  const up = () => { drawing = null; };
  paint.addEventListener('pointerup', up); paint.addEventListener('pointercancel', up);

  const pickOne = (box, cls, el) => box.querySelectorAll('.' + cls).forEach(q => q.classList.toggle('sel', q === el));
  const colors = h('div', { class: 'board-tools' }), tools = h('div', { class: 'board-tools' });
  COLORS.forEach((c, i) => { const b = h('button', { class: 'color' + (i ? '' : ' sel') + (c === '#ffffff' ? ' white' : ''), style: `background:${c}`, 'aria-label': 'цвет', onclick: () => { color = c; pickOne(colors, 'color', b); if (tool === 'erase') setTool('fill'); } }); colors.append(b); });
  const toolBtns = {};
  const setTool = t => { tool = t; for (const [k, b] of Object.entries(toolBtns)) b.classList.toggle('sel', k === t); sizes.classList.toggle('off', t === 'fill'); };
  for (const [t, icon, label] of [['fill', '🪣', 'заливка'], ['brush', '🖌️', 'кисть'], ['erase', '🧽', 'ластик']]) tools.append(toolBtns[t] = h('button', { class: 'tool-btn' + (t === 'fill' ? ' sel' : ''), 'aria-label': label, onclick: () => { sfx('tap'); setTool(t); } }, icon));
  const sizes = h('span', { class: 'sizes off' });
  [[12, 's'], [26, 'm'], [46, 'l']].forEach(([sz, k]) => { const b = h('button', { class: `size size-${k}` + (sz === size ? ' sel' : ''), 'aria-label': 'толщина кисти', onclick: () => { size = sz; pickOne(sizes, 'size', b); } }, h('i')); sizes.append(b); });
  tools.append(sizes, h('button', { class: 'tool-btn', 'aria-label': 'отменить', onclick: () => { const last = undo.pop(); if (last) { pg.putImageData(last, 0, 0); sfx('tap'); } } }, '↩️'));
  // Сколько линий: мало, средне, много (для раскрасок нового вида).
  if (item.v) {
    const lv = h('span', { class: 'sizes' });
    ['▫️', '◽', '◻️'].forEach((icon, n) => { const b = h('button', { class: 'tool-btn lines-btn' + (n === (item.lv ?? 1) ? ' sel' : ''), 'aria-label': ['мало линий', 'средне линий', 'много линий'][n], onclick: () => { item.lv = n; store.save(); setLines(); pickOne(lv, 'lines-btn', b); sfx('tap'); } }, h('span', { class: 'lv lv' + n })); lv.append(b); });
    tools.append(lv);
  }

  // --- сохранение ---
  const compose = side => { const k = side / Math.max(W, H), c = canvasOf(Math.round(W * k), Math.round(H * k)), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(paint, 0, 0, c.width, c.height); g.drawImage(lines, 0, 0, c.width, c.height); return c; };
  const keep = async () => { // краска и картинка для полки — чтобы продолжить в другой раз
    try { await idb.put('photos', id + '-p', await toBlob(paint)); await idb.put('photos', id + '-t', await toBlob(compose(300), 'image/jpeg', 0.8)); } catch { /* мало места — раскраска останется как была */ }
  };
  const leave = async note => { await keep(); back(note); };
  const finish = async () => {
    if (!dirty && !saved) return say(P.needDraw2);
    store.addArt(compose(480).toDataURL('image/jpeg', 0.78));
    sfx('star');
    leave(P.photoSaved);
  };
  const remove = () => { const list = store.part('colorings', []), i = list.indexOf(item); if (i >= 0) list.splice(i, 1); dropPage(id); store.save(); back(); };

  // Образец — маленькое фото в уголке; нажатие прячет его или показывает снова.
  const sample = item.v ? h('button', { class: 'photo-sample', 'aria-label': 'образец', onclick: () => sample.classList.toggle('hide') }, h('img', { src: URL.createObjectURL(src), alt: '' })) : null;
  const stage = h('div', { class: 'board-stage', style: `aspect-ratio:${W}/${H};--ar:${(W / H).toFixed(3)}` }, paint, lines, sample);
  screen('level', h('div', { class: 'bar' }, ibtn('◀', 'к раскраскам', () => leave()), ibtn('🗑️', 'убрать эту раскраску', remove, 'small'), h('span', { class: 'grow' }),
    h('button', { class: 'check', 'aria-label': 'готово', onclick: finish }, '✔'), ibtn('🔊', 'послушать', () => say(P.photoReady), 'speak')),
  h('div', { class: 'task' }, h('div', { class: 'board' }, stage, colors, tools)));
  if (!saved) keep();
  say(P.photoReady);
}
