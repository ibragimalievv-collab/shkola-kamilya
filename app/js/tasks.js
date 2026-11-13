// ГЕНЕРАТОРЫ ЗАДАНИЙ.
// Уровень хранит только «рецепты» заданий — короткие списки вида ['bubL', 'М', 4].
// Здесь по рецепту строится готовое задание: что сказать голосом, что показать, какой ответ верный.
// Файл не трогает экран, поэтому его можно проверять автоматически.

import { ORDER, VOWELS, LETTERS, WORDS, SENTS, FACTS, TEXTS_SHORT, TEXTS_LONG, WRITE_SENTS, DRAWS, OBJECTS, KIDS } from './data.js';
import { rint, pickR, shuffle, sample, range, uniq, pl } from './util.js';
import { THINGS, picOf } from './things.js';

// ---------- помощники для букв ----------
const known = s => ORDER.slice(0, Math.max(s, 1)).split('');
const nm = L => LETTERS[L.toUpperCase()][0];
const special = L => 'ЬЪ'.includes(L.toUpperCase());
// «букву эм» / «мягкий знак» — винительный падеж
// Пометки для озвучки: {ключ|запасной текст}. Если родители записали это место своим голосом — звучит запись.
export const tokL = L => `{б:${L.toUpperCase()}|${'ЬЪЙ'.includes(L.toUpperCase()) ? nm(L) : `«${nm(L)}»`}}`;
export const tokS = syl => `{с:${syl.toUpperCase()}|«${syl.toLowerCase()}»}`;
export const tokW = w => `{ш:${w.toLowerCase()}|${w.toLowerCase()}}`;
export const accL = L => (special(L) ? tokL(L) : `букву ${tokL(L)}`);
// «с буквой эм» / «с мягким знаком»
const withL = L => (L.toUpperCase() === 'Ь' ? 'с мягким знаком' : L.toUpperCase() === 'Ъ' ? 'с твёрдым знаком' : `с буквой ${tokL(L)}`);
const cap = w => w[0].toUpperCase() + w.slice(1);
// На первых островах слова пишем большими печатными буквами, позже — обычными.
const disp = (w, s) => (s <= 20 ? w.toUpperCase() : w);
const isV = L => VOWELS.includes(L.toUpperCase());

function others(r, L, s, n) {
  const pool = known(Math.max(s, 6)).filter(x => x !== L.toUpperCase());
  return sample(r, pool, n);
}
// Собрать варианты ответа: верный + неверные, перемешать, запомнить место верного.
function mk(r, right, wrongs, n = 3) {
  const w = uniq(wrongs.map(String)).filter(x => x !== String(right)).slice(0, n);
  const opts = shuffle(r, [String(right), ...w]);
  return { opts, a: opts.indexOf(String(right)) };
}
// Набор для «собери все нужные»: nT нужных и остальные лишние.
function mix(r, target, wrongs, total, nT, alt) {
  const items = [];
  for (let i = 0; i < nT; i++) items.push(alt && i % 2 ? alt : String(target));
  for (let i = nT; i < total; i++) items.push(String(wrongs[i % wrongs.length]));
  return shuffle(r, items);
}

// Слоги «согласная + гласная», которые бывают в русских словах.
const BAD = 'ЖЫ ШЫ ЧЫ ЩЫ ЖЯ ШЯ ЧЯ ЩЯ ЖЮ ШЮ ЧЮ ЩЮ ЦЯ ЦЮ ЦЁ ЖЭ ШЭ ЧЭ ЩЭ ЦЭ КЫ ГЫ ХЫ КЯ ГЯ ХЯ КЮ ГЮ ХЮ КЁ ГЁ ХЁ КЭ ГЭ ХЭ'.split(' ');
export function syllables(s, only) {
  const ls = known(s), out = [];
  for (const c of ls) {
    if (isV(c) || 'ЙЬЪ'.includes(c)) continue;
    for (const v of ls) if (isV(v) && !BAD.includes(c + v) && (!only || c === only || v === only)) out.push(c + v);
  }
  return out;
}

// ---------- помощники для слов ----------
const CONS = ch => !isV(ch) && !'ьъ'.includes(ch);
const FILT = {
  any: () => true,
  w1: x => x.syl.length === 1,
  w2: x => x.syl.length === 2,
  w3: x => x.syl.length >= 3,
  short: x => x.w.length <= 4,
  mid: x => x.w.length >= 5 && x.w.length <= 6,
  long: x => x.w.length >= 7,
  soft: x => x.w.includes('ь'),
  yot: x => x.w.includes('й'),
  ya: x => /[ёюя]/.test(x.w),
  cc: x => [...x.w].some((ch, i) => i && CONS(ch) && CONS(x.w[i - 1])),
};
// Слова, которые ребёнок уже может прочитать; свежие (с новыми буквами) — в первую очередь.
function pool(s, f, pic, min = 3) {
  const fit = WORDS.filter(x => x.st <= s && (!pic || x.e));
  let ws = fit.filter(FILT[f || 'any']);
  if (ws.length < min) ws = fit;
  const recent = ws.filter(x => x.st > s - 5);
  return recent.length >= Math.max(min, 4) && s < 33 ? recent : ws;
}
const sentPool = (s, lo, hi, pic) => {
  const all = SENTS.filter(x => x.st <= s && x.n >= lo && x.n <= hi && (!pic || x.e));
  const recent = all.filter(x => x.st > s - 5);
  return recent.length >= 3 && s < 33 ? recent : all;
};

// Похожие картинки: их нельзя предлагать вместе как варианты ответа — ребёнок не сможет выбрать однозначно.
const ALIKE = ['🐱🐈', '🐕🐶', '🐇🐰', '🐴🐎🦓', '🐔🐓🐥🐦🦃🦜🦉', '🧸🐻🐼', '🐠🐟🐳', '👩👧👵👸🧚', '👨👴👦👶', '🚋🚆🚇🚌', '🌳🎄', '🌹🌸💐', '🚢⛵', '🏠🏙️🏫', '🎈⚽', '🍎🍐', '🦊🐺', '🐭🐹', '🦁🐯'];
const groupOf = e => ALIKE.findIndex(g => g.includes(e));
export const alike = (a, b) => a === b || (groupOf(a) >= 0 && groupOf(a) === groupOf(b));
// Оставить в списке только те слова, чьи картинки не похожи друг на друга (по порядку списка).
function distinctPics(list) {
  const out = [];
  for (const x of list) if (!out.some(y => alike(x.e, y.e))) out.push(x);
  return out;
}

// ---------- помощники для чисел ----------
const NUMW = ['ноля', 'одного', 'двух', 'трёх', 'четырёх', 'пяти', 'шести', 'семи', 'восьми', 'девяти', 'десяти'];
const OPW = { '+': 'плюс', '−': 'минус', '×': 'умножить на', '÷': 'разделить на' };
const f = (o, n) => pl(n, o); // форма слова после числа
const obj = (r, keys) => OBJECTS[pickR(r, keys || Object.keys(OBJECTS))];

function wrongNums(r, res, n = 3) {
  const c = [res + 1, res - 1, res + 2, res - 2];
  if (res >= 10) c.push(res + 10, res - 10, +String(res).split('').reverse().join(''));
  const ok = uniq(c).filter(x => x >= 0 && x !== res);
  return sample(r, ok, n);
}

