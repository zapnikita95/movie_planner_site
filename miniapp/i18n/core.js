/** Shared web i18n (miniapp + site). */
(function (global) {
  "use strict";

  var STORAGE_KEY = "mp.ui_locale";
  var _locale = null;
  var _strings = { ru: {}, en: {} };

  function deviceLocale() {
    try {
      var loc = (navigator.language || "ru").toLowerCase();
      if (loc.indexOf("en") === 0) return "en";
    } catch (e) {}
    return "ru";
  }

  function normalize(raw) {
    var s = String(raw || "").toLowerCase();
    if (s === "en" || s.indexOf("en-") === 0) return "en";
    return "ru";
  }

  function getLocale() {
    if (_locale) return _locale;
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        _locale = normalize(stored);
        return _locale;
      }
    } catch (e) {}
    _locale = deviceLocale();
    return _locale;
  }

  function setLocale(loc) {
    _locale = normalize(loc);
    try {
      localStorage.setItem(STORAGE_KEY, _locale);
    } catch (e) {}
    try {
      document.documentElement.lang = _locale === "en" ? "en" : "ru";
    } catch (e2) {}
  }

  function registerCatalog(loc, map) {
    if (!map) return;
    _strings[normalize(loc)] = Object.assign(_strings[normalize(loc)] || {}, map);
  }

  function t(key, fallback) {
    var loc = getLocale();
    var bag = _strings[loc] || _strings.ru || {};
    if (bag[key] != null && String(bag[key]).length) return String(bag[key]);
    if (_strings.ru && _strings.ru[key] != null) return String(_strings.ru[key]);
    return fallback != null ? String(fallback) : key;
  }

  function localeHttpHeaders() {
    var loc = getLocale();
    return {
      "X-MP-Locale": loc,
      "Accept-Language": loc === "en" ? "en-US,en;q=0.9" : "ru-RU,ru;q=0.9",
    };
  }

  function applyFromSettings(uiLocale) {
    if (uiLocale) setLocale(uiLocale);
  }

  global.MP_I18N = {
    getLocale: getLocale,
    setLocale: setLocale,
    registerCatalog: registerCatalog,
    t: t,
    localeHttpHeaders: localeHttpHeaders,
    applyFromSettings: applyFromSettings,
  };
})(typeof window !== "undefined" ? window : globalThis);
