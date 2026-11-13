// ЛИНИЯ «ПИШУ РУЧКОЙ»: письменные буквы на бумаге.
// Показ, как пишется буква → обводка пальцем → ребёнок пишет строчку в тетради → родитель фотографирует →
// фото попадает в «Тетрадь» → родитель ставит оценку. Почерк проверяет взрослый, а не программа.

import { h, today } from './util.js';
import { ISLANDS } from './curriculum.js';
import { PEN_TASKS, taskStrokes, slant, strokeLength, SLANT } from './cursive.js';
import { say, hush, sfx, loadPack } from './audio.js';
import { P } from './phrases.js';
import { makeBoard, makeCoverage } from './canvas.js';
import { idb } from './db.js';
import { starSVG } from './art.js';

// ---------- рисование образца ----------
const TOP = -245, BOTTOM = 125; // сколько места по высоте занимает строка с запасом
const d = pts => 'M' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L');
// Косая линейка: две рабочие линии, вспомогательные сверху и снизу и наклонные.
function ruling(x0, x1) {
  let s = '';
  for (let c = x0 - 60; c < x1 + 140; c += 120) s += `<line x1="${c + 200 * SLANT}" y1="-200" x2="${c - 100 * SLANT}" y2="100" class="r-slant"/>`;
  return s + [-200, 100].map(y => `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" class="r-thin"/>`).join('')
    + [-100, 0].map(y => `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" class="r-main"/>`).join('');
}
// Готовый образец задания: наклонённые росчерки и размеры.
function sample(task) {
  const { strokes } = taskStrokes(task), sl = strokes.map(slant);
  const xs = sl.flat().map(p => p[0]);
  return { strokes: sl, x0: Math.min(...xs) - 50, x1: Math.max(...xs) + 50 };
}
export function sampleSVG(task, cls = '') {
  const s = sample(task);
  return `<svg viewBox="${s.x0} ${TOP} ${s.x1 - s.x0} ${BOTTOM - TOP}" class="pen-svg ${cls}">${ruling(s.x0, s.x1)}${s.strokes.map(st => `<path d="${d(st)}" class="pen-ink"/>`).join('')}</svg>`;
}

// ---------- состояние заданий ----------
const penOf = store => (store.profile.pen ||= {});
const works = (store, id) => penOf(store)[id]?.works || [];
// Уровень печатного письма, после которого открывается письменная буква.
const printLevel = {};
for (const isl of ISLANDS) if (isl.line === 'W') for (const L of isl.levels) for (const t of L.tasks || []) if (t[0] === 'traceL' && !printLevel[t[1].toUpperCase()]) printLevel[t[1].toUpperCase()] = L.id;

export function penOpen(store, task) {
  if (store.profile.penAll) return true;
  if (task.kind === 'element') return store.stars('w1-1') > 0;
  return [...task.letters].every(L => store.stars(printLevel[L]) > 0);
}
// new — ещё не писал; wait — ждёт оценки; done — три звезды; redo — надо написать ещё раз; later — повтор будет завтра
export function penStatus(store, task) {
  const w = works(store, task.id), last = w[w.length - 1];
  if (!last) return 'new';
  if (!last.stars) return 'wait';
  if (last.stars === 3) return 'done';
  return last.g < today() ? 'redo' : 'later';
}
// Сколько букв сегодня ждут повторного письма (для значка на карте).
export const penCount = store => PEN_TASKS.filter(t => penStatus(store, t) === 'redo').length;