// Пример нужного вида: возвращает числа, знак, ответ и запись.
export function example(kind, r) {
  const R = (lo, hi) => rint(r, lo, hi);
  let a, b, op = '+';
  const x = /^x(\d)([abc]?)$/.exec(kind), dv = /^d(\d)$/.exec(kind);
  if (dv) { b = +dv[1]; a = b * R(1, 10); op = '÷'; } // деление: делимое всегда делится нацело
  else if (x) {
    a = +x[1];
    b = x[2] === 'a' ? R(1, 5) : x[2] === 'b' ? R(6, 10) : R(1, 10);
    if (x[2] === 'c' && r() < 0.5) [a, b] = [b, a];
    op = '×';
  } else switch (kind) {
    case 'a5': a = R(1, 4); b = R(1, 5 - a); break;
    case 'a10': a = R(1, 8); b = R(Math.max(1, 6 - a), 10 - a); break;
    case 'p1': a = R(1, 8); b = R(1, 2); break;
    case 's5': a = R(2, 5); b = R(1, a); op = '−'; break;
    case 's10': a = R(6, 10); b = R(1, a - 1); op = '−'; break;
    case 'am10': return example(pickR(r, ['a10', 's10']), r);
    case 'c10': a = R(1, 9); b = 10 - a; break;
    case 't10': if (r() < 0.5) { a = 10; b = R(1, 9); } else { a = R(1, 9); b = 10; } break;
    case 'st10': a = R(11, 19); b = r() < 0.5 ? a - 10 : 10; op = '−'; break;
    case 'a20n': a = R(11, 17); b = R(1, 19 - a); break;
    case 's20n': a = R(12, 19); b = R(1, a - 10); op = '−'; break;
    case 'am20n': return example(pickR(r, ['a20n', 's20n', 't10', 'st10']), r);
    case 'c9': a = 9; b = R(2, 9); break;
    case 'c8': a = 8; b = R(3, 9); break;
    case 'c76': a = R(6, 7); b = R(11 - a, 9); break;
    case 'a20c': a = R(2, 9); b = R(11 - a, 9); break;
    case 'sc12': a = R(11, 12); b = R(a - 9, 9); op = '−'; break;
    case 'sc15': a = R(13, 15); b = R(a - 9, 9); op = '−'; break;
    case 'sc18': a = R(16, 18); b = R(a - 9, 9); op = '−'; break;
    case 's20c': a = R(11, 18); b = R(a - 9, 9); op = '−'; break;
    case 'am20': return example(pickR(r, ['a20n', 's20n', 'a20c', 's20c']), r);
    case 'tens+': a = 10 * R(1, 8); b = 10 * R(1, 9 - a / 10); break;
    case 'tens-': a = 10 * R(2, 10); b = 10 * R(1, a / 10 - 1); op = '−'; break;
    case 'u+': { const o = R(1, 8); a = 10 * R(2, 9) + o; b = R(1, 9 - o); break; }
    case 'u-': { const o = R(2, 9); a = 10 * R(2, 9) + o; b = R(1, o); op = '−'; break; }
    case 'd+': { const t = R(1, 8); a = 10 * t + R(1, 9); b = 10 * R(1, 9 - t); break; }
    case 'd-': { const t = R(2, 9); a = 10 * t + R(1, 9); b = 10 * R(1, t - 1); op = '−'; break; }
    case 'dd+': { const t = R(1, 7), o = R(1, 8); a = 10 * t + o; b = 10 * R(1, 8 - t) + R(1, 9 - o); break; }
    case 'dd-': { const t = R(2, 9), o = R(2, 9); a = 10 * t + o; b = 10 * R(1, t - 1) + R(1, o); op = '−'; break; }
    case 'am100': return example(pickR(r, ['tens+', 'tens-', 'u+', 'u-', 'd+', 'd-', 'dd+', 'dd-']), r);
    case 'x23': return example(pickR(r, ['x2c', 'x3c']), r);
    case 'x45': return example(pickR(r, ['x4c', 'x5c']), r);
    case 'xall': return example(pickR(r, ['x2c', 'x3c', 'x4c', 'x5c']), r);
    case 'd23': return example(pickR(r, ['d2', 'd3']), r);
    case 'd45': return example(pickR(r, ['d4', 'd5']), r);
    case 'dall': return example(pickR(r, ['d2', 'd3', 'd4', 'd5']), r);
    default: throw new Error('Неизвестный вид примера: ' + kind);
  }
  const res = op === '+' ? a + b : op === '−' ? a - b : op === '÷' ? a / b : a * b;
  return { a, b, op, res, text: `${a} ${op} ${b}`, speak: `${a} ${OPW[op]} ${b}` };
}
const EX_NAMES = {
  a5: 'сложение до 5', a10: 'сложение до 10', p1: 'прибавить 1 и 2', s5: 'вычитание до 5', s10: 'вычитание до 10',
  am10: 'сложение и вычитание до 10', c10: 'дополнение до 10', t10: 'десять плюс число', st10: 'вычитание до десятка',
  a20n: 'сложение до 20 без перехода', s20n: 'вычитание до 20 без перехода', am20n: 'сложение и вычитание до 20 без перехода',
  c9: 'девять плюс число', c8: 'восемь плюс число', c76: 'семь и шесть плюс число', a20c: 'сложение с переходом через десяток',
  sc12: 'вычитание из 11 и 12', sc15: 'вычитание из 13–15', sc18: 'вычитание из 16–18', s20c: 'вычитание с переходом через десяток',
  am20: 'сложение и вычитание до 20', 'tens+': 'сложение десятков', 'tens-': 'вычитание десятков',
  'u+': 'двузначное плюс единицы', 'u-': 'двузначное минус единицы', 'd+': 'двузначное плюс десятки', 'd-': 'двузначное минус десятки',
  'dd+': 'сложение двузначных чисел', 'dd-': 'вычитание двузначных чисел', am100: 'сложение и вычитание до 100',
  x23: 'таблица на 2 и 3', x45: 'таблица на 4 и 5', xall: 'таблица умножения на 2–5',
  d23: 'деление на 2 и 3', d45: 'деление на 4 и 5', dall: 'деление на 2–5',
};
const exName = k => EX_NAMES[k] || (k[0] === 'd' ? `деление на ${k[1]}` : `таблица умножения на ${k[1]}`);

// ---------- реестр генераторов ----------
const G = {};
// name — имя рецепта, line — линия обучения (R чтение, W письмо, M счёт, X умножение),
// label — как назвать это умение родителю, fn — сам генератор.
function def(name, line, label, fn) { G[name] = { line, label, fn }; }
const call = (name, r, ...args) => G[name].fn(r, ...args);

// ===== БУКВЫ И ЧТЕНИЕ =====
const lab = L => `буква ${L}`;
for (const [name, m, say] of [
  ['bubL', 'bubbles', L => `Лопни все пузыри ${withL(L)}.`],
  ['fishL', 'fish', L => `Поймай всех рыбок ${withL(L)}.`],
  ['findL', 'find', L => `Найди и нажми все листочки ${withL(L)}.`],
]) def(name, 'R', lab, (r, L, s) => ({
  m, say: say(L), target: L, key: name + L,
  items: mix(r, L, others(r, L, s, 4), m === 'find' ? 12 : 9, m === 'find' ? 4 : 3, s > 5 ? L.toLowerCase() : null),
}));

def('listenL', 'R', lab, (r, L, s) => ({ m: 'listen', say: `Найди ${accL(L)}.`, key: 'lL' + L, ...mk(r, L, others(r, L, s, 3)) }));

def('first', 'R', lab, (r, L, s) => {
  const ws = WORDS.filter(x => x.e && x.w[0].toUpperCase() === L);
  if (!ws.length) return call('listenL', r, L, s);
  const w = pickR(r, ws);
  return { m: 'pick', say: `${tokW(w.w)}. На какую букву начинается это слово?`, show: { big: w.e }, key: 'first' + w.w, ...mk(r, L, others(r, L, s, 3)) };
});

def('memL', 'R', 'большие и маленькие буквы', (r, s) => ({
  m: 'memory', say: 'Открывай карточки и ищи пары: большая буква и такая же маленькая.',
  pairs: sample(r, known(Math.max(s, 3)).slice(-8), 3).map(L => [L, L.toLowerCase()]),
}));

def('caseL', 'R', 'большие и маленькие буквы', (r, s) => {
  const L = pickR(r, known(Math.max(s, 4)).slice(-10));
  return { m: 'pick', say: 'Найди маленькую букву для этой большой.', show: { text: L }, key: 'case' + L, ...mk(r, L.toLowerCase(), others(r, L, s, 3).map(x => x.toLowerCase())) };
});

def('sortVC', 'R', 'гласные и согласные', (r, s) => {
  const ls = known(Math.max(s, 5)).filter(x => !'ЬЪ'.includes(x));
  const items = [...sample(r, ls.filter(isV), 3).map(t => ({ t, bin: 0 })), ...sample(r, ls.filter(x => !isV(x)), 3).map(t => ({ t, bin: 1 }))];
  return { m: 'baskets', say: 'Гласные буквы клади в красную корзину, а согласные — в синюю.', bins: [{ icon: '🔴' }, { icon: '🔵' }], items: shuffle(r, items) };
});

const slab = syl => `слог ${syl}`;
def('buildS', 'R', slab, (r, syl) => ({
  m: 'build', say: `Собери слог ${tokS(syl)}.`, target: syl.split(''), key: 'bS' + syl,
  extra: sample(r, ORDER.slice(0, 10).split('').filter(x => !syl.includes(x)), 2),
}));
function sylWrongs(r, syl, s) {
  const all = syllables(Math.max(s, 5)).filter(x => x !== syl);
  const near = all.filter(x => x[0] === syl[0] || x[1] === syl[1]);
  return uniq([...shuffle(r, near), ...shuffle(r, all), syl[1] + syl[0]]);
}
def('listenS', 'R', slab, (r, syl, s) => ({ m: 'listen', say: `Найди слог ${tokS(syl)}.`, key: 'lS' + syl, ...mk(r, syl, sylWrongs(r, syl, s)) }));
def('bubS', 'R', slab, (r, syl, s) => ({ m: 'bubbles', say: `Лопни все пузыри, где слог ${tokS(syl)}.`, target: syl, key: 'bubS' + syl, items: mix(r, syl, sylWrongs(r, syl, s).slice(0, 4), 9, 3) }));

