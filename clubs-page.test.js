/**
 * Node smoke for club catalog contract helpers (no DOM).
 */
var fs = require('fs');
var path = require('path');
var src = fs.readFileSync(path.join(__dirname, 'clubs-page.js'), 'utf8');
var window = {};
var globalThis = window;
eval(src);
var Mp = window.MpClubsPage;
var label = Mp.watchFrequencyLabel;

function eq(got, want, msg) {
  if (got !== want) {
    console.error('FAIL', msg, 'got:', got, 'want:', want);
    process.exit(1);
  }
}

function deepEq(got, want, msg) {
  var a = JSON.stringify(got);
  var b = JSON.stringify(want);
  if (a !== b) {
    console.error('FAIL', msg, 'got:', a, 'want:', b);
    process.exit(1);
  }
}

eq(label({ watch_frequency_label: 'раз в неделю' }), 'раз в неделю', 'bucket string');
eq(label({ frequency: 'weekly' }), 'раз в неделю', 'weekly key');
eq(label({ avg_days_between_watches: 3 }), 'раз в несколько дней', 'few days');
eq(label({ avg_days_between_watches: 7 }), 'раз в неделю', 'week days');
eq(label({ avg_days_between_watches: 14 }), 'раз в две недели', 'biweekly');
eq(label({ avg_days_between_watches: 30 }), 'раз в месяц', 'month');
eq(label({ avg_days_between_watches: 80 }), 'редко', 'rare');
eq(label({}), 'пока мало данных', 'empty');
eq(label({ description: 'x' }), 'пока мало данных', 'no activity');

eq(Mp.PAGE_SIZE, 24, 'page size 24');

var guestPaths = Mp.discoverPaths(false, '', 0);
eq(guestPaths[0], '/api/public/cinema-clubs?limit=24&offset=0&q=', 'guest primary cinema-clubs');
eq(guestPaths[0].indexOf('/api/public/cinema-clubs?') === 0, true, 'guest starts public cinema-clubs');

var authPaths = Mp.discoverPaths(true, 'ночь', 24);
eq(authPaths[0].indexOf('/api/site/groups/discover?kind=cinema_club&discoverable_only=1&') === 0, true, 'auth primary site discover');
eq(authPaths[0].indexOf('limit=24') !== -1, true, 'auth has limit');
eq(authPaths[0].indexOf('offset=24') !== -1, true, 'auth has offset');
eq(authPaths[0].indexOf('q=%D0%BD%D0%BE%D1%87%D1%8C') !== -1, true, 'auth encodes q');

var fromPublic = Mp.clubsFromPayload({
  success: true,
  groups: [{ chat_id: 1, name: 'Ночь' }, { chat_id: 2, name: 'Другое', group_kind: 'friends' }],
});
eq(fromPublic.length, 1, 'omit group_kind = cinema club; filter friends');
eq(fromPublic[0].name, 'Ночь', 'kept unnamed-kind club');

eq(Mp.clubsFromPayload({ success: false, error: 'HTTP 404' }), null, '404 is miss');
eq(Mp.clubsFromPayload({}), null, 'empty object is miss');
deepEq(Mp.clubsFromPayload({ success: true, groups: [] }), [], 'empty catalog ok');

var plan = Mp.nextPlan({
  next_plan: {
    kp_id: 123,
    title: 'Дюна',
    poster: '/p.jpg',
    plan_datetime: '2026-09-12T18:00:00+03:00',
  },
});
eq(plan.title, 'Дюна', 'next_plan title');
eq(plan.kpId, 123, 'next_plan kp_id');
eq(!!plan.when, true, 'plan_datetime formats');
eq(Mp.nextPlan({ next_plan: null }), null, 'null next_plan');

var recent = Mp.recentWatched({
  recent_watched: [
    { kp_id: 1, title: 'A', poster: '', watched_at: '2026-01-01' },
    { kp_id: 2, title: 'B', poster: '', watched_at: '2026-01-02' },
    { kp_id: 3, title: 'C', poster: '', watched_at: '2026-01-03' },
    { kp_id: 4, title: 'D', poster: '', watched_at: '2026-01-04' },
  ],
});
eq(recent.length, 3, 'recent_watched max 3');
eq(recent[0].title, 'A', 'keeps order');
eq(recent[0].kpId, 1, 'kp_id on recent');

console.log('clubs-page contract ok');
