import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ROOT = '/workspace/movie_planner_site';
const OUT = path.join(ROOT, 'qa-hoverPortal1c-live-left.png');
const OUT_METRICS = path.join(ROOT, 'qa-hoverPortal1c-live-metrics.json');
const OUT_ZOOM = path.join(ROOT, 'qa-hoverPortal1c-card-zoom.png');

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

await page.route(/cabinet-app\.js/, async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/javascript; charset=utf-8',
    body: fs.readFileSync(path.join(ROOT, 'cabinet-app.js')),
  });
});
await page.route(/style-v2\.css/, async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'text/css; charset=utf-8',
    body: fs.readFileSync(path.join(ROOT, 'style-v2.css')),
  });
});

await page.goto('https://movie-planner.ru/watchlist', { waitUntil: 'domcontentloaded', timeout: 90000 });
try { await page.locator('button:has-text("Хорошо")').first().click({ timeout: 2500 }); } catch {}
await page.waitForTimeout(3000);
await page.waitForSelector('.guest-discover-card--hover-preview', { timeout: 30000 });

const cards = page.locator('.guest-discover-card--hover-preview');
const n = await cards.count();
let leftmost = 0, minLeft = Infinity;
for (let i = 0; i < Math.min(n, 24); i++) {
  const box = await cards.nth(i).boundingBox();
  if (!box || box.y > 700) continue;
  if (box.x < minLeft) { minLeft = box.x; leftmost = i; }
}
const card = cards.nth(leftmost);
const title = await card.getAttribute('data-title');
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await card.hover({ force: true });
await page.waitForTimeout(1800);

const metrics = await page.evaluate(() => {
  const pops = [...document.querySelectorAll('.home-film-preview')];
  const visible = pops.map((p) => {
    const st = getComputedStyle(p);
    const r = p.getBoundingClientRect();
    return {
      portaled: p.classList.contains('is-preview-portaled'),
      parent: p.parentElement && (p.parentElement.id || p.parentElement.tagName),
      opacity: st.opacity,
      visibility: st.visibility,
      zIndex: st.zIndex,
      position: st.position,
      left: r.left,
      right: r.right,
      top: r.top,
      width: r.width,
      height: r.height,
    };
  }).filter((d) => d.width > 40 && d.opacity !== '0' && d.visibility !== 'hidden');

  const pop = document.querySelector('.home-film-preview.is-preview-portaled, .home-film-preview[data-mp-hover-portaled="1"]');
  if (!pop) {
    return { ok: false, reason: 'not-portaled', visible };
  }
  const r = pop.getBoundingClientRect();
  const poster = pop.querySelector('.home-film-preview-poster, img');
  const pr = poster && poster.getBoundingClientRect();
  const trailer = pop.querySelector('.home-film-preview-trailer');
  const tr = trailer && !trailer.hidden ? trailer.getBoundingClientRect() : null;
  const vw = innerWidth;
  const padOk = r.left >= -0.5;
  const rightOk = r.right <= vw + 0.5;
  const posterOk = pr ? pr.left >= -0.5 : false;
  const trailerOk = tr ? tr.left >= -0.5 : true;

  const y = Math.round(r.top + Math.min(48, r.height * 0.28));
  const x = Math.round(r.left + 6);
  const el = document.elementFromPoint(x, y);
  const efpOk = !!(el && (pop === el || pop.contains(el)));
  const efpInfo = el && {
    tag: el.tagName,
    id: el.id,
    cls: String(el.className || '').slice(0, 80),
  };

  // Any other visible non-portaled preview?
  const second = visible.filter((v) => !v.portaled);

  const root = document.getElementById('mp-hover-portal-root');
  const parentOk = !!(pop.parentElement === root || pop.parentElement === document.body);
  const z = parseInt(getComputedStyle(pop).zIndex, 10) || 0;

  const ok = padOk && rightOk && posterOk && trailerOk && efpOk && parentOk && second.length === 0 && z >= 200000 && r.left >= 24;

  return {
    ok,
    title: (pop.querySelector('.home-film-preview-title') || {}).textContent || '',
    portaled: true,
    parent: pop.parentElement && (pop.parentElement.id || pop.parentElement.tagName),
    parentOk,
    zIndex: getComputedStyle(pop).zIndex,
    position: getComputedStyle(pop).position,
    rect: { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height },
    posterRect: pr && { left: pr.left, right: pr.right, width: pr.width },
    trailerRect: tr && { left: tr.left, right: tr.right, width: tr.width, height: tr.height },
    clippedLeft: !padOk,
    clippedRight: !rightOk,
    posterClipped: !posterOk,
    trailerClipped: !trailerOk,
    efpOk,
    efpInfo,
    efpPoint: { x, y },
    secondNonPortaled: second,
    visibleCount: visible.length,
    rootExists: !!root,
    htmlOpenClass: document.documentElement.classList.contains('mp-hover-portal-open'),
  };
});
metrics.cardTitle = title;
metrics.cardIndex = leftmost;
metrics.cardLeft = minLeft;

await page.screenshot({ path: OUT, fullPage: false });
const box = metrics.rect;
if (box) {
  await page.screenshot({
    path: OUT_ZOOM,
    clip: {
      x: Math.max(0, box.left - 40),
      y: Math.max(0, box.top - 24),
      width: Math.min(1440 - Math.max(0, box.left - 40), box.width + 80),
      height: Math.min(900 - Math.max(0, box.top - 24), box.height + 48),
    },
  });
}
fs.writeFileSync(OUT_METRICS, JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
if (!metrics.ok) {
  console.error('QA FAIL');
  process.exitCode = 2;
} else {
  console.log('QA PASS', OUT);
}
await browser.close();
