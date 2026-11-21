import { createStore } from './store.js';
import { readProgressLink, restoreProgress } from './progress.js';

const status = document.getElementById('progress-status');
const open = document.getElementById('progress-open');
try {
  const snapshot = readProgressLink(location.hash);
  if (!snapshot) throw new Error('В этой ссылке нет сохранённых уровней. Создайте QR-код в родительском разделе на старом устройстве.');
  const store = createStore(localStorage);
  restoreProgress(store, snapshot);
  const address = new URL('./', location.href);
  address.search = 'resume=1'; address.hash = 'profile=' + snapshot.linkId;
  open.href = address.href; open.hidden = false;
  status.textContent = 'Прогресс сохранён. Открываю игру…';
  try { sessionStorage.setItem('shkola-qr-open', snapshot.linkId); } catch { /* ссылка resume остаётся запасным способом */ }
  // Перед возвратом в игру даём прежней установленной копии обновиться.
  if (navigator.serviceWorker?.controller) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
      const worker = registration?.installing || registration?.waiting;
      if (worker && worker.state !== 'activated' && worker.state !== 'redundant') {
        await new Promise(resolve => {
          const finish = () => { clearTimeout(timer); worker.removeEventListener('statechange', check); resolve(); };
          const check = () => { if (worker.state === 'activated' || worker.state === 'redundant') finish(); };
          const timer = setTimeout(finish, 8000);
          worker.addEventListener('statechange', check); check();
        });
      }
    } catch { /* уровни уже сохранены; без сети открываем доступную копию игры */ }
  }
  // Отдельная страница приёма работает и при старой сохранённой версии главной страницы.
  location.replace(address.href);
} catch (error) {
  document.querySelector('h1').textContent = 'Не удалось перенести прогресс';
  status.textContent = error.name === 'QuotaExceededError' || error.name === 'SecurityError'
    ? 'Браузер не смог сохранить уровни. Разрешите сохранение данных сайта или освободите место и откройте QR-код ещё раз.'
    : error.message;
  open.hidden = false;
}
