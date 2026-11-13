// ОЗВУЧКА ФРАЗ ЗАРАНЕЕ (не входит в приложение, запускается только на компьютере родителя).
// Обращается к сервису синтеза речи Yandex SpeechKit и получает готовый звуковой файл.
// Ключ доступа лежит в файле «ключ-озвучки.txt» в папке проекта и в интернет-репозиторий не попадает.

import { readFileSync, existsSync } from 'node:fs';

const KEY_FILE = new URL('../../ключ-озвучки.txt', import.meta.url);
const ENDPOINT = 'https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis';

// Прочитать ключ: первая строка — API-ключ, вторая — идентификатор каталога.
export function readKey() {
  if (!existsSync(KEY_FILE)) throw new Error('Нет файла «ключ-озвучки.txt». Создайте его в папке проекта: в первой строке — API-ключ, во второй — идентификатор каталога.');
  const lines = readFileSync(KEY_FILE, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  if (lines.length < 2) throw new Error('В файле «ключ-озвучки.txt» должно быть две строки: API-ключ и идентификатор каталога.');
  return { apiKey: lines[0], folderId: lines[1] };
}

// Озвучить одну фразу. voice — { voice, role, speed, pitch }. Возвращает звук в формате MP3.
export async function synth(text, voice, key = readKey()) {
  const hints = [{ voice: voice.voice }];
  if (voice.role) hints.push({ role: voice.role });
  if (voice.speed) hints.push({ speed: String(voice.speed) });
  if (voice.pitch) hints.push({ pitchShift: String(voice.pitch) });
  // model: 'livetts' — «живая» модель с разговорной интонацией (высоту и темп она не меняет)
  const body = { ...(voice.model ? { model: voice.model } : {}), text, hints, outputAudioSpec: { containerAudio: { containerAudioType: 'MP3' } }, loudnessNormalizationType: 'LUFS' };
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { Authorization: `Api-Key ${key.apiKey}`, 'x-folder-id': key.folderId, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const raw = await res.text();
    if (res.ok) {
      // Ответ приходит кусочками: по одному объекту на строку, звук внутри закодирован в base64.
      const chunks = [];
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        const obj = JSON.parse(line), data = (obj.result ?? obj).audioChunk?.data;
        if (data) chunks.push(Buffer.from(data, 'base64'));
      }
      if (!chunks.length) throw new Error(`Сервис не вернул звук для фразы: ${text}`);
      return Buffer.concat(chunks);
    }
    // Если во второй строке файла указан не тот каталог, сервис сам называет верный — берём его и повторяем.
    const right = /service account folder ID '([a-z0-9]+)'/.exec(raw);
    if (res.status === 400 && right && key.folderId !== right[1]) { key.folderId = right[1]; continue; }
    if ((res.status === 429 || res.status >= 500) && attempt < 5) { await new Promise(f => setTimeout(f, 1500 * attempt)); continue; }
    const why = res.status === 401 ? 'Ключ не принят: проверьте первую строку файла «ключ-озвучки.txt».'
      : res.status === 403 ? 'Нет доступа: проверьте идентификатор каталога (вторая строка) и что к аккаунту привязан способ оплаты.'
      : `Ошибка сервиса ${res.status}.`;
    throw new Error(`${why}\nОтвет сервиса: ${raw.slice(0, 300)}`);
  }
}