def('pairsSP', 'R', 'слог и картинка', (r, s) => {
  const ws = shuffle(r, WORDS.filter(x => x.e && x.syl[0].length === 2 && x.syl.length > 1 && x.st <= s + 12 && syllables(s).includes(x.syl[0].toUpperCase())));
  const got = [];
  for (const w of ws) if (!got.some(g => g.syl[0] === w.syl[0] || alike(g.e, w.e))) got.push(w);
  if (got.length < 3) { const all = syllables(s); return all.length ? call('listenS', r, pickR(r, all), s) : call('listenL', r, pickR(r, known(s)), s); }
  return { m: 'pairs', say: 'Соедини слог и картинку. Нажми на картинку — я скажу слово.', pairs: got.slice(0, 3).map(w => [w.syl[0].toUpperCase(), { t: w.e, say: tokW(w.w) }]) };
});

const wl = () => 'чтение слов';
def('wordpic', 'R', wl, (r, s, f) => {
  const p = pool(s, f, true);
  if (p.length < 3) return call('listenW', r, s, f);
  const [w, ...rest] = distinctPics(shuffle(r, p));
  if (rest.length < 2) return call('listenW', r, s, f);
  return { m: 'pick', say: 'Прочитай слово и найди картинку.', show: { text: disp(w.w, s) }, key: 'wp' + w.w, ...mk(r, w.e, rest.map(x => x.e), 2) };
});
def('picword', 'R', wl, (r, s, f) => {
  const p = pool(s, f, true, 1), all = pool(s, f, false, 3);
  if (!p.length || all.length < 3) return call('listenW', r, s, f);
  const w = pickR(r, p);
  return { m: 'pick', say: `${tokW(w.w)}. Найди это слово.`, show: { big: w.e }, key: 'pw' + w.w, ...mk(r, disp(w.w, s), shuffle(r, all).map(x => disp(x.w, s)), 2) };
});
def('listenW', 'R', wl, (r, s, f) => {
  const all = pool(s, f, false, 3);
  if (all.length < 3) { const sy = syllables(s); return sy.length ? call('listenS', r, pickR(r, sy), s) : call('listenL', r, pickR(r, known(s)), s); }
  const [w, ...rest] = shuffle(r, all);
  return { m: 'listen', say: `Найди слово: ${tokW(w.w)}.`, key: 'lW' + w.w, ...mk(r, disp(w.w, s), rest.map(x => disp(x.w, s)), 2) };
});
function wordFor(r, s, f, maxLen) {
  const p = pool(s, f, true, 1).filter(x => x.w.length <= maxLen);
  return p.length ? pickR(r, p) : null;
}
def('buildW', 'R', 'составление слов из букв', (r, s, f) => {
  const w = wordFor(r, s, f, f === 'long' ? 9 : 7);
  if (!w) return call('listenW', r, s, f);
  const up = w.w.toUpperCase();
  return { m: 'build', say: `Собери слово: ${tokW(w.w)}.`, pic: w.e, target: up.split(''), key: 'bW' + w.w, extra: sample(r, known(Math.max(s, 6)).filter(x => !up.includes(x)), 2) };
});
def('missing', 'R', 'пропущенная буква', (r, s, f) => {
  const w = wordFor(r, s, f, 8);
  if (!w) return call('listenW', r, s, f);
  const up = w.w.toUpperCase().split('');
  const idx = up.map((_, i) => i).filter(i => !'ЬЪ'.includes(up[i]));
  const i = pickR(r, idx), L = up[i];
  const same = known(Math.max(s, 6)).filter(x => x !== L && isV(x) === isV(L) && !'ЬЪЙ'.includes(x));
  return { m: 'missing', say: `${tokW(w.w)}. Какая буква убежала?`, pic: w.e, cells: up.map((c, j) => (j === i ? '_' : c)), key: 'ms' + w.w, ...mk(r, L, shuffle(r, same), 2) };
});
def('claps', 'R', 'деление на слоги', r => {
  const w = pickR(r, WORDS.filter(x => x.e && x.syl.length <= 4));
  return { m: 'claps', say: `Стукни в барабан столько раз, сколько слогов в слове: ${tokW(w.w)}. Потом нажми галочку.`, pic: w.e, word: w.syl.join('-'), n: w.syl.length, key: 'cl' + w.w };
});
def('pairsWP', 'R', wl, (r, s, f) => {
  const p = pool(s, f, true);
  if (p.length < 3) return call('listenW', r, s, f);
  const three = distinctPics(shuffle(r, p)).slice(0, 3);
  if (three.length < 3) return call('listenW', r, s, f);
  return { m: 'pairs', say: 'Прочитай и соедини с картинками.', pairs: three.map(w => [disp(w.w, s), { t: w.e, say: tokW(w.w) }]) };
});
def('memWP', 'R', wl, (r, s, f) => {
  const p = pool(s, f, true);
  if (p.length < 3) return call('listenW', r, s, f);
  const three = distinctPics(shuffle(r, p)).slice(0, 3);
  if (three.length < 3) return call('listenW', r, s, f);
  return { m: 'memory', say: 'Открывай карточки и ищи пары: слово и его картинка.', pairs: three.map(w => [disp(w.w, s), w.e]) };
});

const sl = () => 'чтение предложений';
def('sentence', 'R', sl, (r, s, lo, hi) => {
  const p = sentPool(s, lo, hi);
  if (!p.length) return call('buildW', r, s);
  const x = pickR(r, p);
  return { m: 'build', wide: true, say: `Собери предложение: ${x.t}`, target: x.t.split(' '), extra: [], key: 'sn' + x.t };
});
def('sentpic', 'R', sl, (r, s, lo, hi) => {
  const p = sentPool(s, lo, hi, true);
  if (!p.length) return call('wordpic', r, s);
  const x = pickR(r, p);
  return { m: 'pick', say: 'Прочитай предложение и найди картинку.', show: { text: x.t, long: true }, key: 'sp' + x.t, ...mk(r, x.e, distinctPics([x, ...shuffle(r, SENTS.filter(y => y.e))]).slice(1).map(y => y.e), 2) };
});
def('truefalse', 'R', 'понимание прочитанного', (r, s) => {
  const all = FACTS.filter(x => x.st <= s), rec = all.filter(x => x.st > s - 8);
  const p = rec.length >= 3 && s < 33 ? rec : all;
  if (p.length < 2) return call('wordpic', r, s);
  const x = pickR(r, p);
  return { m: 'truefalse', say: 'Прочитай. Это правда или шутка? Правда — палец вверх, шутка — палец вниз.', text: x.t, a: x.a, key: 'tf' + x.t, canHear: true };
});
const textOf = (set, i) => (set === 's' ? TEXTS_SHORT : TEXTS_LONG)[i];
def('story', 'R', 'понимание текста', (r, set, ti, qi) => {
  const T = textOf(set, ti), q = T.q[qi % T.q.length];
  return { m: 'story', say: q[0], title: T.title, text: T.s, key: 'st' + ti + qi, ...mk(r, q[1], q.slice(2)) };
});
def('textSent', 'R', sl, (r, set, ti) => {
  const T = textOf(set, ti), ok = T.s.filter(x => { const n = x.split(' ').length; return n >= 3 && n <= 6; });
  const t = pickR(r, ok.length ? ok : T.s);
  return { m: 'build', wide: true, say: `Собери предложение из рассказа: ${t}`, target: t.split(' '), extra: [], key: 'ts' + t };
});

