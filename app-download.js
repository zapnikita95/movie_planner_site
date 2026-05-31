/**
 * Ссылки на установку Movie Planner: iOS → App Store, Android → APK.
 * На лендинге iPhone сразу уходит в App Store; в профиле — выбор платформы.
 */
(function (global) {
  'use strict';

  var MP_IOS_APP_STORE = 'https://apps.apple.com/ru/app/movie-planner/id6769016073';
  var _release = null;
  var _releasePromise = null;

  var MP_ICON_ANDROID_SVG =
    '<svg class="mp-platform-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path fill="#3DDC84" d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84a1.25 1.25 0 0 0-2.06-1.03l-.05.07A9.017 9.017 0 0 0 12 2c-1.83 0-3.46.47-4.91 1.3l-.04-.07a1.25 1.25 0 1 0-2.07 1.04L5.52 5.7A10.9 10.9 0 0 0 1 13h22a10.9 10.9 0 0 0-4.52-7.3l1.05-1.54z"/>' +
    '</svg>';
  var MP_ICON_APPLE_SVG =
    '<svg class="mp-platform-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>' +
    '</svg>';

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
          '<span class="mp-platform-icon mp-platform-icon--android" aria-hidden="true">' + MP_ICON_ANDROID_SVG + '</span>' +
          '<span class="mp-platform-body">' +
            '<span class="mp-platform-label">Android</span>' +
            '<span class="mp-platform-hint">' + androidVer + '</span>' +
          '</span>' +
        '</button>' +
        '<button type="button" class="mp-platform-card mp-platform-card--ios" data-mp-dl="ios">' +
          '<span class="mp-platform-icon mp-platform-icon--apple" aria-hidden="true">' + MP_ICON_APPLE_SVG + '</span>' +
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
