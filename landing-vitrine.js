/**
 * Landing vitrine: premieres + upcoming series carousels on marketing /.
 * Loads after cabinet-app.js (uses window.posterUrl / renderPremiereNotifyButton).
 */
(function (global) {
  "use strict";

  var MP_POSTER_PLACEHOLDER = "/images/film-poster-placeholder.png";
  var premCacheKey = "mp_landing_premieres_v4";
  var seriesCacheKey = "mp_landing_series_v6";
  var VITRINE_SERIES_KP_BLOCKLIST = { 5407222: true };
  var CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  var SERIES_LIMIT = 50;

  function apiBase() {
    if (global.MpApiConfig && typeof global.MpApiConfig.apiOrigin === "function") {
      return global.MpApiConfig.apiOrigin();
    }
    try {
      var h = (global.location && global.location.hostname) || "";
      if (h === "movie-planner.ru" || h === "www.movie-planner.ru") {
        return "https://api.movie-planner.ru";
      }
      return global.location.protocol + "//" + global.location.host;
    } catch (_e) {
      return "https://api.movie-planner.ru";
    }
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readCache(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.items)) return null;
      if (data.ts && Date.now() - Number(data.ts) > CACHE_TTL_MS) return null;
      return data;
    } catch (_e) {
      return null;
    }
  }

  function writeCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), items: data.items || [] }));
    } catch (_e) {}
  }

  function fetchJson(url) {
    return fetch(url, { method: "GET", mode: "cors" })
      .then(function (r) { return r.json(); })
      .catch(function () { return null; });
  }

  function dedupeByKp(items) {
    var seen = {};
    var out = [];
    (items || []).forEach(function (m) {
      var kp = String((m && m.kp_id) || "").replace(/\D/g, "");
      if (!kp || seen[kp]) return;
      seen[kp] = true;
      out.push(m);
    });
    return out;
  }

  function posterForPremiere(it) {
    var raw = String((it && it.poster) || "").trim();
    if (raw && !/film-poster-placeholder/i.test(raw)) return raw;
    if (global.posterUrl && it && it.kp_id) return global.posterUrl(it.kp_id);
    var kp = String((it && it.kp_id) || "").replace(/\D/g, "");
    if (kp) return "https://st.kp.yandex.net/images/film_iphone/iphone360_" + kp + ".jpg";
    return MP_POSTER_PLACEHOLDER;
  }

  function posterForSeries(it) {
    var raw = String((it && it.poster) || "").trim();
    if (raw && /image\.tmdb\.org/i.test(raw)) return raw;
    if (raw && !/film-poster-placeholder/i.test(raw)) return raw;
    if (global.posterUrl && it && it.kp_id) return global.posterUrl(it.kp_id);
    return "";
  }

  function filterSeries(items, limit) {
    var lim = Math.max(1, Number(limit) || SERIES_LIMIT);
    var out = [];
    dedupeByKp(items).forEach(function (m) {
      var kp = String((m && m.kp_id) || "").replace(/\D/g, "");
      if (kp && VITRINE_SERIES_KP_BLOCKLIST[kp]) return;
      var src = posterForSeries(m);
      if (!src || /film-poster-placeholder/i.test(src)) return;
      out.push(Object.assign({}, m, { poster: src }));
    });
    return out.slice(0, lim);
  }

  function premiereCard(it) {
    var kp = String(it.kp_id || "").replace(/\D/g, "");
    if (!kp) return "";
    var poster = posterForPremiere(it);
    var href = "/f/" + encodeURIComponent(kp);
    var datePill = global.formatPremiereDateDdMm ? global.formatPremiereDateDdMm(it.premiere_date) : "";
    var bell = global.renderPremiereNotifyButton
      ? global.renderPremiereNotifyButton(it, "premiere-poster-bell")
      : "";
    return '<a class="landing-pre-card" href="' + href + '">'
      + '<div class="landing-pre-card-poster premiere-poster-media">'
      + '<img class="landing-pre-card-poster-img" src="' + esc(poster) + '" alt="" loading="lazy" decoding="async"'
      + ' onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">'
      + (datePill ? '<span class="premiere-poster-date-pill">' + esc(datePill) + "</span>" : "")
      + (bell ? '<span data-stop-card-click="1">' + bell + "</span>" : "")
      + "</div>"
      + '<div class="landing-pre-card-body">'
      + '<div class="landing-pre-card-title">' + esc(it.title || "—") + "</div>"
      + (it.year ? '<div class="landing-pre-card-meta">' + esc(String(it.year)) + "</div>" : "")
      + "</div></a>";
  }

  function seriesCard(it) {
    var kp = String(it.kp_id || "").replace(/\D/g, "");
    if (!kp) return "";
    var poster = posterForSeries(it);
    if (!poster) return "";
    var href = "/f/" + encodeURIComponent(kp);
    return '<a class="landing-pre-card landing-pre-card--series" href="' + href + '">'
      + '<div class="landing-pre-card-poster">'
      + '<img class="landing-pre-card-poster-img" src="' + esc(poster) + '" alt="" loading="lazy" decoding="async"'
      + ' onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">'
      + "</div>"
      + '<div class="landing-pre-card-body">'
      + '<div class="landing-pre-card-title">' + esc(it.title || "—") + "</div>"
      + (it.year ? '<div class="landing-pre-card-meta">' + esc(String(it.year)) + "</div>" : "")
      + "</div></a>";
  }

  function paintTrack(track, html) {
    if (!track || !html) return;
    track.innerHTML = html;
  }

  function loadPremieres() {
    var track = document.getElementById("landing-premieres-track");
    if (!track) return Promise.resolve();
    var cached = readCache(premCacheKey);
    if (cached && cached.items && cached.items.length) {
      paintTrack(track, dedupeByKp(cached.items).slice(0, 18).map(premiereCard).join(""));
    }
    return fetchJson(apiBase() + "/api/public/premieres?period=upcoming&limit=18")
      .then(function (data) {
        var items = dedupeByKp((data && data.success && data.items) ? data.items : []).slice(0, 18);
        if (!items.length && cached && cached.items) return;
        writeCache(premCacheKey, { items: items });
        paintTrack(track, items.map(premiereCard).join(""));
      });
  }

  function loadSeries() {
    var track = document.getElementById("landing-series-track");
    if (!track) return Promise.resolve();
    var cached = readCache(seriesCacheKey);
    if (cached && cached.items && cached.items.length) {
      var cachedFiltered = filterSeries(cached.items, SERIES_LIMIT);
      if (cachedFiltered.length) {
        paintTrack(track, cachedFiltered.map(seriesCard).filter(Boolean).join(""));
      }
    }
    return fetchJson(apiBase() + "/api/public/series/upcoming?limit=" + SERIES_LIMIT)
      .then(function (data) {
        var items = filterSeries(
          (data && data.success && data.items) ? data.items.slice() : [],
          SERIES_LIMIT
        );
        if (!items.length && cached && cached.items) return;
        writeCache(seriesCacheKey, { items: items });
        paintTrack(track, items.map(seriesCard).filter(Boolean).join(""));
      });
  }

  function init() {
    var landing = document.getElementById("landing");
    if (!landing) return;
    Promise.all([loadPremieres(), loadSeries()]).catch(function () {});
  }

  global.__mpLandingVitrineRefresh = function () {
    try {
      localStorage.removeItem(premCacheKey);
      localStorage.removeItem(seriesCacheKey);
    } catch (_e) {}
    return Promise.all([loadPremieres(), loadSeries()]).catch(function () {});
  };

  if (global.renderPremiereNotifyButton) {
    init();
  } else {
    global.addEventListener("load", init);
  }
})(window);
