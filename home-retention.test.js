/**
 * Smoke/unit coverage for the web home retention card and evening rail badge.
 * Run: node home-retention.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assert failed');
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const cabinetSrc = fs.readFileSync(path.join(__dirname, 'cabinet-app.js'), 'utf8');
assert(cabinetSrc.includes("HOME_RETENTION_SESSION_CACHE_KEY_PREFIX = 'mp_home_retention_cache_v2:'"), 'old cached payloads without streak are invalidated');
const helpersStart = cabinetSrc.indexOf('  function moscowCalendarDay');
const helpersEnd = cabinetSrc.indexOf('  function renderHomeRetentionHtml', helpersStart);
assert(helpersStart >= 0 && helpersEnd > helpersStart, 'retention render helpers are present');

const retentionSandbox = { escapeHtml, console, Intl, Date, Number, String };
vm.runInNewContext(
  cabinetSrc.slice(helpersStart, helpersEnd)
    + '\nthis.renderHomeStreakHtml = renderHomeStreakHtml;'
    + '\nthis.moscowCalendarDay = moscowCalendarDay;'
    + '\nthis.homeRetentionCacheMatchesMoscowDay = homeRetentionCacheMatchesMoscowDay;',
  retentionSandbox,
);

const streakHtml = retentionSandbox.renderHomeStreakHtml({
  days: 4,
  multiplier: 1.15,
  max_multiplier: 1.5,
  today_active: true,
  prompt: 'Возвращайтесь завтра',
  next_reward: { day: 10, kind: 'promo_code', label: 'Промокод в кино', current: 4, target: 10 },
  promo_rewards: [
    { milestone_day: 10, status: 'pending', provider: 'Киносеть' },
    { milestone_day: 14, status: 'issued', provider: '<Кино>', code: 'SAVE&GO', expires_at: '2026-10-31' },
  ],
});

assert(streakHtml.includes('4 дня подряд'), 'renders streak duration');
assert(streakHtml.includes('×1,15') && streakHtml.includes('×1,5'), 'renders current and maximum coin multipliers');
assert(streakHtml.includes('Сегодня засчитано'), 'renders active-today state');
assert(streakHtml.includes('Промокод в кино — на 10-й день'), 'renders next reward');
assert(streakHtml.includes('aria-valuenow="4"') && streakHtml.includes('width:40%'), 'renders reward progress');
assert(streakHtml.includes('Впереди') && streakHtml.includes('Получен'), 'renders pending and issued promo states');
assert(streakHtml.includes('SAVE&amp;GO'), 'escapes promo code');
assert(streakHtml.includes('&lt;Кино&gt;') && !streakHtml.includes('<Кино>'), 'escapes provider');
assert(streakHtml.includes('Telegram-боте и расширении'), 'explains cross-product streak activity');

const emptyStreakHtml = retentionSandbox.renderHomeStreakHtml({});
assert(emptyStreakHtml.includes('0 дней подряд'), 'streak card remains visible before the first active day');
assert(emptyStreakHtml.includes('Нужна активность сегодня'), 'renders a clear next action for inactive users');

const railSrc = fs.readFileSync(path.join(__dirname, 'home-rails.js'), 'utf8');
const railSandbox = {
  window: {},
  globalThis: {},
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
};
vm.runInNewContext(railSrc, railSandbox);
const rails = railSandbox.window.MPHomeRails;
assert(rails && typeof rails.posterTileHtml === 'function', 'home rails API is available');

const eveningTile = rails.posterTileHtml(
  { kp_id: 1, title: 'Недавняя премьера', year: 2026, badge: 'Премьера' },
  { showBadge: true, posterUrl() { return '/poster.jpg'; } },
  0,
);
const regularTile = rails.posterTileHtml(
  { kp_id: 1, title: 'Недавняя премьера', year: 2026, badge: 'Премьера' },
  { showBadge: false, posterUrl() { return '/poster.jpg'; } },
  0,
);
assert(eveningTile.includes('home-evening-badge') && eveningTile.includes('Премьера'), 'evening tile renders backend badge');
assert(!regularTile.includes('home-evening-badge'), 'other rails do not render the evening badge');
assert((railSrc.match(/showBadge: railId === "evening-from-base"/g) || []).length === 2, 'badge is wired for append and prepend');

const indexSrc = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert(indexSrc.includes("var V='20261001dailyFilmGap2'"), 'script asset version is pinned');
assert(indexSrc.includes('/style-v2.css?v=20261001dailyFilmGap2'), 'style asset version is pinned');

// 2026-09-30 20:30 UTC = 23:30 Moscow (still the 30th). 21:30 UTC = 00:30 Moscow on the 1st.
assert(retentionSandbox.moscowCalendarDay(new Date('2026-09-30T20:30:00Z')) === '2026-09-30', 'moscow day stays on the 30th before midnight');
assert(retentionSandbox.moscowCalendarDay(new Date('2026-09-30T21:30:00Z')) === '2026-10-01', 'moscow day rolls at 21:00 UTC');

const todayMsk = retentionSandbox.moscowCalendarDay(new Date());
assert(retentionSandbox.homeRetentionCacheMatchesMoscowDay(Date.now(), todayMsk), 'today cache matches');
assert(!retentionSandbox.homeRetentionCacheMatchesMoscowDay(Date.now() - 36 * 60 * 60 * 1000, todayMsk), 'savedAt from a previous moscow day is rejected even if the stamp was copied forward');
assert(!retentionSandbox.homeRetentionCacheMatchesMoscowDay(Date.now(), '1999-01-01'), 'a stale moscow stamp is rejected inside the 15 minute window');
assert(!retentionSandbox.homeRetentionCacheMatchesMoscowDay(null, ''), 'unstamped retention cache is not reused');

assert(cabinetSrc.includes("cache: 'no-store'"), 'retention home is not served from the HTTP cache');
assert(cabinetSrc.includes('dropHomeRetentionIfMoscowDayRolled'), 'in-memory film of the day is dropped when Moscow day rolls');
assert(cabinetSrc.includes('armHomeRetentionMoscowDayRefresh'), 'open home tab refetches after Moscow midnight');

const cssSrc = fs.readFileSync(path.join(__dirname, 'style-v2.css'), 'utf8');
assert(cssSrc.includes('.retention-daily {\n  grid-row: span 2;\n  overflow: hidden;\n  display: flex;\n  flex-direction: column;\n  align-self: stretch;\n  min-height: 100%;\n  height: 100%;\n  /* Beat mobile `section { padding: 40px 20px }` — that inset is a void under the pills. */\n  padding: 0;\n}'), 'film card opts out of the mobile section padding that sat under the pills');
assert(cssSrc.includes('.retention-daily-claimed {\n  display: flex;\n  flex-direction: column;\n  /* Air under the poster (the taller column). Nothing below the pills. */\n  gap: 14px;'), '14px between the poster row and the buttons');
assert(cssSrc.includes('.retention-daily-ctas {\n  display: flex;\n  flex-wrap: nowrap;\n  gap: 8px;\n  padding: 0 16px 0;'), 'desktop CTA row has no padding under the pills');
assert(cssSrc.includes('.retention-daily-claimed { gap: 14px; }'), 'mobile keeps the 14px poster gap');
assert(cssSrc.includes('.retention-daily-ctas { padding: 0 12px 0; margin: 0; }'), 'mobile CTA row has no padding under the pills');
assert(cssSrc.includes('.retention-daily-ctas .btn.btn-primary.retention-daily-cta'), 'primary pill paint stays on .btn.btn-primary');
assert(cssSrc.includes('.retention-daily-ctas .btn.btn-secondary.retention-daily-cta'), 'secondary pill paint stays on .btn.btn-secondary');

console.log('home-retention.test.js: OK');
