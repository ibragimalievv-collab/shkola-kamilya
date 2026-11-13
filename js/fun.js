// ТО, РАДИ ЧЕГО ХОЧЕТСЯ ВЕРНУТЬСЯ: свой нарисованный герой, домик помощника, библиотека первых книжек,
// сюрпризы, «короткий день», проверка на входе и «Покажи папе».
// Каждая функция получает общий набор x: { store, app, screen, hero, ibtn, map, say } из главного файла.

import { h, makeRng, pl } from './util.js';
import { ISLANDS, LEVELS } from './curriculum.js';
import { makeTask, syllables, tokW, example } from './tasks.js';
import { ORDER, WORDS } from './data.js';
import { STORIES, JOKES, HOME_ITEMS, PET_NAMES, GIFT_COLORS, GIFT_BADGES } from './stories.js';
import { BOOKS, bareWord } from './books.js';
import { P } from './phrases.js';
import { sfx, loadPack, prepare } from './audio.js';
import { makeBoard } from './canvas.js';
import { renderTask } from './mechanics.js';
import { heroSVG, starSVG } from './art.js';

const totalStars = store => Object.values(store.profile.levels).reduce((a, b) => a + b, 0);
// Картинка героя, которого нарисовал ребёнок (или ничего, если ещё не рисовал).
export const petImg = (store, cls = 'pet') => (store.profile.pet?.img ? h('img', { class: cls, src: store.profile.pet.img, alt: store.profile.pet.name || 'мой герой' }) : null);

// ---------- свой герой: нарисовать и назвать ----------
export function drawPet(x, done) {
  const { store, screen, ibtn, say } = x;
  const b = makeBoard({ brush: 16 });
  const next = () => {
    if (b.ink() < 150) return say(P.needDraw2);
    const img = b.cutout(220);
    let name = PET_NAMES[0];
    const btns = PET_NAMES.map(n => h('button', { class: 'opt', onclick: e => { name = n; sfx('tap'); say(n); btns.forEach(q => q.classList.toggle('right', q === e.currentTarget)); } }, h('span', { class: 'txt longish' }, n)));
    btns[0].classList.add('right');
    screen('paint', h('div', { class: 'bar' }, ibtn('🔊', 'послушать ещё раз', () => say(P.petName))), h('img', { class: 'pet big', src: img, alt: 'мой герой' }), h('div', { class: 'opts' }, btns),
      ibtn('▶', 'готово', () => { store.profile.pet = { img, name }; store.save(); say(P.petHello(name)); setTimeout(done, 3800); }, 'play'));
    say(P.petName);
  };
  screen('level', h('div', { class: 'bar' }, ibtn('🗺️', 'потом', done, 'small'), h('span', { class: 'grow' }), ibtn('🔊', 'послушать ещё раз', () => say(P.petDraw), 'speak')),
    h('div', { class: 'task' }, h('div', { class: 'copy-top' }, h('div', { class: 'sample' }, '🎨'), h('button', { class: 'check', onclick: next }, '✔')), b.el));
  say(P.petDraw);
}

// ---------- свободное рисование ----------
export function freeDraw(x, back) {
  const { store, screen, ibtn, say } = x;
  const b = makeBoard({ brush: 16 });
  screen('level', h('div', { class: 'bar' }, ibtn('🗺️', 'на карту', back), h('span', { class: 'grow' }), ibtn('🔊', 'послушать', () => say(P.freeDraw), 'speak')),
    h('div', { class: 'task' }, h('div', { class: 'copy-top' }, h('div', { class: 'sample' }, '🎨'), h('button', { class: 'check', onclick: () => { if (b.ink() > 150) store.addArt(b.dataUrl()); sfx('star'); back(); } }, '✔')), b.el));
  say(P.freeDraw);
}

