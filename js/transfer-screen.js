import { h } from './util.js';
import { loadClips } from './audio.js';
import { transferLink } from './transfer.js';
import { offerProfile, acceptProfile } from './pair.js';
import { progressLink, readProgressLink, restoreProgress } from './progress.js';
import { qrCanvas, qrDisplaySide } from './qr.js';

const button = (label, fn) => h('button', { type: 'button', class: 'pbtn', onclick: fn }, label);
const field = (label, readonly = false) => h('textarea', {
  'aria-label': label, rows: 3, readonly, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
});
const setMessage = (node, error) => { node.textContent = error?.message || 'Перенос не удался.'; };

async function copy(field, status) {
  try {
    await navigator.clipboard.writeText(field.value);
    status.textContent = 'Скопировано.';
  } catch {
    field.focus(); field.select();
    status.textContent = 'Текст выделен. Скопируйте его вручную.';
  }
}

export function profileTransferControls(store) {
  const panel = h('div', { class: 'transfer-actions' });
  panel.append(button('QR-код с пройденными уровнями', () => progressDialog(store)),
    button('Открыть ссылку из QR-кода', () => receiveProgressDialog(store)),
    button('Личная ссылка профиля', () => {
    const status = h('p', { class: 'hint', role: 'status' });
    const address = field('Личная ссылка', true);
    address.value = transferLink(location.href, store.ensureProfileLink());
    const explanation = h('p', { class: 'hint' }, 'Открывает этот профиль на устройстве, где он уже есть. Для переноса уровней на новое устройство используйте QR-код.');
    panel.replaceChildren(button('QR-код с пройденными уровнями', () => progressDialog(store)),
      button('Открыть ссылку из QR-кода', () => receiveProgressDialog(store)), address,
      button('Скопировать ссылку', () => copy(address, status)), explanation, status);
    address.focus(); address.select();
  }), button('Перенести профиль по Wi-Fi', () => sendDialog(store)));
  return panel;
}

function progressDialog(store) {
  const dialog = h('dialog', { class: 'transfer-dialog progress-qr-dialog', 'aria-label': 'QR-код прогресса' });
  const status = h('p', { class: 'hint', role: 'status' });
  dialog.append(h('h2', { tabindex: '-1' }, 'QR-код прогресса'));
  try {
    const url = progressLink(location.href, store);
    const snapshot = readProgressLink(new URL(url).hash);
    const count = Object.keys(snapshot.levels).length;
    const stars = Object.values(snapshot.levels).reduce((a, b) => a + b, 0);
    const link = field('Ссылка с пройденными уровнями', true); link.className = 'progress-qr-link'; link.value = url;
    dialog.append(h('p', {}, snapshot.name + ' · Пройдено уровней: ' + count + ' · Звёзд: ' + stars),
      qrCanvas(url, 'QR-код с пройденными уровнями'),
      h('p', { class: 'hint' }, 'На другом устройстве откройте камеру или сканер QR, наведите на код и нажмите появившуюся ссылку. Игра сохранит уровни и откроет карту.'),
      h('p', { class: 'hint' }, 'Код содержит прогресс на момент открытия. После новых занятий откройте QR-код ещё раз. Лучшие результаты уже перенесённого профиля сохранятся.'),
      h('p', { class: 'hint' }, 'QR переносит уровни, звёзды и цвета помощника. Полный профиль с рисунками и записями можно перенести файлом в «Настройки → Резервная копия».'),
      button('Скопировать ссылку с прогрессом', () => copy(link, status)), link);
  } catch (error) { setMessage(status, error); }
  dialog.append(status, button('Закрыть', () => dialog.close()));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog); dialog.showModal();
  dialog.querySelector('h2').focus({ preventScroll: true }); dialog.scrollTop = 0;
  const canvas = dialog.querySelector('canvas');
  const resize = () => {
    if (!canvas) return;
    const style = getComputedStyle(dialog);
    const available = Math.min(448, dialog.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    canvas.style.width = qrDisplaySide(+canvas.dataset.qrModules, available, devicePixelRatio || 1) + 'px';
  };
  resize();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(dialog);
  dialog.addEventListener('close', () => observer?.disconnect(), { once: true });
}

function receiveProgressDialog(store) {
  const input = field('Ссылка из QR-кода'); input.className = 'progress-qr-link';
  const status = h('p', { class: 'hint', role: 'status' });
  const dialog = h('dialog', { class: 'transfer-dialog progress-qr-dialog', 'aria-label': 'Открыть ссылку из QR-кода' },
    h('h2', {}, 'Продолжить с сохранённых уровней'),
    h('p', { class: 'hint' }, 'Вставьте ссылку, скопированную под QR-кодом на старом устройстве. Это удобно, если игра открыта с отдельного значка.'), input,
    button('Сохранить уровни и открыть игру', () => {
      try {
        const url = new URL(input.value.trim(), location.href);
        const snapshot = readProgressLink(url.hash);
        if (!snapshot) throw new Error('Вставьте ссылку с прогрессом из окна QR-кода.');
        restoreProgress(store, snapshot);
        const address = new URL('./', location.href); address.search = 'resume=1'; address.hash = 'profile=' + snapshot.linkId;
        try { sessionStorage.setItem('shkola-qr-open', snapshot.linkId); } catch { /* остаётся resume */ }
        location.assign(address.href);
      } catch (error) { setMessage(status, error); }
    }), status, button('Закрыть', () => dialog.close()));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog); dialog.showModal();
}

