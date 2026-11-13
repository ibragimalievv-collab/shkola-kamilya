// ГЛАВНЫЙ ФАЙЛ ДЕТСКОЙ ЧАСТИ: экраны и переходы между ними.
// Приветствие → раскраска помощника → карта островов → остров → уровень → награда.

import { h, makeRng, pl } from './util.js';
import { ISLANDS, LEVELS } from './curriculum.js';
import { buildSession, makeTask, tokW } from './tasks.js';
import { createStore } from './store.js';
import { say, hush, sfx, setVoiceConfig, setSilent, loadClips } from './audio.js';
import { heroSVG, HERO_PARTS, PALETTE, animalSVG, islandSVG, starSVG, LINE_COLOR } from './art.js';
import { renderTask } from './mechanics.js';
import { openParent } from './parent.js';
import { penScreen, penCount, sampleSVG } from './pen.js';
import { PEN_TASKS } from './cursive.js';

const store = createStore(localStorage);
const app = document.getElementById('app');
setVoiceConfig(store.settings);

let streak = 0;     // сколько уровней пройдено подряд без отдыха
let greeted = false;

// ---------- общие помощники экрана ----------
function screen(cls, ...kids) {
  hush();
  app.className = 'screen ' + cls;
  app.replaceChildren(...kids);
  app.scrollTop = 0;
}
const hero = (mood = 'ok', cls = '') => h('div', { class: 'hero-box ' + cls, html: heroSVG(store.profile.hero, mood) });
// Кнопка-картинка: при долгом тексте не нужна, но подпись для помощников чтения есть всегда.
const ibtn = (icon, label, fn, cls = '') => h('button', { class: 'ibtn ' + cls, 'aria-label': label, onclick: () => { sfx('tap'); fn(); } }, icon);
const stars3 = n => h('span', { class: 'stars', html: [1, 2, 3].map(i => starSVG(i <= n)).join('') });
const totalStars = () => Object.values(store.profile.levels).reduce((a, b) => a + b, 0);

// ---------- приветствие ----------
function welcome() {
  screen('welcome',
    h('h1', { class: 'logo' }, 'Школа ', h('span', {}, store.profile.name === 'Камиль' ? 'Камиля' : '· ' + store.profile.name)),
    hero('happy', 'big bounce'),
    ibtn('▶', 'начать', () => (store.profile.heroDone ? map() : paintHero()), 'play huge'));
}

// ---------- раскрась своего помощника ----------
function paintHero(back) {
  let color = PALETTE[0];
  const box = hero('happy', 'big');
  const redraw = () => { box.innerHTML = heroSVG(store.profile.hero, 'happy'); };
  box.addEventListener('click', e => {
    const part = e.target.closest('[data-part]')?.dataset.part;
    if (!part || !HERO_PARTS.includes(part)) return;
    store.profile.hero[part] = color;
    sfx('pop');
    redraw();
  });
  const pal = h('div', { class: 'palette' }, PALETTE.map((c, i) => h('button', { class: 'color' + (i ? '' : ' sel'), style: `background:${c}`, 'aria-label': 'цвет', onclick: e => {
    color = c; sfx('tap'); pal.querySelectorAll('.color').forEach(x => x.classList.toggle('sel', x === e.currentTarget));
  } })));
  const text = 'Привет! Я Лумик, твой помощник. Раскрась меня! Выбери цвет, а потом нажми на меня: на животик, ушки, лапки или звёздочку. Когда закончишь — нажми на зелёную кнопку.';
  screen('paint', h('div', { class: 'bar' }, ibtn('🔊', 'послушать ещё раз', () => say(text))), box, pal,
    ibtn('▶', 'готово', () => { store.profile.heroDone = true; store.save(); (back || map)(); }, 'play'));
  say(text);
}

