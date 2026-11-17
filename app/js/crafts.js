// ПОДЕЛКИ: ракета, маска, воздушный змей, динозавр. Сначала ребёнок собирает поделку из деталей
// (нажал на деталь — она встала на место), потом раскрашивает её как обычную раскраску.
// Готовую поделку можно распечатать и вырезать.

import { h } from './util.js';
import { P } from './phrases.js';
import { sfx } from './audio.js';

const S = 'stroke="#2b2d42" stroke-width="4" stroke-linejoin="round"';
// Запись: [имя, [детали в порядке рисования — снизу вверх]]. Каждая деталь — кусочек картинки 200 × 200.
export const CRAFTS = [
  ['rocket', [
    `<path d="M68 112 L38 162 L68 150Z" fill="#ff6b6b" ${S}/>`,
    `<path d="M132 112 L162 162 L132 150Z" fill="#ff6b6b" ${S}/>`,
    `<path d="M82 150 Q100 198 118 150Z" fill="#ffd43b" ${S}/>`,
    `<path d="M100 18 C132 50 138 100 132 150 H68 C62 100 68 50 100 18Z" fill="#dee2e6" ${S}/>`,
    `<path d="M100 18 C113 32 121 46 125 62 H75 C79 46 87 32 100 18Z" fill="#ff922b" ${S}/>`,
    `<circle cx="100" cy="92" r="17" fill="#74c0fc" ${S}/>`,
  ]],
  ['mask', [
    `<path d="M44 68 L28 16 L88 42Z" fill="#ff922b" ${S}/>`,
    `<path d="M156 68 L172 16 L112 42Z" fill="#ff922b" ${S}/>`,
    `<path d="M40 60 Q100 28 160 60 Q172 122 100 174 Q28 122 40 60Z" fill="#ffa94d" ${S}/>`,
    `<path d="M68 122 Q100 106 132 122 Q122 160 100 170 Q78 160 68 122Z" fill="#ffe8cc" ${S}/>`,
    `<ellipse cx="72" cy="92" rx="16" ry="12" fill="#ffffff" ${S}/>`,
    `<ellipse cx="128" cy="92" rx="16" ry="12" fill="#ffffff" ${S}/>`,
    `<ellipse cx="100" cy="128" rx="10" ry="7" fill="#2b2d42" ${S}/>`,
  ]],
  ['kite', [
    `<path d="M100 150 Q122 164 100 178 Q82 188 100 197" fill="none" ${S}/>`,
    `<path d="M100 14 L44 84 L100 84Z" fill="#ff6b6b" ${S}/>`,
    `<path d="M100 14 L156 84 L100 84Z" fill="#ffd43b" ${S}/>`,
    `<path d="M44 84 L100 152 L100 84Z" fill="#51cf66" ${S}/>`,
    `<path d="M156 84 L100 152 L100 84Z" fill="#339af0" ${S}/>`,
    `<path d="M90 162 L112 170 L92 180Z" fill="#f783ac" ${S}/>`,
  ]],
  ['dino', [
    `<path d="M148 110 Q186 106 194 142 Q170 132 150 138Z" fill="#8ce99a" ${S}/>`,
    `<rect x="76" y="138" width="20" height="40" rx="7" fill="#40c057" ${S}/>`,
    `<rect x="120" y="138" width="20" height="40" rx="7" fill="#40c057" ${S}/>`,
    `<ellipse cx="106" cy="120" rx="52" ry="32" fill="#69db7c" ${S}/>`,
    `<path d="M70 108 Q48 62 60 38 Q70 20 90 28 Q102 36 94 50 Q84 54 82 64 Q84 90 98 102Z" fill="#8ce99a" ${S}/>`,
    `<path d="M88 94 l9-16 l9 16z M112 90 l9-16 l9 16z M136 96 l9-16 l9 16z" fill="#ffa94d" ${S}/>`,
    `<circle cx="76" cy="40" r="5" fill="#2b2d42"/>`,
  ]],
];
const wrap = body => `<svg viewBox="0 0 200 200">${body}</svg>`;
// Вся поделка одной картинкой.
export const craftSVG = key => wrap(CRAFTS.find(c => c[0] === key)[1].join(''));
// Бледная тень детали — место, куда она встанет.
const ghost = part => part.replace(/fill="#[0-9a-f]{6}"/, 'fill="#f1f3f5"').replace(/stroke="#2b2d42"/, 'stroke="#ced4da" stroke-dasharray="6 6"');

// Экран сборки. done() вызывается, когда все детали на месте и ребёнок нажал «дальше».
export function craftScreen(x, key, back, done) {
  const { screen, ibtn, say } = x;
  const parts = CRAFTS.find(c => c[0] === key)[1], placed = new Set();
  const stage = h('div', { class: 'craft-stage' }), tray = h('div', { class: 'craft-tray' }), next = ibtn('▶', 'раскрасить', done, 'play hidden');
  const draw = () => { stage.innerHTML = wrap(parts.map((p, i) => (placed.has(i) ? p : ghost(p))).join('')); };
  // Детали лежат вперемешку (порядок одинаковый при каждом открытии), нажатие ставит деталь на место.
  const order = parts.map((_, i) => i).sort((a, b) => ((a * 7 + 3) % parts.length) - ((b * 7 + 3) % parts.length));
  for (const i of order) {
    const b = h('button', { class: 'craft-piece', 'aria-label': 'деталь', html: wrap(parts[i]), onclick: () => {
      if (placed.has(i)) return;
      placed.add(i); b.classList.add('used'); sfx('pop'); draw();
      if (placed.size === parts.length) { sfx('star'); next.classList.remove('hidden'); say(P.craftDone); }
    } });
    tray.append(b);
    // Деталь на кнопке показываем крупно: рамка картинки сжимается до самой детали.
    requestAnimationFrame(() => { try { const svg = b.querySelector('svg'), q = svg.firstElementChild.getBBox(), pad = 8, side = Math.max(q.width, q.height) + pad * 2; svg.setAttribute('viewBox', `${q.x + q.width / 2 - side / 2} ${q.y + q.height / 2 - side / 2} ${side} ${side}`); } catch { /* останется мелкой */ } });
  }
  draw();
  screen('level', h('div', { class: 'bar' }, ibtn('◀', 'назад', back), h('span', { class: 'grow' }), ibtn('🔊', 'послушать', () => say(P.craftHello), 'speak')), stage, tray, next);
  say(P.craftHello);
}
