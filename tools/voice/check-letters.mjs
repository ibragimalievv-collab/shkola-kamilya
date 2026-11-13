// ПЕРЕПРОВЕРКА БУКВ: берём записи букв прямо из готового набора приложения и даём распознаванию речи послушать каждую дважды.
// Запуск: node tools/voice/check-letters.mjs
import { readFileSync } from 'node:fs';
import { readKey } from './yandex.mjs';
import { LETTER_ALSO } from './config.mjs';
import { yShare, SOUND_RANGE, CUT, soundCheck, glue } from './acoustic.mjs';
import { hash } from '../../app/js/speech.js';
import { ORDER } from '../../app/js/data.js';

const key = readKey(), AUDIO = new URL('../../app/audio/', import.meta.url);
const m = JSON.parse(readFileSync(new URL('manifest.json', AUDIO), 'utf8')), pack = m.packs.common, bin = readFileSync(new URL(pack.file, AUDIO));
async function hear(pcm) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&format=lpcm&sampleRateHertz=16000${key.folderId.startsWith('b1') ? '&folderId=' + key.folderId : ''}`, { method: 'POST', headers: { Authorization: `Api-Key ${key.apiKey}` }, body: pcm });
    const j = await res.json().catch(() => ({}));
    if (res.ok) return (j.result || '').toLowerCase().replace(/[^а-яё]/g, '');
    const right = /folder ID '([a-z0-9]+)'/.exec(JSON.stringify(j)); if (right) key.folderId = right[1];
    await new Promise(f => setTimeout(f, 1200));
  }
  return '?';
}
let good = 0;
const bad = [];
for (const L of 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ') {
  const item = pack.items.find(x => x[0] === 't-' + hash('б:' + L));
  if (!item) { bad.push(L + ': нет записи'); continue; }
  const clip = bin.subarray(item[1], item[1] + item[2]), wav = clip.subarray(0, 4).toString() === 'RIFF';
  if (!wav) { bad.push(L + ': запись старого вида, не проверялась'); continue; }
  const pcm = clip.subarray(44), sec = pcm.length / 32000, l = L.toLowerCase(), want = [l, ...(LETTER_ALSO[L] || [])];
  if (L === 'Ы') { // распознавание «ы» от «и» не отличает — проверяем измерением резонансов
    const sh = yShare(pcm), fine = sh >= SOUND_RANGE.Ы[0];
    console.log(`Ы  ${sec.toFixed(2)} с  по измерению звука похожа на «ы» на ${Math.round(sh * 100)}%  ${fine ? '✓ звук (вырезан из слова «сыр»)' : '✗ НЕ ТА БУКВА'}`);
    fine ? good++ : bad.push('Ы: по измерению не «ы»'); continue;
  }
  if (CUT[L]) { // звук вырезан из слова: проверяем измерением и тем, что с приставленным гласным слышен нужный слог
    const [v, ...syl] = CUT[L], [fine, why] = soundCheck(L, pcm), vi = v && pack.items.find(x => x[0] === 't-' + hash('б:' + v.toUpperCase()));
    const test = v ? glue(pcm, bin.subarray(vi[1] + 44, vi[1] + vi[2])) : Buffer.concat([Buffer.alloc(6400), pcm, Buffer.alloc(9600)]);
    const hd = [await hear(test), await hear(test)], good2 = fine && hd.every(x => syl.includes(x));
    console.log(`${L}  ${sec.toFixed(2)} с  ${why}; ${v ? `с гласным «${v}»` : 'отдельно'} слышно: «${hd[0]}», «${hd[1]}»  ${good2 ? '✓ звук (вырезан из слова)' : '✗ ТРЕБУЕТ ВНИМАНИЯ'}`);
    good2 ? good++ : bad.push(`${L}: ${why}; слышно «${hd.join('», «')}»`); continue;
  }
  const heard = [await hear(pcm), await hear(pcm)];
  const ok = heard.every(hd => hd && (want.includes(hd) || [...hd].every(ch => ch === l))) && (L !== 'И' || yShare(pcm) <= SOUND_RANGE.И[1]);
  const kind = heard[0] === l || [...heard[0]].every(ch => ch === l) || L === 'Н' ? 'звук' : 'название или звук с призвуком';
  console.log(`${L}  ${sec.toFixed(2)} с  слышно: «${heard[0]}», «${heard[1]}»  ${ok ? '✓ ' + kind : '✗ НЕ ТА БУКВА'}`);
  ok ? good++ : bad.push(`${L}: слышно «${heard.join('», «')}»`);
}
console.log(`\nПодтверждено букв: ${good} из 33.` + (bad.length ? ' Требуют внимания: ' + bad.join('; ') : ''));
