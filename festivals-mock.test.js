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
ok(Mp.listFestivals().length >= 6, "seed festivals");
ok(!!Mp.getFestival("beatfilm-2026"), "beat weekend");
ok(!!Mp.getFestival("karofilmart-2026"), "karo art");
ok(!!Mp.getFestival("flahertiana-2026"), "flahertiana");
ok(!!Mp.getFestival("siberia-meetings-2026"), "siberia");
ok(!!Mp.getFestival("sretensky-vstrecha-2026"), "sretensky");
ok(!!Mp.getFestival("eurasia-doc-2026"), "eurasia");
ok(!!Mp.getFestival("message-to-man-2026"), "message to man");
ok(!!Mp.getFestival("africa-together-2026"), "africa together");
ok(Mp.getFestival("africa-together-2026").featured === true, "africa festival is featured on the hub");
ok(Mp.listFestivals().every(function (f) { return String(f.cover).indexOf("data:image/svg+xml") === 0; }), "festival cards use festival identities");
ok(Mp.listFestivals().every(function (f) { return String(f.cover).indexOf("kinopoisk-image") < 0; }), "festival cards do not use movie posters");
ok(Mp.listFestivals().every(function (f) { return /^https:\/\//.test(String(f.official_art)); }), "every festival has official artwork");
ok(Mp.listFestivals().every(function (f) { return String(f.official_art).indexOf("kinopoisk-image") < 0; }), "official artwork is not a movie poster");

var now = new Date("2026-09-21T12:00:00+03:00");
eq(Mp.statusOf(Mp.getFestival("beatfilm-2026", now), now), "past", "beat past on Sep 21");
eq(Mp.getFestival("beatfilm-2026", now).starts_at, "2026-09-10", "beat starts Sep 10");
eq(Mp.getFestival("beatfilm-2026", now).ends_at, "2026-09-20", "beat ends Sep 20");
eq(Mp.statusOf(Mp.getFestival("siberia-meetings-2026", now), now), "live", "siberia live");
eq(Mp.statusOf(Mp.getFestival("flahertiana-2026", now), now), "upcoming", "flahertiana upcoming");
eq(Mp.statusOf(Mp.getFestival("karofilmart-2026", now), now), "upcoming", "karo upcoming");
eq(Mp.getFestival("karofilmart-2026", now).starts_at, "2026-10-14", "karo 14 Oct");
eq(Mp.formatDateRange("2026-09-21", "2026-09-27"), "21 по 27 сентября", "same-month range");
eq(Mp.formatDateRange("2026-09-25", "2026-10-01"), "25 сентября по 1 октября", "cross-month range");
eq(Mp.formatDateRange("2026-10-14", "2026-10-25"), "14 по 25 октября", "karo dates");

var teaser = Mp.teaserList(now);
ok(teaser.length >= 4, "premieres teaser has live+upcoming");
ok(teaser.every(function (f) { return f.status !== "past"; }), "teaser skips past");
ok(teaser[0].slug === "siberia-meetings-2026", "teaser starts with live");
ok(!teaser.some(function (f) { return f.slug === "beatfilm-2026"; }), "beat weekend not in teaser");

var car = Mp.scheduleCarousel(now);
eq(car[0].slug, "siberia-meetings-2026", "carousel starts with live");
ok(car.some(function (f) { return f.slug === "beatfilm-2026" && f.status === "past"; }), "beat in past tail");
var liveIdx = car.findIndex(function (f) { return f.status === "live"; });
var upIdx = car.findIndex(function (f) { return f.status === "upcoming"; });
var pastIdx = car.findIndex(function (f) { return f.status === "past"; });
ok(liveIdx >= 0 && upIdx > liveIdx && pastIdx > upIdx, "order live → upcoming → past");

var days = Mp.programDays(Mp.getFestival("karofilmart-2026"));
ok(days.length >= 4, "karo calendar days");
ok(days[0].items.length >= 1, "karo day has films");

var africa = Mp.getFestival("africa-together-2026", now);
ok(/^https:\/\//.test(africa.logo), "africa official logo");
eq(Mp.programDays(africa).length, 4, "africa has four confirmed screening days");
ok(Mp.programDays(africa).every(function (day) {
  return day.items.every(function (item) { return item.description && item.ticket_url; });
}), "africa screenings have descriptions and ticket links");
ok(Mp.appearancesForKp("movie-1337148", now).some(function (a) {
  return a.slug === "africa-together-2026" && a.status === "upcoming";
}), "aisha has upcoming festival badge");
["movie-1405200", "movie-1342236", "movie-1337148", "movie-124618"].forEach(function (id) {
  ok(Mp.appearancesForKp(id, now).some(function (a) { return a.slug === "africa-together-2026"; }), id + " is linked to africa festival");
});

var liveApps = Mp.appearancesForKp("11979853", now);
ok(liveApps.some(function (a) { return a.status === "live" && a.slug === "siberia-meetings-2026"; }), "live badge kp");

console.log("festivals-mock.test.js ok");
