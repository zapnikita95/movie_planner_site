/**
 * Login vs onboarding layer gate: login wins, tour waits.
 * Run: node auth-onboard-layers.test.js
 */
var fs = require('fs');
var path = require('path');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
}

var login = fs.readFileSync(path.join(__dirname, 'public-film-login.js'), 'utf8');
var cabinet = fs.readFileSync(path.join(__dirname, 'cabinet-app.js'), 'utf8');
var onboard = fs.readFileSync(path.join(__dirname, 'onboarding-flow.js'), 'utf8');

assert(login.indexOf('ensureMpLayerGate') >= 0, 'public-film-login installs layer gate');
assert(login.indexOf('hideOnboardingLayers') >= 0, 'login open hides onboarding');
assert(login.indexOf('mp:login-modal-dismissed') >= 0, 'login dismiss event');
assert(login.indexOf('queueOnboarding') >= 0, 'login queues onboarding');

assert(cabinet.indexOf('deferOnboardingIfLoginOpen') >= 0, 'cabinet defers tours while login open');
assert(cabinet.indexOf('flushOnboardingAfterLoginSettled') >= 0, 'cabinet flushes after login');
assert(cabinet.indexOf('if (!getToken() && !opts.force) return') >= 0, 'home tour skipped for guests');
assert(cabinet.indexOf('__mpOnLoginModalDismissed') >= 0, 'cabinet listens for login dismiss');

assert(onboard.indexOf('loginModalIsOpen') >= 0, 'onboarding-flow checks login');
assert(onboard.indexOf('queueOnboardingUntilLoginSettled') >= 0, 'onboarding-flow queues behind login');

var loginOpenIdx = login.indexOf('function showLoginModal');
var hideIdx = login.indexOf('gate.hideOnboardingLayers');
assert(loginOpenIdx >= 0 && hideIdx > loginOpenIdx && hideIdx < loginOpenIdx + 400, 'showLoginModal hides layers first');

console.log('auth-onboard-layers.test.js: OK');