// ===== ПИСЬМО =====
const SHAPES = {
  hline: 'Проведи пальцем по дорожке: слева направо.', vline: 'Проведи по дорожке сверху вниз.',
  slash: 'Проведи по наклонной дорожке.', backslash: 'Скатись с горки: проведи по дорожке.',
  roof: 'Обведи крышу домика: вверх и вниз.', zigzag: 'Обведи зигзаг: вверх, вниз, вверх, вниз.',
  wave: 'Обведи волну на море.', hills: 'Обведи холмики.', circle: 'Обведи круг, как солнышко.',
  oval: 'Обведи овал, как яйцо.', square: 'Обведи квадрат.', triangle: 'Обведи треугольник.',
  spiral: 'Обведи домик улитки — спираль.', cross: 'Обведи крестик.',
};
def('shape', 'W', 'линии и фигуры', (r, kind) => ({ m: 'trace', say: SHAPES[kind], shape: kind, key: 'sh' + kind + rint(r, 0, 9) }));
const wlab = ch => `письмо: буква ${ch.toUpperCase()}`;
const sizeW = ch => (ch === ch.toUpperCase() ? '' : 'маленькую ');
def('traceL', 'W', wlab, (r, ch) => ({ m: 'trace', say: `Обведи пальцем ${special(ch) ? nm(ch) : sizeW(ch) + accL(ch)}.`, text: ch, key: 'tL' + ch }));
def('copyL', 'W', wlab, (r, ch) => ({ m: 'copy', say: `А теперь напиши ${special(ch) ? nm(ch) : sizeW(ch) + accL(ch)} без пунктира. Потом нажми галочку.`, text: ch, key: 'cL' + ch }));
const kindT = t => (/[ .!?]/.test(t.trim()) ? 'предложение' : t.length <= 2 ? 'слог' : 'слово');
const sayT = t => (kindT(t) === 'слог' ? tokS(t) : kindT(t) === 'слово' ? tokW(t) : t);
def('traceT', 'W', t => `письмо: «${t}»`, (r, t) => ({ m: 'trace', say: `Обведи ${kindT(t)}: ${sayT(t)}`, text: t, key: 'tT' + t }));
def('copyT', 'W', t => `письмо: «${t}»`, (r, t) => ({ m: 'copy', say: `Напиши без пунктира ${kindT(t)}: ${sayT(t).replace(/[.!?]$/, '')}. Потом нажми галочку.`, text: t, key: 'cT' + t }));
const SYMM = 'АДЖЛМНОПТФХШ';
def('mirror', 'W', wlab, (r, L) => {
  if (SYMM.includes(L)) return call('listenL', r, L, 33);
  const opts = shuffle(r, [{ t: L }, { t: L, flip: true }]);
  return { m: 'pick', say: `Одна буква смотрит не в ту сторону. Найди правильную ${accL(L)}.`, opts, a: opts.findIndex(o => !o.flip), key: 'mir' + L };
});
def('drawL', 'W', 'рисование', (r, L) => {
  const ws = WORDS.filter(x => x.e && x.w[0].toUpperCase() === L);
  const ex = ws.length ? ` Например: ${tokW(pickR(r, ws).w)}.` : '';
  return { m: 'draw', say: `Нарисуй что-нибудь на ${accL(L)}.${ex} Потом нажми галочку.`, key: 'dL' + L };
});
def('draw', 'W', 'рисование', (r, i) => ({ m: 'draw', say: `${DRAWS[i]} Потом нажми галочку.`, key: 'dr' + i }));
def('drawW', 'W', 'рисование', (r, s) => {
  const w = pickR(r, pool(s, 'short', true, 1));
  return { m: 'draw', say: `Нарисуй картинку: ${tokW(w.w)}. Потом нажми галочку.`, key: 'dW' + w.w };
});
def('dictW', 'W', 'письмо слов по буквам', (r, s, f) => {
  const w = wordFor(r, s, f, 7) || wordFor(r, s, 'any', 7);
  const up = w.w.toUpperCase();
  return { m: 'build', say: `Набери буквами слово: ${tokW(w.w)}.`, pic: w.e, target: up.split(''), key: 'dc' + w.w, extra: sample(r, known(Math.max(s, 8)).filter(x => !up.includes(x)), 4) };
});
def('dictT', 'W', 'письмо слов по буквам', (r, word) => {
  const up = word.toUpperCase();
  return { m: 'build', say: `Набери буквами слово: ${tokW(word)}.`, pic: picOf(word.toLowerCase()), target: up.split(''), key: 'dt' + word, extra: sample(r, ORDER.split('').filter(x => !up.includes(x)), 4) };
});
def('capital', 'W', 'большая буква и точка', (r, i) => {
  const t = WRITE_SENTS[i % WRITE_SENTS.length];
  return { m: 'pick', say: 'Какое предложение написано правильно? В начале — большая буква, в конце — точка.', show: {}, longOpts: true, key: 'cap' + i, ...mk(r, t, [t[0].toLowerCase() + t.slice(1), t.slice(0, -1)]) };
});

// ===== СЧЁТ =====
const nl = () => 'числа и счёт';
def('count', 'M', nl, (r, lo, hi) => {
  const n = rint(r, lo, hi), o = obj(r);
  return { m: 'count', say: `Сколько тут ${o[2]}? Посчитай и выбери число.`, emoji: o[3], n, key: 'cnt' + n, ...mk(r, n, shuffle(r, range(Math.max(0, n - 3), n + 3))) };
});
def('feed', 'M', nl, (r, lo, hi) => {
  // Зверёк ест яблоки — и в задании сказано «яблок»: слово и картинка из одной строки справочника.
  const n = rint(r, Math.max(1, lo), Math.max(1, hi)), o = OBJECTS.apple;
  return { m: 'feed', say: `Зверёк хочет ${n} ${f(o, n)}. Покорми его и нажми галочку.`, n, total: n + rint(r, 2, 4), food: o[3], key: 'feed' + n };
});
function numWrongs(r, n, lo, hi, step = 1) {
  const near = range(Math.max(0, lo - 2 * step), hi + 2 * step, step).filter(x => x !== n);
  const sw = +String(n).split('').reverse().join('');
  return uniq([...(n > 10 && sw !== n && sw > 9 ? [sw] : []), ...shuffle(r, near.filter(x => Math.abs(x - n) <= 3 * step)), ...shuffle(r, near)]);
}
for (const [name, m, say] of [['bubN', 'bubbles', n => `Лопни все пузыри с числом ${n}.`], ['fishN', 'fish', n => `Поймай всех рыбок с числом ${n}.`]])
  def(name, 'M', nl, (r, lo, hi, step = 1) => {
    const n = pickR(r, range(lo, hi, step));
    return { m, say: say(n), target: String(n), key: name + n, items: mix(r, n, numWrongs(r, n, lo, hi, step).slice(0, 4), 9, 3) };
  });
