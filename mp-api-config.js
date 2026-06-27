/**
 * Prod: страницы на movie-planner.ru, XHR/fetch на api.movie-planner.ru (AMS edge).
 * OAuth стартует с SITE_ORIGIN — api.* не попадает в адресную строку при обычном входе.
 */
(function (global) {
  'use strict';

  var PROD_SITE = 'https://movie-planner.ru';
  var PROD_API = 'https://api.movie-planner.ru';

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

  global.MpApiConfig = {
    SITE_ORIGIN: site,
    API_ORIGIN: api,
    apiBase: function () {
      return api;
    },
    siteBase: function () {
      return site;
    },
  };
})(typeof window !== 'undefined' ? window : this);
