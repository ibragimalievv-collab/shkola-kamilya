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
// Возвращаем результат, когда транзакция целиком завершилась.
async function run(store, mode, fn) {
  const db = await open();
  return new Promise((ok, fail) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => ok(req.result);
    tx.onabort = () => fail(tx.error || req.error || new Error('Запись прервана'));
  });
}

async function writeBatch(records) {
  const db = await open();
  return new Promise((ok, fail) => {
    const tx = db.transaction([...new Set(records.map(r => r.store))], 'readwrite');
    tx.oncomplete = () => ok();
    tx.onabort = () => fail(tx.error || new Error('Запись прервана'));
    try {
      for (const { store, key, blob } of records) tx.objectStore(store).put(blob, key);
    } catch (error) { tx.abort(); fail(error); }
  });
}

// Некоторые браузеры разрешают IndexedDB, но отклоняют прямую запись Blob.
// Для них сохраняем те же байты и MIME-тип. Старые записи остаются читаемыми.
let useBytes = false;
async function storeMedia(records) {
  if (!records.length) return;
  if (!useBytes) {
    try { await writeBatch(records); return; }
    catch (error) {
      if (!['UnknownError', 'DataCloneError', 'AbortError'].includes(error.name) || !records.some(r => r.blob instanceof Blob)) throw error;
    }
  }
  const converted = [];
  for (const r of records) {
    const blob = r.blob instanceof Blob ? { mediaBytes: await r.blob.arrayBuffer(), mediaType: r.blob.type } : r.blob;
    converted.push({ ...r, blob });
  }
  await writeBatch(converted);
  useBytes = true;
}

export const idb = {
  async get(store, key) {
    const value = await run(store, 'readonly', s => s.get(key));
    return value?.mediaBytes instanceof ArrayBuffer ? new Blob([value.mediaBytes], { type: value.mediaType }) : value;
  },
  put: (store, key, value) => storeMedia([{ store, key, blob: value }]),
  del: (store, key) => run(store, 'readwrite', s => s.delete(key)),
  keys: store => run(store, 'readonly', s => s.getAllKeys()),
  putBatch: storeMedia,
};
