/**
 * Public /buzz — films discussed in cinema Telegram channels.
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

  var state = { days: 7, kind: '', items: [], loaded: false };

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

  function renderItem(item) {
    var kid = item.kp_id;
    var title = item.title || ('film ' + kid);
    var n = item.mention_count || 0;
    var posts = Array.isArray(item.post_urls) ? item.post_urls : [];
    var chans = Array.isArray(item.channels) ? item.channels : [];
    var kinds = Array.isArray(item.kinds) ? item.kinds : [];
    var badges = kinds.slice(0, 4).map(kindBadge).join('');
    var postLinks = posts.slice(0, 8).map(function (u, i) {
      return '<a class="buzz-post-link" href="' + esc(u) + '" target="_blank" rel="noopener nofollow">ссылка</a>';
    }).join(' · ');
    if (posts.length > 8) postLinks += ' <span class="buzz-more">+' + (posts.length - 8) + '</span>';
    var chanBits = chans.slice(0, 6).map(function (c) {
      var u = c.username || '';
      var url = c.url || ('https://t.me/' + u);
      var badge = c.channel_kind ? kindBadge(c.channel_kind) : '';
      return '<a class="buzz-chan-link" href="' + esc(url) + '" target="_blank" rel="noopener nofollow">@' +
        esc(u) + '</a>' + badge;
    }).join(' ');

    return (
      '<article class="buzz-card" data-kp="' + esc(kid) + '">' +
        '<button type="button" class="buzz-card-head" aria-expanded="false">' +
          '<span class="buzz-card-title">' + esc(title) + '</span>' +
          '<span class="buzz-card-meta">' + n + ' упомин. · ' + (item.channel_count || chans.length) + ' кан.</span>' +
          (badges ? '<span class="buzz-card-kinds">' + badges + '</span>' : '') +
        '</button>' +
        '<div class="buzz-card-body hidden">' +
          (postLinks ? '<div class="buzz-posts">' + postLinks + '</div>' : '') +
          (chanBits ? '<div class="buzz-chans">' + chanBits + '</div>' : '') +
          '<a class="buzz-film-link" href="/f/' + esc(kid) + '">Карточка фильма →</a>' +
        '</div>' +
      '</article>'
    );
  }

  function filterItems(items) {
    if (!state.kind) return items;
    return items.filter(function (it) {
      var kinds = it.kinds || [];
      if (kinds.indexOf(state.kind) >= 0) return true;
      var chans = it.channels || [];
      return chans.some(function (c) { return c.channel_kind === state.kind; });
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
        empty.textContent = state.loaded
          ? 'Пока нет упоминаний за выбранный период.'
          : '';
      }
      return;
    }
    if (empty) empty.classList.add('hidden');
    grid.innerHTML = list.map(renderItem).join('');
    grid.querySelectorAll('.buzz-card-head').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.buzz-card');
        var body = card && card.querySelector('.buzz-card-body');
        if (!body) return;
        var open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        body.classList.toggle('hidden', open);
      });
    });
  }

  function load() {
    var loading = document.getElementById('buzz-loading');
    var err = document.getElementById('buzz-error');
    if (loading) loading.classList.remove('hidden');
    if (err) err.classList.add('hidden');
    return fetch(API_BASE + '/api/public/buzz?days=' + encodeURIComponent(state.days) + '&limit=40', {
      method: 'GET',
      mode: 'cors',
    })
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
          err.textContent = 'Не удалось загрузить buzz.';
        }
      });
  }

  function bindToolbar() {
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
