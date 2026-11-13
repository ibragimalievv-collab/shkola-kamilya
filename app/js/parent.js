// РОДИТЕЛЬСКИЙ РАЗДЕЛ. Вход — по задачке для взрослого. Здесь можно читать: это экран для родителей.

import { h, today, pl } from './util.js';
import { ISLANDS, LEVELS } from './curriculum.js';
import { LINES, lineOf, labelOf } from './tasks.js';
import { say, hush, russianVoices } from './audio.js';
import { penParent } from './pen.js';
import { voiceStudio } from './voice.js';

const btn = (text, fn, cls = '') => h('button', { class: 'pbtn ' + cls, onclick: fn }, text);
const card = (title, ...kids) => h('section', { class: 'pbox' }, h('h2', {}, title), ...kids);

// Вход: задачка, которую ребёнок шести лет пока не решит.
export function openParent(ctx) {
  const { app, back } = ctx;
  const a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4);
  let v = '';
  const out = h('div', { class: 'pad-out' }, '?');
  const press = d => { v = (v + d).slice(0, 3); out.textContent = v; if (+v === a * b) parentScreen(ctx); };
  hush();
  app.className = 'screen gate';
  app.replaceChildren(h('div', { class: 'bar' }, h('button', { class: 'ibtn', 'aria-label': 'назад', onclick: back }, '🗺️')),
    h('h2', {}, 'Раздел для родителей'), h('p', {}, `Сколько будет ${a} × ${b}?`), out,
    h('div', { class: 'pad' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => h('button', { class: 'key', onclick: () => press(d) }, d)),
      h('button', { class: 'key back', onclick: () => { v = ''; out.textContent = '?'; } }, '⌫'), h('button', { class: 'key', onclick: () => press(0) }, 0)));
}