// ---------- экран со списком заданий ----------
export function penScreen(ctx) {
  const { store, app, back, hero } = ctx;
  const rank = { redo: 0, new: 1, later: 2, wait: 2, done: 3 };
  const open = PEN_TASKS.filter(t => penOpen(store, t)), locked = PEN_TASKS.filter(t => !penOpen(store, t));
  open.sort((a, b) => rank[penStatus(store, a)] - rank[penStatus(store, b)]);
  const card = (t, isOpen) => {
    const st = isOpen ? penStatus(store, t) : 'locked', w = works(store, t.id), last = w[w.length - 1];
    return h('button', { class: 'pen-card ' + st, 'aria-label': t.title, onclick: () => {
      sfx('tap');
      if (!isOpen) return say(P.penLocked);
      if (st === 'later') return say(P.penLater);
      penTask(ctx, t);
    } }, h('span', { html: sampleSVG(t, 'small') }),
    h('span', { class: 'pen-mark' }, st === 'locked' ? '🔒' : st === 'redo' ? '🔁' : st === 'wait' ? '⏳' : st === 'later' ? '🌙' : ''),
    last?.stars ? h('span', { class: 'stars', html: [1, 2, 3].map(i => starSVG(i <= last.stars)).join('') }) : null);
  };
  hush();
  app.className = 'screen pen';
  app.replaceChildren(h('div', { class: 'bar' },
    h('button', { class: 'ibtn', 'aria-label': 'на карту', onclick: back }, '🗺️'), hero('ok'), h('span', { class: 'grow' }),
    h('button', { class: 'ibtn', 'aria-label': 'моя тетрадь', onclick: () => notebook(ctx, () => penScreen(ctx)) }, '📒')),
  h('div', { class: 'pen-grid' }, open.map(t => card(t, true)), locked.map(t => card(t, false))));
  app.scrollTop = 0;
  const redo = penCount(store);
  loadPack('pen');
  say(open.length ? (redo ? P.penRedo : P.penHello) : P.penClosed);
}

