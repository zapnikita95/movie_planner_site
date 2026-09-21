/**
 * Node smoke for festivals mock helpers (no DOM).
 */
var fs = require("fs");
var path = require("path");
var src = fs.readFileSync(path.join(__dirname, "festivals-mock.js"), "utf8");
var window = {};
var globalThis = window;
eval(src);
var Mp = window.MpFestivalsMock;

function eq(got, want, msg) {
  if (got !== want) {
    console.error("FAIL", msg, "got:", got, "want:", want);
    process.exit(1);
  }
}

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
}

eq(Mp.SOURCE, "mock", "source is mock");
ok(Mp.listFestivals().length >= 2, "at least italian + karo");
ok(!!Mp.getFestival("italian-stories-2026"), "italian festival");
ok(!!Mp.getFestival("karofilmart-theater-2026"), "karo festival");

var now = new Date("2026-09-21T12:00:00+03:00");
eq(Mp.statusOf(Mp.getFestival("italian-stories-2026", now), now), "past", "italian past on Sep 21");
eq(Mp.statusOf(Mp.getFestival("karofilmart-theater-2026", now), now), "upcoming", "karo upcoming");
eq(Mp.statusOf(Mp.getFestival("beatfilm-2026", now), now), "past", "beat past");
eq(Mp.getFestival("karofilmart-theater-2026", now).status_label, "Скоро", "status label");

var groups = Mp.scheduleGroups(now);
ok(groups.upcoming.some(function (f) { return f.slug === "karofilmart-theater-2026"; }), "karo in upcoming");
ok(groups.past.some(function (f) { return f.slug === "italian-stories-2026"; }), "italian in past");

var news = Mp.newsFeed();
ok(news.length >= 2, "news strip");
ok(news[0].festival_slug, "news has slug");

var apps = Mp.appearancesForKp("movie-1660825");
ok(apps.length >= 2, "milan on beat + italian");
eq(Mp.appearancesForKp("missing").length, 0, "unknown kp empty");

var karo = Mp.getFestival("karofilmart-theater-2026");
ok(karo.program[0].items.length >= 6, "karo program from screenshot");
ok(karo.program[0].items.some(function (it) { return it.title.indexOf("Отелло") >= 0; }), "othello row");

var beatItems = Mp.kpItems(Mp.getFestival("beatfilm-2026"));
ok(beatItems.some(function (it) { return it.kp_id === "movie-1049286"; }), "twiggy kp");

console.log("festivals-mock.test.js ok");
