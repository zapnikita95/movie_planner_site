const assert = require('node:assert/strict');
const fs = require('node:fs');

const filmPage = fs.readFileSync('film-page.js', 'utf8');
const cabinet = fs.readFileSync('cabinet-app.js', 'utf8');

assert.match(filmPage, /mp_guest_library_v1/);
assert.match(filmPage, /function saveGuestFilm/);
assert.match(filmPage, /function migrateGuestLibrary/);
assert.match(filmPage, /count < 2/);
assert.match(filmPage, /Добавлено в список в этом браузере/);
assert.match(filmPage, /Отмечено просмотренным в этом браузере/);
assert.match(filmPage, /Оценка .* сохранена в браузере/);

assert.match(cabinet, /mp_guest_library_v1/);
assert.match(cabinet, /Фильмы сохранены в этом браузере/);
assert.match(cabinet, /Сохранить навсегда/);

console.log('guest-library contract ok');