// ---------- одно задание ----------
function penTask(ctx, task) {
  const { store, app, hero } = ctx;
  const toList = () => penScreen(ctx);
  const frame = (cls, ...kids) => { hush(); app.className = 'screen pen-task ' + cls; app.replaceChildren(...kids); };
  const bar = text => h('div', { class: 'bar' }, h('button', { class: 'ibtn', 'aria-label': 'к списку', onclick: toList }, '🏠'), hero('ok', 'mini'), h('span', { class: 'grow' }),
    h('button', { class: 'ibtn speak', 'aria-label': 'послушать ещё раз', onclick: () => say(text) }, '🔊'));

  // Шаг 1. Показ: как пишется буква.
  function demo() {
    const s = sample(task);
    let run = 0;
    const svg = h('div', { class: 'pen-demo', html: `<svg viewBox="${s.x0} ${TOP} ${s.x1 - s.x0} ${BOTTOM - TOP}" class="pen-svg">${ruling(s.x0, s.x1)}${s.strokes.map(st => `<path d="${d(st)}" class="pen-ghost"/>`).join('')}${s.strokes.map(st => `<path d="${d(st)}" class="pen-ink" style="visibility:hidden"/>`).join('')}<circle r="11" class="pen-dot" style="visibility:hidden"/></svg>` });
    async function play() {
      const my = ++run, paths = [...svg.querySelectorAll('.pen-ink')], dot = svg.querySelector('.pen-dot');
      paths.forEach(p => { p.style.visibility = 'hidden'; });
      for (let i = 0; i < paths.length; i++) {
        const len = strokeLength(s.strokes[i]) + 2, p = paths[i];
        dot.setAttribute('cx', s.strokes[i][0][0]); dot.setAttribute('cy', s.strokes[i][0][1]); dot.style.visibility = 'visible';
        await new Promise(f => setTimeout(f, 450)); // показываем, откуда начинать
        if (my !== run) return;
        p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.style.visibility = 'visible';
        const ms = Math.max(350, len * 7);
        p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: ms, fill: 'forwards', easing: 'linear' });
        await new Promise(f => setTimeout(f, ms + 250));
        if (my !== run) return;
      }
      dot.style.visibility = 'hidden';
    }
    const text = `${task.say} ${P.penDemoTail}`;
    frame('demo', bar(text), svg, h('div', { class: 'opts' },
      h('button', { class: 'ibtn', 'aria-label': 'показать ещё раз', onclick: () => { sfx('tap'); play(); } }, '🔁'),
      h('button', { class: 'ibtn play', 'aria-label': 'дальше', onclick: () => { run++; trace(); } }, '▶')));
    say(text);
    play();
  }

  // Шаг 2. Обводка пальцем на экране.
  function trace() {
    const s = sample(task);
    let cov = null, done = false;
    const b = makeBoard({ brush: 12, colors: false, onStroke: p => {
      if (!cov || done) return;
      cov.add(p);
      if (cov.complete) { done = true; sfx('ok'); setTimeout(paper, 900); }
    } });
    const k = Math.min((b.W - 30) / (s.x1 - s.x0), (b.H - 20) / (BOTTOM - TOP)), ox = (b.W - (s.x1 - s.x0) * k) / 2 - s.x0 * k, oy = (b.H - (BOTTOM - TOP) * k) / 2 - TOP * k;
    const g = b.guide.getContext('2d');
    const toScreen = ([x, y]) => [x * k + ox, y * k + oy];
    g.lineCap = g.lineJoin = 'round';
    const line = (a, z, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(...toScreen(a)); g.lineTo(...toScreen(z)); g.stroke(); };
    for (let c = s.x0 - 60; c < s.x1 + 140; c += 120) line([c + 200 * SLANT, -200], [c - 100 * SLANT, 100], '#e3ecff', 1.5);
    [-200, 100].forEach(y => line([s.x0, y], [s.x1, y], '#cfe0ff', 1.5));
    [-100, 0].forEach(y => line([s.x0, y], [s.x1, y], '#7aa7ff', 2.5));
    const pts = [];
    for (const st of s.strokes) {
      const sc = st.map(toScreen);
      g.strokeStyle = '#dbe7ff'; g.lineWidth = Math.max(10, 20 * k); g.setLineDash([]); g.beginPath(); sc.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.stroke();
      g.strokeStyle = '#5c7cfa'; g.lineWidth = 3; g.setLineDash([3, 9]); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#38b000'; g.beginPath(); g.arc(sc[0][0], sc[0][1], 7, 0, 7); g.fill();
      for (let i = 1; i < sc.length; i++) { const n = Math.max(1, Math.round(Math.hypot(sc[i][0] - sc[i - 1][0], sc[i][1] - sc[i - 1][1]) / 7)); for (let j = 0; j <= n; j++) pts.push([sc[i - 1][0] + ((sc[i][0] - sc[i - 1][0]) * j) / n, sc[i - 1][1] + ((sc[i][1] - sc[i - 1][1]) * j) / n]); }
    }
    cov = makeCoverage({ pts, R: Math.max(16, 26 * k), need: 0.86 });
    b.onClear = () => cov.reset();
    const text = P.penTrace;
    frame('trace', bar(text), b.el);
    say(text);
    window.__penAuto = () => b.addStroke(pts); // для отладки: обвести самому
  }

  // Шаг 3. Пишем в тетради.
  function paper() {
    const text = P.penPaper;
    frame('paper', bar(text), h('div', { class: 'pen-demo', html: sampleSVG(task) }), h('div', { class: 'pen-note' }, '📓 ✍️'),
      h('button', { class: 'pen-big', onclick: () => { sfx('ok'); photo(); } }, h('span', {}, '✔'), ' Я написал'));
    say(text);
  }

  // Шаг 4. Родитель фотографирует страницу.
  function photo() {
    const finish = async blob => {
      const id = blob ? `ph-${Date.now()}` : null;
      if (blob) { try { await idb.put('photos', id, blob); } catch { alert('Не получилось сохранить фото: на устройстве мало места.'); return; } }
      (penOf(store)[task.id] ||= { works: [] }).works.push({ d: today(), t: Date.now(), photo: id, stars: 0, note: '' });
      store.save();
      toList();
      say(blob ? P.penSaved : P.penNoPhoto);
    };
    const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: async e => { const f = e.target.files[0]; if (f) finish(await shrink(f)); } });
    const text = P.penPhoto;
    frame('photo', bar(text), hero('happy', 'big bounce'),
      h('button', { class: 'pen-big', onclick: () => input.click() }, h('span', {}, '📷'), ' Сфотографировать'), input,
      h('button', { class: 'pbtn', onclick: () => finish(null) }, 'Без фото'));
    say(text);
  }
  demo();
}

