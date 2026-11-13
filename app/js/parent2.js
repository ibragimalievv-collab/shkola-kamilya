// РОДИТЕЛЯМ, ЧАСТЬ ВТОРАЯ: недельная сводка, записи чтения вслух, напоминание, альбом ребёнка, проверка на входе.

import { h, today, pl } from './util.js';
import { ISLANDS, LEVELS } from './curriculum.js';
import { LINES, lineOf, labelOf } from './tasks.js';
import { idb } from './db.js';
import { BOOKS } from './books.js';
import { reviewScreen } from './review.js';

const btn = (text, fn, cls = '') => h('button', { class: 'pbtn ' + cls, onclick: fn }, text);
const card = (title, ...kids) => h('section', { class: 'pbox' }, h('h2', {}, title), ...kids);
const fmt = d => d.split('-').reverse().join('.');

// Что сделать вместе за десять минут — по линии, где сейчас труднее всего.
const TOGETHER = {
  R: 'Почитайте вместе книжку из библиотеки приложения: ребёнок читает, вы ведёте пальцем по словам. На прогулке ищите знакомые буквы на вывесках.',
  W: 'Дайте листок и карандаш: пусть напишет своё имя и три слова, которые выберет сам. Хвалите за ровные буквы, а не за скорость.',
  M: 'Посчитайте вместе что-нибудь настоящее: ступеньки, ложки, машины во дворе. Задайте пять устных примеров по дороге — как игру.',
  X: 'Разложите двенадцать конфет или пуговиц поровну на две, три и четыре кучки. Спросите: сколько кучек, по сколько в каждой, сколько всего?',
  D: 'Разложите двенадцать конфет или пуговиц поровну на две, три и четыре кучки. Спросите: сколько кучек, по сколько в каждой, сколько всего?',
};

