// ГЛАВНЫЙ ФАЙЛ ДЕТСКОЙ ЧАСТИ: экраны и переходы между ними.
// Приветствие → раскраска помощника → карта островов → остров → уровень → награда.

import { h, makeRng, today } from './util.js';
import { idb } from './db.js';
import { drawPet, freeDraw, homeScreen, homeNew, library, booksOpen, storyCard, storyStrip, surprise, dayDone, placement, showDad, petImg } from './fun.js';
import { GIFT_COLORS, STORIES } from './stories.js';
import { reminderDue } from './parent2.js';
import { ISLANDS, LEVELS } from './curriculum.js';
import { buildSession, makeTask, adjust, tokW } from './tasks.js';
import { createStore } from './store.js';
import { say, hush, sfx, setVoiceConfig, setSilent, loadClips, initVoice, loadPack, prepare, voicedNames, unlockAudio } from './audio.js';
import { P, PRAISE, PRAISE_NAME, HINTS, REVEAL } from './phrases.js';
import { heroSVG, HERO_PARTS, PALETTE, animalSVG, islandSVG, starSVG, LINE_COLOR } from './art.js';
import { renderTask } from './mechanics.js';
import { openParent } from './parent.js';
import { penScreen, penCount, sampleSVG } from './pen.js';
import { PEN_TASKS } from './cursive.js';

const store = createStore(localStorage);
const app = document.getElementById('app');
setVoiceConfig(store.settings);

let greeted = false;

// ---------- общие помощники экрана ----------
function screen(cls, ...kids) {
  hush();
  app.className = 'screen ' + cls;
  app.replaceChildren(...kids.flat().filter(k => k != null && k !== false)); // пустые места пропускаем
  app.scrollTop = 0;
}
const hero = (mood = 'ok', cls = '') => h('div', { class: 'hero-box ' + cls, html: heroSVG(store.profile.hero, mood) });
// Кнопка-картинка: при долгом тексте не нужна, но подпись для помощников чтения есть всегда.
const ibtn = (icon, label, fn, cls = '') => h('button', { class: 'ibtn ' + cls, 'aria-label': label, onclick: () => { sfx('tap'); fn(); } }, icon);
const stars3 = n => h('span', { class: 'stars', html: [1, 2, 3].map(i => starSVG(i <= n)).join('') });
const totalStars = () => Object.values(store.profile.levels).reduce((a, b) => a + b, 0);
// Имя ребёнка произносим, только если оно заранее озвучено (иначе звучал бы другой голос).
const named = () => voicedNames().includes(store.profile.name);
// Выбрать фразу так, чтобы она не повторяла предыдущую такого же вида.
const lastSaid = {};
function pickNew(list, kind) {
  let i;
  do { i = Math.floor(Math.random() * list.length); } while (list.length > 1 && i === lastSaid[kind]);
  lastSaid[kind] = i;
  return list[i];
}
const praise = () => pickNew(named() ? [...PRAISE, ...PRAISE_NAME(store.profile.name)] : PRAISE, 'praise');
// Общий набор для экранов из файла fun.js.
const X = { store, app, screen, hero, ibtn, say, map };
// Сохранить запись чтения вслух (только на устройстве; храним последние 60).
async function saveRead(blob, text) {
  const id = 'rd-' + Date.now();
  try { await idb.put('reads', id, blob); } catch { return; }
  const list = store.part('reads', []);
  list.push({ id, t: text, d: today() });
  while (list.length > 60) idb.del('reads', list.shift().id).catch(() => {});
  store.save();
}
// С чего начать: раскрасить помощника → нарисовать своего героя → игра-разведка (только для новичка) → карта.
function start() {
  const p = store.profile;
  if (!p.heroDone) return paintHero(start);
  if (!p.pet && !p.petSkipped) return drawPet(X, () => { p.petSkipped = true; store.save(); start(); });
  if (!p.placed && !Object.keys(p.levels).length) return placement(X, start);
  map();
}

