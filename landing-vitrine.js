/**
 * Landing vitrine: premieres + upcoming series carousels on marketing /.
 */
(function (global) {
  "use strict";

  var MP_POSTER_PLACEHOLDER = "/images/film-poster-placeholder.png";
  var premCacheKey = "mp_landing_premieres_v2";
  var seriesCacheKey = "mp_landing_series_v3";

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
      return data;
    } catch (_e) {
      return null;
    }
  }

  function writeCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (_e) {}
  }

  function fetchJson(url) {
    return fetch(url, { method: "GET", mode: "cors" })
      .then(function (r) { return r.json(); })
      .catch(function () { return null; });
  }

  function isKpIphonePosterUrl(src, kpId) {
    var s = String(src || "").trim();
    var kp = String(kpId || "").replace(/\D/g, "");
    if (!s || !kp) return false;
    return s.indexOf("iphone360_" + kp) >= 0 || s.indexOf("/film_iphone/iphone360_") >= 0;
  }

  function isKpCdnPosterUrl(src) {
    var s = String(src || "").trim();
    if (!s) return false;
    return /kp\.yandex|kinopoisk|iphone360|get-kinopoisk-image|avatars\.mds\.yandex/i.test(s);
  }

  function vitrinePosterSrc(item) {
    var raw = String((item && item.poster) || "").trim();
    if (raw && /image\.tmdb\.org/i.test(raw)) return raw;
    if (raw && /film-poster-placeholder/i.test(raw)) return raw;
    if (raw && isKpCdnPosterUrl(raw)) return MP_POSTER_PLACEHOLDER;
    return MP_POSTER_PLACEHOLDER;
  }

  function filterVitrineSeries(items, limit) {
    var lim = Math.max(1, Number(limit) || 12);
    var withPoster = [];
    var fallback = [];
    (items || []).forEach(function (m) {
      var src = vitrinePosterSrc(m);
      var entry = Object.assign({}, m, { poster: src });
      if (src && src !== MP_POSTER_PLACEHOLDER) withPoster.push(entry);
      else fallback.push(entry);
    });
    var out = withPoster.slice(0, lim);
    if (out.length < lim) {
      out = out.concat(fallback.slice(0, lim - out.length));
    }
    return out;
  }

  function formatPremiereDate(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + "." + m[2];
    return s;
  }

  function bellHtml(it) {
    var kp = esc(String(it.kp_id || ""));
    var date = esc(String(it.premiere_date || ""));
    var active = !!it.reminder_set;
    var action = active ? "premiere-notify-off" : "premiere-notify-on";
    var label = active ? "Отслеживается" : "Отслеживать премьеру";
    var icon = active ? "🔕" : "🔔";
    return '<button type="button" class="premiere-bell-btn premiere-poster-bell premiere-poster-bell--overlay'
      + (active ? " active" : "")
      + '" data-action="' + action + '" data-kp="' + kp + '" data-date="' + date
      + '" title="' + label + '" aria-label="' + label + '" data-stop-card-click="1">' + icon + "</button>";
  }

  function premiereCard(it) {
    var kp = String(it.kp_id || "").replace(/\D/g, "");
    if (!kp) return "";
    var poster = vitrinePosterSrc(it);
    var href = "/f/" + encodeURIComponent(kp);
    var dateLabel = formatPremiereDate(it.premiere_date);
    return '<a class="landing-pre-card" href="' + href + '">'
      + '<div class="landing-pre-card-poster premiere-poster-media">'
      + '<img src="' + esc(poster) + '" alt="" loading="lazy" decoding="async"'
      + ' onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">'
      + (dateLabel ? '<span class="landing-pre-date">' + esc(dateLabel) + "</span>" : "")
      + '<span data-stop-card-click="1">' + bellHtml(it) + "</span>"
      + "</div>"
      + '<div class="landing-pre-card-body">'
      + '<div class="landing-pre-card-title">' + esc(it.title || "—") + "</div>"
      + (it.year ? '<div class="landing-pre-card-meta">' + esc(String(it.year)) + "</div>" : "")
      + "</div></a>";
  }

  function seriesCard(it) {
    var kp = String(it.kp_id || "").replace(/\D/g, "");
    if (!kp) return "";
    var poster = vitrinePosterSrc(it);
    var href = "/f/" + encodeURIComponent(kp);
    return '<a class="landing-pre-card landing-pre-card--series" href="' + href + '">'
      + '<div class="landing-pre-card-poster">'
      + '<img src="' + esc(poster) + '" alt="" loading="lazy" decoding="async"'
      + ' onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">'
      + "</div>"
      + '<div class="landing-pre-card-body">'
      + '<div class="landing-pre-card-title">' + esc(it.title || "—") + "</div>"
      + (it.year ? '<div class="landing-pre-card-meta">' + esc(String(it.year)) + "</div>" : "")
      + "</div></a>";
  }

  function paintTrack(track, html) {
    if (!track || !html) return;
    track.innerHTML = html + html;
  }

  function loadPremieres() {
    var track = document.getElementById("landing-premieres-track");
    if (!track) return Promise.resolve();
    var cached = readCache(premCacheKey);
    if (cached && cached.items && cached.items.length) {
      paintTrack(track, cached.items.map(premiereCard).join(""));
    }
    return fetchJson(apiBase() + "/api/public/premieres?period=upcoming&limit=18")
      .then(function (data) {
        var items = (data && data.success && data.items) ? data.items.slice(0, 18) : [];
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
      var cachedFiltered = filterVitrineSeries(cached.items, 16);
      if (cachedFiltered.length) {
        paintTrack(track, cachedFiltered.map(seriesCard).filter(Boolean).join(""));
      }
    }
    return fetchJson(apiBase() + "/api/public/series/upcoming?limit=24")
      .then(function (data) {
        var items = filterVitrineSeries(
          (data && data.success && data.items) ? data.items.slice() : [],
          16
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
    loadPremieres().catch(function () {});
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
