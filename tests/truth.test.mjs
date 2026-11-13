// ПРОВЕРКА 8. «Одна таблица правды»: слово, картинка и запись голоса всегда из одного справочника,
// ответы посчитаны верно, правильный ответ один. Если что-то из этого нарушено — приложение не публикуется.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { THINGS, picOf } from '../app/js/things.js';
import { WORDS, OBJECTS, VOWELS } from '../app/js/data.js';
import { LEVELS } from '../app/js/curriculum.js';
import { makeTask, example, alike } from '../app/js/tasks.js';
import { hash, plainText } from '../app/js/speech.js';
import { makeRng } from '../app/js/util.js';

const eachTask = (seeds, fn) => { for (const L of LEVELS) for (let seed = 1; seed <= seeds; seed++) { const r = makeRng(seed * 15485863 + L.k * 7 + L.island); for (const src of L.tasks) fn(makeTask(src, r), src, L); } };
const norm = s => s.toLowerCase().replace(/ё/g, 'е');

test('справочник: у каждого предмета одна картинка и одно название', () => {
  assert.equal(new Set(THINGS.map(t => t.name)).size, THINGS.length, 'название повторяется');
  assert.equal(new Set(THINGS.map(t => t.pic)).size, THINGS.length, 'одна картинка у двух предметов');
  for (const t of THINGS) {
    assert.ok(t.pic && t.name && /^[а-яё]+$/.test(t.name), JSON.stringify(t));
    // формы для задач — это то же слово или его ласковая форма (шар — шарик), а не другое слово
    for (const f of [...(t.forms || []), ...(t.paint || [])]) assert.equal(norm(f).slice(0, 3), norm(t.forms?.[0] || t.name).slice(0, 3), `${t.name}: чужая форма «${f}»`);
    if (t.forms) assert.equal(norm(t.forms[0]).slice(0, 2), norm(t.name).slice(0, 2), `${t.name}: формы от другого слова`);
  }
});

test('слова в уроках и предметы в задачах берут картинку только из справочника', () => {
  for (const w of WORDS) assert.equal(w.e, picOf(w.w), w.w);
  for (const o of Object.values(OBJECTS)) assert.ok(THINGS.some(t => t.pic === o[3] && t.forms?.[0] === o[0]));
  // в файлах с уроками и заданиями название предмета не вписано рядом с картинкой
  for (const file of ['tasks.js', 'curriculum.js', 'data.js']) {
    const src = readFileSync(new URL('../app/js/' + file, import.meta.url), 'utf8').replace(/SEASON_PIC = .*/, '').replace(/const ALIKE = .*/, '');
    const hit = /'[а-яё]{3,}'\s*,\s*'\p{Extended_Pictographic}/u.exec(src) || /[а-яё]{3,}:\p{Extended_Pictographic}/u.exec(src);
    assert.ok(!hit, `${file}: название вписано рядом с картинкой вне справочника: ${hit?.[0]}`);
  }
});

test('у каждого предмета есть запись голоса', { skip: !existsSync(new URL('../app/audio/manifest.json', import.meta.url)) && 'озвучка не собрана' }, () => {
  const m = JSON.parse(readFileSync(new URL('../app/audio/manifest.json', import.meta.url), 'utf8')), have = new Set();
  for (const p of Object.values(m.packs)) for (const [id] of p.items) have.add(id);
  const voiced = w => have.has('t-' + hash('ш:' + w)) || have.has(hash(w)) || have.has(hash(w + '.'));
  const missing = THINGS.filter(t => !voiced(t.name) && !(t.forms && voiced(t.forms[0]))).map(t => t.name);
  assert.deepEqual(missing, [], `нет записи голоса для: ${missing.join(', ')}`);
});

test('в задании звучит то же слово, что на картинке', () => {
  const stems = t => [t.name, ...(t.forms || []), ...(t.paint || [])].map(x => norm(x).slice(0, 4));
  const all = [...new Set(THINGS.filter(t => t.forms).flatMap(stems))];
  const re = new RegExp(`(^|[^а-яе])(${all.join('|')})[а-яе]*`, 'g');
  let n = 0;
  eachTask(30, (t, src) => {
    const pic = t.emoji || t.food || t.obj?.[3] || t.pic?.e || t.groups?.e;
    if (!pic) return;
    const thing = THINGS.find(x => x.pic === pic);
    assert.ok(thing, `${JSON.stringify(src)}: картинка ${pic} не из справочника`);
    const text = norm([t.say, t.ask, t.text, typeof t.q === 'function' ? t.q(3) : ''].filter(x => typeof x === 'string').map(plainText).join(' ')).replace(/маш[аи]/g, ''); // Маша — это имя девочки, а не машина
    for (const mm of text.matchAll(re)) assert.ok(stems(thing).includes(mm[2]), `${JSON.stringify(src)}: на картинке ${pic} (${thing.name}), а сказано «${mm[0].trim()}»`);
    n++;
  });
  assert.ok(n > 1500);
});

