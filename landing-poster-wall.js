(function (global) {
  'use strict';

  var WALL_CELLS = 720;
  var STORAGE_KEY = 'mp_landing_wall_v1';
  var API_PATH = '/api/public/landing-poster-wall';

  function isGuestHome() {
    try {
      var p = (global.location.pathname || '/').replace(/\/$/, '') || '/';
      if (p === '/index.html') p = '/';
      if (p !== '/') return false;
      var active = global.localStorage.getItem('mp_site_active_chat_id');
      var sessions = JSON.parse(global.localStorage.getItem('mp_site_sessions') || '[]');
      if (Array.isArray(sessions)) {
        for (var i = 0; i < sessions.length; i++) {
          if (String(sessions[i].chat_id) === String(active) && sessions[i].token) return false;
        }
        for (var j = 0; j < sessions.length; j++) {
          if (sessions[j] && sessions[j].token) return false;
        }
      }
      return !global.localStorage.getItem('mp_site_token');
    } catch (_e) {
      return false;
    }
  }

  function expandWallUrls(pool, target) {
    if (!pool || !pool.length) return [];
    var out = [];
    var n = pool.length;
    var step = Math.max(1, Math.floor(n / 17));
    for (var i = 0; i < target; i++) {
      out.push(pool[(i * step + (i % n)) % n]);
    }
    return out;
  }

  function readCache() {
    try {
      var raw = global.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.posters) || !data.posters.length) return null;
      return data;
    } catch (_e) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_e) {}
  }

  function paintGrid(grid, urls) {
    if (!grid || !urls || !urls.length) return;
    var cells = expandWallUrls(urls, WALL_CELLS);
    var html = '';
    for (var i = 0; i < cells.length; i++) {
      var u = String(cells[i] || '').replace(/\\/g, '/').replace(/'/g, '%27');
      if (!u) continue;
      html += '<div class="landing-poster-wall-p" style="background-image:url(\'' + u + '\')"></div>';
    }
    grid.innerHTML = html;
  }

  function applyPayload(grid, payload) {
    if (!payload || !payload.success || !payload.posters || !payload.posters.length) return;
    var cached = readCache();
    if (cached && cached.updated_at === payload.updated_at && cached.posters) {
      paintGrid(grid, cached.posters);
      return;
    }
    writeCache({ posters: payload.posters, updated_at: payload.updated_at || '' });
    paintGrid(grid, payload.posters);
  }

  function boot() {
    if (!isGuestHome()) return;
    var grid = global.document.getElementById('landing-poster-wall-grid');
    if (!grid) return;

    var cached = readCache();
    if (cached && cached.posters) {
      paintGrid(grid, cached.posters);
    }

    var origin = (global.location && global.location.origin) || '';
    fetch(origin + API_PATH, { credentials: 'same-origin', cache: 'default' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data) applyPayload(grid, data);
      })
      .catch(function () {});
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
