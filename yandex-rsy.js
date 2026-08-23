/**

 * Yandex RSY — movie-planner.ru

 * RULE: .cursor/rules/yandex-rsy-ads.mdc — ads must NOT shift layout (no DOM wrap).

 * Desktop sidebar: position:fixed on body. Inline: only after sections (similar, filmography).

 */

(function (global) {

  'use strict';



  var BUILD = '20260824rsyAll1';

  var LAYOUT_ENABLED = true;

  var CONTEXT_SRC = 'https://yandex.ru/ads/system/context.js';

  var DESKTOP_MIN = 1280;

  /** 1180px content + ~300px rail + margins — sidebar only when it fits in dead space */

  var SIDEBAR_MIN = 1520;



  /**

   * Paste block ids from RSY cabinet (Реклама на сайтах → Добавить блок).

   * One id per placement for separate stats; null = slot hidden until id is set.

   */

  var BLOCKS = {

    filmSidebar: 'R-A-19798904-2',

    filmAfterSimilar: 'R-A-19798904-1',

    staffSidebar: 'R-A-19798904-3',

    staffAfterFilmography: 'R-A-19798904-4',

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



  function isDesktop() {

    try {

      return global.matchMedia && global.matchMedia('(min-width: ' + DESKTOP_MIN + 'px)').matches;

    } catch (_e) {

      return false;

    }

  }



  function hasSidebarRoom() {

    try {

      return global.matchMedia && global.matchMedia('(min-width: ' + SIDEBAR_MIN + 'px)').matches;

    } catch (_e) {

      return false;

    }

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



  function ensureFixedRail(kind, blockId) {

    if (!blockId || !hasSidebarRoom()) return;

    var railId = 'mp_rsy_fixed_' + kind;

    var rail = document.getElementById(railId);

    if (!rail) {

      rail = document.createElement('aside');

      rail.id = railId;

      rail.className = 'mp-rsy-fixed-rail mp-rsy-fixed-rail--' + kind;

      rail.setAttribute('aria-label', 'Реклама');

      var slot = document.createElement('div');

      slot.id = slotId(kind);

      slot.className = 'mp-rsy-slot mp-rsy-slot--' + kind;

      rail.appendChild(slot);

      document.body.appendChild(rail);

    }

    renderBlock(blockId, slotId(kind));

    updateFixedRailVisibility();

  }



  function updateFixedRailVisibility() {

    var path = String(global.location && global.location.pathname || '');

    var showFilm = /^\/f\/\d+/.test(path) || /^\/f\/mp-\d+/.test(path);

    var showStaff = /^\/s\/\d+/.test(path);

    var room = hasSidebarRoom() && allowsAds() && LAYOUT_ENABLED && !shouldSkip();

    document.querySelectorAll('.mp-rsy-fixed-rail').forEach(function (rail) {

      var isFilm = rail.classList.contains('mp-rsy-fixed-rail--film');

      var isStaff = rail.classList.contains('mp-rsy-fixed-rail--staff');

      var show = room && ((isFilm && showFilm) || (isStaff && showStaff));

      rail.hidden = !show;

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



  function mountArticleInline() {

    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;

    if (!/\/articles\//.test(String(global.location && global.location.pathname || ''))) return;

    var content = document.querySelector('.article-content');

    if (!content || !BLOCKS.articleInline) return;

    mountInlineAfter(content, 'article', BLOCKS.articleInline);

  }



  function mountFilmPage() {

    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;

    if (BLOCKS.filmSidebar) ensureFixedRail('film', BLOCKS.filmSidebar);

    mountFilmAfterSimilar();

  }



  function mountStaffPage() {

    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;

    if (BLOCKS.staffSidebar) ensureFixedRail('staff', BLOCKS.staffSidebar);

    mountStaffAfterFilmography();

  }



  function watchLateSections() {

    if (_observer || !LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;

    if (typeof MutationObserver === 'undefined') return;

    _observer = new MutationObserver(function () {

      var path = String(global.location && global.location.pathname || '');

      if (/^\/f\//.test(path)) mountFilmAfterSimilar();

      if (/^\/s\//.test(path)) mountStaffAfterFilmography();

      if (/\/articles\//.test(path)) mountArticleInline();

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

      mountArticleInline();

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

        t = setTimeout(onResize, 180);

      });

      try {

        global.matchMedia('(min-width: ' + SIDEBAR_MIN + 'px)').addEventListener('change', onResize);

        global.matchMedia('(min-width: ' + DESKTOP_MIN + 'px)').addEventListener('change', onResize);

      } catch (_mq) {}

    }

  }



  global.mpLoadYandexRsy = function () {

    boot();

  };



  global.MpRsy = {

    BUILD: BUILD,

    BLOCKS: BLOCKS,

    mountFilmPage: mountFilmPage,

    mountFilmAfterSimilar: mountFilmAfterSimilar,

    mountStaffPage: mountStaffPage,

    mountStaffAfterFilmography: mountStaffAfterFilmography,

    mountArticleInline: mountArticleInline,

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


