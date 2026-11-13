// ПРОВЕРКА «Ы» И «И» ПО САМОМУ ЗВУКУ. Распознавание речи пишет «и» в обоих случаях, а голос отдельную «ы» произносит как «и».
// Поэтому эти две буквы проверяем измерением резонансов рта (формант): у «и» второй резонанс около 2700 Гц, у «ы» — 1500–2350 Гц.
// Букву «ы» берём из слова, где голос говорит её правильно («сыр»), и растягиваем.

const toS = pcm => new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + (pcm.length & ~1)));

// Пики спектра по кадрам (шаг 10 мс, окно 30 мс): линейное предсказание, порядок 18. Тихие кадры — null.
export function formants(pcm) {
  const s = toS(pcm), W = 480, P = 18, rows = [], en = [];
  let top = 0;
  for (let at = 0; at + W <= s.length; at += 160) { let e = 0; for (let j = at; j < at + W; j++) e += s[j] * s[j]; en.push(e); top = Math.max(top, e); }
  en.forEach((e, k) => {
    if (e < top * 0.15) { rows.push(null); return; }
    const at = k * 160, x = new Float64Array(W);
    for (let j = 0; j < W; j++) x[j] = (s[at + j] - 0.97 * (at + j ? s[at + j - 1] : 0)) * (0.54 - 0.46 * Math.cos((2 * Math.PI * j) / (W - 1)));
    const r = new Float64Array(P + 1);
    for (let i = 0; i <= P; i++) for (let j = i; j < W; j++) r[i] += x[j] * x[j - i];
    const a = new Float64Array(P + 1); a[0] = 1;
    let err = r[0] || 1;
    for (let i = 1; i <= P; i++) {
      let acc = r[i];
      for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
      const kk = -acc / err, t = a.slice();
      for (let j = 1; j < i; j++) t[j] = a[j] + kk * a[i - j];
      t[i] = kk; a.set(t); err *= 1 - kk * kk;
    }
    const env = [];
    for (let f = 150; f <= 4000; f += 25) { const w = (2 * Math.PI * f) / 16000; let re = 0, im = 0; for (let j = 0; j <= P; j++) { re += a[j] * Math.cos(w * j); im -= a[j] * Math.sin(w * j); } env.push([f, -10 * Math.log10(re * re + im * im)]); }
    const pk = [];
    for (let i = 1; i < env.length - 1; i++) if (env[i][1] > env[i - 1][1] && env[i][1] >= env[i + 1][1]) pk.push(env[i]);
    rows.push(pk);
  });
  return rows;
}
// Кадр звучит как «ы», если самый низкий резонанс выше 1000 Гц лежит между 1500 и 2350 Гц,
// а нижний резонанс — не выше 650 Гц (у «э» он около 800 Гц).
const isY = pk => { const up = pk.filter(p => p[0] > 1000 && p[1] > 0), low = pk.filter(p => p[0] <= 1000).sort((x, y) => y[1] - x[1])[0]; return up.length > 0 && up[0][0] >= 1500 && up[0][0] <= 2350 && !!low && low[0] <= 650; };
// Доля звучащих кадров, похожих на «ы» (от 0 до 1).
export function yShare(pcm) { const rows = formants(pcm).filter(Boolean); return rows.filter(isY).length / (rows.length || 1); }
// Какой должна быть эта доля: [от, до].
export const SOUND_RANGE = { И: [0, 0.15], Ы: [0.85, 1] };

