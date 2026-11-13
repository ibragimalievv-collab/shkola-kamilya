// ГОЛОС И ЗВУКИ.
// Говорит встроенный в устройство синтез речи (работает без интернета). Его качество зависит от устройства,
// поэтому родители могут записать буквы, слоги и слова своим голосом («Студия голоса» в родительском разделе).
// В тексте такие места помечены так: {ключ|что сказать синтезатору}. Есть запись — звучит запись, нет — синтезатор.

import { idb } from './db.js';

let cfg = { voice: '', rate: 0.9 };
let silent = false; // в режиме самопроверки молчим
let turn = 0;       // номер текущей фразы: новая фраза перебивает старую
let player = null;

export const setVoiceConfig = c => { cfg = c; };
export const setSilent = v => { silent = v; };

const synth = () => (typeof speechSynthesis !== 'undefined' ? speechSynthesis : null);

// Русские голоса устройства, лучшие — первыми (улучшенные и «естественные» выше обычных).
const quality = v => (/enhanced|premium|улучш|высок|natural|neural|siri/i.test(v.name) ? 10 : 0) + (/google|yuri|юрий|katya|катя/i.test(v.name) ? 3 : 0) + (v.localService ? 1 : 0);
export function russianVoices() {
  const s = synth();
  return s ? s.getVoices().filter(v => /^ru/i.test(v.lang)).sort((a, b) => quality(b) - quality(a)) : [];
}
export const voiceIsBasic = () => { const v = russianVoices(); return v.length > 0 && quality(v[0]) < 3; };

// --- записи голоса родителей ---
const clips = new Map(); // ключ → адрес записи в памяти
export const hasClip = key => clips.has(key);
export const clipCount = prefix => [...clips.keys()].filter(k => k.startsWith(prefix)).length;
export async function loadClips() {
  try { for (const k of await idb.keys('clips')) clips.set(k, URL.createObjectURL(await idb.get('clips', k))); } catch { /* записей нет — говорит синтезатор */ }
}
export async function saveClip(key, blob) { await idb.put('clips', key, blob); clips.set(key, URL.createObjectURL(blob)); }
export async function deleteClip(key) { await idb.del('clips', key); clips.delete(key); }
export function playClip(key, done) {
  player = new Audio(clips.get(key));
  player.onended = player.onerror = done || null;
  player.play().catch(() => done?.());
}

const TOKEN = /\{([^|{}]+)\|([^{}]*)\}/g;
const hasWords = s => /[\p{L}\d]/u.test(s);
// Текст без пометок — как его прочитает синтезатор (нужно для проверок).
export const plainText = text => String(text).replace(TOKEN, '$2');

function speak(text, done) {
  const s = synth();
  if (!s) return done();
  const u = new SpeechSynthesisUtterance(text);
  const vs = russianVoices();
  u.voice = vs.find(v => v.voiceURI === cfg.voice) || vs[0] || null;
  u.lang = 'ru-RU';
  u.rate = cfg.rate || 0.9;
  let fired = false;
  const end = () => { if (!fired) { fired = true; done(); } };
  u.onend = u.onerror = end;
  setTimeout(end, 2500 + text.length * 140); // на случай, если устройство не сообщило о конце фразы
  s.speak(u);
}

// Сказать текст вслух. Новая фраза перебивает старую.
export function say(text) {
  if (silent || !text) return;
  hush();
  const my = ++turn, parts = [];
  let buf = '', last = 0;
  String(text).replace(TOKEN, (m, key, fallback, at) => {
    buf += text.slice(last, at);
    if (clips.has(key)) { if (hasWords(buf)) parts.push({ text: buf }); parts.push({ clip: key }); buf = ''; } else buf += fallback;
    last = at + m.length;
  });
  buf += String(text).slice(last);
  if (hasWords(buf)) parts.push({ text: buf });
  const next = i => {
    if (my !== turn || i >= parts.length) return;
    const p = parts[i], go = () => next(i + 1);
    if (p.clip) playClip(p.clip, go); else speak(p.text, go);
  };
  next(0);
}
export function hush() {
  turn++;
  synth()?.cancel();
  if (player) { player.onended = player.onerror = null; player.pause(); player = null; }
}

// --- короткие звуки ---
let ac = null;
function tone(freq, t0, dur, type = 'sine', vol = 0.15) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ac.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t0 + dur);
  o.connect(g).connect(ac.destination);
  o.start(ac.currentTime + t0);
  o.stop(ac.currentTime + t0 + dur);
}
const SOUNDS = {
  tap: () => tone(520, 0, 0.06, 'triangle', 0.08),
  pop: () => { tone(700, 0, 0.07); tone(1000, 0.05, 0.08); },
  ok: () => { tone(660, 0, 0.12); tone(880, 0.1, 0.12); tone(1320, 0.2, 0.2); },
  miss: () => { tone(300, 0, 0.18, 'triangle'); tone(250, 0.12, 0.2, 'triangle'); },
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.25)),
};
export function sfx(name) {
  if (silent) return;
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    SOUNDS[name]?.();
  } catch { /* звук не обязателен */ }
}
