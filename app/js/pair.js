import { exportProfileFile, readProfileFile, restoreProfileFile, MAX_TRANSFER } from './transfer.js';

const TOKEN = /^[a-f0-9]{32}$/;
const LINK_LIFETIME = 10 * 60 * 1000;
const CHUNK = 16 * 1024;
const LABEL = 'shkola-profile-v1';
const NOT_CONNECTED = 'Не удалось соединить устройства. Подключите их к одной сети Wi-Fi и повторите.';
const token = () => globalThis.crypto.randomUUID().replaceAll('-', '');
const wire = value => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

function unwire(code) {
  if (typeof code !== 'string' || code.length > 40000 || !/^[\w-]+$/.test(code)) throw new Error('Неверный код переноса.');
  return JSON.parse(atob(code.replaceAll('-', '+').replaceAll('_', '/')));
}

function signaling(value, kind) {
  if (value?.v !== 1 || value.type !== kind || !TOKEN.test(value.session || '') ||
    !TOKEN.test(value.profile || '') || typeof value.sdp !== 'string' || !value.sdp.startsWith('v=0') ||
    value.sdp.length > 27000 || !Number.isSafeInteger(value.expires)) throw new Error('Неверная ссылка или код переноса.');
  if (Date.now() >= value.expires) throw new Error('Ссылка для переноса истекла. Создайте новую.');
  return value;
}

export function readInvitation(hash) {
  const code = new URLSearchParams(hash.slice(1)).get('move');
  return code ? signaling(unwire(code), 'offer') : null;
}

function shareAddress(address, data) {
  const url = new URL(address);
  url.search = '';
  url.hash = 'move=' + wire(data);
  return url.href;
}

function waitFor(target, event, condition, timeout, stopOn = ['close', 'error']) {
  if (condition()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer;
    function stop(error) {
      clearTimeout(timer);
      target.removeEventListener(event, check);
      for (const name of stopOn) target.removeEventListener(name, fail);
      if (error) reject(error); else resolve();
    }
    function check() { if (condition()) stop(); }
    function fail() { stop(new Error(NOT_CONNECTED)); }
    target.addEventListener(event, check);
    for (const name of stopOn) target.addEventListener(name, fail);
    timer = setTimeout(fail, timeout);
    check();
  });
}

function connection() {
  if (!globalThis.RTCPeerConnection) throw new Error('Этот браузер не поддерживает прямой перенос.');
  // Только локальные кандидаты: без стороннего сервера, ретранслятора и облачного хранения.
  return new RTCPeerConnection({ iceServers: [] });
}

async function localDescription(peer, answer = false) {
  await peer.setLocalDescription(await (answer ? peer.createAnswer() : peer.createOffer()));
  await waitFor(peer, 'icegatheringstatechange', () => peer.iceGatheringState === 'complete', 12000, []);
  return peer.localDescription.sdp;
}

async function sendSnapshot(channel, snap, progress) {
  const bytes = new TextEncoder().encode(snap);
  if (bytes.byteLength > MAX_TRANSFER) throw new Error('Профиль слишком большой для прямого переноса.');
  await waitFor(channel, 'open', () => channel.readyState === 'open', 35000);
  channel.bufferedAmountLowThreshold = 256 * 1024;
  let accepted = false, failure = '';
  const onReply = e => {
    try {
      if (typeof e.data !== 'string' || e.data.length > 512) return;
      const m = JSON.parse(e.data);
      if (m.type === 'saved') accepted = true;
      if (m.type === 'failed') failure = 'Новое устройство не смогло сохранить профиль.';
    } catch { /* не служебный ответ */ }
  };
  channel.addEventListener('message', onReply);
  try {
    channel.send(JSON.stringify({ type: 'size', bytes: bytes.byteLength }));
    for (let offset = 0; offset < bytes.byteLength; offset += CHUNK) {
      if (channel.bufferedAmount > 1024 * 1024) {
        await waitFor(channel, 'bufferedamountlow', () => channel.bufferedAmount <= channel.bufferedAmountLowThreshold, 35000);
      }
      if (failure || channel.readyState !== 'open') throw new Error(failure || NOT_CONNECTED);
      channel.send(bytes.subarray(offset, offset + CHUNK));
      if (offset % (CHUNK * 24) === 0) progress?.(Math.min(99, Math.floor(100 * offset / bytes.byteLength)));
    }
    channel.send(JSON.stringify({ type: 'finish' }));
    await waitFor(channel, 'message', () => accepted || Boolean(failure), 180000);
    if (failure) throw new Error(failure);
    progress?.(100);
  } finally { channel.removeEventListener('message', onReply); }
}

