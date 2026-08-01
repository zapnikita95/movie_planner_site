/**
 * Node unit tests for MpHeaderSearchScroll.decideSearchRetract
 * Run: node header-search-scroll.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'header-search-scroll.js'), 'utf8');
const sandbox = { window: {}, console };
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.runInNewContext(src, sandbox);
const decide = sandbox.MpHeaderSearchScroll.decideSearchRetract;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

assert(decide(0, 0, { mobile: true }) === 'show', 'top → show');
assert(decide(4, 0, { mobile: true }) === 'show', 'near top → show');
assert(decide(40, 10, { mobile: true }) === 'show', 'under 48px → show (anti-jump)');
assert(decide(100, 60, { mobile: true }) === 'hide', 'scroll down past band → hide');
assert(decide(50, 80, { mobile: true }) === 'show', 'scroll up → show');
assert(decide(100, 90, { mobile: true }) === 'keep', 'tiny delta → keep');
assert(decide(100, 20, { mobile: true, dropdownOpen: true }) === 'show', 'dropdown → show');
assert(decide(100, 20, { mobile: true, inputFocused: true }) === 'show', 'focus → show');
assert(decide(100, 20, { mobile: true, suppressHide: true }) === 'show', 'suppress → show');
assert(decide(100, 20, { mobile: false }) === 'show', 'desktop → show');

assert(src.includes('mp-header-chrome-search'), 'chrome search body class');
assert(src.includes('header-chrome-search-btn'), 'chrome search button bind');
assert(src.includes('ensureChromeSearchBtn'), 'ensure chrome btn if HTML stale');
assert(src.includes('CHROME_SEARCH_CLASS'), 'exports chrome class constant');
assert(sandbox.MpHeaderSearchScroll.CHROME_SEARCH_CLASS === 'mp-header-chrome-search', 'chrome class value');

console.log('header-search-scroll.test.js: OK');