export function parentExtras(ctx) {
  const { store, again } = ctx, p = store.profile, st = store.state;

  // --- сводка за неделю ---
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return today(d); });
  const ids = week.flatMap(d => p.days[d]?.ids || []), sec = week.reduce((a, d) => a + (p.days[d]?.sec || 0), 0), active = week.filter(d => (p.days[d]?.levels || 0) > 0).length;
  const byLine = {};
  for (const id of ids) { const l = LEVELS.find(x => x.id === id); if (l) { const k = ISLANDS[l.island].line; byLine[k] = (byLine[k] || 0) + 1; } }
  const finished = ISLANDS.filter(i => store.islandDone(i) && i.levels.some(l => ids.includes(l.id)));
  const weakCount = {};
  for (const w of store.weakAll()) { const key = `${lineOf(w.s)}|${labelOf(w.s)}`; weakCount[key] = (weakCount[key] || 0) + 1; }
  const stuck = Object.entries(weakCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const hardLine = stuck.length ? stuck[0][0].split('|')[0] : (store.nextLevel() ? ISLANDS[store.nextLevel().island].line : 'R');
  const summary = card('Сводка за неделю',
    h('p', {}, ids.length
      ? `За 7 дней: ${ids.length} ${pl(ids.length, ['уровень', 'уровня', 'уровней'])}, ${Math.round(sec / 60)} мин, занимался в ${active} ${pl(active, ['день', 'дня', 'дней'])} из 7. Цепочка: ${store.streak()} ${pl(store.streak(), ['день', 'дня', 'дней'])} подряд.`
      : 'За последние 7 дней занятий не было.'),
    ids.length ? h('p', {}, h('b', {}, 'Чем занимался: '), Object.entries(byLine).map(([k, n]) => `${LINES[k].toLowerCase()} — ${n}`).join(', ') + '.') : null,
    h('p', {}, h('b', {}, 'Что освоил: '), finished.length ? finished.map(i => `уже ${i.can}`).join('; ') + '.' : 'новых островов целиком пока не пройдено — это нормально, остров занимает несколько дней.'),
    h('p', {}, h('b', {}, 'Где застрял: '), stuck.length ? stuck.map(([k]) => k.split('|')[1]).join('; ') + '. Приложение само вернёт эти задания через день, три дня и неделю.' : 'трудных мест сейчас нет.'),
    h('p', {}, h('b', {}, 'Что сделать вместе за 10 минут на выходных: '), TOGETHER[hardLine]),
    h('p', { class: 'hint' }, `Книжек прочитано: ${Object.keys(p.books || {}).length} из ${BOOKS.length}. Записей чтения вслух: ${(p.reads || []).length}.`));

  // --- записи чтения вслух ---
  const reads = [...(p.reads || [])].reverse(), player = new Audio();
  let lastDay = '';
  const readList = h('div', { class: 'nb-list' }, reads.slice(0, 40).flatMap(r => {
    const head = r.d !== lastDay ? [h('h3', {}, fmt(lastDay = r.d))] : [];
    return [...head, h('div', { class: 'prow' }, btn('▶', async () => { try { player.src = URL.createObjectURL(await idb.get('reads', r.id)); player.play(); } catch { alert('Запись не найдена на устройстве.'); } }, 'mini'), h('span', {}, r.t))];
  }));
  const reading = card('Как он читает вслух', reads.length ? h('p', {}, 'Записи идут от новых к старым: послушайте подряд за разные дни — и услышите, как меняется чтение.') : h('p', {}, 'Записей пока нет. Они появляются в заданиях «Прочитай вслух» на островах чтения.'),
    reads.length ? h('details', {}, h('summary', {}, `Записи (${reads.length})`), readList) : null,
    reads.length ? btn('Удалить все записи', async () => { if (!confirm('Удалить все записи чтения?')) return; for (const r of p.reads) await idb.del('reads', r.id).catch(() => {}); p.reads = []; store.save(); again(); }, 'warn') : null,
    h('p', { class: 'hint' }, 'Записи хранятся только на этом устройстве, последние 60.'));

  // --- напоминание ---
  const time = h('input', { type: 'time', value: st.settings.remind || '', onchange: e => { st.settings.remind = e.target.value; store.save(); } });
  const ics = () => {
    const [hh, mm] = (st.settings.remind || '17:00').split(':'), d = today().replace(/-/g, '');
    const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//shkola-kamilya//RU', 'BEGIN:VEVENT', `UID:shkola-kamilya-${Date.now()}`, `DTSTART:${d}T${hh}${mm}00`, 'DURATION:PT20M', 'RRULE:FREQ=DAILY', 'SUMMARY:Школа Камиля — 20 минут занятий', 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Пора позаниматься', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/calendar' })), download: 'shkola-kamilya-napominanie.ics' });
    document.body.append(a); a.click(); a.remove();
  };
  const remind = card('Напоминание о занятии',
    h('label', {}, 'Время ', time, btn('Выключить', () => { st.settings.remind = ''; store.save(); again(); })),
    h('div', { class: 'prow' }, typeof Notification !== 'undefined' && Notification.permission !== 'granted' ? btn('Разрешить уведомления', async () => { await Notification.requestPermission(); again(); }) : null,
      btn('Добавить в календарь телефона', ics, 'on')),
    h('p', { class: 'hint' }, 'Само приложение может напомнить, только пока оно открыто или свёрнуто: планшеты не дают веб-приложениям будить себя по расписанию. Надёжный способ — кнопка «Добавить в календарь»: напоминание будет приходить каждый день в выбранное время, даже если приложение закрыто.'));

  // --- проверка на входе и альбом ---
  const skipped = Object.keys(p.skipped || {}).length;
  const tools = card('Проверка на входе и альбом',
    h('p', {}, skipped ? `По итогам проверки отмечено пройденными: ${skipped} ${pl(skipped, ['уровень', 'уровня', 'уровней'])} (с одной звездой).` : 'Проверка на входе — пять минут игровых заданий: приложение узнаёт, какие буквы, слоги и числа ребёнок уже знает, и не заставляет проходить их заново.'),
    h('div', { class: 'prow' }, btn('Пройти проверку', ctx.placement), skipped ? btn('Вернуть пропущенные уровни', () => { if (confirm('Вернуть уровни, отмеченные проверкой? Их нужно будет пройти.')) { store.unskipAll(); again(); } }) : null,
      btn('Распечатать альбом ребёнка', () => printAlbum(p))),
    h('p', { class: 'hint' }, 'В альбоме — его герой, последние рисунки и слова, которые он написал сам.'));

  const check = card('Проверка картинок и слов',
    h('p', {}, 'Все предметы, наклейки, книжки и истории подряд: картинка, название, кнопка «послушать». Отметьте то, что не нравится, и перешлите список.'),
    btn('Открыть страницу проверки', () => reviewScreen({ app: ctx.app, back: again }), 'on'));
  return [check, summary, reading, remind, tools];
}

// Альбом для печати: рисунки и первые написанные слова.
function printAlbum(p) {
  const pics = [...(p.pet ? [[p.pet.img, `Мой герой ${p.pet.name}`]] : []), ...(p.words || []).map(w => [w.u, `Я написал: ${w.t}`]), ...p.gallery.map(u => [u, ''])];
  if (!pics.length) return alert('Пока нечего печатать: рисунков ещё нет.');
  const page = h('div', { id: 'print', class: 'album' }, h('h1', {}, `Моя книжка. ${p.name}`), h('div', { class: 'album-grid' }, pics.map(([u, t]) => h('figure', {}, h('img', { src: u, alt: '' }), h('figcaption', {}, t)))));
  document.getElementById('print')?.remove();
  document.body.append(page);
  window.addEventListener('afterprint', () => page.remove(), { once: true });
  window.print();
}

// Пора ли напомнить о занятии (проверяется раз в минуту, пока приложение открыто).
export function reminderDue(store, shownKey) {
  const t = store.settings.remind;
  if (!t || store.todayIds().length) return false;
  const now = new Date(), hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return hm >= t && shownKey !== today();
}
