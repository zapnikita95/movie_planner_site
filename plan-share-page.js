/**
 * Публичная страница приглашения /p/<token> — шапка сайта, баннер приложения, кабинет для auth.
 */
(function (global) {
  'use strict';

  var SITE_BASE = (global.MpApiConfig && global.MpApiConfig.SITE_ORIGIN) || 'https://movie-planner.ru';
  var API_BASE = (global.MpApiConfig && global.MpApiConfig.API_ORIGIN) || SITE_BASE;
  var PENDING_KEY = 'mp_pending_plan_share';
  var chromeApi = null;

  function parseTokenFromPath() {
    var m = (global.location.pathname || '').match(/^\/p\/([^/?#]+)/);
    return m ? m[1] : '';
  }

  function mpToken() {
    try {
      var raw = localStorage.getItem('mp_site_sessions');
      var active = localStorage.getItem('mp_site_active_chat_id');
      if (raw) {
        var sessions = JSON.parse(raw);
        if (Array.isArray(sessions)) {
          for (var i = 0; i < sessions.length; i++) {
            var s = sessions[i];
            if (s && active && String(s.chat_id) === String(active) && s.token) return s.token;
          }
          if (sessions.length === 1 && sessions[0] && sessions[0].token) return sessions[0].token;
        }
      }
    } catch (_e) {}
    try {
      var leg = localStorage.getItem('mp_site_token');
      if (leg) return leg;
    } catch (_e2) {}
    return '';
  }

  function authHeaders(extra) {
    var h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    var t = mpToken();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  function loginUrl(token) {
    return SITE_BASE + '/?open_login=1&__spa=' + encodeURIComponent('/p/' + token);
  }

  function rememberPendingAccept(token) {
    try { sessionStorage.setItem(PENDING_KEY, String(token || '')); } catch (_e) {}
  }

  function clearPendingAccept(token) {
    try {
      var pending = sessionStorage.getItem(PENDING_KEY) || '';
      if (!token || pending === String(token)) sessionStorage.removeItem(PENDING_KEY);
    } catch (_e) {}
  }

  function postAccept(token) {
    var btn = document.getElementById('accept-plan-share');
    var status = document.getElementById('accept-status');
    if (btn) btn.disabled = true;
    return fetch(API_BASE + '/api/site/plan-share/' + encodeURIComponent(token) + '/accept', {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
      body: '{}',
    })
      .then(function (r) {
        if (r.ok) {
          clearPendingAccept(token);
          if (status) {
            status.textContent = 'Приглашение принято';
            status.style.display = 'block';
          }
          if (btn) btn.textContent = 'Готово';
          return null;
        }
        if (r.status === 401) {
          rememberPendingAccept(token);
          global.location.href = loginUrl(token);
          return null;
        }
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (status) {
            status.textContent = (d && (d.error || d.message)) || 'Не удалось принять. Попробуйте ещё раз.';
            status.style.display = 'block';
          }
          if (btn) btn.disabled = false;
        });
      })
      .catch(function () {
        if (status) {
          status.textContent = 'Ошибка сети';
          status.style.display = 'block';
        }
        if (btn) btn.disabled = false;
      });
  }

  function consumePendingAccept(token) {
    try {
      var pending = sessionStorage.getItem(PENDING_KEY) || '';
      if (!pending || pending !== String(token) || !mpToken()) return;
    } catch (_e) {
      return;
    }
    postAccept(token);
  }

  function bindAccept(token) {
    var btn = document.getElementById('accept-plan-share');
    if (!btn || btn._mpBound) return;
    btn._mpBound = true;
    btn.addEventListener('click', function () {
      if (!mpToken()) {
        rememberPendingAccept(token);
        if (chromeApi && chromeApi.loginNow) {
          chromeApi.loginNow();
          return;
        }
        global.location.href = loginUrl(token);
        return;
      }
      postAccept(token);
    });
  }

  function mountAppBanner(token) {
    if (!global.MpAppOpenBanner) return;
    var shell = document.querySelector('.page-shell');
    var header = document.getElementById('site-header');
    if (shell && header && !document.getElementById('app-open-banner')) {
      header.insertAdjacentHTML('afterend', MpAppOpenBanner.appOpenBannerHtml());
    }
    MpAppOpenBanner.setupAppOpenBanner({ kind: 'plan-share', id: token });
  }

  function initStandaloneChrome(token) {
    var chromeOpts = {
      apiBase: API_BASE,
      mainSelector: 'main.plan-share-page',
      spaReturnPath: '/p/' + token,
      onLoginSuccess: function () {
        refreshAuthChrome(token);
        bindAccept(token);
        consumePendingAccept(token);
      },
    };
    if (global.MpFilmPage && MpFilmPage.initStandaloneSiteChrome) {
      chromeApi = MpFilmPage.initStandaloneSiteChrome(chromeOpts);
    } else {
      var loginBtn = document.querySelector('[data-action="login"]') || document.getElementById('login-btn');
      if (loginBtn) {
        loginBtn.addEventListener('click', function () {
          rememberPendingAccept(token);
          global.location.href = loginUrl(token);
        });
      }
    }
    refreshAuthChrome(token);
  }

  function refreshAuthChrome(token) {
    if (!global.MpFilmPage || !MpFilmPage.refreshStandaloneAuthChrome) return;
    MpFilmPage.refreshStandaloneAuthChrome({
      apiBase: API_BASE,
      mainSelector: 'main.plan-share-page',
      spaReturnPath: '/p/' + token,
    });
  }

  function bindOpenLinks(token) {
    var mini = document.getElementById('open-plan-miniapp');
    if (mini) {
      mini.addEventListener('click', function (e) {
        if (global.MpOpenTelegramLink) {
          e.preventDefault();
          MpOpenTelegramLink(mini.href);
        }
      });
    }
    var nat = document.getElementById('open-plan-native');
    if (nat && global.MpAppOpenBanner && MpAppOpenBanner.tryOpenNativeApp) {
      nat.addEventListener('click', function () {
        MpAppOpenBanner.tryOpenNativeApp({ kind: 'plan-share', id: token });
      });
    }
  }

  function init(opts) {
    opts = opts || {};
    var token = opts.token || parseTokenFromPath();
    if (!token) return;
    try {
      document.body.classList.add('plan-share-standalone-page', 'film-standalone-page');
    } catch (_e) {}
    mountAppBanner(token);
    initStandaloneChrome(token);
    bindAccept(token);
    bindOpenLinks(token);
    if (mpToken()) consumePendingAccept(token);
  }

  global.MpPlanSharePage = { init: init };
})(typeof window !== 'undefined' ? window : this);
