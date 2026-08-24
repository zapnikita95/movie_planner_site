/**
 * Maintenance when Railway is down — Reg.ru + GitHub Pages apex, NO Cloudflare.
 *
 * - Apex on Railway and /health/live OK → ничего не делаем.
 * - Apex на GitHub Pages, бэкенд жив → редирект на www.movie-planner.ru.
 * - Бэкенд мёртв → /maintenance.html (статика на GitHub, всегда доступна).
 */
(function () {
  'use strict';

  var path = (location.pathname || '').split('?')[0].replace(/\/$/, '') || '/';
  if (/^\/maintenance(\.html)?$/i.test(path)) return;

  var REMOTE_HEALTH = [
    'https://www.movie-planner.ru/health/live',
    'https://api.movie-planner.ru/health/live',
    'https://web-production-3921c.up.railway.app/health/live',
  ];
  var APP_WWW = 'https://www.movie-planner.ru';
  var TIMEOUT_MS = 5000;

  function probe(url) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        resolve(!!ok);
      }
      var timer = setTimeout(function () { finish(false); }, TIMEOUT_MS);
      var ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        signal: ac ? ac.signal : undefined,
        headers: { Accept: 'application/json' },
      })
        .then(function (res) {
          clearTimeout(timer);
          finish(res && res.ok);
        })
        .catch(function () {
          clearTimeout(timer);
          finish(false);
        });
    });
  }

  function anyHealthy(urls) {
    var i = 0;
    function next() {
      if (i >= urls.length) return Promise.resolve(false);
      return probe(urls[i++]).then(function (ok) { return ok || next(); });
    }
    return next();
  }

  function goMaintenance() {
    if (/^\/maintenance(\.html)?$/i.test(path)) return;
    location.replace('/maintenance.html' + (location.search || '') + (location.hash || ''));
  }

  function goWww() {
    if (location.hostname === 'www.movie-planner.ru') return;
    location.replace(
      APP_WWW + (location.pathname || '/') + (location.search || '') + (location.hash || '')
    );
  }

  probe(location.origin + '/health/live').then(function (sameOriginOk) {
    if (sameOriginOk) return;

    anyHealthy(REMOTE_HEALTH).then(function (remoteOk) {
      if (remoteOk) goWww();
      else goMaintenance();
    });
  });
})();
