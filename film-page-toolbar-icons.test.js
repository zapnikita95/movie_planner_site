/**
 * Guest /f/ toolbar icons must never fall back to 🔔 when MPIcons is late.
 * Run: node film-page-toolbar-icons.test.js
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function loadFilmPage(extra) {
  var src = fs.readFileSync(path.join(__dirname, 'film-page.js'), 'utf8');
  var sandbox = {
    console: console,
    location: { hostname: 'movie-planner.ru', pathname: '/f/572477' },
    document: {
      documentElement: { classList: { add: function () {}, remove: function () {} } },
      body: { classList: { add: function () {}, remove: function () {} }, style: {} },
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      createElement: function () { return { classList: { add: function () {} }, style: {}, setAttribute: function () {} }; },
    },
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  if (extra) Object.keys(extra).forEach(function (k) { sandbox[k] = extra[k]; });
  vm.runInNewContext(src, sandbox);
  return sandbox.MpFilmPage;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

var guestItem = { kp_id: 572477, title: 'Дюна', is_upcoming_premiere: false };
var upcomingItem = { kp_id: 1, title: 'Премьера', is_upcoming_premiere: true, premiere_date: '2026-12-01' };

var Mp = loadFilmPage();

var watchlist = Mp.mpToolbarIcon('watchlist', { size: 'md' });
assert(watchlist.indexOf('ph-bookmark-simple') !== -1, 'watchlist fallback is bookmark-simple');
assert(watchlist.indexOf('🔔') === -1, 'watchlist fallback is not bell emoji');

var eye = Mp.mpToolbarIcon('eye', { size: 'sm', className: 'film-icon-ico' });
assert(eye.indexOf('ph-eye') !== -1, 'eye fallback is ph-eye');
assert(eye.indexOf('🔔') === -1, 'eye fallback is not bell emoji');

var calendar = Mp.mpToolbarIcon('calendar', { size: 'md' });
assert(calendar.indexOf('ph-calendar') !== -1, 'calendar fallback is ph-calendar');

var inbox = Mp.mpToolbarIcon('inbox');
assert(inbox.indexOf('ph-bell') !== -1, 'inbox fallback is ph-bell (premiere only)');
assert(inbox.indexOf('🔔') === -1, 'inbox fallback is Phosphor, not emoji');

var bellOff = Mp.mpToolbarIcon('bellOff');
assert(bellOff.indexOf('ph-bell-slash') !== -1, 'bellOff fallback is ph-bell-slash');
assert(bellOff.indexOf('🔕') === -1, 'bellOff fallback is not emoji');

assert(Mp.mpToolbarIcon('unknown-icon') === '', 'unknown icon is empty, not 🔔');

var guestHtml = Mp.buildFilmPageToolbar(guestItem, { authenticated: false });
assert(guestHtml.indexOf('guest-watchlist-cta') !== -1, 'guest CTA present');
assert(guestHtml.indexOf('ph-bookmark-simple') !== -1, 'guest CTA uses bookmark icon');
assert(guestHtml.indexOf('ph-eye') !== -1, 'guest watched uses eye icon');
assert(guestHtml.indexOf('🔔') === -1, 'guest toolbar has no bell emoji');
assert(guestHtml.indexOf('film-icon-btn--premiere') === -1, 'no premiere btn when not upcoming');
assert(guestHtml.indexOf('premiere-notify') === -1, 'no premiere notify action on released guest film');

var authUpcoming = Mp.buildFilmPageToolbar(upcomingItem, { authenticated: true, inBase: true });
assert(authUpcoming.indexOf('film-icon-btn--premiere') !== -1, 'premiere btn when is_upcoming_premiere');
assert(authUpcoming.indexOf('premiere-notify-on') !== -1, 'premiere notify action when upcoming');
assert(authUpcoming.indexOf('ph-bell') !== -1, 'premiere uses inbox/bell icon');

var authReleased = Mp.buildFilmPageToolbar(guestItem, { authenticated: true, inBase: true });
assert(authReleased.indexOf('film-icon-btn--premiere') === -1, 'no premiere btn after release');

var MpReady = loadFilmPage({
  MPIcons: {
    html: function (name) {
      return '<span data-mp="' + name + '"></span>';
    },
  },
});
assert(MpReady.mpToolbarIcon('watchlist') === '<span data-mp="watchlist"></span>', 'uses MPIcons when ready');
assert(MpReady.mpToolbarIcon('unknown') === '<span data-mp="unknown"></span>', 'MPIcons handles unknown names');

var src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert(src.indexOf("pageGate = ['mp-icons.js?v='") !== -1, '/f/ pageGate loads mp-icons with film-page');
assert(!/isFilm \|\| isStaff[\s\S]*deferred = \[[\s\S]*mp-icons\.js/.test(src), 'mp-icons not only in deferred after film-page');

console.log('film-page-toolbar-icons.test.js: OK');
