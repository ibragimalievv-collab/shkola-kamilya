// ЕЩЁ ТРИ МЕСТА НА КАРТЕ: магазин игрушек (счёт монетками и сдача), письма от Лумика (чтение «по-настоящему»)
// и игра вдвоём со взрослым (ребёнок отвечает сам и проверяет чужие ответы).
// Каждая функция получает общий набор x: { store, app, screen, hero, ibtn, map, say } из главного файла.

import { h, makeRng, today } from './util.js';
import { ISLANDS, LEVELS } from './curriculum.js';
import { makeTask, tokW } from './tasks.js';
import { bareWord } from './books.js';
import { lettersKnown } from './fun.js';
import { MAIL, MAIL_EVERY } from './mail.js';
import { P, HINTS, REVEAL } from './phrases.js';
import { sfx, loadPack, prepare } from './audio.js';
import { renderTask } from './mechanics.js';
import { starSVG } from './art.js';

const any = list => list[Math.floor(Math.random() * list.length)];
const islandDone = (store, id) => { const isl = ISLANDS.find(i => i.id === id); return !!isl && store.islandDone(isl); };
const rng = () => makeRng(Date.now() % 2147483647);

// Показать одно задание: две попытки с мягкой подсказкой, потом — верный ответ. done(решил ли сам).
function oneTask(x, t, { back, head = [], done }) {
  const { screen, ibtn, say, hero } = x;
  let m = 0, ended = false, mech = null;
  const root = h('div');
  const end = (good, ms) => { ended = c.locked = true; setTimeout(() => { if (root.isConnected) done(good); }, ms); };
  const c = {
    root, rng: rng(), islandN: 0, locked: false, say, prompt: say, later: (fn, ms) => setTimeout(fn, ms), saveArt() {}, saveRead() {}, saveWord() {}, myPic: null,
    ok() { if (ended) return; sfx('ok'); end(true, 1200); },
    miss() { if (ended) return; m++; sfx('miss'); if (m === 1) return say(any(HINTS)); mech.reveal(); say(any(REVEAL)); end(false, 3200); },
  };
  screen('level', h('div', { class: 'bar' }, ibtn('◀', 'назад', back), hero('ok', 'mini'), ...head, h('span', { class: 'grow' }), ibtn('🔊', 'послушать задание', () => say(t.say), 'speak')), root);
  prepare([t.say]);
  mech = renderTask(t, c);
  say(t.say);
}

// ---------- магазин игрушек ----------
const TOYS = ['🧸', '🚗', '⚽', '🪁', '🎈', '🚂', '🎲', '🧩', '🥁', '🚁', '⛵', '🤖'];
export const shopOpen = store => islandDone(store, 'm2');
// Цены растут вместе с тем, что ребёнок уже умеет считать.
const priceCap = store => (islandDone(store, 'm10') ? 50 : islandDone(store, 'm5') ? 20 : 10);
export const toyPrice = (i, round, cap) => 2 + ((i * 7 + round * 3) % (cap - 1));
export function shopScreen(x, back, note) {
  const { store, screen, ibtn, say } = x;
  if (!shopOpen(store)) return say(P.shopLocked);
  const st = store.part('shop', { round: 0, got: {}, sum: 0 }), cap = priceCap(store);
  const again = () => shopScreen(x, back);
  const buy = i => {
    const price = toyPrice(i, st.round, cap), have = [10, 20, 50, 100].find(v => v > price);
    // Иногда платим одной крупной монетой и считаем сдачу (когда вычитание уже пройдено).
    const change = islandDone(store, 'm3') && Math.random() < 0.4;
    const t = makeTask(change ? ['changeBuy', price, have] : ['shopBuy', price, TOYS[i]], rng());
    oneTask(x, t, { back: again, head: [h('span', { class: 'score dark' }, TOYS[i], ` ${price} ₽`)], done: good => {
      if (good) { st.got[i] = 1; st.sum++; store.save(); sfx('star'); }
      shopScreen(x, back, good ? P.shopBought : P.shopTry);
    } });
  };
  if (TOYS.every((_, i) => st.got[i])) { st.round++; st.got = {}; store.save(); return shopScreen(x, back, P.shopAll); }
  const text = note || P.shopHello;
  screen('library', h('div', { class: 'bar' }, ibtn('🗺️', 'на карту', back), h('span', { class: 'score dark' }, '🛍️', st.sum), h('span', { class: 'grow' }), ibtn('🔊', 'послушать', () => say(P.shopHello), 'speak')),
    h('div', { class: 'shelf' }, TOYS.map((toy, i) => h('button', { class: 'book toy' + (st.got[i] ? ' done' : ''), 'aria-label': 'игрушка',
      onclick: () => { sfx('tap'); st.got[i] ? say(P.shopHave) : buy(i); } },
    h('span', { class: 'cover' }, toy), st.got[i] ? h('span', { class: 'pen-mark' }, '✔') : h('b', {}, `${toyPrice(i, st.round, cap)} ₽`)))));
  say(text);
}

