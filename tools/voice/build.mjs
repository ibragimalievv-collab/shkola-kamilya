// ПОЛНАЯ ОЗВУЧКА ПРИЛОЖЕНИЯ. Запуск: npm run voice
// 1) собирает все фразы приложения; 2) озвучивает только новые и изменённые (готовое лежит в папке «озвучка-кэш»);
// 3) складывает записи в наборы по островам в app/audio и пишет список наборов.
// Чтобы только посчитать, сколько будет стоить, без озвучки: npm run voice -- --dry

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { collect } from './collect.mjs';
import { synth, readKey } from './yandex.mjs';
import { VOICE, NAMES, STRESS, LETTER_TRIES, LETTER_ALSO, PRICE_PER_REQUEST } from './config.mjs';
import { pieces, hash } from '../../app/js/speech.js';
import { allPhrases } from '../../app/js/phrases.js';
import { ISLANDS } from '../../app/js/curriculum.js';

const DRY = process.argv.includes('--dry');
const WORDS_0_20 = 'ноль один два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать четырнадцать пятнадцать шестнадцать семнадцать восемнадцать девятнадцать двадцать'.split(' ');
const CACHE = new URL('../../озвучка-кэш/', import.meta.url), OUT = new URL('../../app/audio/', import.meta.url);
const voiceTag = hash(JSON.stringify(VOICE));

// Текст, который уйдёт в сервис: звук буквы, слово с ударением и так далее.
function spoken(p) {
  if (p.key?.startsWith('б:')) return 'звук буквы, проверенный на слух машиной: ' + p.key.slice(2) + ' ' + LETTER_TRIES[p.key.slice(2)].join('|');
  let t = p.text;
  for (const [word, marked] of Object.entries(STRESS)) t = t.replace(new RegExp(`(?<![а-яёА-ЯЁ+])${word}(?![а-яёА-ЯЁ])`, 'g'), marked);
  return t;
}

const packs = collect(400);
for (const text of allPhrases(NAMES, ISLANDS.map(i => i.sticker), ISLANDS.map(i => i.title))) for (const p of pieces(text)) if (![...packs.values()].some(m => m.has(p.id))) packs.get('common').set(p.id, p);

const all = [...packs].flatMap(([pack, m]) => [...m.values()].map(p => ({ pack, p, text: spoken(p) })));
for (const it of all) it.file = new URL(`${voiceTag}-${hash(it.text)}.mp3`, CACHE);
const todo = all.filter(it => !existsSync(it.file));
console.log(`Всего кусочков речи: ${all.length}. Уже озвучено: ${all.length - todo.length}. Осталось озвучить: ${todo.length} — это примерно ${(todo.length * PRICE_PER_REQUEST).toFixed(0)} ₽.`);
if (DRY) process.exit(0);

