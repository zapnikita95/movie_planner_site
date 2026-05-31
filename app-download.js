/**
 * Ссылки на установку Movie Planner: iOS → App Store, Android → APK.
 * На лендинге iPhone сразу уходит в App Store; в профиле — выбор платформы.
 */
(function (global) {
  'use strict';

  var MP_IOS_APP_STORE = 'https://apps.apple.com/ru/app/movie-planner/id6769016073';
  var _release = null;
  var _releasePromise = null;

  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }

  function isPublicIosUrl(url) {
    var u = String(url || '').toLowerCase();
    return u.indexOf('apps.apple.com') >= 0 || u.indexOf('itunes.apple.com') >= 0 || u.indexOf('testflight.apple.com') >= 0;
  }

  function iosUrl() {
    var rel = _release && _release.ios;
    if (rel && rel.url && isPublicIosUrl(rel.url)) return rel.url;
    return MP_IOS_APP_STORE;
  }

  function androidUrl() {
    if (_release && _release.url) return _release.url;
    try {
      var h = global.location.hostname || '';
      if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') return global.location.protocol + '//' + h + '/download';
    } catch (_e) {}
    return 'https://movie-planner.ru/download';
  }

  function loadRelease() {
    if (_releasePromise) return _releasePromise;
    var base = (function () {
      try {
        var h = global.location.hostname || '';
        if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') return global.location.protocol + '//' + h;
      } catch (_e2) {}
      return 'https://movie-planner.ru';
    })();
    _releasePromise = fetch(base + '/api/app/release', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rel) {
        if (rel) _release = rel;
        return _release;
      })
      .catch(function () { return _release; });
    return _releasePromise;
  }

  function openUrl(url) {
    if (!url) return;
    try { global.open(url, '_blank', 'noopener'); } catch (_e) { global.location.href = url; }
  }

  function platformPickerHtml(androidVer, iosVer) {
    return (
      '<div class="mp-platform-grid">' +
        '<button type="button" class="mp-platform-card" data-mp-dl="android">' +
          '<span class="mp-platform-icon" aria-hidden="true">🤖</span>' +
          '<span class="mp-platform-body">' +
            '<span class="mp-platform-label">Android</span>' +
            '<span class="mp-platform-hint">' + androidVer + '</span>' +
          '</span>' +
        '</button>' +
        '<button type="button" class="mp-platform-card mp-platform-card--ios" data-mp-dl="ios">' +
          '<span class="mp-platform-icon" aria-hidden="true">🍎</span>' +
          '<span class="mp-platform-body">' +
            '<span class="mp-platform-label">iPhone</span>' +
            '<span class="mp-platform-hint">' + iosVer + '</span>' +
          '</span>' +
        '</button>' +
      '</div>'
    );
  }

  function versionLabel(raw, fallback) {
    if (!raw) return fallback;
    var s = String(raw).split('+')[0];
    return s.indexOf('v') === 0 ? s : 'v' + s;
  }

  function showPlatformPicker() {
    return loadRelease().then(function () {
      var androidVer = versionLabel(_release && _release.version_semver, versionLabel(_release && _release.version, 'APK'));
      var iosRaw = _release && _release.ios && (_release.ios.version_semver || _release.ios.version);
      var iosVer = versionLabel(iosRaw, 'App Store');
      var backdrop = document.createElement('div');
      backdrop.className = 'mp-dl-sheet-backdrop';
      backdrop.innerHTML =
        '<div class="mp-dl-sheet" role="dialog" aria-labelledby="mp-dl-sheet-title">' +
          '<div class="mp-dl-sheet-title" id="mp-dl-sheet-title">Скачать приложение</div>' +
          platformPickerHtml(androidVer, iosVer) +
          '<button type="button" class="mp-dl-sheet-cancel">Отмена</button>' +
        '</div>';
      document.body.appendChild(backdrop);
      function close() {
        try { backdrop.remove(); } catch (_e) {}
      }
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) close();
      });
      backdrop.querySelector('.mp-dl-sheet-cancel').addEventListener('click', close);
      backdrop.querySelector('[data-mp-dl="android"]').addEventListener('click', function () {
        close();
        openUrl(androidUrl());
      });
      backdrop.querySelector('[data-mp-dl="ios"]').addEventListener('click', function () {
        close();
        openUrl(iosUrl());
      });
    });
  }

  function wireInstallLinks() {
    loadRelease().then(function () {
      var ios = isIOS();
      var store = iosUrl();
      var apk = androidUrl();
      document.querySelectorAll('a[href="/download"], a.mp-app-download').forEach(function (a) {
        if (ios) {
          a.setAttribute('href', store);
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener');
          if (/скачать\s+для\s+android/i.test(a.textContent || '')) {
            a.textContent = 'Скачать для iPhone';
          }
        } else if (!a.getAttribute('href') || a.getAttribute('href') === '/download') {
          a.setAttribute('href', apk);
        }
      });
      var footerIos = document.getElementById('cabinet-footer-ios');
      if (footerIos) {
        footerIos.href = store;
        footerIos.classList.remove('hidden');
      }
    });
  }

  function bindProfileDownloadButton(btn) {
    if (!btn || btn.getAttribute('data-mp-dl-bound') === '1') return;
    btn.setAttribute('data-mp-dl-bound', '1');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      showPlatformPicker();
    });
  }

  global.MpAppDownload = {
    isIOS: isIOS,
    iosUrl: iosUrl,
    androidUrl: androidUrl,
    loadRelease: loadRelease,
    showPlatformPicker: showPlatformPicker,
    wireInstallLinks: wireInstallLinks,
    bindProfileDownloadButton: bindProfileDownloadButton,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireInstallLinks);
  } else {
    wireInstallLinks();
  }
})(typeof window !== 'undefined' ? window : this);
