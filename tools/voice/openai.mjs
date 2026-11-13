// Второй сервис озвучки для сравнения на пробе: OpenAI. Нужен отдельный ключ разработчика
// (это не подписка на чат): файл «ключ-openai.txt» в папке проекта, одна строка с ключом.

import { readFileSync, existsSync } from 'node:fs';

const KEY_FILE = new URL('../../ключ-openai.txt', import.meta.url);
export const hasOpenAIKey = () => existsSync(KEY_FILE) && readFileSync(KEY_FILE, 'utf8').split(/\r?\n/).some(s => s.trim() && !s.trim().startsWith('#'));

// Озвучить фразу. voice — { voice, style }: style — описание манеры речи словами.
export async function synthOpenAI(text, voice) {
  const apiKey = readFileSync(KEY_FILE, 'utf8').split(/\r?\n/).map(s => s.trim()).find(s => s && !s.startsWith('#'));
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: voice.voice, input: text.replace(/\+/g, ''), instructions: voice.style, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error(`OpenAI ответил ошибкой ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}
