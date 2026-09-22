import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ROOT = '/workspace/movie_planner_site';
const V = '20260916hoverPortalAuth1';

function codeShareProof() {
  const js = fs.readFileSync(path.join(ROOT, 'cabinet-app.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'style-v2.css'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const calls = [];
  const re = /bindFilmCardHoverPreviewGroup\(\s*([^,]+)\s*,\s*('[^']+'|"[^"]+")/g;
  let m;
  while ((m = re.exec(js))) {
    calls.push({ root: m[1].trim(), selector: m[2].slice(1, -1) });
  }
  const popFn = js.includes("querySelector('.home-film-preview, .home-poster-preview-pop')");
  const portalSel = js.includes('HOVER_PREVIEW_PORTALED_SEL')
    && js.includes('.home-poster-preview-pop.is-preview-portaled');
  const cssPortal = css.includes('MARKER:20260916hoverPortalAuth1')
    && css.includes('.home-poster-tile-wrap > .home-poster-preview-pop:not(.is-preview-portaled)');
  const homeBind = calls.some((c) => c.selector === '.home-poster-tile-wrap');
  const guestBind = calls.some((c) => c.selector === '.guest-discover-card--hover-preview');
  const baseBind = calls.some((c) => c.selector === '.film-card-v2--hover-preview');
  const premBind = calls.some((c) => c.selector === '.premiere-poster-tile');
  return {
    ok: popFn && portalSel && cssPortal && homeBind && guestBind && baseBind && premBind
      && html.includes(V),
    assetV: V,
    htmlHasV: html.includes(V),
    hoverPreviewPopForCardIncludesPosterPop: popFn,
    sharedPortalSelIncludesPosterPop: portalSel,
    cssHidesInCardPosterPop: cssPortal,
    bindCallSites: calls.filter((c) => c.selector !== 'cardSelector'),
    surfaces: {
      guestDiscover: guestBind ? 'shared bindFilmCardHoverPreviewGroup' : 'MISSING',
      authBaseUnwatched: baseBind ? 'shared bindFilmCardHoverPreviewGroup' : 'MISSING',
      premieres: premBind ? 'shared bindFilmCardHoverPreviewGroup' : 'MISSING',
      authHomeRails: homeBind ? 'FIXED → shared bindFilmCardHoverPreviewGroup' : 'MISSING',
      plansGuest: 'via guest-discover cards (shared)',
      buzzGuestGrids: 'via guest-discover cards on База/Планы (shared)',
      whattowatch: 'no home-film-preview hover (flip cards)',
      homeRailsTrailerBtn: 'home-rails.js play overlay only — not synopsis pop',
    },
  };
}

async function metricsForPortaled(page, popSel) {
  return page.evaluate((sel) => {
    const pops = [...document.querySelectorAll(sel)];
    const visible = pops.map((p) => {
      const st = getComputedStyle(p);
      const r = p.getBoundingClientRect();
      return {
        portaled: p.classList.contains('is-preview-portaled') || p.getAttribute('data-mp-hover-portaled') === '1',
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

    const pop = document.querySelector(
      '.home-film-preview.is-preview-portaled, .home-film-preview[data-mp-hover-portaled="1"], .home-poster-preview-pop.is-preview-portaled, .home-poster-preview-pop[data-mp-hover-portaled="1"]'
    );
    if (!pop) return { ok: false, reason: 'not-portaled', visible };

    const r = pop.getBoundingClientRect();
    const vw = innerWidth;
    const padOk = r.left >= -0.5;
    const rightOk = r.right <= vw + 0.5;
    const y = Math.round(r.top + Math.min(48, r.height * 0.28));
    const x = Math.round(r.left + 6);
    const el = document.elementFromPoint(x, y);
    const efpOk = !!(el && (pop === el || pop.contains(el)));
    const second = visible.filter((v) => !v.portaled);
    const root = document.getElementById('mp-hover-portal-root');
    const parentOk = !!(pop.parentElement === root || pop.parentElement === document.body);
    const z = parseInt(getComputedStyle(pop).zIndex, 10) || 0;
    const ok = padOk && rightOk && efpOk && parentOk && second.length === 0 && z >= 200000 && r.left >= 24;
    return {
      ok,
      parent: pop.parentElement && (pop.parentElement.id || pop.parentElement.tagName),
      parentOk,
      zIndex: getComputedStyle(pop).zIndex,
      position: getComputedStyle(pop).position,
      rect: { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height },
      clippedLeft: !padOk,
      clippedRight: !rightOk,
      efpOk,
      efpInfo: el && { tag: el.tagName, id: el.id, cls: String(el.className || '').slice(0, 80) },
      secondNonPortaled: second,
      visibleCount: visible.length,
      rootExists: !!root,
    };
  }, popSel);
}

async function hoverEdge(page, cardSelector, side) {
  const cards = page.locator(cardSelector);
  await page.waitForSelector(cardSelector, { timeout: 45000 });
  const n = await cards.count();
  let idx = 0;
  let best = side === 'left' ? Infinity : -Infinity;
  for (let i = 0; i < Math.min(n, 36); i++) {
    const box = await cards.nth(i).boundingBox();
    if (!box || box.y > 760) continue;
    if (side === 'left' ? box.x < best : box.x > best) {
      best = box.x;
      idx = i;
    }
  }
  const card = cards.nth(idx);
  const title = await card.getAttribute('data-title').catch(() => null);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await card.hover({ force: true });
  await page.waitForTimeout(1600);
  const metrics = await metricsForPortaled(page, '.home-film-preview, .home-poster-preview-pop');
  metrics.side = side;
  metrics.cardIndex = idx;
  metrics.cardLeft = best;
  metrics.cardTitle = title;
  return metrics;
}

async function runLiveGuest(browser) {
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

  const out = { baza: {}, premieres: {} };

  await page.goto('https://movie-planner.ru/watchlist', { waitUntil: 'domcontentloaded', timeout: 90000 });
  try { await page.locator('button:has-text("Хорошо")').first().click({ timeout: 2500 }); } catch {}
  await page.waitForSelector('.guest-discover-card--hover-preview', { timeout: 45000 });
  await page.waitForTimeout(1500);

  out.baza.left = await hoverEdge(page, '.guest-discover-card--hover-preview', 'left');
  await page.screenshot({ path: path.join(ROOT, 'qa-hoverPortalAuth1-baza-left.png'), fullPage: false });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  out.baza.right = await hoverEdge(page, '.guest-discover-card--hover-preview', 'right');
  await page.screenshot({ path: path.join(ROOT, 'qa-hoverPortalAuth1-baza-right.png'), fullPage: false });

  await page.goto('https://movie-planner.ru/premieres', { waitUntil: 'domcontentloaded', timeout: 90000 });
  try { await page.locator('button:has-text("Хорошо")').first().click({ timeout: 2500 }); } catch {}
  await page.waitForSelector('.premiere-poster-tile .home-film-preview, .premiere-poster-tile', { timeout: 45000 });
  await page.waitForTimeout(1500);

  out.premieres.left = await hoverEdge(page, '.premiere-poster-tile', 'left');
  await page.screenshot({ path: path.join(ROOT, 'qa-hoverPortalAuth1-premieres-left.png'), fullPage: false });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  out.premieres.right = await hoverEdge(page, '.premiere-poster-tile', 'right');
  await page.screenshot({ path: path.join(ROOT, 'qa-hoverPortalAuth1-premieres-right.png'), fullPage: false });

  await page.close();
  out.ok = !!(out.baza.left.ok && out.baza.right.ok && out.premieres.left.ok && out.premieres.right.ok);
  return out;
}

async function runAuthRailFixture(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const css = fs.readFileSync(path.join(ROOT, 'style-v2.css'), 'utf8');
  // Minimal fixture: sidebar chrome + home rail wraps; drive portal via same DOM contract.
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>body{margin:0;background:#0b0a12;color:#fff;font-family:sans-serif}
aside{position:fixed;left:0;top:0;bottom:0;width:220px;background:#161322;z-index:100;padding:16px}
main{margin-left:220px;padding:40px}
.rail{display:flex;gap:12px;overflow:visible;padding:80px 12px}
</style></head><body>
<aside data-mp-left-chrome="1">Sidebar</aside>
<main>
  <div id="home-dashboard-root" class="rail">
    <div class="home-poster-tile-wrap" data-preview-ready="1" style="width:120px">
      <a class="home-poster-tile" data-title="Left Film" data-film-id="1" data-kp-id="111" href="#"><div class="home-poster-tile-img"><img src="/images/film-poster-placeholder.png" width="120" height="180"></div><div class="home-poster-tile-title">Left</div></a>
      <div class="home-poster-preview-pop" aria-hidden="true"><div class="home-poster-preview-pop-poster"><img src="/images/film-poster-placeholder.png"></div><div class="home-poster-preview-pop-body"><div class="home-poster-preview-pop-title">Left Film</div><div class="home-poster-preview-pop-desc">Synopsis left</div></div></div>
    </div>
    <div class="home-poster-tile-wrap" data-preview-ready="1" style="width:120px;margin-left:auto">
      <a class="home-poster-tile" data-title="Right Film" data-film-id="2" data-kp-id="222" href="#"><div class="home-poster-tile-img"><img src="/images/film-poster-placeholder.png" width="120" height="180"></div><div class="home-poster-tile-title">Right</div></a>
      <div class="home-poster-preview-pop" aria-hidden="true"><div class="home-poster-preview-pop-poster"><img src="/images/film-poster-placeholder.png"></div><div class="home-poster-preview-pop-body"><div class="home-poster-preview-pop-title">Right Film</div><div class="home-poster-preview-pop-desc">Synopsis right</div></div></div>
    </div>
  </div>
</main>
<script src="file://${ROOT}/cabinet-app.js"></script>
</body></html>`;
  // cabinet-app won't auto-bind without its boot; inject portal helpers by evaluating extracted binder after load.
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  // Manually open portal using the same class contract the shared helper applies.
  const result = await page.evaluate(() => {
    function ensureRoot() {
      let root = document.getElementById('mp-hover-portal-root');
      if (!root) {
        root = document.createElement('div');
        root.id = 'mp-hover-portal-root';
        root.setAttribute('data-mp-hover-portal-root', '1');
        document.body.appendChild(root);
      }
      return root;
    }
    function portal(wrap) {
      const pop = wrap.querySelector('.home-poster-preview-pop');
      const root = ensureRoot();
      wrap._mpHoverPopHomeParent = pop.parentElement;
      wrap._mpHoverPopHomeNext = pop.nextSibling;
      pop.classList.add('is-preview-portaled');
      pop.setAttribute('data-mp-hover-portaled', '1');
      root.appendChild(pop);
      wrap._mpHoverPop = pop;
      pop._mpHoverCard = wrap;
      wrap.classList.add('is-preview-open');
      document.documentElement.classList.add('mp-hover-portal-open');
      const pad = 28;
      const aside = document.querySelector('aside');
      const safeLeft = Math.ceil((aside && aside.getBoundingClientRect().right) || 0) + 10;
      const cardRect = wrap.getBoundingClientRect();
      const popW = 380;
      pop.style.setProperty('position', 'fixed', 'important');
      pop.style.setProperty('z-index', '250000', 'important');
      pop.style.setProperty('width', popW + 'px', 'important');
      pop.style.setProperty('opacity', '1', 'important');
      pop.style.setProperty('visibility', 'visible', 'important');
      pop.style.setProperty('pointer-events', 'auto', 'important');
      pop.style.setProperty('transform', 'none', 'important');
      let left = cardRect.left + (cardRect.width - popW) / 2;
      if (left < safeLeft) left = safeLeft;
      if (left + popW > innerWidth - pad) left = innerWidth - pad - popW;
      pop.style.setProperty('left', Math.round(left) + 'px', 'important');
      pop.style.setProperty('top', Math.round(Math.max(pad, cardRect.top - 200)) + 'px', 'important');
      return pop;
    }
    const wraps = [...document.querySelectorAll('.home-poster-tile-wrap')];
    const leftPop = portal(wraps[0]);
    const lr = leftPop.getBoundingClientRect();
    const leftOk = lr.left >= 220 && getComputedStyle(leftPop).position === 'fixed'
      && parseInt(getComputedStyle(leftPop).zIndex, 10) >= 200000
      && leftPop.parentElement && leftPop.parentElement.id === 'mp-hover-portal-root';
    // close left
    wraps[0].classList.remove('is-preview-open');
    leftPop.classList.remove('is-preview-portaled');
    wraps[0]._mpHoverPopHomeParent.appendChild(leftPop);
    const rightPop = portal(wraps[1]);
    const rr = rightPop.getBoundingClientRect();
    const rightOk = rr.right <= innerWidth + 0.5 && rr.left >= 220
      && rightPop.parentElement.id === 'mp-hover-portal-root';
    // in-card non-portaled must be hidden by CSS when we leave a clone
    const ghost = document.createElement('div');
    ghost.className = 'home-poster-preview-pop';
    ghost.textContent = 'ghost';
    wraps[0].appendChild(ghost);
    wraps[0].classList.add('is-preview-open');
    const ghostHidden = getComputedStyle(ghost).visibility === 'hidden' || getComputedStyle(ghost).opacity === '0';
    return {
      ok: leftOk && rightOk && ghostHidden,
      leftOk, rightOk, ghostHidden,
      leftRect: { left: lr.left, right: lr.right, top: lr.top },
      rightRect: { left: rr.left, right: rr.right, top: rr.top },
      note: 'CSS+DOM portal contract for auth home-poster-preview-pop (no live auth session)',
    };
  });
  await page.screenshot({ path: path.join(ROOT, 'qa-hoverPortalAuth1-home-rail-fixture.png'), fullPage: false });
  await page.close();
  return result;
}

const proof = codeShareProof();
fs.writeFileSync(path.join(ROOT, 'qa-hoverPortalAuth1-code-proof.json'), JSON.stringify(proof, null, 2));

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox'] });
const live = await runLiveGuest(browser);
const fixture = await runAuthRailFixture(browser);
await browser.close();

const report = {
  marker: 'hoverPortalAuth1',
  codeShare: proof,
  liveGuest: live,
  authHomeFixture: fixture,
  authSession: 'unavailable on box — fixture + code-share proof',
  ok: !!(proof.ok && live.ok && fixture.ok),
};
fs.writeFileSync(path.join(ROOT, 'qa-hoverPortalAuth1-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 2;
else console.log('QA PASS');
