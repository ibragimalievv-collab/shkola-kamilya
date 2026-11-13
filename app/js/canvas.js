// ХОЛСТ ДЛЯ РИСОВАНИЯ И ПИСЬМА ПАЛЬЦЕМ.
// Один и тот же холст служит для свободных рисунков, для обводки букв по пунктиру и для письма.

import { h } from './util.js';

const COLORS = ['#2b2d42', '#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#f15bb5'];
const FONT = '700 {S}px "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';

// Размер холста во внутренних точках: широкий для альбомной ориентации, квадратный для книжной.
export function boardSize() {
  return typeof innerWidth !== 'undefined' && innerWidth < innerHeight ? [640, 560] : [900, 460];
}

// Создать холст. onStroke вызывается после каждого движения пальца.
export function makeBoard({ colors = true, brush = 16, onStroke } = {}) {
  const [W, H] = boardSize();
  const guide = h('canvas', { width: W, height: H, class: 'layer' });  // нижний слой: пунктир, линейки
  const ink = h('canvas', { width: W, height: H, class: 'layer ink' }); // верхний слой: то, что рисует ребёнок
  const g = ink.getContext('2d');
  const strokes = []; // все линии ребёнка: [{color, size, pts:[[x,y],…]}]
  let color = COLORS[0], size = brush, cur = null;

  const pos = e => {
    const r = ink.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  function seg(s, a, b) {
    g.strokeStyle = s.color; g.lineWidth = s.size; g.lineCap = g.lineJoin = 'round';
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  function redraw() {
    g.clearRect(0, 0, W, H);
    for (const s of strokes) for (let i = 0; i < s.pts.length; i++) seg(s, s.pts[Math.max(0, i - 1)], s.pts[i]);
  }
  ink.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { ink.setPointerCapture(e.pointerId); } catch { /* не страшно */ }
    cur = { color, size, pts: [pos(e)] };
    strokes.push(cur);
    seg(cur, cur.pts[0], cur.pts[0]);
    onStroke?.(cur.pts[0]);
  });
  ink.addEventListener('pointermove', e => {
    if (!cur) return;
    e.preventDefault();
    const p = pos(e), last = cur.pts[cur.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 3) return;
    cur.pts.push(p);
    seg(cur, last, p);
    onStroke?.(p);
  });
  const up = () => { if (cur) { cur = null; api.onUp?.(); } };
  ink.addEventListener('pointerup', up);
  ink.addEventListener('pointercancel', up);

  const api = {
    W, H, guide, strokes,
    stage: h('div', { class: 'board-stage', style: `aspect-ratio:${W}/${H};--ar:${(W / H).toFixed(3)}` }, guide, ink),
    // Сколько нарисовано: общая длина всех линий в точках холста.
    ink() {
      let n = 0;
      for (const s of strokes) { n += 4; for (let i = 1; i < s.pts.length; i++) n += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]); }
      return n;
    },
    clear() { strokes.length = 0; redraw(); api.onClear?.(); },
    // Добавить линию программно (нужно для показа ответа и самопроверки).
    addStroke(pts, col = '#2a9d8f') { const s = { color: col, size, pts }; strokes.push(s); redraw(); pts.forEach(p => onStroke?.(p)); },
    // Рисунок без фона, обрезанный по краям — чтобы нарисованный герой мог жить на карте и в задачах.
    cutout(max = 200) {
      const xs = strokes.flatMap(s => s.pts.map(p => p[0])), ys = strokes.flatMap(s => s.pts.map(p => p[1]));
      if (!xs.length) return null;
      const pad = 18, x0 = Math.max(0, Math.min(...xs) - pad), y0 = Math.max(0, Math.min(...ys) - pad);
      const w = Math.min(W, Math.max(...xs) + pad) - x0, hh = Math.min(H, Math.max(...ys) + pad) - y0, k = Math.min(1, max / Math.max(w, hh));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hh * k));
      c.getContext('2d').drawImage(ink, x0, y0, w, hh, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    },
    // Рисунок как картинка (уменьшенная, чтобы не занимать память).
    dataUrl() {
      const c = document.createElement('canvas'), k = 360 / W;
      c.width = 360; c.height = Math.round(H * k);
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(ink, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    },
  };

  // Панель: крупные кнопки цветов, толщина кисти, ластик-«стереть всё».
  const tools = h('div', { class: 'board-tools' });
  if (colors) {
    COLORS.forEach((c, i) => {
      const b = h('button', { class: 'color' + (i ? '' : ' sel'), style: `background:${c}`, 'aria-label': 'цвет', onclick: () => {
        color = c; tools.querySelectorAll('.color').forEach(x => x.classList.toggle('sel', x === b));
      } });
      tools.append(b);
    });
    [[10, 's'], [16, 'm'], [28, 'l']].forEach(([sz, k]) => {
      const b = h('button', { class: `size size-${k}` + (sz === brush ? ' sel' : ''), 'aria-label': 'толщина кисти', onclick: () => {
        size = sz; tools.querySelectorAll('.size').forEach(x => x.classList.toggle('sel', x === b));
      } }, h('i'));
      tools.append(b);
    });
  }
  tools.append(h('button', { class: 'tool-btn', 'aria-label': 'стереть всё', onclick: () => api.clear() }, '🧽'));
  api.el = h('div', { class: 'board' }, api.stage, tools);
  return api;
}

