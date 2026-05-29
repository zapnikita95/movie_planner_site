/**
 * Баннер «Открыть в приложении» для standalone /f/, /s/, /u/ и кабинета.
 */
(function (global) {
  'use strict';

  var API_BASE = (function () {
    try {
      var loc = global.location;
      var h = loc.hostname || '';
      if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') return loc.protocol + '//' + h;
    } catch (_e) {}
    return 'https://movie-planner.ru';
  })();

  var MP_APP_STORE_URL_IOS = '';
  var MP_APP_STORE_URL_ANDROID = '';
  var MP_ANDROID_APP_PACKAGE = 'com.movie_planner';
  var MP_PLAY_STORE_FALLBACK = 'https://play.google.com/store/apps/details?id=com.movie_planner';
  var _releaseLoadPromise = null;

  function normalizeKind(kind) {
    var k = String(kind || 'film').toLowerCase();
    if (k === 'person' || k === 'staff') return 'person';
    if (k === 'user' || k === 'friends' || k === 'profile') return 'user';
    return 'film';
  }

  function deepLinkFor(kind, entityId) {
    var id = String(entityId || '').replace(/\D/g, '');
    if (!id) return '';
    if (kind === 'person') return 'movieplanner://s/' + id;
    if (kind === 'user') return 'movieplanner://friends/' + id;
    return 'movieplanner://film/' + id;
  }

  function intentPathFor(kind, entityId) {
    var id = String(entityId || '').replace(/\D/g, '');
    if (!id) return '';
    if (kind === 'person') return 's/' + id;
    if (kind === 'user') return 'friends/' + id;
    return 'film/' + id;
  }

  function pickAndroidStoreUrl() {
    var u = String(MP_APP_STORE_URL_ANDROID || '').trim();
    if (u && (u.indexOf('play.google.com') >= 0 || u.indexOf('rustore.ru') >= 0)) return u;
    return MP_PLAY_STORE_FALLBACK;
  }

  function ensureAppReleaseUrlsLoaded() {
    if (_releaseLoadPromise) return _releaseLoadPromise;
    _releaseLoadPromise = fetch(API_BASE + '/api/app/release', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rel) {
        if (!rel) return;
        var android = String(rel.url || '').trim();
        if (android) MP_APP_STORE_URL_ANDROID = android;
        var ios = rel.ios && rel.ios.url ? String(rel.ios.url).trim() : '';
        if (ios) MP_APP_STORE_URL_IOS = ios;
      })
      .catch(function () {})
      .then(function () { return { android: MP_APP_STORE_URL_ANDROID, ios: MP_APP_STORE_URL_IOS }; });
    return _releaseLoadPromise;
  }

  function appOpenBannerHtml() {
    return (
      '<div id="app-open-banner" class="app-open-banner hidden">' +
        '<span class="app-open-text">Открыть в приложении Movie Planner?</span>' +
        '<div class="app-open-actions">' +
          '<button type="button" class="btn-app-open" id="app-open-btn">Открыть</button>' +
          '<button type="button" class="btn-app-dismiss" id="app-dismiss-btn">Позже</button>' +
        '</div>' +
      '</div>'
    );
  }

  function tryOpenNativeApp(opts) {
    opts = opts || {};
    var entityId = String(opts.id || opts.kpId || '').replace(/\D/g, '');
    var kind = normalizeKind(opts.kind);
    if (!entityId) return;
    var ua = navigator.userAgent || '';
    var isAndroid = /Android/i.test(ua);
    var isIOS = /iPhone|iPad|iPod/i.test(ua);
    if (!isAndroid && !isIOS) return;

    var deepLink = deepLinkFor(kind, entityId);
    var intentPath = intentPathFor(kind, entityId);
    var storeUrl = isAndroid ? pickAndroidStoreUrl() : String(MP_APP_STORE_URL_IOS || '').trim();
    var opened = false;
    var fallbackTimer = null;

    function cleanup() {
      document.removeEventListener('visibilitychange', onPageHide);
      window.removeEventListener('pagehide', onPageHide);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    }

    function onPageHide() {
      if (document.hidden) {
        opened = true;
        cleanup();
      }
    }

    function onFallback() {
      if (opened || document.hidden) {
        cleanup();
        return;
      }
      cleanup();
      if (storeUrl) window.location.href = storeUrl;
    }

    document.addEventListener('visibilitychange', onPageHide);
    window.addEventListener('pagehide', onPageHide);
    fallbackTimer = setTimeout(onFallback, 2200);

    if (isAndroid) {
      var intent = 'intent://' + intentPath
        + '#Intent;scheme=movieplanner;package=' + encodeURIComponent(MP_ANDROID_APP_PACKAGE) + ';';
      if (storeUrl) intent += 'S.browser_fallback_url=' + encodeURIComponent(storeUrl) + ';';
      intent += 'end';
      window.location.href = intent;
      return;
    }

    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.src = deepLink;
    document.body.appendChild(iframe);
    setTimeout(function () {
      try { iframe.remove(); } catch (_e) {}
    }, 1800);
    setTimeout(function () {
      if (!opened && !document.hidden) window.location.href = deepLink;
    }, 120);
  }

  function setupAppOpenBanner(opts) {
    opts = opts || {};
    var entityId = String(opts.id || opts.kpId || '').replace(/\D/g, '');
    var kind = normalizeKind(opts.kind);
    if (!entityId) return;

    ensureAppReleaseUrlsLoaded().then(function () {
      var banner = document.getElementById('app-open-banner');
      if (!banner) return;
      var dismissed = false;
      try { dismissed = sessionStorage.getItem('mp_app_banner_dismiss') === '1'; } catch (_e) {}
      var ua = navigator.userAgent || '';
      var isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
      if (!isMobile || dismissed) return;
      banner.classList.remove('hidden');

      var openBtn = document.getElementById('app-open-btn');
      var dismissBtn = document.getElementById('app-dismiss-btn');
      banner.setAttribute('data-app-open-id', entityId);
      banner.setAttribute('data-app-open-kind', kind);

      function dismissBanner() {
        try { sessionStorage.setItem('mp_app_banner_dismiss', '1'); } catch (_e) {}
        banner.classList.add('hidden');
      }

      if (openBtn) {
        openBtn.onclick = function () {
          var id = banner.getAttribute('data-app-open-id') || entityId;
          var k = banner.getAttribute('data-app-open-kind') || kind;
          tryOpenNativeApp({ id: id, kind: k });
        };
      }
      if (dismissBtn) {
        dismissBtn.onclick = dismissBanner;
      }
    });
  }

  function mountAppOpenBannerBefore(targetEl, opts) {
    if (!targetEl) return;
    var existing = document.getElementById('app-open-banner');
    if (!existing) {
      targetEl.insertAdjacentHTML('beforebegin', appOpenBannerHtml());
    }
    setupAppOpenBanner(opts);
  }

  global.MpAppOpenBanner = {
    appOpenBannerHtml: appOpenBannerHtml,
    setupAppOpenBanner: setupAppOpenBanner,
    mountAppOpenBannerBefore: mountAppOpenBannerBefore,
    tryOpenNativeApp: tryOpenNativeApp,
    ensureAppReleaseUrlsLoaded: ensureAppReleaseUrlsLoaded,
  };
})(typeof window !== 'undefined' ? window : this);
