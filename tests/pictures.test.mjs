// ПРОВЕРКА 7. Слово и картинка совпадают: ребёнок не должен выучить ничего неправильно.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../app/js/curriculum.js';
import { makeTask } from '../app/js/tasks.js';
import { plainText } from '../app/js/speech.js';
import { makeRng } from '../app/js/util.js';
import { allPairs } from '../tools/pairs.mjs';

// Какое слово должно звучать, когда на экране эта картинка (начало слова).
const NAME = { '🍎': 'яблок', '🍬': 'конфет', '🎈': 'шарик', '🚗': 'машин', '🌰': 'орех', '🍐': 'груш', '🐠': 'рыб', '⛵': 'корабл', '🐚': 'ракуш',
  '🌼': 'цвет', '🍄': 'гриб', '🐦': 'птич', '⭐': 'зв[её]зд', '🍪': 'печень', '🥕': 'морков', '🍓': 'ягод', '🍒': 'ягод' };
const anyName = new RegExp(`(^|[^а-яё])(${[...new Set(Object.values(NAME))].join('|')})`, 'gi');

test('в заданиях с картинками звучит именно то слово, что нарисовано', () => {
  let checked = 0;
  for (const L of LEVELS) for (let seed = 1; seed <= 40; seed++) {
    const r = makeRng(seed * 104729 + L.k);
    for (const src of L.tasks) {
      const t = makeTask(src, r), pic = t.emoji || t.food || t.obj?.[3] || t.pic?.e || t.groups?.e;
      if (!pic) continue;
      const texts = [t.say, t.ask, t.text, t.q?.call ? t.q(3) : null].filter(x => typeof x === 'string').map(plainText).join(' ');
      const said = [...texts.matchAll(anyName)].map(m => m[2].toLowerCase());
      if (!said.length) continue; // в задании предмет не называется — ошибиться не в чем
      assert.ok(NAME[pic], `${JSON.stringify(src)}: картинка ${pic} без проверенного названия`);
      for (const word of said) assert.match(word, new RegExp('^' + NAME[pic], 'i'), `${JSON.stringify(src)}: на картинке ${pic}, а сказано «${word}…»: ${texts.slice(0, 90)}`);
      checked++;
    }
  }
  assert.ok(checked > 2000, `проверено заданий с картинками: ${checked}`);
});

test('игра «Накорми зверя» показывает только ягоды, раз говорит «ягодок»', () => {
  const r = makeRng(1);
  for (let i = 0; i < 200; i++) assert.ok(['🍓', '🍒'].includes(makeTask(['feed', 1, 9], r).food));
});

test('в игру на счёт не подставляется посторонняя картинка', () => {
  const src = readFileSync(new URL('../app/js/mechanics.js', import.meta.url), 'utf8');
  const count = src.slice(src.indexOf('function count('), src.indexOf('function feed('));
  assert.ok(!count.includes('myPic'), 'в счёте должна быть только картинка, названная в задании');
});

test('опись пар «слово — картинка» не менялась без просмотра глазами', () => {
  const saved = JSON.parse(readFileSync(new URL('./pairs.json', import.meta.url), 'utf8')), now = allPairs();
  const diff = [...new Set([...Object.keys(saved), ...Object.keys(now)])].filter(k => saved[k] !== now[k]);
  assert.equal(diff.length, 0, `изменились пары: ${diff.slice(0, 8).map(k => `${k} ${saved[k] || '—'} → ${now[k] || '—'}`).join('; ')}. Просмотрите их и выполните: npm run pairs`);
});

test('у одной картинки — одно слово: две разные вещи не изображаются одинаково', () => {
  const byPic = {};
  for (const [k, e] of Object.entries(allPairs())) if (k.startsWith('слово: ')) (byPic[e] ||= []).push(k.slice(7));
  const twice = Object.entries(byPic).filter(([, w]) => w.length > 1);
  assert.equal(twice.length, 0, `одна картинка на разные слова: ${twice.map(([e, w]) => `${e} ${w.join('/')}`).join('; ')}`);
});
