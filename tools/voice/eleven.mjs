// ТРЕТЬЯ ПРОБА: свой, придуманный с нуля мультяшный детский голос (сервис ElevenLabs, «дизайн голоса»).
// Голос не копируется ни с какого мультфильма и ни с какого человека: он создаётся по описанию словами.
// Ключ: файл «ключ-elevenlabs.txt» в папке проекта, одна строка. Запуск: npm run voice:design

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const KEY_FILE = new URL('../../ключ-elevenlabs.txt', import.meta.url);
const OUT = new URL('../../проба-голоса-3/', import.meta.url);
if (!existsSync(KEY_FILE)) { console.error('Нет файла «ключ-elevenlabs.txt». Создайте его в папке проекта и вставьте в него ключ одной строкой.'); process.exit(1); }
const apiKey = readFileSync(KEY_FILE, 'utf8').split(/\r?\n/).map(s => s.trim()).find(s => s && !s.startsWith('#'));
if (!apiKey) { console.error('Файл «ключ-elevenlabs.txt» пустой: вставьте в него ключ.'); process.exit(1); }

// Сценка: приветствие, задание, похвала, подсказка.
const TEXT = 'Привет, Камиль! Я Лумик, твой друг. Поплыли к новым островам? Смотри, сколько рыбок! Поймай всех, на которых написано число пять. Ура! У тебя получилось! Ты настоящий капитан! Ой, чуть-чуть не так. Ничего страшного, попробуй ещё разок!';
// Три описания характера — сервис на каждое придумает несколько голосов.
const DESIGNS = [
  ['Весёлый мальчик', 'A cheerful six-year-old boy, hero of an animated cartoon. Bright, high, ringing child voice, playful and warm, very expressive and friendly, clear articulation, native Russian speaker with perfect Russian pronunciation, studio quality.'],
  ['Озорной малыш-зверёк', 'A cute small cartoon creature sidekick with a high, squeaky-soft childlike voice. Curious, giggly, energetic and kind, like a best friend of a little kid. Native Russian speaker, clear and natural Russian pronunciation, studio quality.'],
  ['Добрая девочка', 'A kind seven-year-old girl from a children\'s animated series. Sweet, light, sunny child voice, encouraging and gentle, lively emotions, clear articulation. Native Russian speaker with perfect Russian pronunciation, studio quality.'],
];

mkdirSync(OUT, { recursive: true });
let html = '', n = 0;
const ids = {};
for (const [name, description] of DESIGNS) {
  const res = await fetch('https://api.elevenlabs.io/v1/text-to-voice/create-previews', {
    method: 'POST', headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice_description: description, text: TEXT }),
  });
  if (!res.ok) { console.error(`«${name}»: сервис ответил ошибкой ${res.status}: ${(await res.text()).slice(0, 300)}`); continue; }
  const previews = (await res.json()).previews || [];
  html += `<section><h2>${name}</h2>`;
  previews.forEach((p, i) => {
    const label = `${n + 1}`, file = `golos-${label}.mp3`;
    writeFileSync(new URL(file, OUT), Buffer.from(p.audio_base_64, 'base64'));
    ids[label] = { id: p.generated_voice_id, name, description };
    html += `<p><b>Голос ${label}</b><audio controls preload="auto" src="${file}"></audio></p>`;
    n++;
  });
  html += '</section>';
  console.log(`«${name}»: голосов — ${previews.length}.`);
}
// Запоминаем номера голосов, чтобы выбранный можно было сохранить и озвучить им всё приложение.
writeFileSync(new URL('голоса.json', OUT), JSON.stringify(ids, null, 2));
writeFileSync(new URL('index.html', OUT), `<!DOCTYPE html><html lang="ru"><meta charset="utf-8"><title>Проба голоса 3 — Школа Камиля</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:18px system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px;background:#fffdf5;color:#2b2d42}
section{background:#fff;border-radius:16px;padding:12px 16px;margin:14px 0;box-shadow:0 1px 4px #0002}h2{margin:4px 0 10px}
p{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:6px 0}audio{flex:1;min-width:220px}</style>
<h1>Проба голоса: придуманные мультяшные голоса</h1><p>Каждый голос создан с нуля по описанию. Выберите номер голоса, который понравился.</p>${html}</html>`);
console.log(n ? `Готово: голосов для прослушивания — ${n}. Откройте файл «проба-голоса-3/index.html».` : 'Не получилось создать ни одного голоса — см. ошибки выше.');
