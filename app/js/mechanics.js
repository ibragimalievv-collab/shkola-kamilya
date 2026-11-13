// ИГРОВЫЕ МЕХАНИКИ: как каждое задание выглядит на экране и как на него отвечают.
// Каждая механика получает задание t и «пульт» c:
//   c.root — куда рисовать;  c.ok() — решено верно;  c.miss() — ошибка (мягкая подсказка);
//   c.say(текст) — сказать вслух;  c.prompt(текст) — сказать и запомнить как текущий вопрос;
//   c.later(fn, мс) — сделать чуть позже;  c.locked — ввод закрыт (идёт показ ответа).
// Возвращает { reveal() — показать верный ответ, auto() — решить самому (для самопроверки) }.

import { h, shuffle, range } from './util.js';
import { sfx } from './audio.js';
import { makeBoard, drawGuide, drawLines, makeCoverage } from './canvas.js';
import { animalSVG } from './art.js';

// Кнопка, которая не нажимается, пока ввод закрыт.
const B = (c, cls, content, fn) => h('button', { class: cls, onclick: e => { if (c.locked) return; sfx('tap'); fn(e); } }, content);
const shake = (c, el) => { el.classList.add('shake'); c.later(() => el.classList.remove('shake'), 500); };
const isPic = s => !/[\p{L}\d]/u.test(s); // строка без букв и цифр — значит, картинка
// Содержимое варианта ответа: строка или { t: текст, flip: зеркально, small: мелко, say: что сказать }
const face = o => {
  const obj = typeof o === 'object' ? o : {}, t = String(obj.t ?? o);
  return h('span', { class: `${isPic(t) ? 'pic' : 'txt'}${obj.flip ? ' flip' : ''}${obj.small ? ' small' : ''}${t.length > 6 ? ' longish' : ''}` }, t);
};
const check = (c, fn) => B(c, 'check', '✔', fn);
const row = (cls, ...kids) => h('div', { class: cls }, ...kids);

// Цифровая клавиатура с окошком ответа.
function numpad(c, onSubmit) {
  let v = '';
  const out = h('div', { class: 'pad-out' }, '?');
  const upd = () => { out.textContent = v || '?'; };
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => B(c, 'key', String(d), () => { if (v.length < 3) v += d; upd(); }));
  keys.push(B(c, 'key back', '⌫', () => { v = v.slice(0, -1); upd(); }), B(c, 'key', '0', () => { if (v.length < 3) v += 0; upd(); }),
    B(c, 'key go', '✔', () => { if (v !== '') onSubmit(+v); }));
  return { out, el: h('div', { class: 'pad' }, ...keys), set: x => { v = String(x); upd(); }, clear: () => { v = ''; upd(); }, submit: () => onSubmit(+v) };
}

// ---------- 1–3. Собери все нужные: пузыри, рыбки, листочки ----------
function collect(t, c) {
  const isT = x => String(x).toUpperCase() === String(t.target).toUpperCase();
  let left = t.items.filter(isT).length;
  const els = t.items.map((x, i) => {
    const el = B(c, 'blob', h('span', {}, x), () => {
      if (el.classList.contains('gone')) return;
      if (isT(x)) { el.classList.add('gone'); sfx('pop'); if (--left === 0) c.ok(); } else { shake(c, el); c.miss(); }
    });
    el.style.setProperty('--d', `${-((i * 0.37) % 1) * 3}s`);
    el.dataset.t = isT(x) ? 1 : '';
    return el;
  });
  if (t.caption) c.root.append(h('div', { class: 'bigtext' }, t.caption));
  c.root.append(row('collect ' + t.m, ...els));
  const targets = () => els.filter(e => e.dataset.t && !e.classList.contains('gone'));
  return { reveal: () => targets().forEach(e => e.classList.add('glow')), auto: () => targets().forEach(e => e.click()) };
}

