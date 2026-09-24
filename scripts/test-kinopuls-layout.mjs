import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
for (const path of ['kinopuls/index.html','kinopuls/podbor-blogerov/index.html','kinopuls/agency/index.html']) {
  const html=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  for(const marker of ['id="site-header"','header-search-input','footer-content','footer-store-row','/film-page.js','/articles/article-chrome.js','kp-main subpage-main']) assert.ok(html.includes(marker),path+': missing '+marker);
  assert.equal((html.match(/<h1>/g)||[]).length,1);
  assert.ok(!html.includes('<header>'));
  assert.ok(!html.includes('Обсудить релиз с Никитой'));
  assert.ok(html.includes('/kinopuls/kinopuls-motion.js'));
  assert.ok(html.includes('20260924motion2'));
  assert.ok(html.indexOf('class="cta"') < html.indexOf('class="kp-hero-detail"'));
  if (path !== 'kinopuls/index.html') {
    assert.ok(html.includes('data-kp-art'));
    assert.ok(!/VIDEODROME|Луцай/i.test(html));
  }
}
const home=readFileSync(new URL('../kinopuls/index.html',import.meta.url),'utf8');
assert.ok(!home.includes('Почему нельзя выбирать только по Telegram'));
assert.ok(home.includes('data-kp-sequence'));
assert.ok(home.includes('/images/kinopuls-popcorn.svg'));
assert.ok(home.includes('viewBox="-12 -60 1024 320"'));
assert.ok(!home.includes('Знаем кино.'));
assert.ok(!home.includes('Направление развивает'));
assert.ok(!home.includes('kp-brand-icon'));
const popcorn=readFileSync(new URL('../images/kinopuls-popcorn.svg',import.meta.url),'utf8');
assert.ok(!popcorn.includes('<image'));
assert.ok(popcorn.includes('1024 x 1024'));
assert.ok(!home.includes('cinema-intelligence-v1.webp'));
const css=readFileSync(new URL('../kinopuls/kinopuls.css',import.meta.url),'utf8');
assert.ok(css.includes('counter(step,decimal-leading-zero)'));
assert.ok(css.includes('grid-template-columns:1fr 1fr'));
assert.ok(css.includes('@media(max-width:700px)'));
assert.ok(!css.includes('.header-content'));
assert.ok(css.includes('prefers-reduced-motion:reduce'));
assert.ok(css.includes('grid-column:1/-1'));
assert.ok(css.includes('#contact>.cta{margin-top:30px}'));
for (const rule of css.match(/\.kp-origin-art img\{[^}]+\}/g)||[]) {
  assert.ok(!rule.includes('width:760px'));
  assert.ok(!rule.includes('width:520px'));
}
console.log('Kinopuls: shared chrome, semantic headings and responsive steps OK');
