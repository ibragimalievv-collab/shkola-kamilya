import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../app/js/store.js';
import { ISLANDS } from '../app/js/curriculum.js';
import { assemblyQuestion, islandRewardOpen } from '../app/js/assembly.js';
import { reliefLayout, RELIEF_PARTS } from '../app/js/relief.js';
import { exportProfileFile, readProfileFile, restoreProfileFile, transferLink, readProfileLink } from '../app/js/transfer.js';

const createLocal = () => {
  const values = new Map();
  return createStore({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) });
};

function memoryDB() {
  const map = new Map();
  const id = (store, key) => store + ':' + key;
  return {
    get: async (store, key) => map.get(id(store, key)),
    del: async (store, key) => map.delete(id(store, key)),
    putBatch: async entries => entries.forEach(({ store, key, blob }) => map.set(id(store, key), blob)),
  };
}

test('раскраска за остров открывается после двух звёзд за каждый уровень', () => {
  const store = createLocal(), island = ISLANDS[0];
  island.levels.forEach((level, i) => store.finishLevel(level, i ? 2 : 1));
  assert.ok(store.islandDone(island));
  assert.equal(islandRewardOpen(store, island), false);
  store.finishLevel(island.levels[0], 2);
  assert.equal(islandRewardOpen(store, island), true);
  store.finishLevel(island.levels[0], 1);
  assert.equal(islandRewardOpen(store, island), true);
});

test('30 фигурных частей покрывают весь исходный рисунок и у задания один ответ', () => {
  const area = polygon => Math.abs(polygon.reduce((sum, [x, y], i) => {
    const next = polygon[(i + 1) % polygon.length];
    return sum + x * next[1] - y * next[0];
  }, 0)) / 2;
  for (const [w, h] of [[720, 480], [480, 720]]) {
    const pieces = reliefLayout(w, h);
    assert.equal(pieces.length, RELIEF_PARTS);
    assert.ok(Math.abs(pieces.reduce((sum, p) => sum + area(p.polygon), 0) - w * h) < 1e-4);
    assert.ok(new Set(pieces.map(p => p.depth)).size > 20);
  }
  for (const island of ISLANDS) for (let step = 0; step < 30; step++) {
    const task = assemblyQuestion(island, step, 5);
    assert.equal(task.options.filter(option => option === task.target).length, 1);
  }
});

test('перенос переносит рисунки и сохранение сборки только выбранного ребёнка', async () => {
  const src = createLocal(), dst = createLocal();
  const a = memoryDB(), b = memoryDB();
  const level = ISLANDS[0].levels[0];
  src.finishLevel(level, 3);
  src.profile.colorings = [{ id: 'cl-1234567890', abcCount: 5 }];
  src.profile.assemblies = { r1: { picture: 'assembly:p1:r1', blocks: 14 } };
  src.profile.reads = [{ id: 'read-1' }];
  await a.putBatch([
    { store: 'photos', key: 'cl-1234567890', blob: new Blob(['draw'], { type: 'image/png' }) },
    { store: 'photos', key: 'cl-1234567890-p', blob: new Blob(['paint'], { type: 'image/png' }) },
    { store: 'photos', key: 'assembly:p1:r1', blob: new Blob(['relief'], { type: 'image/png' }) },
    { store: 'reads', key: 'read-1', blob: new Blob(['voice'], { type: 'audio/webm;codecs=opus' }) },
    { store: 'photos', key: 'from-other-child', blob: new Blob(['private'], { type: 'image/png' }) },
  ]);
  const data = readProfileFile(await exportProfileFile(src, a)), id = src.profile.linkId;
  assert.equal(data.media.length, 4);
  assert.equal(readProfileLink(new URL(transferLink('https://test.example/school/?temporary=1', id)).hash), id);
  await assert.rejects(restoreProfileFile(dst, data, 'a'.repeat(32), b), /другому профилю/);
  assert.equal(dst.stars(level.id), 0);
  await restoreProfileFile(dst, data, id, b);
  assert.equal(dst.stars(level.id), 3);
  assert.equal(dst.profile.assemblies.r1.blocks, 14);
  assert.equal(await (await b.get('photos', dst.profile.colorings[0].id + '-p')).text(), 'paint');
  assert.equal(await (await b.get('photos', dst.profile.assemblies.r1.picture)).text(), 'relief');
  assert.equal(await (await b.get('reads', dst.profile.reads[0].id)).text(), 'voice');
  assert.equal(dst.state.profiles.p1.levels[level.id], undefined);
});
