// ПРОВЕРКА 1. Программа и прохождение уровней: каждый уровень собирается, каждое задание решаемо.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ISLANDS, LEVELS } from '../app/js/curriculum.js';
import { makeTask, buildSession, checkTask, MECHANICS, lineOf, labelOf } from '../app/js/tasks.js';
import { plainText } from '../app/js/audio.js';
import { makeRng } from '../app/js/util.js';

test('в программе не меньше 300 уровней по четырём линиям', () => {
  assert.ok(LEVELS.length >= 300, `уровней: ${LEVELS.length}`);
  assert.deepEqual([...new Set(ISLANDS.map(i => i.line))].sort(), ['M', 'R', 'W', 'X']);
});

test('на каждом острове 8–12 уровней, соседние острова — из разных линий', () => {
  ISLANDS.forEach((isl, i) => {
    assert.ok(isl.levels.length >= 8 && isl.levels.length <= 12, `${isl.title}: ${isl.levels.length}`);
    if (i) assert.notEqual(isl.line, ISLANDS[i - 1].line, `два острова одной линии подряд: ${isl.title}`);
    assert.ok(isl.sticker && isl.can && isl.topic);
  });
  assert.equal(new Set(ISLANDS.map(i => i.sticker)).size, ISLANDS.length, 'наклейки не повторяются');
});

test('у каждого уровня есть название, цель, текст объяснения и 6–8 заданий', () => {
  for (const L of LEVELS) {
    assert.ok(L.title && L.goal && L.intro, L.id);
    assert.ok(L.tasks.length >= 6 && L.tasks.length <= 8, `${L.id}: заданий ${L.tasks.length}`);
    assert.ok(!/[a-z]/i.test(plainText(L.intro)) && !/undefined|NaN/.test(L.intro), `${L.id}: ${L.intro}`);
  }
  assert.equal(new Set(LEVELS.map(l => l.id)).size, LEVELS.length);
});

test('на островах есть уровни-повторения', () => {
  for (const isl of ISLANDS) assert.ok(isl.levels.filter(l => l.review).length >= 2, isl.title);
});

test('каждое задание каждого уровня собирается и проходит проверку (много случайных вариантов)', () => {
  const used = new Set();
  let n = 0;
  for (const L of LEVELS) {
    for (let seed = 1; seed <= 30; seed++) {
      const r = makeRng(seed * 7919 + n);
      for (const src of L.tasks) {
        const t = makeTask(src, r);
        checkTask(t);
        assert.ok(lineOf(src) && labelOf(src), `нет подписи для родителей: ${src[0]}`);
        used.add(t.m);
        n++;
      }
    }
  }
  assert.ok(used.size >= 25, `игровых механик в деле: ${used.size}`);
  for (const m of used) assert.ok(MECHANICS.includes(m));
});

test('занятие длится 6–10 заданий и возвращает то, в чём ребёнок ошибался', () => {
  const weak = [['listenL', 'М', 5], ['exKey', 'a10'], ['house', 7, 7]];
  for (const L of LEVELS) {
    const s = buildSession(L, weak, makeRng(42));
    assert.ok(s.length >= 6 && s.length <= 10, `${L.id}: ${s.length}`);
    assert.ok(s.some(t => t.fromWeak), `${L.id}: нет заданий на повторение ошибок`);
    s.forEach(checkTask);
  }
});

test('в одном занятии задания не повторяются слово в слово', () => {
  let dup = 0, all = 0;
  for (const L of LEVELS) {
    const keys = buildSession(L, [], makeRng(7)).map(t => t.key).filter(Boolean);
    dup += keys.length - new Set(keys).size; all += keys.length;
  }
  assert.ok(dup / all < 0.02, `повторов: ${dup} из ${all}`);
});
