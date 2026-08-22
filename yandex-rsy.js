/**
 * Yandex RSY — movie-planner.ru
 * RULE: .cursor/rules/yandex-rsy-ads.mdc — ads must NOT shift layout (no DOM wrap).
 * Desktop: fixed slot or bottom only. LAYOUT_ENABLED=false until re-enabled safely.
 */
(function (global) {
  'use strict';

  var BUILD = '20260822content1';
  /** Layout disabled until RSY moderation passes — no DOM wrap, no content shift. */
  var LAYOUT_ENABLED = false;
  var CONTEXT_SRC = 'https://yandex.ru/ads/system/context.js';
  var DESKTOP_MIN = 1280;

  /** Replace block ids when new units are created in the RSY cabinet. */
  var BLOCKS = {
    filmDesktop: 'R-A-19798904-1',
    staffDesktop: 'R-A-19798904-1',
    articleInline: null,
  };

  var rendered = Object.create(null);
  var layoutMounted = false;

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

  function isDesktop() {
    try {
      return global.matchMedia && global.matchMedia('(min-width: ' + DESKTOP_MIN + 'px)').matches;
    } catch (_e) {
      return false;
    }
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
        Ya.Context.AdvManager.render({
          blockId: blockId,
          renderTo: renderToId,
        });
      } catch (_e) {}
    });
  }

  function slotId(kind) {
    return 'mp_rsy_' + kind;
  }

  function ensureRail(anchor, kind, blockId) {
    if (!LAYOUT_ENABLED || !anchor || !blockId || !isDesktop()) return null;
    var parent = anchor.parentElement;
    if (!parent) return null;

    var layout = parent.classList.contains('mp-page-with-rsy')
      ? parent
      : parent.querySelector('.mp-page-with-rsy');

    if (!layout) {
      layout = document.createElement('div');
      layout.className = 'mp-page-with-rsy mp-page-with-rsy--' + kind;
      parent.insertBefore(layout, anchor);
      layout.appendChild(anchor);
      layoutMounted = true;
    }

    var rail = layout.querySelector('.mp-rsy-rail');
    if (!rail) {
      rail = document.createElement('aside');
      rail.className = 'mp-rsy-rail';
      rail.setAttribute('aria-label', 'Реклама');
      layout.appendChild(rail);
    }

    var id = slotId(kind);
    var slot = rail.querySelector('#' + id);
    if (!slot) {
      slot = document.createElement('div');
      slot.id = id;
      slot.className = 'mp-rsy-slot mp-rsy-slot--' + kind;
      rail.appendChild(slot);
    }

    renderBlock(blockId, id);
    return rail;
  }

  function teardownRails() {
    document.querySelectorAll('.mp-page-with-rsy').forEach(function (layout) {
      var anchor = layout.querySelector('.film-page-outer, main.staff-standalone-main, #staff-root');
      if (anchor && layout.parentNode) {
        layout.parentNode.insertBefore(anchor, layout);
        layout.remove();
      }
    });
    rendered = Object.create(null);
    layoutMounted = false;
  }

  function mountFilmPage() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip() || !isDesktop()) return;
    var outer =
      document.querySelector('#section-film .film-page-outer') ||
      document.querySelector('main.film-page .film-page-outer') ||
      document.querySelector('.film-page-outer');
    if (!outer || !BLOCKS.filmDesktop) return;
    ensureRail(outer, 'film', BLOCKS.filmDesktop);
  }

  function mountStaffPage() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip() || !isDesktop()) return;
    var main = document.querySelector('main.staff-standalone-main');
    if (!main || !BLOCKS.staffDesktop) return;
    ensureRail(main, 'staff', BLOCKS.staffDesktop);
  }

  function mountForRoute() {
    if (!allowsAds() || shouldSkip()) {
      teardownRails();
      return;
    }
    var path = String(global.location && global.location.pathname || '');
    if (/^\/f\/\d+/.test(path) || /^\/f\/mp-\d+/.test(path)) {
      mountFilmPage();
      return;
    }
    if (/^\/s\/\d+/.test(path)) {
      mountStaffPage();
      return;
    }
    teardownRails();
  }

  function onResize() {
    if (!allowsAds() || shouldSkip()) return;
    if (!isDesktop()) {
      teardownRails();
      return;
    }
    mountForRoute();
  }

  function boot() {
    teardownRails();
    if (!LAYOUT_ENABLED || shouldSkip()) return;
    mountForRoute();
    if (!global._mpRsyResizeBound) {
      global._mpRsyResizeBound = true;
      var t;
      global.addEventListener('resize', function () {
        clearTimeout(t);
        t = setTimeout(onResize, 180);
      });
      try {
        global.matchMedia('(min-width: ' + DESKTOP_MIN + 'px)').addEventListener('change', onResize);
      } catch (_mq) {}
    }
  }

  global.mpLoadYandexRsy = function () {
    boot();
  };

  global.MpRsy = {
    BUILD: BUILD,
    mountFilmPage: mountFilmPage,
    mountStaffPage: mountStaffPage,
    remount: mountForRoute,
    BLOCKS: BLOCKS,
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
    document.addEventListener('DOMContentLoaded', teardownRails);
  } else {
    teardownRails();
  }
})(typeof window !== 'undefined' ? window : this);
