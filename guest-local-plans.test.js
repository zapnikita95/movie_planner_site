var fs = require('fs');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

var modal = fs.readFileSync('plan-modal.js', 'utf8');
var film = fs.readFileSync('film-page.js', 'utf8');
var cabinet = fs.readFileSync('cabinet-app.js', 'utf8');

assert(modal.indexOf('onGuestSave') >= 0, 'plan modal exposes a guest save callback');
assert(modal.indexOf('План сохранится в этом браузере') >= 0, 'guest plan explains local persistence');
assert(film.indexOf("GUEST_PLANS_KEY = 'mp_guest_plans_v1'") >= 0, 'film page stores guest plans');
assert(film.indexOf('onGuestSave: saveGuestPlan') >= 0, 'guest submit saves instead of opening auth');
assert(cabinet.indexOf("localStorage.getItem('mp_guest_plans_v1')") >= 0, 'plans page reads local guest plans');
assert(cabinet.indexOf('Планы сохранены в этом браузере') >= 0, 'plans page labels local persistence');

console.log('guest-local-plans.test.js: OK');
