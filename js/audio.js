// ГОЛОС И ЗВУКИ.
// Приложение проигрывает заранее записанные файлы из папки audio — во время игры ничего не синтезируется
// и никуда не отправляется. Порядок выбора для каждого кусочка фразы:
//   1) запись родителей из «Студии голоса» (буквы, слоги, слова);
//   2) готовая запись из набора острова;
//   3) запасной вариант — встроенный голос устройства (если записи нет или набор ещё не загрузился).

import { idb } from './db.js';
import { pieces, clean, plainText } from './speech.js';
export { plainText };

let cfg = { voice: '', rate: 0.9, volVoice: 1, volSfx: 1 };
let silent = false; // в режиме самопроверки молчим
let turn = 0;       // номер текущей фразы: новая фраза перебивает старую
const player = typeof Audio !== 'undefined' ? new Audio() : null; // один проигрыватель на всё приложение
let playerUrl = null;

export const setVoiceConfig = c => { cfg = c; };
export const setSilent = v => { silent = v; };
const volVoice = () => cfg.volVoice ?? 1;

// ---------- готовые записи: наборы по островам ----------
let manifest = null;              // список наборов и где в них лежит каждый кусочек
const where = new Map();          // отпечаток кусочка → [набор, смещение, длина]
const loaded = new Map();         // набор → звуковые данные
const loading = new Map();

// Прочитать список наборов и загрузить общий набор (буквы, числа, слова, похвала).
export async function initVoice() {
  try {
    manifest = await (await fetch('audio/manifest.json', { cache: 'no-cache' })).json();
    for (const [name, pack] of Object.entries(manifest.packs)) for (const [id, off, len] of pack.items) where.set(id, [name, off, len]);
    await loadPack('common');
    // Убираем из памяти устройства наборы прошлых версий озвучки.
    if (typeof caches !== 'undefined') {
      const keep = new Set(Object.values(manifest.packs).map(p => p.file));
      const cache = await caches.open('shkola-audio');
      for (const req of await cache.keys()) if (!keep.has(req.url.split('/').pop())) cache.delete(req);
    }
  } catch { /* записей нет — говорит встроенный голос */ }
}
// Загрузить набор острова (если есть интернет или он уже сохранён на устройстве).
export function loadPack(name) {
  const pack = manifest?.packs?.[name];
  if (!pack) return Promise.resolve();
  if (!loading.has(name)) loading.set(name, fetch('audio/' + pack.file).then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); }).then(buf => { loaded.set(name, buf); }).catch(() => { loading.delete(name); }));
  return loading.get(name);
}
// Заранее загрузить все наборы, в которых лежат записи для этих фраз (одна и та же фраза хранится один раз — в наборе того острова, где встретилась впервые).
export function prepare(texts) {
  const need = new Set();
  for (const t of texts) for (const p of pieces(t)) { const w = where.get(p.id); if (w) need.add(w[0]); }
  return Promise.all([...need].map(loadPack));
}
// Имена детей, которые озвучены (остальных помощник зовёт без имени).
export const voicedNames = () => manifest?.names || [];
// Есть ли готовая запись для кусочка прямо сейчас.
function ready(piece) {
  const w = where.get(piece.id);
  if (!w) return null;
  const buf = loaded.get(w[0]);
  if (!buf) { loadPack(w[0]); return null; }
  return new Blob([buf.slice(w[1], w[1] + w[2])], { type: 'audio/mpeg' });
}

// ---------- записи голоса родителей ----------
const clips = new Map(); // ключ → запись
export const hasClip = key => clips.has(key);
export const clipCount = prefix => [...clips.keys()].filter(k => k.startsWith(prefix)).length;
export async function loadClips() {
  try { for (const k of await idb.keys('clips')) clips.set(k, await idb.get('clips', k)); } catch { /* записей нет */ }
}
export async function saveClip(key, blob) { await idb.put('clips', key, blob); clips.set(key, blob); }
export async function deleteClip(key) { await idb.del('clips', key); clips.delete(key); }
export const playClip = (key, done) => playBlob(clips.get(key), done);