// ---------- приветствие ----------
function welcome() {
  screen('welcome',
    h('h1', { class: 'logo' }, 'Школа ', h('span', {}, store.profile.name === 'Камиль' ? 'Камиля' : '· ' + store.profile.name)),
    hero('happy', 'big bounce'),
    ibtn('▶', 'начать', start, 'play huge'),
    // Кнопка для взрослого: вписать имя своего ребёнка (то же самое есть в разделе «Для родителей»).
    h('button', { class: 'name-btn', onclick: () => {
      const n = prompt('Как зовут ребёнка? Это имя будет на заставке и в разделе для родителей.', store.profile.name);
      if (n && n.trim()) { store.profile.name = n.trim().slice(0, 20); store.save(); welcome(); }
    } }, '✏️ Имя ребёнка: ' + store.profile.name));
}

// ---------- раскрась своего помощника ----------
function paintHero(back) {
  let color = PALETTE[0];
  void GIFT_COLORS;
  const box = hero('happy', 'big');
  const redraw = () => { box.innerHTML = heroSVG(store.profile.hero, 'happy'); };
  box.addEventListener('click', e => {
    const part = e.target.closest('[data-part]')?.dataset.part;
    if (!part || !HERO_PARTS.includes(part)) return;
    store.profile.hero[part] = color;
    sfx('pop');
    redraw();
  });
  const colors = [...PALETTE, ...store.part('gifts', { colors: [], badges: [], last: 0 }).colors]; // плюс краски-сюрпризы
  const pal = h('div', { class: 'palette' }, colors.map((c, i) => h('button', { class: 'color' + (i ? '' : ' sel'), style: `background:${c}`, 'aria-label': 'цвет', onclick: e => {
    color = c; sfx('tap'); pal.querySelectorAll('.color').forEach(x => x.classList.toggle('sel', x === e.currentTarget));
  } })));
  const text = P.paint;
  screen('paint', h('div', { class: 'bar' }, ibtn('🔊', 'послушать ещё раз', () => say(text))), box, pal,
    ibtn('▶', 'готово', () => { store.profile.heroDone = true; store.save(); (back || map)(); }, 'play'));
  say(text);
}

// ---------- карта островов ----------
function map() {
  const next = store.dayDone() ? store.nextLevel() : store.nextForToday();
  const days = store.streak(), fresh = homeNew(store);
  const cards = ISLANDS.map(isl => {
    const open = store.islandOpen(isl), done = store.islandDone(isl);
    const got = isl.levels.filter(l => store.stars(l.id)).length;
    return h('button', { class: `island${open ? '' : ' locked'}${done ? ' done' : ''}${next && next.island === isl.n ? ' here' : ''}`, style: `--col:${LINE_COLOR[isl.line]}`,
      'aria-label': isl.title, onclick: () => { sfx('tap'); open ? island(isl) : say(P.islandLocked); } },
      h('span', { class: 'inum' }, isl.n + 1),
      h('span', { html: islandSVG(isl.line, !open) }),
      done ? h('span', { class: 'isticker', html: animalSVG(isl.n) }) : !open ? h('span', { class: 'lock' }, '🔒') : null,
      next && next.island === isl.n ? h('span', { class: 'boat', html: heroSVG(store.profile.hero, 'happy') }) : null,
      next && next.island === isl.n ? petImg(store, 'pet onmap') : null,
      h('span', { class: 'iprog' }, h('i', { style: `width:${(got / isl.levels.length) * 100}%` })));
  });
  const hi = (named() ? P.hi(store.profile.name) : P.hiNoName) + (days >= 2 ? ' ' + P.streak(days) : '');
  if (next) { loadPack(ISLANDS[next.island].id); const after = ISLANDS[next.island + 1]; if (after) loadPack(after.id); } // подгружаем голос для ближайших островов
  const pens = penCount(store);
  screen('map',
    h('div', { class: 'bar' },
      h('button', { class: 'hero-btn', 'aria-label': 'помощник', onclick: () => say(hi) }, hero('ok')),
      h('span', { class: 'score' }, h('span', { html: starSVG(true) }), totalStars()),
      days ? h('button', { class: 'score chain', 'aria-label': 'дней подряд', onclick: () => say(P.streak(days)) }, '🔥', days) : null,
      h('span', { class: 'grow' }),
      ibtn('📚', 'книжки', () => library(X, map), booksOpen(store) > Object.keys(store.part('books', {})).length ? 'badge' : ''),
      ibtn('🏠', 'домик', () => homeScreen(X, map), fresh ? 'badge' : ''),
      ibtn('✍️', 'пишу ручкой', () => penScreen({ store, app, back: map, hero }), pens ? 'badge' : ''),
      ibtn('🏆', 'мои наклейки и рисунки', collection),
      ibtn('🔒', 'для родителей', () => openParent({ store, app, back: map, repaint: () => paintHero(map), placement: () => placement(X, map) }), 'small')),
    h('div', { class: 'sea' }, cards),
    next ? ibtn('▶', 'играть дальше', () => playLevel(next), 'play float') : null);
  app.querySelector('.island.here')?.scrollIntoView({ block: 'center' });
  if (!greeted) { greeted = true; say(hi); }
}

