// ХРАНИЛИЩЕ: профили детей, прогресс, настройки. Всё лежит на самом устройстве.
// Экран не трогаем, поэтому файл проверяется автоматически (см. tests/).

import { LEVELS, ISLANDS } from './curriculum.js';
import { today } from './util.js';

const KEY = 'shkola-kamilya-v1';
export const HERO_DEFAULT = { body: '#5bc0eb', belly: '#fff4c2', ears: '#3a86c8', feet: '#ffa94d', star: '#ffd43b' };

const newProfile = name => ({
  name,
  heroDone: false,          // раскрасил ли ребёнок своего помощника
  hero: { ...HERO_DEFAULT },
  levels: {},               // номер уровня → сколько звёзд (1–3)
  weak: [],                 // что повторять: [{ s: рецепт задания, n: сколько раз ещё вернуть }]
  days: {},                 // дата → { sec: секунд занятий, levels: пройдено уровней }
  gallery: [],              // последние рисунки ребёнка
  overrides: {},            // остров → 'open' | 'closed' (решение родителя)
});
const fresh = () => ({ v: 1, current: 'p1', profiles: { p1: newProfile('Камиль') }, settings: { voice: '', rate: 0.9, dailyLimit: 0, volVoice: 1, volSfx: 1 } });

export function createStore(storage) {
  let state;
  try { state = JSON.parse(storage.getItem(KEY)) || fresh(); } catch { state = fresh(); }
  if (!state.profiles || !state.profiles[state.current]) state = fresh();

  const save = () => { try { storage.setItem(KEY, JSON.stringify(state)); } catch { /* память переполнена — играем дальше */ } };
  const p = () => state.profiles[state.current];
  const day = () => (p().days[today()] ||= { sec: 0, levels: 0 });

  const api = {
    get state() { return state; },
    get settings() { return state.settings; },
    get profile() { return p(); },
    save,

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
    // Уровень открыт, если это самый первый, или пройден предыдущий, или родитель открыл остров.
    isOpen(level) {
      const o = p().overrides[ISLANDS[level.island].id];
      if (o === 'closed') return false;
      if (o === 'open') return true;
      const i = LEVELS.indexOf(level);
      return i === 0 || !!p().levels[LEVELS[i - 1].id];
    },
    islandOpen(isl) { return isl.levels.some(l => api.isOpen(l)); },
    islandDone(isl) { return isl.levels.every(l => p().levels[l.id]); },
    // Следующий уровень, который ждёт ребёнка.
    nextLevel() { return LEVELS.find(l => !p().levels[l.id] && api.isOpen(l)) || null; },
    // Записать результат; вернуть, получена ли наклейка за остров.
    finishLevel(level, stars) {
      const isl = ISLANDS[level.island], was = api.islandDone(isl);
      p().levels[level.id] = Math.max(p().levels[level.id] || 0, stars);
      day().levels++;
      save();
      return { sticker: !was && api.islandDone(isl) };
    },
    setOverride(islandId, v) { if (v) p().overrides[islandId] = v; else delete p().overrides[islandId]; save(); },

    // --- повторение ошибок ---
    addWeak(src) {
      const k = JSON.stringify(src), w = p().weak.find(x => JSON.stringify(x.s) === k);
      if (w) w.n = Math.min(3, w.n + 1); else p().weak.push({ s: src, n: 2 });
      if (p().weak.length > 40) p().weak.shift();
      save();
    },
    fixWeak(src) {
      const k = JSON.stringify(src), i = p().weak.findIndex(x => JSON.stringify(x.s) === k);
      if (i < 0) return;
      if (--p().weak[i].n <= 0) p().weak.splice(i, 1);
      save();
    },
    weakList: () => p().weak.map(x => x.s),

    // --- время занятий ---
    addTime(sec) { day().sec += Math.max(0, Math.min(sec, 20 * 60)); save(); },
    todaySec: () => (p().days[today()] || { sec: 0 }).sec,
    overLimit() { const m = state.settings.dailyLimit; return m > 0 && api.todaySec() >= m * 60; },

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