// ---------- 4–6. Выбери ответ: по картинке, на слух, по рассказу ----------
function pick(t, c) {
  const top = h('div', { class: 'show' });
  if (t.m === 'listen') top.append(B(c, 'bigspeak', '🔊', () => c.say(t.say)));
  if (t.m === 'story') top.append(h('div', { class: 'story' }, h('h3', {}, t.title), ...t.text.map(s => B(c, 'sent', s, () => c.say(s)))), h('div', { class: 'question' }, t.say));
  const sh = t.show || {};
  if (sh.big) top.append(h('div', { class: 'bigpic' }, sh.big));
  if (sh.text) top.append(h('div', { class: 'bigtext' + (sh.long ? ' long' : '') }, sh.text));
  const btns = t.opts.map((o, i) => B(c, 'opt', face(o), () => choose(i)));
  function choose(i) {
    if (i === t.a) { btns[i].classList.add('right'); c.ok(); } else { btns[i].classList.add('wrong'); btns[i].disabled = true; c.miss(); }
  }
  c.root.append(top, row('opts' + (t.longOpts ? ' col' : ''), ...btns));
  return { reveal: () => btns[t.a].classList.add('right', 'glow'), auto: () => choose(t.a) };
}

// ---------- 7. Перевёртыши: найди пару ----------
function memory(t, c) {
  const cards = shuffle(c.rng, t.pairs.flatMap(([a, b], p) => [{ v: a, p }, { v: b, p }]));
  let first = null, busy = false, left = t.pairs.length;
  const els = cards.map((card, i) => B(c, 'mcard', [h('span', { class: 'back' }, '★'), face(card.v)], () => open(i)));
  function open(i) {
    const el = els[i];
    if (busy || el.classList.contains('open')) return;
    el.classList.add('open');
    if (first === null) { first = i; return; }
    const a = first; first = null;
    if (cards[a].p === cards[i].p) { els[a].classList.add('done'); el.classList.add('done'); sfx('pop'); if (--left === 0) c.ok(); }
    else { busy = true; c.later(() => { els[a].classList.remove('open'); el.classList.remove('open'); busy = false; }, 900); }
  }
  c.root.append(row('memory', ...els));
  const solve = () => t.pairs.forEach((_, p) => cards.forEach((card, i) => { if (card.p === p && !els[i].classList.contains('done')) open(i); }));
  return { reveal: solve, auto: solve };
}

// ---------- 8. Соедини пары ----------
function pairs(t, c) {
  const L = t.pairs.map((p, i) => ({ o: p[0], i })), R = shuffle(c.rng, t.pairs.map((p, i) => ({ o: p[1], i })));
  let sel = null, left = t.pairs.length;
  const mkEl = (item, side) => {
    const el = B(c, 'pcard', face(item.o), () => {
      if (el.classList.contains('done')) return;
      if (typeof item.o === 'object' && item.o.say) c.say(item.o.say);
      if (!sel || sel.side === side) { sel?.el.classList.remove('sel'); sel = { side, item, el }; el.classList.add('sel'); return; }
      const other = sel; sel = null; other.el.classList.remove('sel');
      if (other.item.i === item.i) { [el, other.el].forEach(x => x.classList.add('done', 'm' + item.i)); sfx('pop'); if (--left === 0) c.ok(); }
      else { shake(c, el); shake(c, other.el); c.miss(); }
    });
    item.el = el;
    return el;
  };
  c.root.append(row('pairs', row('pcol', ...L.map(x => mkEl(x, 0))), row('pcol', ...R.map(x => mkEl(x, 1)))));
  const solve = cls => L.forEach(l => { const r = R.find(x => x.i === l.i); if (cls) [l.el, r.el].forEach(e => e.classList.add('done', 'm' + l.i)); else if (!l.el.classList.contains('done')) { sel?.el.classList.remove('sel'); sel = null; l.el.click(); r.el.click(); } });
  return { reveal: () => solve(true), auto: () => solve(false) };
}