// ---------- письма от Лумика ----------
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
// Номер письма, которое ждёт ребёнка, или -1.
export function mailWaiting(store) {
  const m = store.part('mail', { n: 0, d: '' }), next = MAIL[m.n];
  if (!next || next[0] > lettersKnown(store)) return -1;
  return !m.d || daysBetween(m.d, today()) >= MAIL_EVERY ? m.n : -1;
}
export function mailScreen(x, back) {
  const { store, screen, ibtn, say } = x;
  const m = store.part('mail', { n: 0, d: '' }), fresh = mailWaiting(store);
  const again = () => mailScreen(x, back);
  loadPack('mail');
  const text = lettersKnown(store) < MAIL[0][0] ? P.mailClosed : fresh >= 0 ? P.mailNew : P.mailNone;
  screen('library', h('div', { class: 'bar' }, ibtn('🗺️', 'на карту', back), h('span', { class: 'grow' }), ibtn('🔊', 'послушать', () => say(text), 'speak')),
    h('div', { class: 'shelf' }, MAIL.slice(0, m.n + (fresh >= 0 ? 1 : 0)).map(([, stamp], i) => h('button', { class: 'book letter' + (i < m.n ? ' done' : ' new'), 'aria-label': 'письмо',
      onclick: () => { sfx('tap'); openLetter(x, i, again); } }, h('span', { class: 'cover' }, i < m.n ? stamp : '✉️'), i < m.n ? null : h('b', {}, '!'))),
    m.n === 0 && fresh < 0 ? h('div', { class: 'bigpic' }, '📭') : null));
  say(text);
}
function openLetter(x, i, back) {
  const { store, screen, ibtn, say, hero } = x;
  const [stage, stamp, lines] = MAIL[i], m = store.part('mail', { n: 0, d: '' }), isNew = i >= m.n;
  const whole = lines.join(' '), show = t => (stage <= 20 ? t.toUpperCase() : t);
  prepare([...lines, ...whole.split(' ').map(w => tokW(bareWord(w)))]);
  const finish = () => {
    if (!isNew) return back();
    m.n = i + 1; m.d = today(); store.save();
    back(); sfx('star'); say(P.mailEnd);
  };
  screen('reader', h('div', { class: 'bar' }, ibtn('◀', 'к письмам', back), h('span', { class: 'grow' }), ibtn('🔊', 'прочитать письмо', () => say(whole), 'speak')),
    h('div', { class: 'page paper' }, h('div', { class: 'paper-top' }, hero('happy', 'mini'), h('span', { class: 'stamp' }, stamp)),
      ...lines.map(line => h('div', { class: 'page-text letter-line' }, line.split(' ').map(w => { const bare = bareWord(w); return bare ? h('button', { class: 'word', onclick: () => { sfx('tap'); say(tokW(bare)); } }, show(w)) : h('span', {}, show(w)); })))),
    h('div', { class: 'opts' }, ibtn('✔', 'прочитал', finish, 'play')));
}