// Уменьшить фотографию, чтобы тетрадь не занимала много памяти.
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(f => c.toBlob(b => f(b || file), 'image/jpeg', 0.82));
  } catch { return file; }
}

// ---------- тетрадь: альбом всех работ ----------
const titleOf = id => PEN_TASKS.find(t => t.id === id)?.title || id;
function allWorks(store) {
  return Object.entries(penOf(store)).flatMap(([id, v]) => v.works.map(w => ({ id, w }))).sort((a, b) => b.w.t - a.w.t);
}
const fmt = dstr => dstr.split('-').reverse().join('.');
async function photoUrl(w) { try { const b = w.photo && await idb.get('photos', w.photo); return b ? URL.createObjectURL(b) : null; } catch { return null; } }

export function notebook(ctx, back) {
  const { store, app } = ctx;
  const list = allWorks(store), box = h('div', { class: 'nb-list' });
  let lastDay = '';
  for (const { id, w } of list) {
    if (w.d !== lastDay) { lastDay = w.d; box.append(h('h3', {}, fmt(w.d))); }
    const pic = h('button', { class: 'nb-pic', 'aria-label': 'открыть фото' }, '✍️');
    photoUrl(w).then(u => { if (u) { pic.replaceChildren(h('img', { src: u, alt: titleOf(id) })); pic.onclick = () => viewer(ctx, id, w, u, () => notebook(ctx, back)); } });
    box.append(h('div', { class: 'nb-item' }, pic, h('div', {}, h('b', {}, titleOf(id)),
      h('div', { class: 'stars', html: w.stars ? [1, 2, 3].map(i => starSVG(i <= w.stars)).join('') : '' }), w.stars ? null : h('small', {}, 'ждёт оценки'), w.note ? h('p', {}, w.note) : null)));
  }
  hush();
  app.className = 'screen notebook';
  app.replaceChildren(h('div', { class: 'bar' }, h('button', { class: 'ibtn', 'aria-label': 'назад', onclick: back }, '↩️'), h('h1', {}, 'Тетрадь')),
    list.length ? box : h('p', { class: 'hint' }, 'Здесь появятся фотографии страниц из тетради.'));
  app.scrollTop = 0;
}

// Просмотр одной фотографии: переслать, сохранить, удалить.
function viewer(ctx, id, w, url, back) {
  const { store, app } = ctx;
  const name = `tetrad-${w.d}-${id}.jpg`;
  const save = () => { const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); };
  const share = async () => {
    try {
      const file = new File([await idb.get('photos', w.photo)], name, { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: titleOf(id) });
    } catch (e) { if (e.name === 'AbortError') return; }
    save(); // если устройство не умеет «Поделиться» — просто сохраняем файл
  };
  app.className = 'screen notebook';
  app.replaceChildren(h('div', { class: 'bar' }, h('button', { class: 'ibtn', 'aria-label': 'назад', onclick: back }, '↩️'), h('h1', {}, `${titleOf(id)} · ${fmt(w.d)}`)),
    h('img', { class: 'nb-full', src: url, alt: titleOf(id) }),
    h('div', { class: 'prow' }, h('button', { class: 'pbtn on', onclick: share }, 'Переслать'), h('button', { class: 'pbtn', onclick: save }, 'Сохранить на устройство'),
      h('button', { class: 'pbtn warn', onclick: async () => {
        if (!confirm('Удалить эту фотографию из тетради?')) return;
        await idb.del('photos', w.photo); w.photo = null; store.save(); back();
      } }, 'Удалить фото')));
}

