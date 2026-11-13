// ПРОВЕРКА 4. Линия «Пишу ручкой»: образцы письменных букв и задания.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PEN_TASKS, taskStrokes, glyph, hasCapital, layout, slant } from '../app/js/cursive.js';
import { ORDER } from '../app/js/data.js';
import { plainText } from '../app/js/audio.js';

test('заданий не меньше 60: элементы, буквы, соединения, слова, предложения', () => {
  assert.ok(PEN_TASKS.length >= 60, `заданий: ${PEN_TASKS.length}`);
  for (const k of ['element', 'letter', 'join', 'word', 'sent']) assert.ok(PEN_TASKS.some(t => t.kind === k), k);
  assert.equal(new Set(PEN_TASKS.map(t => t.id)).size, PEN_TASKS.length);
});

test('для каждой буквы алфавита нарисована строчная, а где положено — и заглавная', () => {
  for (const L of ORDER) {
    assert.ok(glyph(L.toLowerCase()), `нет строчной ${L}`);
    if (!'ЫЬЪ'.includes(L)) assert.ok(hasCapital(L), `нет заглавной ${L}`);
    assert.ok(glyph(L.toLowerCase()).say.length > 20, `нет объяснения для ${L}`);
  }
});

test('образцы помещаются в линейку, а объяснения годятся для озвучки', () => {
  for (const t of PEN_TASKS) {
    const { strokes, width } = taskStrokes(t);
    assert.ok(strokes.length >= 1 && width > 0, t.title);
    for (const st of strokes) {
      assert.ok(st.length >= 2, `${t.title}: пустой росчерк`);
      for (const [x, y] of slant(st)) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y), t.title);
        assert.ok(y >= -245 && y <= 125, `${t.title}: линия вышла за строку (${y})`);
      }
    }
    assert.ok(t.say && !/[a-z]/i.test(plainText(t.say)) && !/undefined/.test(t.say), t.title);
  }
});

test('буквы в слове соединяются: росчерков меньше, чем если писать их по отдельности', () => {
  const together = layout('ми').strokes.length, apart = layout('м').strokes.length + layout('и').strokes.length;
  assert.equal(together, apart);
  const m = layout('ми').strokes[0], i = layout('ми').strokes[1];
  const end = m[m.length - 1], start = i[0];
  assert.ok(Math.hypot(end[0] - start[0], end[1] - start[1]) < 2, 'конец первой буквы приходит в начало второй');
});
