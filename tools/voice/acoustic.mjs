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
  const s = toS(wordPcm), [from, to] = yRun(wordPcm);
  if (to - from < 1600) return null; // меньше 0,1 с — не из чего собирать
  const a = from + 240, b = to - 240; // отступаем от согласных
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