// ---------- 9. Разложи по корзинам ----------
function baskets(t, c) {
  let k = 0;
  const cur = h('div', { class: 'bitem' });
  const bins = t.bins.map((b, i) => B(c, 'basket b' + i, [h('span', { class: 'bicon' }, b.icon || b.t), h('span', { class: 'bin-in' })], () => drop(i)));
  const show = () => { cur.textContent = t.items[k].t; cur.classList.remove('pop'); void cur.offsetWidth; cur.classList.add('pop'); };
  function drop(i) {
    if (t.items[k].bin !== i) { shake(c, bins[i]); return c.miss(); }
    bins[i].querySelector('.bin-in').append(h('i', {}, t.items[k].t));
    sfx('pop');
    if (++k === t.items.length) { cur.textContent = ''; c.ok(); } else show();
  }
  c.root.append(row('baskets', bins[0], cur, bins[1]));
  show();
  return { reveal: () => bins[t.items[k].bin].classList.add('glow'), auto: () => { while (k < t.items.length) drop(t.items[k].bin); } };
}

// ---------- 10. Собери слово из букв / предложение из слов ----------
function build(t, c) {
  let pos = 0;
  const slots = t.target.map(() => h('span', { class: 'slot' }));
  const tiles = shuffle(c.rng, [...t.target, ...(t.extra || [])]).map(v => {
    const el = B(c, 'tile', v, () => {
      if (el.classList.contains('used')) return;
      if (v !== t.target[pos]) { shake(c, el); return c.miss(); }
      slots[pos].textContent = v; slots[pos].classList.add('full'); el.classList.add('used'); sfx('pop');
      if (++pos === t.target.length) c.ok();
    });
    el.dataset.v = v;
    return el;
  });
  if (t.pic) c.root.append(B(c, 'bigpic tapme', t.pic, () => c.say(t.say)));
  c.root.append(row('build' + (t.wide ? ' wide' : ''), row('slots', ...slots), row('tiles', ...tiles)));
  return {
    reveal: () => slots.forEach((s, i) => { s.textContent = t.target[i]; s.classList.add('full', 'glow'); }),
    auto: () => { while (pos < t.target.length) tiles.find(e => e.dataset.v === t.target[pos] && !e.classList.contains('used')).click(); },
  };
}

// ---------- 11. Что пропущено? ----------
function missing(t, c) {
  const cells = t.cells.map(x => h('span', { class: 'cell' + (x === '_' ? ' gap' : '') }, x === '_' ? '?' : x));
  const gap = cells[t.cells.indexOf('_')];
  const btns = t.opts.map((o, i) => B(c, 'opt', face(o), () => choose(i)));
  const fill = () => { gap.textContent = t.opts[t.a]; gap.classList.add('filled'); };
  function choose(i) { if (i === t.a) { fill(); c.ok(); } else { btns[i].classList.add('wrong'); btns[i].disabled = true; c.miss(); } }
  if (t.pic) c.root.append(B(c, 'bigpic tapme', t.pic, () => c.say(t.say)));
  c.root.append(row('cells', ...cells), row('opts', ...btns));
  return { reveal: fill, auto: () => choose(t.a) };
}

// ---------- 12. Простучи слоги ----------
function claps(t, c) {
  let k = 0;
  const hands = B(c, 'hands', '', () => { k = 0; upd(); });
  const upd = () => { hands.textContent = '👏'.repeat(k) || '·'; };
  const drum = B(c, 'drum', '🥁', () => { if (k < 6) k++; sfx('pop'); upd(); });
  const word = h('div', { class: 'bigtext hidden' }, t.word);
  const go = () => { if (k === t.n) { word.classList.remove('hidden'); c.ok(); } else { k = 0; upd(); c.miss(); } };
  upd();
  c.root.append(B(c, 'bigpic tapme', t.pic, () => c.say(t.say)), word, hands, row('opts', drum, check(c, go)));
  return { reveal: () => { k = t.n; upd(); word.classList.remove('hidden'); }, auto: () => { k = t.n; go(); } };
}

// ---------- 13. Правда или шутка? Верно или нет? ----------
function truefalse(t, c) {
  const yes = B(c, 'opt thumb', '👍', () => choose(true)), no = B(c, 'opt thumb', '👎', () => choose(false));
  function choose(v) { const el = v ? yes : no; if (v === t.a) { el.classList.add('right'); c.ok(); } else { el.classList.add('wrong'); el.disabled = true; c.miss(); } }
  const text = t.canHear ? B(c, 'bigtext long tapme', t.text, () => c.say(t.text)) : h('div', { class: 'bigtext' }, t.text);
  c.root.append(text, row('opts', yes, no));
  return { reveal: () => (t.a ? yes : no).classList.add('right', 'glow'), auto: () => choose(t.a) };
}

