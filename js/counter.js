// СЧЁТЧИК ДЛЯ ВЛАДЕЛЬЦА ПРИЛОЖЕНИЯ: сколько устройств открывают приложение и в какие дни.
// Что отправляется: один запрос «меня открыли» — не чаще раза в день с одного устройства. Больше ничего:
// ни имени ребёнка, ни прогресса, ни рисунков, ни фотографий, ни того, что он делает в игре.
// Сервис (GoatCounter) не ставит меток на устройство и не следит за человеком между сайтами.
// Пока код счётчика не вписан — приложение не отправляет вообще ничего.

// Код счётчика: имя, которое владелец получил при регистрации в сервисе (например, 'shkola'). Пусто — счётчик выключен.
export const COUNTER = '';

const KEY = 'shkola-kamilya-count';
// Адрес запроса. where — как открыто приложение: 'app' (со значка на экране) или 'site' (в браузере).
export const countUrl = (code, where) => `https://${code}.goatcounter.com/count?p=${encodeURIComponent('/' + where)}&t=${encodeURIComponent('Школа Камиля')}`;
// Правильный ли код: только латинские буквы, цифры и дефис — чтобы в адрес не попало ничего лишнего.
export const validCode = code => /^[a-z0-9][a-z0-9-]{1,40}$/i.test(code || '');

// Посчитать сегодняшнее открытие. Возвращает адрес, на который ушёл запрос, или null, если ничего не отправлено.
// send — чем отправить (по умолчанию — невидимой картинкой: так запрос уходит, даже если ответа не будет).
export function countVisit({ storage, day, host, standalone, code = COUNTER, send }) {
  if (!validCode(code)) return null;                                             // счётчик выключен
  if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) return null; // проверка на своём компьютере не считается
  try { if (storage.getItem(KEY) === day) return null; storage.setItem(KEY, day); } catch { return null; } // сегодня уже считали
  const url = countUrl(code, standalone ? 'app' : 'site');
  try { (send || (u => { new Image().src = u; }))(url); } catch { /* нет сети — ничего страшного */ }
  return url;
}