def('listenN', 'M', nl, (r, lo, hi, step = 1) => {
  const n = pickR(r, range(lo, hi, step));
  return { m: 'listen', say: `Найди число ${n}.`, key: 'lN' + n, ...mk(r, n, numWrongs(r, n, lo, hi, step)) };
});
const dl = d => `письмо: цифра ${d}`;
def('traceD', 'M', dl, (r, d) => ({ m: 'trace', say: `Обведи пальцем ${d > 9 ? 'число' : 'цифру'} ${d}.`, text: String(d), key: 'tD' + d }));
def('copyD', 'M', dl, (r, d) => ({ m: 'copy', say: `Напиши ${d > 9 ? 'число' : 'цифру'} ${d} без пунктира. Потом нажми галочку.`, text: String(d), key: 'cD' + d }));
const numPairs = (r, lo, hi) => { const e = obj(r)[3]; return sample(r, range(Math.max(lo, 1), Math.max(Math.min(hi, 10), Math.max(lo, 1) + 2)), 3).map(n => [String(n), { t: e.repeat(n), small: true }]); };
def('pairsN', 'M', nl, (r, lo, hi) => ({ m: 'pairs', say: 'Соедини число и картинку, где столько же предметов.', pairs: numPairs(r, lo, hi) }));
def('memN', 'M', nl, (r, lo, hi) => ({ m: 'memory', say: 'Открывай карточки и ищи пары: число и столько же предметов.', pairs: numPairs(r, lo, hi).map(([a, b]) => [a, b.t]) }));
def('train', 'M', 'порядок чисел', (r, lo, hi, step, n) => ({
  m: 'train', say: 'Собери поезд. Нажимай на вагончики по порядку: от самого маленького к самому большому.',
  nums: shuffle(r, sample(r, range(lo, hi, step), n)),
}));
def('gap', 'M', 'порядок чисел', (r, lo, hi, step) => {
  const a = pickR(r, range(lo, hi - 3 * step, step)), seq = [0, 1, 2, 3].map(i => a + i * step), i = rint(r, 0, 3);
  return { m: 'missing', say: 'Это ряд по порядку. Какое число пропущено?', cells: seq.map((x, j) => (j === i ? '_' : String(x))), key: 'gap' + a + i, ...mk(r, seq[i], [seq[i] + 1, seq[i] - 1, seq[i] + step, seq[i] - step, seq[i] + 2].filter(x => x >= 0), 2) };
});
def('compare', 'M', 'сравнение чисел', (r, lo, hi) => {
  const a = rint(r, lo, hi), b = r() < 0.2 ? a : rint(r, lo, hi);
  return { m: 'compare', say: `Сравни: ${a} и ${b}. Какой знак поставить? Клювик открыт туда, где больше.`, a, b, key: 'cmp' + a + '_' + b };
});
def('house', 'M', n => 'состав числа', (r, lo, hi) => {
  const n = rint(r, lo, hi), a = rint(r, 0, n), b = n - a;
  return { m: 'house', say: `В домике живёт число ${n}. В одном окошке ${a}. Сколько в другом окошке?`, n, x: a, key: 'h' + n + '_' + a, ...mk(r, b, shuffle(r, range(0, Math.max(n, 3)))) };
});
def('pairs10', 'M', 'состав числа 10', r => ({ m: 'pairs', say: 'Найди пары, которые вместе дают десять.', pairs: sample(r, [1, 2, 3, 4], 3).map(a => [String(a), String(10 - a)]) }));
def('tenframe', 'M', 'десятки и единицы', (r, lo, hi, step = 1) => {
  const n = pickR(r, range(lo, hi, step));
  return { m: 'tenframe', say: `Собери число ${n}. Длинная палочка — это десять, маленький кубик — это один. Потом нажми галочку.`, n, key: 'tf' + n };
});
def('shop', 'M', 'счёт монетками', (r, lo, hi) => {
  const n = rint(r, lo, hi);
  return { m: 'shop', say: `Цена игрушки — ${n} ${pl(n, ['рубль', 'рубля', 'рублей'])}. Положи на тарелку ровно столько монеток и нажми галочку.`, price: n, item: pickR(r, ['🧸', '🚗', '⚽', '🪁', '🎈', '🚂']), coins: hi <= 10 ? [1, 2, 5] : hi <= 20 ? [1, 2, 5, 10] : [1, 2, 5, 10, 50], key: 'shop' + n };
});
def('chart', 'M', 'таблица чисел', (r, lo, hi, mode) => {
  let n, say;
  if (mode === 'next') { n = rint(r, lo + 1, hi); say = `Найди число, которое идёт сразу после ${n - 1}.`; }
  else if (mode === 'prev') { n = rint(r, lo, hi - 1); say = `Найди число, которое идёт прямо перед числом ${n + 1}.`; }
  else if (mode === 'plus10') { n = rint(r, lo + 10, hi); say = `Найди число, которое на десять больше, чем ${n - 10}.`; }
  else if (mode === 'minus10') { n = rint(r, lo, hi - 10); say = `Найди число, которое на десять меньше, чем ${n + 10}.`; }
  else { n = rint(r, lo, hi); say = `Найди в таблице число ${n}.`; }
  return { m: 'chart', say, target: n, lo, hi, key: 'ch' + mode + n };
});
def('dots', 'M', 'порядок чисел', (r, n) => ({ m: 'dots', say: `Соедини точки по порядку: от одного до ${NUMW[n] || n}. Получится картинка!`, n, key: 'dots' + n + rint(r, 0, 9) }));
def('stones', 'M', (step) => (step === 1 ? 'порядок чисел' : `счёт через ${step}`), (r, step, start, count) => {
  const seq = range(0, count - 1).map(i => start + i * step);
  const steps = seq.map(x => mk(r, x, [x + 1, x - 1, x + step, x - step, x + 2].filter(y => y > 0), 2));
  const how = step === 1 ? 'по порядку' : step === 2 ? 'двойками: два, четыре, шесть' : step === 5 ? 'пятёрками: пять, десять, пятнадцать' : step === 10 ? 'десятками: десять, двадцать, тридцать' : `через ${step}: ${seq.slice(0, 3).join(', ')}`;
  return { m: 'stones', say: `Помоги лягушке перейти речку. Выбирай камушки и считай ${how}.`, seq, steps, key: 'stn' + step + start };
});
def('sortN', 'M', 'сравнение чисел', (r, p, lo, hi) => {
  const less = sample(r, range(lo, p - 1), 3), more = sample(r, range(p + 1, hi), 3);
  return { m: 'baskets', say: `Если число меньше, чем ${p}, клади его в левую корзину. Если больше, чем ${p}, — в правую.`, bins: [{ t: `< ${p}` }, { t: `> ${p}` }], items: shuffle(r, [...less.map(t => ({ t: String(t), bin: 0 })), ...more.map(t => ({ t: String(t), bin: 1 }))]) };
});
const PAINT = THINGS.filter(t => t.paint).map(t => [...t.paint, t.pic]); // что можно раскрашивать — из справочника
def('paint', 'M', nl, (r, lo, hi) => {
  const n = rint(r, lo, hi), o = pickR(r, PAINT);
  return { m: 'paint', say: `Раскрась ровно ${n} ${pl(n, o)}. Нажимай на картинки, а потом на галочку.`, n, total: Math.min(n + rint(r, 2, 4), 12), emoji: o[3], key: 'paint' + n };
});

// --- примеры в разных играх ---
def('exKey', 'M', exName, (r, k) => { const e = example(k, r); return { m: 'keypad', say: `Сколько будет ${e.speak}? Набери ответ и нажми галочку.`, text: `${e.text} =`, a: e.res, key: 'k' + e.text }; });
def('exLine', 'M', exName, (r, k) => {
  const e = example(k, r);
  if (e.op === '×' || Math.max(e.a, e.res) > 20) return call('exKey', r, k);
  return { m: 'numline', say: `Лягушка сидит на числе ${e.a}. Реши пример: ${e.speak}. Нажми на число, куда она прыгнет.`, text: e.text, from: e.a, to: e.res, lo: 0, hi: Math.max(e.a, e.res) > 10 ? 20 : 10, key: 'l' + e.text };
});
def('exPick', 'M', exName, (r, k) => { const e = example(k, r); return { m: 'pick', say: `Сколько будет ${e.speak}? Выбери ответ.`, show: { text: e.text }, key: 'p' + e.text, ...mk(r, e.res, wrongNums(r, e.res, 4)) }; });
for (const [name, m, tail] of [['exBub', 'bubbles', 'Лопни все пузыри с ответом.'], ['exFish', 'fish', 'Поймай всех рыбок с ответом.']])
  def(name, 'M', exName, (r, k) => { const e = example(k, r); return { m, say: `Реши пример: ${e.speak}. ${tail}`, caption: e.text, target: String(e.res), key: name + e.text, items: mix(r, e.res, wrongNums(r, e.res, 4), 9, 3) }; });
def('exTF', 'M', exName, (r, k) => {
  const e = example(k, r), a = r() < 0.5, shown = a ? e.res : pickR(r, wrongNums(r, e.res, 3));
  return { m: 'truefalse', say: `Проверь пример: ${e.speak} — это ${shown}? Верно — палец вверх, неверно — палец вниз.`, text: `${e.text} = ${shown}`, a, key: 'tf' + e.text };
});
function threeEx(r, k) {
  const got = [];
  for (let i = 0; i < 60 && got.length < 3; i++) { const e = example(k, r); if (!got.some(g => g.res === e.res || g.text === e.text)) got.push(e); }
  return got;
}
def('exPairs', 'M', exName, (r, k) => ({ m: 'pairs', say: 'Реши примеры и соедини каждый с его ответом.', pairs: threeEx(r, k).map(e => [e.text, String(e.res)]) }));
def('exMem', 'M', exName, (r, k) => ({ m: 'memory', say: 'Открывай карточки и ищи пары: пример и его ответ.', pairs: threeEx(r, k).map(e => [e.text, String(e.res)]) }));
def('exGap', 'M', exName, (r, k) => {
  const e = example(k, r);
  return { m: 'missing', say: `Какое число спряталось? ${e.a} ${OPW[e.op]} сколько-то — получится ${e.res}.`, cells: [String(e.a), e.op, '_', '=', String(e.res)], key: 'g' + e.text, ...mk(r, e.b, wrongNums(r, e.b, 4), 2) };
});
def('sign', 'M', exName, (r, k) => {
  const e = example(k, r), opts = ['+', '−'];
  return { m: 'pick', say: 'Какой знак спрятался: плюс или минус?', show: { text: `${e.a} ? ${e.b} = ${e.res}` }, opts, a: opts.indexOf(e.op), key: 's' + e.text };
});