test('все примеры посчитаны верно', () => {
  const calc = s => { const m = /^(\d+) ([+−×÷]) (\d+)/.exec(s), a = +m[1], b = +m[3]; return m[2] === '+' ? a + b : m[2] === '−' ? a - b : m[2] === '×' ? a * b : a / b; };
  const r = makeRng(77);
  for (const k of ['a5', 'a10', 'p1', 's5', 's10', 'am10', 'c10', 't10', 'st10', 'a20n', 's20n', 'am20n', 'c9', 'c8', 'c76', 'a20c', 'sc12', 'sc15', 'sc18', 's20c', 'am20', 'tens+', 'tens-', 'u+', 'u-', 'd+', 'd-', 'dd+', 'dd-', 'am100', 'x2', 'x3', 'x4', 'x5', 'x2a', 'x3b', 'x4c', 'x23', 'x45', 'xall', 'd2', 'd3', 'd4', 'd5', 'd23', 'd45', 'dall'])
    for (let i = 0; i < 400; i++) { const e = example(k, r); assert.equal(e.res, calc(e.text), `${k}: ${e.text}`); assert.ok(Number.isInteger(e.res) && e.res >= 0 && e.res <= 100, `${k}: ${e.text} = ${e.res}`); }
  eachTask(25, (t, src) => {
    if (t.m === 'keypad' && /^\d+ [+−×÷] \d+ =$/.test(t.text)) assert.equal(t.a, calc(t.text), `${JSON.stringify(src)}: ${t.text}`);
    if (t.m === 'problem') { assert.equal(calc(t.expr), t.a, t.expr); assert.equal(+t.expr.split('= ')[1], t.a, t.expr); const nums = (t.text.match(/\d+/g) || []).map(Number).sort(), ex = [+t.expr.split(' ')[0], +t.expr.split(' ')[2]].sort(); assert.deepEqual(nums, ex, `числа в задаче и в решении разные: ${t.text} / ${t.expr}`); }
    if (t.m === 'truefalse' && /^\d+ [+−×÷] \d+ = \d+$/.test(t.text)) assert.equal(t.a, calc(t.text) === +t.text.split('= ')[1], t.text);
    if (t.m === 'numline') assert.equal(t.to, calc(t.text), t.text);
    if (t.m === 'house') assert.equal(+t.opts[t.a] + t.x, t.n);
    if (t.m === 'count') assert.equal(+t.opts[t.a], t.n);
    if (t.m === 'missing' && t.cells.includes('=')) { const c = t.cells.map(x => (x === '_' ? t.opts[t.a] : x)); assert.equal(calc(`${c[0]} ${c[1]} ${c[2]}`), +c[4], c.join(' ')); }
    if (t.m === 'groups' && t.ask === 'total') assert.equal(+t.opts[t.a], t.counts.reduce((a, b) => a + b, 0));
    if (t.m === 'pairs' || t.m === 'memory') for (const [a, b] of t.pairs) if (typeof a === 'string' && /^\d+ [+−×÷] \d+$/.test(a)) assert.equal(calc(a), +b, a);
  });
});

test('правильный ответ один: нет двух подходящих вариантов', () => {
  eachTask(25, (t, src) => {
    const pics = (t.opts || []).map(o => (typeof o === 'object' ? o.t : o)).filter(o => /\p{Extended_Pictographic}/u.test(o) && [...o].length <= 3);
    for (let i = 0; i < pics.length; i++) for (let j = i + 1; j < pics.length; j++) assert.ok(!alike(pics[i], pics[j]), `${JSON.stringify(src)}: похожие картинки среди вариантов: ${pics[i]} и ${pics[j]}`);
    if (t.m === 'pairs' || t.m === 'memory') { const ps = t.pairs.map(p => (typeof p[1] === 'object' ? p[1].t : p[1])).filter(x => [...String(x)].length <= 3); for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(!alike(ps[i], ps[j]), `${JSON.stringify(src)}: похожие картинки в парах: ${ps[i]} и ${ps[j]}`); }
    if (t.show?.text && / \? /.test(t.show.text)) { // «5 ? 2 = 7» — подходит ровно один знак
      const [a, , b, , res] = t.show.text.split(' ').map(Number);
      const fits = t.opts.filter(op => (op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b) === res);
      assert.equal(fits.length, 1, `${t.show.text}: подходят знаки ${fits.join(' и ')}`);
    }
  });
});

test('слово подходит к заданию: первая буква, число слогов, одна гласная в слоге', () => {
  const vowels = w => [...w.toUpperCase()].filter(ch => VOWELS.includes(ch)).length;
  for (const w of WORDS) { assert.equal(w.syl.length, vowels(w.w), `${w.w}: слогов ${w.syl.length}, гласных ${vowels(w.w)}`); for (const s of w.syl) assert.equal(vowels(s), 1, `${w.w}: слог «${s}»`); }
  eachTask(20, (t, src) => {
    if (src[0] === 'first' && t.show?.big) { const w = WORDS.find(x => x.e === t.show.big); assert.equal(w.w[0].toUpperCase(), t.opts[t.a], `${w.w}: первая буква`); assert.ok(t.say.includes(w.w), 'звучит то же слово, что на картинке'); }
    if (t.m === 'claps') { const w = WORDS.find(x => x.e === t.pic); assert.equal(t.n, w.syl.length); assert.ok(t.say.includes(w.w)); }
    if ((src[0] === 'buildW' || src[0] === 'dictW' || src[0] === 'missing' || src[0] === 'dictT') && t.pic) { const w = WORDS.find(x => x.e === t.pic); assert.ok(w && t.say.includes(w.w), `${JSON.stringify(src)}: картинка ${t.pic} и слово в задании расходятся`); }
  });
});
