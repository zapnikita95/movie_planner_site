/**
 * Mobile: hide header search on scroll down, show on scroll up (smooth CSS).
 * Staff/film: pin hero title in header after name scrolls away — no flicker.
 *
 * Compact sticky (staff/film):
 * - Collapse search input into chrome 🔍 in the logo row (replaces coins).
 * - Sticky name stays below; header height stable while scrolling.
 * - Tap 🔍 → expand search + hub (intentional); close → compact again.
 *
 * Anti-flicker rules:
 * - Measure sticky threshold vs logo/buttons row only (not full header height).
 * - Wide hysteresis so stop-scroll near threshold does not toggle.
 * - Title always stays at order:4; search at order:3 (never swap).
 * - Mutually exclusive staff vs film body page classes.
 */
(function (global) {
  'use strict';

  var RETRACT_CLASS = 'header-search--retracted';
  var CHROME_SEARCH_CLASS = 'mp-header-chrome-search';
  var MQ = '(max-width: 860px)';
  var _updateFn = null;

  function decideSearchRetract(y, lastY, opts) {
    opts = opts || {};
    if (!opts.mobile) return 'show';
    if (opts.dropdownOpen || opts.inputFocused) return 'show';
    if (opts.suppressHide) return 'show';
    // Stay open near top — layout settle / hero image must not yank the row.
    if (y <= 48) return 'show';
    // Wider deltas: stop-scroll and tiny layout shifts must not toggle.
    if (y > lastY + 28) return 'hide';
    if (y < lastY - 18) return 'show';
    return 'keep';
  }

  function bodyAllowsMobileSearchRetract() {
    try {
      if (!global.matchMedia || !global.matchMedia(MQ).matches) return false;
    } catch (_e) {
      return false;
    }
    var b = global.document && global.document.body;
    if (!b || !b.classList) return false;
    return b.classList.contains('in-cabinet')
      || b.classList.contains('landing-root-page')
      || b.classList.contains('film-standalone-page')
      || b.classList.contains('user-standalone-page')
      || b.classList.contains('staff-standalone-page')
      || b.classList.contains('in-search-page');
  }

  function applyDecision(search, decision) {
    if (!search || decision === 'keep') return;
    if (decision === 'hide') search.classList.add(RETRACT_CLASS);
    else search.classList.remove(RETRACT_CLASS);
  }

  /** Viewport Y of bottom of logo/buttons row — stable when search/title toggle. */
  function stickyChromeBottom(header) {
    if (!header) return 56;
    var logo = header.querySelector('.logo');
    var buttons = header.querySelector('.header-buttons');
    var bottom = 0;
    if (logo) bottom = Math.max(bottom, logo.getBoundingClientRect().bottom);
    if (buttons) bottom = Math.max(bottom, buttons.getBoundingClientRect().bottom);
    if (!bottom) {
      // Fallback: top padding + ~44px row (ignore search/title)
      var r = header.getBoundingClientRect();
      return r.top + 48;
    }
    return bottom;
  }

  function heroTitlePastHeader(doc, header, wasPast, selector, pageClass) {
    if (!doc || !doc.body || !doc.body.classList.contains(pageClass)) return false;
    var nameEl = doc.querySelector(selector);
    if (!nameEl) return false;
    var chromeBottom = stickyChromeBottom(header);
    var top = nameEl.getBoundingClientRect().top;
    // Wide hysteresis: enter when title clears chrome; leave only when well below.
    if (wasPast) return top < chromeBottom + 56;
    return top < chromeBottom + 4;
  }

  function clearStickyClasses(body, prefix) {
    if (!body || !body.classList) return;
    body.classList.remove(
      prefix + '-header-title-on',
      prefix + '-header-title-only',
      prefix + '-header-search-with-title'
    );
  }

  function applyStickyHeaderTitle(doc, opts) {
    opts = opts || {};
    var body = doc.body;
    if (!body) return;
    var pageClass = opts.pageClass || '';
    var onClass = opts.onClass || '';
    var onlyClass = opts.onlyClass || '';
    var withSearchClass = opts.withSearchClass || '';
    if (!pageClass || !body.classList.contains(pageClass)) {
      if (onClass) body.classList.remove(onClass);
      if (onlyClass) body.classList.remove(onlyClass);
      if (withSearchClass) body.classList.remove(withSearchClass);
      return;
    }
    var past = !!opts.pastName;
    var showSearch = !!opts.showSearch;
    body.classList.toggle(onClass, past);
    // Title-only vs with-search: search visibility only — title slot order stays fixed in CSS.
    body.classList.toggle(onlyClass, past && !showSearch);
    body.classList.toggle(withSearchClass, past && showSearch);
  }

  function ensureExclusivePageMode(doc) {
    var body = doc.body;
    if (!body || !body.classList) return { onStaff: false, onFilm: false };
    var onStaff = body.classList.contains('staff-standalone-page');
    var onFilm = body.classList.contains('film-standalone-page');
    if (onStaff && onFilm) {
      // Prefer staff when both present (common /s/ bug leftover).
      body.classList.remove('film-standalone-page');
      clearStickyClasses(body, 'film');
      onFilm = false;
      var ft = doc.getElementById('header-film-title');
      if (ft) {
        ft.textContent = '';
        ft.removeAttribute('title');
      }
    }
    return { onStaff: onStaff, onFilm: onFilm && !onStaff };
  }

  function syncChromeSearchBtn(doc, compactOn, searchOpen) {
    var btn = doc.getElementById('header-chrome-search-btn');
    if (!btn) return;
    btn.setAttribute('aria-label', searchOpen ? 'Закрыть поиск' : 'Поиск');
    btn.setAttribute('title', searchOpen ? 'Закрыть поиск' : 'Поиск');
    btn.classList.toggle('header-chrome-search-btn--close', !!(compactOn && searchOpen));
  }

  function bindChromeSearchBtn(doc) {
    var btn = doc.getElementById('header-chrome-search-btn');
    if (!btn || btn.dataset.mpChromeSearchBound) return;
    btn.dataset.mpChromeSearchBound = '1';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var body = doc.body;
      var input = doc.getElementById('header-search-input');
      var search = doc.getElementById('header-search');
      var open = !!(body && body.classList.contains('header-search-dropdown-open'));
      if (open) {
        if (body) body.classList.remove('header-search-dropdown-open');
        var dd = doc.getElementById('header-search-dropdown');
        if (dd) {
          dd.classList.add('hidden');
          dd.innerHTML = '';
        }
        if (input) input.blur();
        if (typeof _updateFn === 'function') _updateFn();
        return;
      }
      if (search) search.classList.remove(RETRACT_CLASS);
      _suppressHideUntil = Date.now() + 800;
      if (input) {
        try { input.focus(); } catch (_f) {}
      }
      if (typeof _updateFn === 'function') _updateFn();
    });
  }

  var _suppressHideUntil = 0;

  function bindMobileSearchScroll(opts) {
    opts = opts || {};
    if (global._mpHeaderSearchScrollBound) return global.MpHeaderSearchScroll;
    global._mpHeaderSearchScrollBound = true;

    var doc = global.document;
    if (!doc) return global.MpHeaderSearchScroll;

    var lastY = global.scrollY || 0;
    var pastStaff = false;
    var pastFilm = false;
    var ticking = false;

    function update() {
      ticking = false;
      var search = doc.getElementById('header-search');
      var header = doc.getElementById('site-header');
      var body = doc.body;
      if (header) header.classList.remove('site-header--retracted');
      if (!search || !body) return;

      bindChromeSearchBtn(doc);

      var mode = ensureExclusivePageMode(doc);
      var mobile = bodyAllowsMobileSearchRetract();
      var dropdownOpen = !!body.classList.contains('header-search-dropdown-open');
      var input = doc.getElementById('header-search-input');
      var inputFocused = !!(input && doc.activeElement === input);
      var y = global.scrollY || 0;
      var suppressHide = Date.now() < _suppressHideUntil;
      var searchActive = dropdownOpen || inputFocused || suppressHide;
      var decision = decideSearchRetract(y, lastY, {
        mobile: mobile,
        dropdownOpen: dropdownOpen,
        inputFocused: inputFocused,
        suppressHide: suppressHide,
      });

      var staffPast = mobile && mode.onStaff && heroTitlePastHeader(
        doc, header, pastStaff, '.staff-hero-name', 'staff-standalone-page'
      );
      pastStaff = staffPast;
      var filmPast = mobile && mode.onFilm && heroTitlePastHeader(
        doc, header, pastFilm, '#film-title', 'film-standalone-page'
      );
      pastFilm = filmPast;
      var pastName = !!(staffPast || filmPast);
      var compactPage = !!(mode.onStaff || mode.onFilm);

      // Staff/film compact sticky: collapse input into chrome 🔍; expand only when searching.
      if (mobile && compactPage && pastName) {
        body.classList.add(CHROME_SEARCH_CLASS);
        if (searchActive) applyDecision(search, 'show');
        else applyDecision(search, 'hide');
      } else if (mobile && !compactPage) {
        body.classList.remove(CHROME_SEARCH_CLASS);
        applyDecision(search, decision);
      } else {
        body.classList.remove(CHROME_SEARCH_CLASS);
        applyDecision(search, 'show');
      }

      var showSearchRow = !(mobile && compactPage && pastName && !searchActive);
      syncChromeSearchBtn(doc, pastName && compactPage, searchActive && pastName);

      if (staffPast) {
        applyStickyHeaderTitle(doc, {
          pageClass: 'staff-standalone-page',
          onClass: 'staff-header-title-on',
          onlyClass: 'staff-header-title-only',
          withSearchClass: 'staff-header-search-with-title',
          pastName: true,
          showSearch: showSearchRow,
        });
        applyStickyHeaderTitle(doc, {
          pageClass: 'film-standalone-page',
          onClass: 'film-header-title-on',
          onlyClass: 'film-header-title-only',
          withSearchClass: 'film-header-search-with-title',
          pastName: false,
          showSearch: true,
        });
      } else if (filmPast) {
        applyStickyHeaderTitle(doc, {
          pageClass: 'film-standalone-page',
          onClass: 'film-header-title-on',
          onlyClass: 'film-header-title-only',
          withSearchClass: 'film-header-search-with-title',
          pastName: true,
          showSearch: showSearchRow,
        });
        applyStickyHeaderTitle(doc, {
          pageClass: 'staff-standalone-page',
          onClass: 'staff-header-title-on',
          onlyClass: 'staff-header-title-only',
          withSearchClass: 'staff-header-search-with-title',
          pastName: false,
          showSearch: true,
        });
      } else {
        applyStickyHeaderTitle(doc, {
          pageClass: 'staff-standalone-page',
          onClass: 'staff-header-title-on',
          onlyClass: 'staff-header-title-only',
          withSearchClass: 'staff-header-search-with-title',
          pastName: false,
          showSearch: true,
        });
        applyStickyHeaderTitle(doc, {
          pageClass: 'film-standalone-page',
          onClass: 'film-header-title-on',
          onlyClass: 'film-header-title-only',
          withSearchClass: 'film-header-search-with-title',
          pastName: false,
          showSearch: true,
        });
      }
      lastY = y;
    }

    _updateFn = update;

    global.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        global.requestAnimationFrame(update);
      }
    }, { passive: true });
    global.addEventListener('resize', update, { passive: true });
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', update);
    } else {
      update();
    }
    return global.MpHeaderSearchScroll;
  }

  global.MpHeaderSearchScroll = {
    RETRACT_CLASS: RETRACT_CLASS,
    CHROME_SEARCH_CLASS: CHROME_SEARCH_CLASS,
    decideSearchRetract: decideSearchRetract,
    bodyAllowsMobileSearchRetract: bodyAllowsMobileSearchRetract,
    stickyChromeBottom: stickyChromeBottom,
    bind: bindMobileSearchScroll,
    suppressRetract: function (ms) {
      var n = parseInt(ms, 10);
      if (!(n > 0)) n = 1000;
      _suppressHideUntil = Date.now() + n;
      var search = global.document && global.document.getElementById('header-search');
      if (search) search.classList.remove(RETRACT_CLASS);
      if (typeof _updateFn === 'function') _updateFn();
    },
    refresh: function () {
      if (typeof _updateFn === 'function') _updateFn();
    },
  };

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', function () {
        bindMobileSearchScroll();
      });
    } else {
      bindMobileSearchScroll();
    }
  }
})(typeof window !== 'undefined' ? window : this);
