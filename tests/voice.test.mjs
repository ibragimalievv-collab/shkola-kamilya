// ПРОВЕРКА 5. Голос: фразы делятся на кусочки, и для каждого кусочка есть готовая запись.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { pieces, plainText, hash } from '../app/js/speech.js';
import { PRAISE, HINTS, REVEAL, allPhrases } from '../app/js/phrases.js';
import { collect } from '../tools/voice/collect.mjs';
import { ISLANDS } from '../app/js/curriculum.js';

const AUDIO = new URL('../app/audio/', import.meta.url);

test('числа произносятся отдельно и согласуются по роду', () => {
  const t = s => pieces(s).map(p => p.text);
  assert.deepEqual(t('Сколько будет 9 минус 5?'), ['Сколько будет', '9', 'минус', '5']);
  assert.deepEqual(t('Зверёк хочет 1 ягодку.'), ['Зверёк хочет', 'одну', 'ягодку.']);
  assert.deepEqual(t('На рисунке 1 звезда.'), ['На рисунке', 'одна', 'звезда.']);
  assert.deepEqual(t('На рисунке 1 яблоко.'), ['На рисунке', 'одно', 'яблоко.']);
  assert.deepEqual(t('Тут 2 тарелки и 2 шарика.'), ['Тут', 'две', 'тарелки и', '2', 'шарика.']);
});

test('буквы, слоги и слова — отдельные кусочки с пометкой', () => {
  const p = pieces('Поймай всех рыбок с буквой {б:М|«эм»}.');
  assert.equal(p[0].text, 'Поймай всех рыбок с буквой');
  assert.equal(p[1].key, 'б:М');
  assert.equal(plainText('Собери слог {с:МА|«ма»}.'), 'Собери слог ма.');
});

test('отпечаток одинаков для одинакового текста и разный для разного', () => {
  assert.equal(hash('мама'), hash('мама'));
  assert.notEqual(hash('мама'), hash('папа'));
  const ids = new Set(); let n = 0;
  for (const m of collect(30).values()) for (const p of m.values()) { ids.add(p.id); n++; }
  assert.equal(ids.size, n, 'у разных кусочков отпечатки не совпадают');
});

test('похвалы и подсказок не меньше 15 вариантов, без повторов', () => {
  for (const list of [PRAISE, HINTS]) { assert.ok(list.length >= 15); assert.equal(new Set(list).size, list.length); }
  assert.ok(REVEAL.length >= 3);
});

test('для всех фраз приложения есть готовые записи', { skip: !existsSync(new URL('manifest.json', AUDIO)) && 'озвучка ещё не сделана' }, () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', AUDIO), 'utf8'));
  const have = new Set();
  for (const [name, pack] of Object.entries(manifest.packs)) {
    const size = statSync(new URL(pack.file, AUDIO)).size;
    for (const [id, off, len] of pack.items) { have.add(id); assert.ok(len > 200 && off + len <= size, `${name}: запись выходит за файл`); }
  }
  let all = 0, miss = [];
  const need = p => { all++; if (!have.has(p.id)) miss.push(p.text); };
  for (const m of collect(120).values()) for (const p of m.values()) need(p);
  for (const text of allPhrases(manifest.names, ISLANDS.map(i => i.sticker), ISLANDS.map(i => i.title))) pieces(text).forEach(need);
  assert.ok(miss.length / all < 0.005, `без записи: ${miss.length} из ${all}, например: ${miss.slice(0, 5).join(' | ')}`);
});
