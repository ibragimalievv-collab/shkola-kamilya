import { h, makeRng, shuffle } from './util.js';
import { idb } from './db.js';
import { sfx } from './audio.js';
import { lettersKnown } from './fun.js';
import { ORDER } from './data.js';
import { makeRelief, RELIEF_PARTS } from './relief.js';

export const BLOCK_COUNT = RELIEF_PARTS;
export const islandRewardOpen = (store, island) => island.levels.length > 0 && island.levels.every(level => store.stars(level.id) >= 2);
export const islandAssembly = (store, island) => store.profile.assemblies?.[island.id];

export async function loadAssemblyPicture(store, island) {
  const assembly = islandAssembly(store, island);
  if (!assembly?.picture) return null;
  try { return await idb.get('photos', assembly.picture); } catch { return null; }
}

export async function saveAssemblyPicture(store, island, picture, media = idb) {
  const assemblies = store.part('assemblies', {});
  const key = 'assembly:' + store.state.current + ':' + island.id;
  await media.put('photos', key, picture);
  assemblies[island.id] = { picture: key, blocks: 0, letters: Math.max(5, lettersKnown(store)) };
  store.save();
}

export function assemblyQuestion(island, step, knownLetters) {
  const rng = makeRng(137 * (island.n + 1) + 193 * (step + 1));
  if (!['M', 'X', 'D'].includes(island.line)) {
    const letters = ORDER.slice(0, Math.max(5, Number(knownLetters) || 0)).split('');
    const options = shuffle(rng, letters).slice(0, 3);
    const target = options[0];
    return { prompt: 'Найди деталь с буквой ' + target, target, options: shuffle(rng, options) };
  }
  const count = step % 5 + 1;
  const target = island.line === 'X' ? count * 2 : count;
  const prompt = island.line === 'D' ? `${count * 2} : 2 = ?`
    : island.line === 'X' ? `2 × ${count} = ?` : `Сколько точек? ${'● '.repeat(count).trim()}`;
  return { prompt, target, options: shuffle(rng, [target, target + 1, target > 1 ? target - 1 : target + 2]) };
}

export async function assemblyScreen(x, island, drawing, back, backLabel = 'назад к острову') {
  const { store, screen, ibtn } = x;
  let image;
  try { image = await createImageBitmap(drawing); } catch { return back(); }
  const saved = islandAssembly(store, island);
  let count = Math.max(0, Math.min(BLOCK_COUNT, Math.floor(Number(saved?.blocks) || 0)));
  let yaw = .12, pitch = .12, sample = false, drag, paintPending = false;
  const order = shuffle(makeRng(island.n * 127 + 671), Array.from({length:BLOCK_COUNT}, (_, i) => i));
  const shown = new Set(order.slice(0, count));
  const view = h('canvas', { width: 740, height: 488, 'aria-label': 'Объёмный рисунок. Потяните по рисунку, чтобы повернуть.' });
  const compose = makeRelief(view.getContext('2d'), image);
  const choices = h('div', { class: 'build-choices', 'aria-label': 'Варианты ответа' });
  const label = h('p', { class: 'build-question' });
  const notice = h('p', { class: 'build-notice', role: 'status' });
  const tally = h('strong');
  const paint = () => compose({ yaw, pitch, revealed: shown, all: sample || count === BLOCK_COUNT, active: order[count] });
  const update = () => {
    if (paintPending) return;
    paintPending = true; requestAnimationFrame(() => { paintPending = false; if (view.isConnected) paint(); });
  };
  const example = h('button', { class: 'reward-action', type: 'button', 'aria-pressed': 'false', onclick: () => {
    sample = !sample; render();
  } }, 'Показать рисунок');
  const front = h('button', { class: 'reward-action', type: 'button', onclick: () => { yaw = pitch = 0; update(); } }, 'Прямо');

  function render() {
    paint();
    const complete = count === BLOCK_COUNT;
    tally.textContent = `${count} из ${BLOCK_COUNT}`;
    example.hidden = complete;
    example.textContent = sample ? 'Продолжить сборку' : 'Показать рисунок';
    example.setAttribute('aria-pressed', String(sample));
    choices.replaceChildren();
    if (complete || sample) { label.textContent = complete ? 'Рисунок собран! Поверни его.' : 'Так выглядит готовый рисунок.'; return; }
    const task = assemblyQuestion(island, count, saved?.letters);
    label.textContent = task.prompt;
    for (const answer of task.options) choices.append(h('button', {
      class: 'build-part', type: 'button', onclick: () => {
        if (answer !== task.target) { notice.textContent = 'Попробуй ещё.'; sfx('miss'); return; }
        shown.add(order[count++]);
        if (saved) { saved.blocks = count; store.save(); }
        notice.textContent = count === BLOCK_COUNT ? 'Ты собрал свой рисунок!' : '';
        sfx(count === BLOCK_COUNT ? 'island' : 'ok');
        render();
        choices.querySelector('button')?.focus();
      },
    }, String(answer)));
  }
  view.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw, pitch }; view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', e => {
    if (drag?.id !== e.pointerId) return;
    yaw = Math.max(-.66, Math.min(.66, drag.yaw + (e.clientX - drag.x) * .009));
    pitch = Math.max(-.48, Math.min(.48, drag.pitch + (e.clientY - drag.y) * .008));
    update();
  });
  view.addEventListener('pointerup', () => { drag = null; });
  view.addEventListener('pointercancel', () => { drag = null; });
  const rotate = direction => { yaw = Math.max(-.66, Math.min(.66, yaw + direction * .18)); update(); };
  screen('build-screen', h('div', { class: 'bar' }, ibtn('◀', backLabel, () => { image.close?.(); back(); }),
    h('span', { class: 'grow' }), tally), h('h1', {}, 'Собери объёмный рисунок'), view,
    h('div', { class: 'build-controls' }, ibtn('↶', 'повернуть влево', () => rotate(-1)), example, front,
      ibtn('↷', 'повернуть вправо', () => rotate(1))), label, choices, notice);
  render();
}