// Самый длинный непрерывный кусок «ы» в слове: [начало, конец] в отсчётах.
function yRun(pcm) {
  const rows = formants(pcm);
  let best = [0, 0], a = -1;
  rows.forEach((pk, i) => {
    const y = !!pk && isY(pk);
    if (y && a < 0) a = i;
    if (a >= 0 && (!y || i === rows.length - 1)) { const b = y ? i + 1 : i; if (b - a > best[1] - best[0]) best = [a, b]; a = -1; }
  });
  return [best[0] * 160 + 160, best[1] * 160 + 160]; // середины окон
}
// Вырезать «ы» из слова и растянуть до нужной длины: повторяем серединку целыми периодами голоса с плавными стыками.
// Возвращает запись (PCM 16 кГц) или null, если «ы» в слове слишком короткая.
export function longY(wordPcm, seconds = 0.55) {
  const [from, to] = yRun(wordPcm);
  if (to - from < 1600) return null; // меньше 0,1 с — не из чего собирать
  return sustain(toS(wordPcm), from + 240, to - 240, seconds); // отступаем от согласных
}
// Растянуть кусок голоса [a, b) до нужной длины.
function sustain(s, a, b, seconds) {
  // период голоса: сдвиг, при котором кусок больше всего похож сам на себя (150–330 Гц)
  let T = 60, bestC = -Infinity;
  for (let lag = 48; lag <= 107; lag++) { let c = 0, n1 = 0, n2 = 0; for (let j = a; j + lag < b; j++) { c += s[j] * s[j + lag]; n1 += s[j] * s[j]; n2 += s[j + lag] * s[j + lag]; } c /= Math.sqrt(n1 * n2) || 1; if (c > bestC) { bestC = c; T = lag; } }
  const L = Math.floor((b - a - T) / T) * T; // длина повторяемого куска — целое число периодов
  if (L < 4 * T) return null;
  // выравниваем громкость куска, чтобы при повторе звук не «пульсировал»
  const src = new Float64Array(L + T), rms = at => { let e = 0; for (let j = at - T; j < at + T; j++) e += s[j] * s[j]; return Math.sqrt(e / (2 * T)) || 1; };
  const mid = rms(a + ((L + T) >> 1));
  for (let j = 0; j < L + T; j++) src[j] = (s[a + j] * mid) / rms(a + j);
  const need = Math.round(seconds * 16000), out = new Float64Array(need + L + T);
  let pos = 0;
  while (pos < need) { // кладём кусок за куском; на стыке длиной в один период — плавный переход
    for (let j = 0; j < L + T; j++) { const w = j < T ? j / T : j >= L ? 1 - (j - L) / T : 1; out[pos + j] += src[j] * (pos === 0 && j < T ? 1 : w); }
    pos += L;
  }
  const res = new Int16Array(need + 3200), fin = 640, fout = 2400; // плавное начало 40 мс и затухание 150 мс, потом тишина
  let peak = 1; for (let i = 0; i < need; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = 18000 / peak; // громкость как у остальных букв
  for (let i = 0; i < need; i++) res[i] = Math.round(out[i] * gain * Math.min(1, i / fin) * Math.min(1, (need - i) / fout));
  return Buffer.concat([Buffer.alloc(1600), Buffer.from(res.buffer)]);
}

// ---------- СОГЛАСНЫЕ, КОТОРЫЕ ГОЛОС НЕ УМЕЕТ СКАЗАТЬ ОТДЕЛЬНО ----------
// «Щ», «К», «Х» по отдельности сервис произносит названием буквы («ща», «ка», «ха»).
// Чистый звук вырезаем из короткого слова, которое распознавание услышало верно.
// Кадры по 10 мс: громкость, доля низких частот (так слышен голос), «центр тяжести» спектра в герцах.
function frames(pcm) {
  const s = toS(pcm), W = 320, out = [];
  for (let at = 0; at + W <= s.length; at += 160) {
    let e = 0, lo = 0, all = 0, cen = 0;
    for (let j = at; j < at + W; j++) e += s[j] * s[j];
    for (let f = 150; f <= 7500; f += 150) {
      const c = 2 * Math.cos((2 * Math.PI * f) / 16000);
      let a = 0, q = 0;
      for (let j = at; j < at + W; j++) { const x = s[j] * (0.5 - 0.5 * Math.cos((2 * Math.PI * (j - at)) / W)) + c * a - q; q = a; a = x; }
      const p = a * a + q * q - c * a * q; all += p; cen += p * f; if (f <= 750) lo += p;
    }
    out.push({ e, lo: lo / (all || 1), cen: cen / (all || 1) });
  }
  const top = Math.max(...out.map(x => x.e)); out.top = top;
  for (const x of out) { x.on = x.e >= top * 0.002; x.loud = x.e >= top * 0.25; x.voice = x.lo > 0.5; }
  return out;
}
// Самый длинный непрерывный ряд кадров, подходящих под условие: [первый, после последнего].
function longest(fr, test, from = 0, to = fr.length) {
  let best = [0, 0], a = -1;
  for (let i = from; i <= to; i++) { const y = i < to && test(fr[i], i); if (y && a < 0) a = i; if (!y && a >= 0) { if (i - a > best[1] - best[0]) best = [a, i]; a = -1; } }
  return best;
}
// Кусок записи с плавными краями, нужной громкости и тишиной вокруг. Если задана длина (в секундах), шум
// продлевается: тот же кусок повторяется внахлёст с плавными переходами по 15 мс (у шума нет периода, стыков не слышно).
function piece(s, a, b, peakTo, fin = 80, fout = 320, seconds = 0) {
  let out = Float64Array.from(s.subarray(a, b)), peak = 1;
  const need = Math.round(seconds * 16000), X = 240;
  if (need > out.length && out.length > 4 * X) {
    const src = out, step = src.length - X; out = new Float64Array(need);
    for (let pos = 0; pos < need; pos += step) for (let j = 0; j < src.length && pos + j < need; j++) {
      const w = (pos > 0 && j < X ? Math.sin((Math.PI / 2) * (j / X)) : 1) * (j >= step ? Math.cos((Math.PI / 2) * ((j - step) / X)) : 1);
      out[pos + j] += src[j] * w;
    }
  }
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const res = new Int16Array(out.length + 3200);
  for (let i = 0; i < out.length; i++) res[i] = Math.round(((out[i] * peakTo) / peak) * Math.min(1, i / fin) * Math.min(1, (out.length - i) / fout));
  return Buffer.concat([Buffer.alloc(1600), Buffer.from(res.buffer)]);
}
// Какие буквы вырезаются из слова и какой гласный приставить для проверки: распознавание должно услышать слог.
// Для «К» гласный не приставляем: к щелчку оставлен коротенький хвостик гласного (иначе это просто щелчок), и распознавание
// должно услышать «к», «ка» или «кэ».
export const CUT = { К: [null, 'к', 'ка', 'кэ', 'кы'], Х: ['а', 'ха'], Щ: ['и', 'щи'] };
// Вырезать звук буквы из записи слова. Возвращает { pcm, note } или null, если кусок не похож на нужный звук.
export function cutSound(L, wordPcm) {
  const s = toS(wordPcm), fr = frames(wordPcm), first = fr.findIndex(x => x.on), vowel = longest(fr, x => x.voice && x.e >= fr.top * 0.1); // гласный — самое длинное место с голосом
  if (first < 0 || vowel[1] - vowel[0] < 4) return null;
  const ms = n => n * 10, at = i => i * 160;
  if (L === 'К') { // щелчок до начала гласного: глухой и короткий
    const a = first, b = fr.findIndex(x => x.loud); // гласный начинается там, где звук набрал силу
    if (b - a < 2 || b - a > 9) return null;
    return { pcm: piece(s, Math.max(0, at(a) - 160), at(b) + 1120, 14000, 16, 800), note: `щелчок ${ms(b - a)} мс и 70 мс призвука` };
  }
  if (L === 'Щ') { // шипение до гласного: без голоса, центр спектра выше 3000 Гц (у «ш» он ниже)
    const [a, b] = longest(fr, x => x.on && !x.voice && x.cen >= 3000, first, vowel[0] + 1);
    if (b - a < 10) return null;
    const cen = fr.slice(a, b).reduce((t, x) => t + x.cen, 0) / (b - a);
    return { pcm: piece(s, at(a) + 160, at(b), 9000, 480, 1200, 0.4), note: `шипение ${ms(b - a)} мс, продлено до 0,4 с, центр спектра ${Math.round(cen)} Гц` };
  }
  if (L === 'Х') { // шум после гласного: без голоса, тихий
    const [a, b] = longest(fr, x => x.on && !x.voice && x.cen >= 1300, vowel[1], fr.length);
    if (b - a < 10) return null;
    const cen = fr.slice(a, b).reduce((t, x) => t + x.cen, 0) / (b - a);
    return { pcm: piece(s, at(a) + 160, at(b), 8000, 480, 1200, 0.35), note: `шум ${ms(b - a)} мс, продлён до 0,35 с, центр спектра ${Math.round(cen)} Гц` };
  }
  return null;
}
// Проверка готовой записи согласного по звуку: [подходит ли, пояснение].
export function soundCheck(L, pcm) {
  const fr = frames(pcm).filter(x => x.on), n = fr.length || 1, voiced = fr.filter(x => x.voice).length / n, cen = fr.reduce((t, x) => t + x.cen, 0) / n, sec = fr.length / 100;
  const ok = L === 'К' ? sec <= 0.2 : L === 'Щ' ? voiced < 0.1 && cen >= 3000 : L === 'Х' ? voiced < 0.2 && cen >= 1300 && cen < 3000 : L === 'Н' ? voiced > 0.85 && cen < 700 : true;
  return [ok, `звучит ${sec.toFixed(2)} с, с голосом ${Math.round(voiced * 100)}% кадров, центр спектра ${Math.round(cen)} Гц`];
}
// Приставить к звуку короткий гласный (для проверки распознаванием): тишина по краям срезается, гласный — первые полсекунды.
export function glue(soundPcm, vowelPcm, vowelSec = 0.5) {
  const strip = p => { const s = toS(p); let a = 0, b = s.length; while (a < b && Math.abs(s[a]) < 300) a++; while (b > a && Math.abs(s[b - 1]) < 300) b--; return s.subarray(a, b); };
  const c = strip(soundPcm), v = Int16Array.from(strip(vowelPcm).subarray(0, Math.round(vowelSec * 16000)));
  for (let i = 0; i < 1600 && i < v.length; i++) v[v.length - 1 - i] = Math.round((v[v.length - 1 - i] * i) / 1600);
  return Buffer.concat([Buffer.alloc(6400), Buffer.from(c.buffer, c.byteOffset, c.length * 2), Buffer.from(v.buffer), Buffer.alloc(9600)]);
}
// Срезать тишину по краям записи (оставляем 50 мс до звука и 150 мс после), чтобы буква звучала сразу.
export function trimSilence(pcm) {
  const s = toS(pcm); let m = 1, a = 0, b = s.length;
  for (const v of s) m = Math.max(m, Math.abs(v));
  while (a < b && Math.abs(s[a]) < m * 0.03) a++;
  while (b > a && Math.abs(s[b - 1]) < m * 0.03) b--;
  a = Math.max(0, a - 800); b = Math.min(s.length, b + 2400);
  return pcm.subarray(a * 2, b * 2);
}
