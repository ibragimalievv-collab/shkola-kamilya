// Сквозной прогон в изолированном профиле. Ответы вводятся кнопками и пером на канве.
import { LEVELS, ISLANDS } from '../js/curriculum.js';
import { drawGuide } from '../js/canvas.js';

export async function runCampaign({
  storage,
  task,
  onProgress = () => {},
  limit = LEVELS.length,
  correctOnly = false,
}) {
  const originalTimeout = window.setTimeout;
  const wait = (ms) => new Promise((resolve) => originalTimeout.call(window, resolve, ms));
  const stats = {
    levels: [],
    mechanics: {},
    clicks: 0,
    strokes: 0,
    wrong: 0,
    retries: 0,
    consecutiveHints: 0,
    wrongLevels: [],
    book: false,
  };
  const all = (sel, parent = document) => Array.from(parent.querySelectorAll(sel)),
    one = (sel, parent = document) => parent.querySelector(sel);
  function assert(ok, msg) {
    if (!ok) throw Error(msg);
  }
  const fieldValue = (x) => String(x?.t ?? x);
  function click(el) {
    assert(el && !el.disabled, 'unavailable input: ' + el?.outerHTML);
    if (!el.isConnected) throw Error('stale input');
    if (el.click) el.click();
    else el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    stats.clicks++;
  }
  const stat = (m, field, n = 1) => {
    let s = (stats.mechanics[m] ||= {});
    s[field] = (s[field] || 0) + n;
  };
  const pf = () => {
    let s = JSON.parse(storage.getItem('shkola-kamilya-v1'));
    return s?.profiles[s.current];
  };
  const byLabel = (s) => one('button[aria-label="' + s + '"]');
  const isScreen = (cls) => one('#app').classList.contains(cls);
  function stroke(ink, pts) {
    if (!pts.length) return;
    let box = ink.getBoundingClientRect();
    function ev(type, p) {
      ink.dispatchEvent(
        new PointerEvent(type, {
          clientX: box.left + (p[0] / ink.width) * box.width,
          clientY: box.top + (p[1] / ink.height) * box.height,
          pointerType: 'pen',
          pointerId: 1,
          bubbles: true,
          buttons: type === 'pointerup' ? 0 : 1,
        }),
      );
    }
    ev('pointerdown', pts[0]);
    for (const p of pts.slice(1)) ev('pointermove', p);
    ev('pointerup', pts.at(-1));
    stats.strokes++;
  }
  function writeTarget(t, root) {
    const ink = one('.ink', root),
      target = drawGuide(
        {
          W: ink.width,
          H: ink.height,
          guide: Object.assign(document.createElement('canvas'), { width: ink.width, height: ink.height }),
        },
        t,
      );
    for (const points of target.sampleStrokes) stroke(ink, points);
  }
  function num(v, root) {
    const ds = all('.key', root);
    for (const digit of String(v)) click(ds.find((x) => x.textContent === digit));
    click(one('.key.go', root));
  }
  function pairEl(list, value) {
    return list.find(
      (e) =>
        !e.classList.contains('done') &&
        !e.classList.contains('open') &&
        e.lastElementChild.textContent === fieldValue(value) &&
        e.lastElementChild.classList.contains('flip') === !!value?.flip,
    );
  }
  async function solve(t, root) {
    const a = (s) => all(s, root),
      q = (s) => one(s, root),
      ck = () => click(q('.check')),
      m = t.m;
    switch (m) {
      case 'bubbles':
      case 'fish':
      case 'find':
        for (const x of a('.blob').filter((e) => e.textContent.toUpperCase() === String(t.target).toUpperCase()))
          click(x);
        break;
      case 'pick':
      case 'listen':
      case 'story':
      case 'missing':
      case 'clock':
      case 'house':
      case 'count':
        click(a('.opt')[t.a]);
        break;
      case 'truefalse':
        click(a('.thumb')[t.a ? 0 : 1]);
        break;
      case 'groups':
        click(a('.opt')[typeof t.a === 'boolean' ? (t.a ? 0 : 1) : t.a]);
        break;
      case 'pairs': {
        const cols = a('.pcol');
        for (let i = 0; i < t.pairs.length; i++) {
          click(cols[0].children[i]);
          click(pairEl([...cols[1].children], t.pairs[i][1]));
        }
        break;
      }
      case 'memory':
        for (const [l, r] of t.pairs) {
          click(pairEl(a('.mcard'), l));
          click(pairEl(a('.mcard'), r));
        }
        break;
      case 'baskets':
        for (const it of t.items) click(a('.basket')[it.bin]);
        break;
      case 'build':
        for (const v of t.target) click(a('.tile:not(.used)').find((e) => e.textContent === v));
        break;
      case 'claps':
        for (let i = 0; i < t.n; i++) click(q('.drum'));
        ck();
        break;
      case 'trace':
        click(q('[aria-label="стереть всё"]'));
        writeTarget(t, root);
        break;
      case 'copy':
        click(q('[aria-label="стереть всё"]'));
        writeTarget(t, root);
        ck();
        break;
      case 'draw':
      case 'drawtask': {
        const ink = q('.ink');
        stroke(ink, [
          [200, 100],
          [310, 220],
          [225, 315],
          [120, 218],
          [200, 100],
        ]);
        ck();
        if (m === 'draw') break;
        if (t.op !== '×') click(a('.opt').find((e) => e.textContent === '1'));
        if (t.op) num(t.op === '×' ? t.fixed : t.ans(1), root);
        break;
      }
      case 'feed':
        for (const e of a('.plate .food').slice(0, t.n)) click(e);
        ck();
        break;
      case 'train':
        for (const v of [...t.nums].sort((a, b) => a - b))
          click(a('.yard .car').find((e) => +e.textContent === v));
        break;
      case 'compare':
        click(a('.opt').find((e) => e.textContent === (t.a < t.b ? '<' : t.a > t.b ? '>' : '=')));
        break;
      case 'numline':
        click(a('.ncell').find((e) => +e.textContent === t.to));
        break;
      case 'keypad':
        num(t.a, root);
        break;
      case 'tenframe': {
        const add = a('.add');
        for (let i = 0; i < Math.floor(t.n / 10); i++) click(add[0]);
        for (let i = 0; i < t.n % 10; i++) click(add[1]);
        ck();
        break;
      }
      case 'shop': {
        let rest = t.price;
        for (const v of [...t.coins].sort((a, b) => b - a)) {
          const e = a('.opts .coin').find((e) => +e.textContent === v);
          while (rest >= v) {
            click(e);
            rest -= v;
          }
        }
        assert(!rest, 'coin change');
        ck();
        break;
      }
      case 'problem':
        click(a('.sign').find((e) => e.textContent === t.op));
        num(t.a, root);
        break;
      case 'dots':
        for (const e of a('.dot')) click(e);
        break;
      case 'stones':
        for (const s of t.steps) click(a('.opt.stone')[s.a]);
        break;
      case 'paint':
        for (const e of a('.paintable').slice(0, t.n)) click(e);
        ck();
        break;
      case 'chart':
        click(a('.ccell').find((e) => +e.textContent === t.target));
        break;
      case 'array':
        click(a('.acell')[(t.rows - 1) * 6 + t.cols - 1]);
        ck();
        break;
      case 'share':
        for (const e of a('.share-plate')) for (let i = 0; i < t.q; i++) click(e);
        ck();
        break;
      case 'blend': {
        if (q('.opts').classList.contains('hidden')) for (const el of a('.bl')) click(el);
        await wait(12);
        click(a('.opt')[t.a]);
        break;
      }
      case 'readaloud': {
        const read = a('button').find((e) => e.textContent.includes('без записи'));
        if (read) click(read);
        const opts = a('.opt');
        if (opts.length) {
          const words = t.text.match(/[а-яё]+/giu);
          const wanted = words.length === 1 ? words[0][0] : words[0];
          click(opts.find((e) => e.textContent.toUpperCase() === wanted.toUpperCase()));
        }
        break;
      }
      default:
        throw Error('missing ' + m);
    }
  }
  async function wrong(t, root) {
    const a = (s) => all(s, root),
      q = (s) => one(s, root),
      pick = (selector, right) => {
        const els = a(selector);
        const bad = els.find((el, i) => i !== right && !el.disabled && !el.classList.contains('wrong'));
        if (!bad) return false;
        click(bad);
        return true;
      };
    switch (t.m) {
      case 'bubbles':
      case 'find':
      case 'fish': {
        const el = a('.blob').find((e) => e.textContent.toUpperCase() !== String(t.target).toUpperCase());
        if (!el) return false;
        click(el);
        return true;
      }
      case 'pick':
      case 'listen':
      case 'story':
      case 'count':
      case 'house':
      case 'missing':
      case 'clock':
        return pick('.opt', t.a);
      case 'truefalse':
        return pick('.thumb', t.a ? 0 : 1);
      case 'groups':
        return pick('.opt', typeof t.a === 'boolean' ? (t.a ? 0 : 1) : t.a);
      case 'pairs': {
        const cols = a('.pcol');
        if (t.pairs.length < 2) return false;
        click(cols[0].children[0]);
        click(pairEl([...cols[1].children], t.pairs[1][1]));
        return true;
      }
      case 'baskets':
        click(a('.basket')[1 - t.items[0].bin]);
        return true;
      case 'build': {
        const el = a('.tile').find((e) => e.textContent !== t.target[0]);
        if (!el) return false;
        click(el);
        return true;
      }
      case 'claps':
      case 'array':
      case 'share':
      case 'tenframe':
      case 'shop':
        click(q('.check'));
        return true;
      case 'feed':
      case 'paint':
        if (t.n === 0) return false;
        click(q('.check'));
        return true;
      case 'trace': {
        stroke(q('.ink'), [
          [0, 0],
          [5, 5],
        ]);
        return true;
      }
      case 'copy':
        stroke(q('.ink'), [
          [20, 10],
          [600, 10],
        ]);
        click(q('.check'));
        return true;
      case 'draw':
      case 'drawtask':
        click(q('.check'));
        return true;
      case 'memory': {
        if (t.pairs.length < 2) return false;
        click(pairEl(a('.mcard'), t.pairs[0][0]));
        click(pairEl(a('.mcard'), t.pairs[1][0]));
        await wait(12);
        return true;
      }
      case 'train': {
        const min = Math.min(...t.nums);
        click(a('.car').find((e) => +e.textContent !== min));
        return true;
      }
      case 'compare':
        return pick('.sign', ['>', '<', '='].indexOf(t.a > t.b ? '>' : t.a < t.b ? '<' : '='));
      case 'numline':
        click(a('.ncell').find((e) => +e.textContent !== t.to));
        return true;
      case 'keypad':
        num(t.a === 0 ? 1 : 0, root);
        return true;
      case 'problem': {
        const signs = a('.sign');
        return pick(
          '.sign',
          signs.findIndex((e) => e.textContent === t.op),
        );
      }
      case 'dots':
        click(a('.dot')[1]);
        return true;
      case 'stones':
        return pick('.opt.stone', t.steps[0].a);
      case 'chart':
        click(a('.ccell').find((e) => +e.textContent !== t.target));
        return true;
      case 'blend': {
        if (q('.opts').classList.contains('hidden')) {
          for (const el of a('.bl')) click(el);
          await wait(12);
        }
        return pick('.opt', t.a);
      }
      case 'readaloud': {
        const read = a('button').find((e) => e.textContent.includes('без записи'));
        if (read) click(read);
        const words = t.text.match(/[а-яё]+/giu),
          right = (words.length > 1 ? words[0] : words[0][0]).toUpperCase();
        const bad = a('.opt').find((e) => e.textContent.toUpperCase() !== right);
        if (!bad) return false;
        click(bad);
        return true;
      }
    }
    return false;
  }
  async function verifyWrong(t, root, L, testAnotherHint) {
    let attempts = 0;
    const width = one('.progress i').style.width;
    for (let i = 0; i < 2; i++) {
      if (!(await wrong(t, root))) break;
      await wait(14);
      assert(
        root.isConnected && one('.task') === root && task() === t,
        'wrong input advanced ' + L.id + ' ' + t.m + ' attempt ' + (i + 1),
      );
      assert(one('.progress i').style.width === width, 'wrong input changed progress');
      assert(!pf()?.levels[L.id], 'wrong input earned stars');
      attempts++;
      stats.wrong++;
      stat(t.m, 'negative');
    }
    let retry = all('button').find((e) => /попробовать ещё раз/i.test(e.textContent) && !e.disabled);
    if (retry) {
      let question = JSON.stringify(t);
      click(retry);
      await wait(8);
      assert(JSON.stringify(task()) === question, 'retry regenerated question');
      assert(one('.progress i').style.width === width, 'retry advanced');
      stats.retries++;
      stat(t.m, 'retried');
    }
    if (retry && testAnotherHint) {
      const previousRetries = stats.retries;
      attempts += await verifyWrong(task(), one('.task'), L, false);
      assert(stats.retries === previousRetries + 1, 'second assisted attempt unexpectedly finished or changed');
      stats.consecutiveHints++;
    }
    return attempts;
  }
  const count = Math.min(LEVELS.length, limit);
  const started = performance.now();
  window.setTimeout = (fn, ms, ...args) => originalTimeout.call(window, fn, Math.min(ms || 0, 2), ...args);
  try {
    for (let idx = 0; idx < count; idx++) {
      const L = LEVELS[idx];
      let attempts = 0;
      try {
        if (one('.welcome') && !idx) {
          click(all('button').find((b) => b.textContent === 'Сразу к первому уроку'));
        } else {
          if (isScreen('reward')) click(byLabel('на карту'));
          if (isScreen('welcome')) click(byLabel('начать'));
          assert(isScreen('map'), 'map ' + one('#app').className);
          const isl = all('.island')[L.island];
          assert(!isl.classList.contains('locked'), 'island locked ' + L.id);
          click(isl);
          const node = all('.node')[L.k];
          assert(!node.classList.contains('locked'), 'level locked ' + L.id);
          click(node);
        }
        assert(isScreen('intro'), 'intro');
        click(byLabel('начать'));
        let taskCount = 0;
        while (isScreen('level')) {
          assert(taskCount++ < 15, 'too many tasks');
          let t = task(),
            root = one('.task');
          if (!correctOnly) attempts += await verifyWrong(t, root, L, taskCount === 1);
          t = task();
          root = one('.task');
          await solve(t, root);
          await wait(12);
          assert(
            !root.isConnected,
            'did not advance after correct ' + t.m + ' ' + JSON.stringify(t) + ' :: ' + root.innerText,
          );
          stat(t.m, 'correct');
        }
        assert(isScreen('reward'), 'missing reward');
        const saved = pf();
        assert(saved.levels[L.id] >= 1 && saved.lastLesson.id === L.id, 'result not persisted');
        assert(saved.lastLesson.total === taskCount, 'task total mismatch');
        assert(Object.keys(saved.levels).length === idx + 1, 'unexpected levels');
        if (correctOnly) {
          assert(saved.levels[L.id] === 3, 'perfect level did not earn three stars');
          assert(saved.lastLesson.firstTry === taskCount, 'first-try score incorrect');
        }
        if (idx === ISLANDS[0].levels.length - 1) stats.book = !!one('.first-book');
        if (attempts) stats.wrongLevels.push(L.id);
        stats.levels.push({ id: L.id, stars: saved.levels[L.id], tasks: taskCount, rejectedInputs: attempts });
        onProgress({ completed: idx + 1, total: count, id: L.id });
      } catch (e) {
        throw Error(L.id + ' / ' + task()?.m + ' / ' + JSON.stringify(task()?.src) + '\n' + e.stack);
      }
    }
    assert(count !== LEVELS.length || Object.keys(stats.mechanics).length === 37, 'Не все типы заданий пройдены');
    assert(count < ISLANDS[0].levels.length || stats.book, 'Первая книжка не открылась');
    assert(correctOnly || stats.retries > 0, 'Повтор после подсказки не проверен');
    return { ...stats, elapsedSeconds: Math.round((performance.now() - started) / 1000) };
  } finally {
    window.setTimeout = originalTimeout;
  }
}