// ---------- один остров: дорожка из уровней ----------
function island(isl) {
  const nodes = isl.levels.map((L, i) => {
    const open = store.isOpen(L), st = store.stars(L.id);
    return h('button', { class: `node${open ? '' : ' locked'}${st ? ' done' : ''}${L.review ? ' review' : ''}`, 'aria-label': L.title,
      onclick: () => { sfx('tap'); open ? playLevel(L) : say(P.levelLocked); } },
      h('b', {}, L.review ? (i === isl.levels.length - 1 ? '🎁' : '🔁') : i + 1), open ? stars3(st) : h('span', { class: 'lock' }, '🔒'));
  });
  screen('island-view', h('div', { class: 'bar' }, ibtn('🗺️', 'на карту', map), h('span', { class: 'grow' }),
    ibtn('🔊', 'название острова', () => say(isl.title))),
  h('div', { class: 'ihead', style: `--col:${LINE_COLOR[isl.line]}` }, h('span', { html: islandSVG(isl.line) }), h('span', { class: 'isticker big' + (store.islandDone(isl) ? '' : ' ghost'), html: animalSVG(isl.n) })),
  storyStrip(X, isl),
  h('div', { class: 'path' }, nodes),
  store.islandDone(isl) && !store.part('shown', {})[isl.id] ? ibtn('👨‍👩‍👦', 'покажи папе', () => showDad(X, isl, () => island(isl)), 'play') : null);
  say(isl.title);
}

