// ПОЛНАЯ ОЗВУЧКА ПРИЛОЖЕНИЯ. Запуск: npm run voice
// 1) собирает все фразы приложения; 2) озвучивает только новые и изменённые (готовое лежит в папке «озвучка-кэш»);
// 3) складывает записи в наборы по островам в app/audio и пишет список наборов.
// Чтобы только посчитать, сколько будет стоить, без озвучки: npm run voice -- --dry

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { collect } from './collect.mjs';
import { synth, readKey } from './yandex.mjs';
import { VOICE, NAMES, STRESS, LETTER_TRIES, LETTER_ALSO, PRICE_PER_REQUEST } from './config.mjs';
import { pieces, hash } from '../../app/js/speech.js';
import { yShare, longY, SOUND_RANGE, CUT, cutSound, soundCheck, glue, trimSilence } from './acoustic.mjs';
import { allPhrases } from '../../app/js/phrases.js';
import { ISLANDS } from '../../app/js/curriculum.js';

const DRY = process.argv.includes('--dry');
const WORDS_0_20 = 'ноль один два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать четырнадцать пятнадцать шестнадцать семнадцать восемнадцать девятнадцать двадцать'.split(' ');
const CACHE = new URL('../../озвучка-кэш/', import.meta.url), OUT = new URL('../../app/audio/', import.meta.url);
const voiceTag = hash(JSON.stringify(VOICE));

// Текст, который уйдёт в сервис: звук буквы, слово с ударением и так далее.
function spoken(p) {
  if (p.key?.startsWith('б:')) return 'звук буквы, проверенный на слух машиной: ' + p.key.slice(2) + ' ' + LETTER_TRIES[p.key.slice(2)].join('|') + (SOUND_RANGE[p.key.slice(2)] ? ' +резонансы, ровная громкость, 2' : '') + (CUT[p.key.slice(2)] ? ' вырезан из слова, продлён' + (p.key.slice(2) === 'К' ? ', с коротким призвуком' : '') : '') + (p.key.slice(2) === 'Н' ? ' без тишины' : '');
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

// Запись без сжатия (PCM 16 кГц) и распознавание — для букв.
async function rawSpeech(text, key) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis', { method: 'POST', headers: { Authorization: `Api-Key ${key.apiKey}`, 'x-folder-id': key.folderId, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(VOICE.model ? { model: VOICE.model } : {}), text, hints: [{ voice: VOICE.voice }], outputAudioSpec: { rawAudio: { audioEncoding: 'LINEAR16_PCM', sampleRateHertz: '16000' } } }) });
    const raw = await res.text(), right = /service account folder ID '([a-z0-9]+)'/.exec(raw);
    if (right && key.folderId !== right[1]) { key.folderId = right[1]; i--; continue; }
    if (!res.ok) { await new Promise(f => setTimeout(f, 1500)); continue; }
    return Buffer.concat(raw.split('\n').filter(Boolean).map(l => { const o = JSON.parse(l); return Buffer.from((o.result ?? o).audioChunk?.data || '', 'base64'); }));
  }
  return null;
}
async function hearRaw(pcm, key) {
  for (let i = 0; i < 4; i++) {
    const st = await fetch(`https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&format=lpcm&sampleRateHertz=16000&folderId=${key.folderId}`, { method: 'POST', headers: { Authorization: `Api-Key ${key.apiKey}` }, body: pcm });
    if (st.ok) return ((await st.json()).result || '').toLowerCase().replace(/[^а-яё]/g, '');
    await new Promise(f => setTimeout(f, 1200));
  }
  return '';
}
// Запись без сжатия заворачиваем в обычный звуковой файл (WAV).
function toWav(pcm) {
  const head = Buffer.alloc(44); head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(16000, 24); head.writeUInt32LE(32000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}
const vowelFor = {}; // гласные для проверки вырезанных согласных
// Звук буквы: берём запись, только если проверка подтвердила, что слышна именно эта буква.
async function letterClip(L, key) {
  const want = [L.toLowerCase(), ...(LETTER_ALSO[L] || [])];
  let spare = null;
  for (const text of LETTER_TRIES[L]) for (let take = 0; take < 6; take++) {
    let pcm = await rawSpeech(text, key);
    if (!pcm) continue;
    if (L === 'Н') pcm = trimSilence(pcm);
    if (CUT[L]) { // согласный вырезаем из слова; проверяем измерением и тем, что с приставленным гласным слышен нужный слог
      const [v, ...syl] = CUT[L], word = await hearRaw(pcm, key), c = word === text ? cutSound(L, pcm) : null;
      if (!c) { console.log(`  буква ${L}: слово «${text}» услышано как «${word}» — ${word === text ? 'вырезать не получилось' : 'не подходит'}`); continue; }
      const [fine, why] = soundCheck(L, c.pcm), withV = await hearRaw(v ? glue(c.pcm, vowelFor[v] ||= await rawSpeech(v, key)) : Buffer.concat([Buffer.alloc(6400), c.pcm, Buffer.alloc(9600)]), key);
      console.log(`  буква ${L} из слова «${text}»: ${c.note}; ${why}; ${v ? `с гласным «${v}»` : 'отдельно'} слышно «${withV}»`);
      if (fine && syl.includes(withV)) { console.log(`  буква ${L}: берём`); return toWav(c.pcm); }
      continue;
    }
    if (L === 'Ы') { // «ы» вырезаем из слова и растягиваем; распознавание её не различает, решает измерение
      const y = longY(pcm), share = y ? yShare(y) : 0;
      console.log(`  буква Ы из слова «${text}»: ${y ? 'похожа на «ы» на ' + Math.round(share * 100) + '%' : '«ы» в слове слишком короткая'}`);
      if (!y || share < SOUND_RANGE.Ы[0]) continue;
      pcm = y;
    }
    const heard = await hearRaw(pcm, key);
    const sec = pcm.length / 32000, range = SOUND_RANGE[L], share = range ? yShare(pcm) : null;
    const soundOk = (!range || (share >= range[0] && share <= range[1])) && soundCheck(L, pcm)[0];
    const ok = sec <= 1.7 && soundOk && (L === 'Ы' || (heard && (want.includes(heard) || [...heard].every(ch => ch === want[0]))));
    if (L === 'И') console.log(`  буква И: похожа на «ы» на ${Math.round(share * 100)}% (должно быть не больше 15%)`);
    if (L === 'Н') console.log(`  буква Н: ${soundCheck(L, pcm)[1]}`);
    const wav = toWav(pcm);
    if (ok) { console.log(`  буква ${L}: «${text}» — распознавание услышало «${heard}», ${sec.toFixed(2)} с — берём`); return wav; }
    console.log(`  буква ${L}: «${text}» — услышано «${heard}», ${sec.toFixed(2)} с — не подходит`);
    if (sec <= 1.7 && soundOk && !spare) spare = wav;
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