// ---------- домик помощника ----------
export function homeScreen(x, back) {
  const { store, screen, ibtn, say, hero } = x;
  const stars = totalStars(store), home = store.part('home', {});
  let picked = null;
  const room = h('div', { class: 'room' });
  const tray = h('div', { class: 'tray2' });
  const draw = () => {
    room.replaceChildren(h('div', { class: 'room-win' }, '🌤️'), h('div', { class: 'room-hero' }, hero('happy')), petImg(store, 'pet room-pet'),
      ...HOME_ITEMS.filter((_, i) => home[i]).map(it => { const i = HOME_ITEMS.indexOf(it); return h('button', { class: 'placed' + (picked === i ? ' sel' : ''), style: `left:${home[i][0]}%;top:${home[i][1]}%`, 'aria-label': it[1], onclick: e => { e.stopPropagation(); picked = picked === i ? null : i; sfx('tap'); say(it[1]); draw(); } }, it[0]); }));
    tray.replaceChildren(...HOME_ITEMS.map((it, i) => (stars >= it[2]
      ? h('button', { class: 'titem' + (picked === i ? ' sel' : '') + (home[i] ? ' used' : ''), 'aria-label': it[1], onclick: () => { picked = i; sfx('tap'); say(it[1]); draw(); } }, it[0])
      : h('button', { class: 'titem locked', 'aria-label': 'закрыто', onclick: () => say(P.homeNext(it[2] - stars)) }, h('span', {}, it[0]), h('small', { html: starSVG(true) + it[2] })))));
  };
  room.addEventListener('click', e => {
    if (picked == null) return;
    const r = room.getBoundingClientRect();
    home[picked] = [Math.round(((e.clientX - r.left) / r.width) * 100), Math.round(((e.clientY - r.top) / r.height) * 100)];
    picked = null; store.save(); sfx('pop'); draw();
  });
  draw();
  const nextItem = HOME_ITEMS.find(it => stars < it[2]);
  const text = P.home + ' ' + (nextItem ? P.homeNext(nextItem[2] - stars) : P.homeAll);
  screen('home', h('div', { class: 'bar' }, ibtn('🗺️', 'на карту', back), h('span', { class: 'score dark' }, h('span', { html: starSVG(true) }), stars), h('span', { class: 'grow' }), ibtn('🔊', 'послушать', () => say(text), 'speak')), room, tray);
  say(text);
}
// Сколько вещей для домика открыто, но ещё не расставлено (значок на карте).
export const homeNew = store => HOME_ITEMS.filter((it, i) => totalStars(store) >= it[2] && !store.part('home', {})[i]).length;

// ---------- библиотека первых книжек ----------
// Сколько букв ребёнок уже прошёл (по островам чтения с буквами).
export function lettersKnown(store) {
  let n = 0;
  for (const [id, upTo] of [['r1', 5], ['r2', 10], ['r3', 15], ['r4', 20], ['r5', 25], ['r6', 30], ['r7', 33]]) if (store.islandDone(ISLANDS.find(i => i.id === id))) n = upTo;
  return n;
}
export const booksOpen = store => BOOKS.filter(b => b[0] <= lettersKnown(store)).length;
export function library(x, back) {
  const { store, screen, ibtn, say } = x;
  const known = lettersKnown(store), read = store.part('books', {});
  loadPack('books');
  screen('library', h('div', { class: 'bar' }, ibtn('🗺️', 'на карту', back), h('span', { class: 'grow' }), ibtn('🔊', 'послушать', () => say(P.library), 'speak')),
    h('div', { class: 'shelf' }, BOOKS.map(([stage, title, pages], i) => {
      const open = stage <= known;
      return h('button', { class: 'book' + (open ? '' : ' locked') + (read[i] ? ' done' : ''), 'aria-label': title, onclick: () => { sfx('tap'); open ? reader(x, i, () => library(x, back)) : say(P.bookLocked); } },
        h('span', { class: 'cover' }, open ? pages[0][0] : '🔒'), h('b', {}, stage <= 20 ? title.toUpperCase() : title), read[i] ? h('span', { class: 'pen-mark' }, '⭐') : null);
    })));
  say(P.library);
}
function reader(x, i, back) {
  const { store, screen, ibtn, say } = x;
  const [stage, title, pages] = BOOKS[i];
  const show = n => {
    const [pic, text] = pages[n], shown = stage <= 20 ? text.toUpperCase() : text;
    prepare([text, ...text.split(' ').map(w => tokW(bareWord(w)))]);
    screen('reader', h('div', { class: 'bar' }, ibtn('📚', 'к книжкам', back), h('b', { class: 'grow book-title' }, title), ibtn('🔊', 'прочитать страницу', () => say(text), 'speak')),
      h('div', { class: 'page' }, h('div', { class: 'bigpic' }, pic),
        h('div', { class: 'page-text' }, shown.split(' ').map((w, k) => { const bare = bareWord(text.split(' ')[k]); return bare ? h('button', { class: 'word', onclick: () => { sfx('tap'); say(tokW(bare)); } }, w) : h('span', {}, w); }))),
      h('div', { class: 'opts' }, n ? ibtn('◀', 'назад', () => show(n - 1)) : null, h('span', { class: 'score dark' }, `${n + 1} / ${pages.length}`),
        n < pages.length - 1 ? ibtn('▶', 'дальше', () => show(n + 1), 'play') : ibtn('✔', 'конец', () => { store.part('books', {})[i] = 1; store.save(); sfx('star'); say(P.bookEnd); setTimeout(back, 3500); }, 'play')));
  };
  show(0);
}

