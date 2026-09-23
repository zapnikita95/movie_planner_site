import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
for (const path of ['kinopuls/index.html','kinopuls/podbor-blogerov/index.html','kinopuls/agency/index.html']) {
  const html=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  for(const marker of ['id="site-header"','header-search-input','footer-content','footer-store-row','/film-page.js','/articles/article-chrome.js','kp-main subpage-main']) assert.ok(html.includes(marker),path+': missing '+marker);
  assert.equal((html.match(/<h1>/g)||[]).length,1);
  assert.ok(!html.includes('<header>'));
}
const css=readFileSync(new URL('../kinopuls/kinopuls.css',import.meta.url),'utf8');
assert.ok(css.includes('counter(step,decimal-leading-zero)'));
assert.ok(css.includes('grid-template-columns:1fr 1fr'));
assert.ok(css.includes('@media(max-width:700px)'));
assert.ok(!css.includes('.header-content'));
console.log('Kinopuls: shared chrome, semantic headings and responsive steps OK');
