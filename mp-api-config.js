/**
 * Prod: страницы на movie-planner.ru.
 *
 * В РФ у части провайдеров/сетей `api.movie-planner.ru` может быть недоступен без VPN,
 * из-за чего ломается авторизованный кабинет (все XHR/fetch туда).
 *
 * Поэтому по умолчанию используем same-origin API на `movie-planner.ru` (Railway),
 * а не отдельный `api.*` хост.
 * OAuth стартует с SITE_ORIGIN — api.* не попадает в адресную строку при обычном входе.
 */
(function (global) {
  'use strict';

  var PROD_SITE = 'https://movie-planner.ru';
  var PROD_API = 'https://movie-planner.ru';

  function siteOrigin() {
    try {
      var loc = global.location;
      var h = (loc && loc.hostname) || '';
      if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') {
        return loc.protocol + '//' + h;
      }
      if (h === 'localhost' || h === '127.0.0.1') {
        return loc.protocol + '//' + loc.host;
      }
    } catch (_e) {}
    return PROD_SITE;
  }

  function apiOrigin(site) {
    var s = site || siteOrigin();
    if (s.indexOf('movie-planner.ru') >= 0) return PROD_API;
    return s;
  }

  var site = siteOrigin();
  var api = apiOrigin(site);

  function withFilmOutboundUtm(url, opts) {
    opts = opts || {};
    var raw = String(url || '').trim();
    if (!/^https?:\/\//i.test(raw)) return raw;
    try {
      var u = new URL(raw);
      if (!u.searchParams.get('utm_source')) u.searchParams.set('utm_source', 'movie_planner');
      var medium = opts.medium || 'film_reviews';
      if (!u.searchParams.get('utm_medium')) u.searchParams.set('utm_medium', medium);
      if (!u.searchParams.get('utm_campaign')) u.searchParams.set('utm_campaign', 'news');
      var content = String(opts.channel || 'youtube').replace(/[^\w.\-@]+/g, '_').slice(0, 80);
      if (content && !u.searchParams.get('utm_content')) u.searchParams.set('utm_content', content);
      var termParts = [opts.platform || '', opts.kpId || '', opts.view || medium].filter(Boolean);
      var term = termParts.join('_').slice(0, 80);
      if (term && !u.searchParams.get('utm_term')) u.searchParams.set('utm_term', term);
      return u.toString();
    } catch (_e) {
      return raw;
    }
  }

  function trackFilmOutbound(meta) {
    meta = meta || {};
    try {
      if (typeof global.ym === 'function') {
        global.ym(110038199, 'reachGoal', 'buzz_outbound', {
          platform: meta.platform || '',
          channel: meta.channel || '',
          kp_id: meta.kpId || meta.kp_id || '',
          view: meta.view || '',
        });
      }
    } catch (_e) {}
  }

  function bindFilmOutboundLinks(root, kpId) {
    if (!root) return;
    var kp = String(kpId || '').trim();
    root.querySelectorAll('a[data-review-out]').forEach(function (a) {
      if (a.getAttribute('data-review-out-bound') === '1') return;
      a.setAttribute('data-review-out-bound', '1');
      a.addEventListener('click', function () {
        var view = a.getAttribute('data-review-view') || '';
        if (!view) {
          if (a.closest('.film-buzz-block')) view = 'film_buzz';
          else if (String(a.getAttribute('data-review-platform') || '').toLowerCase() === 'telegram') view = 'film_social';
          else view = 'film_reviews';
        }
        trackFilmOutbound({
          platform: a.getAttribute('data-review-platform') || 'youtube',
          channel: a.getAttribute('data-review-channel') || '',
          kpId: kp,
          view: view,
        });
      });
    });
  }

  var _monetizationPromise = null;

  function monetizationAssetV() {
    try {
      if (global.__MP_ASSET_V) return String(global.__MP_ASSET_V);
    } catch (_e) {}
    return '20260911tickets1';
  }

  function ensureMpMonetization() {
    if (global.MpMonetization && typeof global.MpMonetization.initFilmPageFromRoot === 'function') {
      return Promise.resolve(global.MpMonetization);
    }
    if (_monetizationPromise) return _monetizationPromise;
    _monetizationPromise = new Promise(function (resolve) {
      function ready() {
        return global.MpMonetization && typeof global.MpMonetization.initFilmPageFromRoot === 'function';
      }
      function waitReady(tries) {
        if (ready()) {
          resolve(global.MpMonetization);
          return;
        }
        if (tries <= 0) {
          _monetizationPromise = null;
          resolve(null);
          return;
        }
        setTimeout(function () { waitReady(tries - 1); }, 50);
      }
      var existing = null;
      try {
        existing = document.querySelector('script[src*="mp-monetization.js"]');
      } catch (_q) {}
      if (existing) {
        waitReady(80);
        return;
      }
      var s = document.createElement('script');
      s.src = '/mp-monetization.js?v=' + encodeURIComponent(monetizationAssetV());
      s.async = true;
      s.onload = function () { waitReady(20); };
      s.onerror = function () {
        _monetizationPromise = null;
        resolve(null);
      };
      (document.body || document.head).appendChild(s);
    });
    return _monetizationPromise;
  }

  function initFilmMonetization(root, kpId) {
    return ensureMpMonetization().then(function (api) {
      if (!api || typeof api.initFilmPageFromRoot !== 'function') return null;
      try {
        api.initFilmPageFromRoot(root, kpId);
      } catch (_e) {}
      return api;
    });
  }

  global.MpApiConfig = {
    SITE_ORIGIN: site,
    API_ORIGIN: api,
    apiBase: function () {
      return api;
    },
    siteBase: function () {
      return site;
    },
    ensureMpMonetization: ensureMpMonetization,
    initFilmMonetization: initFilmMonetization,
  };

  global.MpFilmOutbound = {
    withUtm: withFilmOutboundUtm,
    track: trackFilmOutbound,
    bind: bindFilmOutboundLinks,
  };

  global.MpAdultMedia = {
    isSensitive: function (item) {
      if (!item) return false;
      if (item.media_sensitive) return true;
      var g = String(item.genres || '').toLowerCase();
      return g.indexOf('для взрослых') >= 0;
    },
    posterClass: function (item) {
      return global.MpAdultMedia.isSensitive(item) ? ' mp-media-sensitive' : '';
    },
  };
})(typeof window !== 'undefined' ? window : this);
