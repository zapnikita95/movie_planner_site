/**
 * Lightweight /f/:kp boot for index.html — film-page.js instead of cabinet-app.js on first paint.
 * Full cabinet-app.js loads on idle or when user opens another section.
 */
(function (global) {
  'use strict';

  var BUILD = '20260720filmfix1';
  var FULL_CABINET_SRC = '/cabinet-app.js?v=' + BUILD;
  var _fullLoading = false;
  var _fullReady = false;

  function kpFromPath() {
    var m = (global.location.pathname || '').match(/^\/f\/(\d+)\/?$/);
    return m ? m[1] : '';
  }

  function getToken() {
    try {
      var active = localStorage.getItem('mp_site_active_chat_id');
      var sessions = JSON.parse(localStorage.getItem('mp_site_sessions') || '[]');
      if (Array.isArray(sessions)) {
        for (var i = 0; i < sessions.length; i++) {
          if (String(sessions[i].chat_id) === String(active) && sessions[i].token) {
            return sessions[i].token;
          }
        }
      }
      return localStorage.getItem('mp_site_token');
    } catch (_e) {
      return null;
    }
  }

  function showScreen(screenId) {
    var inCabinet = screenId === 'cabinet-readonly' || screenId === 'cabinet-onboarding';
    ['landing', 'site-search-root', 'cabinet-readonly', 'cabinet-onboarding', 'public-stats'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    var header = document.getElementById('site-header');
    if (header) header.classList.remove('hidden');
    var target = document.getElementById(screenId);
    if (target) target.classList.remove('hidden');
    document.body.classList.toggle('in-cabinet', inCabinet);
    var hs = document.getElementById('header-search');
    if (hs) {
      hs.classList.toggle('hidden', !(screenId === 'landing' || inCabinet || screenId === 'public-stats'));
    }
    var footerApps = document.getElementById('cabinet-footer-apps');
    if (footerApps) footerApps.classList.remove('hidden');
  }

  function showFilmPageLayout() {
    var ro = document.getElementById('cabinet-readonly');
    if (!ro || ro.classList.contains('hidden')) return;
    ro.classList.add('film-page-mode');
    ro.querySelectorAll('.cabinet-section').forEach(function (el) {
      el.classList.toggle('hidden', el.id !== 'section-film');
    });
    ro.querySelectorAll('.cabinet-nav .cabinet-nav-btn').forEach(function (b) {
      b.classList.remove('active');
    });
    var homeStats = document.getElementById('cabinet-home-stats');
    if (homeStats) homeStats.classList.add('hidden');
  }

  function showCabinetFilmShell() {
    document.body.classList.remove('login-only-overlay');
    try {
      global.document.documentElement.classList.add('mp-route-ready');
      global.document.documentElement.classList.remove('mp-route-pending');
    } catch (_e) {}
    if (getToken()) {
      try {
        global.document.documentElement.classList.add('mp-auth-boot');
        global.document.documentElement.classList.add('mp-session');
      } catch (_e2) {}
    }
    showScreen('cabinet-readonly');
    showFilmPageLayout();
  }

  function ensureFullCabinet(cb) {
    if (_fullReady) {
      if (cb) cb();
      return;
    }
    if (_fullLoading) {
      document.addEventListener('mp:cabinet-full-ready', function onReady() {
        document.removeEventListener('mp:cabinet-full-ready', onReady);
        if (cb) cb();
      });
      return;
    }
    _fullLoading = true;
    global.__MP_FILM_ROUTE_LITE = true;
    var s = document.createElement('script');
    s.src = FULL_CABINET_SRC;
    s.defer = true;
    s.onload = function () {
      _fullReady = true;
      _fullLoading = false;
      global.__MP_CABINET_FULL = true;
      try {
        document.dispatchEvent(new CustomEvent('mp:cabinet-full-ready'));
      } catch (_e) {}
      if (cb) cb();
    };
    s.onerror = function () {
      _fullLoading = false;
      if (cb) cb();
    };
    document.body.appendChild(s);
  }

  function needsFullCabinet(el) {
    if (!el) return false;
    var section = el.getAttribute('data-section');
    if (section && section !== 'film') return true;
    var href = el.getAttribute('href');
    if (href && href !== '/' && href !== '/index.html' && !/^\/f\/\d+/.test(href)) return true;
    var action = el.getAttribute('data-action');
    if (action === 'login') return true;
    return false;
  }

  var GUEST_NAV_SECTIONS_LITE = {
    home: '/home',
    plans: '/plans',
    premieres: '/premieres',
    buzz: '/buzz',
    whattowatch: '/whattowatch',
  };

  function bindGuestCabinetNavLite() {
    document.addEventListener('click', function (e) {
      if (getToken()) return;
      var btn = e.target.closest('#cabinet-readonly .cabinet-nav-btn[data-section]');
      if (!btn) return;
      var sec = btn.getAttribute('data-section') || '';
      if (!sec || sec === 'film') return;
      var guestPath = GUEST_NAV_SECTIONS_LITE[sec];
      if (guestPath) {
        if (_fullReady) return;
        e.preventDefault();
        e.stopPropagation();
        ensureFullCabinet(function () {
          try { global.location.href = guestPath; } catch (_e) {}
        });
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (global.MpPublicFilmLogin) {
        global.MpPublicFilmLogin.open('');
      } else {
        ensureFullCabinet();
      }
    }, true);
  }

  function bindNavPrefetch() {
    bindGuestCabinetNavLite();
    document.addEventListener('click', function (e) {
      if (_fullReady) return;
      var el = e.target.closest('.cabinet-nav-btn, [data-section], #header-settings-btn, #header-inbox-btn, [data-action="login"]');
      if (!el || !needsFullCabinet(el)) return;
      if (el.closest('#section-film .film-page-toolbar')) return;
      ensureFullCabinet();
    }, true);
  }

  function scheduleIdleFullCabinet() {
    var run = function () { ensureFullCabinet(); };
    if ('requestIdleCallback' in global) {
      global.requestIdleCallback(run, { timeout: 12000 });
    } else {
      setTimeout(run, 5000);
    }
  }

  function init() {
    var kp = kpFromPath();
    if (!kp || !global.MpFilmPage) return;

    global.ensureFullCabinet = ensureFullCabinet;
    global.__MP_FILM_ROUTE_LITE_READY = true;
    showCabinetFilmShell();
    /* Do NOT load cabinet-app.js before first film paint — that caused triple blink. */
    scheduleIdleFullCabinet();

    if (global.MpPublicFilmLogin) {
      global.MpPublicFilmLogin.init({
        kpId: kp,
        onSuccess: function () {
          try {
            document.dispatchEvent(new CustomEvent('mp:film-refresh-auth'));
          } catch (_e) {}
          if (global.MpFilmPage && typeof global.MpFilmPage.refreshStandaloneAuthChrome === 'function') {
            try {
              global.MpFilmPage.refreshStandaloneAuthChrome({ kpId: kp, mainSelector: '#film-page-content' });
            } catch (_e2) {}
          }
          ensureFullCabinet(function () {
            if (typeof global.__mpScheduleContentPagePostAuthOffer === 'function') {
              global.__mpScheduleContentPagePostAuthOffer();
            }
          });
        },
      });
    }
    document.querySelectorAll('[data-action="login"]').forEach(function (btn) {
      if (btn.dataset.mpLiteLoginBound) return;
      btn.dataset.mpLiteLoginBound = '1';
      btn.addEventListener('click', function (e) {
        if (getToken()) return;
        e.preventDefault();
        if (global.MpPublicFilmLogin) {
          global.MpPublicFilmLogin.open('');
        } else {
          ensureFullCabinet();
        }
      });
    });

    document.addEventListener('mp:film-login-success', function () {
      if (getToken()) {
        setTimeout(function () { ensureFullCabinet(); }, 800);
      }
    });

    global._mpDismissLoginModal = function () {
      if (global.MpPublicFilmLogin && typeof global.MpPublicFilmLogin.hide === 'function') {
        global.MpPublicFilmLogin.hide();
        return;
      }
      if (global.MpPublicFilmLogin && typeof global.MpPublicFilmLogin.close === 'function') {
        global.MpPublicFilmLogin.close();
      }
    };

    global.MpFilmPage.bootstrap({
      kpId: kp,
      cabinetMode: true,
      onReady: function () {
        global.__MP_FILM_RENDERED = true;
        bindNavPrefetch();
        /* Authed: load full cabinet after first paint, not before. */
        if (getToken()) {
          setTimeout(function () { ensureFullCabinet(); }, 400);
        }
      },
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