// ---------- уровень ----------
function playLevel(level) {
  if (store.overLimit()) return rest('limit');
  const isl = ISLANDS[level.island];
  loadPack(isl.id);
  const r = makeRng(Date.now() % 2147483647);
  const queue = buildSession(level, store.weakList(), r);
  prepare([level.intro, ...queue.flatMap(t => [t.say, t.ask, t.text]).filter(x => typeof x === 'string'), ...queue.flatMap(t => (t.m === 'story' ? t.text : []))]); // подгружаем записи для этого уровня
  let solved = 0, misses = 0, t0 = Date.now(), alive = true;
  let ease = 0, okRow = 0, failRow = 0; // подстройка сложности: -1 проще, 0 как есть, +1 труднее
  const leave = () => { alive = false; store.addTime((Date.now() - t0) / 1000); island(isl); };

  // Объяснение перед заданиями.
  const show = level.show ? h('div', { class: 'letter-card' },
    h('div', { class: 'big-letter' }, level.show.letter, h('small', {}, level.show.letter.toLowerCase())),
    h('div', { class: 'opts' }, level.show.pics.map(([e, w]) => h('button', { class: 'opt', onclick: () => say(tokW(w)) }, h('span', { class: 'pic' }, e))))) : null;
  screen('intro', h('div', { class: 'bar' }, ibtn('🏠', 'выйти', leave), h('span', { class: 'grow' }), ibtn('🔊', 'послушать ещё раз', () => say(level.intro))),
    h('div', { class: 'intro-body' }, hero('ok', 'mid bounce'), show), ibtn('▶', 'начать', next, 'play'));
  say(level.intro);

  function next() {
    if (!alive) return;
    if (!queue.length) return finish();
    run(queue.shift());
  }

  function run(t) {
    if (!t.adjusted && ease) adjust(t, ease, r);
    let m = 0, ended = false, prompt = t.say, mech = null;
    const root = h('div'), buddy = hero('ok', 'mini');
    const mood = x => { buddy.innerHTML = heroSVG(store.profile.hero, x); };
    const c = {
      root, rng: r, islandN: level.island, locked: false, say,
      prompt(x) { prompt = x; say(x); },
      later: (fn, ms) => setTimeout(fn, ms),
      saveArt: url => store.addArt(url),
      saveRead, myPic: store.profile.pet?.img || null,
      saveWord: (u, text) => { const w = store.part('words', []); w.unshift({ u, t: text }); w.length = Math.min(w.length, 12); store.save(); },
      ok(delay = 1100) {
        if (ended) return;
        ended = c.locked = true;
        sfx('ok'); mood('happy'); buddy.classList.add('bounce');
        // Хвалим голосом не каждый раз, а примерно через раз — и только за ответ без ошибок.
        if (m === 0 && delay === 1100 && (solved + misses) % 2 === 0) { say(praise()); delay = 2000; }
        if (m === 0 && (t.fromWeak || t.retry)) store.fixWeak(t.src);
        // Серия верных ответов с первой попытки — можно чуть труднее; после упрощения возвращаемся к обычному.
        if (m === 0) { okRow++; failRow = 0; if (ease < 0 && okRow >= 3) ease = 0; else if (ease === 0 && okRow >= 5) ease = 1; } else { okRow = 0; if (ease > 0) ease = 0; }
        solved++;
        setTimeout(next, delay);
      },
      miss() {
        if (ended) return;
        m++; misses++; sfx('miss'); mood('think');
        if (m === 1) return say(pickNew(HINTS, 'hint'));
        // Вторая ошибка: показываем верный ответ и вернём такое же задание чуть позже.
        ended = c.locked = true;
        mech.reveal();
        say(pickNew(REVEAL, 'reveal'));
        store.addWeak(t.src);
        okRow = 0; if (++failRow >= 1 || ease > 0) ease = Math.max(-1, ease - 1); // не получилось — дальше задания попроще
        if (!t.retry) { const again = makeTask(t.src, r); again.retry = true; queue.push(again); }
        setTimeout(next, 3200);
      },
    };
    const done = solved / (solved + queue.length + 1);
    screen('level', h('div', { class: 'bar' }, ibtn('🏠', 'выйти', leave), buddy, h('div', { class: 'progress' }, h('i', { style: `width:${done * 100}%` })),
      ibtn('🔊', 'послушать задание', () => say(prompt), 'speak')), root);
    mech = renderTask(t, c);
    say(t.say);
  }

  function finish() {
    if (level.demo) return map();
    const stars = misses <= 1 ? 3 : misses <= 4 ? 2 : 1;
    store.addTime((Date.now() - t0) / 1000);
    const first = !store.stars(level.id);
    const res = store.finishLevel(level, stars);
    reward(level, stars, res.sticker, first);
  }
}

