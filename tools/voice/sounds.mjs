// ПРОБА ЗВУКОВ БУКВ выбранным голосом: как лучше записать «м», «с», «к», чтобы звучал звук, а не название буквы.
// Запуск: npm run voice:sounds   Результат: папка «проба-звуков».
import { mkdirSync, writeFileSync } from 'node:fs';
import { synth, readKey } from './yandex.mjs';
import { VOICE } from './config.mjs';

const OUT = new URL('../../проба-звуков/', import.meta.url);
const TESTS = [
  ['Звук М', [['1', 'ммм'], ['2', '[[m]]'], ['3', 'мэ'], ['4', 'м']]],
  ['Звук С', [['1', 'ссс'], ['2', '[[s]]'], ['3', 'сэ'], ['4', 'с']]],
  ['Звук К', [['1', 'к'], ['2', '[[k]]'], ['3', 'кэ'], ['4', 'кы']]],
  ['Звук Р', [['1', 'ррр'], ['2', '[[r]]'], ['3', 'рэ']]],
  ['Звук Ш', [['1', 'шшш'], ['2', '[[sh]]'], ['3', 'шэ']]],
  ['Гласные', [['А', 'а'], ['О', 'о'], ['Ы', 'ы'], ['Ё', 'ё']]],
  ['В задании', [['звук отдельно', 'Найди букву. sil<[300]> ммм'], ['с названием', 'Найди букву эм.'], ['слог', 'Собери слог ма.'], ['слово', 'Собери слово: м+ама.']]],
];
const key = readKey();
mkdirSync(OUT, { recursive: true });
let html = '', n = 0;
for (const [title, items] of TESTS) {
  html += `<section><h2>${title}</h2>`;
  for (const [label, text] of items) {
    const file = `z${++n}.mp3`;
    try { writeFileSync(new URL(file, OUT), await synth(text, VOICE, key)); html += `<p><b>Способ ${label}</b> <code>${text.replace(/</g, '&lt;')}</code><audio controls preload="auto" src="${file}"></audio></p>`; }
    catch (e) { html += `<p><b>Способ ${label}</b> <code>${text.replace(/</g, '&lt;')}</code> — сервис так не умеет.</p>`; }
  }
  html += '</section>';
}
writeFileSync(new URL('index.html', OUT), `<!DOCTYPE html><html lang="ru"><meta charset="utf-8"><title>Проба звуков — Школа Камиля</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:18px system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px;background:#fffdf5;color:#2b2d42}
section{background:#fff;border-radius:16px;padding:12px 16px;margin:14px 0;box-shadow:0 1px 4px #0002}h2{margin:4px 0 10px}code{color:#6c757d}
p{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:6px 0}audio{flex:1;min-width:220px}</style>
<h1>Как произносить звуки букв</h1><p>Для каждого звука послушайте способы и скажите номер, который звучит правильно — как звук, а не как название буквы.</p>${html}</html>`);
console.log(`Готово: записей — ${n}. Откройте файл «проба-звуков/index.html».`);