// ---------- история острова ----------
// Шаг истории, который открылся после этого уровня.
export const storyBeat = level => STORIES[ISLANDS[level.island].id]?.[1][level.k] || null;
export function storyCard(x, level) {
  const beat = storyBeat(level);
  if (!beat) return null;
  return h('button', { class: 'story-card', 'aria-label': 'история', onclick: () => x.say(beat[1]) }, h('span', { class: 'scene' }, beat[0], petImg(x.store, 'pet tiny')), h('span', { class: 'line' }, beat[1]));
}
// Лента истории на экране острова: открытые шаги — картинками.
export function storyStrip(x, isl) {
  const st = STORIES[isl.id];
  if (!st) return null;
  return h('div', { class: 'strip' }, st[1].map(([pic, line], k) => (x.store.stars(isl.levels[k].id)
    ? h('button', { class: 'beat', 'aria-label': 'шаг истории', onclick: () => { sfx('tap'); x.say(line); } }, pic)
    : h('span', { class: 'beat todo' }, '❔'))));
}

// ---------- сюрприз после уровня ----------
// Иногда (не каждый раз и не два раза подряд) — новая краска, значок или шутка.
export function surprise(x) {
  const { store } = x, g = store.part('gifts', { colors: [], badges: [], last: 0 });
  const played = Object.keys(store.profile.levels).length;
  if (played - g.last < 2 || Math.random() > 0.3) return null;
  g.last = played;
  const kinds = ['joke'];
  if (g.colors.length < GIFT_COLORS.length) kinds.push('color');
  if (g.badges.length < GIFT_BADGES.length) kinds.push('badge', 'badge');
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  let pic, text;
  if (kind === 'color') { const c = GIFT_COLORS[g.colors.length]; g.colors.push(c); pic = h('span', { class: 'color', style: `background:${c}` }); text = P.giftColor; }
  else if (kind === 'badge') { const b = GIFT_BADGES[g.badges.length]; g.badges.push(b); pic = b; text = P.giftBadge; }
  else { pic = '😄'; text = P.giftJoke + ' ' + JOKES[Math.floor(Math.random() * JOKES.length)]; }
  store.save();
  return { el: h('button', { class: 'gift', 'aria-label': 'сюрприз', onclick: () => x.say(text) }, h('span', {}, '🎁'), h('span', { class: 'gift-in' }, pic)), text };
}

// ---------- короткий день закончен ----------
export function dayDone(x) {
  const { screen, ibtn, say, hero, map } = x;
  screen('rest', hero('happy', 'big bounce'), petImg(x.store, 'pet'),
    h('div', { class: 'opts' }, ibtn('🎨', 'рисовать', () => freeDraw(x, map), 'play'), ibtn('🏠', 'в домик', () => homeScreen(x, map), 'play'), ibtn('🗺️', 'на карту', map)));
  say(P.dayDone);
}

// ---------- проверка на входе ----------
// Короткая игра-разведка: что ребёнок уже знает. Знакомые острова отмечаются пройденными (родитель может вернуть).
export function placement(x, done) {
  const { store, screen, ibtn, say, hero } = x;
  const r = makeRng(Date.now() % 2147483647), groups = [];
  ['АУОМС', 'ЫИНТК', 'ЛРПВЕ', 'ДЗБГЯ', 'ШЖЧЙЬ', 'ЁЮХЦЭ', 'ЩФЪ'].forEach((ls, g) => {
    const s = Math.min(33, (g + 1) * 5), syl = syllables(s).filter(y => [...ls].some(L => y.includes(L)));
    groups.push({ line: 'R', isl: 'r' + (g + 1), tasks: [['listenL', ls[0], s], ['listenL', ls[ls.length > 3 ? 3 : 1], s], syl.length ? ['listenS', syl[Math.floor(syl.length / 2)], s] : ['listenL', ls[2] || ls[0], s]] });
  });
  groups.push({ line: 'M', isl: 'm1', tasks: [['listenN', 1, 5], ['count', 3, 5], ['gap', 1, 5, 1]] },
    { line: 'M', isl: 'm2', tasks: [['listenN', 6, 10], ['compare', 1, 10], ['house', 6, 9]] },
    { line: 'M', isl: 'm3', tasks: [['exKey', 'a10'], ['exKey', 's10'], ['exPick', 'am10']] });
  const passed = [], failedLine = {};
  let gi = 0, ti = 0;
  const finish = () => {
    store.skipLevels(passed.flatMap(id => ISLANDS.find(i => i.id === id).levels.map(l => l.id)));
    store.profile.placed = true; store.save();
    screen('rest', hero('happy', 'big bounce'), h('div', { class: 'stars huge', html: passed.length ? passed.map(() => starSVG(true)).join('') : '' }), ibtn('▶', 'дальше', done, 'play'));
    sfx('star');
    say(passed.length ? P.testDone : P.testNothing);
  };
  const step = () => {
    while (gi < groups.length && failedLine[groups[gi].line]) gi++;
    if (gi >= groups.length) return finish();
    const g = groups[gi], t = makeTask(g.tasks[ti], r);
    let over = false;
    const root = h('div');
    const go = ok => {
      if (over) return; over = c.locked = true;
      if (ok) { sfx('ok'); if (++ti >= g.tasks.length) { passed.push(g.isl); gi++; ti = 0; } }
      else { failedLine[g.line] = true; ti = 0; say(P.testNext); } // ошибся — эту линию дальше не проверяем, без подсказок и без огорчения
      setTimeout(step, ok ? 700 : 1800);
    };
    const c = { root, rng: r, islandN: 0, locked: false, say, prompt: say, later: (fn, ms) => setTimeout(fn, ms), saveArt() {}, ok: () => go(true), miss: () => go(false) };
    screen('level', h('div', { class: 'bar' }, ibtn('🗺️', 'закончить', finish, 'small'), hero('ok', 'mini'), h('div', { class: 'progress' }, h('i', { style: `width:${(gi / groups.length) * 100}%` })), ibtn('🔊', 'послушать задание', () => say(t.say), 'speak')), root);
    prepare([t.say]);
    renderTask(t, c);
    say(t.say);
  };
  screen('intro', h('div', { class: 'bar' }, ibtn('🗺️', 'пропустить', () => { store.profile.placed = true; store.save(); done(); }, 'small'), h('span', { class: 'grow' }), ibtn('🔊', 'послушать ещё раз', () => say(P.testHello))),
    h('div', { class: 'intro-body' }, hero('ok', 'mid bounce'), h('div', { class: 'bigpic' }, '🔭')), ibtn('▶', 'начать', step, 'play'));
  say(P.testHello);
}