// ---------- награда ----------
function reward(level, stars, sticker, first) {
  const isl = ISLANDS[level.island];
  const words = stars === 3 ? P.stars3 : stars === 2 ? P.stars2 : P.stars1;
  const story = first ? storyCard(X, level) : null, gift = sticker ? null : surprise(X);
  const justDone = store.dayDone() && store.todayIds().length === 3; // только что закончен «короткий день»
  const nxt = store.dayDone() ? store.nextLevel() : store.nextForToday();
  const onward = () => (justDone ? dayDone(X) : nxt ? playLevel(nxt) : map());
  const go = () => (sticker && !store.part('shown', {})[isl.id] ? showDad(X, isl, onward) : onward());
  screen('reward', h('div', { class: 'confetti' }, Array.from({ length: 24 }, (_, i) => h('i', { style: `--x:${(i * 37) % 100}%;--c:${PALETTE[i % 9]};--t:${1.6 + (i % 5) * 0.3}s;--dl:${(i % 7) * 0.12}s` }))),
    h('div', { class: 'stars huge', html: [1, 2, 3].map(i => starSVG(i <= stars)).join('') }),
    hero('happy', 'big bounce'),
    sticker ? h('div', { class: 'new-sticker' }, h('span', { html: animalSVG(isl.n) }), h('b', {}, isl.sticker)) : null,
    story, gift?.el,
    h('div', { class: 'opts' }, ibtn('🗺️', 'на карту', map), ibtn('▶', 'дальше', go, 'play')));
  sfx(sticker ? 'island' : 'star');
  say(words + (sticker ? ' ' + P.sticker(isl.sticker) : '') + (story ? ' ' + STORY_LINE(level) : '') + (gift ? ' ' + gift.text : ''));
}

// Реплика истории, которая открылась после уровня.
const STORY_LINE = level => STORIES[ISLANDS[level.island].id]?.[1][level.k]?.[1] || '';

// ---------- отдых ----------
function rest(kind, nxt) {
  const text = kind === 'limit' ? P.restLimit : P.restBreak;
  screen('rest', hero('sleep', 'big'), h('div', { class: 'zzz' }, '💤'),
    h('div', { class: 'opts' }, ibtn('🗺️', 'на карту', map, 'play'), kind === 'break' && nxt ? ibtn('▶', 'ещё один уровень', () => playLevel(nxt), 'small') : null));
  say(text);
}

// ---------- коллекция наклеек и рисунков ----------
function collection() {
  const got = ISLANDS.filter(i => store.islandDone(i)).length;
  screen('collection', h('div', { class: 'bar' }, ibtn('🗺️', 'на карту', map), h('span', { class: 'grow' }), h('span', { class: 'score' }, `${got} / ${ISLANDS.length}`)),
    h('div', { class: 'stickers' }, ISLANDS.map(isl => {
      const has = store.islandDone(isl);
      return h('button', { class: 'sticker' + (has ? '' : ' ghost'), 'aria-label': isl.sticker, onclick: () => say(has ? isl.sticker : P.stickerWait(isl.n + 1)) }, h('span', { html: animalSVG(isl.n) }));
    })),
    h('div', { class: 'badges' }, store.part('gifts', { colors: [], badges: [], last: 0 }).badges.map(b => h('span', {}, b))),
    store.profile.gallery.length ? h('div', { class: 'gallery' }, store.profile.gallery.map(u => h('img', { src: u, alt: 'мой рисунок' }))) : null);
  say(got ? P.stickersHave(got) : P.stickersNone);
}

