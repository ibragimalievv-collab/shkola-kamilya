// РАСКРАСЬ ФОТО. Ребёнок фотографирует себя, маму, кота — или выбирает готовый снимок, — и приложение
// превращает фотографию в карандашный рисунок на белом листе. Области заливаются одним касанием,
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
// Настройки трёх уровней: 0 — мало линий (только самые крупные пятна), 1 — средне, 2 — подробно.
// r — размытие, k — на сколько цветов делим снимок, min — пятна меньше этого сливаются с соседними.
const LEVELS = [{ r: 3, k: 6, min: 500 }, { r: 2, k: 8, min: 320 }, { r: 2, k: 12, min: 140 }];

// Линии раскраски. rgb — три слоя (красный, зелёный, синий, 0…255) небольшой картинки. Возвращает маску: 1 — линия.
// Мы не ищем «края» (на живых снимках они рвутся), а делим снимок на крупные цветовые пятна — лицо, волосы,
// одежда, фон — и проводим линии по границам пятен. Поэтому каждая область замкнута, и краска из неё не вытекает.
// Шаги: размыть → собрать похожие цвета в несколько групп → сгладить границы → слить мелкие пятна с соседями → границы.
export function lineMask(rgb, w, h, level = 1) {
  const cfg = LEVELS[level] || LEVELS[1], n = w * h;
  const [R, G, B] = rgb.map(layer => blur(blur(layer, w, h, cfg.r), w, h, cfg.r));
  // Цвет точки: яркость (с меньшим весом, чтобы тень на лице не делила его пополам) и два цветовых оттенка.
  const f = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = 0.3 * R[i] + 0.59 * G[i] + 0.11 * B[i];
    f[i * 3] = y * 0.5; f[i * 3 + 1] = (B[i] - y) * 1.5; f[i * 3 + 2] = (R[i] - y) * 1.5;
  }
  // Группы цветов: первая — средний цвет, каждая следующая — самый непохожий на уже выбранные; потом уточняем.
  const pts = [];
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) pts.push(y * w + x);
  const cen = [[0, 0, 0]];
  for (const i of pts) for (let c = 0; c < 3; c++) cen[0][c] += f[i * 3 + c] / pts.length;
  const d2 = (i, c) => (f[i * 3] - c[0]) ** 2 + (f[i * 3 + 1] - c[1]) ** 2 + (f[i * 3 + 2] - c[2]) ** 2;
  while (cen.length < cfg.k) {
    let far = pts[0], best = -1;
    for (const i of pts) { let m = Infinity; for (const c of cen) m = Math.min(m, d2(i, c)); if (m > best) { best = m; far = i; } }
    if (best < 60) break; // цвета кончились: снимок почти одноцветный
    cen.push([f[far * 3], f[far * 3 + 1], f[far * 3 + 2]]);
  }
  const nearest = i => { let b = 0, m = Infinity; for (let c = 0; c < cen.length; c++) { const d = d2(i, cen[c]); if (d < m) { m = d; b = c; } } return b; };
  for (let it = 0; it < 8; it++) {
    const sum = cen.map(() => [0, 0, 0, 0]);
    for (const i of pts) { const s = sum[nearest(i)]; s[0] += f[i * 3]; s[1] += f[i * 3 + 1]; s[2] += f[i * 3 + 2]; s[3]++; }
    sum.forEach((s, c) => { if (s[3]) cen[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  let lab = new Uint8Array(n);
  for (let i = 0; i < n; i++) lab[i] = nearest(i);
  // Сглаживание границ: точка берёт группу, которой вокруг неё больше всего.
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(lab), cnt = new Uint16Array(cen.length);
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      cnt.fill(0);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) cnt[lab[(y + dy) * w + x + dx]]++;
      let b = lab[y * w + x];
      for (let c = 0; c < cnt.length; c++) if (cnt[c] > cnt[b]) b = c;
      next[y * w + x] = b;
    }
    lab = next;
  }
  // Пятна (связные области одной группы). Мелкие сливаем с тем соседом, с которым у них самая длинная граница.
  const id = new Int32Array(n), stack = new Int32Array(n);
  const paintSpots = () => {
    id.fill(-1);
    const size = [];
    for (let s = 0; s < n; s++) {
      if (id[s] >= 0) continue;
      const k = size.length; let top = 0, cnt = 0;
      stack[top++] = s; id[s] = k;
      while (top) {
        const i = stack[--top], x = i % w; cnt++;
        if (x > 0 && id[i - 1] < 0 && lab[i - 1] === lab[i]) { id[i - 1] = k; stack[top++] = i - 1; }
        if (x < w - 1 && id[i + 1] < 0 && lab[i + 1] === lab[i]) { id[i + 1] = k; stack[top++] = i + 1; }
        if (i >= w && id[i - w] < 0 && lab[i - w] === lab[i]) { id[i - w] = k; stack[top++] = i - w; }
        if (i < n - w && id[i + w] < 0 && lab[i + w] === lab[i]) { id[i + w] = k; stack[top++] = i + w; }
      }
      size.push(cnt);
    }
    return size;
  };
  for (let round = 0; round < 6; round++) {
    const size = paintSpots(), border = new Map(); // для мелкого пятна: сосед → длина общей границы
    let small = 0;
    const touch = (a, b) => { if (size[a] >= cfg.min) return; let m = border.get(a); if (!m) border.set(a, m = new Map()); m.set(b, (m.get(b) || 0) + 1); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < w - 1 && id[i] !== id[i + 1]) { touch(id[i], id[i + 1]); touch(id[i + 1], id[i]); }
      if (y < h - 1 && id[i] !== id[i + w]) { touch(id[i], id[i + w]); touch(id[i + w], id[i]); }
    }
    const into = new Map(), sample = new Int32Array(size.length).fill(-1);
    for (let i = 0; i < n; i++) if (sample[id[i]] < 0) sample[id[i]] = i;
    for (const [a, m] of border) {
      let best = -1, len = 0;
      for (const [b, l] of m) if (l > len || (l === len && size[b] > size[best])) { best = b; len = l; }
      if (best >= 0 && !into.has(best)) { into.set(a, lab[sample[best]]); small++; } // сосед сам не должен сливаться в этот же раунд
    }
    if (!small) break;
    for (let i = 0; i < n; i++) { const t = into.get(id[i]); if (t !== undefined) lab[i] = t; }
  }
  paintSpots();
  const mask = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if ((x < w - 1 && id[i] !== id[i + 1]) || (y < h - 1 && id[i] !== id[i + w])) mask[i] = 1;
  }
  return mask;
}
// Карандашный рисунок из фотографии. gray — яркость точек (0…255). Возвращает «силу карандаша» для каждой точки (0 — чистая бумага, 255 — чёрная линия).
// Способ известен художникам как «осветление основы»: яркость точки делим на среднюю яркость вокруг неё.
// Ровные места становятся белыми, а там, где что-то меняется (глаза, волосы, складки), остаются штрихи.
// level: 0 — лёгкий рисунок, 1 — обычный, 2 — тёмный и подробный.
export function sketch(gray, w, h, level = 1) {
  const soft = blur(gray, w, h, 1), around = blur(blur(soft, w, h, 7), w, h, 7), out = new Uint8ClampedArray(w * h), v = new Float32Array(w * h);
  for (let i = 0; i < v.length; i++) v[i] = Math.min(1, (soft[i] + 4) / (around[i] + 4)); // 1 — как вокруг (бумага), меньше — темнее соседей (штрих)
  // Сила нажима подбирается под снимок, чтобы карандаша на листе было в меру: пёстрая чёрная собака не станет
  // сплошным пятном, а бледный снимок не останется пустым. Доля «закрашенного» листа — 7, 11 или 16 процентов.
  const want = [0.07, 0.11, 0.16][level] ?? 0.11;
  const ink = p => { let s = 0, n = 0; for (let i = 0; i < v.length; i += 5) { s += 1 - v[i] ** p; n++; } return s / n; };
  let lo = 0.5, hi = 9;
  for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (ink(mid) > want) hi = mid; else lo = mid; }
  const power = (lo + hi) / 2;
  for (let i = 0; i < out.length; i++) out[i] = 255 * (1 - v[i] ** power);
  return out;
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
// Линии с фотографии редко смыкаются идеально, поэтому заливка «не пролезает» в щели уже 6 точек:
// сначала область ищется по утолщённым линиям (щели в них закрыты), потом возвращается к настоящим линиям.
// Заливка заходит на пару точек под линию, чтобы у линий не оставалось белой каёмки.
const GAP = 3, thickOf = new WeakMap();
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
  return grow(out, w, h, 3);
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

  // На экране — карандашный рисунок с фотографии. Под ним, невидимо, лист поделён на крупные цветовые области:
  // по ним работает заливка. Области считаем на картинке вдвое меньше листа (так быстрее), потом увеличиваем.
  // Для раскрасок старого вида фото нет — там хранились готовые линии.
  const full = canvasOf(W, H), fg = full.getContext('2d', { willReadFrequently: true });
  fg.fillStyle = '#fff'; fg.fillRect(0, 0, W, H);
  fg.drawImage(bmp, 0, 0, W, H);
  const fpx = fg.getImageData(0, 0, W, H).data, gray = new Float32Array(W * H);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.3 * fpx[i * 4] + 0.59 * fpx[i * 4 + 1] + 0.11 * fpx[i * 4 + 2];
  let mask = null;
  const setLines = () => {
    const img = lg.createImageData(W, H);
    if (item.v) {
      const a = sketch(gray, W, H, item.lv ?? 1);
      for (let i = 0; i < a.length; i++) { img.data[i * 4] = 43; img.data[i * 4 + 1] = 45; img.data[i * 4 + 2] = 66; img.data[i * 4 + 3] = a[i]; }
    } else for (let i = 0; i < W * H; i++) { img.data[i * 4] = 43; img.data[i * 4 + 1] = 45; img.data[i * 4 + 2] = 66; img.data[i * 4 + 3] = fpx[i * 4 + 3] > 110 ? 255 : 0; }
    lg.putImageData(img, 0, 0);
  };
  const setAreas = () => {
    if (!item.v) { mask = new Uint8Array(W * H); for (let i = 0; i < mask.length; i++) mask[i] = fpx[i * 4 + 3] > 110 ? 1 : 0; return; }
    const lw = Math.round(W / 2), lh = Math.round(H / 2), small = canvasOf(lw, lh), sg = small.getContext('2d', { willReadFrequently: true });
    sg.drawImage(full, 0, 0, lw, lh);
    const px = sg.getImageData(0, 0, lw, lh).data, rgb3 = [new Float32Array(lw * lh), new Float32Array(lw * lh), new Float32Array(lw * lh)];
    for (let i = 0; i < lw * lh; i++) { rgb3[0][i] = px[i * 4]; rgb3[1][i] = px[i * 4 + 1]; rgb3[2][i] = px[i * 4 + 2]; }
    const m = lineMask(rgb3, lw, lh, 0), img = sg.createImageData(lw, lh);
    for (let i = 0; i < m.length; i++) if (m[i]) img.data[i * 4 + 3] = 255;
    sg.clearRect(0, 0, lw, lh); sg.putImageData(img, 0, 0);
    const big = canvasOf(W, H), bg = big.getContext('2d', { willReadFrequently: true });
    bg.imageSmoothingEnabled = false;
    bg.drawImage(small, 0, 0, W, H);
    const a = bg.getImageData(0, 0, W, H).data;
    mask = new Uint8Array(W * H);
    for (let i = 0; i < mask.length; i++) mask[i] = a[i * 4 + 3] > 100 ? 1 : 0;
  };
  setLines(); setAreas();

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
  // Насколько тёмный карандаш: лёгкий, обычный, тёмный (для раскрасок нового вида).
  if (item.v) {
    const lv = h('span', { class: 'sizes' });
    ['▫️', '◽', '◻️'].forEach((icon, n) => { const b = h('button', { class: 'tool-btn lines-btn' + (n === (item.lv ?? 1) ? ' sel' : ''), 'aria-label': ['лёгкий рисунок', 'обычный рисунок', 'тёмный рисунок'][n], onclick: () => { item.lv = n; store.save(); setLines(); pickOne(lv, 'lines-btn', b); sfx('tap'); } }, h('span', { class: 'lv lv' + n })); lv.append(b); });
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
