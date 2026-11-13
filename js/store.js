// ХРАНИЛИЩЕ: профили детей, прогресс, настройки. Всё лежит на самом устройстве.
// Экран не трогаем, поэтому файл проверяется автоматически (см. tests/).
// Старые сохранения читаются как есть: новые поля добавляются сами, прогресс не теряется.

import { LEVELS, ISLANDS } from './curriculum.js';
import { today } from './util.js';

const KEY = 'shkola-kamilya-v1';
export const HERO_DEFAULT = { body: '#5bc0eb', belly: '#fff4c2', ears: '#3a86c8', feet: '#ffa94d', star: '#ffd43b' };

const newProfile = name => ({
  name,
  heroDone: false,          // раскрасил ли ребёнок своего помощника
  hero: { ...HERO_DEFAULT },
  levels: {},               // номер уровня → сколько звёзд (1–3)
  weak: [],                 // умное повторение: [{ s: рецепт задания, n: верных подряд, due: когда вернуть }]
  days: {},                 // дата → { sec: секунд занятий, levels: пройдено уровней, ids: какие именно }
  gallery: [],              // последние рисунки ребёнка
  overrides: {},            // остров → 'open' | 'closed' (решение родителя)
});
const fresh = () => ({ v: 1, current: 'p1', profiles: { p1: newProfile('Камиль') }, settings: { voice: '', rate: 0.9, dailyLimit: 0, volVoice: 1, volSfx: 1 } });