// ---------- карта островов ----------
function map() {
  const next = store.nextLevel();
  const cards = ISLANDS.map(isl => {
    const open = store.islandOpen(isl), done = store.islandDone(isl);
    const got = isl.levels.filter(l => store.stars(l.id)).length;
    return h('button', { class: `island${open ? '' : ' locked'}${done ? ' done' : ''}${next && next.island === isl.n ? ' here' : ''}`, style: `--col:${LINE_COLOR[isl.line]}`,
      'aria-label': isl.title, onclick: () => { sfx('tap'); open ? island(isl) : say('Этот остров пока закрыт. Сначала пройди острова перед ним.'); } },
      h('span', { class: 'inum' }, isl.n + 1),
      h('span', { html: islandSVG(isl.line, !open) }),
      done ? h('span', { class: 'isticker', html: animalSVG(isl.n) }) : !open ? h('span', { class: 'lock' }, '🔒') : null,
      next && next.island === isl.n ? h('span', { class: 'boat', html: heroSVG(store.profile.hero, 'happy') }) : null,
      h('span', { class: 'iprog' }, h('i', { style: `width:${(got / isl.levels.length) * 100}%` })));
  });
  const hi = `Привет, ${store.profile.name}! Нажми на большую зелёную кнопку, чтобы играть дальше. Или выбери остров на карте.`;
  const pens = penCount(store);
  screen('map',
    h('div', { class: 'bar' },
      h('button', { class: 'hero-btn', 'aria-label': 'помощник', onclick: () => say(hi) }, hero('ok')),
      h('span', { class: 'score' }, h('span', { html: starSVG(true) }), totalStars()),
      h('span', { class: 'grow' }),
      ibtn('✍️', 'пишу ручкой', () => penScreen({ store, app, back: map, hero }), pens ? 'badge' : ''),
      ibtn('🏆', 'мои наклейки и рисунки', collection),
      ibtn('🔒', 'для родителей', () => openParent({ store, app, back: map, repaint: () => paintHero(map) }), 'small')),
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
      onclick: () => { sfx('tap'); open ? playLevel(L) : say('Этот уровень откроется, когда ты пройдёшь уровень перед ним.'); } },
      h('b', {}, L.review ? (i === isl.levels.length - 1 ? '🎁' : '🔁') : i + 1), open ? stars3(st) : h('span', { class: 'lock' }, '🔒'));
  });
  screen('island-view', h('div', { class: 'bar' }, ibtn('🗺️', 'на карту', map), h('span', { class: 'grow' }),
    ibtn('🔊', 'название острова', () => say(isl.title))),
  h('div', { class: 'ihead', style: `--col:${LINE_COLOR[isl.line]}` }, h('span', { html: islandSVG(isl.line) }), h('span', { class: 'isticker big' + (store.islandDone(isl) ? '' : ' ghost'), html: animalSVG(isl.n) })),
  h('div', { class: 'path' }, nodes));
  say(isl.title);
}

