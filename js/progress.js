// Компактный снимок уровней в QR. Фрагмент ссылки не передаётся серверу сайта.
import { LEVELS } from './curriculum.js';
import { createStore, HERO_DEFAULT } from './store.js';

const IDS = LEVELS.map(level => level.id);
const PARTS = Object.keys(HERO_DEFAULT);
const SIZE = Math.ceil(IDS.length / 4);
const error = () => new Error('QR-код прогресса повреждён или относится к другой версии игры. Создайте новый код на старом устройстве.');
const hash = text => {
  let n = 2166136261;
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619);
  return (n >>> 0).toString(36);
};
const CURRICULUM = hash(IDS.join(','));
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function decode(text) {
  if (typeof text !== 'string' || !/^[\w-]+$/.test(text)) throw error();
  const bytes = Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  if (encode(bytes) !== text) throw error();
  return bytes;
}

export function progressLink(address, store) {
  const p = store.profile;
  const bits = new Uint8Array(SIZE);
  for (const id of Object.keys(p.levels)) if (!IDS.includes(id)) throw error();
  IDS.forEach((id, i) => {
    const stars = p.levels[id] || 0;
    if (!Number.isInteger(stars) || stars < 0 || stars > 3) throw error();
    bits[i >> 2] |= stars << ((i % 4) * 2);
  });
  const id = store.ensureProfileLink();
  if (!/^[a-f0-9]{32}$/.test(id)) throw error();
  const name = (p.name || 'Ребёнок').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20) || 'Ребёнок';
  const nameBytes = new TextEncoder().encode(name);
  // 4 байта программы, 16 — идентификатор, 1 — длина имени, 15 — цвета, затем звёзды.
  const data = new Uint8Array(36 + nameBytes.length + SIZE);
  new DataView(data.buffer).setUint32(0, parseInt(CURRICULUM, 36));
  for (let i = 0; i < 16; i++) data[4 + i] = parseInt(id.slice(i * 2, i * 2 + 2), 16);
  data[20] = nameBytes.length; data.set(nameBytes, 21);
  PARTS.forEach((key, i) => {
    const color = /^#[a-f0-9]{6}$/i.test(p.hero[key]) ? p.hero[key] : HERO_DEFAULT[key];
    for (let c = 0; c < 3; c++) data[21 + nameBytes.length + i * 3 + c] = parseInt(color.slice(1 + c * 2, 3 + c * 2), 16);
  });
  data.set(bits, 36 + nameBytes.length);
  const text = encode(data);
  const url = new URL('qr.html', address);
  url.search = '';
  url.hash = 'progress=1.' + text + '.' + hash(text);
  return url.href;
}

export function readProgressLink(fragment) {
  const text = new URLSearchParams(fragment.slice(1)).get('progress');
  if (text === null) return null;
  try {
    if (text.length > 1600) throw error();
    const match = /^1\.([\w-]+)\.([a-z0-9]+)$/.exec(text);
    if (!match || hash(match[1]) !== match[2]) throw error();
    const data = decode(match[1]);
    if (data.length < 36 + SIZE || new DataView(data.buffer).getUint32(0) !== parseInt(CURRICULUM, 36)) throw error();
    const count = data[20];
    if (!count || count > 60 || data.length !== 36 + count + SIZE) throw error();
    const name = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(21, 21 + count));
    if (!name.trim() || name.length > 20 || /[\u0000-\u001f\u007f]/.test(name)) throw error();
    const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const linkId = hex(data.subarray(4, 20));
    const hero = Object.fromEntries(PARTS.map((key, i) => [key, '#' + hex(data.subarray(21 + count + i * 3, 24 + count + i * 3))]));
    const bits = data.subarray(36 + count);
    if (bits.length !== SIZE || (IDS.length % 4 && bits[SIZE - 1] >> ((IDS.length % 4) * 2))) throw error();
    const levels = {};
    IDS.forEach((id, i) => { const stars = (bits[i >> 2] >> ((i % 4) * 2)) & 3; if (stars) levels[id] = stars; });
    return { linkId, name: name.trim(), levels, hero };
  } catch { throw error(); }
}

export function restoreProgress(store, snapshot) {
  const match = store.profileForLink(snapshot.linkId);
  const previous = match && store.state.profiles[match];
  const base = previous || createStore({ getItem: () => null, setItem() {} }).profile;
  // У существующего ребёнка оставляем имя, рисунки, записи и настройки островов.
  // restoreProfile объединяет результаты, выбирая лучшие звёзды на каждом уровне.
  store.restoreProfile({
    ...base, linkId: snapshot.linkId, name: previous?.name || snapshot.name,
    hero: previous?.hero || snapshot.hero, levels: snapshot.levels,
    heroDone: true, petSkipped: true, placed: true,
  });
  return store.profile;
}
