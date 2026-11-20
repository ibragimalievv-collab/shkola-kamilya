// СТУДИЯ ГОЛОСА (родительский раздел): записать буквы, слоги и слова своим голосом.
// Запись хранится только на устройстве. Где запись есть — она звучит вместо синтезатора.

import { toggleRecording } from './record.js';
import { h } from './util.js';
import { ORDER, WORDS } from './data.js';
import { syllables } from './tasks.js';
import { hasClip, saveClip, deleteClip, playClip, clipCount, voiceIsBasic, russianVoices, hasRecordedVoice } from './audio.js';

const GROUPS = [
  { title: 'Буквы', prefix: 'б:', tip: 'Произносите звук буквы коротко и чисто: «м», «с», «а». Для Ь и Ъ скажите «мягкий знак», «твёрдый знак», для Й — «и краткое».', items: () => ORDER.split('').map(L => ['б:' + L, L]) },
  { title: 'Слоги', prefix: 'с:', tip: 'Читайте слог слитно: «ма», «су», «ли».', items: () => syllables(33).map(s => ['с:' + s, s]) },
  { title: 'Слова', prefix: 'ш:', tip: 'Произносите слово спокойно и чётко, как вы говорите ребёнку.', items: () => WORDS.map(w => ['ш:' + w.w, w.w]) },
];

function toggle(key, btn, refresh) {
  toggleRecording(btn, 4000, async blob => {
    if (blob.size <= 500) return;
    try { await saveClip(key, blob); if (btn.isConnected && !document.hidden) { refresh(); playClip(key); } }
    catch { alert('Не удалось сохранить запись. Проверьте свободное место на устройстве.'); }
  }, () => alert('Нет доступа к микрофону или записи звука. Проверьте разрешение в настройках устройства.'));
}

// Кнопки для одной записи: записать, прослушать, удалить.
export function clipCell(key, label, changed = () => {}) {
  const el = h('div', { class: 'clip' });
  const draw = () => {
    const b = h('button', { class: 'pbtn rec' + (hasClip(key) ? ' on' : ''), title: 'Нажмите, скажите, нажмите ещё раз', onclick: () => toggle(key, b, () => { draw(); changed(); }) }, label);
    el.replaceChildren(...[b, hasClip(key) ? h('button', { class: 'pbtn mini', 'aria-label': 'прослушать', onclick: () => playClip(key) }, '▶') : null,
      hasClip(key) ? h('button', { class: 'pbtn mini warn', 'aria-label': 'удалить запись', onclick: async () => { await deleteClip(key); draw(); changed(); } }, '✕') : null].filter(Boolean)); // пустые места пропускаем, иначе на экране появится слово «null"
  };
  draw();
  return el;
}

// Карточка для родительского раздела.
export function voiceStudio() {
  const rec = hasRecordedVoice(), basic = !rec && voiceIsBasic(), none = !rec && !russianVoices().length;
  const box = h('section', { class: 'pbox' }, h('h2', {}, 'Студия голоса: запишите своим голосом'),
    h('p', {}, rec ? 'Приложение говорит заранее записанным голосом. Если какую-то букву, слог или слово хочется слышать иначе — запишите их своим голосом: такая запись звучит вместо готовой.'
      : 'Готовых записей голоса в приложении нет, поэтому говорит синтезатор речи самого устройства. Буквы и слоги лучше записать своим голосом: это около десяти минут.'),
    none ? h('p', { class: 'warn-text' }, 'На устройстве нет русского голоса: установите его в настройках устройства, иначе задания не будут озвучены.') : null,
    basic ? h('p', { class: 'warn-text' }, 'Сейчас на устройстве только базовый русский голос. В настройках устройства можно бесплатно загрузить голос лучшего качества: '
      + 'на iPad и iPhone — «Настройки → Универсальный доступ → Устный контент → Голоса → Русский», выберите голос с пометкой «улучшенный»; '
      + 'на Android — «Настройки → Специальные возможности → Синтез речи», установите русский язык для синтезатора.') : null);
  for (const g of GROUPS) {
    const items = g.items(), sum = h('summary', {}, '');
    const grid = h('div', { class: 'clip-grid' });
    const title = () => { sum.textContent = `${g.title}: записано ${clipCount(g.prefix)} из ${items.length}`; };
    const cell = ([key, label]) => clipCell(key, label, title);
    // Ячейки создаём, только когда родитель раскрыл группу: слов много.
    const det = h('details', { ontoggle: () => { if (det.open && !grid.children.length) grid.append(...items.map(cell)); } }, sum, h('p', { class: 'hint' }, g.tip + ' Нажмите на кнопку, произнесите и нажмите ещё раз (запись сама остановится через 4 секунды).'), grid);
    title();
    box.append(det);
  }
  return box;
}