// --- задачи в одно действие ---
const HAVE = ['apple', 'candy', 'balloon', 'car', 'pear', 'cookie'], EAT = ['apple', 'pear', 'cookie', 'carrot', 'candy'];
const PLUS = [
  [HAVE, (k, o, a, b) => `У ${k[1]} было ${a} ${f(o, a)}. Потом подарили ещё ${b}. Сколько ${o[2]} стало у ${k[1]}?`],
  [['fish'], (k, o, a, b) => `В море плавало ${a} ${f(o, a)}. Приплыло ещё ${b}. Сколько ${o[2]} стало в море?`],
  [['mushroom'], (k, o, a, b) => `${k[0]} ${k[4]} ${a} ${f(o, a)}. Потом ${k[4]} ещё ${b}. Сколько ${o[2]} у ${k[1]}?`],
  [['flower', 'mushroom'], (k, o, a, b) => `На поляне росло ${a} ${f(o, a)}. Выросло ещё ${b}. Сколько ${o[2]} стало на поляне?`],
  [['bird'], (k, o, a, b) => `На ветке сидело ${a} ${f(o, a)}. Прилетело ещё ${b}. Сколько ${o[2]} стало на ветке?`],
];
const MINUS = [
  [HAVE, (k, o, a, b) => `У ${k[1]} было ${a} ${f(o, a)}. ${b} ${f(o, b)} ${k[2]} ${k[3]} другу. Сколько ${o[2]} осталось у ${k[1]}?`],
  [['fish'], (k, o, a, b) => `В море плавало ${a} ${f(o, a)}. ${b} уплыло. Сколько ${o[2]} осталось?`],
  [['bird'], (k, o, a, b) => `На ветке сидело ${a} ${f(o, a)}. ${b} улетело. Сколько ${o[2]} осталось на ветке?`],
  [['mushroom'], (k, o, a, b) => `На поляне лежало ${a} ${f(o, a)}. Ёжик унёс ${b}. Сколько ${o[2]} осталось на поляне?`],
  [EAT, (k, o, a, b) => `На столе лежало ${a} ${f(o, a)}. ${b} съели за обедом. Сколько ${o[2]} осталось на столе?`],
];
const BOXES = [
  [['тарелка', 'тарелки', 'тарелок'], 'на каждой', ['apple', 'pear', 'cookie', 'candy']],
  [['ваза', 'вазы', 'ваз'], 'в каждой', ['flower']],
  [['аквариум', 'аквариума', 'аквариумов'], 'в каждом', ['fish']],
  [['коробка', 'коробки', 'коробок'], 'в каждой', ['candy', 'car', 'balloon']],
  [['корзинка', 'корзинки', 'корзинок'], 'в каждой', ['mushroom', 'apple']],
];
const PK = { '10': 'задачи до 10', '20': 'задачи до 20', '100': 'задачи до 100', cmp: 'задачи «на сколько больше»' };
def('problem', 'M', (kind) => PK[kind.replace(/[+\-±]/g, '')] || 'задачи', (r, kind) => {
  const R = (lo, hi) => rint(r, lo, hi), k = pickR(r, KIDS);
  let a, b, op, text, o;
  if (kind.startsWith('cmp')) {
    const big = kind === 'cmp20';
    a = big ? R(11, 20) : R(4, 10); b = big ? R(a - 9, a - 1) : R(2, a - 1); op = '−';
    o = obj(r, HAVE);
    const k2 = pickR(r, KIDS.filter(x => x !== k));
    text = `У ${k[1]} ${a} ${f(o, a)}, а у ${k2[1]} ${b} ${f(o, b)}. На сколько ${o[2]} у ${k[1]} больше?`;
  } else {
    const size = kind.slice(1);
    op = kind[0] === '±' ? pickR(r, ['+', '−']) : kind[0] === '+' ? '+' : '−';
    if (op === '+') {
      if (size === '10') { a = R(2, 8); b = R(2, 10 - a); }
      else if (size === '20') { a = R(5, 12); b = R(3, Math.min(9, 20 - a)); }
      else { a = 10 * R(2, 7); b = 10 * R(1, 9 - a / 10); }
    } else if (size === '10') { a = R(4, 10); b = R(2, a - 2); }
    else if (size === '20') { a = R(11, 20); b = R(2, 9); }
    else { a = 10 * R(3, 10); b = 10 * R(1, a / 10 - 1); }
    const [keys, tpl] = size === '100' ? (op === '+' ? PLUS : MINUS)[0] : pickR(r, op === '+' ? PLUS : MINUS);
    o = obj(r, keys);
    text = tpl(k, o, a, b);
  }
  const res = op === '+' ? a + b : a - b;
  return { m: 'problem', say: `Послушай задачу. ${text} Сначала выбери знак, потом набери ответ.`, text, op, ops: ['+', '−'], a: res, expr: `${a} ${op} ${b} = ${res}`, pic: { e: o[3], a, b }, key: 'pr' + text };
});
def('problemX', 'X', t => `задачи на умножение на ${t}`, (r, t) => {
  // На картинке нарисованы тарелки, поэтому и в задаче — только тарелки (не вазы и не коробки).
  const k = rint(r, 2, 6), [box, each, keys] = BOXES[0], o = obj(r, keys);
  const text = `${k} ${pl(k, box)}, ${each} по ${t} ${f(o, t)}. Сколько всего ${o[2]}?`;
  return { m: 'problem', say: `Послушай задачу. ${text} Сначала выбери знак, потом набери ответ.`, text, op: '×', ops: ['+', '×'], a: t * k, expr: `${t} × ${k} = ${t * k}`, groups: { e: o[3], t, k }, key: 'px' + text };
});

// --- рисунок ребёнка становится героем задачи ---
const DRAWABLE = ['apple', 'balloon', 'fish', 'flower', 'star', 'mushroom', 'pear'];
def('drawtask', 'M', op => (op ? 'задачи по своему рисунку' : 'числа и счёт'), (r, op, max, d) => {
  const o = obj(r, DRAWABLE);
  const t = {
    m: 'drawtask', op, max, obj: o, key: 'dtk' + o[0] + op,
    say: `Нарисуй ${o[2] === 'звёзд' ? 'звёздочки' : 'несколько ' + o[2]}: сколько хочешь, от одного до ${NUMW[max]}. Потом нажми галочку.`,
    ask: `Сколько ${o[2]} на твоём рисунке? Выбери число.`,
  };
  if (op === '+') { t.q = n => `На рисунке ${n} ${f(o, n)}. Добавим ещё ${d}. Сколько стало? Набери ответ.`; t.ans = n => n + d; t.extra = () => d; }
  else if (op === '−') {
    t.extra = n => Math.min(d, n);
    t.q = n => `На рисунке ${n} ${f(o, n)}. Ёжик унёс ${Math.min(d, n)}. Сколько осталось? Набери ответ.`;
    t.ans = n => n - Math.min(d, n);
  } else t.done = n => `На рисунке ${n} ${f(o, n)}. Красиво получилось!`;
  return t;
});
def('drawX', 'X', 'умножение по своему рисунку', (r, tmax, kmax) => {
  const [box, each, keys] = pickR(r, BOXES), o = obj(r, keys), t = rint(r, 2, tmax), k = rint(r, 2, kmax);
  return {
    m: 'drawtask', op: '×', obj: o, fixed: t * k, key: 'dx' + t + k,
    say: `Нарисуй ${k} ${pl(k, box)}, ${each} по ${t} ${f(o, t)}. Потом нажми галочку.`,
    q: () => `Сколько всего ${o[2]} на рисунке? По ${t} взять ${k} ${pl(k, ['раз', 'раза', 'раз'])}. Набери ответ.`,
    expr: `${t} × ${k} = ${t * k}`,
  };
});

// ===== УМНОЖЕНИЕ =====
const times = k => `${k} ${pl(k, ['раз', 'раза', 'раз'])}`;
const GRP = ['apple', 'cookie', 'pear', 'candy', 'flower'];
def('grp', 'X', (t) => (t ? `умножение на ${t}` : 'одинаковые группы'), (r, t0, kmax, ask) => {
  const t = t0 || rint(r, 2, 5), k = rint(r, 2, kmax), o = obj(r, GRP), sum = n => Array(n).fill(t).join(' + ');
  const base = { m: 'groups', ask, counts: Array(k).fill(t), emoji: o[3], key: 'grp' + ask + t + '_' + k };
  if (ask === 'total') return { ...base, say: `На каждой тарелке по ${t}. Сколько всего ${o[2]}?`, ...mk(r, t * k, wrongNums(r, t * k, 4).concat([t * (k + 1), t * k + t - 1])) };
  if (ask === 'expr') return { ...base, say: 'Какая запись подходит к картинке?', ...mk(r, sum(k), [sum(k + 1), k > 2 ? sum(k - 1) : Array(k).fill(t + 1).join(' + '), Array(k).fill(t + 1).join(' + ')], 2) };
  return { ...base, say: `По ${t} взяли ${times(k)}. Какая запись подходит к картинке?`, ...mk(r, `${t} × ${k}`, [`${t} × ${k + 1}`, `${t + 1} × ${k}`, `${t + 1} × ${k + 1}`], 2) };
});
def('equal', 'X', 'одинаковые группы', r => {
  const t = rint(r, 2, 5), k = rint(r, 2, 4), a = r() < 0.5, counts = Array(k).fill(t);
  if (!a) counts[rint(r, 0, k - 1)] += pickR(r, [-1, 1, 2]);
  return { m: 'groups', ask: 'equal', counts, emoji: obj(r, GRP)[3], a, say: 'На всех тарелках поровну? Да — палец вверх, нет — палец вниз.', key: 'eq' + counts.join('') };
});
def('grpShow', 'X', 'одинаковые группы', (r, kmax) => {
  const t = rint(r, 2, 4), k = rint(r, 2, kmax), e = obj(r, GRP)[3], pic = (a, b) => Array(b).fill(e.repeat(a)).join('  ');
  const wrong = [pic(t, k + 1), pic(t + 1, k)].map(x => ({ t: x, small: true }));
  const opts = shuffle(r, [{ t: pic(t, k), small: true, ok: true }, ...wrong]);
  return { m: 'pick', say: `Найди картинку: по ${t} взять ${times(k)}.`, show: { text: `${t} × ${k}` }, opts, a: opts.findIndex(x => x.ok), longOpts: true, key: 'gs' + t + k };
});
def('pairsMS', 'X', 'умножение как сложение', r => {
  const got = [];
  while (got.length < 3) { const t = rint(r, 2, 5), k = rint(r, 2, 4); if (!got.some(g => g[0] === t || g[1] === k && g[0] === t)) got.push([t, k]); }
  return { m: 'pairs', say: 'Соедини сложение и такое же умножение.', pairs: got.map(([t, k]) => [{ t: Array(k).fill(t).join(' + '), small: true }, `${t} × ${k}`]) };
});
def('array', 'X', 'ряды и столбики', (r, rmax, cmin, cmax) => {
  const rows = rint(r, 2, rmax), cols = rint(r, cmin, cmax);
  return { m: 'array', say: `Закрась клетки: в высоту ${rows}, в ширину ${cols}. Нажми на клетку — закрасится прямоугольник. Потом нажми галочку.`, rows, cols, key: 'arr' + rows + cols };
});

