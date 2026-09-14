/**
 * Paginated horizontal home rails (site cabinet).
 */
(function (global) {
  "use strict";

  var PAGE = 12;
  var PAGE_MORE = 24;
  var FIRST_PAGE_BY_RAIL = {};
  var RAIL_PREFETCH_ITEMS_AHEAD = 4;
  var RAIL_PREFETCH_COOLDOWN_MS = 700;
  var RAIL_IMAGE_EAGER_COUNT = 6;
  var RAIL_IMAGE_WARM_MARGIN_PX = 280;
  var RAIL_CACHE_VERSION = 13;
  var RAIL_CACHE_TTL_MS = 10 * 60 * 1000;
  var RAIL_CACHE_TTL_PREMIERES_MS = 60 * 60 * 1000;
  var RAIL_CACHE_TTL_PREMIERES_STALE_MS = 7 * 24 * 60 * 60 * 1000;
  // Always revalidate — stale session cache may still hold blocked image.tmdb.org URLs.
  var ALWAYS_REFRESH_RAILS = { "series-mix": true, premieres: true };

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeRailPoster(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    var m = u.match(/^https?:\/\/image\.tmdb\.org\/t\/p\/([^/]+)\/([^/?#]+)/i);
    if (m) return "/api/public/poster/tmdb/" + m[1] + "/" + m[2];
    m = u.match(/^https?:\/\/avatars\.mds\.yandex\.net\/(get-kinopoisk-image\/[^?#]+)/i);
    if (m) return "/api/public/poster/kp/mds/" + m[1];
    m = u.match(/^https?:\/\/st\.kp\.yandex\.net\/(images\/(?:film_iphone|film_big|actor_iphone|actor_big|film_poster)\/[^?#]+)/i);
    if (m) return "/api/public/poster/kp/st/" + m[1];
    return u;
  }

  function normalizeRailItem(it) {
    if (!it || typeof it !== "object") return it;
    var poster = normalizeRailPoster(it.poster || it.poster_url || "");
    if (!poster || poster === it.poster) return it;
    var out = {};
    for (var k in it) {
      if (Object.prototype.hasOwnProperty.call(it, k)) out[k] = it[k];
    }
    out.poster = poster;
    return out;
  }

  function fetchHomeRail(apiGet, railId, offset, limit, period) {
    var q = "offset=" + offset + "&limit=" + limit;
    if (railId === "premieres" && period) q += "&period=" + encodeURIComponent(period);
    return apiGet("/api/home/rails/" + railId + "?" + q);
  }

  function pageSizeForOffset(railId, offset) {
    if (offset === 0 && FIRST_PAGE_BY_RAIL[railId]) return FIRST_PAGE_BY_RAIL[railId];
    return offset > 0 ? PAGE_MORE : PAGE;
  }

  function railScopeKey() {
    try {
      if (global.__mpRailScope) return String(global.__mpRailScope);
    } catch (_e) {}
    try {
      var cid = global.localStorage && global.localStorage.getItem("mp_site_active_chat_id");
      if (cid) return "c:" + String(cid);
    } catch (_e2) {}
    return "anon";
  }

  function setRailScope(scope) {
    try {
      global.__mpRailScope = scope != null ? String(scope) : "anon";
    } catch (_e) {}
  }

  function railCacheKey(railId, period) {
    return (
      "mp_home_rail_v" +
      RAIL_CACHE_VERSION +
      "_" +
      railScopeKey() +
      "_" +
      railId +
      "_" +
      (period || "-")
    );
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

  function clearRailCache(railId, period) {
    try {
      railCacheStorage(railId).removeItem(railCacheKey(railId, period));
    } catch (_e) {}
    if (period == null) {
      try {
        railCacheStorage(railId).removeItem(railCacheKey(railId, "-"));
      } catch (_e2) {}
    }
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
    try { bindHomePosterTrailerPreview(container); } catch (_tr) {}
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
    if (m.is_series) attrs += ' data-is-series="1"';
    return attrs;
  }

  var PLACEHOLDER = "/images/film-poster-placeholder.png";

  function posterTileHtml(m, opts, tileIndex) {
    opts = opts || {};
    var posterFn = opts.posterUrl || function () { return ""; };
    var poster = normalizeRailPoster(m.poster || "") || posterFn(m.kp_id, "small");
    var idx = tileIndex == null ? 999 : tileIndex;
    var eager = idx < RAIL_IMAGE_EAGER_COUNT;
    var img = '<img src="' + esc(poster || PLACEHOLDER) + '" alt=""' +
      (eager ? ' loading="eager"' + (idx < 4 ? ' fetchpriority="high"' : "") : ' loading="lazy" data-rail-warm="1"') +
      ' decoding="async" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">';
    var rating = m.rating != null
      ? '<span class="home-rated-badge">★ ' + esc(String(m.rating)) + "</span>"
      : "";
    var ratedCls = opts.rated ? " home-poster-tile--rated" : "";
    var kpNav = m.kp_id != null ? String(m.kp_id).replace(/\D/g, "") : "";
    var hrefAttr = kpNav ? (' href="/f/' + encodeURIComponent(kpNav) + '"') : "";
    var sensCls = (global.MpAdultMedia && global.MpAdultMedia.posterClass(m)) || "";
    return (
      '<div class="home-poster-tile-wrap">' +
      '<a class="home-poster-tile' + ratedCls + '"' + hrefAttr + ' role="listitem"' + siteFilmAttrs(m) + ">" +
      '<div class="home-poster-tile-img' + sensCls + '">' + img + rating + "</div>" +
      '<div class="home-poster-tile-title">' + esc(m.title || "") + "</div>" +
      '<div class="home-poster-tile-year">' + (m.year ? esc(String(m.year)) : "—") + "</div>" +
      "</a></div>"
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

  function premiereNotifyBellHtml(p, hideNotify) {
    if (hideNotify) return "";
    var reminded = !!(p.reminder_set || p.notify_enabled);
    var pdate = p.premiere_date || p.release_date || "";
    var action = reminded ? "premiere-notify-off" : "premiere-notify-on";
    var label = reminded ? "Отслеживается" : "Отслеживать премьеру";
    var cls =
      "premiere-bell-btn premiere-poster-bell premiere-poster-bell--overlay" +
      (reminded ? " active" : "");
    var icon = reminded
      ? '<i class="ph ph-bell-slash" aria-hidden="true"></i>'
      : '<i class="ph ph-bell" aria-hidden="true"></i>';
    return (
      '<span role="button" tabindex="0" class="' + cls + '" data-action="' + action +
      '" data-kp="' + esc(String(p.kp_id || "")) + '" data-date="' + esc(String(pdate)) +
      '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + icon + "</span>"
    );
  }

  function resolveRailTitleLogoUrl(url) {
    var u = String(url || "").trim();
    if (!u || u === "null" || u === "undefined") return "";
    if (global.MpFilmPage && typeof global.MpFilmPage.resolveTitleLogoUrl === "function") {
      return global.MpFilmPage.resolveTitleLogoUrl(u);
    }
    var tmdb = u.match(/^https?:\/\/image\.tmdb\.org\/t\/p\/([^/]+)\/([^/?#]+)/i);
    if (tmdb) u = "/api/public/poster/tmdb/" + tmdb[1] + "/" + tmdb[2];
    u = u.replace(/(\/api\/public\/poster\/tmdb\/)original(\/)/gi, "$1w500$2");
    u = u.replace(/(\/t\/p\/)original(\/)/gi, "$1w500$2");
    if (/^https?:\/\//i.test(u) || u.indexOf("data:") === 0) return u;
    var base = "";
    try {
      base = (global.MpApiConfig && global.MpApiConfig.API_ORIGIN) || (global.location && global.location.origin) || "";
    } catch (_e) {}
    base = String(base || "").replace(/\/$/, "");
    if (!base) return u;
    if (u.charAt(0) === "/") return base + u;
    return base + "/" + u.replace(/^\.\//, "");
  }

  function pickRailTitleLogo(p) {
    if (!p) return "";
    return resolveRailTitleLogoUrl(p.title_logo || p.logo_url || "");
  }

  function railTitleWithLogoHtml(title, logoUrl) {
    var t = title || "—";
    var src = resolveRailTitleLogoUrl(logoUrl);
    if (!src) return esc(t);
    return (
      '<img class="film-title-logo home-pre-card-title-logo" src="' + esc(src) + '" alt="' + esc(t) +
      '" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="max-height:28px;max-width:100%;width:auto;height:auto;object-fit:contain;display:block" onerror="this.removeAttribute(\'src\');this.classList.add(\'is-broken\');var n=this.nextElementSibling;if(n){n.classList.remove(\'visually-hidden\');}">' +
      '<span class="home-pre-card-title-text visually-hidden film-title-text">' + esc(t) + "</span>"
    );
  }

  function premiereCardHtml(p, opts, tileIndex) {
    opts = opts || {};
    var hideNotify = opts.hideNotify;
    var posterFn = opts.posterUrl || function () { return ""; };
    var poster = normalizeRailPoster(p.poster || "") || posterFn(p.kp_id, "small");
    var idx = tileIndex == null ? 999 : tileIndex;
    var eager = idx < RAIL_IMAGE_EAGER_COUNT;
    var img = '<img class="home-pre-card-poster-img" src="' + esc(poster || PLACEHOLDER) + '" alt=""' +
      (eager ? ' loading="eager"' + (idx < 4 ? ' fetchpriority="high"' : "") : ' loading="lazy" data-rail-warm="1"') +
      ' decoding="async" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">';
    var pdate = p.premiere_date || p.release_date || "";
    var datePill = premiereDateDdMm(pdate);
    var notifyBtn = premiereNotifyBellHtml(p, hideNotify);
    var datePillHtml = datePill
      ? '<span class="premiere-poster-date-pill">' + esc(datePill) + "</span>"
      : "";
    var attrs = siteFilmAttrs(p);
    var sensCls = (global.MpAdultMedia && global.MpAdultMedia.posterClass(p)) || "";
    // Keep data-title-logo for hover/trailer consumers; never render logos on rail cards.
    var titleLogo = pickRailTitleLogo(p);
    if (titleLogo) attrs += ' data-title-logo="' + esc(titleLogo) + '"';
    var titleHtml = '<span class="home-pre-card-title-text">' + esc(p.title || "—") + "</span>";
    return (
      '<div class="home-pre-card" role="listitem" tabindex="0"' + attrs + ">" +
      '<div class="home-pre-card-poster premiere-poster-media' + sensCls + '">' +
      img + datePillHtml +
      (notifyBtn ? '<span data-stop-card-click="1">' + notifyBtn + "</span>" : "") +
      "</div>" +
      '<div class="home-pre-card-body">' +
      '<div class="home-pre-card-title">' + titleHtml + "</div>" +
      "</div></div>"
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
      try { warmRailTitleLogos(container, batch || []); } catch (_e) {}
      if (typeof config.onBatch === "function") config.onBatch(container, batch || []);
    }

    function warmRailTitleLogos(root, batch) {
      if (!root || railId !== "premieres") return;
      var items = batch || [];
      // Cache logo URL on the card for hover/trailer consumers; never swap rail title text for wordmarks.
      items.forEach(function (p) {
        if (pickRailTitleLogo(p)) {
          var kp0 = p && p.kp_id != null ? String(p.kp_id).replace(/\D/g, "") : "";
          if (kp0) {
            var c0 = root.querySelector('.home-pre-card[data-kp-id="' + kp0 + '"]');
            if (c0 && !c0.getAttribute("data-title-logo")) {
              c0.setAttribute("data-title-logo", pickRailTitleLogo(p));
            }
          }
          return;
        }
        var kp = p && p.kp_id != null ? String(p.kp_id).replace(/\D/g, "") : "";
        if (!kp) return;
        var fetchFn = global.MpFilmPage && global.MpFilmPage.fetchFilmTitleLogoByKp;
        var pms = fetchFn
          ? fetchFn(kp)
          : fetch(((global.MpApiConfig && global.MpApiConfig.API_ORIGIN) || "") + "/api/public/film/" + encodeURIComponent(kp) + "/title-logo", {
              method: "GET", mode: "cors", credentials: "omit",
            }).then(function (r) { return r.ok ? r.json() : null; });
        Promise.resolve(pms).then(function (payload) {
          var url = payload
            ? resolveRailTitleLogoUrl(payload.title_logo || payload.logo_url || payload.url || "")
            : "";
          if (!url) return;
          p.title_logo = url;
          p.logo_url = url;
          var card = root.querySelector('.home-pre-card[data-kp-id="' + kp + '"]');
          if (!card || card.getAttribute("data-title-logo")) return;
          card.setAttribute("data-title-logo", url);
        }).catch(function () {});
      });
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

    function renderPrepend(batch) {
      if (!batch || !batch.length) return;
      var first = container.querySelector(".home-poster-tile-wrap, .home-poster-tile, .home-pre-card");
      var html = "";
      if (railId === "premieres") {
        html = batch.map(function (p, i) { return premiereCardHtml(p, config, i); }).join("");
      } else {
        html = batch.map(function (m, i) {
          return posterTileHtml(m, {
            rated: railId === "recent-rated",
            posterUrl: config.posterUrl,
          }, i);
        }).join("");
      }
      if (first) {
        first.insertAdjacentHTML("beforebegin", html);
      } else {
        sentinel.insertAdjacentHTML("beforebegin", html);
      }
      afterAppend(batch);
    }

    function prependItems(rawBatch) {
      var batch = (rawBatch || []).map(normalizeRailItem).filter(function (it) {
        return it && (it.kp_id != null || it.title);
      });
      if (!batch.length) return 0;
      var seen = {};
      batch.forEach(function (it) {
        var k = String(it.kp_id != null ? it.kp_id : "");
        if (k) seen[k] = true;
      });
      items = items.filter(function (it) {
        var k = String(it.kp_id != null ? it.kp_id : "");
        return !(k && seen[k]);
      });
      // Drop DOM tiles that match kp_id (avoid duplicates after optimistic insert).
      Object.keys(seen).forEach(function (kp) {
        if (!kp) return;
        container.querySelectorAll('[data-kp-id="' + kp + '"]').forEach(function (el) {
          var wrap = el.closest(".home-poster-tile-wrap") || el;
          try { wrap.remove(); } catch (_e) {}
        });
      });
      items = batch.concat(items);
      offset = Math.max(offset, items.length);
      renderPrepend(batch);
      writeRailCache(railId, period, items, offset, hasMore);
      if (typeof config.onMeta === "function") {
        config.onMeta({ total: items.length, loaded: items.length, hasMore: hasMore });
      }
      return batch.length;
    }

    container.__mpHomeRail = {
      railId: railId,
      prependItems: prependItems,
      softRefresh: function () { return loadMore(true); },
    };

    function applyCache(bag) {
      if (!bag || !bag.items || !bag.items.length) return false;
      items = bag.items.map(normalizeRailItem);
      offset = bag.offset || items.length;
      hasMore = bag.hasMore !== false;
      renderAppend(items, 0);
      return true;
    }

    var failRetries = 0;

    function loadMore(isRefresh) {
      if (loading) return Promise.resolve();
      if (!isRefresh && !hasMore) return Promise.resolve();
      if (isRefresh && container.scrollLeft > scrollLeftAtMount + 8) return Promise.resolve();
      loading = true;
      var fetchOffset = isRefresh ? 0 : offset;
      var fetchLimit = isRefresh ? PAGE : pageSizeForOffset(railId, fetchOffset);
      return fetchHomeRail(config.apiGet, railId, fetchOffset, fetchLimit, period)
        .then(function (page) {
          if (!page || page.success === false) {
            var bad = new Error("rail_page_failed");
            bad.code = "RAIL_FAILED";
            throw bad;
          }
          var batch = ((page && page.items) || []).map(normalizeRailItem);
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
          if (failRetries < 2) {
            failRetries += 1;
            loading = false;
            return loadMore(isRefresh);
          }
          if (!items.length) {
            hasMore = false;
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
      if ((cached && cached.stale) || ALWAYS_REFRESH_RAILS[railId]) void loadMore(true);
    } else {
      void loadMore(false);
    }
  }

  /** Partner poll delta: insert cards into mounted rails without full remount/GET. */
  function applyLibraryDelta(delta) {
    var list = Array.isArray(delta) ? delta : [];
    if (!list.length) return 0;
    var byKp = {};
    list.forEach(function (raw) {
      if (!raw || typeof raw !== "object") return;
      var kp = raw.kp_id != null ? String(raw.kp_id).replace(/\D/g, "") : "";
      if (!kp) return;
      byKp[kp] = normalizeRailItem({
        kp_id: Number(kp) || kp,
        title: raw.title || ("KP " + kp),
        year: raw.year,
        poster: raw.poster || raw.poster_thumb || "",
        is_series: !!raw.is_series,
        id: raw.film_id || raw.id,
        film_id: raw.film_id || raw.id,
      });
    });
    var items = Object.keys(byKp).map(function (k) { return byKp[k]; });
    if (!items.length) return 0;
    // Newest first (higher rev last in server bag → reverse).
    items.reverse();
    var applied = 0;
    var roots = document.querySelectorAll(
      '[data-home-rail="unwatched"], [data-home-rail="series-mix"], [data-home-rail="series"]'
    );
    roots.forEach(function (el) {
      var ctl = el.__mpHomeRail;
      if (!ctl || typeof ctl.prependItems !== "function") return;
      var railId = ctl.railId || el.getAttribute("data-home-rail") || "";
      var batch = items;
      if (railId === "series" || railId === "series-mix") {
        batch = items.filter(function (it) { return !!it.is_series; });
      }
      if (!batch.length) return;
      applied += ctl.prependItems(batch) || 0;
    });
    return applied;
  }


  var _railTrailerCache = {};
  function bindHomePosterTrailerPreview(container) {
    if (!container || container.getAttribute("data-trailer-preview-bound") === "1") return;
    container.setAttribute("data-trailer-preview-bound", "1");
    container.addEventListener("mouseenter", function (e) {
      var wrap = e.target && e.target.closest ? e.target.closest(".home-poster-tile-wrap") : null;
      if (!wrap || wrap.getAttribute("data-trailer-checked") === "1") return;
      var tile = wrap.querySelector(".home-poster-tile[data-kp-id]");
      var kp = tile ? String(tile.getAttribute("data-kp-id") || "").replace(/\D/g, "") : "";
      if (!kp) return;
      wrap.setAttribute("data-trailer-checked", "1");
      var fetchFn = (global.MpFilmPage && global.MpFilmPage.fetchFilmTrailerByKp)
        ? global.MpFilmPage.fetchFilmTrailerByKp
        : null;
      function apply(d) {
        if (!d || !d.youtube_id) return;
        wrap.classList.add("has-trailer-preview");
        if (wrap.querySelector(".home-poster-trailer-play")) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "home-poster-trailer-play";
        btn.setAttribute("aria-label", "Трейлер");
        btn.title = "Трейлер";
        btn.textContent = "▶";
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          try {
            window.location.href = "/f/" + encodeURIComponent(kp) + "#trailer";
          } catch (_e) {
            window.location.href = "/f/" + encodeURIComponent(kp);
          }
        });
        wrap.appendChild(btn);
      }
      if (_railTrailerCache[kp]) {
        apply(_railTrailerCache[kp]);
        return;
      }
      if (fetchFn) {
        fetchFn(kp).then(function (d) {
          if (d) _railTrailerCache[kp] = d;
          apply(d);
        });
        return;
      }
      var apiBase = (global.MpFilmPage && global.MpFilmPage.API_BASE) || (global.MP_API_BASE) || "";
      if (!apiBase && global.MpApiConfig && global.MpApiConfig.apiBase) apiBase = global.MpApiConfig.apiBase;
      if (!apiBase) return;
      fetch(String(apiBase).replace(/\/$/, "") + "/api/public/film/" + encodeURIComponent(kp) + "/trailer", {
        method: "GET", mode: "cors", credentials: "omit",
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (d && d.success) _railTrailerCache[kp] = d;
          apply(d && d.success ? d : null);
        })
        .catch(function () {});
    }, true);
  }

  global.MPHomeRails = {
    PAGE: PAGE,
    fetchHomeRail: fetchHomeRail,
    mountPaginatedHomeRail: mountPaginatedHomeRail,
    clearRailCache: clearRailCache,
    setRailScope: setRailScope,
    applyLibraryDelta: applyLibraryDelta,
    posterTileHtml: posterTileHtml,
    premiereCardHtml: premiereCardHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
