import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesCopy, makeCoverage } from '../app/js/canvas.js';

function sample(strokes) {
  return strokes.flatMap(path => path.flatMap(([x, y], i) => {
    if (!i) return [[x, y]];
    const [px, py] = path[i - 1];
    const n = Math.ceil(Math.hypot(x - px, y - py) / 3);
    return Array.from({ length: n }, (_, j) => [px + (x - px) * (j + 1) / n, py + (y - py) * (j + 1) / n]);
  }));
}
const letterA = [[[5, 90], [45, 5], [85, 90]], [[22, 55], [69, 55]]];
const target = { pts: sample(letterA), R: 7, need: 0.82 };
const writing = strokes => strokes.map(pts => ({ pts }));

test('написание буквы: засчитывается образец другого размера, произвольная длинная черта не засчитывается', () => {
  const child = letterA.map(line => line.map(([x, y]) => [100 + x * 0.85, 38 + y]));
  assert.equal(matchesCopy(writing(child), target), true);
  for (const strokes of [[], [[[45, 5]]], [[[5, 80], [450, 80]]], [[[2, 2], [380, 380]]]]) {
    assert.equal(matchesCopy(writing(strokes), target), false);
  }
});

test('поле, покрытое штриховкой, и рукопись с пропущенной буквой не проходят', () => {
  const hatch = Array.from({ length: 22 }, (_, i) => [[5, 5 + i * 4], [85, 5 + i * 4]]);
  assert.equal(matchesCopy(writing(hatch), target), false);
  const word = [0, 1, 2, 3, 4].map(i => letterA.map(line => line.map(([x, y]) => [x + 100 * i, y])));
  const expected = { ...target, pts: word.flatMap(sample), groups: word.flatMap((letter, i) => sample(letter).map(() => i)) };
  assert.equal(matchesCopy(writing(word.flat()), expected), true);
  assert.equal(matchesCopy(writing(word.filter((_, i) => i !== 2).flat()), expected), false);
});

test('обводка: быстрый штрих проходит между событиями касания, посторонние линии и стирание учитываются', () => {
  const path = [[10, 10], [290, 10]];
  const coverage = makeCoverage({ pts: sample([path]), R: 10, need: 0.9, precision: 0.82 });
  coverage.add(path[0]);
  coverage.add(path[1], path[0]);
  assert.equal(coverage.complete, true);
  coverage.add([0, 80]); coverage.add([300, 80], [0, 80]);
  assert.equal(coverage.complete, false);
  coverage.reset();
  assert.equal(coverage.ratio, 0);
  assert.equal(coverage.complete, false);
});