// Уровни по линиям: в каждой линии уровни идут строго по порядку.
const lineOfIsland = isl => (isl.line === 'D' ? 'X' : isl.line); // умножение и деление — одна дорожка
const BY_LINE = {};
for (const l of LEVELS) (BY_LINE[lineOfIsland(ISLANDS[l.island])] ||= []).push(l);
const addDays = (dstr, n) => { const d = new Date(dstr + 'T12:00:00'); d.setDate(d.getDate() + n); return today(d); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createStore(storage, now = () => today()) {
  let state;
  try { state = JSON.parse(storage.getItem(KEY)) || fresh(); } catch { state = fresh(); }
  if (!state.profiles || !state.profiles[state.current]) state = fresh();

  const save = () => { try { storage.setItem(KEY, JSON.stringify(state)); } catch { /* память переполнена — играем дальше */ } };
  const p = () => state.profiles[state.current];
  const day = () => (p().days[now()] ||= { sec: 0, levels: 0 });
  const done = id => !!p().levels[id];

  const api = {
    get state() { return state; },
    get settings() { return state.settings; },
    get profile() { return p(); },
    save,
    // Раздел профиля, которого могло не быть в старом сохранении: store.part('home', {})
    part(key, initial) { return (p()[key] ??= initial); },

    // --- профили ---
    addProfile(name) {
      const id = 'p' + Date.now().toString(36);
      state.profiles[id] = newProfile(name || 'Ребёнок');
      state.current = id;
      save();
      return id;
    },
    switchProfile(id) { if (state.profiles[id]) { state.current = id; save(); } },
    resetProfile() { state.profiles[state.current] = newProfile(p().name); save(); },
    removeProfile(id) {
      if (Object.keys(state.profiles).length < 2) return;
      delete state.profiles[id];
      if (state.current === id) state.current = Object.keys(state.profiles)[0];
      save();
    },

    // --- уровни ---
    stars: id => p().levels[id] || 0,
    islandOpen(isl) { return isl.levels.some(l => api.isOpen(l)); },
    islandDone(isl) { return isl.levels.every(l => done(l.id)); },
    // Остров, до которого ребёнок дошёл по общей дороге.
    frontier() { const l = LEVELS.find(x => !done(x.id)); return l ? l.island : ISLANDS.length - 1; },
    // Уровень открыт, если пройден предыдущий уровень той же линии, пройдены острова, без которых его не понять,
    // и он не слишком далеко впереди. Так каждый день можно заниматься разным: чтением, счётом и письмом.
    isOpen(level) {
      const isl = ISLANDS[level.island], o = p().overrides[isl.id];
      if (o === 'closed') return false;
      if (o === 'open') return true;
      const line = BY_LINE[lineOfIsland(isl)], i = line.indexOf(level);
      if (i > 0 && !done(line[i - 1].id)) return false;
      if ((isl.needs || []).some(id => !api.islandDone(ISLANDS.find(x => x.id === id)))) return false;
      return isl.n <= api.frontier() + 6;
    },
    // Следующий уровень по общей дороге.
    nextLevel() { return LEVELS.find(l => !done(l.id) && api.isOpen(l)) || null; },
    // Следующий уровень на сегодня: три уровня из разных линий, чтение — обязательно и первым.
    todayIds: () => (p().days[now()] || {}).ids || [],
    dayDone: () => api.todayIds().length >= 3,
    nextForToday() {
      const played = new Set(api.todayIds().map(id => lineOfIsland(ISLANDS[LEVELS.find(l => l.id === id)?.island ?? 0])));
      const nextIn = line => BY_LINE[line].find(l => !done(l.id) && api.isOpen(l));
      const turn = new Date(now() + 'T12:00:00').getDate() % 3, rest = ['M', 'W', 'X'];
      const order = ['R', ...rest.slice(turn), ...rest.slice(0, turn)];
      for (const line of order) if (!played.has(line)) { const l = nextIn(line); if (l) return l; }
      return api.nextLevel();
    },
    // Записать результат; вернуть, получена ли наклейка за остров.
    finishLevel(level, stars) {
      const isl = ISLANDS[level.island], was = api.islandDone(isl);
      p().levels[level.id] = Math.max(p().levels[level.id] || 0, stars);
      day().levels++;
      (day().ids ||= []).push(level.id);
      save();
      return { sticker: !was && api.islandDone(isl) };
    },
    setOverride(islandId, v) { if (v) p().overrides[islandId] = v; else delete p().overrides[islandId]; save(); },
    // Проверка на входе: отметить знакомые уровни пройденными (родитель может вернуть их).
    skipLevels(ids) { const sk = api.part('skipped', {}); for (const id of ids) if (!done(id)) { p().levels[id] = 1; sk[id] = 1; } save(); },
    unskipAll() { const sk = api.part('skipped', {}); for (const id of Object.keys(sk)) delete p().levels[id]; p().skipped = {}; save(); },

    // --- умное повторение ---
    // Ошибка возвращается через день, потом через три дня, потом через неделю — пока не будет трёх верных ответов подряд.
    addWeak(src) {
      const w = p().weak.find(x => same(x.s, src));
      if (w) { w.n = 0; w.due = addDays(now(), 1); } else p().weak.push({ s: src, n: 0, due: addDays(now(), 1) });
      if (p().weak.length > 60) p().weak.shift();
      save();
    },
    fixWeak(src) {
      const i = p().weak.findIndex(x => same(x.s, src));
      if (i < 0) return;
      const w = p().weak[i];
      w.n = (w.n || 0) + 1;
      if (w.n >= 3) p().weak.splice(i, 1); else w.due = addDays(now(), w.n === 1 ? 3 : 7);
      save();
    },
    // Что пора повторить сегодня (старые записи без даты считаем готовыми к повторению).
    weakList: () => p().weak.filter(x => !x.due || x.due <= now()).map(x => x.s),
    weakAll: () => p().weak,

    // --- время занятий и цепочка дней ---
    addTime(sec) { day().sec += Math.max(0, Math.min(sec, 20 * 60)); save(); },
    todaySec: () => (p().days[now()] || { sec: 0 }).sec,
    overLimit() { const m = state.settings.dailyLimit; return m > 0 && api.todaySec() >= m * 60; },
    // Сколько дней подряд ребёнок занимается. Один пропуск за семь дней цепочку не рвёт.
    streak() {
      const played = d => (p().days[d]?.levels || 0) > 0;
      let d = now(), n = 0, lastMiss = -99;
      if (!played(d)) d = addDays(d, -1); // сегодняшний день ещё впереди
      for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
        if (played(d)) n++;
        else if (n > 0 && i - lastMiss >= 7 && played(addDays(d, -1))) lastMiss = i; // простили один пропуск
        else break;
      }
      return n;
    },

    // --- рисунки ---
    addArt(dataUrl) { p().gallery.unshift(dataUrl); p().gallery.length = Math.min(p().gallery.length, 12); save(); },

    // --- перенос на другое устройство ---
    exportText: () => JSON.stringify(state),
    importText(text) {
      const s = JSON.parse(text);
      if (!s || s.v !== 1 || !s.profiles || !s.profiles[s.current] || !s.settings) throw new Error('Это не файл «Школы Камиля»');
      state = s;
      save();
    },
  };
  return api;
}