// ---------- уровень ----------
function playLevel(level) {
  if (store.overLimit()) return rest('limit');
  const isl = ISLANDS[level.island];
  const r = makeRng(Date.now() % 2147483647);
  const queue = buildSession(level, store.weakList(), r);
  let solved = 0, misses = 0, t0 = Date.now(), alive = true;
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
    let m = 0, ended = false, prompt = t.say, mech = null;
    const root = h('div'), buddy = hero('ok', 'mini');
    const mood = x => { buddy.innerHTML = heroSVG(store.profile.hero, x); };
    const c = {
      root, rng: r, islandN: level.island, locked: false, say,
      prompt(x) { prompt = x; say(x); },
      later: (fn, ms) => setTimeout(fn, ms),
      saveArt: url => store.addArt(url),
      ok(delay = 1100) {
        if (ended) return;
        ended = c.locked = true;
        sfx('ok'); mood('happy'); buddy.classList.add('bounce');
        if (m === 0 && (t.fromWeak || t.retry)) store.fixWeak(t.src);
        solved++;
        setTimeout(next, delay);
      },
      miss() {
        if (ended) return;
        m++; misses++; sfx('miss'); mood('think');
        if (m === 1) return say(['Почти! Попробуй ещё раз.', 'Не спеши. Подумай и попробуй ещё.', 'Чуть-чуть не так. Давай ещё разок!'][misses % 3]);
        // Вторая ошибка: показываем верный ответ и вернём такое же задание чуть позже.
        ended = c.locked = true;
        mech.reveal();
        say('Ничего страшного. Смотри, как правильно.');
        store.addWeak(t.src);
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
    const res = store.finishLevel(level, stars);
    streak++;
    reward(level, stars, res.sticker);
  }
}

// ---------- награда ----------
function reward(level, stars, sticker) {
  const isl = ISLANDS[level.island], nxt = store.nextLevel();
  const words = stars === 3 ? 'Отлично! Три звезды!' : stars === 2 ? 'Молодец! Две звезды!' : 'Уровень пройден! Одна звезда. В следующий раз будет ещё лучше.';
  const go = () => (streak >= 3 ? rest('break', nxt) : nxt ? playLevel(nxt) : map());
  screen('reward', h('div', { class: 'confetti' }, Array.from({ length: 24 }, (_, i) => h('i', { style: `--x:${(i * 37) % 100}%;--c:${PALETTE[i % 9]};--t:${1.6 + (i % 5) * 0.3}s;--dl:${(i % 7) * 0.12}s` }))),
    h('div', { class: 'stars huge', html: [1, 2, 3].map(i => starSVG(i <= stars)).join('') }),
    hero('happy', 'big bounce'),
    sticker ? h('div', { class: 'new-sticker' }, h('span', { html: animalSVG(isl.n) }), h('b', {}, isl.sticker)) : null,
    h('div', { class: 'opts' }, ibtn('🗺️', 'на карту', map), nxt ? ibtn('▶', 'дальше', go, 'play') : null));
  sfx('win');
  say(words + (sticker ? ` Весь остров пройден! Новая наклейка в твоей коллекции: ${isl.sticker}!` : ''));
}

// ---------- отдых ----------
function rest(kind, nxt) {
  streak = 0;
  const text = kind === 'limit'
    ? 'На сегодня мы позанимались достаточно. Ты молодец! Приходи завтра, я буду тебя ждать.'
    : 'Мы хорошо позанимались! Давай отдохнём: попрыгай, попей водички, посмотри в окошко. А потом продолжим.';
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
      return h('button', { class: 'sticker' + (has ? '' : ' ghost'), 'aria-label': isl.sticker, onclick: () => say(has ? isl.sticker : 'Эта наклейка ждёт тебя на острове номер ' + (isl.n + 1)) }, h('span', { html: animalSVG(isl.n) }));
    })),
    store.profile.gallery.length ? h('div', { class: 'gallery' }, store.profile.gallery.map(u => h('img', { src: u, alt: 'мой рисунок' }))) : null);
  say(got ? `У тебя ${got} ${pl(got, ['наклейка', 'наклейки', 'наклеек'])}. А ниже — твои рисунки.` : 'Здесь будут жить твои наклейки. Пройди остров целиком — и получишь первую!');
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
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
// Для отладки: показать любые задания по рецептам, не трогая прогресс.
window.__play = srcs => playLevel({ id: 'demo', island: 0, k: 0, intro: '', tasks: srcs, demo: true });
loadClips();
const params = new URLSearchParams(location.search);
if (params.has('selftest')) selftest();
else if (params.has('glyphs')) { // для отладки: все образцы письменных букв на одном листе
  app.className = 'screen';
  app.replaceChildren(h('div', { class: 'pen-grid' }, PEN_TASKS.map(t => h('div', { class: 'pen-card', html: sampleSVG(t) + `<small>${t.title}</small>` }))));
} else welcome();
