// СБОР ВСЕХ ФРАЗ ПРИЛОЖЕНИЯ для озвучки: объяснения уровней, задания (много случайных вариантов),
// буквы, слоги, слова, числа, задания «Пишу ручкой». Возвращает кусочки по островам.
import { ISLANDS } from '../../app/js/curriculum.js';
import { makeTask, syllables } from '../../app/js/tasks.js';
import { pieces } from '../../app/js/speech.js';
import { makeRng } from '../../app/js/util.js';
import { ORDER, WORDS } from '../../app/js/data.js';
import { PEN_TASKS } from '../../app/js/cursive.js';

export function collect(seeds = 400) {
  const packs = new Map(); // остров → (отпечаток → кусочек)
  const add = (pack, text) => { if (!packs.has(pack)) packs.set(pack, new Map()); for (const p of pieces(text)) packs.get(pack).set(p.id, p); };
  // Общее: числа, буквы, слоги, слова — нужны на всех островах.
  for (let n = 0; n <= 100; n++) add('common', String(n));
  for (const f of ['одна звезда', 'одну ягодку', 'одно яблоко', 'две тарелки']) add('common', '1 ' + f.split(' ')[1]), add('common', '2 ' + f.split(' ')[1]);
  for (const L of ORDER) add('common', `{б:${L}|${L}}`);
  for (const s of syllables(33)) add('common', `{с:${s}|${s.toLowerCase()}}`);
  for (const w of WORDS) add('common', `{ш:${w.w}|${w.w}}`);
  for (const t of PEN_TASKS) add('pen', t.say);
  for (const isl of ISLANDS) for (const L of isl.levels) {
    add(isl.id, L.intro);
    for (const [, w] of L.show?.pics || []) add('common', `{ш:${w}|${w}}`);
    for (let seed = 1; seed <= seeds; seed++) {
      const r = makeRng(seed * 7919 + L.k * 31 + isl.n);
      for (const src of L.tasks) {
        const t = makeTask(src, r);
        for (const text of [t.say, t.ask, t.text && t.m === 'problem' ? t.text : null]) if (text) add(isl.id, text);
        if (typeof t.q === "function") for (let n = 1; n <= (t.max || 1); n++) add(isl.id, t.q(n));
        if (typeof t.done === "function") for (let n = 1; n <= t.max; n++) add(isl.id, t.done(n));
        for (const pair of t.pairs || []) for (const side of pair) if (side?.say) add(isl.id, side.say);
        if (t.m === 'story') for (const s of t.text) add(isl.id, s);
        if (t.canHear) add(isl.id, t.text);
      }
    }
  }
  // То, что уже есть в общем наборе, из островных убираем; повторы между островами оставляем в первом по порядку.
  const seen = new Set(packs.get('common').keys());
  for (const [name, m] of packs) { if (name === 'common') continue; for (const id of [...m.keys()]) { if (seen.has(id)) m.delete(id); else seen.add(id); } }
  return packs;
}

// Запуск напрямую: показать, сколько чего получилось.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('collect.mjs')) {
  const packs = collect(+process.argv[2] || 400);
  let total = 0, chars = 0, long = 0;
  for (const [name, m] of packs) { total += m.size; for (const p of m.values()) { chars += p.text.length; if (p.text.length > 250) long++; } }
  console.log([...packs].map(([n, m]) => `${n}:${m.size}`).join(' '));
  console.log(`всего кусочков: ${total}, символов: ${chars}, длиннее 250 символов: ${long}`);
  const big = [...packs].flatMap(([n, m]) => [...m.values()].map(p => [n, p.text])).sort((a, b) => b[1].length - a[1].length).slice(0, 3);
  console.log('самые длинные:', big.map(b => b[1].length + ' ' + b[0]).join(', '));
  const m3 = packs.get('m3'); console.log('пример m3:', [...m3.values()].slice(0, 25).map(p => p.text).join(' | '));
}
