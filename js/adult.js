import { h } from './util.js';

// Проверка взрослого перед системным запросом. Это защита кнопки от случайного нажатия.
export function adultAction(action, proceed) {
  if (document.querySelector('dialog.adult-dialog[open]')) return;
  const a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4);
  const question = 'Сколько будет ' + a + ' × ' + b + '?';
  const dialog = h('dialog', { class: 'adult-dialog', 'aria-label': 'Для родителей' });
  if (!dialog.showModal) {
    if (Number(window.prompt(action + '\n' + question)) === a * b) proceed();
    return;
  }
  const field = h('input', { type: 'text', inputmode: 'numeric', maxlength: 3, required: true, autocomplete: 'off' });
  const notice = h('p', { role: 'status' });
  dialog.append(h('form', { onsubmit: e => {
    e.preventDefault();
    if (Number(field.value) !== a * b) { notice.textContent = 'Попробуйте ещё раз.'; field.select(); return; }
    dialog.close(); proceed();
  } }, h('h2', {}, 'Для родителей'), h('p', {}, action), h('label', {}, question, ' ', field), notice,
    h('div', { class: 'edit-actions' }, h('button', { class: 'edit-action', type: 'button', onclick: () => dialog.close() }, 'Отмена'),
      h('button', { class: 'edit-action edit-done', type: 'submit' }, 'Продолжить'))));
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog); dialog.showModal();
}
