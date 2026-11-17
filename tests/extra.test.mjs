// ПРОВЕРКА 9. Слияние слогов, диктант на слух, свои слова, магазин, письма от Лумика.
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { LEVELS } from '../app/js/curriculum.js';
import { makeTask, checkTask, syllables } from '../app/js/tasks.js';
import { makeRng } from '../app/js/util.js';
import { MAIL } from '../app/js/mail.js';
import { bareWord } from '../app/js/books.js';
import { stageOf, ORDER } from '../app/js/data.js';
import { toyPrice } from '../app/js/extra.js';
import { lineMask, floodFill, sketch, artMask, ink, examplePool } from '../app/js/photo.js';
import { CRAFTS, craftSVG } from '../app/js/crafts.js';
import { byMonth, monthName } from '../app/js/album.js';

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

// Тестовая картинка: светлый фон с шумом, тёмный круг-«голова» и синий прямоугольник-«одежда».
function scene(w, h) {
  const R = new Float32Array(w * h), G = new Float32Array(w * h), B = new Float32Array(w * h);
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 22;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const head = Math.hypot(x - 160, y - 90) < 60, body = x > 100 && x < 220 && y > 160 && y < 230, i = y * w + x, n = rnd();
    const c = head ? [90, 60, 40] : body ? [50, 90, 200] : [225, 225, 215];
    R[i] = c[0] + n; G[i] = c[1] + n; B[i] = c[2] + n;
  }
  return [R, G, B];
}
test('раскраска из фото: области замкнуты, шум не превращается в линии, чем подробнее — тем не меньше линий', () => {
  const w = 320, h = 240, rgb = scene(w, h);
  for (const level of [0, 1, 2]) {
    const m = lineMask(rgb, w, h, level), share = m.reduce((a, b) => a + b, 0) / m.length;
    assert.ok(share > 0.003 && share < 0.12, `уровень ${level}: линий ${(share * 100).toFixed(1)}%`);
    assert.equal(m[90 * w + 160], 0, 'середина круга чистая');
    assert.equal(m[10 * w + 10], 0, 'фон чистый');
    const inside = floodFill(m, w, h, 160, 90), outside = floodFill(m, w, h, 10, 10), shirt = floodFill(m, w, h, 160, 200);
    assert.equal(inside[10 * w + 10], 0, `уровень ${level}: круг замкнут`);
    assert.equal(outside[90 * w + 160], 0, `уровень ${level}: фон не затекает в круг`);
    assert.equal(shirt[90 * w + 160], 0, `уровень ${level}: одежда отдельно от головы`);
    assert.equal(shirt[10 * w + 10], 0, `уровень ${level}: одежда отдельно от фона`);
    assert.ok(inside.reduce((a, b) => a + b, 0) > 5000, 'круг заливается целиком');
  }
  const flat = [0, 1, 2].map(() => new Float32Array(w * h).fill(128));
  assert.ok(lineMask(flat, w, h, 1).every(v => v === 0), 'ровная картинка — пустой лист');
});
test('раскраска: граница есть и там, где меняется только цвет, а яркость одинаковая', () => {
  const w = 200, h = 120, r = new Float32Array(w * h), g = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const left = i % w < 100; r[i] = left ? 200 : 60; g[i] = left ? 60 : 131; b[i] = 60; }
  const m = lineMask([r, g, b], w, h, 1);
  assert.equal(floodFill(m, w, h, 20, 60)[60 * w + 180], 0, 'две отдельные области');
});
test('заливка: касание по линии закрашивает соседнее место, касание мимо листа ничего не делает', () => {
  const w = 60, h = 40, m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) m[y * w + 30] = 1; // вертикальная линия делит лист пополам
  const left = floodFill(m, w, h, 5, 20);
  assert.equal(left[20 * w + 5], 1); assert.equal(left[20 * w + 50], 0);
  assert.ok(floodFill(m, w, h, 30, 20), 'по линии — ближайшая половина');
  assert.equal(floodFill(m, w, h, -5, 20), null);
});
test('заливка не вытекает через небольшой разрыв в линии', () => {
  const w = 200, h = 120, m = new Uint8Array(w * h);
  for (let x = 40; x <= 160; x++) for (const y of [20, 21, 99, 100]) m[y * w + x] = 1;
  for (let y = 20; y <= 100; y++) for (const x of [40, 41, 159, 160]) if (y < 58 || y > 62) m[y * w + x] = 1; // в боковых стенках — щели по 4 точки
  const inside = floodFill(m, w, h, 100, 60), outside = floodFill(m, w, h, 10, 10);
  assert.equal(inside[60 * w + 100], 1);
  assert.equal(inside[10 * w + 10], 0, 'краска не вышла наружу');
  assert.equal(inside[60 * w + 20], 0, 'и рядом со щелью тоже');
  assert.equal(outside[60 * w + 100], 0, 'фон не затёк внутрь');
});

