// ПРОВЕРКА НА СЛУХ МАШИНОЙ: озвучиваем букву разными способами и просим распознавание речи записать, что оно услышало.
// Запуск: node tools/voice/hear.mjs
import { readKey } from './yandex.mjs';
import { VOICE } from './config.mjs';

const key = readKey();
const headers = () => ({ Authorization: `Api-Key ${key.apiKey}`, 'x-folder-id': key.folderId, 'Content-Type': 'application/json' });
// Озвучить в формате без сжатия (его понимает распознавание).
async function tts(text) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis', { method: 'POST', headers: headers(), body: JSON.stringify({ ...(VOICE.model ? { model: VOICE.model } : {}), text, hints: [{ voice: VOICE.voice }], outputAudioSpec: { rawAudio: { audioEncoding: 'LINEAR16_PCM', sampleRateHertz: '16000' } } }) });
    const raw = await res.text();
    const right = /service account folder ID '([a-z0-9]+)'/.exec(raw);
    if (right && key.folderId !== right[1]) { key.folderId = right[1]; continue; }
    if (!res.ok) { if (i === 3) console.error("  сервис:", res.status, raw.slice(0, 200)); await new Promise(f => setTimeout(f, 1200)); continue; }
    return Buffer.concat(raw.split('\n').filter(Boolean).map(l => { const o = JSON.parse(l); return Buffer.from((o.result ?? o).audioChunk?.data || '', 'base64'); }));
  }
  return null;
}
export async function hear(pcm) {
  const res = await fetch(`https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&format=lpcm&sampleRateHertz=16000&folderId=${key.folderId}`, { method: 'POST', headers: { Authorization: `Api-Key ${key.apiKey}` }, body: pcm });
  const j = await res.json().catch(() => ({}));
  return res.ok ? j.result : `ошибка ${res.status}: ${JSON.stringify(j).slice(0, 120)}`;
}
const tests = process.argv.slice(2).length ? process.argv.slice(2) : ['ммм', '[[m]]', 'мэ', 'м', 'эм', 'ссс', '[[s]]', 'с', 'к', '[[k]]', 'кэ', 'а', 'ррр', 'шшш', 'б', '[[b]]', 'ма', 'мама'];
for (const t of tests) {
  const pcm = await tts(t);
  console.log(`${t.padEnd(8)} → длительность ${(pcm ? pcm.length / 32000 : 0).toFixed(2)} с, слышно: «${pcm ? await hear(pcm) : 'нет звука'}»`);
}
