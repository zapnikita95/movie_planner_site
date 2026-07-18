/**
 * Public /buzz («Новости») — films discussed in cinema Telegram channels.
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
    var label = KIND_LABELS[k] || k;
    return '<span class="buzz-kind buzz-kind--' + esc(k) + '">' + esc(label) + '</span>';
  }

  function posterUrl(item) {
    var p = String((item && item.poster) || '').trim();
    if (/^https?:\/\//i.test(p) || (p && p.charAt(0) === '/')) return p;
    return PLACEHOLDER;
  }

  function renderItem(item) {
    var kid = item.kp_id;
    var title = item.title || ('film ' + kid);
    var n = item.mention_count || 0;
    var cc = item.channel_count || (item.channels || []).length;
    var posts = Array.isArray(item.post_urls) ? item.post_urls : [];
    var chans = Array.isArray(item.channels) ? item.channels : [];
    var kinds = Array.isArray(item.kinds) ? item.kinds : [];
    var badges = kinds.slice(0, 3).map(kindBadge).join('');
    var href = '/f/' + encodeURIComponent(kid);

    var chanChips = chans.slice(0, 5).map(function (c) {
      var u = c.username || '';
      var url = c.url || ('https://t.me/' + u);
      return (
        '<a class="buzz-chip buzz-chip--tg" href="' + esc(url) +
        '" target="_blank" rel="noopener nofollow" data-buzz-stop="1" title="Telegram">' +
        '<span class="mp-icon mp-icon--sm" data-mp-icon="telegram" aria-hidden="true"></span>' +
        '@' + esc(u) +
        '</a>'
      );
    }).join('');

    var postChips = posts.slice(0, 4).map(function (u, idx) {
      return (
        '<a class="buzz-chip buzz-chip--post" href="' + esc(u) +
        '" target="_blank" rel="noopener nofollow" data-buzz-stop="1">пост ' + (idx + 1) + '</a>'
      );
    }).join('');
    if (posts.length > 4) {
      postChips += '<span class="buzz-more">+' + (posts.length - 4) + '</span>';
    }

    return (
      '<article class="buzz-card" data-kp="' + esc(kid) + '">' +
        '<a class="buzz-card-main" href="' + esc(href) + '">' +
          '<span class="buzz-poster-wrap">' +
            '<img class="buzz-poster" src="' + esc(posterUrl(item)) + '" alt="" loading="lazy" ' +
              'onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'">' +
          '</span>' +
          '<span class="buzz-card-info">' +
            '<span class="buzz-card-title">' + esc(title) + '</span>' +
            '<span class="buzz-card-meta">' + n + ' упомин. · ' + cc + ' кан.</span>' +
            (badges ? '<span class="buzz-card-kinds">' + badges + '</span>' : '') +
          '</span>' +
        '</a>' +
        ((chanChips || postChips)
          ? '<div class="buzz-card-sources">' + chanChips + postChips + '</div>'
          : '') +
      '</article>'
    );
  }

  function filterItems(items) {
    var list = items.slice();
    if (state.kind) {
      list = list.filter(function (it) {
        var kinds = it.kinds || [];
        if (kinds.indexOf(state.kind) >= 0) return true;
        var chans = it.channels || [];
        return chans.some(function (c) { return c.channel_kind === state.kind; });
      });
    }
    return list;
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
        empty.textContent = state.loaded
          ? 'Пока нет упоминаний за выбранный период.'
          : '';
      }
      return;
    }
    if (empty) empty.classList.add('hidden');
    grid.innerHTML = list.map(renderItem).join('');
    if (window.MPIcons && typeof window.MPIcons.hydrate === 'function') {
      try { window.MPIcons.hydrate(grid); } catch (_) {}
    }
    // stop navigation when opening TG chips
    grid.querySelectorAll('[data-buzz-stop]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.stopPropagation(); });
    });
  }

  function syncSortPills() {
    document.querySelectorAll('[data-buzz-sort]').forEach(function (btn) {
      var on = btn.getAttribute('data-buzz-sort') === state.sort;
      btn.classList.toggle('is-active', on);
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
    var daysSel = document.getElementById('buzz-days');
    var kindSel = document.getElementById('buzz-kind');
    if (daysSel && !daysSel._mpBound) {
      daysSel._mpBound = true;
      daysSel.addEventListener('change', function () {
        state.days = parseInt(daysSel.value, 10) || 7;
        load();
      });
    }
    if (kindSel && !kindSel._mpBound) {
      kindSel._mpBound = true;
      kindSel.addEventListener('change', function () {
        state.kind = kindSel.value || '';
        paint();
      });
    }
    document.querySelectorAll('[data-buzz-sort]').forEach(function (btn) {
      if (btn._mpBound) return;
      btn._mpBound = true;
      btn.addEventListener('click', function () {
        var sort = btn.getAttribute('data-buzz-sort') || 'mentions';
        if (sort === state.sort) return;
        state.sort = sort;
        syncSortPills();
        load();
      });
    });
    syncSortPills();
  }

  function ensureVisible() {
    var sec = document.getElementById('section-buzz');
    if (!sec) return false;
    return !sec.classList.contains('hidden');
  }

  function boot() {
    bindToolbar();
    if (ensureVisible() || (location.pathname || '').replace(/\/$/, '') === '/buzz') {
      load();
    }
  }

  window.mpBuzzPage = { load: load, boot: boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('mp:section-shown', function (ev) {
    if (ev && ev.detail && ev.detail.section === 'buzz') load();
  });
})();