// ---------- 14. Обведи по пунктиру ----------
function trace(t, c) {
  let cov = null, done = false;
  const b = makeBoard({ brush: 28, onStroke: p => { if (!cov || done) return; cov.add(p); if (cov.complete) { done = true; c.ok(); } } });
  const target = drawGuide(b, t);
  cov = makeCoverage(target);
  b.onClear = () => cov.reset();
  c.root.append(b.el);
  return { reveal: () => {}, auto: () => b.addStroke(target.pts) };
}

// ---------- 15. Напиши сам ----------
function copy(t, c) {
  const b = makeBoard({ brush: 16 });
  drawLines(b);
  const need = Math.min(500, 60 + 70 * t.text.replace(/\s/g, '').length);
  const go = () => (b.ink() >= need ? c.ok() : c.say('Сначала напиши на холсте, а потом нажми галочку.'));
  c.root.append(row('copy-top', h('div', { class: 'sample' }, t.text), check(c, go)), b.el);
  return { reveal: () => {}, auto: () => { b.addStroke([[20, 20], [20 + need, 20], [20, 60], [20 + need, 60]]); go(); } };
}

// ---------- 16. Свободный рисунок ----------
function draw(t, c) {
  const b = makeBoard({ brush: 16 });
  const go = () => { if (b.ink() < 150) return c.say('Нарисуй картинку, а потом нажми галочку.'); c.saveArt(b.dataUrl()); c.ok(); };
  c.root.append(row('copy-top', h('div', { class: 'sample' }, '🎨'), check(c, go)), b.el);
  return { reveal: () => {}, auto: () => { b.addStroke([[30, 30], [300, 200], [30, 200]]); go(); } };
}

// ---------- 17. Рисунок становится задачей ----------
function drawtask(t, c) {
  const b = makeBoard({ brush: 16 });
  let phase = 1, url = '', n = 0, pad = null, numBtns = [];
  const ans = () => (t.op === '×' ? t.fixed : t.ans(n));
  const img = () => h('img', { class: 'mydraw', src: url, alt: 'мой рисунок' });
  function drawn() {
    if (b.ink() < 100) return c.say('Сначала нарисуй, а потом нажми галочку.');
    url = b.dataUrl(); c.saveArt(url);
    if (t.op === '×') return ask();
    phase = 2;
    numBtns = range(1, t.max).map(k => B(c, 'opt', String(k), () => counted(k)));
    c.root.replaceChildren(img(), row('opts', ...numBtns));
    c.prompt(t.ask);
  }
  function counted(k) {
    n = k;
    if (!t.op) { c.say(t.done(n)); return c.ok(2600); }
    ask();
  }
  function ask() {
    phase = 3;
    pad = numpad(c, v => (v === ans() ? c.ok() : (pad.clear(), c.miss())));
    const more = t.op === '×' ? '' : `${t.op} ${t.obj[3].repeat(t.extra(n))}`;
    c.root.replaceChildren(row('dt-top', img(), h('div', { class: 'bigtext' }, more), h('div', { class: 'bigtext' }, '='), pad.out), pad.el);
    c.prompt(t.q(n));
  }
  c.root.append(row('copy-top', h('div', { class: 'sample' }, t.obj[3]), check(c, drawn)), b.el);
  return {
    reveal: () => { if (phase === 3) pad.set(ans()); },
    auto: () => { b.addStroke([[30, 30], [300, 200], [30, 200]]); drawn(); if (phase === 2) counted(1); if (phase === 3) { pad.set(ans()); pad.submit(); } },
  };
}

