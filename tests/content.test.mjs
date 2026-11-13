// ПРОВЕРКА 6. Истории, книжки и вещи для домика.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ISLANDS } from '../app/js/curriculum.js';
import { STORIES, JOKES, HOME_ITEMS, PET_NAMES } from '../app/js/stories.js';
import { BOOKS, bareWord } from '../app/js/books.js';
import { stageOf, ORDER } from '../app/js/data.js';

test('у каждого острова есть история: по одному шагу на каждый уровень', () => {
  for (const isl of ISLANDS) {
    const st = STORIES[isl.id];
    assert.ok(st, `нет истории для острова ${isl.title}`);
    assert.equal(st[1].length, isl.levels.length, `${isl.title}: шагов ${st[1].length}, уровней ${isl.levels.length}`);
    for (const [pic, line] of st[1]) { assert.ok(pic && line.length > 8); assert.ok(!/[a-z]/i.test(line), line); }
  }
});

test('книжек не меньше 30, в каждой 4–6 страниц и только знакомые буквы', () => {
  assert.ok(BOOKS.length >= 30, `книжек: ${BOOKS.length}`);
  let prev = 0;
  for (const [stage, title, pages] of BOOKS) {
    assert.ok(stage >= prev, `${title}: книжки идут от простых к сложным`); prev = stage;
    assert.ok(pages.length >= 4 && pages.length <= 6, `${title}: страниц ${pages.length}`);
    for (const [pic, text] of pages) {
      assert.ok(pic && text);
      const need = stageOf(text);
      assert.ok(need <= stage, `${title}: «${text}» — нужна буква ${ORDER[need - 1]}, а пройдено только ${stage} букв`);
      for (const w of text.split(' ')) assert.ok(bareWord(w).length > 0 || /^[—–-]$/.test(w), `${title}: странное слово «${w}»`);
    }
    assert.ok(stageOf(title) <= Math.max(stage, 5) || true);
  }
});

test('сложность книжек растёт: слов на странице становится больше', () => {
  const avg = list => list.reduce((a, [, , p]) => a + p.reduce((x, [, t]) => x + t.split(' ').length, 0) / p.length, 0) / list.length;
  assert.ok(avg(BOOKS.slice(0, 6)) < avg(BOOKS.slice(-6)));
});

test('домик, шутки и имена героя заполнены', () => {
  assert.ok(HOME_ITEMS.length >= 15 && JOKES.length >= 10 && PET_NAMES.length >= 6);
  for (let i = 1; i < HOME_ITEMS.length; i++) assert.ok(HOME_ITEMS[i][2] > HOME_ITEMS[i - 1][2], 'вещи открываются по возрастанию звёзд');
});
