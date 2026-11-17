// РАСКРАСЬ ФОТО. Ребёнок фотографирует себя, маму, кота — или выбирает готовый снимок, — и приложение
// превращает фотографию в карандашный рисунок на белом листе. Области заливаются одним касанием,
// есть кисть, ластик и отмена; недокрашенное сохраняется.
// Уменьшенная фотография, контуры и краска хранятся только на этом устройстве и никуда не отправляются.

import { h, today, twice, makeRng, shuffle } from './util.js';
import { idb } from './db.js';
import { P } from './phrases.js';
import { sfx } from './audio.js';
import { animalSVG, heroSVG } from './art.js';
import { ISLANDS } from './curriculum.js';
import { ORDER } from './data.js';
import { tokL, example } from './tasks.js';
import { lettersKnown } from './fun.js';
import { HERO_DEFAULT } from './store.js';
import { keepArt } from './album.js';
import { CRAFTS, craftSVG, craftScreen } from './crafts.js';

const KEEP = 12;   // сколько раскрасок храним
const SIDE = 720;  // длинная сторона листа в точках
const COLORS = ['#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#2a9d8f', '#1982c4', '#8ecae6', '#6a4c93', '#f15bb5', '#ffb3c6', '#f6c9a0', '#c68642', '#7b4a23', '#2b2d42', '#adb5bd', '#ffffff', 'rainbow'];
const STAMPS = ['⭐', '❤️', '🌸', '🦋', '👑', '🎩', '🕶️', '🎀', '☀️', '⚽', '🐞', '🎈'];
// Цвет радуги по числу от 0 до 1.
const rainbow = t => { const k = n => { const q = (n + t * 10) % 12; return Math.round(255 * (0.55 - 0.45 * Math.max(-1, Math.min(q - 3, 9 - q, 1)))); }; return [k(0), k(8), k(4)]; };

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
// Линии для РИСОВАННОЙ картинки (несколько ровных цветов и тёмные контуры). rgb — три слоя, 0…255.
// Каждая точка относится к одному из основных цветов картинки; линия — там, где встречаются два разных цвета,
// и везде, где сам цвет тёмный (это нарисованный контур). Размытые края не дают двойных линий: такая точка
// просто получает ближайший из основных цветов. Возвращает маску: 1 — линия.
export function artMask(rgb, w, h) {
  const [R, G, B] = rgb, n = w * h, bins = new Map();
  for (let i = 0; i < n; i += 3) { const k = ((R[i] >> 4) << 8) | ((G[i] >> 4) << 4) | (B[i] >> 4); const b = bins.get(k); if (b) { b[0] += R[i]; b[1] += G[i]; b[2] += B[i]; b[3]++; } else bins.set(k, [R[i], G[i], B[i], 1]); }
  const main = [...bins.values()].filter(b => b[3] > (n / 3) * 0.002).map(b => [b[0] / b[3], b[1] / b[3], b[2] / b[3]]);
  const dark = c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] < 95;
  const cls = new Uint8Array(n), isDark = main.map(dark);
  for (let i = 0; i < n; i++) {
    let best = 0, m = Infinity;
    for (let c = 0; c < main.length; c++) { const d = (R[i] - main[c][0]) ** 2 + (G[i] - main[c][1]) ** 2 + (B[i] - main[c][2]) ** 2; if (d < m) { m = d; best = c; } }
    cls[i] = best;
  }
  // убираем одиночные «чужие» точки на краях: точка берёт цвет, которого вокруг больше (два прохода — края ровнее)
  let fix = cls;
  const cnt = new Uint16Array(main.length);
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(fix);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; cnt.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cnt[fix[i + dy * w + dx]]++;
      let b = fix[i];
      for (let c = 0; c < cnt.length; c++) if (cnt[c] > cnt[b]) b = c;
      next[i] = b;
    }
    fix = next;
  }
  const edge = new Uint8Array(n), darkAll = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, a = fix[i];
    if (isDark[a]) { darkAll[i] = 1; continue; }
    const r = x < w - 1 ? fix[i + 1] : a, d = y < h - 1 ? fix[i + w] : a;
    if ((r !== a && !isDark[r]) || (d !== a && !isDark[d])) edge[i] = 1; // граница двух светлых цветов — рисуем линию сами
  }
  // Тёмное пятно (чёрная голова пингвина, маска енота) не должно оставаться сплошной кляксой: оставляем от него
  // только контур, а середину можно раскрашивать. Тонкие контуры и зрачки остаются как есть.
  const light = new Uint8Array(n);
  for (let i = 0; i < n; i++) light[i] = darkAll[i] ? 0 : 1;
  const deep = Math.max(6, Math.round(w * 0.035)); // пятно считается большим, если оно шире семи сотых листа (зрачки остаются чёрными)
  const notCore = grow(light, w, h, deep), core = new Uint8Array(n);
  let darkN = 0;
  for (let i = 0; i < n; i++) { core[i] = notCore[i] ? 0 : 1; darkN += darkAll[i]; }
  const inner = grow(core, w, h, deep - Math.max(3, Math.round(w * 0.008))); // середина тёмного пятна; по краю остаётся контур
  const mask = new Uint8Array(n), thick = grow(edge, w, h, darkN < n * 0.01 ? 3 : 2); // если тёмных контуров почти нет (помощник) — линии потолще
  for (let i = 0; i < n; i++) if ((darkAll[i] && !inner[i]) || thick[i]) mask[i] = 1;
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
// ЖИРНЫЕ КОНТУРЫ из фотографии — без теней и полутонов, как в книжке-раскраске. gray — яркость точек.
// Берём тот же приём, что и для карандаша (точка темнее своих соседей — значит, это черта), но оставляем только
// самые заметные черты, выбрасываем мелкий сор, а оставшееся делаем сплошным и чуть толще. Возвращает маску: 1 — линия.
// level: 0 — мало линий, 1 — средне, 2 — много.
export function ink(gray, w, h, level = 1) {
  const soft = blur(gray, w, h, 2), around = blur(blur(soft, w, h, 9), w, h, 9), n = w * h, v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = (soft[i] + 6) / (around[i] + 6);
  const sample = [];
  for (let i = 0; i < n; i += 7) sample.push(v[i]);
  sample.sort((a, b) => a - b);
  const thr = Math.min(0.93, sample[Math.floor(sample.length * [0.05, 0.08, 0.12][level])] ?? 0); // черта — не меньше чем на 7% темнее соседей
  const raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) raw[i] = v[i] < thr ? 1 : 0;
  // выбрасываем мелкие пятнышки (сор, зерно, поры)
  const seen = new Uint8Array(n), stack = new Int32Array(n), keep = new Uint8Array(n), min = [70, 45, 28][level];
  for (let s0 = 0; s0 < n; s0++) {
    if (!raw[s0] || seen[s0]) continue;
    let top = 0; const members = [];
    stack[top++] = s0; seen[s0] = 1;
    while (top) {
      const i = stack[--top], x = i % w; members.push(i);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dy * w + dx; if ((dx || dy) && j >= 0 && j < n && x + dx >= 0 && x + dx < w && raw[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; } }
    }
    if (members.length >= min) for (const i of members) keep[i] = 1;
  }
  return grow(keep, w, h, 1);
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
// Пятна листа (связные места без линий): номер пятна для каждой точки и размеры пятен. Считается один раз на маску.
const spotsOf = new WeakMap();
function spots(mask, w, h) {
  if (spotsOf.has(mask)) return spotsOf.get(mask);
  const id = new Int32Array(w * h).fill(-1), size = [], stack = new Int32Array(w * h);
  for (let s0 = 0; s0 < id.length; s0++) {
    if (mask[s0] || id[s0] >= 0) continue;
    const k = size.length; let top = 0, n = 0;
    stack[top++] = s0; id[s0] = k;
    while (top) {
      const i = stack[--top], px = i % w; n++;
      if (px > 0 && !mask[i - 1] && id[i - 1] < 0) { id[i - 1] = k; stack[top++] = i - 1; }
      if (px < w - 1 && !mask[i + 1] && id[i + 1] < 0) { id[i + 1] = k; stack[top++] = i + 1; }
      if (i >= w && !mask[i - w] && id[i - w] < 0) { id[i - w] = k; stack[top++] = i - w; }
      if (i < id.length - w && !mask[i + w] && id[i + w] < 0) { id[i + w] = k; stack[top++] = i + w; }
    }
    size.push(n);
  }
  const res = { id, size };
  spotsOf.set(mask, res);
  return res;
}
// absorb — пятнышки меньше этого размера, прилегающие к заливаемой области, закрашиваются вместе с ней
// (на фотографии между областями остаются узкие щёлки, в которые пальцем не попасть).
export function floodFill(mask, w, h, x, y, absorb = 0) {
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
  if (absorb) {
    const { id, size } = spots(mask, w, h), near = grow(out, w, h, 5), take = new Set();
    for (let i = 0; i < out.length; i++) if (near[i] && !out[i] && !mask[i] && size[id[i]] < absorb) take.add(id[i]);
    if (take.size) for (let i = 0; i < out.length; i++) if (id[i] >= 0 && take.has(id[i])) out[i] = 1;
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
  list.unshift({ id, d: today(), v: 2, lv: 1, style: 'ink', rec: 1 });
  while (list.length > KEEP) dropPage(list.pop().id);
  store.save();
  return id;
}
// Готовая картинка (зверёк-наклейка или помощник) как раскраска. key — её имя, чтобы не заводить вторую такую же.
export async function addArtPage(store, key, svg) {
  const list = store.part('colorings', []), old = list.find(it => it.art === key);
  if (old) return old.id;
  const text = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" ');
  const img = new Image();
  await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })); });
  const c = canvasOf(SIDE, SIDE), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, SIDE, SIDE);
  g.drawImage(img, 40, 40, SIDE - 80, SIDE - 80);
  const id = 'cl-' + Date.now();
  await idb.put('photos', id, await toBlob(c));
  list.unshift({ id, d: today(), v: 2, art: key, rec: 1 });
  while (list.length > KEEP) dropPage(list.pop().id);
  store.save();
  return id;
}
const dropPage = id => { for (const k of [id, id + '-p', id + '-t', id + '-o']) idb.del('photos', k).catch(() => {}); };

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
  // Готовые картинки: помощник и звери. Зверь открывается вместе со своей наклейкой (первые шесть — сразу).
  const ready = [['hero', heroSVG(HERO_DEFAULT, 'happy')], ...ISLANDS.filter(isl => isl.n < 6 || store.islandDone(isl)).map(isl => ['a' + isl.n, animalSVG(isl.n)])];
  const row = h('div', { class: 'ready-row' }, ready.map(([key, svg]) => h('button', { class: 'ready-pic', 'aria-label': 'готовая картинка', html: svg,
    onclick: async () => { sfx('tap'); try { openPage(x, await addArtPage(store, key, svg), again); } catch { say(P.photoFail); } } })));
  // Поделки: сначала собрать из деталей, потом раскрасить.
  const crafts = h('div', { class: 'ready-row' }, CRAFTS.map(([key]) => h('button', { class: 'ready-pic craft', 'aria-label': 'поделка', html: craftSVG(key),
    onclick: () => { sfx('tap'); const open = async () => { try { openPage(x, await addArtPage(store, 'craft-' + key, craftSVG(key)), again); } catch { say(P.photoFail); } };
      store.part('colorings', []).some(it => it.art === 'craft-' + key) ? open() : craftScreen(x, key, () => again(), open); } })));
  shelf.after(row, crafts);
  say(note || P.photoHello);
}