function playBlob(blob, done) {
  if (!player || !blob) return done?.();
  if (playerUrl) URL.revokeObjectURL(playerUrl);
  playerUrl = URL.createObjectURL(blob);
  player.src = playerUrl;
  player.volume = volVoice();
  player.onended = player.onerror = () => done?.();
  player.play().catch(() => done?.());
}

// ---------- запасной вариант: встроенный голос устройства ----------
const synth = () => (typeof speechSynthesis !== 'undefined' ? speechSynthesis : null);
const quality = v => (/enhanced|premium|улучш|высок|natural|neural|siri/i.test(v.name) ? 10 : 0) + (/google|yuri|юрий|katya|катя/i.test(v.name) ? 3 : 0) + (v.localService ? 1 : 0);
export function russianVoices() {
  const s = synth();
  return s ? s.getVoices().filter(v => /^ru/i.test(v.lang)).sort((a, b) => quality(b) - quality(a)) : [];
}
export const voiceIsBasic = () => { const v = russianVoices(); return v.length > 0 && quality(v[0]) < 3; };
export const hasRecordedVoice = () => where.size > 0;

function speak(text, done) {
  const s = synth();
  if (!s) return done();
  const u = new SpeechSynthesisUtterance(clean(text));
  const vs = russianVoices();
  u.voice = vs.find(v => v.voiceURI === cfg.voice) || vs[0] || null;
  u.lang = 'ru-RU';
  u.rate = cfg.rate || 0.9;
  u.volume = volVoice();
  let fired = false;
  const end = () => { if (!fired) { fired = true; done(); } };
  u.onend = u.onerror = end;
  setTimeout(end, 2500 + text.length * 140); // на случай, если устройство не сообщило о конце фразы
  s.speak(u);
}

// ---------- сказать фразу ----------
// Что именно прозвучит: список шагов { blob } или { text } (нужно и для проверок).
export function plan(text) {
  const steps = [];
  for (const p of pieces(text)) {
    const blob = (p.key && clips.get(p.key)) || ready(p);
    if (blob) steps.push({ blob, id: p.id });
    else if (steps.length && steps[steps.length - 1].text != null) steps[steps.length - 1].text += ' ' + p.text; // соседние кусочки без записи читаем одной фразой
    else steps.push({ text: p.text });
  }
  return steps;
}
// Сказать текст вслух. Новая фраза перебивает старую.
export function say(text) {
  if (silent || !text) return;
  hush();
  const my = ++turn, steps = plan(text);
  const next = i => {
    if (my !== turn || i >= steps.length) return;
    const go = () => next(i + 1);
    if (steps[i].blob) playBlob(steps[i].blob, go); else speak(steps[i].text, go);
  };
  next(0);
}
export function hush() {
  turn++;
  synth()?.cancel();
  if (player) { player.onended = player.onerror = null; player.pause(); }
}

// ---------- короткие приятные звуки (делаем сами, без файлов) ----------
let ac = null;
function tone(freq, t0, dur, type = 'sine', vol = 0.15) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol * (cfg.volSfx ?? 1) + 0.0001, ac.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + dur);
  o.connect(g).connect(ac.destination);
  o.start(ac.currentTime + t0);
  o.stop(ac.currentTime + t0 + dur);
}
const SOUNDS = {
  tap: () => tone(520, 0, 0.06, 'triangle', 0.08),
  pop: () => { tone(700, 0, 0.07); tone(1000, 0.05, 0.08); },
  ok: () => { tone(660, 0, 0.12); tone(880, 0.1, 0.12); tone(1320, 0.2, 0.2); },                      // верный ответ
  miss: () => { tone(330, 0, 0.16, 'sine', 0.1); tone(277, 0.13, 0.22, 'sine', 0.1); },                 // мягкая ошибка
  star: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.12)),       // звезда
  island: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.35)),      // новый остров
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.25)),
};
export function sfx(name) {
  if (silent || (cfg.volSfx ?? 1) === 0) return;
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    SOUNDS[name]?.();
  } catch { /* звук не обязателен */ }
}
