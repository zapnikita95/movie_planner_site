/**
 * Mobile: hide header search on scroll down, show on scroll up.
 * Keeps logo / login / profile visible.
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

  function bindMobileSearchScroll(opts) {
    opts = opts || {};
    if (global._mpHeaderSearchScrollBound) return global.MpHeaderSearchScroll;
    global._mpHeaderSearchScrollBound = true;

    var doc = global.document;
    if (!doc) return global.MpHeaderSearchScroll;

    var lastY = global.scrollY || 0;
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
      applyDecision(search, decision);
      if (!mobile) applyDecision(search, 'show');
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
