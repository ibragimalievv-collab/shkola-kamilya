// ПРОБА ГОЛОСА: одна короткая сценка шестью вариантами голоса и страница, где их можно послушать.
// Запуск: npm run voice:sample   Результат: папка «проба-голоса», файл index.html.

import { mkdirSync, writeFileSync } from 'node:fs';
import { synth, readKey } from './yandex.mjs';
import { synthOpenAI, hasOpenAIKey } from './openai.mjs';

const ROUND = +process.argv[2] || 1; // номер пробы: npm run voice:sample -- 3
const OUT = new URL(ROUND > 1 ? `../../проба-голоса-${ROUND}/` : '../../проба-голоса/', import.meta.url);

// Знак + стоит перед ударной гласной: так сервис ставит ударение точно.
const SCENE = [
  ['Приветствие', 'Привет, Кам+иль! Я Л+умик, твой друг. Поплыли к новым островам?'],
  ['Задание', 'Смотри, сколько рыбок! Поймай всех, на которых написано число пять.'],
  ['Похвала', 'Ура! У тебя получилось! Ты настоящий капитан!'],
  ['Подсказка', 'Ой, чуть-чуть не так. Ничего страшного, попробуй ещё разок!'],
];
// Готового детского голоса у сервиса нет: берём самые молодые голоса и поднимаем высоту и темп.
const VARIANTS = [
  ['А', 'Маша, радостная', { voice: 'masha', role: 'good', pitch: 200, speed: 1.1 }],
  ['Б', 'Маша, совсем мультяшная', { voice: 'masha', role: 'friendly', pitch: 400, speed: 1.15 }],
  ['В', 'Даша, радостная', { voice: 'dasha', role: 'good', pitch: 250, speed: 1.1 }],
  ['Г', 'Лера, дружелюбная', { voice: 'lera', role: 'friendly', pitch: 250, speed: 1.1 }],
  ['Д', 'Джейн, радостная', { voice: 'jane', role: 'good', pitch: 300, speed: 1.1 }],
  ['Е', 'Марина, дружелюбная', { voice: 'marina', role: 'friendly', pitch: 300, speed: 1.1 }],
];
// Вторая проба: мальчишеские голоса (мужские, поднятые вверх) и совсем высокие женские.
if (ROUND === 2) VARIANTS.splice(0, VARIANTS.length,
  ['Ж', 'Антон, как мальчик', { voice: 'anton', role: 'good', pitch: 500, speed: 1.05 }],
  ['З', 'Александр, как мальчик', { voice: 'alexander', role: 'good', pitch: 450, speed: 1.05 }],
  ['И', 'Кирилл, как мальчик', { voice: 'kirill', role: 'good', pitch: 500, speed: 1.05 }],
  ['К', 'Захар, как мальчик', { voice: 'zahar', role: 'good', pitch: 450, speed: 1.05 }],
  ['Л', 'Ермил, как мальчик', { voice: 'ermil', role: 'good', pitch: 500, speed: 1.05 }],
  ['М', 'Филипп, как мальчик', { voice: 'filipp', pitch: 500, speed: 1.05 }],
  ['Н', 'Маша, очень высокая', { voice: 'masha', role: 'good', pitch: 700, speed: 1.0 }],
  ['О', 'Даша, очень высокая', { voice: 'dasha', role: 'friendly', pitch: 650, speed: 1.0 }]);

// Для сравнения — три варианта второго сервиса (если есть его ключ). Манера речи задаётся словами.
const STYLE = 'Говори по-русски без акцента, как весёлый шестилетний ребёнок, герой мультфильма: звонко, радостно, с эмоциями, чётко и не слишком быстро.';
if (hasOpenAIKey()) VARIANTS.push(
  ['Ж', 'OpenAI, голос coral', { openai: true, voice: 'coral', style: STYLE }],
  ['З', 'OpenAI, голос nova', { openai: true, voice: 'nova', style: STYLE }],
  ['И', 'OpenAI, голос shimmer', { openai: true, voice: 'shimmer', style: STYLE }]);
const speak = (text, voice, key) => (voice.openai ? synthOpenAI(text, voice) : synth(text, voice, key));

// Как лучше произнести звук буквы — пробуем несколько записей одного и того же.
let SOUNDS = [
  ['Звук М: «ммм»', 'ммм'], ['Звук М: по фонеме', '[[m]]'], ['Звук М: «мэ»', 'мэ'],
  ['Звук С: «ссс»', 'ссс'], ['Звук С: по фонеме', '[[s]]'],
  ['Звук К: «к»', 'к'], ['Звук К: по фонеме', '[[k]]'],
  ['Слог', 'ма'], ['Слово', 'м+ама'], ['Число', 'семнадцать'],
];

