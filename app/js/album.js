// АЛЬБОМ РИСУНКОВ ПО МЕСЯЦАМ. Каждый готовый рисунок ребёнка сохраняется на устройстве с датой:
// родители видят в своём разделе, что и когда он нарисовал. Ничего никуда не отправляется.

import { idb } from './db.js';
import { h, today } from './util.js';

const MAX = 150; // сколько рисунков храним (самые старые уходят)
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

// Сохранить рисунок: в коллекцию ребёнка (последние 12) и в альбом по датам.
export async function keepArt(store, dataUrl) {
  store.addArt(dataUrl);
  try {
    const [head, body] = dataUrl.split(','), bin = atob(body), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const id = 'al-' + Date.now(), list = store.part('album', []);
    await idb.put('photos', id, new Blob([bytes], { type: /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg' }));
    list.push({ id, d: today() });
    while (list.length > MAX) idb.del('photos', list.shift().id).catch(() => {});
    store.save();
  } catch { /* мало места — рисунок останется только в коллекции */ }
}
// Разложить рисунки по месяцам: [['2026-11', [рисунки…]], …], свежие месяцы и свежие рисунки — первыми.
export function byMonth(list) {
  const map = new Map();
  for (const it of [...list].reverse()) { const k = it.d.slice(0, 7); if (!map.has(k)) map.set(k, []); map.get(k).push(it); }
  return [...map].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}
export const monthName = ym => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

// Карточка для родительского раздела.
// Рисунок крупно: посмотреть и, если нужно, удалить один рисунок из альбома.
function viewer(store, it, url, again) {
  const close = () => box.remove();
  const box = h('div', { class: 'album-view', onclick: e => { if (e.target === box) close(); } },
    h('img', { src: url, alt: 'рисунок' }),
    h('div', { class: 'prow' }, h('button', { class: 'pbtn on', onclick: close }, 'Закрыть'),
      h('button', { class: 'pbtn warn', onclick: () => {
        if (!confirm('Удалить этот рисунок из альбома? Вернуть его будет нельзя.')) return;
        const list = store.part('album', []), i = list.indexOf(it);
        if (i >= 0) list.splice(i, 1);
        idb.del('photos', it.id).catch(() => {});
        store.save(); close(); again?.();
      } }, 'Удалить рисунок')));
  document.body.append(box);
}

export function albumCard(store, again) {
  // Рисунки без даты показываем только там, где альбома ещё не было (приложение обновили, а новых рисунков пока нет).
  const legacy = store.profile.album === undefined, list = store.part('album', []), old = legacy ? store.profile.gallery || [] : [];
  const box = h('section', { class: 'pbox' }, h('h2', {}, 'Альбом рисунков по месяцам'));
  if (!list.length && !old.length) { box.append(h('p', {}, 'Пока пусто. Сюда попадают рисунки и раскраски, которые ребёнок закончил и нажал галочку.')); return box; }
  for (const [ym, items] of byMonth(list)) {
    const grid = h('div', { class: 'album-month' });
    box.append(h('h3', {}, `${monthName(ym)} — ${items.length}`), grid);
    items.forEach(async it => {
      const fig = h('figure', {}, h('figcaption', {}, it.d.split('-').reverse().slice(0, 2).join('.')));
      grid.append(fig);
      try { const b = await idb.get('photos', it.id); if (b) { const url = URL.createObjectURL(b); fig.prepend(h('img', { src: url, alt: 'рисунок' })); fig.onclick = () => viewer(store, it, url, again); } } catch { /* рисунок не открылся */ }
    });
  }
  if (!list.length) box.append(h('h3', {}, 'Последние рисунки (без даты)'), h('div', { class: 'album-month' }, old.map(u => h('figure', {}, h('img', { src: u, alt: 'рисунок' })))));
  box.append(h('p', { class: 'hint' }, `Нажмите на рисунок, чтобы посмотреть его крупно или удалить. Хранятся последние ${MAX} рисунков, только на этом устройстве.`));
  return box;
}