// ---------- родителям: оценки, печать прописей ----------
export function penParent({ store, again, app, back }) {
  const ctx = { store, app };
  const list = allWorks(store), open = PEN_TASKS.filter(t => penOpen(store, t));
  const row = ({ id, w }) => {
    const pic = h('button', { class: 'nb-pic', 'aria-label': 'открыть фото' }, w.photo ? '…' : 'без фото');
    photoUrl(w).then(u => { if (u) { pic.replaceChildren(h('img', { src: u, alt: '' })); pic.onclick = () => viewer(ctx, id, w, u, again); } });
    const note = h('input', { type: 'text', value: w.note || '', placeholder: 'Что поправить (необязательно)', maxlength: 120, onchange: e => { w.note = e.target.value; store.save(); } });
    return h('div', { class: 'nb-item' }, pic, h('div', {}, h('b', {}, `${titleOf(id)} · ${fmt(w.d)}`),
      h('div', { class: 'prow' }, [1, 2, 3].map(n => h('button', { class: 'pbtn' + (w.stars === n ? ' on' : ''), onclick: () => { w.stars = n; w.g = today(); store.save(); again(); } }, '★'.repeat(n)))), note));
  };
  const waiting = list.filter(x => !x.w.stars), graded = list.filter(x => x.w.stars).slice(0, 12);
  const sel = h('select', {}, open.map(t => h('option', { value: t.id }, t.title)));
  return h('section', { class: 'pbox' }, h('h2', {}, 'Пишу ручкой: тетрадь и оценки'),
    h('p', {}, `Открыто заданий: ${open.length} из ${PEN_TASKS.length}. Ребёнок пишет строчку в тетради, вы фотографируете страницу и ставите оценку. Меньше трёх звёзд — на следующий день эта буква вернётся.`),
    h('label', {}, h('input', { type: 'checkbox', checked: !!store.profile.penAll, onchange: e => { store.profile.penAll = e.target.checked; store.save(); again(); } }), ' Открыть все задания сразу (не ждать печатных букв)'),
    h('h3', {}, waiting.length ? 'Ждут оценки' : 'Работ, которые ждут оценки, нет'), waiting.map(row),
    graded.length ? h('details', {}, h('summary', {}, 'Уже оценённые работы'), graded.map(row)) : null,
    h('div', { class: 'prow' }, h('button', { class: 'pbtn', onclick: () => notebook({ store, app }, again) }, 'Открыть тетрадь'),
      open.length ? [sel, h('button', { class: 'pbtn on', onclick: () => printSheet(PEN_TASKS.find(t => t.id === sel.value)) }, 'Распечатать прописи')] : null),
    h('p', { class: 'hint' }, 'Фотографии хранятся только на этом устройстве и сами никуда не отправляются. В файл с прогрессом они не входят.'));
}

// Лист прописей для печати: косая линейка, образец и пунктир для обводки.
export function printSheet(task) {
  const s = sample(task), w = s.x1 - s.x0 - 40, K = 0.62, rowH = 300, left = 130, right = 1970;
  let rows = '';
  for (let r = 0; r < 9; r++) {
    const y = 420 + r * rowH;
    let marks = '';
    const fits = Math.max(1, Math.floor((right - left) / K / (w + 30)));
    const n = r < 5 ? fits : 1;
    for (let i = 0; i < n; i++) marks += `<g transform="translate(${(i * (w + 30) - s.x0 - 20).toFixed(1)} 0)">${s.strokes.map(st => `<path d="${d(st)}" class="${r === 0 && i === 0 ? 'pr-solid' : 'pr-dots'}"/>`).join('')}</g>`;
    rows += `<g transform="translate(${left} ${y}) scale(${K})">${ruling(0, (right - left) / K)}${marks}</g>`;
  }
  const page = h('div', { id: 'print', html: `<svg viewBox="0 0 2100 2970" class="pr-page"><text x="130" y="170" class="pr-title">Прописи: ${task.title}</text><text x="130" y="240" class="pr-sub">Школа Камиля · обведи по пунктиру, а потом напиши сам. Дата: ____________</text>${rows}</svg>` });
  document.getElementById('print')?.remove();
  document.body.append(page);
  window.addEventListener('afterprint', () => page.remove(), { once: true });
  window.print();
}
