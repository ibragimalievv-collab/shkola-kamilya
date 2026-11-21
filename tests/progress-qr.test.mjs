import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../app/js/store.js';
import { LEVELS } from '../app/js/curriculum.js';
import { progressLink, readProgressLink, restoreProgress } from '../app/js/progress.js';
import { qrMatrix, qrDisplaySide } from '../app/js/qr.js';

const address = 'https://school.test/game/?try=coloring#old';
const memory = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};
const snapshot = store => readProgressLink(new URL(progressLink(address, store)).hash);
const filled = () => {
  const store = createStore(memory());
  store.profile.name = 'Камиль';
  LEVELS.forEach((level, i) => { if (i % 4) store.profile.levels[level.id] = i % 4; });
  store.profile.hero.body = '#123abc';
  return store;
};

test('QR переносит точные звёзды всех358уровней в компактной ссылке', () => {
  const source = filled();
  const url = new URL(progressLink(address, source)), data = readProgressLink(url.hash);
  assert.equal(url.pathname, '/game/qr.html');
  assert.equal(url.search, '');
  assert.ok(url.href.length < 800);
  assert.deepEqual(data.levels, source.profile.levels);
  assert.equal(data.name, 'Камиль');
  assert.equal(data.linkId, source.profile.linkId);
  assert.deepEqual(data.hero, source.profile.hero);
  assert.equal(readProgressLink('#profile=' + source.profile.linkId), null);
});

test('все358уровней с3звёздами помещаются в один QR', () => {
  const source = filled();
  LEVELS.forEach(level => { source.profile.levels[level.id] = 3; });
  source.profile.name = 'ДлинноеИмяРебёнка1234';
  const link = progressLink(address, source), data = readProgressLink(new URL(link).hash);
  const matrix = qrMatrix(link);
  assert.equal(Object.keys(data.levels).length, LEVELS.length);
  assert.equal(Object.values(data.levels).reduce((a, b) => a + b), LEVELS.length * 3);
  assert.ok(matrix.length <= 101);
  assert.ok(matrix.every(row => row.length === matrix.length));
});

test('QR рисуется целыми пикселями экрана, в том числе при узкой ширине', () => {
  for (const ratio of [1, 1.25, 1.5, 2, 3]) for (const width of [248, 320, 448]) {
    const side = qrDisplaySide(77, width, ratio);
    assert.ok(side <= width);
    assert.equal(side * ratio / 77, Math.floor(side * ratio / 77));
  }
  assert.equal(qrDisplaySide(77, 248, 1), 231);
});

test('QR добавляет выбранного ребёнка и сохраняет другой профиль и настройки', () => {
  const source = filled(), storage = memory(), target = createStore(storage);
  const first = target.state.current;
  target.profile.name = 'Сестра'; target.profile.levels[LEVELS[0].id] = 2;
  target.profile.pet = { name: 'Лучик', img: 'data:image/png;base64,YQ==' };
  target.settings.dailyLimit = 20; target.save();
  const previous = JSON.stringify(target.state.profiles[first]);
  restoreProgress(target, snapshot(source));
  assert.equal(target.profile.name, source.profile.name);
  assert.deepEqual(target.profile.levels, source.profile.levels);
  assert.equal(JSON.stringify(target.state.profiles[first]), previous);
  assert.equal(target.settings.dailyLimit, 20);
  assert.equal(Object.keys(target.state.profiles).length, 2);
  const reopened = createStore(storage);
  assert.deepEqual(reopened.profile.levels, source.profile.levels);
  assert.equal(reopened.profile.heroDone, true);
  assert.equal(reopened.profile.placed, true);
  assert.equal(reopened.profile.petSkipped, true);
});

test('повторный и старый QR сохраняют лучшие результаты, имя и медиа уже перенесённого ребёнка', () => {
  const source = filled(), storage = memory(), target = createStore(storage), data = snapshot(source);
  restoreProgress(target, data);
  target.profile.levels[LEVELS[0].id] = 3;
  target.profile.levels[LEVELS[1].id] = 3;
  target.profile.name = 'Капитан';
  target.profile.pet = { name: 'Искрик', img: 'data:image/png;base64,YQ==' };
  target.profile.album = [{ id: 'local-drawing' }];
  target.profile.overrides = { r2: 'closed' };
  target.save(); const id = target.state.current;
  restoreProgress(target, data); restoreProgress(target, data);
  assert.equal(target.state.current, id);
  assert.equal(Object.keys(target.state.profiles).length, 2);
  assert.equal(target.stars(LEVELS[0].id), 3);
  assert.equal(target.stars(LEVELS[1].id), 3);
  assert.equal(target.profile.name, 'Капитан');
  assert.deepEqual(target.profile.pet, { name: 'Искрик', img: 'data:image/png;base64,YQ==' });
  assert.deepEqual(target.profile.album, [{ id: 'local-drawing' }]);
  assert.deepEqual(target.profile.overrides, { r2: 'closed' });
});

test('новый QR того же профиля добавляет новые пройденные уровни', () => {
  const source = filled(), target = createStore(memory());
  restoreProgress(target, snapshot(source));
  source.profile.levels[LEVELS[0].id] = 2;
  restoreProgress(target, snapshot(source));
  assert.equal(target.stars(LEVELS[0].id), 2);
  assert.equal(Object.keys(target.state.profiles).length, 2);
});

test('отказ записи при QR не изменяет текущий профиль, после освобождения места перенос повторяется', () => {
  const source = filled(), storage = memory(), write = storage.setItem, target = createStore(storage);
  target.save(); const before = JSON.stringify(target.state), data = snapshot(source);
  storage.setItem = () => { throw new Error('Нет места'); };
  assert.throws(() => restoreProgress(target, data), /Нет места/);
  assert.equal(JSON.stringify(target.state), before);
  storage.setItem = write; restoreProgress(target, data);
  assert.deepEqual(createStore(storage).profile.levels, source.profile.levels);
});

test('повреждённый, слишком длинный или неизвестный QR отклоняется до сохранения', () => {
  const source = filled(), hash = new URL(progressLink(address, source)).hash;
  assert.throws(() => readProgressLink(hash.slice(0, -1)), /QR/);
  assert.throws(() => readProgressLink(hash.replace('progress=1.', 'progress=2.')), /QR/);
  assert.throws(() => readProgressLink('#progress=' + 'A'.repeat(1800)), /QR/);
  assert.throws(() => readProgressLink('#progress='), /QR/);
});

test('QR со старой незнакомой программой не может молча потерять пройденные уровни', () => {
  const source = filled(); source.profile.levels['future-level'] = 3;
  assert.throws(() => progressLink(address, source), /QR/);
});