// ---------- 18. Посчитай предметы ----------
function count(t, c) {
  const cellsIdx = shuffle(c.rng, range(0, 19)).slice(0, t.n);
  const field = row('field', ...range(0, 19).map(i => h('span', { class: cellsIdx.includes(i) ? 'in' : '' }, cellsIdx.includes(i) ? t.emoji : '')));
  const btns = t.opts.map((o, i) => B(c, 'opt', face(o), () => choose(i)));
  function choose(i) { if (i === t.a) { btns[i].classList.add('right'); c.ok(); } else { btns[i].classList.add('wrong'); btns[i].disabled = true; c.miss(); } }
  c.root.append(field, row('opts', ...btns));
  return { reveal: () => btns[t.a].classList.add('right', 'glow'), auto: () => choose(t.a) };
}

// ---------- 19. Накорми зверя ----------
function feed(t, c) {
  const plate = row('plate'), bowl = row('bowl');
  const food = range(1, t.total).map(() => { const el = B(c, 'food', t.food, () => { (el.parentNode === plate ? bowl : plate).append(el); sfx('pop'); }); return el; });
  plate.append(...food);
  const fed = () => bowl.children.length;
  const go = () => (fed() === t.n ? c.ok() : c.miss());
  const set = () => { food.forEach((f, i) => (i < t.n ? bowl : plate).append(f)); };
  c.root.append(row('feed', h('div', { class: 'eater', html: animalSVG(c.islandN) }), bowl, check(c, go)), plate);
  return { reveal: set, auto: () => { set(); go(); } };
}

// ---------- 20. Поезд: расставь по порядку ----------
function train(t, c) {
  const sorted = [...t.nums].sort((a, b) => a - b);
  let pos = 0;
  const track = row('track', h('span', { class: 'loco' }, '🚂'));
  const cars = t.nums.map(v => {
    const el = B(c, 'car', String(v), () => {
      if (el.parentNode === track) return;
      if (v !== sorted[pos]) { shake(c, el); return c.miss(); }
      track.append(el); sfx('pop');
      if (++pos === sorted.length) c.ok();
    });
    el.dataset.v = v;
    return el;
  });
  c.root.append(track, row('yard', ...cars));
  const solve = () => { while (pos < sorted.length) { const el = cars.find(e => +e.dataset.v === sorted[pos]); track.append(el); pos++; } };
  return { reveal: solve, auto: () => { while (pos < sorted.length) cars.find(e => +e.dataset.v === sorted[pos]).click(); } };
}

// ---------- 21. Сравни числа ----------
function compare(t, c) {
  const right = t.a > t.b ? '>' : t.a < t.b ? '<' : '=';
  const hole = h('span', { class: 'cell gap' }, '?');
  const btns = ['>', '<', '='].map(s => B(c, 'opt sign', s, () => choose(s)));
  function choose(s) { const el = btns[['>', '<', '='].indexOf(s)]; if (s === right) { hole.textContent = s; hole.classList.add('filled'); c.ok(); } else { el.classList.add('wrong'); el.disabled = true; c.miss(); } }
  c.root.append(row('cells big', h('span', { class: 'cell' }, t.a), hole, h('span', { class: 'cell' }, t.b)), row('opts', ...btns));
  return { reveal: () => { hole.textContent = right; hole.classList.add('filled'); }, auto: () => choose(right) };
}

// ---------- 22. Числовой домик ----------
function house(t, c) {
  const win = h('span', { class: 'win gap' }, '?');
  const btns = t.opts.map((o, i) => B(c, 'opt', face(o), () => choose(i)));
  const fill = () => { win.textContent = t.opts[t.a]; win.classList.add('filled'); };
  function choose(i) { if (i === t.a) { fill(); c.ok(); } else { btns[i].classList.add('wrong'); btns[i].disabled = true; c.miss(); } }
  c.root.append(h('div', { class: 'house' }, h('div', { class: 'roof' }, h('b', {}, t.n)), row('floor', h('span', { class: 'win' }, t.x), win)), row('opts', ...btns));
  return { reveal: fill, auto: () => choose(t.a) };
}

