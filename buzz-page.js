/**
 * Public /buzz («Новости») — сетка как у премьер, пилюли как в планах.
 */
(function () {
  'use strict';

  var API_BASE = (typeof window.MP_API_BASE === 'string' && window.MP_API_BASE)
    ? window.MP_API_BASE.replace(/\/$/, '')
    : ((typeof window.location !== 'undefined' && window.location.origin) || 'https://movie-planner.ru');

  var KIND_LABELS = {
    studio: 'студия',
    blogger: 'блогер',
    culture: 'культура',
    media: 'медиа',
    festival: 'фестиваль',
    cinema: 'кинотеатр',
  };

  var PLACEHOLDER = '/images/film-poster-placeholder.png';
  var state = { days: 7, kind: '', sort: 'mentions', items: [], loaded: false };

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function kindBadge(kind) {
    var k = String(kind || 'blogger');
    return '<span class="buzz-kind">' + esc(KIND_LABELS[k] || k) + '</span>';
  }

  function posterUrl(item) {
    var p = String((item && item.poster) || '').trim();
    if (/^https?:\/\//i.test(p) || (p && p.charAt(0) === '/')) return p;
    return PLACEHOLDER;
  }

  /** One chip per channel; prefer deep-link to a post from that channel. */
  function sourceChipsHtml(item) {
    var posts = Array.isArray(item.post_urls) ? item.post_urls : [];
    var chans = Array.isArray(item.channels) ? item.channels : [];
    var chips = [];
    var seen = {};

    function chip(label, url) {
      return (
        '<a class="buzz-source-chip" href="' + esc(url) +
        '" target="_blank" rel="noopener nofollow" data-buzz-stop="1">' +
        esc(label) +
        '</a>'
      );
    }

    chans.forEach(function (c) {
      var u = String(c.username || '').trim();
      if (!u || seen[u.toLowerCase()]) return;
      seen[u.toLowerCase()] = 1;
      var post = '';
      for (var i = 0; i < posts.length; i++) {
        if (String(posts[i]).indexOf('t.me/' + u + '/') >= 0) {
          post = posts[i];
          break;
        }
      }
      chips.push(chip('@' + u, post || c.url || ('https://t.me/' + u)));
    });

    // orphan posts (no channel row)
    posts.forEach(function (pu) {
      var m = String(pu).match(/t\.me\/([A-Za-z0-9_]+)\/\d+/i);
      if (!m) return;
      var u = m[1];
      if (seen[u.toLowerCase()]) return;
      seen[u.toLowerCase()] = 1;
      chips.push(chip('@' + u, pu));
    });

    if (!chips.length) return '';
    // spaces between tags — fallback if CSS gap fails
    return '<div class="buzz-card-sources">' + chips.slice(0, 6).join(' ') + '</div>';
  }

  function renderItem(item) {
    var kid = item.kp_id;
    var title = item.title || ('film ' + kid);
    var n = item.mention_count || 0;
    var cc = item.channel_count || (item.channels || []).length;
    var kinds = Array.isArray(item.kinds) ? item.kinds : [];
    var badges = kinds.slice(0, 3).map(kindBadge).join('');
    var href = '/f/' + encodeURIComponent(kid);

    return (
      '<article class="buzz-tile" data-kp="' + esc(kid) + '">' +
        '<a class="buzz-tile-link" href="' + esc(href) + '">' +
          '<span class="buzz-tile-poster">' +
            '<img src="' + esc(posterUrl(item)) + '" alt="" loading="lazy" ' +
              'onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'">' +
          '</span>' +
          '<span class="buzz-tile-title">' + esc(title) + '</span>' +
          '<span class="buzz-tile-meta">' + n + ' упомин. · ' + cc + ' кан.</span>' +
          (badges ? '<span class="buzz-tile-kinds">' + badges + '</span>' : '') +
        '</a>' +
        sourceChipsHtml(item) +
      '</article>'
    );
  }

  function filterItems(items) {
    if (!state.kind) return items.slice();
    return items.filter(function (it) {
      if ((it.kinds || []).indexOf(state.kind) >= 0) return true;
      return (it.channels || []).some(function (c) { return c.channel_kind === state.kind; });
    });
  }

  function paint() {
    var grid = document.getElementById('buzz-grid');
    var empty = document.getElementById('buzz-empty');
    var loading = document.getElementById('buzz-loading');
    var err = document.getElementById('buzz-error');
    if (!grid) return;
    if (loading) loading.classList.add('hidden');
    if (err) err.classList.add('hidden');
    var list = filterItems(state.items);
    if (!list.length) {
      grid.innerHTML = '';
      if (empty) {
        empty.classList.remove('hidden');
        empty.textContent = state.loaded ? 'Пока нет упоминаний за выбранный период.' : '';
      }
      return;
    }
    if (empty) empty.classList.add('hidden');
    grid.innerHTML = list.map(renderItem).join('');
    grid.querySelectorAll('[data-buzz-stop]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.stopPropagation(); });
    });
  }

  function syncSortPills() {
    document.querySelectorAll('#buzz-sort-tabs [data-buzz-sort]').forEach(function (btn) {
      var on = btn.getAttribute('data-buzz-sort') === state.sort;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function load() {
    var loading = document.getElementById('buzz-loading');
    var err = document.getElementById('buzz-error');
    if (loading) loading.classList.remove('hidden');
    if (err) err.classList.add('hidden');
    var q = '/api/public/buzz?days=' + encodeURIComponent(state.days) +
      '&limit=40&sort=' + encodeURIComponent(state.sort);
    return fetch(API_BASE + q, { method: 'GET', mode: 'cors' })
      .then(function (r) {
        if (!r.ok) throw new Error('api_' + r.status);
        return r.json();
      })
      .then(function (d) {
        state.items = (d && d.items) || [];
        state.loaded = true;
        paint();
      })
      .catch(function () {
        state.loaded = true;
        state.items = [];
        if (loading) loading.classList.add('hidden');
        if (err) {
          err.classList.remove('hidden');
          err.textContent = 'Не удалось загрузить новости.';
        }
      });
  }

  function bindToolbar() {
    var root = document.getElementById('section-buzz');
    if (!root || root._mpBuzzBound) return;
    root._mpBuzzBound = true;

    var daysSel = document.getElementById('buzz-days');
    var kindSel = document.getElementById('buzz-kind');
    if (daysSel) {
      daysSel.addEventListener('change', function () {
        state.days = parseInt(daysSel.value, 10) || 7;
        load();
      });
    }
    if (kindSel) {
      kindSel.addEventListener('change', function () {
        state.kind = kindSel.value || '';
        paint();
      });
    }
    var tabs = document.getElementById('buzz-sort-tabs');
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-buzz-sort]');
        if (!btn || !tabs.contains(btn)) return;
        var sort = btn.getAttribute('data-buzz-sort') || 'mentions';
        if (sort === state.sort) return;
        state.sort = sort;
        syncSortPills();
        load();
      });
    }
    syncSortPills();
  }

  function boot() {
    bindToolbar();
    var sec = document.getElementById('section-buzz');
    var onBuzz = sec && !sec.classList.contains('hidden');
    var path = (location.pathname || '').replace(/\/$/, '');
    if (onBuzz || path === '/buzz') load();
  }

  window.mpBuzzPage = { load: load, boot: boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('mp:section-shown', function (ev) {
    if (ev && ev.detail && ev.detail.section === 'buzz') {
      bindToolbar();
      load();
    }
  });
})();