test('карандашный рисунок: ровное место — чистая бумага, граница — штрих, чем выше уровень — тем темнее', () => {
  const w = 160, h = 100, g = new Float32Array(w * h).fill(210);
  for (let y = 30; y < 70; y++) for (let x = 50; x < 110; x++) g[y * w + x] = 70;
  assert.ok(sketch(new Float32Array(w * h).fill(128), w, h, 1).every(v => v === 0), 'ровная картинка — пустой лист');
  const [a, b, c] = [0, 1, 2].map(l => sketch(g, w, h, l)), edge = 50 * w + 51, far = 8 * w + 8;
  assert.ok(b[edge] > 120, 'у границы тёмный штрих');
  assert.ok(b[far] < 12, 'вдали от границы бумага чистая');
  assert.ok(a[edge] <= b[edge] && b[edge] <= c[edge], 'уровни идут от светлого к тёмному');
});

test('заливка на фото закрашивает и узкую щёлку рядом, а на готовой картинке — нет', () => {
  const w = 120, h = 80, m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { m[y * w + 60] = 1; m[y * w + 64] = 1; } // две линии рядом: между ними щёлка в три точки
  const plain = floodFill(m, w, h, 20, 40), photo = floodFill(m, w, h, 20, 40, 700);
  assert.equal(photo[40 * w + 62], 1, 'щёлка закрашена');
  assert.equal(photo[40 * w + 100], 0, 'соседняя большая область не тронута');
  assert.equal(plain[40 * w + 100], 0);
});

test('рисованная картинка: тёмный контур и граница двух цветов — линии, области замкнуты, двойных линий нет', () => {
  const w = 160, h = 120, R = new Uint8Array(w * h).fill(255), G = new Uint8Array(w * h).fill(255), B = new Uint8Array(w * h).fill(255);
  const put = (i, c) => { R[i] = c[0]; G[i] = c[1]; B[i] = c[2]; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - 60, y - 60), i = y * w + x;
    if (d < 36) put(i, [240, 160, 60]);            // рыжий круг
    if (d >= 36 && d < 40) put(i, [43, 45, 66]);   // тёмный контур вокруг
    if (d >= 35.5 && d < 36) put(i, [140, 100, 63]); // размытый край контура
    if (x > 110 && x < 150 && y > 30 && y < 90) put(i, [250, 230, 200]); // светлый прямоугольник без контура
  }
  const m = artMask([R, G, B], w, h);
  assert.equal(m[60 * w + 60], 0, 'середина круга чистая');
  assert.equal(m[60 * w + 98], 1, 'контур — линия');
  assert.equal(m[60 * w + 110], 1, 'граница двух светлых цветов — линия');
  assert.equal(floodFill(m, w, h, 60, 60)[5 * w + 5], 0, 'круг замкнут');
  assert.equal(floodFill(m, w, h, 130, 60)[5 * w + 5], 0, 'прямоугольник замкнут');
  let runs = 0; for (let x = 61; x < 108; x++) if (m[60 * w + x] && !m[60 * w + x - 1]) runs++;
  assert.equal(runs, 1, 'от середины круга до фона — одна линия, а не две');
});