// ---------- 23. Лягушка на числовой дорожке ----------
function numline(t, c) {
  const cells = range(t.lo, t.hi).map(v => B(c, 'ncell' + (v === t.from ? ' frog' : ''), String(v), () => choose(v)));
  const at = v => cells[v - t.lo];
  const hop = () => { at(t.from).classList.remove('frog'); at(t.to).classList.add('frog', 'right'); };
  function choose(v) { if (v === t.to) { hop(); c.ok(); } else { shake(c, at(v)); c.miss(); } }
  c.root.append(h('div', { class: 'bigtext' }, t.text), row('numline', ...cells));
  return { reveal: hop, auto: () => choose(t.to) };
}

// ---------- 24. Пример с клавиатурой ----------
function keypad(t, c) {
  const pad = numpad(c, v => (v === t.a ? c.ok() : (pad.clear(), c.miss())));
  c.root.append(row('kp-top', h('div', { class: 'bigtext' }, t.text), pad.out), pad.el);
  return { reveal: () => pad.set(t.a), auto: () => { pad.set(t.a); pad.submit(); } };
}

// ---------- 25. Десятки и единицы ----------
function tenframe(t, c) {
  let tens = 0, ones = 0;
  const area = row('tf-area');
  const draw = () => area.replaceChildren(
    ...range(1, tens).map(() => B(c, 'rod', range(1, 10).map(() => h('i')), () => { tens--; draw(); })),
    row('cubes', ...range(1, ones).map(() => B(c, 'cube', '', () => { ones--; draw(); }))));
  const go = () => (tens * 10 + ones === t.n ? c.ok() : c.miss());
  const set = () => { tens = Math.floor(t.n / 10); ones = t.n % 10; draw(); };
  c.root.append(row('kp-top', h('div', { class: 'bigtext' }, t.n), check(c, go)), area,
    row('opts', B(c, 'opt add', [h('span', { class: 'rod mini' }, range(1, 10).map(() => h('i'))), '+'], () => { if (tens < 10) tens++; draw(); }),
      B(c, 'opt add', [h('span', { class: 'cube' }), '+'], () => { if (ones < 9) ones++; draw(); })));
  return { reveal: set, auto: () => { set(); go(); } };
}

// ---------- 26. Магазин: набери монетками ----------
function shop(t, c) {
  const tray = row('tray'), total = h('div', { class: 'total hidden' });
  let sum = 0;
  const upd = () => { total.textContent = `= ${sum}`; };
  const add = v => { sum += v; upd(); tray.append(B(c, 'coin c' + v, String(v), e => { sum -= v; upd(); e.currentTarget.remove(); })); };
  const go = () => { if (sum === t.price) c.ok(); else { total.classList.remove('hidden'); c.miss(); } };
  const solve = () => { tray.replaceChildren(); sum = 0; let rest = t.price; for (const v of [...t.coins].sort((a, b) => b - a)) while (rest >= v) { add(v); rest -= v; } total.classList.remove('hidden'); };
  c.root.append(row('kp-top', h('div', { class: 'bigpic' }, t.item), h('div', { class: 'price' }, `${t.price} ₽`), check(c, go)), tray, total,
    row('opts', ...t.coins.map(v => B(c, 'coin c' + v, String(v), () => { if (tray.children.length < 14) { add(v); sfx('pop'); } }))));
  upd();
  return { reveal: solve, auto: () => { solve(); go(); } };
}

// ---------- 27. Задача в одно действие ----------
function problem(t, c) {
  const [stub] = t.expr.split('=');
  const ex = h('div', { class: 'bigtext' }, '');
  let pad = null;
  const signs = t.ops.map(s => B(c, 'opt sign', s, () => sign(s)));
  const zone = row('opts', ...signs);
  function sign(s) {
    if (s !== t.op) { const el = signs[t.ops.indexOf(s)]; el.classList.add('wrong'); el.disabled = true; return c.miss(); }
    pad = numpad(c, v => (v === t.a ? c.ok() : (pad.clear(), c.miss())));
    ex.textContent = stub + '=';
    zone.replaceWith(row('kp-top', ex, pad.out), pad.el);
  }
  const pics = t.groups ? row('plates', ...range(1, t.groups.k).map(() => h('span', { class: 'plateb' }, t.groups.e.repeat(t.groups.t))))
    : t.pic && t.pic.a <= 12 ? row('pp', h('span', {}, t.pic.e.repeat(t.pic.a)), ...(t.op === '+' ? [h('b', {}, '+'), h('span', {}, t.pic.e.repeat(t.pic.b))] : [])) : null;
  c.root.append(B(c, 'ptext tapme', t.text, () => c.say(t.text)), pics, zone);
  return { reveal: () => { if (!pad) sign(t.op); pad.set(t.a); }, auto: () => { if (!pad) sign(t.op); pad.set(t.a); pad.submit(); } };
}

