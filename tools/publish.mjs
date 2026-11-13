// ПУБЛИКАЦИЯ ПРИЛОЖЕНИЯ: npm run publish
// Сначала запускаются все проверки. Если хоть одна не прошла (слово без картинки или записи, неверный ответ в примере,
// слово в задании не из справочника) — публикация останавливается и ничего на сайт не уходит.
import { execSync } from 'node:child_process';
const run = (cmd, quiet) => execSync(cmd, { stdio: quiet ? 'pipe' : 'inherit', cwd: new URL('..', import.meta.url) });
try { run('node --test tests/', true); }
catch (e) { console.error(String(e.stdout || '').split('\n').filter(l => /✖|AssertionError/.test(l)).slice(0, 20).join('\n')); console.error('\nПроверки не пройдены — публикация остановлена.'); process.exit(1); }
console.log('Все проверки пройдены. Публикую…');
run('git push -q origin main');
try { run('git branch -D gh-pages -q', true); } catch { /* ветки ещё не было */ }
run('git subtree split --prefix app -b gh-pages', true);
run('git push -q -f origin gh-pages');
console.log('Готово: сайт обновится через минуту-две.');