// ---------- дорожки для обводки: фигуры ----------
// Каждая фигура — ломаная линия в долях холста (0…1).
const arc = (cx, cy, rx, ry, a0, a1, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
const SHAPES = {
  hline: [[0.1, 0.5], [0.9, 0.5]],
  vline: [[0.5, 0.1], [0.5, 0.9]],
  slash: [[0.25, 0.88], [0.75, 0.12]],
  backslash: [[0.25, 0.12], [0.75, 0.88]],
  roof: [[0.15, 0.85], [0.5, 0.15], [0.85, 0.85]],
  zigzag: [[0.08, 0.8], [0.25, 0.2], [0.42, 0.8], [0.59, 0.2], [0.76, 0.8], [0.93, 0.2]],
  wave: Array.from({ length: 61 }, (_, i) => [0.06 + (0.88 * i) / 60, 0.5 - 0.28 * Math.sin((i / 60) * Math.PI * 4)]),
  hills: [...arc(0.22, 0.75, 0.14, 0.5, Math.PI, 2 * Math.PI, 20), ...arc(0.5, 0.75, 0.14, 0.5, Math.PI, 2 * Math.PI, 20), ...arc(0.78, 0.75, 0.14, 0.5, Math.PI, 2 * Math.PI, 20)],
  circle: null, // считаем ниже с учётом пропорций холста
  oval: arc(0.5, 0.5, 0.36, 0.34, -Math.PI / 2, 1.5 * Math.PI, 60),
  square: null,
  triangle: [[0.5, 0.1], [0.78, 0.88], [0.22, 0.88], [0.5, 0.1]],
  spiral: null,
  cross: [[0.3, 0.15], [0.7, 0.85], [0.5, 0.5], [0.7, 0.15], [0.3, 0.85]],
};
export function shapePath(kind, W, H) {
  const m = Math.min(W, H);
  if (kind === 'circle') return arc(W / 2, H / 2, m * 0.38, m * 0.38, -Math.PI / 2, 1.5 * Math.PI, 60);
  if (kind === 'square') { const s = m * 0.36, x = W / 2, y = H / 2; return [[x - s, y - s], [x + s, y - s], [x + s, y + s], [x - s, y + s], [x - s, y - s]]; }
  if (kind === 'spiral') return Array.from({ length: 91 }, (_, i) => { const a = (i / 90) * Math.PI * 5, r = m * 0.05 + (m * 0.36 * i) / 90; return [W / 2 + r * Math.cos(a), H / 2 + r * Math.sin(a)]; });
  return (SHAPES[kind] || SHAPES.hline).map(([x, y]) => [x * W, y * H]);
}
// Точки вдоль ломаной через каждые step точек холста.
function alongPath(path, step = 9) {
  const out = [];
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(d / step));
    for (let j = 0; j <= n; j++) out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
  }
  return out;
}

