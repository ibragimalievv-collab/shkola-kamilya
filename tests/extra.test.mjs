// ПРОВЕРКА 9. Слияние слогов, диктант на слух, свои слова, магазин, письма от Лумика.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../app/js/curriculum.js';
import { makeTask, checkTask, syllables } from '../app/js/tasks.js';
import { makeRng } from '../app/js/util.js';
import { MAIL } from '../app/js/mail.js';
import { bareWord } from '../app/js/books.js';
import { stageOf, ORDER } from '../app/js/data.js';
import { toyPrice } from '../app/js/extra.js';
import { contours } from '../app/js/photo.js';

test('слияние: для каждого слога верный ответ — этот слог, и он один', () => {
  const r = makeRng(5);
  for (const syl of syllables(33)) for (let i = 0; i < 3; i++) {
    const t = makeTask(['blend', syl, 33], r);
    checkTask(t);
    assert.equal(t.opts[t.a], syl);
    assert.equal(t.opts.filter(o => o === syl).length, 1);
    assert.ok(t.whole.includes(`{с:${syl}|`), 'в конце звучит сам слог');
  }
});

test('слияние и диктант на слух есть в уровнях', () => {
  const all = LEVELS.flatMap(l => l.tasks.map(s => s[0]));
  assert.ok(all.filter(n => n === 'blend').length >= 30, 'слияние слогов');
  assert.ok(all.filter(n => n === 'hearW').length >= 5, 'диктант на слух');
});

test('диктант на слух: картинки-подсказки нет, слово набирается целиком', () => {
  const r = makeRng(9);
  for (let i = 0; i < 200; i++) {
    const t = makeTask(['hearW', 33, i % 2 ? 'short' : 'mid'], r);
    checkTask(t);
    assert.ok(!t.pic && t.hear);
    assert.ok(t.say.includes(`{ш:${t.target.join('').toLowerCase()}|`), 'звучит то же слово, что нужно набрать');
    assert.ok(t.extra.every(x => !t.target.includes(x)), 'лишние буквы не совпадают с нужными');
  }
});

test('свои слова семьи: найти и набрать', () => {
  const r = makeRng(3);
  for (const w of ['Амина', 'папа', 'Барсик', 'Ёж']) for (let i = 0; i < 20; i++) {
    const a = makeTask(['famW', w, 'pick', ['Катя', 'мама']], r), b = makeTask(['famW', w, 'build'], r);
    checkTask(a); checkTask(b);
    assert.equal(a.opts[a.a], w.toUpperCase());
    assert.equal(b.target.join(''), w.toUpperCase());
  }
});

test('магазин: цены в пределах, монеток хватает, сдача посчитана верно', () => {
  const r = makeRng(1);
  for (const cap of [10, 20, 50]) for (let round = 0; round < 6; round++) for (let i = 0; i < 12; i++) {
    const price = toyPrice(i, round, cap);
    assert.ok(price >= 2 && price <= cap, `цена ${price} при пределе ${cap}`);
    const buy = makeTask(['shopBuy', price, '🧸'], r), have = [10, 20, 50, 100].find(v => v > price), ch = makeTask(['changeBuy', price, have], r);
    checkTask(buy); checkTask(ch);
    assert.ok(buy.coins.includes(1), 'любую цену можно набрать');
    assert.equal(ch.a, have - price);
    assert.ok(ch.a > 0);
  }
});

test('письма от Лумика: не меньше 12, от простых к сложным, только знакомые буквы', () => {
  assert.ok(MAIL.length >= 12);
  let prev = 0;
  for (const [stage, stamp, lines] of MAIL) {
    assert.ok(stage >= prev && stage >= 10); prev = stage;
    assert.ok(stamp && lines.length >= 3 && lines.length <= 5);
    for (const line of lines) {
      const need = stageOf(line);
      assert.ok(need <= stage, `«${line}» — нужна буква ${ORDER[need - 1]}, а пройдено только ${stage} букв`);
      for (const w of line.split(' ')) assert.ok(bareWord(w).length > 0 || /^[—–-]$/.test(w), `странное слово «${w}»`);
    }
  }
});

test('раскраска из фото: линии только на границах, ровные места остаются чистыми', () => {
  const w = 120, h = 90, gray = new Uint8Array(w * h).fill(230);
  for (let y = 25; y < 65; y++) for (let x = 35; x < 85; x++) gray[y * w + x] = 60; // тёмный прямоугольник на светлом фоне
  const a = contours(gray, w, h), at = (x, y) => a[y * w + x];
  assert.ok(at(35, 45) > 200 && at(85, 45) > 200 && at(60, 25) > 200 && at(60, 65) > 200, 'границы прямоугольника — линии');
  assert.equal(at(60, 45), 0, 'середина прямоугольника чистая');
  assert.equal(at(8, 8), 0, 'фон чистый');
  const lines = a.filter(v => v > 128).length / a.length;
  assert.ok(lines > 0.01 && lines < 0.3, `линий ${Math.round(lines * 100)}% — раскраску можно раскрашивать`);
  // совсем ровная картинка — пустой лист, без мусора
  assert.ok(contours(new Uint8Array(w * h).fill(128), w, h).every(v => v === 0));
});