// ---------- 28. Соедини точки по порядку ----------
function dots(t, c) {
  const n = t.n, star = n >= 8 && n % 2 === 0;
  const pts = range(0, n - 1).map(i => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n, r = star && i % 2 ? 62 : 125; return [150 + r * Math.cos(a), 150 + r * Math.sin(a)]; });
  const lines = h('g', { class: 'dlines' }), fig = h('polygon', { points: pts.map(p => p.join(',')).join(' '), class: 'dfig' });
  let next = 0;
  const link = (a, b) => lines.append(h('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
  const nodes = pts.map((p, i) => {
    const g = h('g', { class: 'dot', onclick: () => { if (!c.locked) tapDot(i); } }, h('circle', { cx: p[0], cy: p[1], r: n > 12 ? 14 : 19 }), h('text', { x: p[0], y: p[1] + (n > 12 ? 5 : 7), 'text-anchor': 'middle', 'font-size': n > 12 ? 15 : 20 }, String(i + 1)));
    return g;
  });
  function tapDot(i) {
    if (i < next) return;
    if (i !== next) { shake(c, nodes[i]); return c.miss(); }
    nodes[i].classList.add('on'); sfx('pop');
    if (i) link(pts[i - 1], pts[i]);
    if (++next === n) { link(pts[n - 1], pts[0]); fig.classList.add('on'); c.ok(); }
  }
  c.root.append(h('svg', { viewBox: '0 0 300 300', class: 'dots' }, fig, lines, ...nodes));
  return { reveal: () => fig.classList.add('on'), auto: () => { while (next < n) tapDot(next); } };
}

// ---------- 29. Камушки через речку ----------
function stones(t, c) {
  let i = 0;
  const trail = row('trail'), zone = row('opts');
  let btns = [];
  function show() {
    trail.replaceChildren(...t.seq.slice(0, i).map(v => h('span', { class: 'stone done' }, v)), h('span', { class: 'froggy' }, '🐸'), ...t.seq.slice(i).map(() => h('span', { class: 'stone todo' }, '')), h('span', { class: 'bank' }, '🏝️'));
    if (i === t.seq.length) return zone.replaceChildren();
    const s = t.steps[i];
    btns = s.opts.map((o, j) => B(c, 'opt stone', o, () => { if (j === s.a) { sfx('pop'); i++; show(); if (i === t.seq.length) c.ok(); } else { btns[j].classList.add('wrong'); btns[j].disabled = true; c.miss(); } }));
    zone.replaceChildren(...btns);
  }
  show();
  c.root.append(trail, zone);
  return { reveal: () => btns[t.steps[i]?.a]?.classList.add('right', 'glow'), auto: () => { while (i < t.seq.length) btns[t.steps[i].a].click(); } };
}

// ---------- 30. Раскрась нужное количество ----------
function paint(t, c) {
  const els = range(1, t.total).map(() => { const el = B(c, 'paintable', t.emoji, () => { el.classList.toggle('on'); sfx('pop'); }); return el; });
  const go = () => (els.filter(e => e.classList.contains('on')).length === t.n ? c.ok() : c.miss());
  const set = () => els.forEach((e, i) => e.classList.toggle('on', i < t.n));
  c.root.append(row('kp-top', h('div', { class: 'bigtext' }, t.n), check(c, go)), row('paint', ...els));
  return { reveal: set, auto: () => { set(); go(); } };
}

// ---------- 31. Таблица чисел ----------
function chart(t, c) {
  const cells = range(t.lo, t.hi).map(v => B(c, 'ccell', String(v), () => choose(v)));
  const at = v => cells[v - t.lo];
  function choose(v) { if (v === t.target) { at(v).classList.add('right'); c.ok(); } else { at(v).classList.add('wrong'); c.miss(); } }
  c.root.append(row('chart' + (t.hi - t.lo > 40 ? ' full' : ''), ...cells));
  return { reveal: () => at(t.target).classList.add('right', 'glow'), auto: () => choose(t.target) };
}

// ---------- 32. Одинаковые группы на тарелках ----------
function groups(t, c) {
  const plates = row('plates', ...t.counts.map(k => h('span', { class: 'plateb' }, t.emoji.repeat(k))));
  if (t.ask === 'equal') {
    const yes = B(c, 'opt thumb', '👍', () => choose(true)), no = B(c, 'opt thumb', '👎', () => choose(false));
    function choose(v) { const el = v ? yes : no; if (v === t.a) { el.classList.add('right'); c.ok(); } else { el.classList.add('wrong'); el.disabled = true; c.miss(); } }
    c.root.append(plates, row('opts', yes, no));
    return { reveal: () => (t.a ? yes : no).classList.add('right', 'glow'), auto: () => choose(t.a) };
  }
  const btns = t.opts.map((o, i) => B(c, 'opt', face(o), () => choose(i)));
  function choose(i) { if (i === t.a) { btns[i].classList.add('right'); c.ok(); } else { btns[i].classList.add('wrong'); btns[i].disabled = true; c.miss(); } }
  c.root.append(plates, row('opts', ...btns));
  return { reveal: () => btns[t.a].classList.add('right', 'glow'), auto: () => choose(t.a) };
}

// ---------- 33. Ряды и столбики ----------
function array(t, c) {
  let R = 0, K = 0;
  const label = h('div', { class: 'bigtext' }, '');
  const cells = range(0, 29).map(i => B(c, 'acell', '', () => { R = Math.floor(i / 6) + 1; K = (i % 6) + 1; upd(); }));
  const upd = () => { cells.forEach((el, i) => el.classList.toggle('on', Math.floor(i / 6) < R && i % 6 < K)); label.textContent = R ? `↕ ${R}   ↔ ${K}` : ''; };
  const go = () => (R === t.rows && K === t.cols ? c.ok() : c.miss());
  const set = () => { R = t.rows; K = t.cols; upd(); };
  c.root.append(row('kp-top', label, check(c, go)), row('array', ...cells));
  return { reveal: set, auto: () => { set(); go(); } };
}

// ---------- 34. Раздай поровну ----------
function share(t, c) {
  const pile = row('pile'), plates = range(1, t.k).map(() => B(c, 'plateb share-plate', '', e => give(e.currentTarget)));
  range(1, t.k * t.q).forEach(() => pile.append(h('span', {}, t.emoji)));
  function give(plate) { const it = pile.lastElementChild; if (!it) return; plate.append(it); sfx('pop'); }
  // Тарелку можно «высыпать» обратно долгим путём не нужно: кнопка-ластик возвращает всё в кучку.
  const back = B(c, 'tool-btn', '🧽', () => plates.forEach(p => pile.append(...p.children)));
  const go = () => (pile.children.length === 0 && plates.every(p => p.children.length === t.q) ? c.ok() : c.miss());
  const solve = () => { plates.forEach(p => pile.append(...p.children)); for (let i = 0; pile.lastElementChild; i++) plates[i % t.k].append(pile.lastElementChild); };
  c.root.append(row('kp-top', pile, back, check(c, go)), row('plates', ...plates));
  return { reveal: solve, auto: () => { solve(); go(); } };
}

const MECH = { share, bubbles: collect, fish: collect, find: collect, pick, listen: pick, story: pick, memory, pairs, baskets, build, missing, claps,
  truefalse, trace, copy, draw, drawtask, count, feed, train, compare, house, numline, keypad, tenframe, shop, problem, dots, stones, paint, chart, groups, array };

// Показать задание на экране.
export function renderTask(t, c) {
  c.root.replaceChildren();
  c.root.className = 'task m-' + t.m;
  return MECH[t.m](t, c);
}