// Примеры для раскраски: какие ответы бывают у примеров этого вида и какие примеры дают каждый ответ.
// Возвращает таблицу «ответ → список примеров» (пример записан без пробелов: 2+3).
export function examplePool(kind, r, tries = 400) {
  const pool = new Map();
  for (let i = 0; i < tries; i++) {
    const e = example(kind, r), text = e.text.replace(/\s/g, '');
    if (!pool.has(e.res)) pool.set(e.res, []);
    if (!pool.get(e.res).includes(text)) pool.get(e.res).push(text);
  }
  return pool;
}

// ================= ЭКРАН: РАСКРАШИВАЕМ =================
const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const rgbOf = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
const far = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const sleep = ms => new Promise(f => setTimeout(f, ms));

async function openPage(x, id, back) {
  const { store, screen, ibtn, say } = x;
  const item = store.part('colorings', []).find(it => it.id === id);
  let src = null, saved = null, oldOps = null;
  try { src = await idb.get('photos', id); saved = await idb.get('photos', id + '-p'); const o = await idb.get('photos', id + '-o'); if (o) oldOps = JSON.parse(await o.text()); } catch { /* ниже скажем, что не получилось */ }
  if (!src || !item) return back(P.photoFail);
  const bmp = await createImageBitmap(src), W = bmp.width, H = bmp.height, photo = item.v && !item.art;
  const layer = cls => { const c = canvasOf(W, H); c.className = 'layer ' + cls; return c; };
  const paint = layer('ink'), lines = layer('over'), labels = layer('over'), hint = layer('over hint');
  const pg = paint.getContext('2d', { willReadFrequently: true }), lg = lines.getContext('2d'), tg = labels.getContext('2d'), hg = hint.getContext('2d');
  if (saved) { try { pg.drawImage(await createImageBitmap(saved), 0, 0, W, H); } catch { /* начнём с чистого листа */ } }
  // Действия ребёнка по порядку — из них потом собирается ускоренное видео. Если запись началась не с чистого листа,
  // видео начнётся с того, что уже было нарисовано.
  const ops = item.rec && Array.isArray(oldOps) ? oldOps : [], redoOps = [];
  const base = item.rec && ops.length ? null : (saved ? pg.getImageData(0, 0, W, H) : null);

  // --- картинка: цвета, яркость, линии, области ---
  const full = canvasOf(W, H), fg = full.getContext('2d', { willReadFrequently: true });
  fg.fillStyle = '#fff'; fg.fillRect(0, 0, W, H);
  fg.drawImage(bmp, 0, 0, W, H);
  const fpx = fg.getImageData(0, 0, W, H).data, gray = new Float32Array(W * H);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.3 * fpx[i * 4] + 0.59 * fpx[i * 4 + 1] + 0.11 * fpx[i * 4 + 2];
  // Сглаженные цвета картинки — для волшебной палочки (мягко, без зерна фотографии).
  const soft = [0, 1, 2].map(c => { const a = new Float32Array(W * H); for (let i = 0; i < a.length; i++) a[i] = fpx[i * 4 + c]; return item.art ? a : blur(blur(a, W, H, 3), W, H, 3); });
  let mask = null;
  const setAreas = () => {
    if (!item.v) { mask = new Uint8Array(W * H); for (let i = 0; i < mask.length; i++) mask[i] = fpx[i * 4 + 3] > 110 ? 1 : 0; return; }
    if (item.art) { // рисованная картинка: линии ровно по её цветам
      const ch = [0, 1, 2].map(c => { const a = new Uint8Array(W * H); for (let i = 0; i < a.length; i++) a[i] = fpx[i * 4 + c]; return a; });
      mask = artMask(ch, W, H);
      return;
    }
    // фотография: под рисунком, невидимо, лист поделён на крупные цветовые области — по ним работает заливка
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
  const setLines = () => {
    const img = lg.createImageData(W, H), d = img.data;
    let a;
    if (item.art || !item.v) a = mask.map(v => (v ? 255 : 0));                       // готовая картинка: её контуры
    else if ((item.style || 'ink') === 'ink') a = ink(gray, W, H, item.lv ?? 1).map(v => (v ? 255 : 0)); // фото: жирные контуры без теней
    else a = sketch(gray, W, H, item.lv ?? 1);                                          // фото: карандашный рисунок
    for (let i = 0; i < W * H; i++) { d[i * 4] = 43; d[i * 4 + 1] = 45; d[i * 4 + 2] = 66; d[i * 4 + 3] = a[i]; }
    lg.putImageData(img, 0, 0);
  };
  setAreas(); setLines();

  // --- действия: заливка, мазок, наклейка. Одни и те же функции рисуют и на листе, и в видео ---
  const absorb = photo ? 700 : 0;
  const dot = p => { // кружок вокруг касания — если заливать нечего
    const a = new Uint8Array(W * H), R = 14, cx = Math.round(p.x), cy = Math.round(p.y);
    for (let y = Math.max(0, cy - R); y <= Math.min(H - 1, cy + R); y++) for (let xx = Math.max(0, cx - R); xx <= Math.min(W - 1, cx + R); xx++) if ((xx - cx) ** 2 + (y - cy) ** 2 <= R * R) a[y * W + xx] = 1;
    return a;
  };
  function doFill(g, op) {
    const area = floodFill(mask, W, H, op.x, op.y, op.exact ? 0 : absorb) || dot(op);
    const img = g.getImageData(0, 0, W, H), d = img.data;
    let [r, gr, b] = op.c === 'rainbow' || op.magic ? [0, 0, 0] : rgbOf(op.c);
    for (let i = 0; i < area.length; i++) if (area[i]) {
      if (op.magic) { r = soft[0][i]; gr = soft[1][i]; b = soft[2][i]; }               // волшебная палочка: настоящие цвета картинки
      else if (op.c === 'rainbow') [r, gr, b] = rainbow(Math.floor(i / W) / H + (i % W) / W / 3);
      d[i * 4] = r; d[i * 4 + 1] = gr; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  // Трафарет области: кисть красит только внутри участка, с которого начали, даже если палец съехал.
  const scratch = canvasOf(W, H), sc = scratch.getContext('2d');
  function clipOf(op) {
    if (!op.clip) return null;
    const area = floodFill(mask, W, H, op.clip[0], op.clip[1], 0);
    if (!area) return null;
    const c = canvasOf(W, H), g = c.getContext('2d'), img = g.createImageData(W, H);
    for (let i = 0; i < area.length; i++) if (area[i]) img.data[i * 4 + 3] = 255;
    g.putImageData(img, 0, 0);
    return c;
  }
  function doSeg(g, op, i, clip) { // i-й отрезок мазка
    const a = op.pts[Math.max(0, i - 1)], b = op.pts[i], t = clip ? sc : g;
    if (clip) sc.clearRect(0, 0, W, H);
    t.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over';
    t.strokeStyle = op.c === 'rainbow' ? `rgb(${rainbow((op.h0 + i * 0.012) % 1)})` : op.c; t.lineWidth = op.size; t.lineCap = t.lineJoin = 'round';
    t.beginPath(); t.moveTo(a[0], a[1]); t.lineTo(b[0], b[1]); t.stroke();
    t.globalCompositeOperation = 'source-over';
    if (clip) { sc.globalCompositeOperation = 'destination-in'; sc.drawImage(clip, 0, 0); sc.globalCompositeOperation = 'source-over'; g.drawImage(scratch, 0, 0); }
  }
  function doStamp(g, op) { g.font = `${op.size * 3}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(op.e, op.x, op.y); }

  // --- инструменты ---
  let color = COLORS[0], tool = 'fill', size = 26, cur = null, curClip = null, dirty = false, hue = 0, stamp = STAMPS[0], game = null, busy = false;
  const undo = [];
  const remember = () => { undo.push(pg.getImageData(0, 0, W, H)); if (undo.length > 12) undo.shift(); redoOps.length = 0; dirty = true; };
  const pos = e => { const r = paint.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)]; };
  const log = op => { if (ops.length < 4000) ops.push(op); };
  paint.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (busy) return;
    const [px, py] = pos(e);
    if (game) return gameTap(px, py);
    remember();
    if (tool === 'fill' || tool === 'magic') { const op = { t: 'fill', x: px, y: py, c: color, magic: tool === 'magic' ? 1 : 0 }; doFill(pg, op); log(op); return sfx('pop'); }
    if (tool === 'stamp') { const op = { t: 'stamp', x: px, y: py, e: stamp, size }; doStamp(pg, op); log(op); return sfx('pop'); }
    try { paint.setPointerCapture(e.pointerId); } catch { /* не страшно */ }
    // На картинках с контурами кисть не выходит за участок; на фотографии границ не видно, поэтому там кисть свободная.
    cur = { t: 'stroke', c: color, size, erase: tool === 'erase' ? 1 : 0, h0: hue, clip: !photo && tool === 'brush' ? [px, py] : null, pts: [[px, py]] };
    curClip = clipOf(cur);
    doSeg(pg, cur, 0, curClip);
  });
  paint.addEventListener('pointermove', e => {
    if (!cur) return;
    e.preventDefault();
    const p = pos(e), last = cur.pts[cur.pts.length - 1];
    if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 3) return;
    cur.pts.push(p);
    doSeg(pg, cur, cur.pts.length - 1, curClip);
  });
  const up = () => { if (!cur) return; hue = (hue + cur.pts.length * 0.012) % 1; log(cur); cur = curClip = null; };
  paint.addEventListener('pointerup', up); paint.addEventListener('pointercancel', up);
  const stepBack = () => { const last = undo.pop(); if (!last) return; pg.putImageData(last, 0, 0); const op = ops.pop(); if (op) redoOps.push(op); sfx('tap'); if (game) gameSync(); };
  const stepForward = () => { const op = redoOps.pop(); if (!op) return; undo.push(pg.getImageData(0, 0, W, H)); applyOp(pg, op); ops.push(op); sfx('tap'); if (game) gameSync(); };
  function applyOp(g, op) {
    if (op.t === 'fill') doFill(g, op);
    else if (op.t === 'stamp') doStamp(g, op);
    else { const clip = clipOf(op); for (let i = 0; i < op.pts.length; i++) doSeg(g, op, i, clip); }
  }

  // --- участки картинки (для раскраски по буквам и примерам и для лампочки) ---
  let regions = null, palette = null;
  function findRegions() {
    if (regions) return;
    const { id, size: sz } = spots(mask, W, H), n = sz.length, INF = 9999;
    // расстояние каждой точки до ближайшей линии — чтобы поставить подпись в самое просторное место участка
    const dist = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const i = y * W + xx; dist[i] = mask[i] ? 0 : Math.min(INF, (xx ? dist[i - 1] : 0) + 1, (y ? dist[i - W] : 0) + 1); }
    for (let y = H - 1; y >= 0; y--) for (let xx = W - 1; xx >= 0; xx--) { const i = y * W + xx; if (mask[i]) continue; dist[i] = Math.min(dist[i], (xx < W - 1 ? dist[i + 1] : 0) + 1, (y < H - 1 ? dist[i + W] : 0) + 1); }
    const best = new Int32Array(n).fill(-1), sum = Array.from({ length: n }, () => [0, 0, 0]);
    for (let i = 0; i < W * H; i++) { const k = id[i]; if (k < 0) continue; if (best[k] < 0 || dist[i] > dist[best[k]]) best[k] = i; const s = sum[k]; s[0] += soft[0][i]; s[1] += soft[1][i]; s[2] += soft[2][i]; }
    const bg = id[W + 1];
    palette = []; regions = [];
    for (let k = 0; k < n; k++) {
      if (k === bg || sz[k] < 260) continue;
      const c = sum[k].map(v => v / sz[k]);
      if (Math.min(...c) > 232) continue;                               // белые места остаются белыми
      let pi = palette.findIndex(q => far(q, c) < 50);
      if (pi < 0) { palette.push(c); pi = palette.length - 1; }
      regions.push({ k, pi, x: best[k] % W, y: Math.floor(best[k] / W), room: dist[best[k]], size: sz[k], done: false, text: '' });
    }
    regions.id = id;
  }
  // --- раскраска по буквам ('abc') и по примерам ('num'): верный ответ даёт цвет ---
  let chosen = -1, keys = [];
  function gameStart(mode) {
    findRegions();
    if (!palette.length) return;
    game = mode; item.game = mode; store.save();
    const r = makeRng(+id.replace(/\D/g, '').slice(-8) + (mode === 'abc' ? 1 : 2));
    if (mode === 'abc') { // буквы — только те, что ребёнок уже прошёл (не меньше пяти первых)
      const known = shuffle(r, ORDER.slice(0, Math.max(5, lettersKnown(store))).split(''));
      keys = palette.map((_, i) => known[i % known.length]);
      for (const g of regions) g.text = keys[g.pi];
    } else {              // примеры — по тому, что пройдено в счёте: числа, сложение до 5, до 10, до 20
      const done = k => { const isl = ISLANDS.find(i => i.id === k); return !!isl && store.islandDone(isl); };
      const kind = done('m5') ? 'am20n' : done('m3') ? 'am10' : done('m2') ? 'a5' : null;
      const pool = kind ? examplePool(kind, r) : new Map(); // ответ → примеры с таким ответом
      const answers = kind ? shuffle(r, [...pool.keys()]).slice(0, palette.length) : shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, palette.length);
      keys = palette.map((_, i) => answers[i % answers.length]);
      const used = {};
      for (const g of regions) { const a = keys[g.pi], list = kind ? pool.get(a) : [String(a)]; used[a] = (used[a] || 0) + 1; g.text = list[(used[a] - 1) % list.length]; }
    }
    chosen = -1;
    gameSync(); drawPalette(); setRows();
    say(mode === 'abc' ? P.gameAbc : P.gameNum);
  }
  const tight = g => g.room < (g.text.length > 2 ? 19 : g.text.length > 1 ? 13 : 9);
  // Какие участки уже раскрашены верно — смотрим на сам лист (так «шаг назад» ничего не путает).
  function gameSync() {
    const d = pg.getImageData(0, 0, W, H).data;
    for (const g of regions) { const i = (g.y * W + g.x) * 4; g.done = d[i + 3] > 128 && far([d[i], d[i + 1], d[i + 2]], palette[g.pi]) < 24; }
    tg.clearRect(0, 0, W, H);
    for (const g of regions) {
      if (g.done) continue;
      if (tight(g)) continue; // слишком тесно для подписи — такой участок закрасится сам вместе с первым верным ответом этого цвета
      const fs = Math.max(15, Math.min(g.text.length > 1 ? 28 : 34, g.room * (g.text.length > 2 ? 0.8 : 1.05)));
      tg.font = `800 ${fs}px "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`; tg.textAlign = 'center'; tg.textBaseline = 'middle';
      const w = tg.measureText(g.text).width + fs * 0.5, hh = fs * 1.25;
      tg.fillStyle = '#ffffffee'; tg.strokeStyle = '#2b2d42'; tg.lineWidth = 2;
      tg.beginPath(); tg.roundRect(g.x - w / 2, g.y - hh / 2, w, hh, hh / 2); tg.fill(); tg.stroke();
      tg.fillStyle = '#2b2d42'; tg.fillText(g.text, g.x, g.y + 1);
    }
  }
  const gameFill = g => { const op = { t: 'fill', x: g.x, y: g.y, c: hex(palette[g.pi]), exact: 1 }; doFill(pg, op); log(op); };
  function gameTap(px, py) {
    if (chosen < 0) { stage.classList.add('shake'); setTimeout(() => stage.classList.remove('shake'), 500); return say(game === 'abc' ? P.gameAbc : P.gameNum); }
    let k = -1;
    for (let r = 0; r <= 8 && k < 0; r++) for (let dy = -r; dy <= r && k < 0; dy++) for (let dx = -r; dx <= r; dx++) { const xx = px + dx, y = py + dy; if (xx >= 0 && y >= 0 && xx < W && y < H && regions.id[y * W + xx] >= 0) { k = regions.id[y * W + xx]; break; } }
    const g = regions.find(q => q.k === k);
    if (!g || g.done) return;
    if (g.pi !== chosen) { sfx('miss'); stage.classList.add('shake'); setTimeout(() => stage.classList.remove('shake'), 500); return; } // не тот ответ — мягко покачали
    remember();
    gameFill(g);
    for (const q of regions) if (q.pi === chosen && tight(q) && !q.done) gameFill(q); // тесные участки этого цвета — заодно
    sfx('ok'); gameSync();
    if (regions.every(q => q.done) && !item.won) { item.won = 1; store.save(); sfx('island'); say(P.gameDone); }
  }
  const gameStop = () => { game = null; item.game = null; store.save(); tg.clearRect(0, 0, W, H); setRows(); };

  // --- лампочка: подсветить то, что ещё не закрашено ---
  function bulb() {
    findRegions();
    const d = pg.getImageData(0, 0, W, H).data, { id, size: sz } = spots(mask, W, H), empty = new Int32Array(sz.length);
    for (let i = 0; i < W * H; i++) if (id[i] >= 0 && d[i * 4 + 3] < 128) empty[id[i]]++;
    const img = hg.createImageData(W, H);
    let any = false;
    const want = k => (game ? regions.some(g => g.k === k && !g.done) : sz[k] > 350 && empty[k] > sz[k] * 0.6);
    const yes = sz.map((_, k) => want(k));
    for (let i = 0; i < W * H; i++) if (id[i] >= 0 && yes[id[i]] && d[i * 4 + 3] < 128) { img.data[i * 4] = 255; img.data[i * 4 + 1] = 212; img.data[i * 4 + 2] = 59; img.data[i * 4 + 3] = 235; any = true; }
    hg.putImageData(img, 0, 0);
    hint.classList.add('on'); sfx(any ? 'pop' : 'star');
    setTimeout(() => { hint.classList.remove('on'); hg.clearRect(0, 0, W, H); }, 2600);
  }

  // --- панели кнопок ---
  const pickOne = (box, cls, el) => box.querySelectorAll('.' + cls).forEach(q => q.classList.toggle('sel', q === el));
  const colors = h('div', { class: 'board-tools' }), gamePal = h('div', { class: 'board-tools' }), tools = h('div', { class: 'board-tools' }), extra = h('div', { class: 'board-tools' });
  COLORS.forEach((c, i) => { const b = h('button', { class: 'color' + (i ? '' : ' sel') + (c === '#ffffff' ? ' white' : c === 'rainbow' ? ' rainbow' : ''), style: c === 'rainbow' ? '' : `background:${c}`, 'aria-label': 'цвет', onclick: () => { color = c; pickOne(colors, 'color', b); if (tool === 'erase' || tool === 'magic' || tool === 'stamp') setTool('fill'); } }); colors.append(b); });
  function drawPalette() { // цвета с подписями: буква или число
    gamePal.replaceChildren(...palette.map((c, i) => { const b = h('button', { class: 'color keyed', style: `background:${hex(c)}`, 'aria-label': 'цвет с подписью', onclick: () => { chosen = i; pickOne(gamePal, 'keyed', b); sfx('tap'); say(game === 'abc' ? tokL(keys[i]) : String(keys[i])); } }, h('b', {}, String(keys[i]))); return b; }));
  }
  const toolBtns = {};
  const stamps = h('div', { class: 'board-tools hidden-row' });
  STAMPS.forEach((e, i) => { const b = h('button', { class: 'tool-btn stamp-btn' + (i ? '' : ' sel'), 'aria-label': 'наклейка', onclick: () => { stamp = e; pickOne(stamps, 'stamp-btn', b); sfx('tap'); } }, e); stamps.append(b); });
  const sizes = h('span', { class: 'sizes off' });
  const setTool = t => { tool = t; for (const [k, b] of Object.entries(toolBtns)) b.classList.toggle('sel', k === t); sizes.classList.toggle('off', t === 'fill' || t === 'magic'); stamps.classList.toggle('hidden-row', t !== 'stamp'); };
  for (const [t, icon, label] of [['fill', '🪣', 'заливка'], ['brush', '🖌️', 'кисть'], ['magic', '🪄', 'волшебная палочка: цвет как на картинке'], ['stamp', '⭐', 'наклейки'], ['erase', '🧽', 'ластик']])
    tools.append(toolBtns[t] = h('button', { class: 'tool-btn' + (t === 'fill' ? ' sel' : ''), 'aria-label': label, onclick: () => { sfx('tap'); setTool(t); } }, icon));
  [[12, 's'], [26, 'm'], [46, 'l']].forEach(([sz, k]) => { const b = h('button', { class: `size size-${k}` + (sz === size ? ' sel' : ''), 'aria-label': 'толщина кисти', onclick: () => { size = sz; pickOne(sizes, 'size', b); } }, h('i')); sizes.append(b); });
  tools.append(sizes, h('button', { class: 'tool-btn', 'aria-label': 'вернуть', onclick: stepForward }, '↪️'));
  // Вторая строка: режимы (для готовых картинок), вид рисунка (для фото), печать, видео, 3D.
  const modeBtns = {};
  if (item.art) for (const [m, label, aria] of [[null, '🎨', 'раскрашивать как хочу'], ['abc', 'АБВ', 'раскраска по буквам'], ['num', '1+2', 'раскраска по примерам']])
    extra.append(modeBtns[m] = h('button', { class: 'tool-btn mode-btn', 'aria-label': aria, onclick: () => { sfx('tap'); m ? gameStart(m) : gameStop(); } }, label));
  if (photo) {
    const styleBtn = h('button', { class: 'tool-btn', 'aria-label': 'жирные контуры или карандаш', onclick: () => { item.style = (item.style || 'ink') === 'ink' ? 'pencil' : 'ink'; store.save(); setLines(); styleBtn.textContent = item.style === 'ink' ? '🖊️' : '✏️'; sfx('tap'); } }, (item.style || 'ink') === 'ink' ? '🖊️' : '✏️');
    const lv = h('span', { class: 'sizes' });
    [0, 1, 2].forEach(n => { const b = h('button', { class: 'tool-btn lines-btn' + (n === (item.lv ?? 1) ? ' sel' : ''), 'aria-label': ['мало линий', 'средне линий', 'много линий'][n], onclick: () => { item.lv = n; store.save(); setLines(); pickOne(lv, 'lines-btn', b); sfx('tap'); } }, h('span', { class: 'lv lv' + n })); lv.append(b); });
    extra.append(styleBtn, lv);
  }
  extra.append(h('button', { class: 'tool-btn', 'aria-label': 'распечатать', onclick: () => print() }, '🖨️'),
    h('button', { class: 'tool-btn', 'aria-label': 'видео: как я рисовал', onclick: () => replay() }, '🎬'),
    h('button', { class: 'tool-btn', 'aria-label': 'объёмный рисунок', onclick: () => cube() }, '🧊'));
  function setRows() { // в игре вместо обычных красок — краски с подписями, а кисти спрятаны
    colors.classList.toggle('hidden-row', !!game); tools.classList.toggle('hidden-row', !!game); gamePal.classList.toggle('hidden-row', !game);
    if (game) stamps.classList.add('hidden-row');
    for (const [m, b] of Object.entries(modeBtns)) b.classList.toggle('sel', String(game) === m);
  }

  // --- сохранение ---
  const compose = side => { const k = side / Math.max(W, H), c = canvasOf(Math.round(W * k), Math.round(H * k)), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(paint, 0, 0, c.width, c.height); g.drawImage(lines, 0, 0, c.width, c.height); return c; };
  const keep = async () => { // краска, действия и картинка для полки — чтобы продолжить в другой раз
    try {
      await idb.put('photos', id + '-p', await toBlob(paint));
      await idb.put('photos', id + '-t', await toBlob(compose(300), 'image/jpeg', 0.8));
      if (ops.length < 4000) { await idb.put('photos', id + '-o', new Blob([JSON.stringify(ops)])); if (!base) item.rec = 1; }
      store.save();
    } catch { /* мало места — раскраска останется как была */ }
  };
  // Раскрашенный помощник: его новые цвета переходят в уроки, на карту и в домик.
  function heroColors() {
    if (item.art !== 'hero') return false;
    const d = pg.getImageData(0, 0, W, H).data;
    let changed = false;
    for (const [part, def] of Object.entries(HERO_DEFAULT)) {
      const want = rgbOf(def), bins = new Map();
      let all = 0, painted = 0;
      for (let i = 0; i < W * H; i += 2) {
        if (far([fpx[i * 4], fpx[i * 4 + 1], fpx[i * 4 + 2]], want) > 24) continue;
        all++;
        if (d[i * 4 + 3] < 128) continue;
        painted++;
        const k = ((d[i * 4] >> 3) << 10) | ((d[i * 4 + 1] >> 3) << 5) | (d[i * 4 + 2] >> 3), b = bins.get(k);
        if (b) { b[0] += d[i * 4]; b[1] += d[i * 4 + 1]; b[2] += d[i * 4 + 2]; b[3]++; } else bins.set(k, [d[i * 4], d[i * 4 + 1], d[i * 4 + 2], 1]);
      }
      if (!all || painted < all * 0.5) continue;                       // эта часть не раскрашена — остаётся прежней
      const top = [...bins.values()].sort((a, b) => b[3] - a[3])[0], c = hex([top[0] / top[3], top[1] / top[3], top[2] / top[3]]);
      if (store.profile.hero[part] !== c) { store.profile.hero[part] = c; changed = true; }
    }
    if (changed) { store.profile.heroDone = true; store.save(); }
    return changed;
  }
  const leave = async note => { if (busy) return; await keep(); back(note); };
  const finish = async () => {
    if (busy) return;
    if (!dirty && !saved) return say(P.needDraw2);
    keepArt(store, compose(480).toDataURL('image/jpeg', 0.78));
    const fresh = heroColors();
    sfx('star');
    leave(fresh ? P.heroNew : P.photoSaved);
  };
  const remove = () => { const list = store.part('colorings', []), i = list.indexOf(item); if (i >= 0) list.splice(i, 1); dropPage(id); store.save(); back(); };
  const print = () => { // лист А4: раскраска как есть (нераскрашенную можно красить карандашами, поделку — вырезать)
    document.getElementById('print')?.remove();
    const page = h('div', { id: 'print', class: 'album' }, h('img', { src: compose(1400).toDataURL('image/png'), alt: '', style: 'width:100%' }));
    document.body.append(page);
    window.addEventListener('afterprint', () => page.remove(), { once: true });
    window.print();
  };

  // --- ускоренное видео: как я рисовал (около десяти секунд) ---
  async function replay() {
    if (busy) return;
    if (!ops.length) return say(P.needDraw2);
    busy = true;
    const view = layer('over replay'), vg = view.getContext('2d'), rp = canvasOf(W, H), rg = rp.getContext('2d', { willReadFrequently: true });
    if (base) rg.putImageData(base, 0, 0);
    const frame = () => { vg.fillStyle = '#fff'; vg.fillRect(0, 0, W, H); vg.drawImage(rp, 0, 0); vg.drawImage(lines, 0, 0); };
    const steps = [];
    for (const op of ops) {
      if (op.t === 'fill') steps.push(() => doFill(rg, op));
      else if (op.t === 'stamp') steps.push(() => doStamp(rg, op));
      else { let clip; for (let i = 0; i < op.pts.length; i += 3) steps.push(() => { if (clip === undefined) clip = clipOf(op); for (let j = i; j < Math.min(op.pts.length, i + 3); j++) doSeg(rg, op, j, clip); }); }
    }
    const per = Math.max(1, Math.ceil(steps.length / 280)), wait = Math.max(34, Math.min(160, 10000 / Math.ceil(steps.length / per)));
    frame(); stage.append(view);
    let rec = null; const chunks = [];
    try {
      const type = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
      if (type && view.captureStream) { rec = new MediaRecorder(view.captureStream(30), { mimeType: type }); rec.ondataavailable = e => e.data.size && chunks.push(e.data); rec.start(); }
    } catch { rec = null; }
    say(P.videoPlay);
    for (let i = 0; i < steps.length; i += per) { for (let j = i; j < Math.min(steps.length, i + per); j++) steps[j](); frame(); await sleep(wait); }
    for (let i = 0; i < 20; i++) { frame(); await sleep(50); } // секунда на готовый рисунок
    sfx('star');
    if (rec) {
      const blob = await new Promise(ok => { rec.onstop = () => ok(new Blob(chunks, { type: rec.mimeType })); rec.stop(); });
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm', file = new File([blob], `risunok-${today()}.${ext}`, { type: blob.type });
      const close = () => { panel.remove(); view.remove(); busy = false; };
      const panel = h('div', { class: 'opts video-row' },
        navigator.canShare?.({ files: [file] }) ? ibtn('📤', 'отправить видео', () => navigator.share({ files: [file] }).catch(() => {})) : null,
        ibtn('💾', 'сохранить видео', () => { const a = h('a', { href: URL.createObjectURL(blob), download: file.name }); document.body.append(a); a.click(); a.remove(); }),
        ibtn('✔', 'закрыть видео', close, 'play'));
      stage.after(panel);
    } else { await sleep(800); view.remove(); busy = false; }
  }

  // --- рисунок в объёме: кубик, который можно крутить пальцем ---
  function cube() {
    if (busy) return;
    const url = compose(512).toDataURL('image/jpeg', 0.85), side = `background-image:url(${url})`;
    const box = h('div', { class: 'cube' }, ['front', 'back', 'right', 'left', 'top', 'bottom'].map(f => h('div', { class: 'face ' + f, style: side })));
    const scene = h('div', { class: 'cube-scene' }, box);
    let rx = -18, ry = 28, drag = null, spin = true;
    const turn = () => { box.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; };
    scene.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; spin = false; try { scene.setPointerCapture(e.pointerId); } catch { /* не страшно */ } });
    scene.addEventListener('pointermove', e => { if (!drag) return; ry += (e.clientX - drag[0]) * 0.6; rx = Math.max(-80, Math.min(80, rx - (e.clientY - drag[1]) * 0.6)); drag = [e.clientX, e.clientY]; turn(); });
    const stop = () => { drag = null; };
    scene.addEventListener('pointerup', stop); scene.addEventListener('pointercancel', stop);
    const timer = setInterval(() => { if (!scene.isConnected) return clearInterval(timer); if (spin) { ry += 0.8; turn(); } }, 33);
    turn();
    screen('level cube-screen', h('div', { class: 'bar' }, ibtn('◀', 'к раскраске', () => { clearInterval(timer); openPage(x, id, back); }), h('span', { class: 'grow' }), ibtn('🔊', 'послушать', () => say(P.cube), 'speak')), scene);
    say(P.cube);
  }

  // --- экран ---
  // Образец — маленькая картинка в уголке; нажатие прячет её или показывает снова.
  const sample = item.v ? h('button', { class: 'photo-sample' + (item.art ? ' hide' : ''), 'aria-label': 'образец', onclick: () => sample.classList.toggle('hide') }, h('img', { src: URL.createObjectURL(src), alt: '' })) : null;
  const stage = h('div', { class: 'board-stage', style: `aspect-ratio:${W}/${H};--ar:${(W / H).toFixed(3)}` }, paint, lines, labels, hint, sample);
  screen('level', h('div', { class: 'bar' }, ibtn('◀', 'к раскраскам', () => leave()), twice(ibtn('🗑️', 'убрать эту раскраску: нажать два раза', remove, 'small')), h('span', { class: 'grow' }),
    ibtn('💡', 'подсказка: что ещё не закрашено', bulb), ibtn('↩️', 'шаг назад', stepBack, 'undo'),
    h('button', { class: 'check', 'aria-label': 'готово', onclick: finish }, '✔'), ibtn('🔊', 'послушать', () => say(game === 'abc' ? P.gameAbc : game === 'num' ? P.gameNum : P.photoReady), 'speak')),
  h('div', { class: 'task' }, h('div', { class: 'board' }, stage, colors, gamePal, stamps, tools, extra)));
  setRows();
  if (!saved) keep();
  if (item.art && item.game) gameStart(item.game); else say(P.photoReady);
}
