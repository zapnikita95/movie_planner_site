/**
 * Mobile: hide header search on scroll down, show on scroll up.
 * Staff/film pages: pin hero title in header after it scrolls away;
 * scroll-up can reveal search above the sticky name.
 * Keeps logo / login / profile visible. Does not invent a second header.
 */
(function (global) {
  'use strict';

  var RETRACT_CLASS = 'header-search--retracted';
  var MQ = '(max-width: 860px)';

  function decideSearchRetract(y, lastY, opts) {
    opts = opts || {};
    if (!opts.mobile) return 'show';
    if (opts.dropdownOpen || opts.inputFocused) return 'show';
    if (y <= 8) return 'show';
    if (y > lastY + 8) return 'hide';
    if (y < lastY - 8) return 'show';
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

  function heroTitlePastHeader(doc, header, wasPast, selector, pageClass) {
    if (!doc || !doc.body || !doc.body.classList.contains(pageClass)) return false;
    var nameEl = doc.querySelector(selector);
    if (!nameEl) return false;
    var headerH = header ? header.offsetHeight : 86;
    var top = nameEl.getBoundingClientRect().top;
    // Hysteresis: enter sticky earlier, leave later — less flicker
    if (wasPast) return top < headerH + 28;
    return top < headerH - 8;
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
    body.classList.toggle(onlyClass, past && !showSearch);
    body.classList.toggle(withSearchClass, past && showSearch);
  }

  function bindMobileSearchScroll(opts) {
    opts = opts || {};
    if (global._mpHeaderSearchScrollBound) return global.MpHeaderSearchScroll;
    global._mpHeaderSearchScrollBound = true;

    var doc = global.document;
    if (!doc) return global.MpHeaderSearchScroll;

    var lastY = global.scrollY || 0;
    var pastStaff = false;
    var pastFilm = false;
    var searchStickyShow = true;
    var ticking = false;

    function update() {
      ticking = false;
      var search = doc.getElementById('header-search');
      var header = doc.getElementById('site-header');
      if (header) header.classList.remove('site-header--retracted');
      if (!search) return;

      var mobile = bodyAllowsMobileSearchRetract();
      var dropdownOpen = !!(doc.body && doc.body.classList.contains('header-search-dropdown-open'));
      var input = doc.getElementById('header-search-input');
      var inputFocused = !!(input && doc.activeElement === input);
      var y = global.scrollY || 0;
      var decision = decideSearchRetract(y, lastY, {
        mobile: mobile,
        dropdownOpen: dropdownOpen,
        inputFocused: inputFocused,
      });

      var onStaff = !!(doc.body && doc.body.classList.contains('staff-standalone-page'));
      var onFilm = !!(doc.body && doc.body.classList.contains('film-standalone-page')) && !onStaff;
      var staffPast = mobile && onStaff && heroTitlePastHeader(
        doc, header, pastStaff, '.staff-hero-name', 'staff-standalone-page'
      );
      pastStaff = staffPast;
      var filmPast = mobile && onFilm && heroTitlePastHeader(
        doc, header, pastFilm, '#film-title', 'film-standalone-page'
      );
      pastFilm = filmPast;

      var pastName = staffPast || filmPast;

      if (pastName) {
        if (decision === 'show' || dropdownOpen || inputFocused || y <= 8) searchStickyShow = true;
        else if (decision === 'hide') searchStickyShow = false;

        if (staffPast) {
          applyStickyHeaderTitle(doc, {
            pageClass: 'staff-standalone-page',
            onClass: 'staff-header-title-on',
            onlyClass: 'staff-header-title-only',
            withSearchClass: 'staff-header-search-with-title',
            pastName: true,
            showSearch: searchStickyShow,
          });
          applyStickyHeaderTitle(doc, {
            pageClass: 'film-standalone-page',
            onClass: 'film-header-title-on',
            onlyClass: 'film-header-title-only',
            withSearchClass: 'film-header-search-with-title',
            pastName: false,
            showSearch: true,
          });
        } else {
          applyStickyHeaderTitle(doc, {
            pageClass: 'film-standalone-page',
            onClass: 'film-header-title-on',
            onlyClass: 'film-header-title-only',
            withSearchClass: 'film-header-search-with-title',
            pastName: true,
            showSearch: searchStickyShow,
          });
          applyStickyHeaderTitle(doc, {
            pageClass: 'staff-standalone-page',
            onClass: 'staff-header-title-on',
            onlyClass: 'staff-header-title-only',
            withSearchClass: 'staff-header-search-with-title',
            pastName: false,
            showSearch: true,
          });
        }
        if (searchStickyShow) search.classList.remove(RETRACT_CLASS);
        else search.classList.add(RETRACT_CLASS);
      } else {
        searchStickyShow = true;
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
        // Always hide search on scroll-down (staff + film + cabinet)
        applyDecision(search, mobile ? decision : 'show');
        if (!mobile) applyDecision(search, 'show');
      }
      lastY = y;
    }

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
    decideSearchRetract: decideSearchRetract,
    bodyAllowsMobileSearchRetract: bodyAllowsMobileSearchRetract,
    bind: bindMobileSearchScroll,
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
