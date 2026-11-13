// Собирает файл «ПРОГРАММА.md» из программы обучения (app/js/curriculum.js).
import { writeFileSync } from 'node:fs';
import { ISLANDS, LEVELS } from '../app/js/curriculum.js';
import { LINES, MECHANICS } from '../app/js/tasks.js';
import { ORDER } from '../app/js/data.js';
import { pl } from '../app/js/util.js';
const lvls = n => `${n} ${pl(n, ['уровень', 'уровня', 'уровней'])}`;

const count = l => ISLANDS.filter(i => i.line === l).reduce((s, i) => s + i.levels.length, 0);
let md = `# Школа Камиля — программа обучения

Всего **${ISLANDS.length} островов** и **${lvls(LEVELS.length)}** по пяти линиям:
${Object.entries(LINES).map(([k, v]) => `- **${v}** — ${ISLANDS.filter(i => i.line === k).length} островов, ${lvls(count(k))}`).join('\n')}

Острова идут в том порядке, в каком открываются на карте: линии чередуются.
Один уровень — 5–8 минут: объяснение голосом, 6–10 заданий-игр, награда.
Пятый и последний уровень каждого острова — повторение; за последний ребёнок получает наклейку-зверя.
Игровых механик: ${MECHANICS.length}.

Порядок букв: ${ORDER.split('').join(' ')}.

## Что ребёнок умеет в конце
1. Знает все буквы, читает слоги, слова, предложения и тексты из 5–8 предложений с пониманием.
2. Пишет печатными буквами слова и короткие предложения.
3. Знает числа до 100, уверенно считает в пределах 20, в пределах 100 — десятками и без перехода через десяток.
4. Понимает умножение как сложение одинаковых групп, знает таблицу на 2, 3, 4 и 5.
5. Решает задачи в одно действие, сравнивает числа, знает состав числа.

`;
let n = 0;
for (const isl of ISLANDS) {
  md += `## ${isl.n + 1}. ${isl.title} · ${LINES[isl.line]}\n\n`;
  md += `Тема: ${isl.topic}. После острова ребёнок ${isl.can}. Наклейка: ${isl.sticker}.\n\n`;
  md += '| № | Уровень | Цель |\n|---|---|---|\n';
  for (const L of isl.levels) md += `| ${++n} | ${L.title} | ${L.goal} |\n`;
  md += '\n';
}
const { PEN_TASKS } = await import('../app/js/cursive.js');
const KINDS = { element: 'Элементы букв', letter: 'Буквы (строчная и заглавная)', join: 'Соединения букв', word: 'Слова', sent: 'Предложения' };
md += `## Пятая линия: «Пишу ручкой» — ${PEN_TASKS.length} заданий\n\n`;
md += 'Письменные буквы в косой линейке. Идёт параллельно линии «Письмо»: буква открывается, когда пройден уровень с такой же печатной буквой; элементы — после первого уровня острова Весёлых Дорожек.\n';
md += 'Каждое задание: показ написания по шагам → обводка пальцем → строчка в тетради → фото в «Тетрадь» → оценка родителя (1–3 звезды). Меньше трёх звёзд — буква возвращается на следующий день.\n\n';
for (const [k, name] of Object.entries(KINDS)) md += `- **${name}:** ${PEN_TASKS.filter(t => t.kind === k).map(t => (k === 'letter' ? t.title.replace('Буква ', '') : k === 'element' ? t.title.toLowerCase() : t.text)).join(k === 'element' || k === 'sent' ? '; ' : ', ')}\n`;
writeFileSync(new URL('../ПРОГРАММА.md', import.meta.url), md);
console.log(`Готово: ${ISLANDS.length} островов, ${n} уровней.`);
