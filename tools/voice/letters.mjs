// ПОДБОР ЗВУКОВ БУКВ. Запуск: node tools/voice/letters.mjs
// Для каждой буквы озвучиваем несколько вариантов записи и даём распознаванию речи их послушать.
// Берём вариант, в котором слышен именно этот звук и который не длится слишком долго. Итог пишется в letters.json.
import { writeFileSync } from 'node:fs';
import { readKey } from './yandex.mjs';
import { VOICE } from './config.mjs';

const key = readKey();
async function tts(text) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis', { method: 'POST', headers: { Authorization: `Api-Key ${key.apiKey}`, 'x-folder-id': key.folderId, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(VOICE.model ? { model: VOICE.model } : {}), text, hints: [{ voice: VOICE.voice }], outputAudioSpec: { rawAudio: { audioEncoding: 'LINEAR16_PCM', sampleRateHertz: '16000' } } }) });
    const raw = await res.text(), right = /service account folder ID '([a-z0-9]+)'/.exec(raw);
    if (right && key.folderId !== right[1]) { key.folderId = right[1]; continue; }
    if (!res.ok) { await new Promise(f => setTimeout(f, 1500)); continue; }
    return Buffer.concat(raw.split('\n').filter(Boolean).map(l => { const o = JSON.parse(l); return Buffer.from((o.result ?? o).audioChunk?.data || '', 'base64'); }));
  }
  return null;
}
async function hear(pcm) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&format=lpcm&sampleRateHertz=16000&folderId=${key.folderId}`, { method: 'POST', headers: { Authorization: `Api-Key ${key.apiKey}` }, body: pcm });
    if (res.ok) return (await res.json()).result || '';
    await new Promise(f => setTimeout(f, 1500));
  }
  return '?';
}
const VOWELS = 'АОУЫИЭЕЁЮЯ', LONG = 'МНЛРСЗШЖВФХЩ';
const out = {};
for (const L of 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЭЮЯ') {
  const l = L.toLowerCase();
  const cands = VOWELS.includes(L) ? [l, l + l + l] : L === 'Й' ? ['й', 'ий', 'йй'] : LONG.includes(L) ? [l + l + l, l + l, l, l + 'э'] : [l, l + 'э', l + 'ъ', l + l];
  const rows = [];
  for (const c of cands) {
    const pcm = await tts(c);
    if (!pcm) continue;
    const heard = (await hear(pcm)).toLowerCase().replace(/[^а-яё]/g, ''), sec = pcm.length / 32000;
    const same = heard.length > 0 && [...heard].every(ch => ch === l);          // слышен только этот звук
    rows.push({ c, heard, sec: +sec.toFixed(2), score: (same ? 10 : heard.startsWith(l) ? 3 : 0) - (sec > 1.6 ? 5 : 0) - (heard.length > 4 ? 2 : 0) });
  }
  rows.sort((a, b) => b.score - a.score);
  out[L] = rows;
  console.log(`${L}: ` + rows.map(r => `«${r.c}»→«${r.heard}» ${r.sec}с [${r.score}]`).join('  '));
}
writeFileSync(new URL('./letters.json', import.meta.url), JSON.stringify(out, null, 1));