test('рисованная картинка: большое тёмное пятно остаётся контуром с раскрашиваемой серединой, а тонкая линия — линией', () => {
  const w = 200, h = 140, R = new Uint8Array(w * h).fill(255), G = new Uint8Array(w * h).fill(255), B = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (Math.hypot(x - 60, y - 70) < 40 || (y > 68 && y < 73 && x > 120 && x < 190)) { R[i] = 43; G[i] = 45; B[i] = 66; } // чёрный круг и тонкая чёрная полоска
  }
  const m = artMask([R, G, B], w, h);
  assert.equal(m[70 * w + 60], 0, 'середину чёрного круга можно красить');
  assert.equal(m[70 * w + 22], 1, 'край круга — линия');
  assert.equal(m[70 * w + 150], 1, 'тонкая полоска осталась линией');
  const inside = floodFill(m, w, h, 60, 70);
  assert.equal(inside[5 * w + 5], 0, 'круг замкнут');
});

test('раскраска по примерам: каждый пример действительно даёт ответ своей краски', () => {
  const r = makeRng(11);
  for (const kind of ['a5', 'am10', 'am20n']) {
    const pool = examplePool(kind, r);
    assert.ok(pool.size >= 3, `${kind}: разных ответов ${pool.size}`);
    for (const [answer, list] of pool) for (const text of list) {
      const m = /^(\d+)([+−])(\d+)$/.exec(text);
      assert.ok(m, `непонятный пример ${text}`);
      assert.equal(m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3], answer, `${text} ≠ ${answer}`);
    }
  }
});
test('жирные контуры из фото: граница — сплошная линия, ровные места чистые, шум не превращается в линии', () => {
  const w = 240, h = 180, g = new Float32Array(w * h);
  let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 16;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = (Math.hypot(x - 120, y - 90) < 55 ? 80 : 215) + rnd();
  for (const level of [0, 1, 2]) {
    const m = ink(g, w, h, level), share = m.reduce((a, b) => a + b, 0) / m.length;
    assert.ok(share > 0.01 && share < 0.3, `уровень ${level}: линий ${(share * 100).toFixed(1)}%`);
    assert.equal(m[10 * w + 10], 0, 'фон чистый');
    assert.ok(m.every(v => v === 0 || v === 1), 'только чёрное и белое, без полутонов');
    let hit = 0; for (let x = 120; x < 200; x++) hit += m[90 * w + x];
    assert.ok(hit >= 2, 'край круга — линия');
  }
  assert.ok(ink(new Float32Array(w * h).fill(128), w, h, 1).every(v => v === 0), 'ровная картинка — пустой лист');
});
test('поделки: четыре штуки, у каждой не меньше пяти деталей', () => {
  assert.deepEqual(CRAFTS.map(c => c[0]), ['rocket', 'mask', 'kite', 'dino']);
  for (const [key, parts] of CRAFTS) { assert.ok(parts.length >= 5, key); assert.ok(craftSVG(key).startsWith('<svg') && craftSVG(key).includes(parts[0])); }
});
test('альбом по месяцам: свежие месяцы и рисунки первыми', () => {
  const list = [{ id: 'a', d: '2026-09-30' }, { id: 'b', d: '2026-11-02' }, { id: 'c', d: '2026-11-15' }, { id: 'd', d: '2027-01-01' }];
  const m = byMonth(list);
  assert.deepEqual(m.map(x => x[0]), ['2027-01', '2026-11', '2026-09']);
  assert.deepEqual(m[1][1].map(x => x.id), ['c', 'b']);
  assert.equal(monthName('2026-11'), 'ноябрь 2026');
});

test('на экране не появляется слово «null»: пустые места не попадают в список того, что показать', () => {
  const dir = new URL('../app/js/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const text = readFileSync(new URL(f, dir), 'utf8');
    let i = 0;
    while ((i = text.indexOf('replaceChildren(', i)) >= 0) {
      let depth = 0, j = i + 15;
      for (; j < text.length; j++) { if (text[j] === '(') depth++; else if (text[j] === ')' && !--depth) break; }
      const call = text.slice(i, j + 1);
      assert.ok(!/: null|petImg\(/.test(call) || /filter\(/.test(call), `${f}: ${call.slice(0, 80)}`);
      i = j;
    }
  }
});
