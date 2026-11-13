// РИСУНКИ: помощник Лумик, звери-наклейки, острова. Всё нарисовано своими простыми фигурами (вектор).

// ---------- Лумик, помощник ребёнка ----------
// colors — цвета частей (их выбирает ребёнок), mood — настроение: ok | happy | sleep | think
export function heroSVG(c, mood = 'ok') {
  const eye = x => (mood === 'sleep'
    ? `<path d="M${x - 13} 92 q13 10 26 0" fill="none" stroke="#2b2d42" stroke-width="5" stroke-linecap="round"/>`
    : `<circle cx="${x}" cy="90" r="17" fill="#fff"/><circle cx="${x + (mood === 'think' ? 4 : 0)}" cy="${mood === 'happy' ? 88 : 92}" r="9" fill="#2b2d42"/><circle cx="${x + 3}" cy="87" r="3" fill="#fff"/>`);
  const mouth = mood === 'happy' ? '<path d="M78 116 Q100 146 122 116 Z" fill="#c9184a"/><path d="M90 128 Q100 138 110 128 Q100 124 90 128Z" fill="#ff8fa3"/>'
    : mood === 'sleep' ? '<circle cx="100" cy="122" r="6" fill="#c9184a"/>'
    : '<path d="M84 117 Q100 132 116 117" fill="none" stroke="#2b2d42" stroke-width="5" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 200 200" class="hero hero-${mood}">
    <g data-part="star" fill="${c.star}"><rect x="97" y="14" width="6" height="22" rx="3" fill="#2b2d42"/><polygon points="100,0 105,10 116,11 108,19 110,30 100,24 90,30 92,19 84,11 95,10"/></g>
    <g data-part="ears" fill="${c.ears}"><ellipse cx="48" cy="48" rx="24" ry="30" transform="rotate(-25 48 48)"/><ellipse cx="152" cy="48" rx="24" ry="30" transform="rotate(25 152 48)"/></g>
    <g data-part="feet" fill="${c.feet}"><ellipse cx="68" cy="184" rx="26" ry="13"/><ellipse cx="132" cy="184" rx="26" ry="13"/><ellipse class="hand hl" cx="24" cy="128" rx="13" ry="20"/><ellipse class="hand hr" cx="176" cy="128" rx="13" ry="20"/></g>
    <path data-part="body" fill="${c.body}" d="M100 30 C152 30 178 70 178 116 C178 166 146 188 100 188 C54 188 22 166 22 116 C22 70 48 30 100 30Z"/>
    <ellipse data-part="belly" fill="${c.belly}" cx="100" cy="146" rx="46" ry="34"/>
    <circle cx="58" cy="112" r="10" fill="#ff8fa3" opacity=".7"/><circle cx="142" cy="112" r="10" fill="#ff8fa3" opacity=".7"/>
    ${eye(74)}${eye(126)}${mouth}
  </svg>`;
}
export const HERO_PARTS = ['body', 'belly', 'ears', 'feet', 'star'];
export const PALETTE = ['#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#52b788', '#5bc0eb', '#1982c4', '#6a4c93', '#f15bb5', '#b08968', '#ffffff', '#495057'];

// ---------- звери-наклейки ----------
// [цвет, второй цвет, уши, особенности]
// уши: c острые, r круглые, l длинные, b большие, f висячие, h рожки, t хохолок, - нет
// особенности: w усы, m грива, s полоски, t хобот, b клюв, p пятна у глаз, n пятачок, q иголки, k маска,
//              f пятнышки, z светлая мордочка, c клешни, x фонтан, e глаза сверху, u кудряшки, d бородка
const ANIMALS = [
  ['#f6a94a', '#fff1d6', 'c', 'wz'], ['#f2634b', '#f2634b', '-', 'c'], ['#efe9e1', '#ffc2d1', 'l', 'w'], ['#b9bcc6', '#ffc2d1', 'b', 'w'],
  ['#ffffff', '#ffb703', '-', 'b'], ['#f27d2e', '#fff1d6', 'c', 'z'], ['#f5c04a', '#c9792b', 'r', 'm'], ['#a8713f', '#e6c9a8', 'r', 'z'],
  ['#9fb4cf', '#c9d6e8', 'b', 't'], ['#f59a2e', '#fff1d6', 'r', 'swz'], ['#ffffff', '#2b2d42', 'r', 'p'], ['#d9a066', '#8a5a2b', 'f', 'z'],
  ['#a9a9b3', '#e9e9ef', 'b', 'n'], ['#a86b3c', '#f0c9a0', 'b', 'z'], ['#f7a8b8', '#f48ba0', 'c', 'n'], ['#6cc24a', '#6cc24a', '-', 'e'],
  ['#ffffff', '#5c4033', 'h', 'fn'], ['#f4f1e8', '#3d3d3d', 'f', 'u'], ['#ffd84a', '#ff924c', 't', 'b'], ['#9a6b3f', '#e6c9a8', 'c', 'bp'],
  ['#2d3a4f', '#ffffff', '-', 'bz'], ['#f5c95a', '#b5651d', 'h', 'f'], ['#ffffff', '#2b2d42', 'c', 's'], ['#b79ac8', '#cdb4db', 'r', 'n'],
  ['#c9a27a', '#6b4423', 'r', 'qz'], ['#d9772e', '#fff1d6', 'c', 'z'], ['#a7a9ad', '#3d3d3d', 'c', 'kz'], ['#c98b4f', '#fff1d6', 'h', 'fz'],
  ['#e9e2d0', '#8d99ae', 'h', 'd'], ['#ffe066', '#ff924c', '-', 'b'], ['#f3c98b', '#fff1d6', 'r', 'zw'], ['#c9d6e2', '#eef3f8', '-', 'wz'],
  ['#8e97a6', '#e9ecef', 'c', 'z'], ['#b5733c', '#5c4033', 'c', 'mz'], ['#4f8fd9', '#cfe8ff', '-', 'xz'], ['#57c785', '#ffd43b', 'h', 'fz'],
  ['#6ea8fe', '#e7f5ff', '-', 'z'], ['#8bc34a', '#f1f8e9', '-', 'fz'],
];
export function animalSVG(i) {
  const [c, c2, ears, feat] = ANIMALS[i % ANIMALS.length], has = x => feat.includes(x), dark = '#2b2d42';
  const st = `stroke="${dark}" stroke-width="3"`;
  let back = '', front = '';
  const earMap = {
    c: `<polygon points="22,18 48,26 26,52" fill="${c}" ${st}/><polygon points="98,18 72,26 94,52" fill="${c}" ${st}/>`,
    r: `<circle cx="28" cy="30" r="15" fill="${ears === 'r' && has('p') ? c2 : c}" ${st}/><circle cx="92" cy="30" r="15" fill="${has('p') ? c2 : c}" ${st}/>`,
    l: `<ellipse cx="42" cy="18" rx="10" ry="26" fill="${c}" ${st}/><ellipse cx="78" cy="18" rx="10" ry="26" fill="${c}" ${st}/><ellipse cx="42" cy="20" rx="4" ry="16" fill="${c2}"/><ellipse cx="78" cy="20" rx="4" ry="16" fill="${c2}"/>`,
    b: `<circle cx="18" cy="48" r="22" fill="${c}" ${st}/><circle cx="102" cy="48" r="22" fill="${c}" ${st}/><circle cx="18" cy="48" r="12" fill="${c2}"/><circle cx="102" cy="48" r="12" fill="${c2}"/>`,
    f: `<ellipse cx="20" cy="56" rx="12" ry="24" fill="${c2}" ${st}/><ellipse cx="100" cy="56" rx="12" ry="24" fill="${c2}" ${st}/>`,
    h: `<path d="M40 30 q-8 -16 -2 -24 M80 30 q8 -16 2 -24" fill="none" stroke="${c2}" stroke-width="7" stroke-linecap="round"/><ellipse cx="22" cy="44" rx="13" ry="8" fill="${c}" ${st}/><ellipse cx="98" cy="44" rx="13" ry="8" fill="${c}" ${st}/>`,
    t: `<path d="M52 24 q-4 -18 8 -18 q-2 8 6 -2 q8 6 2 20z" fill="${c2}" ${st}/>`,
    '-': '',
  };
  back += earMap[ears];
  if (has('m')) back = `<circle cx="60" cy="62" r="50" fill="${c2}" ${st} stroke-dasharray="14 6"/>` + back;
  if (has('q')) back = `<path d="M10 62 L4 40 L20 46 L18 22 L36 34 L42 10 L56 28 L68 8 L78 30 L96 16 L96 40 L114 38 L106 60Z" fill="${c2}" ${st}/>` + back;
  if (has('c')) back += `<path d="M14 40 q-16 -12 -6 -28 q4 12 14 8 q-10 6 2 18z M106 40 q16 -12 6 -28 q-4 12 -14 8 q10 6 -2 18z" fill="${c}" ${st}/>`;
  if (has('x')) back += `<path d="M60 24 q-2 -14 -14 -16 M60 24 q2 -14 14 -16" fill="none" stroke="#74c0fc" stroke-width="5" stroke-linecap="round"/>`;
  if (has('e')) back += `<circle cx="40" cy="30" r="15" fill="${c}" ${st}/><circle cx="80" cy="30" r="15" fill="${c}" ${st}/>`;
  if (has('u')) front += `<path d="M30 38 q4 -16 16 -8 q6 -14 16 -2 q10 -12 16 2 q12 -8 14 10 q-30 10 -62 -2z" fill="#fff" ${st}/>`;
  if (has('z')) front += `<ellipse cx="60" cy="80" rx="24" ry="18" fill="${c2}"/>`;
  if (has('s')) front += `<path d="M22 50 l14 5 M20 66 l14 0 M98 50 l-14 5 M100 66 l-14 0 M52 22 l2 14 M68 22 l-2 14" stroke="${ANIMALS[i][1] === '#fff1d6' ? dark : c2}" stroke-width="5" stroke-linecap="round"/>`;
  if (has('f')) front += `<circle cx="30" cy="44" r="7" fill="${c2}"/><circle cx="88" cy="38" r="6" fill="${c2}"/><circle cx="92" cy="84" r="6" fill="${c2}"/>`;
  if (has('p')) front += `<ellipse cx="42" cy="58" rx="12" ry="14" fill="${c2}"/><ellipse cx="78" cy="58" rx="12" ry="14" fill="${c2}"/>`;
  if (has('k')) front += `<path d="M18 52 q42 -14 84 0 q-4 22 -42 14 q-38 8 -42 -14z" fill="${c2}"/>`;
  const ey = has('e') ? 30 : 58, light = has('p') || has('k');
  front += `<circle cx="42" cy="${ey}" r="6" fill="${light ? '#fff' : dark}"/><circle cx="78" cy="${ey}" r="6" fill="${light ? '#fff' : dark}"/>` + (light ? `<circle cx="42" cy="${ey}" r="3" fill="${dark}"/><circle cx="78" cy="${ey}" r="3" fill="${dark}"/>` : `<circle cx="44" cy="${ey - 2}" r="2" fill="#fff"/><circle cx="80" cy="${ey - 2}" r="2" fill="#fff"/>`);
  front += '<circle cx="26" cy="76" r="7" fill="#ff8fa3" opacity=".6"/><circle cx="94" cy="76" r="7" fill="#ff8fa3" opacity=".6"/>';
  if (has('b')) front += `<polygon points="48,70 72,70 60,88" fill="${c2 === '#ffffff' || c2 === '#e6c9a8' ? '#ff924c' : c2}" ${st}/>`;
  else if (has('t')) front += `<path d="M52 70 q8 -6 16 0 q2 26 -6 34 q-10 4 -8 -8 q4 -8 -2 -26z" fill="${c}" ${st}/>`;
  else if (has('n')) front += `<ellipse cx="60" cy="82" rx="20" ry="14" fill="${c2 === '#5c4033' ? '#ffc2d1' : c2}" ${st}/><circle cx="53" cy="82" r="3" fill="${dark}"/><circle cx="67" cy="82" r="3" fill="${dark}"/>`;
  else front += `<ellipse cx="60" cy="74" rx="6" ry="4" fill="${dark}"/><path d="M60 78 q-8 12 -16 4 M60 78 q8 12 16 4" fill="none" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>`;
  if (has('w')) front += `<path d="M30 78 l-22 -5 M30 84 l-22 3 M90 78 l22 -5 M90 84 l22 3" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>`;
  if (has('d')) front += `<path d="M52 104 q8 16 16 0z" fill="${c}" ${st}/>`;
  return `<svg viewBox="-8 -8 136 128" class="animal">${back}<ellipse cx="60" cy="62" rx="44" ry="42" fill="${c}" ${st}/>${front}</svg>`;
}

// ---------- остров на карте ----------
export const LINE_COLOR = { R: '#ff6b6b', W: '#9b5de5', M: '#2a9d8f', X: '#f77f00', D: '#d6336c' };
const LINE_SIGN = { R: 'Аа', W: '✎', M: '123', X: '×', D: '÷' };
export function islandSVG(line, locked) {
  const col = locked ? '#adb5bd' : LINE_COLOR[line], green = locked ? '#ced4da' : '#80ed99', sand = locked ? '#e9ecef' : '#ffe8a3';
  return `<svg viewBox="0 0 200 150" class="island-pic">
    <ellipse cx="100" cy="122" rx="96" ry="22" fill="#fff" opacity=".45"/>
    <ellipse cx="100" cy="112" rx="88" ry="26" fill="${sand}"/>
    <path d="M30 108 Q60 30 100 52 Q140 20 172 108 Z" fill="${green}"/>
    <rect x="142" y="52" width="6" height="52" rx="3" fill="#8d6e63"/>
    <path d="M145 56 q-26 -16 -34 4 q18 -8 34 -4 q-10 -26 -30 -22 q22 0 30 22 q8 -26 30 -20 q-22 2 -30 20 q24 -10 34 6 q-18 -8 -34 -6z" fill="${locked ? '#adb5bd' : '#38b000'}"/>
    <rect x="46" y="52" width="74" height="46" rx="10" fill="#fff" stroke="${col}" stroke-width="5"/>
    <text x="83" y="86" text-anchor="middle" font-size="${LINE_SIGN[line].length > 2 ? 26 : 34}" font-weight="800" fill="${col}" font-family="system-ui,sans-serif">${LINE_SIGN[line]}</text>
  </svg>`;
}

export const starSVG = on => `<svg viewBox="0 0 40 40" class="star ${on ? 'on' : ''}"><polygon points="20,2 25.5,14 38,15.5 28.5,24 31,37 20,30.5 9,37 11.5,24 2,15.5 14.5,14" fill="${on ? '#ffd43b' : '#dee2e6'}" stroke="${on ? '#f59f00' : '#ced4da'}" stroke-width="2" stroke-linejoin="round"/></svg>`;
