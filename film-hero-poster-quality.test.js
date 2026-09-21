const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const src = fs.readFileSync('film-page.js', 'utf8');
const sandbox = {
  console,
  location: { hostname: 'movie-planner.ru', pathname: '/f/842497' },
  document: {
    documentElement: { classList: { add() {}, remove() {} }, style: { setProperty() {} } },
    body: { classList: { add() {}, remove() {} }, style: {} },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement() { return { classList: { add() {} }, style: {}, setAttribute() {} }; },
  },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.runInNewContext(src, sandbox);

const pick = sandbox.MpFilmPage.filmHeroPosterSources;
const low = '/api/public/poster/kp/mds/get-kinopoisk-image/4774061/poster/600x900';
assert.deepEqual(
  JSON.parse(JSON.stringify(pick(low, 842497))),
  {
    src: '/api/public/poster/kp/st/images/film_big/842497.jpg',
    fallback: low,
  },
);
assert.deepEqual(
  JSON.parse(JSON.stringify(pick('/api/public/poster/tmdb/w780/poster.jpg', 842497))),
  {
    src: '/api/public/poster/tmdb/w780/poster.jpg',
    fallback: '',
  },
);

const index = fs.readFileSync('index.html', 'utf8');
assert.match(index, /filmHeroPosterSources\(poster, boot\.kp_id\)/);
assert.match(index, /data-mp-poster-fallback/);
assert.match(index, /fetchpriority="high"/);

console.log('film hero poster quality contract ok');