// ===== ЧТЕНИЕ ВСЛУХ С ЗАПИСЬЮ =====
// Ребёнок читает в микрофон, слушает себя и образец. Распознавания речи нет: оценивает он сам и родитель.
def('readW', 'R', 'чтение вслух', (r, s, f) => {
  const w = pickR(r, pool(s, f, false, 1));
  return { m: 'readaloud', say: 'Прочитай слово вслух. Нажми на микрофон, прочитай и нажми ещё раз. Потом послушай себя и меня.', text: disp(w.w, s), sample: tokW(w.w), key: 'ra' + w.w };
});
def('readS', 'R', 'чтение вслух', (r, s, lo, hi) => {
  const p = sentPool(s, lo, hi);
  if (!p.length) return call('readW', r, s);
  const x = pickR(r, p);
  return { m: 'readaloud', say: 'Прочитай предложение вслух. Нажми на микрофон, прочитай и нажми ещё раз. Потом послушай себя и меня.', text: x.t, sample: x.t, key: 'ra' + x.t };
});
def('readT', 'R', 'чтение вслух', (r, set, ti) => {
  const t = pickR(r, textOf(set, ti).s);
  return { m: 'readaloud', say: 'Прочитай предложение из рассказа вслух. Нажми на микрофон, прочитай и нажми ещё раз. Потом послушай себя и меня.', text: t, sample: t, key: 'ra' + t };
});

// ===== ВРЕМЯ И ДЕНЬГИ =====
const HOURS = ['час', 'часа', 'часов'];
const clockSay = (h, m) => `${h} ${pl(h, HOURS)}${m ? ' 30 минут' : ' ровно'}`;
def('clockFind', 'M', 'часы', (r, half) => {
  const m = half ? 30 : 0, h = rint(r, 1, 12), opts = shuffle(r, [h, ...sample(r, range(1, 12).filter(x => x !== h), 2)]).map(x => ({ h: x, m }));
  return { m: 'clock', say: `Найди часы, которые показывают ${clockSay(h, m)}. Короткая стрелка показывает час.`, opts, a: opts.findIndex(o => o.h === h), key: 'cf' + h + m };
});
def('clockRead', 'M', 'часы', (r, half) => {
  const m = half ? 30 : 0, h = rint(r, 1, 12), txt = x => `${x}:${m ? '30' : '00'}`;
  return { m: 'clock', say: 'Который час? Посмотри на короткую стрелку и выбери ответ.', show: { h, m }, key: 'cr' + h + m, ...mk(r, txt(h), sample(r, range(1, 12).filter(x => x !== h), 2).map(txt), 2) };
});
const DAYPARTS = [['Когда мы завтракаем?', 0], ['Когда встаёт солнышко?', 0], ['Когда мы обедаем?', 1], ['Когда солнце высоко в небе?', 1], ['Когда мы ужинаем?', 2], ['Когда солнце садится?', 2], ['Когда на небе звёзды?', 3], ['Когда все спят?', 3]];
def('daypart', 'M', 'утро, день, вечер, ночь', r => {
  const [q, a] = pickR(r, DAYPARTS);
  return { m: 'pick', say: `${q} Утром, днём, вечером или ночью?`, opts: ['🌅', '☀️', '🌇', '🌙'], a, key: 'dp' + q };
});
const WD = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const WD_INS = ['понедельником', 'вторником', 'средой', 'четвергом', 'пятницей', 'субботой', 'воскресеньем'];
const WD_GEN = ['понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы', 'воскресенья'];
def('weekday', 'M', 'дни недели', (r, mode) => {
  const i = rint(r, 0, 6), others = k => sample(r, WD.filter((_, j) => j !== k), 2);
  if (mode === 'order') { const a = rint(r, 0, 3); return { m: 'build', wide: true, say: `Расставь дни недели по порядку. Первый — ${WD[a]}.`, target: WD.slice(a, a + 4), extra: [], key: 'wo' + a }; }
  const j = mode === 'prev' ? (i + 6) % 7 : (i + 1) % 7;
  const say = mode === 'next' ? `Какой день недели идёт после ${WD_GEN[i]}?` : mode === 'prev' ? `Какой день недели идёт перед ${WD_INS[i]}?` : `Сегодня ${WD[i]}. Какой день будет завтра?`;
  return { m: 'pick', say, longOpts: true, show: {}, key: 'wd' + mode + i, ...mk(r, WD[j], others(j), 2) };
});
const SEASONS = ['зима', 'весна', 'лето', 'осень'], SEASON_PIC = [['⛄', '❄️', '🎿'], ['🌷', '🌱', '🐣'], ['🏖️', '🍓', '🌻'], ['🍂', '🍄', '☔']];
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const seasonOf = m => [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0][m];
def('season', 'M', 'времена года', r => {
  const a = rint(r, 0, 3);
  return { m: 'pick', say: 'Посмотри на картинку. Какое это время года?', show: { big: pickR(r, SEASON_PIC[a]) }, opts: SEASONS, a, key: 'se' + a + rint(r, 0, 2) };
});
def('month', 'M', 'месяцы', (r, mode) => {
  const i = rint(r, 0, 11);
  if (mode === 'next') { const j = (i + 1) % 12; return { m: 'pick', say: `Какой месяц идёт после ${MONTHS_GEN[i]}?`, longOpts: true, show: {}, key: 'mn' + i, ...mk(r, MONTHS[j], sample(r, MONTHS.filter((_, k) => k !== j), 2), 2) }; }
  return { m: 'pick', say: `${cap(MONTHS[i])}. Какое это время года?`, show: { text: MONTHS[i], long: true }, opts: SEASONS, a: seasonOf(i), key: 'mo' + i };
});
def('coinSum', 'M', 'счёт монетками', (r, n) => {
  const coins = Array.from({ length: n }, () => pickR(r, [1, 2, 5, 10])).sort((a, b) => b - a), sum = coins.reduce((a, b) => a + b, 0);
  return { m: 'keypad', say: 'Сколько всего рублей? Сложи все монетки и набери ответ.', text: coins.map(c => `${c} ₽`).join(' + ') + ' =', a: sum, key: 'cs' + coins.join('') };
});
def('change', 'M', 'счёт монетками', (r, max) => {
  const have = pickR(r, [10, 10, 20].filter(x => x <= max)), price = rint(r, 2, have - 1);
  return { m: 'keypad', say: `Цена игрушки — ${price} ${pl(price, ['рубль', 'рубля', 'рублей'])}. У тебя ${have} рублей. Сколько сдачи тебе дадут?`, text: `${have} − ${price} =`, a: have - price, key: 'chg' + have + price };
});

// ===== ДЕЛЕНИЕ =====
// Раздай поровну: ребёнок сам раскладывает предметы по тарелкам.
def('share', 'D', 'деление поровну', (r, k, qmax) => {
  const q = rint(r, 1, qmax), o = obj(r, GRP);
  return { m: 'share', say: `Раздай поровну. Тут ${k * q} ${f(o, k * q)} и ${k} ${pl(k, ['тарелка', 'тарелки', 'тарелок'])}. Нажимай на тарелки по очереди, чтобы на каждой было одинаково. Потом нажми галочку.`, k, q, emoji: o[3], key: 'share' + k + '_' + q };
});
const DBOX = [[['тарелка', 'тарелки', 'тарелок'], 'на', 'на каждой', ['apple', 'pear', 'cookie', 'candy']], [['коробка', 'коробки', 'коробок'], 'в', 'в каждой', ['candy', 'car', 'balloon']], [['корзинка', 'корзинки', 'корзинок'], 'в', 'в каждой', ['mushroom', 'apple']]];
def('problemD', 'D', t => `задачи на деление на ${t}`, (r, t) => {
  const q = rint(r, 2, 6), a = t * q, [box, prep, each, keys] = pickR(r, DBOX), o = obj(r, keys);
  const text = `${a} ${f(o, a)} разложили поровну: ${prep} ${t} ${pl(t, box)}. Сколько ${o[2]} ${each}?`;
  return { m: 'problem', say: `Послушай задачу. ${text} Сначала выбери знак, потом набери ответ.`, text, op: '÷', ops: ['−', '÷'], a: q, expr: `${a} ÷ ${t} = ${q}`, pic: a <= 12 ? { e: o[3], a, b: 0 } : null, key: 'pd' + text };
});
def('signMD', 'D', 'умножение и деление', (r, k) => {
  let e;
  do { e = example(pickR(r, [k, k.replace('d', 'x') + 'c']), r); } while (e.a === 1 || e.b === 1 || e.a * e.b === e.a / e.b); // с единицей подошли бы оба знака
  const opts = ['×', '÷'];
  return { m: 'pick', say: 'Какой знак спрятался: умножить или разделить?', show: { text: `${e.a} ? ${e.b} = ${e.res}` }, opts, a: opts.indexOf(e.op), key: 'smd' + e.text };
});
for (const n of ['exKey', 'exPick', 'exBub', 'exFish', 'exTF', 'exPairs', 'exMem', 'exGap']) def('d' + n, 'D', exName, G[n].fn);

