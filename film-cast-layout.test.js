const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = fs.readFileSync('film-page.js', 'utf8');
const styles = fs.readFileSync('style-v2.css', 'utf8');
const ads = fs.readFileSync('yandex-rsy.js', 'utf8');

assert.match(page, /function compactCastRoleLabel\(value\)/);
assert.match(page, /return 'Самого себя'/);
assert.match(page, /data-staff-photo=/);
assert.match(page, /data-staff-kp=/);
assert.match(page, /data-staff-tmdb=/);

const castStyles = styles.slice(
  styles.indexOf('.film-people-rail {'),
  styles.indexOf('.film-collections-rail {'),
);
assert.match(castStyles, /flex-direction:\s*column/);
assert.match(castStyles, /aspect-ratio:\s*3\s*\/\s*4/);
assert.match(castStyles, /white-space:\s*normal/);
assert.doesNotMatch(castStyles, /text-overflow:\s*ellipsis/);
assert.match(styles, /@media \(max-width: 860px\)[\s\S]*\.film-collections-rail\s*\{[\s\S]*display:\s*block/);
assert.match(styles, /\.film-collection-link\s*\{\s*width:\s*100%/);

const bottomStart = ads.indexOf('function mountFilmPageBottom()');
const bottomEnd = ads.indexOf('\n  function mountFilmMobileStrips()', bottomStart);
const bottomMount = ads.slice(bottomStart, bottomEnd);
assert.ok(bottomStart >= 0 && bottomEnd > bottomStart, 'film bottom mount exists');
assert.doesNotMatch(bottomMount, /anchor:\s*hero/);
assert.match(bottomMount, /anchor:\s*shelf \|\| similar/);
assert.match(ads, /if \(!isDesktop\(\)\) \{\s*clearFilmMobileStrips\(\);\s*return;/);

const consent = fs.readFileSync('cookie-consent.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
assert.match(consent, /loadScriptOnce\('\/yandex-rsy\.js\?v=' \+ BUILD/);
assert.match(index, /cookie-consent\.js\?v=20260920castcards4/);

console.log('film cast layout contract ok');
