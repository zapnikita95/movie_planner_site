/**
 * Site i18n bootstrap — shared MP_I18N (miniapp catalogs) + DOM apply + locale toggle.
 */
(function (global) {
  'use strict';

  function t(key, fallback) {
    if (global.MP_I18N && typeof global.MP_I18N.t === 'function') {
      return global.MP_I18N.t(key, fallback);
    }
    return fallback != null ? String(fallback) : String(key);
  }

  function currentLocale() {
    return global.MP_I18N && global.MP_I18N.getLocale ? global.MP_I18N.getLocale() : 'ru';
  }

  function localeHeaders() {
    if (global.MP_I18N && global.MP_I18N.localeHttpHeaders) {
      return global.MP_I18N.localeHttpHeaders();
    }
    return {};
  }

  function mergeFetchInit(init) {
    var opts = init || {};
    var headers = Object.assign({}, localeHeaders(), opts.headers || {});
    return Object.assign({}, opts, { headers: headers });
  }

  function updateMetaLocale(loc) {
    try {
      document.documentElement.lang = loc === 'en' ? 'en' : 'ru';
    } catch (_e) {}
    var og = document.querySelector('meta[property="og:locale"]');
    if (og) og.setAttribute('content', loc === 'en' ? 'en_US' : 'ru_RU');
  }

  function updateLangToggle() {
    var btn = document.getElementById('mp-lang-toggle');
    if (!btn) return;
    var loc = currentLocale();
    btn.textContent = loc === 'en' ? '\uD83C\uDDEC\uD83C\uDDE7' : '\uD83C\uDDF7\uD83C\uDDFA';
    var label = loc === 'en' ? t('settings.languageEn', 'English') : t('settings.languageRu', 'Russian');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }

  function applyDom(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (!key) return;
      var val = t(key, el.getAttribute('data-i18n-fallback') || el.textContent);
      if (el.getAttribute('data-i18n-html') === '1') el.innerHTML = val;
      else el.textContent = val;
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var pk = el.getAttribute('data-i18n-placeholder');
      if (pk) el.placeholder = t(pk, el.placeholder || '');
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var ak = el.getAttribute('data-i18n-aria');
      if (ak) el.setAttribute('aria-label', t(ak, el.getAttribute('aria-label') || ''));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var tk = el.getAttribute('data-i18n-title');
      if (tk) el.title = t(tk, el.title || '');
    });
    updateLangToggle();
    updateMetaLocale(currentLocale());
  }

  function dispatchLocaleChanged(loc) {
    try {
      global.dispatchEvent(new CustomEvent('mp:locale-changed', { detail: { locale: loc } }));
    } catch (_e) {}
  }

  function persistLocale(loc, apiFn) {
    var normalized = loc === 'en' ? 'en' : 'ru';
    if (global.MP_I18N && global.MP_I18N.setLocale) global.MP_I18N.setLocale(normalized);
    applyDom();
    dispatchLocaleChanged(normalized);
    if (typeof apiFn === 'function') {
      apiFn('/api/miniapp/settings', {
        method: 'POST',
        body: JSON.stringify({ ui_locale: normalized }),
      }).catch(function () {});
    }
  }

  function bindLangToggle(apiFn) {
    var btn = document.getElementById('mp-lang-toggle');
    if (!btn || btn._mpI18nBound) return;
    btn._mpI18nBound = true;
    btn.addEventListener('click', function () {
      var next = currentLocale() === 'en' ? 'ru' : 'en';
      persistLocale(next, apiFn);
    });
  }

  function syncFromSettings(apiFn) {
    if (typeof apiFn !== 'function') return;
    apiFn('/api/miniapp/settings')
      .then(function (res) {
        if (res && res.ui_locale && global.MP_I18N && global.MP_I18N.applyFromSettings) {
          global.MP_I18N.applyFromSettings(res.ui_locale);
          applyDom();
          dispatchLocaleChanged(currentLocale());
        }
      })
      .catch(function () {});
  }

  function bootstrap(apiFn) {
    if (global.MP_I18N && global.MP_I18N.getLocale) {
      updateMetaLocale(global.MP_I18N.getLocale());
    }
    applyDom();
    bindLangToggle(apiFn);
  }

  global.SiteI18n = {
    t: t,
    applyDom: applyDom,
    bootstrap: bootstrap,
    persistLocale: persistLocale,
    syncFromSettings: syncFromSettings,
    localeHeaders: localeHeaders,
    currentLocale: currentLocale,
    mergeFetchInit: mergeFetchInit,
  };
  global.siteT = t;
})(typeof window !== 'undefined' ? window : globalThis);
