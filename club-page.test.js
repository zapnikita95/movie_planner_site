const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = fs.readFileSync('club-page.js', 'utf8');
const styles = fs.readFileSync('style-v2.css', 'utf8');

const gateStart = page.indexOf('function shouldShowOnboarding()');
const gateEnd = page.indexOf('\n  function sampleBadge', gateStart);
const gate = page.slice(gateStart, gateEnd);

assert.ok(gateStart >= 0 && gateEnd > gateStart, 'onboarding gate exists');
assert.match(gate, /!state\.admin/);
assert.match(page, /data-club-onboard-open>\u0418\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b \u043a\u043b\u0443\u0431\u0430/);
assert.match(page, /class="club-onboard-close" data-club-onboard-dismiss aria-label="\u0417\u0430\u043a\u0440\u044b\u0442\u044c"/);
assert.doesNotMatch(page, /data-club-onboard-dismiss>\u041f\u043e\u043d\u044f\u0442\u043d\u043e/);
assert.doesNotMatch(page, /data-club-onboard-dismiss aria-label="\u0417\u0430\u043a\u0440\u044b\u0442\u044c">\u0417\u0430\u043a\u0440\u044b\u0442\u044c/);
assert.match(styles, /\.club-onboard-close\{/);

const scheduleActionStart = page.indexOf('function clubScheduleAction');
const scheduleActionEnd = page.indexOf('\n  function refreshClubPlanWatched', scheduleActionStart);
const scheduleAction = page.slice(scheduleActionStart, scheduleActionEnd);
assert.doesNotMatch(scheduleAction, /data-club-join/);
assert.doesNotMatch(scheduleAction, /clubCalendarControls/);
assert.match(page, /<summary>Добавить в календарь<\/summary>/);
assert.match(page, /function filmHistoryGroups\(\)/);
assert.match(page, /data-club-note-url=/);
assert.match(page, /Добавить заметку и запись/);
assert.match(page, /interactive && interactive !== b/);
assert.match(styles, /\.club-film-history\s*\{/);
assert.match(styles, /body\.club-plan-open\s*\{\s*overflow:\s*hidden/);

console.log('club onboarding contract ok');
