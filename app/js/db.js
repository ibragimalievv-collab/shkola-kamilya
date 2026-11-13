// БОЛЬШОЕ ХРАНИЛИЩЕ НА УСТРОЙСТВЕ (IndexedDB): фотографии тетради и записи голоса родителей.
// Ничего никуда не отправляется: всё лежит только на этом устройстве.

const NAME = 'shkola-kamilya', STORES = ['photos', 'clips', 'reads']; // фото тетради, записи родителей, чтение ребёнка вслух
let opening = null;

function open() {
  opening ||= new Promise((ok, fail) => {
    const req = indexedDB.open(NAME, 2);
    req.onupgradeneeded = () => STORES.forEach(s => req.result.objectStoreNames.contains(s) || req.result.createObjectStore(s));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
  return opening;
}
// Выполнить одно действие с хранилищем и дождаться ответа.
async function run(store, mode, fn) {
  const db = await open();
  return new Promise((ok, fail) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}
export const idb = {
  get: (store, key) => run(store, 'readonly', s => s.get(key)),
  put: (store, key, value) => run(store, 'readwrite', s => s.put(value, key)),
  del: (store, key) => run(store, 'readwrite', s => s.delete(key)),
  keys: store => run(store, 'readonly', s => s.getAllKeys()),
};
