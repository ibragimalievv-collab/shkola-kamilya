// ПРОВЕРКА 2. Сохранение прогресса: звёзды, открытие уровней, наклейки, профили, перенос файлом.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../app/js/store.js';
import { ISLANDS, LEVELS } from '../app/js/curriculum.js';

// Память устройства понарошку.
const fakeStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('сначала открыт только первый уровень', () => {
  const s = createStore(fakeStorage());
  assert.equal(s.nextLevel().id, LEVELS[0].id);
  assert.equal(LEVELS.filter(l => s.isOpen(l)).length, 1);
});

test('прогресс переживает закрытие приложения', () => {
  const mem = fakeStorage();
  const a = createStore(mem);
  a.finishLevel(LEVELS[0], 2);
  a.finishLevel(LEVELS[0], 1); // хуже прежнего результата — звёзды не уменьшаются
  a.addWeak(['exKey', 'a10']);
  a.addTime(300);
  a.profile.hero.body = '#ff0000';
  a.save();
  const b = createStore(mem); // «открыли приложение заново»
  assert.equal(b.stars(LEVELS[0].id), 2);
  assert.ok(b.isOpen(LEVELS[1]));
  assert.deepEqual(b.weakList(), [['exKey', 'a10']]);
  assert.equal(b.todaySec(), 300);
  assert.equal(b.profile.hero.body, '#ff0000');
});

test('уровни открываются по очереди, за остров дают наклейку', () => {
  const s = createStore(fakeStorage());
  let stickers = 0;
  for (const L of LEVELS) {
    assert.ok(s.isOpen(L), `${L.id} должен быть открыт`);
    assert.equal(s.nextLevel().id, L.id);
    if (s.finishLevel(L, 3).sticker) stickers++;
  }
  assert.equal(stickers, ISLANDS.length);
  assert.equal(s.nextLevel(), null);
});

test('родитель может открыть и закрыть остров', () => {
  const s = createStore(fakeStorage());
  const far = ISLANDS[10];
  assert.ok(!s.islandOpen(far));
  s.setOverride(far.id, 'open');
  assert.ok(far.levels.every(l => s.isOpen(l)));
  s.setOverride(ISLANDS[0].id, 'closed');
  assert.ok(!s.isOpen(LEVELS[0]));
  s.setOverride(ISLANDS[0].id, '');
  assert.ok(s.isOpen(LEVELS[0]));
});

test('ошибки возвращаются на повторение и уходят после верных ответов', () => {
  const s = createStore(fakeStorage());
  s.addWeak(['house', 7, 7]);
  s.fixWeak(['house', 7, 7]);
  assert.equal(s.weakList().length, 1, 'одного верного ответа мало');
  s.fixWeak(['house', 7, 7]);
  assert.equal(s.weakList().length, 0);
});

test('дневной лимит', () => {
  const s = createStore(fakeStorage());
  s.addTime(16 * 60);
  assert.ok(!s.overLimit(), 'без лимита ограничения нет');
  s.settings.dailyLimit = 15;
  assert.ok(s.overLimit());
});

test('у второго ребёнка свой прогресс', () => {
  const s = createStore(fakeStorage());
  s.finishLevel(LEVELS[0], 3);
  const first = s.state.current;
  s.addProfile('Сестра');
  assert.equal(s.stars(LEVELS[0].id), 0);
  assert.equal(s.profile.name, 'Сестра');
  s.switchProfile(first);
  assert.equal(s.stars(LEVELS[0].id), 3);
});

test('перенос прогресса файлом и защита от чужого файла', () => {
  const a = createStore(fakeStorage());
  a.finishLevel(LEVELS[0], 3);
  a.finishLevel(LEVELS[1], 2);
  const file = a.exportText();
  const b = createStore(fakeStorage());
  b.importText(file);
  assert.equal(b.stars(LEVELS[1].id), 2);
  assert.throws(() => b.importText('{"что-то":"другое"}'));
  assert.throws(() => b.importText('не файл'));
  assert.equal(b.stars(LEVELS[1].id), 2, 'плохой файл ничего не испортил');
});

test('сброс прогресса и испорченная память не ломают приложение', () => {
  const s = createStore(fakeStorage());
  s.finishLevel(LEVELS[0], 3);
  s.resetProfile();
  assert.equal(s.stars(LEVELS[0].id), 0);
  const broken = fakeStorage();
  broken.setItem('shkola-kamilya-v1', '{испорчено');
  assert.equal(createStore(broken).nextLevel().id, LEVELS[0].id);
});
