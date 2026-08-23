/**
 * Yandex RSY — movie-planner.ru
 * Fixed rails sit in side gutters (never over 1180/800 content). No DOM wrap.
 */
(function (global) {
  'use strict';

  var BUILD = '20260824rsyLayout2';
  var LAYOUT_ENABLED = true;
  var CONTEXT_SRC = 'https://yandex.ru/ads/system/context.js';
  var DESKTOP_MIN = 1280;
  var CONTENT_FILM_STAFF = 1180;
  var CONTENT_ARTICLE = 800;
  var GUTTER_GAP = 20;

  var BLOCKS = {
    /** Disabled on /f/ — only horizontal after Similar (user: sidebar ugly + overlaps). */
    filmSidebar: null,
    filmAfterSimilar: 'R-A-19798904-1',
    staffSidebar: 'R-A-19798904-3',
    staffAfterFilmography: 'R-A-19798904-4',
    articleSidebarRight: 'R-A-19798904-5',
    articleSidebarLeft: null,
    articleInline: 'R-A-19798904-5',
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

  function railWidthForKind(kind) {
    var vw = viewportWidth();
    if (kind === 'staff') {
      if (vw >= 2000) return 360;
      if (vw >= 1760) return 336;
      return 300;
    }
    if (kind === 'article') {
      if (vw >= 1760) return 300;
      return 260;
    }
    return 300;
  }

  /** Gutter geometry: rail fully outside centered content column. */
  function railGeometry(side, kind) {
    var vw = viewportWidth();
    if (vw < DESKTOP_MIN) return null;
    var path = String(global.location && global.location.pathname || '');
    var contentMax = contentMaxForPath(path);
    var half = Math.min(contentMax / 2, vw / 2 - 12);
    var gutter = vw / 2 - half;
    var railW = railWidthForKind(kind);
    if (gutter < railW + GUTTER_GAP) return null;
    var w = Math.min(railW, gutter - GUTTER_GAP);
    if (w < 200) return null;
    if (side === 'left') {
      return { left: Math.max(12, vw / 2 - half - GUTTER_GAP - w), width: w };
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
      rail.className = 'mp-rsy-fixed-rail mp-rsy-fixed-rail--' + kind + ' mp-rsy-fixed-rail--' + side;
      rail.setAttribute('aria-label', 'Реклама');
      var slot = document.createElement('div');
      slot.id = slotId(kind, side);
      slot.className = 'mp-rsy-slot mp-rsy-slot--' + kind;
      rail.appendChild(slot);
      document.body.appendChild(rail);
    }
    applyRailPosition(rail, geo);
    renderBlock(blockId, slotId(kind, side));
    return rail;
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
      var side = rail.classList.contains('mp-rsy-fixed-rail--left') ? 'left' : 'right';
      var showStaff = /^\/s\/\d+/.test(path) && kind === 'staff';
      var showArticle = /\/articles\//.test(path) && kind === 'article';
      var showFilm = false;
      if (!showStaff && !showArticle && !showFilm) {
        rail.hidden = true;
        return;
      }
      applyRailPosition(rail, railGeometry(side, kind));
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
    if (!sideOk && BLOCKS.articleInline) {
      mountArticleBottom();
    }
  }

  function mountFilmPage() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    mountFilmAfterSimilar();
  }

  function mountStaffPage() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    if (BLOCKS.staffSidebar) ensureFixedRail('staff', BLOCKS.staffSidebar, 'right');
    mountStaffAfterFilmography();
  }

  function watchLateSections() {
    if (_observer || !LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    if (typeof MutationObserver === 'undefined') return;
    _observer = new MutationObserver(function () {
      var path = String(global.location && global.location.pathname || '');
      if (/^\/f\//.test(path)) mountFilmAfterSimilar();
      if (/^\/s\//.test(path)) mountStaffAfterFilmography();
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
    if (/\/articles\//.test(path)) {
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
