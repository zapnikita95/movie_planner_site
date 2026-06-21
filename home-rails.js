/**
 * Paginated horizontal home rails (site cabinet).
 */
(function (global) {
  "use strict";

  var PAGE = 40;
  var RAIL_PREFETCH_ITEMS_AHEAD = 24;
  var RAIL_PREFETCH_COOLDOWN_MS = 500;
  var RAIL_IMAGE_EAGER_COUNT = 20;
  var RAIL_IMAGE_WARM_MARGIN_PX = 520;
  var RAIL_CACHE_VERSION = 5;
  var RAIL_CACHE_TTL_MS = 10 * 60 * 1000;
  var RAIL_CACHE_TTL_PREMIERES_MS = 60 * 60 * 1000;
  var RAIL_CACHE_TTL_PREMIERES_STALE_MS = 7 * 24 * 60 * 60 * 1000;

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fetchHomeRail(apiGet, railId, offset, limit, period) {
    var q = "offset=" + offset + "&limit=" + limit;
    if (railId === "premieres" && period) q += "&period=" + encodeURIComponent(period);
    return apiGet("/api/home/rails/" + railId + "?" + q);
  }

  function railCacheKey(railId, period) {
    return "mp_home_rail_v" + RAIL_CACHE_VERSION + "_" + railId + "_" + (period || "-");
  }

  function railCacheStorage(railId) {
    if (railId === "premieres" && typeof localStorage !== "undefined") return localStorage;
    return sessionStorage;
  }

  function readRailCache(railId, period) {
    try {
      var storage = railCacheStorage(railId);
      var raw = storage.getItem(railCacheKey(railId, period));
      if (!raw) return null;
      var bag = JSON.parse(raw);
      if (!bag || !bag.items || !bag.items.length) return null;
      var age = Date.now() - bag.ts;
      var staleMax = railId === "premieres" ? RAIL_CACHE_TTL_PREMIERES_STALE_MS : RAIL_CACHE_TTL_MS * 6;
      if (age > staleMax) return null;
      var ttl = railId === "premieres" ? RAIL_CACHE_TTL_PREMIERES_MS : RAIL_CACHE_TTL_MS;
      bag.stale = age > ttl;
      return bag;
    } catch (_e) {
      return null;
    }
  }

  function writeRailCache(railId, period, items, offset, hasMore) {
    try {
      railCacheStorage(railId).setItem(
        railCacheKey(railId, period),
        JSON.stringify({ ts: Date.now(), items: items, offset: offset, hasMore: !!hasMore }),
      );
    } catch (_e) {}
  }

  function attachHorizontalRailPrefetch(container, onLoad, opts) {
    if (!container || typeof onLoad !== "function") return;
    opts = opts || {};
    var itemsAheadThreshold = opts.itemsAhead != null ? opts.itemsAhead : RAIL_PREFETCH_ITEMS_AHEAD;
    var cooldown = opts.cooldown != null ? opts.cooldown : RAIL_PREFETCH_COOLDOWN_MS;
    var lastLoadTs = 0;
    var busy = false;
    var rafPending = false;

    function tileStep() {
      var tile = container.querySelector(".home-poster-tile-wrap, .home-poster-tile, .home-pre-card");
      if (!tile) return 144;
      var style = window.getComputedStyle(container);
      var gap = parseFloat(style.columnGap || style.gap) || 12;
      return tile.getBoundingClientRect().width + gap;
    }

    function remainingTiles() {
      var step = tileStep();
      if (step <= 0) return 999;
      var remaining = container.scrollWidth - container.clientWidth - container.scrollLeft;
      return remaining / step;
    }

    function tryLoad() {
      if (busy) return;
      if (remainingTiles() > itemsAheadThreshold) return;
      if (Date.now() - lastLoadTs < cooldown) return;
      lastLoadTs = Date.now();
      busy = true;
      Promise.resolve(onLoad())
        .catch(function () {})
        .finally(function () {
          busy = false;
        });
    }

    container.addEventListener("scroll", function () {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(function () {
        rafPending = false;
        tryLoad();
      });
    }, { passive: true });
  }

  function warmRailImages(container) {
    if (!container) return;
    var imgs = container.querySelectorAll("img[data-rail-warm='1']");
    if (!imgs.length) return;
    var railRect = container.getBoundingClientRect();
    var warmRight = railRect.right + RAIL_IMAGE_WARM_MARGIN_PX;
    imgs.forEach(function (img) {
      var r = img.getBoundingClientRect();
      if (r.left < warmRight) {
        img.loading = "eager";
        img.removeAttribute("data-rail-warm");
      }
    });
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var img = en.target;
          img.loading = "eager";
          img.removeAttribute("data-rail-warm");
          io.unobserve(img);
        });
      },
      { root: container, rootMargin: "0px " + RAIL_IMAGE_WARM_MARGIN_PX + "px 0px 0px", threshold: 0 },
    );
    container.querySelectorAll("img[data-rail-warm='1']").forEach(function (img) {
      io.observe(img);
    });
  }

  function siteFilmAttrs(m) {
    var kp = m.kp_id != null ? String(m.kp_id).replace(/\D/g, "") : "";
    var fid = m.film_id || m.id;
    var attrs = "";
    if (kp) attrs += ' data-kp-id="' + esc(kp) + '"';
    if (fid != null && String(fid).trim() !== "") attrs += ' data-film-id="' + esc(String(fid)) + '"';
    if (m.title) attrs += ' data-title="' + esc(String(m.title)) + '"';
    if (m.year) attrs += ' data-year="' + esc(String(m.year)) + '"';
    if (m.poster) attrs += ' data-poster="' + esc(String(m.poster)) + '"';
    return attrs;
  }

  var PLACEHOLDER = "/images/film-poster-placeholder.png";

  function posterTileHtml(m, opts, tileIndex) {
    opts = opts || {};
    var posterFn = opts.posterUrl || function () { return ""; };
    var poster = m.poster || posterFn(m.kp_id, "small");
    var idx = tileIndex == null ? 999 : tileIndex;
    var eager = idx < RAIL_IMAGE_EAGER_COUNT;
    var img = '<img src="' + esc(poster || PLACEHOLDER) + '" alt=""' +
      (eager ? ' loading="eager"' + (idx < 4 ? ' fetchpriority="high"' : "") : ' loading="lazy" data-rail-warm="1"') +
      ' decoding="async" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">';
    var rating = m.rating != null
      ? '<span class="home-rated-badge">★ ' + esc(String(m.rating)) + "</span>"
      : "";
    var ratedCls = opts.rated ? " home-poster-tile--rated" : "";
    return (
      '<div class="home-poster-tile-wrap">' +
      '<button class="home-poster-tile' + ratedCls + '" type="button" role="listitem"' + siteFilmAttrs(m) + ">" +
      '<div class="home-poster-tile-img">' + img + rating + "</div>" +
      '<div class="home-poster-tile-title">' + esc(m.title || "") + "</div>" +
      '<div class="home-poster-tile-year">' + (m.year ? esc(String(m.year)) : "—") + "</div>" +
      "</button></div>"
    );
  }

  function premiereDateDdMm(dateStr) {
    if (dateStr == null || dateStr === "") return "";
    var s = String(dateStr);
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[3] + "." + iso[2];
    var dmy = s.match(/^(\d{1,2})\.(\d{1,2})\./);
    if (dmy) {
      var dd = dmy[1].length < 2 ? "0" + dmy[1] : dmy[1];
      var mm = dmy[2].length < 2 ? "0" + dmy[2] : dmy[2];
      return dd + "." + mm;
    }
    return "";
  }

  function premiereCardHtml(p, opts, tileIndex) {
    opts = opts || {};
    var hideNotify = opts.hideNotify;
    var posterFn = opts.posterUrl || function () { return ""; };
    var poster = p.poster || posterFn(p.kp_id, "small");
    var idx = tileIndex == null ? 999 : tileIndex;
    var eager = idx < RAIL_IMAGE_EAGER_COUNT;
    var img = '<img class="home-pre-card-poster-img" src="' + esc(poster || PLACEHOLDER) + '" alt=""' +
      (eager ? ' loading="eager"' + (idx < 4 ? ' fetchpriority="high"' : "") : ' loading="lazy" data-rail-warm="1"') +
      ' decoding="async" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">';
    var pdate = p.premiere_date || p.release_date || "";
    var datePill = premiereDateDdMm(pdate);
    var reminded = !!(p.reminder_set || p.notify_enabled);
    var notifyBtn = hideNotify
      ? ""
      : '<span class="search-poster-qbtn search-poster-qbtn--premiere ' +
        (reminded ? "search-poster-qbtn--premiere-off" : "search-poster-qbtn--premiere-on") +
        '" data-notify-kp="' + esc(String(p.kp_id)) + '" data-premiere-date="' + esc(pdate) +
        '" data-state="' + (reminded ? "on" : "off") + '" role="button" tabindex="0" aria-label="' +
        (reminded ? "Отписаться от премьеры" : "Напомнить о премьере") + '">' +
        (reminded ? '<i class="ph ph-bell-slash" aria-hidden="true"></i>' : '<i class="ph ph-bell" aria-hidden="true"></i>') + "</span>";
    var datePillHtml = datePill
      ? '<span class="premiere-poster-date-pill">' + esc(datePill) + "</span>"
      : "";
    var meta = pdate ? esc(String(pdate)) : (p.year ? esc(String(p.year)) : "");
    var attrs = siteFilmAttrs(p);
    return (
      '<button class="home-pre-card" type="button" role="listitem"' + attrs + ">" +
      '<div class="home-pre-card-poster">' +
      img + datePillHtml + notifyBtn +
      "</div>" +
      '<div class="home-pre-card-body">' +
      '<div class="home-pre-card-title">' + esc(p.title || "—") + "</div>" +
      '<div class="home-pre-card-meta">' + (meta ? esc(String(meta)) : "") + "</div>" +
      "</div></button>"
    );
  }

  function mountPaginatedHomeRail(container, config) {
    if (!container || !config || !config.apiGet) return;
    var railId = config.railId;
    var period = config.period || "upcoming";
    var items = [];
    var offset = 0;
    var hasMore = true;
    var loading = false;
    var scrollLeftAtMount = 0;
    var sentinel = document.createElement("div");
    sentinel.className = "home-rail-sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText = "flex:0 0 8px;width:8px;min-height:1px;";

    function afterAppend(batch) {
      warmRailImages(container);
      if (typeof config.onBatch === "function") config.onBatch(container, batch || []);
    }

    function renderAppend(batch, startIndex) {
      var html = "";
      var base = startIndex == null ? items.length - batch.length : startIndex;
      if (railId === "premieres") {
        html = batch.map(function (p, i) { return premiereCardHtml(p, config, base + i); }).join("");
      } else {
        html = batch.map(function (m, i) {
          return posterTileHtml(m, {
            rated: railId === "recent-rated",
            posterUrl: config.posterUrl,
          }, base + i);
        }).join("");
      }
      sentinel.insertAdjacentHTML("beforebegin", html);
      afterAppend(batch);
    }

    function applyCache(bag) {
      if (!bag || !bag.items || !bag.items.length) return false;
      items = bag.items.slice();
      offset = bag.offset || items.length;
      hasMore = bag.hasMore !== false;
      renderAppend(items, 0);
      return true;
    }

    function loadMore(isRefresh) {
      if (loading) return Promise.resolve();
      if (!isRefresh && !hasMore) return Promise.resolve();
      if (isRefresh && container.scrollLeft > scrollLeftAtMount + 8) return Promise.resolve();
      loading = true;
      var fetchOffset = isRefresh ? 0 : offset;
      return fetchHomeRail(config.apiGet, railId, fetchOffset, PAGE, period)
        .then(function (page) {
          var batch = (page && page.items) || [];
          if (isRefresh) {
            if (!batch.length && !items.length && config.emptyHtml) {
              container.outerHTML = config.emptyHtml;
              return;
            }
            if (batch.length && container.scrollLeft <= scrollLeftAtMount + 8) {
              var savedScroll = container.scrollLeft;
              container.querySelectorAll(".home-poster-tile-wrap, .home-poster-tile, .home-pre-card").forEach(function (el) {
                el.remove();
              });
              items = batch.slice();
              offset = batch.length;
              hasMore = !!(page && page.has_more);
              renderAppend(batch, 0);
              container.scrollLeft = savedScroll;
            }
          } else {
            offset += batch.length;
            hasMore = !!(page && page.has_more);
            items = items.concat(batch);
            if (batch.length) renderAppend(batch, offset - batch.length);
            if (!items.length && config.emptyHtml) {
              container.outerHTML = config.emptyHtml;
            }
          }
          if (items.length) writeRailCache(railId, period, items, offset, hasMore);
          if (typeof config.onMeta === "function") {
            config.onMeta({ total: page && page.total, loaded: items.length, hasMore: hasMore });
          }
        })
        .catch(function () {
          if (!items.length) {
            hasMore = false;
            if (config.emptyHtml) container.outerHTML = config.emptyHtml;
            if (typeof config.onMeta === "function") {
              config.onMeta({ total: 0, loaded: 0, hasMore: false, failed: true });
            }
          }
        })
        .finally(function () {
          loading = false;
        });
    }

    container.appendChild(sentinel);
    attachHorizontalRailPrefetch(container, function () {
      if (loading || !hasMore) return Promise.resolve();
      return loadMore(false);
    });

    var cached = readRailCache(railId, period);
    if (applyCache(cached)) {
      if (cached && cached.stale) void loadMore(true);
      else if (hasMore) void loadMore(false);
    } else {
      void loadMore(false);
    }
  }

  global.MPHomeRails = {
    PAGE: PAGE,
    fetchHomeRail: fetchHomeRail,
    mountPaginatedHomeRail: mountPaginatedHomeRail,
    posterTileHtml: posterTileHtml,
    premiereCardHtml: premiereCardHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
