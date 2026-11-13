// СТРАНИЦА ПРОВЕРКИ ДЛЯ РОДИТЕЛЯ: всё, что ребёнок видит и слышит, подряд — картинка, название, кнопка «послушать».
// Родитель отмечает то, что ему не нравится; отметки сохраняются на устройстве и выгружаются списком.

import { h, today } from './util.js';
import { THINGS } from './things.js';
import { STICKERS } from './data.js';
import { HOME_ITEMS, STORIES } from './stories.js';
import { BOOKS } from './books.js';
import { ISLANDS } from './curriculum.js';
import { tokW } from './tasks.js';
import { say, hush, loadPack } from './audio.js';
import { animalSVG } from './art.js';

const KEY = 'shkola-kamilya-review';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

export function reviewScreen({ app, back }) {
  const marks = load();
  const save = () => { localStorage.setItem(KEY, JSON.stringify(marks)); count(); };
  const total = h('b', {}, '');
  const count = () => { total.textContent = `Отмечено: ${Object.keys(marks).length}`; };
  // Одна строка: картинка, подпись, «послушать», отметка и заметка.
  const row = (id, pic, label, speak) => {
    const note = h('input', { type: 'text', placeholder: 'что не так (необязательно)', value: marks[id]?.note || '', maxlength: 100, hidden: !marks[id], oninput: e => { if (marks[id]) { marks[id].note = e.target.value; save(); } } });
    const box = h('input', { type: 'checkbox', checked: !!marks[id], onchange: e => { if (e.target.checked) marks[id] = { label, note: '' }; else delete marks[id]; note.hidden = !e.target.checked; save(); } });
    return h('div', { class: 'rv-row' + (marks[id] ? ' bad' : '') }, typeof pic === 'string' ? h('span', { class: 'rv-pic' }, pic) : pic, h('span', { class: 'rv-name' }, label),
      h('button', { class: 'pbtn mini', 'aria-label': 'послушать', onclick: () => say(speak) }, '🔊'), h('label', { class: 'rv-mark' }, box, ' не нравится'), note);
  };
  const section = (title, hint, rows, open) => h('details', { open, class: 'pbox' }, h('summary', {}, `${title} (${rows.length})`), h('p', { class: 'hint' }, hint), ...rows);
  const text = () => `Школа Камиля — замечания от ${today().split('-').reverse().join('.')}\n\n` + (Object.values(marks).map((m, i) => `${i + 1}. ${m.label}${m.note ? ' — ' + m.note : ''}`).join('\n') || 'Замечаний нет.');
  const file = () => { const a = h('a', { href: URL.createObjectURL(new Blob([text()], { type: 'text/plain' })), download: `shkola-kamilya-zamechaniya-${today()}.txt` }); document.body.append(a); a.click(); a.remove(); };
  const share = async () => { try { if (navigator.share) return await navigator.share({ title: 'Школа Камиля — замечания', text: text() }); await navigator.clipboard.writeText(text()); alert('Список скопирован — вставьте его в сообщение.'); } catch (e) { if (e.name !== 'AbortError') file(); } };

  for (const id of ['books', ...ISLANDS.map(i => i.id)]) loadPack(id); // чтобы всё можно было послушать
  hush();
  app.className = 'screen parent';
  app.replaceChildren(h('div', { class: 'bar' }, h('button', { class: 'ibtn', 'aria-label': 'назад', onclick: back }, '↩️'), h('h1', {}, 'Проверка картинок и слов')),
    h('section', { class: 'pbox' }, h('p', {}, 'Здесь всё, что ребёнок видит и слышит. Пролистайте, послушайте и отметьте галочкой то, что вам не нравится: картинка не похожа, слово не то, голос сказал неправильно. Отметки сохраняются сами.'),
      h('div', { class: 'prow' }, total, h('button', { class: 'pbtn on', onclick: share }, 'Переслать список'), h('button', { class: 'pbtn', onclick: file }, 'Сохранить в файл'),
        h('button', { class: 'pbtn warn', onclick: () => { if (confirm('Снять все отметки?')) { for (const k of Object.keys(marks)) delete marks[k]; save(); reviewScreen({ app, back }); } } }, 'Снять все отметки'))),
    section('Предметы: картинка и слово', 'Каждая картинка должна сразу узнаваться, а слово — быть привычным для ребёнка. В скобках — как предмет называется в задачах.',
      THINGS.map(t => row('предмет:' + t.name, t.pic, t.name + (t.forms && t.forms[0] !== t.name ? ` (в задачах: ${t.forms[0]})` : ''), tokW(t.name))), true),
    section('Наклейки-звери', 'Рисунок должен быть похож на того, кем он назван.', STICKERS.map((n, i) => row('наклейка:' + n, h('span', { class: 'rv-pic svg', html: animalSVG(i) }), n, n))),
    section('Вещи для домика', 'Название звучит, когда ребёнок нажимает на вещь.', HOME_ITEMS.map(([e, n]) => row('домик:' + n, e, n, THINGS.some(t => t.name === n) ? tokW(n) : n))),
    section('Книжки: страницы', 'Картинка — это иллюстрация к странице: она должна подходить к тексту.', BOOKS.flatMap(([, title, pages]) => pages.map(([e, t], k) => row(`книжка:${title}:${k}`, e, `${title}, стр. ${k + 1}: ${t}`, t)))),
    section('Истории островов', 'Картинка-сценка и реплика помощника после каждого уровня.', ISLANDS.flatMap(isl => (STORIES[isl.id]?.[1] || []).map(([e, t], k) => row(`история:${isl.id}:${k}`, e, `${isl.title.replace('Остров ', '')}, шаг ${k + 1}: ${t}`, t)))));
  count();
  app.scrollTop = 0;
}
