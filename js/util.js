// Мелкие общие помощники. Файл работает и в браузере, и в проверках (без экрана).

// Создать элемент: h('div', {class:'x', onclick: fn}, ребёнок1, ребёнок2)
export function h(tag, props, ...kids) {
  const svg = ['svg', 'path', 'circle', 'ellipse', 'rect', 'line', 'polygon', 'polyline', 'g', 'text'].includes(tag);
  const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

// Генератор случайных чисел с зерном: одинаковое зерно — одинаковые задания (нужно для проверок)
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rint = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1)); // целое от lo до hi
export const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];
export function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const sample = (r, arr, n) => shuffle(r, arr).slice(0, n);
export const range = (lo, hi, step = 1) => {
  const a = [];
  for (let x = lo; x <= hi; x += step) a.push(x);
  return a;
};
export const uniq = arr => [...new Set(arr)];

// Русское склонение после числа: pl(3, ['яблоко','яблока','яблок']) → 'яблока'
export function pl(n, f) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return f[2];
  if (b === 1) return f[0];
  if (b >= 2 && b <= 4) return f[1];
  return f[2];
}

// Сегодняшняя дата строкой ГГГГ-ММ-ДД (по местному времени)
export function today(d = new Date()) {
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
