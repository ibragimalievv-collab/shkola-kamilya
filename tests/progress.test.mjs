// ПРОВЕРКА 2. Сохранение прогресса: звёзды, открытие уровней, наклейки, профили, перенос файлом.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../app/js/store.js';
import { ISLANDS, LEVELS } from '../app/js/curriculum.js';

// Память устройства понарошку.
const fakeStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('сначала открыто по одному первому уровню чтения, счёта и письма, а умножение закрыто', () => {
  const s = createStore(fakeStorage());
  assert.equal(s.nextLevel().id, LEVELS[0].id);
  assert.deepEqual(LEVELS.filter(l => s.isOpen(l)).map(l => l.id).sort(), ['m1-1', 'r1-1', 'w1-1']);
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
  assert.deepEqual(b.weakAll().map(w => w.s), [['exKey', 'a10']]);
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

test('умное повторение: ошибка возвращается через день, три дня и неделю — до трёх верных подряд', () => {
  let date = '2026-03-01';
  const s = createStore(fakeStorage(), () => date), src = ['house', 7, 7];
  s.addWeak(src);
  assert.equal(s.weakList().length, 0, 'в тот же день не повторяем');
  date = '2026-03-02'; assert.equal(s.weakList().length, 1, 'через день — пора');
  s.fixWeak(src);
  date = '2026-03-04'; assert.equal(s.weakList().length, 0, 'ещё рано');
  date = '2026-03-05'; assert.equal(s.weakList().length, 1, 'через три дня — пора');
  s.fixWeak(src);
  date = '2026-03-11'; assert.equal(s.weakList().length, 0);
  date = '2026-03-12'; assert.equal(s.weakList().length, 1, 'через неделю — пора');
  s.addWeak(src); // снова ошибся — счёт верных ответов начинается заново
  date = '2026-03-13'; s.fixWeak(src);
  assert.equal(s.weakAll().length, 1, 'после ошибки одного верного ответа мало');
  s.fixWeak(src); s.fixWeak(src);
  assert.equal(s.weakAll().length, 0, 'три верных подряд — задание выучено');
});

test('старые записи об ошибках (без даты) не теряются', () => {
  const mem = fakeStorage(), a = createStore(mem);
  a.profile.weak.push({ s: ['exKey', 'a10'], n: 2 });
  a.save();
  assert.deepEqual(createStore(mem).weakList(), [['exKey', 'a10']]);
});

test('цепочка дней: один пропуск за неделю её не рвёт, два подряд — рвут', () => {
  let date = '2026-03-10';
  const s = createStore(fakeStorage(), () => date);
  const play = d => { date = d; s.finishLevel(LEVELS[0], 3); };
  ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-05', '2026-03-06'].forEach(play); // 4-го пропуск
  assert.equal(s.streak(), 5);
  date = '2026-03-07'; assert.equal(s.streak(), 5, 'сегодня ещё не занимался — цепочка цела');
  date = '2026-03-09'; assert.equal(s.streak(), 0, 'два дня без занятий — цепочка начинается заново');
});

test('короткий день: три уровня из разных линий, первым — чтение', () => {
  const s = createStore(fakeStorage(), () => '2026-03-02');
  const lineOf = l => ISLANDS[l.island].line, lines = [];
  for (let i = 0; i < 3; i++) { const l = s.nextForToday(); lines.push(lineOf(l)); assert.ok(s.isOpen(l)); s.finishLevel(l, 3); }
  assert.equal(lines[0], 'R');
  assert.equal(new Set(lines).size, 3, `линии за день: ${lines}`);
  assert.ok(s.dayDone());
});

test('проверка на входе: знакомые уровни отмечаются пройденными, родитель может их вернуть', () => {
  const s = createStore(fakeStorage());
  s.finishLevel(LEVELS[0], 3);
  s.skipLevels(ISLANDS[0].levels.map(l => l.id));
  assert.ok(s.islandDone(ISLANDS[0]));
  assert.equal(s.stars(LEVELS[0].id), 3, 'честно пройденный уровень не тронут');
  s.unskipAll();
  assert.ok(!s.islandDone(ISLANDS[0]));
  assert.equal(s.stars(LEVELS[0].id), 3);
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
