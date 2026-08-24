/**
 * Yandex RSY — movie-planner.ru
 * Tall vertical sidebar in side gutters; width scales down; hidden if no room.
 */
(function (global) {
  'use strict';

  var BUILD = '20260824rsyLayout5';
  var LAYOUT_ENABLED = true;
  var CONTEXT_SRC = 'https://yandex.ru/ads/system/context.js';
  var DESKTOP_MIN = 1280;
  var CONTENT_FILM_STAFF = 1180;
  var CONTENT_ARTICLE = 800;
  var GUTTER_GAP = 16;
  var RAIL_MIN_W = 160;
  var RAIL_IDEAL_W = 300;

  var BLOCKS = {
    filmSidebar: 'R-A-19798904-2',
    filmAfterSimilar: 'R-A-19798904-1',
    staffSidebar: 'R-A-19798904-3',
    staffAfterFilmography: 'R-A-19798904-4',
    articleSidebarRight: 'R-A-19798904-5',
    articleSidebarLeft: null,
    articleInline: 'R-A-19798904-5',
    /* Series hub /series|/series-hub — reuse film blocks (same page never coexists with /f/). */
    seriesSidebar: 'R-A-19798904-2',
    seriesInline: 'R-A-19798904-1',
  };

  var rendered = Object.create(null);
  var _observer = null;

  function allowsAds() {
    try {
      if (global.MpCookieConsent && typeof global.MpCookieConsent.allows === 'function') {
        return !!global.MpCookieConsent.allows('ads');
      }
    } catch (_e) {}
    return false;
  }

  function shouldSkip() {
    try {
      var q = String(global.location && global.location.search || '');
      if (/[?&]e2e=/.test(q)) return true;
      if (sessionStorage.getItem('mp_metrika_skip_e2e') === '1') return true;
    } catch (_e) {}
    var ua = String((global.navigator && global.navigator.userAgent) || '');
    if (/HeadlessChrome|Playwright|Puppeteer/i.test(ua)) return true;
    return false;
  }

  function viewportWidth() {
    return global.innerWidth || document.documentElement.clientWidth || 0;
  }

  function isDesktop() {
    return viewportWidth() >= DESKTOP_MIN;
  }

  function contentMaxForPath(path) {
    return /\/articles\//.test(path) ? CONTENT_ARTICLE : CONTENT_FILM_STAFF;
  }

  /** Ideal width by viewport; actual width may shrink to fit gutter. */
  function railIdealWidth(kind) {
    var vw = viewportWidth();
    if (vw >= 2000) return 360;
    if (vw >= 1760) return 336;
    return RAIL_IDEAL_W;
  }

  function railGeometry(side, kind) {
    var vw = viewportWidth();
    if (vw < DESKTOP_MIN) return null;
    var path = String(global.location && global.location.pathname || '');
    var contentMax = contentMaxForPath(path);
    var half = Math.min(contentMax / 2, vw / 2 - 12);
    var gutter = vw / 2 - half;
    var maxW = gutter - GUTTER_GAP;
    if (maxW < RAIL_MIN_W) return null;
    var w = Math.min(railIdealWidth(kind), maxW);
    if (side === 'left') {
      return { left: Math.max(8, vw / 2 - half - GUTTER_GAP - w), width: w };
    }
    return { left: vw / 2 + half + GUTTER_GAP, width: w };
  }

  function ensureStyles() {
    if (document.querySelector('link[data-mp-rsy-css="1"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/yandex-rsy.css?v=' + BUILD;
    l.setAttribute('data-mp-rsy-css', '1');
    document.head.appendChild(l);
  }

  function loadContext() {
    if (global.__mpRsyContextRequested) return;
    global.__mpRsyContextRequested = true;
    global.yaContextCb = global.yaContextCb || [];
    if (document.querySelector('script[src="' + CONTEXT_SRC + '"]')) return;
    var s = document.createElement('script');
    s.src = CONTEXT_SRC;
    s.async = true;
    (document.head || document.documentElement).appendChild(s);
  }

  function renderBlock(blockId, renderToId) {
    if (!blockId || !renderToId || rendered[renderToId]) return;
    var node = document.getElementById(renderToId);
    if (!node) return;
    rendered[renderToId] = true;
    loadContext();
    global.yaContextCb.push(function () {
      try {
        if (!global.Ya || !Ya.Context || !Ya.Context.AdvManager) return;
        Ya.Context.AdvManager.render({ blockId: blockId, renderTo: renderToId });
      } catch (_e) {}
    });
  }

  function slotId(kind, side) {
    if (side) return 'mp_rsy_' + kind + '_' + side;
    return 'mp_rsy_' + kind;
  }

  function teardownLegacyWrapper() {
    document.querySelectorAll('.mp-page-with-rsy').forEach(function (layout) {
      var anchor = layout.querySelector('.film-page-outer, main.staff-standalone-main, #staff-root');
      if (anchor && layout.parentNode) {
        layout.parentNode.insertBefore(anchor, layout);
        layout.remove();
      }
    });
  }

  function removeOwnedSlots() {
    document.querySelectorAll('.mp-rsy-fixed-rail, .mp-rsy-inline').forEach(function (el) {
      el.remove();
    });
    rendered = Object.create(null);
  }

  function teardownRails() {
    teardownLegacyWrapper();
    removeOwnedSlots();
    if (_observer) {
      try { _observer.disconnect(); } catch (_d) {}
      _observer = null;
    }
  }

  function railAnchorTop() {
    var gap = 12;
    var nav = document.querySelector(
      '#cabinet-readonly .cabinet-nav, .film-standalone-nav, .staff-standalone-nav, body.in-cabinet .cabinet-nav'
    );
    if (nav) {
      var nr = nav.getBoundingClientRect();
      if (nr.bottom > 40 && nr.bottom < (global.innerHeight || 800)) {
        return Math.round(nr.bottom + gap);
      }
    }
    var contentTop = document.querySelector(
      '#section-film > div, #film-page-content > section.hero, main.film-page > section.hero, main.subpage-main .article-content, .article-content h1'
    );
    if (contentTop) {
      var cr = contentTop.getBoundingClientRect();
      if (cr.top > 20 && cr.top < (global.innerHeight || 800) * 0.55) {
        return Math.round(cr.top);
      }
    }
    var header = document.getElementById('site-header');
    if (header) {
      var hr = header.getBoundingClientRect();
      if (hr.bottom > 20) return Math.round(hr.bottom + gap);
    }
    return 120;
  }

  function applyRailVertical(rail) {
    if (!rail) return;
    var top = railAnchorTop();
    var bottomPad = 16;
    rail.style.top = top + 'px';
    rail.style.height = 'calc(100vh - ' + (top + bottomPad) + 'px)';
    rail.style.maxHeight = 'calc(100vh - ' + (top + bottomPad) + 'px)';
    var slot = rail.querySelector('.mp-rsy-slot');
    if (slot) {
      slot.style.minHeight = 'calc(100vh - ' + (top + bottomPad + 8) + 'px)';
    }
  }

  function applyRailPosition(rail, geo) {
    if (!rail) return;
    if (!geo) {
      rail.hidden = true;
      return;
    }
    rail.hidden = false;
    rail.style.left = geo.left + 'px';
    rail.style.right = 'auto';
    rail.style.width = geo.width + 'px';
    rail.dataset.mpRsyWidth = String(geo.width);
    applyRailVertical(rail);
  }

  function ensureFixedRail(kind, blockId, side) {
    side = side || 'right';
    if (!blockId) return null;
    var geo = railGeometry(side, kind);
    if (!geo) return null;
    var railId = 'mp_rsy_fixed_' + kind + '_' + side;
    var rail = document.getElementById(railId);
    if (!rail) {
      rail = document.createElement('aside');
      rail.id = railId;
      rail.className = 'mp-rsy-fixed-rail mp-rsy-fixed-rail--tall mp-rsy-fixed-rail--' + kind + ' mp-rsy-fixed-rail--' + side;
      rail.setAttribute('aria-label', 'Реклама');
      var slot = document.createElement('div');
      slot.id = slotId(kind, side);
      slot.className = 'mp-rsy-slot mp-rsy-slot--tall mp-rsy-slot--' + kind;
      rail.appendChild(slot);
      document.body.appendChild(rail);
    }
    applyRailPosition(rail, geo);
    renderBlock(blockId, slotId(kind, side));
    return rail;
  }

  function isSeriesHubPath(path) {
    return path === '/series' || path === '/series-hub' || /^\/series(\/|$)/.test(path);
  }

  function pathKindActive(path, kind) {
    if (kind === 'film') return /^\/f\/\d+/.test(path) || /^\/f\/mp-\d+/.test(path);
    if (kind === 'staff') return /^\/s\/\d+/.test(path);
    if (kind === 'article') return /\/articles\//.test(path);
    if (kind === 'series') return isSeriesHubPath(path);
    return false;
  }

  function updateFixedRailVisibility() {
    if (!allowsAds() || !LAYOUT_ENABLED || shouldSkip()) {
      document.querySelectorAll('.mp-rsy-fixed-rail').forEach(function (r) { r.hidden = true; });
      return;
    }
    var path = String(global.location && global.location.pathname || '');
    document.querySelectorAll('.mp-rsy-fixed-rail').forEach(function (rail) {
      var kind = 'staff';
      if (rail.classList.contains('mp-rsy-fixed-rail--article')) kind = 'article';
      if (rail.classList.contains('mp-rsy-fixed-rail--film')) kind = 'film';
      if (rail.classList.contains('mp-rsy-fixed-rail--series')) kind = 'series';
      var side = rail.classList.contains('mp-rsy-fixed-rail--left') ? 'left' : 'right';
      if (!pathKindActive(path, kind)) {
        rail.hidden = true;
        return;
      }
      var geo = railGeometry(side, kind);
      applyRailPosition(rail, geo);
      if (geo) applyRailVertical(rail);
    });
  }

  function mountInlineAfter(anchor, kind, blockId) {
    if (!anchor || !blockId) return;
    var wrapId = 'mp_rsy_inline_' + kind;
    if (document.getElementById(wrapId)) return;
    var wrap = document.createElement('div');
    wrap.id = wrapId;
    wrap.className = 'mp-rsy-inline mp-rsy-inline--' + kind;
    var sid = slotId('inline_' + kind);
    var slot = document.createElement('div');
    slot.id = sid;
    slot.className = 'mp-rsy-slot mp-rsy-slot--inline-' + kind;
    wrap.appendChild(slot);
    anchor.insertAdjacentElement('afterend', wrap);
    renderBlock(blockId, sid);
  }

  function mountFilmAfterSimilar() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    var section = document.querySelector('.film-page-similar-section');
    if (!section || !BLOCKS.filmAfterSimilar) return;
    mountInlineAfter(section, 'after_similar', BLOCKS.filmAfterSimilar);
  }

  function mountStaffAfterFilmography() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    var roles = document.getElementById('staff-roles-root');
    if (!roles || !BLOCKS.staffAfterFilmography) return;
    mountInlineAfter(roles, 'after_filmography', BLOCKS.staffAfterFilmography);
  }

  function mountArticleBottom() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    if (!/\/articles\//.test(String(global.location && global.location.pathname || ''))) return;
    var content = document.querySelector('.article-content');
    if (!content || !BLOCKS.articleInline) return;
    mountInlineAfter(content, 'article', BLOCKS.articleInline);
  }

  function hasArticleSideRoom() {
    return !!(railGeometry('right', 'article') || railGeometry('left', 'article'));
  }

  function mountArticlePage() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    var sideOk = hasArticleSideRoom();
    if (sideOk && BLOCKS.articleSidebarRight) {
      ensureFixedRail('article', BLOCKS.articleSidebarRight, 'right');
    }
    if (sideOk && BLOCKS.articleSidebarLeft) {
      ensureFixedRail('article', BLOCKS.articleSidebarLeft, 'left');
    }
    if (BLOCKS.articleInline) {
      mountArticleBottom();
    }
  }

  function mountFilmPage() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    removeOwnedSlots();
    if (BLOCKS.filmSidebar) ensureFixedRail('film', BLOCKS.filmSidebar, 'right');
    mountFilmAfterSimilar();
  }

  function mountStaffPage() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    removeOwnedSlots();
    if (BLOCKS.staffSidebar) ensureFixedRail('staff', BLOCKS.staffSidebar, 'right');
    mountStaffAfterFilmography();
  }

  function mountSeriesHubPage() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    if (!isSeriesHubPath(String(global.location && global.location.pathname || ''))) return;
    if (BLOCKS.seriesSidebar) ensureFixedRail('series', BLOCKS.seriesSidebar, 'right');
    var sec = document.getElementById('section-series-hub') || document.getElementById('section-series');
    if (!sec || !BLOCKS.seriesInline) return;
    var wrapId = 'mp_rsy_inline_series_hub';
    if (document.getElementById(wrapId)) return;
    var wrap = document.createElement('div');
    wrap.id = wrapId;
    wrap.className = 'mp-rsy-inline mp-rsy-inline--series_hub';
    var sid = slotId('inline_series_hub');
    var slot = document.createElement('div');
    slot.id = sid;
    slot.className = 'mp-rsy-slot mp-rsy-slot--inline-series_hub';
    wrap.appendChild(slot);
    sec.appendChild(wrap);
    renderBlock(BLOCKS.seriesInline, sid);
  }

  function watchLateSections() {
    if (_observer || !LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    if (typeof MutationObserver === 'undefined') return;
    _observer = new MutationObserver(function () {
      var path = String(global.location && global.location.pathname || '');
      if (/^\/f\//.test(path)) {
        mountFilmAfterSimilar();
        if (BLOCKS.filmSidebar) ensureFixedRail('film', BLOCKS.filmSidebar, 'right');
      }
      if (/^\/s\//.test(path)) mountStaffAfterFilmography();
      if (isSeriesHubPath(path)) mountSeriesHubPage();
      if (/\/articles\//.test(path)) mountArticlePage();
    });
    _observer.observe(document.body, { childList: true, subtree: true });
  }

  function mountForRoute() {
    if (!allowsAds() || shouldSkip()) {
      teardownRails();
      return;
    }
    ensureStyles();
    teardownLegacyWrapper();
    var path = String(global.location && global.location.pathname || '');
    if (/^\/f\/\d+/.test(path) || /^\/f\/mp-\d+/.test(path)) {
      mountFilmPage();
      watchLateSections();
      return;
    }
    if (/^\/s\/\d+/.test(path)) {
      mountStaffPage();
      watchLateSections();
      return;
    }
    if (isSeriesHubPath(path)) {
      removeOwnedSlots();
      mountSeriesHubPage();
      watchLateSections();
      updateFixedRailVisibility();
      return;
    }
    if (/\/articles\//.test(path)) {
      removeOwnedSlots();
      mountArticlePage();
      watchLateSections();
      updateFixedRailVisibility();
      return;
    }
    removeOwnedSlots();
    updateFixedRailVisibility();
  }

  function onResize() {
    if (!allowsAds() || shouldSkip()) return;
    updateFixedRailVisibility();
    if (!isDesktop()) {
      document.querySelectorAll('.mp-rsy-fixed-rail').forEach(function (rail) {
        rail.hidden = true;
      });
      return;
    }
    mountForRoute();
  }

  function boot() {
    teardownLegacyWrapper();
    if (!LAYOUT_ENABLED || shouldSkip()) return;
    if (!allowsAds()) {
      teardownRails();
      return;
    }
    mountForRoute();
    if (!global._mpRsyResizeBound) {
      global._mpRsyResizeBound = true;
      var t;
      global.addEventListener('resize', function () {
        clearTimeout(t);
        t = setTimeout(onResize, 120);
      });
    }
  }

  global.mpLoadYandexRsy = function () { boot(); };

  global.MpRsy = {
    BUILD: BUILD,
    BLOCKS: BLOCKS,
    mountFilmPage: mountFilmPage,
    mountFilmAfterSimilar: mountFilmAfterSimilar,
    mountStaffPage: mountStaffPage,
    mountStaffAfterFilmography: mountStaffAfterFilmography,
    mountSeriesHubPage: mountSeriesHubPage,
    mountArticleInline: mountArticlePage,
    remount: mountForRoute,
    teardown: teardownRails,
  };

  document.addEventListener('mp:cookie-consent', function () {
    if (allowsAds()) boot();
    else teardownRails();
  });

  if (allowsAds()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', teardownLegacyWrapper);
  } else {
    teardownLegacyWrapper();
  }
})(typeof window !== 'undefined' ? window : this);