// ---------- игра вдвоём ----------
// Задания берём из уже пройденных уровней: только те, где ответ — один выбор или число.
const DUO_GENS = ['listenL', 'listenS', 'caseL', 'wordpic', 'picword', 'listenW', 'listenN', 'exPick', 'exKey', 'coinSum', 'gap'];
function duoPool(store) {
  const done = LEVELS.filter(l => store.stars(l.id)), from = done.length >= 3 ? done.slice(-40) : LEVELS.slice(0, 6);
  const pool = from.flatMap(l => l.tasks).filter(s => DUO_GENS.includes(s[0]));
  return pool.length >= 4 ? pool : [['listenL', 'А', 5], ['listenL', 'М', 5], ['listenN', 1, 5], ['listenL', 'О', 5]];
}
export function duoScreen(x, back) {
  const { store, screen, ibtn, say, hero } = x;
  const pool = duoPool(store), r = rng(), ROUNDS = 8;
  let turn = 0, kid = 0, dad = 0;
  const score = () => h('span', { class: 'score dark duo' }, '🧒', kid, ' · ', '🧑', dad);
  const end = () => {
    screen('rest', hero('happy', 'big bounce'), h('div', { class: 'duo-final' }, h('span', {}, '🧒 ', kid), h('span', { html: starSVG(true) }), h('span', {}, dad, ' 🧑')),
      h('div', { class: 'opts' }, ibtn('🔁', 'ещё раз', () => duoScreen(x, back)), ibtn('🗺️', 'на карту', back, 'play')));
    sfx('island'); say(P.duoEnd);
  };
  const step = () => {
    if (turn >= ROUNDS) return end();
    const kidTurn = turn % 2 === 0;
    let t;
    for (let i = 0; i < 20; i++) { t = makeTask(any(pool), r); if (['pick', 'listen', 'keypad'].includes(t.m)) break; }
    let m = 0, ended = false, mech = null;
    const root = h('div'), panel = h('div', { class: 'opts judge' });
    const next = ms => { turn++; setTimeout(() => { if (root.isConnected) step(); }, ms); };
    // Взрослый отвечает один раз; верно или нет — не показываем, пока ребёнок не скажет своё мнение.
    const judge = good => {
      ended = c.locked = true;
      const verdict = thinks => {
        panel.replaceChildren();
        root.classList.remove('veil');
        if (good) dad++;
        if (thinks === good) { kid++; sfx('ok'); } else sfx('miss');
        if (!good) mech.reveal();
        say(thinks === good ? P.duoYes + (good ? '' : ' ' + P.duoWasWrong) : good ? P.duoWasRight : P.duoWasWrong);
        next(good && thinks === good ? 2200 : 4200);
      };
      panel.replaceChildren(h('button', { class: 'opt', 'aria-label': 'правильно', onclick: () => verdict(true) }, h('span', { class: 'pic' }, '👍')),
        h('button', { class: 'opt', 'aria-label': 'неправильно', onclick: () => verdict(false) }, h('span', { class: 'pic' }, '👎')));
      say(P.duoJudge);
    };
    const c = {
      root, rng: r, islandN: 0, locked: false, say, prompt: say, later: (fn, ms) => setTimeout(fn, ms), saveArt() {}, saveRead() {}, saveWord() {}, myPic: null,
      ok() { if (ended) return; if (!kidTurn) return judge(true); ended = c.locked = true; sfx('ok'); kid++; next(1200); },
      miss() { if (ended) return; if (!kidTurn) return judge(false); m++; sfx('miss'); if (m === 1) return say(any(HINTS)); ended = c.locked = true; mech.reveal(); say(any(REVEAL)); next(3200); },
    };
    const line = (kidTurn ? P.duoKid : P.duoDad) + ' ' + t.say;
    screen('level', h('div', { class: 'bar' }, ibtn('🗺️', 'выйти', back), h('span', { class: 'who' }, kidTurn ? '🧒' : '🧑'), score(), h('div', { class: 'progress' }, h('i', { style: `width:${(turn / ROUNDS) * 100}%` })),
      ibtn('🔊', 'послушать задание', () => say(t.say), 'speak')), root, panel);
    prepare([line]);
    mech = renderTask(t, c);
    if (!kidTurn) root.classList.add('veil');
    say(line);
  };
  screen('intro', h('div', { class: 'bar' }, ibtn('🗺️', 'на карту', back), h('span', { class: 'grow' }), ibtn('🔊', 'послушать ещё раз', () => say(P.duoHello))),
    h('div', { class: 'intro-body' }, hero('ok', 'mid bounce'), h('div', { class: 'bigpic' }, '🧒🤝🧑')), ibtn('▶', 'начать', step, 'play'));
  say(P.duoHello);
}