// Третья проба: голоса как есть, без изменения высоты, и «живая» модель с разговорной интонацией.
if (ROUND === 3) VARIANTS.splice(0, VARIANTS.length,
  ['П', 'Маша, радостная, без изменений', { voice: 'masha', role: 'good' }],
  ['Р', 'Даша, дружелюбная, без изменений', { voice: 'dasha', role: 'friendly' }],
  ['С', 'Лера, дружелюбная, без изменений', { voice: 'lera', role: 'friendly' }],
  ['Т', 'Марина, дружелюбная, без изменений', { voice: 'marina', role: 'friendly' }],
  ['У', 'Джейн, радостная, без изменений', { voice: 'jane', role: 'good' }],
  ['Ф', 'Софья, живая модель', { voice: 'sofia', model: 'livetts' }],
  ['Х', 'Вера, живая модель', { voice: 'vera', model: 'livetts' }],
  ['Ц', 'Ирина, живая модель', { voice: 'irina', model: 'livetts' }],
  ['Ч', 'Денис, живая модель', { voice: 'denis', model: 'livetts' }]);
if (ROUND > 1) SOUNDS.length = 0;
let key = null;
try { key = readKey(); } catch (e) { if (!hasOpenAIKey()) { console.error(e.message); process.exit(1); } console.log('Ключа Yandex нет — делаю пробу только вторым сервисом.'); }
if (!key) VARIANTS.splice(0, 6);
mkdirSync(OUT, { recursive: true });
let n = 0, html = '';
for (const [id, name, voice] of VARIANTS) {
  html += `<section><h2>Вариант ${id} <small>${name}</small></h2><button onclick="scene('${id}')">▶ Вся сценка</button>`;
  for (let i = 0; i < SCENE.length; i++) {
    const file = `${id}-${i + 1}.mp3`;
    try { writeFileSync(new URL(file, OUT), await speak(SCENE[i][1], voice, key)); n++; }
    catch (e) { console.error(`Вариант ${id}, «${SCENE[i][0]}»: ${e.message}`); continue; }
    html += `<p><b>${SCENE[i][0]}</b><audio id="${id}${i}" controls preload="auto" src="${file}"></audio></p>`;
  }
  html += '</section>';
  console.log(`Вариант ${id} готов.`);
}
html += '<section><h2>Звуки букв <small>голосом варианта А — какой способ звучит правильнее?</small></h2>';
for (let i = 0; i < SOUNDS.length; i++) {
  const file = `zvuk-${i + 1}.mp3`;
  try { writeFileSync(new URL(file, OUT), await synth(SOUNDS[i][1], VARIANTS[0][2], key)); n++; html += `<p><b>${SOUNDS[i][0]}</b><audio controls preload="auto" src="${file}"></audio></p>`; }
  catch (e) { html += `<p><b>${SOUNDS[i][0]}</b> — сервис так не умеет.</p>`; }
}
html += '</section>';

writeFileSync(new URL('index.html', OUT), `<!DOCTYPE html><html lang="ru"><meta charset="utf-8"><title>Проба голоса — Школа Камиля</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:18px system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px;background:#fffdf5;color:#2b2d42}
section{background:#fff;border-radius:16px;padding:12px 16px;margin:14px 0;box-shadow:0 1px 4px #0002}
h2{margin:4px 0 10px}small{font-weight:400;color:#6c757d;font-size:.7em}
button{font:inherit;padding:12px 20px;border:0;border-radius:12px;background:#38b000;color:#fff;margin-bottom:8px}
p{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:6px 0}audio{flex:1;min-width:220px}</style>
<h1>Проба голоса</h1><p>Послушайте вместе с Камилем и выберите вариант по букве. Внизу — отдельная проба, как звучат звуки букв.</p>
${html}
<script>function scene(id){let i=0;const next=()=>{const a=document.getElementById(id+i);if(!a)return;a.currentTime=0;a.onended=()=>{i++;next()};a.play()};next()}</script></html>`);
console.log(`Готово: озвучено фраз — ${n}, это примерно ${(n * 0.1626).toFixed(2)} ₽. Откройте файл «${decodeURIComponent(OUT.pathname.split('/').slice(-2, -1)[0])}/index.html».`);
