/** Static regression guard for TMDB festival badges on /f/movie-<id>. */
var fs = require("fs");
var path = require("path");

var film = fs.readFileSync(path.join(__dirname, "film-page.js"), "utf8");
var html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

function ok(condition, message) {
  if (!condition) {
    console.error("FAIL", message);
    process.exit(1);
  }
}

ok(
  film.indexOf("mock.appearancesForKp(pathKey || kpId)") >= 0,
  "festival lookup keeps the movie-/tv- catalog prefix"
);
ok(
  film.indexOf("film-fest-overlay") >= 0 && film.indexOf(".poster-wrap") >= 0,
  "festival badge is immediately visible over the film poster"
);
ok(
  film.indexOf("(attempt || 0) < 240") >= 0,
  "festival data load has a defensive retry window"
);

var filmRoute = html.slice(html.indexOf("if (isFilm || isStaff)"), html.indexOf("} else if (!isBuzz", html.indexOf("if (isFilm || isStaff)")));
ok(
  filmRoute.indexOf("festivals-mock.js") >= 0 && filmRoute.indexOf("festivals-mock.js") < filmRoute.indexOf("film-page.js"),
  "festival data loads before film page code"
);

console.log("film-festival-badge.test.js ok");
