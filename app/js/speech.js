// РАЗБОР ФРАЗЫ НА КУСОЧКИ ДЛЯ ОЗВУЧКИ.
// Приложение проигрывает заранее записанные файлы. Чтобы записей хватило на все задания со случайными
// числами и словами, фраза делится на кусочки: предложения, отдельные числа, буквы, слоги и слова.
// У каждого кусочка есть номер-отпечаток — по нему ищется готовая запись. Этим же разбором пользуется
// инструмент озвучки на компьютере, поэтому файл не трогает экран.

const TOKEN = /\{([^|{}]+)\|([^{}]*)\}/g;

// Убрать знаки, которые синтезатор читал бы вслух, и лишние пробелы.
export const clean = text => String(text).replace(/[«»"„“”']/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
// Текст без пометок — запасной вариант для встроенного голоса устройства.
export const plainText = text => clean(String(text).replace(TOKEN, '$2'));

// Отпечаток строки: одинаковый в приложении и в инструменте озвучки.
export function hash(str) {
  let a = 0x811c9dc5, b = 0x1b873593;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0; b = ((b << 13) | (b >>> 19)) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

// Числа «один» и «два» меняются по роду: одна звезда, одну ягодку, одно яблоко, две тарелки.
const FEM = /^(конфет|машин|груш|рыб|ракуш|птич|звезд|звёзд|морков|ягод|тарел|короб|корзин|ваз|клет|монет|букв|точ)/;
function numberForm(n, next) {
  const w = (next || '').toLowerCase().replace(/[^а-яё]/g, '');
  if (n === 1) return /[ую]$/.test(w) && FEM.test(w) ? 'одну' : FEM.test(w) ? 'одна' : /[ое]$/.test(w) ? 'одно' : '1';
  if (n === 2 && FEM.test(w)) return 'две';
  return String(n);
}

// Разобрать фразу. Возвращает кусочки: { id — отпечаток, text — что произнести, key — пометка (буква, слог, слово) }.
export function pieces(text) {
  const out = [], src = String(text);
  const plain = chunk => {
    for (const sentence of clean(chunk).split(/(?<=[.!?…])\s+|(?<=:)\s+(?=[А-ЯЁ])/)) {
      const parts = sentence.split(/(\d+)/);
      parts.forEach((part, i) => {
        if (/^\d+$/.test(part)) {
          const form = numberForm(+part, (parts[i + 1] || '').trim().split(' ')[0]);
          out.push({ id: 'n-' + hash(form), text: form });
        } else {
          const t = part.trim();
          if (/[\p{L}]/u.test(t)) out.push({ id: hash(t), text: t });
        }
      });
    }
  };
  let last = 0;
  src.replace(TOKEN, (m, key, fallback, at) => {
    plain(src.slice(last, at));
    out.push({ id: 't-' + hash(key), text: clean(fallback), key });
    last = at + m.length;
  });
  plain(src.slice(last));
  return out;
}
