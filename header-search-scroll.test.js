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
assert(decide(40, 20, { mobile: true }) === 'hide', 'scroll down → hide');
assert(decide(20, 40, { mobile: true }) === 'show', 'scroll up → show');
assert(decide(40, 38, { mobile: true }) === 'keep', 'tiny delta → keep');
assert(decide(100, 20, { mobile: true, dropdownOpen: true }) === 'show', 'dropdown → show');
assert(decide(100, 20, { mobile: true, inputFocused: true }) === 'show', 'focus → show');
assert(decide(100, 20, { mobile: false }) === 'show', 'desktop → show');

console.log('header-search-scroll.test.js: OK');
