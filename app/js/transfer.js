import { idb } from './db.js';

const FORMAT = 'shkola-kamilya-profile', LINK = /^[a-f0-9]{32}$/;
export const MAX_TRANSFER = 128 * 1024 * 1024;

export function transferLink(address, id) {
  const url = new URL(address);
  url.search = '';
  url.hash = 'profile=' + id;
  return url.href;
}

export function readProfileLink(hash) {
  const id = new URLSearchParams(hash.slice(1)).get('profile');
  return LINK.test(id || '') ? id : null;
}

function mediaFor(profile) {
  const photos = new Set(), reads = new Set(), clips = new Set(['и:' + profile.name.toLowerCase()]);
  for (const { id } of profile.colorings || []) for (const suffix of ['', '-p', '-t', '-o']) photos.add(id + suffix);
  for (const { id } of profile.album || []) photos.add(id);
  for (const { photo } of Object.values(profile.pen || {})) if (photo) photos.add(photo);
  for (const { picture } of Object.values(profile.assemblies || {})) if (picture) photos.add(picture);
  for (const { id } of profile.reads || []) reads.add(id);
  for (const word of profile.family || []) clips.add('ш:' + word.toLowerCase());
  return { photos, reads, clips };
}

function toBase64(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 0x6000) parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 0x6000))));
  return parts.join('');
}

export async function exportProfileFile(store, db = idb) {
  store.ensureProfileLink();
  const profile = JSON.parse(JSON.stringify(store.profile)), media = [];
  for (const [bucket, keys] of Object.entries(mediaFor(profile))) {
    for (const key of keys) {
      const blob = await db.get(bucket, key);
      if (blob) media.push([bucket, key, blob.type, toBase64(new Uint8Array(await blob.arrayBuffer()))]);
    }
  }
  return JSON.stringify({ format: FORMAT, version: 1, profile, media });
}

export function readProfileFile(text) {
  if (text.length > MAX_TRANSFER) throw new Error('Файл переноса слишком большой.');
  const data = JSON.parse(text), p = data?.profile;
  if (data?.format !== FORMAT || data.version !== 1 || !p || !LINK.test(p.linkId || '') ||
    typeof p.name !== 'string' || !p.levels || !p.days || !p.overrides || !p.hero ||
    !Array.isArray(p.weak) || !Array.isArray(p.gallery) || !Array.isArray(data.media)) {
    throw new Error('Это не файл профиля «Школы Камиля».');
  }
  return data;
}

export async function restoreProfileFile(store, data, expectedLink, db = idb) {
  if (expectedLink && data.profile.linkId !== expectedLink) throw new Error('Этот файл принадлежит другому профилю.');
  const previous = store.state.profiles[store.profileForLink(data.profile.linkId)];
  const profile = JSON.parse(JSON.stringify(data.profile));
  const allowed = mediaFor(profile), used = new Set();
  // Новый префикс защищает записи других детей и старую копию профиля при ошибке импорта.
  const prefix = 'copy:' + profile.linkId + ':' + globalThis.crypto.randomUUID().slice(0, 12) + ':';
  const copy = key => {
    if (!key) return key;
    const raw = key.replace(/^(?:copy:[a-f0-9]{32}:[a-f0-9-]{12}:)+/, '');
    return prefix + raw;
  };
  const records = data.media.map(row => {
    if (!Array.isArray(row) || row.length !== 4) throw new Error('Файл переноса повреждён.');
    const [bucket, key, type, base64] = row;
    if (!Object.hasOwn(allowed, bucket) || !allowed[bucket].has(key) || used.has(bucket + ':' + key) ||
      typeof type !== 'string' || typeof base64 !== 'string' || !/^(?:(?:image|audio|video)\/[a-z0-9.+-]+(?:;[a-z0-9=._+ -]+)?)?$/i.test(type)) {
      throw new Error('Файл переноса повреждён.');
    }
    used.add(bucket + ':' + key);
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    return { store: bucket, key: bucket === 'clips' ? key : copy(key), blob: new Blob([bytes], { type }) };
  });
  for (const item of profile.colorings || []) {
    item.paintSeed ??= Number(item.id.replace(/\D/g, '').slice(-8));
    item.id = copy(item.id);
  }
  for (const [island, id] of Object.entries(profile.rewardPaintings || {})) profile.rewardPaintings[island] = copy(id);
  for (const item of profile.album || []) item.id = copy(item.id);
  for (const item of Object.values(profile.pen || {})) if (item.photo) item.photo = copy(item.photo);
  for (const item of Object.values(profile.assemblies || {})) if (item.picture) item.picture = copy(item.picture);
  for (const item of profile.reads || []) item.id = copy(item.id);
  const writes = [];
  // На новом планшете уже могут быть свои записи имени. Их оставляем.
  for (const r of records) if (r.store !== 'clips' || !(await db.get(r.store, r.key))) writes.push(r);
  await db.putBatch(writes);
  try { store.restoreProfile(profile); }
  catch (error) { for (const { store: bucket, key } of writes) await db.del(bucket, key).catch(() => {}); throw error; }
  if (previous) {
    const old = mediaFor(previous);
    for (const [bucket, keys] of Object.entries(old)) for (const key of keys) {
      if (typeof key === 'string' && key.startsWith('copy:' + profile.linkId + ':')) void db.del(bucket, key).catch(() => {});
    }
  }
}
