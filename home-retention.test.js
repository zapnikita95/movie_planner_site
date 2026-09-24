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
const helpersStart = cabinetSrc.indexOf('  function retentionDayWord');
const helpersEnd = cabinetSrc.indexOf('  function renderHomeRetentionHtml', helpersStart);
assert(helpersStart >= 0 && helpersEnd > helpersStart, 'retention render helpers are present');

const retentionSandbox = { escapeHtml, console };
vm.runInNewContext(
  cabinetSrc.slice(helpersStart, helpersEnd)
    + '\nthis.renderHomeStreakHtml = renderHomeStreakHtml;',
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
assert(indexSrc.includes("var V='20260924homeRetention1'"), 'script asset version is pinned');
assert(indexSrc.includes('/style-v2.css?v=20260924homeRetention1'), 'style asset version is pinned');

console.log('home-retention.test.js: OK');
