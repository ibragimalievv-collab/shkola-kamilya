import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../app/js/store.js';
import { ISLANDS } from '../app/js/curriculum.js';
import { assemblyQuestion, islandRewardOpen } from '../app/js/assembly.js';
import { reliefLayout, RELIEF_PARTS } from '../app/js/relief.js';
import { exportProfileFile, readProfileFile, restoreProfileFile, transferLink, readProfileLink } from '../app/js/transfer.js';
import { groupPaints, guidePaint, targetPaint } from '../app/js/paint-game.js';
import { illustrationMask, floodFill } from '../app/js/photo.js';

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

test('подписи держат расстояние, а мелкие участки остаются в раскраске', () => {
  const regions = [
    { k: 0, pi: 0, x: 55, y: 50, room: 24, size: 800, text: 'А' },
    { k: 1, pi: 0, x: 62, y: 51, room: 12, size: 130, text: 'А' },
    { k: 2, pi: 1, x: 140, y: 50, room: 22, size: 420, text: 'М' },
  ];
  const guide = guidePaint(regions, 250), ids = new Int32Array(250 * 100).fill(-1);
  ids[51 * 250 + 62] = 1;
  ids[50 * 250 + 130] = 9;
  assert.deepEqual(guide.map(g => g.k), [0, 2]);
  assert.deepEqual(guide[0].details.map(g => g.k), [1]);
  assert.equal(targetPaint(guide, ids, 250, 100, 62, 51, 4, 8)?.k, 0);
  assert.equal(targetPaint(guide, ids, 250, 100, 130, 50, 4, 12), undefined);
  const colors = [[240, 169, 55], [252, 174, 43], [50, 171, 221]];
  assert.deepEqual(groupPaints(colors, regions.map((g, pi) => ({ ...g, pi, size: 400 - pi * 100 })), 2, true).palette, [colors[0], colors[2]]);
});

test('контуры иллюстрации сохраняют обводку и пропускают плавные переходы', () => {
  const w = 160, h = 100;
  const channels = [0, 1, 2].map(c => Uint8Array.from({ length: w * h }, (_, i) => {
    const x = i % w, y = Math.floor(i / w);
    const inFrame = x >= 35 && x < 125 && y >= 20 && y < 80;
    const outline = inFrame && (x < 39 || x >= 121 || y < 24 || y >= 76);
    return outline ? 21 : [118, 185, 244][c] - Math.floor(x / 8);
  }));
  const mask = illustrationMask(channels, w, h);
  assert.equal(mask[50 * w + 15], 0);
  assert.equal(mask[50 * w + 36], 1);
  assert.equal(floodFill(mask, w, h, 70, 50)[50 * w + 15], 0);
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

test('фотографии всех попыток письма переносятся вместе с оценками в чистый профиль', async () => {
  const src = createLocal(), dst = createLocal(), sourceDB = memoryDB(), targetDB = memoryDB();
  const page = (photo, stars) => ({ d: '2026-11-21', t: 1, photo, stars, note: 'Обведи ещё раз' });
  src.profile.pen = {
    e1: { works: [page('ph-a', 2), page('ph-b', 3), page(null, 1)] },
    e2: { photo: 'old-key', works: [] },
  };
  await sourceDB.putBatch(['ph-a', 'ph-b', 'old-key'].map(key => ({
    store: 'photos', key, blob: new Blob(['source-' + key], { type: 'image/jpeg' }),
  })));
  await targetDB.putBatch([{ store: 'photos', key: 'ph-a', blob: new Blob(['another child']) }]);
  const data = readProfileFile(await exportProfileFile(src, sourceDB));
  assert.deepEqual(data.media.map(([, key]) => key).sort(), ['old-key', 'ph-a', 'ph-b']);
  await restoreProfileFile(dst, data, undefined, targetDB);
  for (const [i, original] of src.profile.pen.e1.works.entries()) {
    const restored = dst.profile.pen.e1.works[i];
    assert.deepEqual({ ...restored, photo: original.photo }, original);
    if (original.photo === null) assert.equal(restored.photo, null);
    else {
      assert.notEqual(restored.photo, original.photo);
      assert.equal(await (await targetDB.get('photos', restored.photo)).text(), 'source-' + original.photo);
    }
  }
  assert.equal(await (await targetDB.get('photos', dst.profile.pen.e2.photo)).text(), 'source-old-key');
  assert.equal(await (await targetDB.get('photos', 'ph-a')).text(), 'another child');

  // Старая копия хранила строки работ, но пропускала вложенные фотографии.
  const oldFile = { ...data, media: data.media.filter(([, key]) => key === 'old-key') };
  await restoreProfileFile(dst, oldFile, undefined, targetDB);
  const recovered = dst.profile.pen.e1.works;
  assert.equal(await (await targetDB.get('photos', recovered[0].photo)).text(), 'source-ph-a');
  assert.equal(await (await targetDB.get('photos', recovered[1].photo)).text(), 'source-ph-b');
  const fresh = createLocal();
  await restoreProfileFile(fresh, oldFile, undefined, targetDB);
  assert.deepEqual(fresh.profile.pen.e1.works.map(w => w.photo), [null, null, null]);
  assert.equal(fresh.profile.pen.e1.works[0].stars, 2);
});