function sendDialog(store) {
  const status = h('p', { class: 'hint', role: 'status' }, 'Прежде чем начать, подключите оба устройства к одной сети Wi-Fi. Оставьте эту страницу открытой.');
  const dialog = h('dialog', { class: 'transfer-dialog', 'aria-label': 'Прямой перенос профиля' });
  const invite = field('Временная ссылка для нового устройства', true);
  const response = field('Ответ с нового устройства');
  response.placeholder = 'Вставьте ответ с нового устройства';
  const form = h('div', { class: 'transfer-actions', hidden: true });
  let sender;
  let closed = false;
  const start = button('Создать ссылку', async () => {
    if (start.disabled) return;
    sender?.cancel();
    start.disabled = true; form.hidden = true;
    status.textContent = 'Готовлю профиль и проверяю соединение.';
    try {
      const next = await offerProfile(store, location.href);
      if (closed) { next.cancel(); return; }
      sender = next; invite.value = next.link; response.value = '';
      form.hidden = false; send.disabled = false;
      status.textContent = 'Откройте ссылку на новом устройстве. Оно покажет ответ, который нужно вставить здесь.';
    } catch (error) { setMessage(status, error); }
    finally { start.disabled = false; }
  });
  const send = button('Передать профиль', async () => {
    if (!sender || send.disabled) return;
    send.disabled = true; start.disabled = true;
    status.textContent = 'Соединяю устройства.';
    try {
      await sender.send(response.value, percent => { status.textContent = 'Передача: ' + percent + '%'; });
      form.hidden = true; status.textContent = 'Профиль сохранён на новом устройстве.';
    } catch (error) {
      setMessage(status, error);
      sender.cancel(); sender = null; form.hidden = true;
      status.textContent += ' Нажмите «Создать ссылку» и начните перенос заново. Или используйте резервную копию файлом.';
    }
    finally { start.disabled = false; }
  });
  form.append(invite, button('Скопировать ссылку для переноса', () => copy(invite, status)), response, send);
  dialog.append(h('h2', {}, 'Прямой перенос профиля'), status, start, form, button('Закрыть', () => dialog.close()));
  dialog.addEventListener('close', () => { closed = true; sender?.cancel(); dialog.remove(); });
  document.body.append(dialog);
  dialog.showModal();
}

export function showTransferReceiver(x, ticket, back) {
  const status = h('p', { class: 'hint', role: 'status' }, 'Подключите оба устройства к одной сети Wi-Fi. Оставьте старое устройство на экране переноса.');
  const response = field('Ответ для старого устройства', true);
  const details = h('div', { class: 'transfer-actions', hidden: true }, response,
    button('Скопировать ответ', () => copy(response, status)));
  let receiver, left = false;
  const done = button('Открыть профиль', () => back(ticket.profile)); done.hidden = true;
  const prepare = button('Подготовить приём', async () => {
    receiver?.cancel();
    prepare.disabled = true; details.hidden = true;
    status.textContent = 'Подготавливаю соединение.';
    try {
      receiver = await acceptProfile(x.store, ticket, {
        progress: percent => { status.textContent = 'Приём профиля: ' + percent + '%'; },
        approve: profile => !x.store.profileForLink(profile.linkId) ||
          confirm('Обновить этот профиль на новом устройстве? Лучшие звёзды сохранятся. Рисунки будут взяты со старого устройства.'),
        success: () => {
          status.textContent = 'Профиль сохранён на этом устройстве.';
          details.hidden = true; prepare.hidden = true; done.hidden = false;
          void loadClips(); done.focus();
        },
        fail: error => { setMessage(status, error); details.hidden = true; prepare.disabled = false; },
      });
      if (left) { receiver.cancel(); return; }
      response.value = receiver.answer; details.hidden = false;
      status.textContent = 'Скопируйте ответ. На старом устройстве вставьте его и нажмите «Передать профиль».';
    } catch (error) { setMessage(status, error); prepare.disabled = false; }
  });
  x.screen('transfer-screen', h('div', { class: 'bar' }, x.ibtn('◀', 'назад', () => {
    left = true; receiver?.cancel(); back();
  })), h('section', { class: 'pbox transfer-box' }, h('h1', {}, 'Принять профиль'), status, prepare, details, done));
}