// Звук буквы: озвучиваем без сжатия, даём распознаванию послушать и берём запись, только если слышна эта буква.
async function letterClip(L, key) {
  const want = [L.toLowerCase(), ...(LETTER_ALSO[L] || [])];
  let spare = null;
  for (const text of LETTER_TRIES[L]) for (let take = 0; take < 3; take++) {
    const res = await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis', { method: 'POST', headers: { Authorization: `Api-Key ${key.apiKey}`, 'x-folder-id': key.folderId, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(VOICE.model ? { model: VOICE.model } : {}), text, hints: [{ voice: VOICE.voice }], outputAudioSpec: { rawAudio: { audioEncoding: 'LINEAR16_PCM', sampleRateHertz: '16000' } } }) });
    const raw = await res.text(), right = /service account folder ID '([a-z0-9]+)'/.exec(raw);
    if (right && key.folderId !== right[1]) { key.folderId = right[1]; take--; continue; }
    if (!res.ok) { await new Promise(f => setTimeout(f, 1500)); continue; }
    const pcm = Buffer.concat(raw.split('\n').filter(Boolean).map(l => { const o = JSON.parse(l); return Buffer.from((o.result ?? o).audioChunk?.data || '', 'base64'); }));
    const st = await fetch(`https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&format=lpcm&sampleRateHertz=16000&folderId=${key.folderId}`, { method: 'POST', headers: { Authorization: `Api-Key ${key.apiKey}` }, body: pcm });
    const heard = st.ok ? ((await st.json()).result || '').toLowerCase().replace(/[^а-яё]/g, '') : '';
    const sec = pcm.length / 32000, ok = sec <= 1.7 && heard && (want.includes(heard) || [...heard].every(ch => ch === want[0]));
    // Запись без сжатия заворачиваем в обычный звуковой файл (WAV).
    const head = Buffer.alloc(44); head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(16000, 24); head.writeUInt32LE(32000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
    const wav = Buffer.concat([head, pcm]);
    if (ok) { console.log(`  буква ${L}: «${text}» — распознавание услышало «${heard}», ${sec.toFixed(2)} с — берём`); return wav; }
    console.log(`  буква ${L}: «${text}» — услышано «${heard}», ${sec.toFixed(2)} с — не подходит`);
    if (sec <= 1.7 && !spare) spare = wav;
  }
  if (spare) { console.log(`  буква ${L}: НЕТ ПРОВЕРЕННОЙ ЗАПИСИ — взята непроверенная, послушайте её сами`); return spare; }
  throw new Error('не удалось озвучить букву ' + L);
}

mkdirSync(CACHE, { recursive: true });
if (todo.length) {
  const key = readKey();
  let done = 0, failed = 0, i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const it = todo[i++];
      try {
        let audio;
        if (it.p.key?.startsWith('б:')) audio = await letterClip(it.p.key.slice(2), key);
        else try { audio = await synth(it.text, VOICE, key); }
        catch (e) {
          // Запасной вариант: число пишем словом.
          if (/^\d+$/.test(it.text) && WORDS_0_20[+it.text]) audio = await synth(WORDS_0_20[+it.text], VOICE, key);
          else throw e;
        }
        writeFileSync(it.file, audio);
        if (++done % 100 === 0) console.log(`  озвучено ${done} из ${todo.length}`);
      } catch (e) { failed++; if (failed <= 5) console.error(`  не получилось: «${it.text}» — ${e.message.split('\n')[0]}`); }
    }
  };
  await Promise.all(Array.from({ length: todo.length < 30 ? 1 : 4 }, worker)); // остатки озвучиваем по одной: сервис иногда отказывает при нескольких запросах сразу
  console.log(`Озвучено сейчас: ${done} (примерно ${(done * PRICE_PER_REQUEST).toFixed(0)} ₽). Не получилось: ${failed}.`);
}

// Складываем записи в наборы: один файл на остров + общий список.
mkdirSync(OUT, { recursive: true });
const manifest = { voice: voiceTag, names: NAMES, packs: {} };
let bytes = 0, missing = 0;
for (const [name, m] of packs) {
  const items = [], parts = [];
  let off = 0;
  for (const p of m.values()) {
    const file = new URL(`${voiceTag}-${hash(spoken(p))}.mp3`, CACHE);
    if (!existsSync(file)) { missing++; continue; }
    const buf = readFileSync(file);
    items.push([p.id, off, buf.length]); parts.push(buf); off += buf.length;
  }
  if (!items.length) continue;
  const bin = Buffer.concat(parts), file = `${name}.${hash(bin.toString('latin1').slice(0, 20000) + bin.length)}.bin`;
  writeFileSync(new URL(file, OUT), bin);
  manifest.packs[name] = { file, items };
  bytes += bin.length;
}
writeFileSync(new URL('manifest.json', OUT), JSON.stringify(manifest));
for (const f of readdirSync(OUT)) if (f.endsWith('.bin') && !Object.values(manifest.packs).some(p => p.file === f)) unlinkSync(new URL(f, OUT)); // старые наборы убираем
console.log(`Готово: наборов — ${Object.keys(manifest.packs).length}, общий размер — ${(bytes / 1048576).toFixed(1)} МБ, общий набор — ${(readFileSync(new URL(manifest.packs.common.file, OUT)).length / 1048576).toFixed(1)} МБ. Без записи осталось кусочков: ${missing}.`);