// Подобрать размер шрифта, чтобы текст поместился на холсте.
function fitFont(ctx, text, W, H, maxH = 0.82) {
  let s = Math.round(H * maxH);
  ctx.font = FONT.replace('{S}', s);
  const w = ctx.measureText(text).width;
  if (w > W * 0.9) s = Math.floor((s * W * 0.9) / w);
  ctx.font = FONT.replace('{S}', s);
  return s;
}

// Нарисовать пунктирный образец и вернуть «мишень» для проверки обводки:
// pts — точки, которые надо закрасить, R — насколько близко должен пройти палец.
export function drawGuide(board, { text, shape }) {
  const { W, H } = board, ctx = board.guide.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (shape) {
    const path = shapePath(shape, W, H);
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = '#e7f0ff'; ctx.lineWidth = 46; ctx.setLineDash([]);
    ctx.beginPath(); path.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    ctx.strokeStyle = '#74a7ff'; ctx.lineWidth = 6; ctx.setLineDash([4, 18]); ctx.stroke(); ctx.setLineDash([]);
    const a = path[0], z = path[path.length - 1];
    ctx.fillStyle = '#38b000'; ctx.beginPath(); ctx.arc(a[0], a[1], 16, 0, 7); ctx.fill();
    ctx.font = '40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (Math.hypot(a[0] - z[0], a[1] - z[1]) > 30) ctx.fillText('⭐', z[0], z[1]);
    return { pts: alongPath(path), R: 34, need: 0.9, path };
  }
  const s = fitFont(ctx, text, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e7f0ff';
  ctx.fillText(text, W / 2, H / 2);
  ctx.strokeStyle = '#74a7ff'; ctx.lineWidth = Math.max(2, s / 90); ctx.setLineDash([s / 40, s / 22]);
  ctx.strokeText(text, W / 2, H / 2);
  ctx.setLineDash([]);
  // Мишень: точки внутри букв, взятые по сетке.
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const o = off.getContext('2d');
  o.font = ctx.font; o.textAlign = 'center'; o.textBaseline = 'middle';
  o.fillText(text, W / 2, H / 2);
  const data = o.getImageData(0, 0, W, H).data, pts = [], step = Math.max(5, Math.round(s / 34));
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (data[(y * W + x) * 4 + 3] > 128) pts.push([x, y]);
  return { pts, R: Math.max(13, s * 0.085), need: 0.82 };
}

// Линейки для письма без образца.
export function drawLines(board) {
  const { W, H } = board, ctx = board.guide.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#cfe0ff'; ctx.lineWidth = 3; ctx.setLineDash([]);
  for (const y of [0.18, 0.82]) { ctx.beginPath(); ctx.moveTo(20, H * y); ctx.lineTo(W - 20, H * y); ctx.stroke(); }
  ctx.setLineDash([10, 14]); ctx.beginPath(); ctx.moveTo(20, H * 0.5); ctx.lineTo(W - 20, H * 0.5); ctx.stroke(); ctx.setLineDash([]);
}

// Счётчик обводки: сколько точек мишени уже закрашено.
export function makeCoverage(target) {
  const done = new Uint8Array(target.pts.length);
  let n = 0;
  return {
    add([x, y]) {
      const R2 = target.R * target.R;
      for (let i = 0; i < target.pts.length; i++) {
        if (done[i]) continue;
        const dx = target.pts[i][0] - x, dy = target.pts[i][1] - y;
        if (dx * dx + dy * dy <= R2) { done[i] = 1; n++; }
      }
    },
    reset() { done.fill(0); n = 0; },
    get ratio() { return target.pts.length ? n / target.pts.length : 1; },
    get complete() { return this.ratio >= target.need; },
  };
}