// Те же игры с примерами, но в линии «Умножение»
for (const n of ['exKey', 'exPick', 'exBub', 'exFish', 'exTF', 'exPairs', 'exMem', 'exGap']) def('x' + n, 'X', exName, G[n].fn);
def('xstones', 'X', G.stones.label, G.stones.fn);
def('xgap', 'X', (lo, hi, step) => `счёт через ${step}`, G.gap.fn);
def('xtrain', 'X', (lo, hi, step) => `счёт через ${step}`, G.train.fn);

// ---------- общий вход ----------
export const LINES = { R: 'Буквы и чтение', W: 'Письмо', M: 'Счёт', X: 'Умножение', D: 'Деление' };
export const lineOf = src => G[src[0]].line;
export function labelOf(src) {
  const g = G[src[0]];
  return typeof g.label === 'function' ? g.label(...src.slice(1)) : g.label;
}
export const hasGen = name => !!G[name];

// Подстройка сложности: level < 0 — проще (меньше лишнего на экране), level > 0 — чуть труднее.
// Правильный ответ и смысл задания не меняются.
export function adjust(t, level, r) {
  if (!level) return t;
  if (level < 0) {
    if (Array.isArray(t.opts) && t.opts.length > 2 && typeof t.a === 'number' && !t.steps && t.m !== 'clock') { // оставляем верный ответ и один неверный
      const keep = [t.opts[t.a], t.opts.find((_, i) => i !== t.a)], sh = shuffle(r, keep);
      t.a = sh.indexOf(keep[0]); t.opts = sh;
    }
    if (t.extra?.length) t.extra = [];                                              // без лишних букв
    if (t.items && t.target != null) {                                              // меньше пузырей и рыбок
      const isT = x => String(x).toUpperCase() === String(t.target).toUpperCase();
      t.items = shuffle(r, [...t.items.filter(isT), ...t.items.filter(x => !isT(x)).slice(0, 3)]);
    }
    if (t.m === 'pairs' || t.m === 'memory') t.pairs = t.pairs.slice(0, Math.max(2, t.pairs.length - 1));
  } else {
    if (t.items && t.target != null && t.items.length < 12) t.items = shuffle(r, [...t.items, ...t.items.filter(x => String(x).toUpperCase() !== String(t.target).toUpperCase()).slice(0, 3)]);
    if (t.extra && t.m === 'build' && !t.wide && t.extra.length && t.extra.length < 4) t.extra = [...t.extra, ...sample(r, ORDER.split('').filter(x => !t.target.includes(x) && !t.extra.includes(x)), 1)];
  }
  t.adjusted = level;
  return t;
}

// Построить задание по рецепту.
export function makeTask(src, r) {
  const g = G[src[0]];
  if (!g) throw new Error('Нет генератора: ' + src[0]);
  const t = g.fn(r, ...src.slice(1));
  t.src = src;
  return t;
}

// Собрать занятие: задания уровня + то, в чём ребёнок раньше ошибался (weak — список рецептов).
export function buildSession(level, weak, r) {
  const seen = new Set(), out = [];
  const add = (src, fromWeak) => {
    let t;
    for (let i = 0; i < 6; i++) { t = makeTask(src, r); if (!t.key || !seen.has(t.key)) break; }
    if (t.key) seen.add(t.key);
    t.fromWeak = fromWeak;
    out.push(t);
  };
  level.tasks.forEach(src => add(src, false));
  const own = new Set(level.tasks.map(s => JSON.stringify(s)));
  const extra = (weak || []).filter(s => hasGen(s[0]) && !own.has(JSON.stringify(s))).slice(0, level.review ? 3 : 2);
  for (const src of extra) if (out.length < 10) add(src, true);
  return out;
}

// ---------- проверка задания на целостность (для автоматических проверок) ----------
export const MECHANICS = ['bubbles', 'fish', 'find', 'pick', 'listen', 'memory', 'pairs', 'baskets', 'build', 'missing', 'claps',
  'truefalse', 'story', 'trace', 'copy', 'draw', 'drawtask', 'count', 'feed', 'train', 'compare', 'house', 'numline', 'keypad',
  'tenframe', 'shop', 'problem', 'dots', 'stones', 'paint', 'chart', 'groups', 'array', 'share', 'clock', 'readaloud'];

export function checkTask(t) {
  const bad = why => { throw new Error(`${JSON.stringify(t.src)}: ${why}`); };
  if (!MECHANICS.includes(t.m)) bad('неизвестная механика ' + t.m);
  if (/(^|[^а-яё])(стоит|замок|числа|слова|ряда|руки|носки|очки)([^а-яё]|$)/i.test(t.say.replace(/Собери предложение.*$/, ''))) bad('слово с двояким ударением в озвучке: ' + t.say);
  if (!t.say || /[a-z]/i.test(t.say) || /undefined|NaN|null/.test(t.say)) bad('плохой текст озвучки: ' + t.say);
  const optsOk = () => { if (!Array.isArray(t.opts) || t.opts.length < 2 || !(t.a >= 0 && t.a < t.opts.length)) bad('плохие варианты ответа'); const k = t.opts.map(o => JSON.stringify(o)); if (new Set(k).size !== k.length) bad('повторяются варианты'); };
  const num = (x, lo = 0) => { if (!Number.isInteger(x) || x < lo) bad('плохое число ' + x); };
  switch (t.m) {
    case 'bubbles': case 'fish': case 'find': {
      const up = x => String(x).toUpperCase(), n = t.items.filter(x => up(x) === up(t.target)).length;
      if (n < 1 || n === t.items.length) bad('нет нужных или нет лишних'); break;
    }
    case 'pick': case 'listen': case 'story': case 'missing': case 'house': case 'count': optsOk(); break;
    case 'memory': case 'pairs': {
      if (t.pairs.length < 2) bad('мало пар');
      const k = x => (typeof x === 'object' ? x.t : x), all = t.pairs.flat().map(k);
      if (new Set(all).size !== all.length) bad('повторы в парах'); break;
    }
    case 'baskets': if (!t.items.some(i => i.bin === 0) || !t.items.some(i => i.bin === 1)) bad('пустая корзина'); break;
    case 'build': if (!t.target.length || t.target.some(x => !x)) bad('пустая цель'); break;
    case 'claps': num(t.n, 1); break;
    case 'truefalse': if (typeof t.a !== 'boolean' || !t.text) bad('нет ответа'); break;
    case 'trace': case 'copy': if (!t.text && !t.shape) bad('нечего обводить'); break;
    case 'draw': break;
    case 'drawtask': if (t.op && t.op !== '×') { for (let n = 1; n <= t.max; n++) { num(t.ans(n)); if (/undefined|NaN/.test(t.q(n))) bad('плохой вопрос'); } } break;
    case 'feed': case 'paint': num(t.n); if (t.total <= t.n) bad('не хватает предметов'); break;
    case 'train': if (new Set(t.nums).size !== t.nums.length || t.nums.length < 3) bad('плохой поезд'); break;
    case 'compare': num(t.a); num(t.b); break;
    case 'numline': if (t.to < t.lo || t.to > t.hi || t.from < t.lo || t.from > t.hi) bad('ответ вне прямой'); break;
    case 'keypad': case 'problem': num(t.a); break;
    case 'tenframe': num(t.n, 1); if (t.n > 100) bad('слишком большое'); break;
    case 'shop': num(t.price, 1); break;
    case 'dots': num(t.n, 3); break;
    case 'stones': t.steps.forEach((s, i) => { if (+s.opts[s.a] !== t.seq[i]) bad('камушки'); }); break;
    case 'chart': if (t.target < t.lo || t.target > t.hi) bad('число вне таблицы'); break;
    case 'groups': if (t.ask === 'equal') { if (t.a !== t.counts.every(c => c === t.counts[0])) bad('поровну?'); } else optsOk(); break;
    case 'clock': optsOk(); break;
    case 'readaloud': if (!t.text || !t.sample) bad('нечего читать'); break;
    case 'share': num(t.k, 2); num(t.q, 1); if (t.k * t.q > 24) bad('слишком много предметов'); break;
    case 'array': num(t.rows, 1); num(t.cols, 1); if (t.rows > 5 || t.cols > 6) bad('не влезет'); break;
  }
  return true;
}