function parentScreen(ctx) {
  const { store, app, back, repaint } = ctx;
  const again = () => parentScreen(ctx);
  const p = store.profile, st = store.state;

  // --- профили ---
  const profiles = card('Ребёнок',
    h('div', { class: 'prow' }, Object.entries(st.profiles).map(([id, pr]) => btn(pr.name, () => { store.switchProfile(id); again(); }, id === st.current ? 'on' : ''))),
    h('div', { class: 'prow' },
      btn('Переименовать', () => { const n = prompt('Имя ребёнка', p.name); if (n && n.trim()) { p.name = n.trim().slice(0, 20); store.save(); again(); } }),
      btn('Добавить ребёнка', () => { const n = prompt('Имя второго ребёнка', ''); if (n && n.trim()) { store.addProfile(n.trim().slice(0, 20)); again(); } }),
      btn('Перекрасить помощника', repaint),
      Object.keys(st.profiles).length > 1 ? btn('Удалить этот профиль', () => { if (confirm(`Удалить профиль «${p.name}» со всем прогрессом?`)) { store.removeProfile(st.current); again(); } }, 'warn') : null),
    h('p', { class: 'hint' }, 'У каждого ребёнка свой прогресс, свой помощник и свои рисунки.'));

  // --- прогресс простыми словами ---
  const progress = card('Что уже умеет', Object.entries(LINES).map(([k, name]) => {
    const isl = ISLANDS.filter(i => i.line === k), all = isl.flatMap(i => i.levels), done = all.filter(l => p.levels[l.id]).length;
    const finished = isl.filter(i => store.islandDone(i)), now = isl.find(i => !store.islandDone(i));
    return h('div', { class: 'line' }, h('b', {}, `${name}: ${done} из ${all.length}`), h('div', { class: 'progress' }, h('i', { style: `width:${(done / all.length) * 100}%` })),
      h('p', {}, finished.length ? `Уже ${finished[finished.length - 1].can}.` : 'Пока только начинает.', now ? ` Сейчас: ${now.topic.toLowerCase()}.` : ' Линия пройдена целиком!'));
  }));

  // --- слабые места ---
  const weakBy = {};
  for (const w of p.weak) { const l = LINES[lineOf(w.s)]; (weakBy[l] ||= new Set()).add(labelOf(w.s)); }
  const weak = card('Над чем стоит поработать', Object.keys(weakBy).length
    ? Object.entries(weakBy).map(([l, set]) => h('p', {}, h('b', {}, l + ': '), [...set].join('; ') + '.'))
    : h('p', {}, 'Сейчас трудных мест нет.'),
  h('p', { class: 'hint' }, 'Приложение само вернёт эти задания в следующих уровнях.'));

  // --- время занятий ---
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return d; });
  const maxSec = Math.max(600, ...days.map(d => p.days[today(d)]?.sec || 0));
  const time = card('Время занятий за две недели', h('div', { class: 'days' }, days.map(d => {
    const rec = p.days[today(d)] || { sec: 0, levels: 0 }, min = Math.round(rec.sec / 60);
    return h('div', { class: 'day', title: `${min} мин, уровней: ${rec.levels}` }, h('span', {}, min || ''), h('i', { style: `height:${(rec.sec / maxSec) * 100}%` }), h('small', {}, `${d.getDate()}.${d.getMonth() + 1}`));
  })), h('p', { class: 'hint' }, `Сегодня: ${Math.round(store.todaySec() / 60)} мин. Всего пройдено уровней: ${Object.keys(p.levels).length} из ${LEVELS.length}.`));

  // --- настройки ---
  const voices = russianVoices();
  const voiceSel = h('select', { onchange: e => { st.settings.voice = e.target.value; store.save(); } },
    h('option', { value: '' }, 'Голос по умолчанию'), voices.map(v => h('option', { value: v.voiceURI, selected: v.voiceURI === st.settings.voice }, v.name)));
  const rate = h('input', { type: 'range', min: 0.6, max: 1.2, step: 0.05, value: st.settings.rate, oninput: e => { st.settings.rate = +e.target.value; store.save(); } });
  const limit = h('select', { onchange: e => { st.settings.dailyLimit = +e.target.value; store.save(); } },
    [0, 15, 20, 30, 45, 60].map(m => h('option', { value: m, selected: m === st.settings.dailyLimit }, m ? `${m} минут в день` : 'Без ограничения')));
  const settings = card('Настройки',
    h('label', {}, 'Голос озвучки ', voiceSel), h('label', {}, 'Скорость речи ', rate),
    btn('Проверить голос', () => say('Привет! Я Лумик. Давай учиться вместе!')),
    voices.length ? null : h('p', { class: 'warn-text' }, 'На устройстве не найден русский голос. Установите его в настройках устройства (раздел «Синтез речи» или «Преобразование текста в речь»).'),
    h('label', {}, 'Дневной лимит ', limit),
    h('p', { class: 'hint' }, 'После трёх уровней подряд помощник сам предлагает отдохнуть. Когда дневной лимит исчерпан, новые уровни в этот день не открываются.'));

  // --- острова ---
  const islands = card('Острова: открыть или закрыть', h('div', { class: 'isl-list' }, ISLANDS.map(isl => {
    const got = isl.levels.filter(l => p.levels[l.id]).length;
    return h('label', {}, h('span', {}, `${isl.n + 1}. ${isl.title} — ${LINES[isl.line]} (${got}/${isl.levels.length})`),
      h('select', { onchange: e => store.setOverride(isl.id, e.target.value) },
        [['', 'по порядку'], ['open', 'открыт'], ['closed', 'закрыт']].map(([v, t]) => h('option', { value: v, selected: (p.overrides[isl.id] || '') === v }, t))));
  })));

  // --- данные ---
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async e => {
    try { store.importText(await e.target.files[0].text()); alert('Прогресс загружен.'); again(); } catch (err) { alert('Не получилось: ' + err.message); }
  } });
  const data = card('Прогресс: сохранить и перенести',
    h('div', { class: 'prow' },
      btn('Сохранить в файл', () => {
        const a = h('a', { href: URL.createObjectURL(new Blob([store.exportText()], { type: 'application/json' })), download: `shkola-kamilya-${today()}.json` });
        document.body.append(a); a.click(); a.remove();
      }),
      btn('Загрузить из файла', () => file.click()), file,
      btn('Сбросить прогресс', () => { if (confirm(`Стереть весь прогресс профиля «${p.name}»? Это нельзя отменить.`)) { store.resetProfile(); again(); } }, 'warn')),
    h('p', { class: 'hint' }, 'Прогресс хранится только на этом устройстве. Файл пригодится, чтобы перенести его на другой планшет или сохранить на всякий случай.'));

  hush();
  app.className = 'screen parent';
  app.replaceChildren(h('div', { class: 'bar' }, h('button', { class: 'ibtn', 'aria-label': 'назад', onclick: back }, '🗺️'), h('h1', {}, 'Для родителей')),
    profiles, progress, voiceStudio(), penParent({ store, again, app }), weak, time, settings, islands, data);
  app.scrollTop = 0;
}

export { pl };