// ---------- «Покажи папе» ----------
// После острова ребёнок показывает взрослому, чему научился. Экран читает взрослый, поэтому здесь есть текст.
export function showDad(x, isl, done) {
  const { store, screen, say } = x;
  const r = makeRng(isl.n + 7), stage = { r1: 5, r2: 10, r3: 15, r4: 20, r5: 25, r6: 30 }[isl.id] || 33;
  let items;
  if (isl.line === 'R') {
    const ws = WORDS.filter(w => w.st <= stage && w.st > stage - 6 && w.w.length <= 6).slice(0, 12), pick3 = [0, 4, 8].map(i => ws[i % ws.length]).filter(Boolean);
    items = ['Попросите прочитать вслух три слова:', ...pick3.map(w => (stage <= 20 ? w.w.toUpperCase() : w.w))];
  } else if (isl.line === 'W') {
    const letters = isl.topic.replace(/^Печатные буквы /, '');
    items = isl.id === 'w1' ? ['Попросите нарисовать на листке:', 'ровную линию, волну и круг'] : /^[А-ЯЁ, ]+$/.test(letters) ? ['Попросите написать на листке буквы:', letters.split(', ').slice(0, 4).join('  ')] : ['Попросите написать на листке:', 'своё имя и слово «мама»'];
  } else {
    const kind = { m1: null, m2: null, m3: 'am10', m4: 't10', m5: 'am20n', m6: 'am20', m7: 'am20', m8: 'tens+', m9: 'tens+', m10: 'am100', m11: 'am20', x1: 'x2a', x2: 'x2', x3: 'x3', x4: 'x4', x5: 'x5', x6: 'xall', d1: 'd23', d2: 'dall' }[isl.id];
    items = kind ? ['Попросите решить два примера:', example(kind, r).text + ' =', example(kind, r).text + ' ='] : ['Попросите:', isl.id === 'm1' ? 'посчитать пять предметов и показать цифру 5' : 'посчитать до десяти и сказать, что больше: 7 или 9'];
  }
  const answer = ok => {
    store.part('shown', {})[isl.id] = ok ? 'ok' : 'again';
    if (!ok) for (const L of isl.levels.filter(l => !l.review).slice(-4)) store.addWeak(L.tasks[1]), (store.weakAll().at(-1).due = '2000-01-01'); // вернём эти задания уже в следующих уровнях
    store.save();
    say(ok ? P.showOk : P.showAgain);
    setTimeout(done, 3000);
  };
  screen('showdad', h('div', { class: 'show-card' }, h('h2', {}, 'Покажи папе или маме'), h('p', { class: 'hint' }, `Остров «${isl.title.replace('Остров ', '')}» пройден. ${items[0]}`),
    h('div', { class: 'show-items' }, items.slice(1).map(t => h('div', { class: 'show-item' }, t))),
    h('div', { class: 'prow' }, h('button', { class: 'pbtn on big', onclick: () => answer(true) }, '👍 Получилось'), h('button', { class: 'pbtn big', onclick: () => answer(false) }, '🔁 Ещё потренируемся'))));
  sfx('island');
  say(P.showDad);
}
