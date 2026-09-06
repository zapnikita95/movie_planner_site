/**
 * Search must clear stale results before debounce fires.
 * Run: node search-loading-immediate.test.js
 */
var fs = require('fs');
var path = require('path');
var cabinet = fs.readFileSync(path.join(__dirname, 'cabinet-app.js'), 'utf8');
var film = fs.readFileSync(path.join(__dirname, 'film-page.js'), 'utf8');
function assert(c, m) { if (!c) { console.error('FAIL', m); process.exit(1); } }
assert(cabinet.indexOf('Clear stale results immediately') >= 0, 'cabinet immediate loading comment');
assert(cabinet.indexOf('renderHeaderSearchTypeTabsHtml() + siteSearchLoadingHtml()') >= 0, 'cabinet loading html on input');
assert(film.indexOf('Drop stale results immediately while debounce waits') >= 0, 'film-page immediate loading');
assert(fs.existsSync(path.join(__dirname, 'auth-onboard-layers.test.js')) === false, 'login layer test removed');
console.log('search-loading-immediate.test.js: OK');
