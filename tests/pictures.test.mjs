// ПРОВЕРКА 7. Слово и картинка совпадают: ребёнок не должен выучить ничего неправильно.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeTask } from '../app/js/tasks.js';
import { plainText } from '../app/js/speech.js';
import { makeRng } from '../app/js/util.js';
import { allPairs } from '../tools/pairs.mjs';

test('игра «Накорми зверя» показывает яблоки и говорит про яблоки', () => {
  const r = makeRng(1);
  for (let i = 0; i < 200; i++) { const t = makeTask(['feed', 1, 9], r); assert.equal(t.food, '🍎'); assert.match(plainText(t.say), /яблок/); }
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
