// ОПИСЬ ВСЕХ ПАР «СЛОВО — КАРТИНКА». Запуск: npm run pairs
// Каждую пару человек должен один раз увидеть глазами. Опись хранится в tests/pairs.json:
// если пара появилась или изменилась, проверка «npm test» не пройдёт, пока опись не обновят этой командой.
import { writeFileSync } from 'node:fs';
import { WORDS, SENTS, OBJECTS } from '../app/js/data.js';
import { HOME_ITEMS } from '../app/js/stories.js';

export function allPairs() {
  const out = {};
  for (const w of WORDS) if (w.e) out['слово: ' + w.w] = w.e;
  for (const s of SENTS) if (s.e) out['предложение: ' + s.t] = s.e;
  for (const o of Object.values(OBJECTS)) out['предмет в задачах: ' + o[0]] = o[3];
  for (const [e, name] of HOME_ITEMS) out['вещь в домике: ' + name] = e;
  return out;
}
if (process.argv[1]?.endsWith('pairs.mjs')) {
  const p = allPairs();
  writeFileSync(new URL('../tests/pairs.json', import.meta.url), JSON.stringify(p, null, 1));
  console.log(`Опись обновлена: пар — ${Object.keys(p).length}. Просмотрите их глазами:\n` + Object.entries(p).map(([k, v]) => `${v}  ${k}`).join('\n'));
}