// ---------- самопроверка: программа сама проходит все уровни (адрес …/?selftest) ----------
async function selftest() {
  setSilent(true);
  const out = h('pre', { id: 'selftest', style: 'padding:16px;white-space:pre-wrap;font:16px monospace' }, 'Проверка…');
  const stage = h('div', { style: 'position:absolute;left:-9999px;width:900px' });
  app.replaceChildren(out, stage);
  const errors = [], mech = {};
  let tasks = 0;
  for (const level of LEVELS) {
    for (const seed of [1, 2]) {
      const r = makeRng(seed * 1000 + LEVELS.indexOf(level));
      for (const t of buildSession(level, [], r)) {
        for (const mode of ['auto', 'reveal']) {
          let ok = false;
          const c = { root: h('div'), rng: r, islandN: level.island, locked: false, say() {}, prompt() {}, later: fn => fn(), saveArt() {}, ok: () => { ok = true; }, miss: () => { throw new Error('ошибка при верном решении'); } };
          stage.replaceChildren(c.root);
          try {
            const m = renderTask(t, c);
            if (mode === 'auto') { m.auto(); if (!ok) throw new Error('задание не засчиталось'); } else m.reveal();
          } catch (e) { errors.push(`${level.id} ${JSON.stringify(t.src)} [${mode}]: ${e.message}`); }
        }
        tasks++; mech[t.m] = (mech[t.m] || 0) + 1;
      }
    }
    if (LEVELS.indexOf(level) % 20 === 0) { out.textContent = `Проверка… ${level.id}`; await new Promise(f => setTimeout(f)); }
  }
  stage.remove();
  out.textContent = `${errors.length ? 'ЕСТЬ ОШИБКИ' : 'ВСЁ В ПОРЯДКЕ'}\nуровней: ${LEVELS.length}, заданий пройдено: ${tasks}, механик: ${Object.keys(mech).length}, ошибок: ${errors.length}\n${errors.slice(0, 40).join('\n')}`;
  window.__selftest = { levels: LEVELS.length, tasks, mechanics: Object.keys(mech).length, errors };
}

// ---------- запуск ----------
// На своём компьютере (localhost) сохранённую копию не включаем, чтобы при проверке всегда видеть свежие файлы.
const localDev = location.hostname === 'localhost' && !location.search.includes('offline');
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !localDev) {
  // Когда на устройство приехало обновление, перезапускаем приложение, чтобы оно не работало по старой копии.
  // На заставке это незаметно; посреди занятия не перезапускаем — обновление применится при следующем открытии.
  const hadOld = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadOld && app.classList.contains('welcome')) location.reload(); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
}
// Для отладки: показать любые задания по рецептам, не трогая прогресс.
window.__fun = { reward: id => { const L = LEVELS.find(l => l.id === id); reward(L, 3, store.finishLevel(L, 3).sticker, true); }, placement: () => placement(X, map), showDad: id => showDad(X, ISLANDS.find(i => i.id === id), map), dayDone: () => dayDone(X) };
window.__play = srcs => playLevel({ id: 'demo', island: 0, k: 0, intro: '', tasks: srcs, demo: true });
loadClips();
initVoice();
document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
// Напоминание о занятии: пока приложение открыто или свёрнуто, раз в минуту смотрим на часы.
let reminded = '';
setInterval(() => {
  if (!reminderDue(store, reminded)) return;
  reminded = today();
  const text = 'Пора позаниматься! Лумик ждёт.';
  if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') navigator.serviceWorker?.ready.then(r => r.showNotification('Школа Камиля', { body: text, icon: 'icons/icon-192.png' })).catch(() => {});
  else if (app.classList.contains('map') || app.classList.contains('welcome')) { const b = h('button', { class: 'toast', onclick: () => b.remove() }, '⏰ ' + text); document.body.append(b); setTimeout(() => b.remove(), 15000); }
}, 60000);
const params = new URLSearchParams(location.search);
if (params.has('selftest')) selftest();
else if (params.has('glyphs')) { // для отладки: все образцы письменных букв на одном листе
  app.className = 'screen';
  app.replaceChildren(h('div', { class: 'pen-grid' }, PEN_TASKS.map(t => h('div', { class: 'pen-card', html: sampleSVG(t) + `<small>${t.title}</small>` }))));
} else welcome();
