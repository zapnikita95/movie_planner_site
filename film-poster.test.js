/**
 * Hero poster URL helpers: KP CDN templates must not keep /f/ blank.
 * Run: node film-poster.test.js
 */
var fs = require('fs');
var path = require('path');
var src = fs.readFileSync(path.join(__dirname, 'film-page.js'), 'utf8');

var document = {
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  documentElement: { style: { setProperty: function () {} } },
  body: { classList: { toggle: function () {}, add: function () {}, remove: function () {} } },
};
var window = {
  document: document,
  MpApiConfig: { SITE_ORIGIN: 'https://movie-planner.ru', API_ORIGIN: 'https://movie-planner.ru' },
  location: { hostname: 'movie-planner.ru', origin: 'https://movie-planner.ru', pathname: '/f/123' },
};
var globalThis = window;
document.defaultView = window;

eval(src);
var Mp = window.MpFilmPage;

function eq(got, want, msg) {
  if (got !== want) {
    console.error('FAIL', msg, 'got:', got, 'want:', want);
    process.exit(1);
  }
}

eq(!!Mp, true, 'MpFilmPage exported');
eq(typeof Mp.isKpFilmCdnTemplateUrl, 'function', 'template helper');
eq(typeof Mp.resolveFilmPosterDisplay, 'function', 'resolve helper');

var tpl = 'https://st.kp.yandex.net/images/film_iphone/iphone360_1445123.jpg';
eq(Mp.isKpFilmCdnTemplateUrl(tpl, '1445123'), true, 'iphone360 is template');
eq(Mp.isKpFilmCdnTemplateUrl('/api/public/poster/kp/st/images/film_iphone/iphone360_1.jpg', '1'), true, 'proxied template');
eq(Mp.isGoodFilmPosterUrl(tpl), false, 'template is not a good hero url');

var resolved = Mp.resolveFilmPosterDisplay(tpl, '1445123');
eq(resolved, '/images/film-poster-placeholder.png', 'template resolves to branded placeholder');

var mds = 'https://avatars.mds.yandex.net/get-kinopoisk-image/10900341/abc/360';
eq(Mp.isGoodFilmPosterUrl(mds), true, 'mds art is good');
eq(Mp.resolveFilmPosterDisplay(mds, '1445123').indexOf('/api/public/poster/kp/mds/') === 0, true, 'mds rewritten to same-origin proxy');

eq(src.indexOf('width="400" height="600" loading="eager" fetchpriority="high"') >= 0, true, 'hero img has size + eager');

console.log('film-poster.test.js: OK');
