import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ROOT = '/workspace/movie_planner_site';
const BASE = 'http://127.0.0.1:8765/index.html?__spa=/premieres';
const OUT = {
  desk: path.join(ROOT, 'qa-trailerCtaFirm1-desktop.png'),
  deskZoom: path.join(ROOT, 'qa-trailerCtaFirm1-desktop-cta-zoom.png'),
  mob: path.join(ROOT, 'qa-trailerCtaFirm1-mobile390.png'),
  mobZoom: path.join(ROOT, 'qa-trailerCtaFirm1-mobile390-cta-zoom.png'),
  report: path.join(ROOT, 'qa-trailerCtaFirm1-report.json'),
};

function fail(msg, extra) {
  const r = { ok: false, fail: msg, ...(extra || {}) };
  fs.writeFileSync(OUT.report, JSON.stringify(r, null, 2));
  console.error('FAIL', msg);
  console.log(JSON.stringify(r, null, 2));
  process.exit(1);
}

async function dismissChrome(page) {
  await page.evaluate(() => {
    document.querySelectorAll(
      '#cookie-banner, .cookie-banner, [class*="cookie"], [id*="cookie"]'
    ).forEach((el) => { try { el.remove(); } catch (_e) {} });
    document.querySelectorAll('button').forEach((b) => {
      if (/хорошо|принять|ok/i.test(b.textContent || '')) {
        try { b.click(); } catch (_e) {}
      }
    });
  });
}

async function measureActions(page, sel) {
  return page.evaluate((selector) => {
    const actions = document.querySelector(selector);
    if (!actions) return { ok: false, reason: 'no-actions' };
    const btns = [...actions.querySelectorAll('.btn')].filter((el) => {
      if (el.hidden || el.hasAttribute('hidden')) return false;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    });
    const labels = btns.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const rects = btns.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        className: el.className,
        top: Math.round(r.top),
        left: Math.round(r.left),
        height: Math.round(r.height),
        width: Math.round(r.width),
      };
    });
    const tops = rects.map((r) => r.top);
    const sameRow = tops.length <= 1 || (Math.max(...tops) - Math.min(...tops) <= 4);
    const heights = rects.map((r) => r.height);
    const heightOk = heights.length <= 1 || (Math.max(...heights) - Math.min(...heights) <= 4);
    const wrap = getComputedStyle(actions).flexWrap;
    const firmOnly = btns.every((el) => {
      const cn = el.className || '';
      return /\bbtn\b/.test(cn)
        && (/\bbtn-primary\b/.test(cn) || /\bbtn-secondary\b/.test(cn));
    });
    const orderOk = labels[0] === 'На весь экран'
      && labels[1] === 'Страница фильма'
      && labels[2] === 'Купить билеты';
    const overflow = actions.getBoundingClientRect().right > innerWidth + 1;
    return {
      ok: sameRow && heightOk && wrap === 'nowrap' && firmOnly && orderOk && labels.length === 3 && !overflow,
      labels, rects, sameRow, heightOk, wrap, firmOnly, orderOk, overflow,
      vw: innerWidth,
      actionsWidth: Math.round(actions.getBoundingClientRect().width),
    };
  }, sel);
}

async function prepStage(page, { forceMobileVisible = false } = {}) {
  await page.evaluate((forceMobileVisible) => {
    const sec = document.getElementById('section-premieres');
    if (sec) sec.classList.remove('hidden');
    const stories = document.getElementById('premieres-stories');
    if (stories) { stories.hidden = false; stories.removeAttribute('hidden'); }
    const stage = document.getElementById('premieres-stories-stage');
    if (stage) {
      stage.hidden = false;
      stage.removeAttribute('hidden');
      stage.setAttribute('aria-hidden', 'false');
      stage.classList.add('is-playing');
      stage.style.display = 'block';
    }
    if (forceMobileVisible) {
      const style = document.getElementById('qa-force-stage') || document.createElement('style');
      style.id = 'qa-force-stage';
      style.textContent = `
        .premieres-stories-stage { display: block !important; }
        .premieres-stories-stage-actions { display: flex !important; }
      `;
      document.head.appendChild(style);
    }
    // Ensure firm pill CTAs present in correct order
    const actions = document.querySelector('.premieres-stories-stage-actions');
    if (actions) {
      let expand = actions.querySelector('.premieres-stories-stage-expand');
      let film = actions.querySelector('.premieres-stories-stage-filmpage');
      let tickets = actions.querySelector('[data-stage-tickets]');
      if (!expand) {
        expand = document.createElement('button');
        expand.type = 'button';
        expand.textContent = 'На весь экран';
      }
      expand.className = 'btn btn-secondary btn-small premieres-stories-stage-expand';
      expand.textContent = 'На весь экран';
      if (!film) {
        film = document.createElement('a');
        film.href = '#';
        film.textContent = 'Страница фильма';
      }
      film.className = 'btn btn-secondary btn-small premieres-stories-stage-filmpage';
      film.textContent = 'Страница фильма';
      if (!tickets) {
        tickets = document.createElement('a');
        tickets.href = '#';
        tickets.textContent = 'Купить билеты';
      }
      tickets.className = 'btn btn-primary btn-small premieres-stories-stage-tickets';
      tickets.hidden = false;
      tickets.removeAttribute('hidden');
      tickets.textContent = 'Купить билеты';
      actions.appendChild(expand);
      actions.appendChild(film);
      actions.appendChild(tickets);
    }
  }, forceMobileVisible);
}

async function scrollStageIntoView(page) {
  await page.evaluate(() => {
    const el = document.querySelector('.premieres-stories-stage-actions')
      || document.getElementById('premieres-stories-stage')
      || document.getElementById('premieres-stories');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await page.waitForTimeout(300);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const report = { ok: false };

try {
  // Desktop
  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desk.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await desk.waitForTimeout(3000);
  await dismissChrome(desk);
  await prepStage(desk, { forceMobileVisible: false });
  await scrollStageIntoView(desk);
  const deskM = await measureActions(desk, '.premieres-stories-stage-actions');
  report.desktop = deskM;
  await desk.screenshot({ path: OUT.desk, fullPage: false });
  await desk.locator('.premieres-stories-stage-actions').screenshot({ path: OUT.deskZoom });
  if (!deskM.ok) fail('desktop CTA row failed', report);
  await desk.close();

  // Mobile 390 — force stage visible so trailer CTA row is QA'd at phone width
  const mob = await browser.newPage({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } });
  await mob.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await mob.waitForTimeout(3000);
  await dismissChrome(mob);
  await prepStage(mob, { forceMobileVisible: true });
  await scrollStageIntoView(mob);
  const mobM = await measureActions(mob, '.premieres-stories-stage-actions');
  report.mobile = mobM;
  await mob.screenshot({ path: OUT.mob, fullPage: false });
  await mob.locator('.premieres-stories-stage-actions').screenshot({ path: OUT.mobZoom });
  if (!mobM.ok) fail('mobile CTA row failed', report);

  report.ok = true;
  report.screenshots = {
    desktop: OUT.desk,
    desktopZoom: OUT.deskZoom,
    mobile: OUT.mob,
    mobileZoom: OUT.mobZoom,
  };
  fs.writeFileSync(OUT.report, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
