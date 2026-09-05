/**
 * Node smoke for club frequency buckets (no DOM).
 */
var fs = require('fs');
var path = require('path');
var src = fs.readFileSync(path.join(__dirname, 'clubs-page.js'), 'utf8');
var window = {};
var globalThis = window;
eval(src);
var label = window.MpClubsPage.watchFrequencyLabel;

function eq(got, want, msg) {
  if (got !== want) {
    console.error('FAIL', msg, 'got:', got, 'want:', want);
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
console.log('clubs-page frequency ok');