export async function offerProfile(store, address) {
  const profile = store.ensureProfileLink();
  const snapshot = await exportProfileFile(store);
  const peer = connection(), channel = peer.createDataChannel(LABEL);
  const ticket = { v: 1, session: token(), profile, expires: Date.now() + LINK_LIFETIME, type: 'offer' };
  let used = false;
  try { ticket.sdp = await localDescription(peer); }
  catch (error) { peer.close(); throw error; }
  return {
    link: shareAddress(address, ticket),
    cancel() { peer.close(); },
    async send(answer, progress) {
      if (used) throw new Error('Этот перенос уже запущен.');
      const reply = signaling(unwire(answer.trim()), 'answer');
      if (reply.session !== ticket.session || reply.profile !== profile || reply.expires !== ticket.expires) {
        throw new Error('Этот ответ относится к другому переносу.');
      }
      used = true;
      try {
        await peer.setRemoteDescription({ type: 'answer', sdp: reply.sdp });
        await sendSnapshot(channel, snapshot, progress);
      } finally { peer.close(); }
    },
  };
}

export async function acceptProfile(store, ticket, { progress, approve, success, fail } = {}) {
  signaling(ticket, 'offer');
  const peer = connection();
  let stopped = false, completed = false, receiving = false;
  const finish = () => { stopped = true; peer.close(); };
  peer.addEventListener('connectionstatechange', () => {
    if (!stopped && !completed && peer.connectionState === 'failed') { fail?.(new Error(NOT_CONNECTED)); finish(); }
  });
  peer.addEventListener('datachannel', e => {
    const channel = e.channel;
    if (receiving || channel.label !== LABEL) { channel.close(); return; }
    receiving = true;
    channel.binaryType = 'arraybuffer';
    let buffer = null, offset = 0, finishing = false, lastPercent = -1;
    channel.addEventListener('close', () => {
      if (!stopped && !completed && !finishing) fail?.(new Error(NOT_CONNECTED));
      finish();
    });
    channel.addEventListener('message', async event => {
      if (stopped || finishing) return;
      try {
        if (typeof event.data !== 'string') {
          const chunk = new Uint8Array(event.data);
          if (!buffer || !chunk.length || chunk.length > CHUNK || offset + chunk.length > buffer.length) throw new Error('Неполные данные профиля.');
          buffer.set(chunk, offset); offset += chunk.length;
          const percent = Math.min(99, Math.floor(offset * 100 / buffer.length));
          if (percent !== lastPercent) { lastPercent = percent; progress?.(percent); }
          return;
        }
        if (event.data.length > 512) throw new Error('Неверные данные переноса.');
        const message = JSON.parse(event.data);
        if (!buffer && message.type === 'size' && Number.isSafeInteger(message.bytes) && message.bytes > 0 && message.bytes <= MAX_TRANSFER) {
          buffer = new Uint8Array(message.bytes);
          return;
        }
        if (message.type !== 'finish' || !buffer || buffer.length !== offset) throw new Error('Неполные данные профиля.');
        finishing = true;
        const data = readProfileFile(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
        buffer = null;
        if (data.profile.linkId !== ticket.profile) throw new Error('Получен другой профиль.');
        if (approve && !approve(data.profile)) throw new Error('Перенос отменён на новом устройстве.');
        await restoreProfileFile(store, data, ticket.profile);
        completed = true;
        if (channel.readyState === 'open') channel.send(JSON.stringify({ type: 'saved' }));
        progress?.(100); success?.();
      } catch (error) {
        finishing = true;
        if (channel.readyState === 'open') channel.send(JSON.stringify({ type: 'failed' }));
        fail?.(error);
      }
    });
  });
  try {
    await peer.setRemoteDescription({ type: 'offer', sdp: ticket.sdp });
    const sdp = await localDescription(peer, true);
    return { answer: wire({ ...ticket, type: 'answer', sdp }), cancel: finish };
  } catch (error) { finish(); throw error; }
}
