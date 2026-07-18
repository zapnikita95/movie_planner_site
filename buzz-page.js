/**
 * Public /buzz («Новости») — сетка по фильмам или лента постов.
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
  var CHIPS_COLLAPSED = 4;
  var state = {
    days: 7,
    kind: '',
    sort: 'mentions',
    view: 'films',
    items: [],
    loaded: false,
    expanded: {},
  };

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function kindBadge(kind) {
    var k = String(kind || '');
    if (!k) return '';
    return '<span class="buzz-kind">' + esc(KIND_LABELS[k] || k) + '</span>';
  }

  function ytIcon() {
    return '<span class="buzz-platform-icon buzz-platform-icon--yt" aria-hidden="true" title="YouTube">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">' +
      '<path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.8 15.5v-7l6.2 3.5-6.2 3.5z"/>' +
      '</svg></span>';
  }

  function openFilm(kp) {
    var id = String(kp || '').replace(/\D/g, '');
    if (!id) return;
    if (typeof window.openFilmPageByKp === 'function') {
      window.openFilmPageByKp(id);
      return;
    }
    window.location.href = '/f/' + id;
  }

  function posterUrl(item) {
    var p = String((item && (item.poster || item.poster_url)) || '').trim();
    if (/^https?:\/\//i.test(p) || (p && p.charAt(0) === '/')) return p;
    return '';
  }

  function channelLabel(c) {
    if (!c) return '';
    var label = String(c.label || c.channel_label || c.title || c.channel_title || '').trim();
    if (label) return label;
    var u = String(c.username || '').trim();
    return u ? ('@' + u.replace(/^@/, '')) : 'канал';
  }


  /** Outbound UTM for authors + our Metrika (trackLinks already on). */
  function withBuzzUtm(url, meta) {
    var raw = String(url || '').trim();
    if (!raw || raw.charAt(0) === '#' || raw.indexOf('/f/') === 0) return raw;
    if (!/^https?:\/\//i.test(raw)) return raw;
    try {
      var u = new URL(raw);
      if (!u.searchParams.get('utm_source')) u.searchParams.set('utm_source', 'movie_planner');
      if (!u.searchParams.get('utm_medium')) u.searchParams.set('utm_medium', 'buzz');
      if (!u.searchParams.get('utm_campaign')) u.searchParams.set('utm_campaign', 'news');
      var m = meta || {};
      var content = String(m.channel || m.platform || 'source').replace(/[^\w.\-@]+/g, '_').slice(0, 80);
      var term = [m.platform || '', m.kpId || '', m.view || state.view || ''].filter(Boolean).join('_').slice(0, 80);
      if (content && !u.searchParams.get('utm_content')) u.searchParams.set('utm_content', content);
      if (term && !u.searchParams.get('utm_term')) u.searchParams.set('utm_term', term);
      return u.toString();
    } catch (_) {
      return raw;
    }
  }

  function trackBuzzOutbound(meta) {
    try {
      if (typeof window.ym === 'function') {
        window.ym(110038199, 'reachGoal', 'buzz_outbound', {
          platform: (meta && meta.platform) || '',
          channel: (meta && meta.channel) || '',
          kp_id: (meta && meta.kpId) || '',
          view: (meta && meta.view) || state.view || '',
        });
      }
    } catch (_) {}
  }

  function sourceChipsHtml(item) {
    var posts = Array.isArray(item.post_urls) ? item.post_urls : [];
    var chans = Array.isArray(item.channels) ? item.channels : [];
    var kid = String(item.kp_id || '');
    var chips = [];
    var seen = {};

    function chip(label, url, platform, channelKey) {
      var icon = platform === 'youtube' ? ytIcon() : '';
      var href = withBuzzUtm(url, {
        platform: platform,
        channel: channelKey || label,
        kpId: kid,
        view: 'films',
      });
      return (
        '<a class="buzz-source-chip' + (platform === 'youtube' ? ' buzz-source-chip--yt' : '') +
        '" href="' + esc(href) +
        '" target="_blank" rel="noopener nofollow" data-buzz-stop="1"' +
        ' data-buzz-out="1" data-buzz-platform="' + esc(platform) +
        '" data-buzz-channel="' + esc(channelKey || label) +
        '" data-buzz-kp="' + esc(kid) + '">' +
        icon + esc(label) +
        '</a>'
      );
    }

    chans.forEach(function (c) {
      var key = String(c.username || c.label || '').toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = 1;
      var plat = c.platform || ((String(c.url || c.post_url || '').indexOf('youtube') >= 0) ? 'youtube' : 'telegram');
      var u = String(c.username || '').trim();
      var post = c.post_url || '';
      if (!post && u && plat === 'telegram') {
        for (var i = 0; i < posts.length; i++) {
          if (String(posts[i]).indexOf('t.me/' + u + '/') >= 0) {
            post = posts[i];
            break;
          }
        }
      }
      var chKey = u || channelLabel(c);
      chips.push(chip(channelLabel(c), post || c.url || ('https://t.me/' + u), plat, chKey));
    });

    if (!chips.length) return '';
    var expanded = !!state.expanded[kid];
    var show = expanded ? chips : chips.slice(0, CHIPS_COLLAPSED);
    var more = chips.length - show.length;
    var moreBtn = '';
    if (!expanded && more > 0) {
      moreBtn = '<button type="button" class="buzz-source-more" data-buzz-expand="' + esc(kid) +
        '" data-buzz-stop="1">ещё ' + more + '</button>';
    } else if (expanded && chips.length > CHIPS_COLLAPSED) {
      moreBtn = '<button type="button" class="buzz-source-more" data-buzz-collapse="' + esc(kid) +
        '" data-buzz-stop="1">свернуть</button>';
    }
    return '<div class="buzz-card-sources">' + show.join(' ') + moreBtn + '</div>';
  }

  function premiereBellHtml(item) {
    if (!item || !item.is_upcoming_premiere) return '';
    var kp = esc(item.kp_id);
    var date = esc(item.premiere_date || '');
    return (
      '<span role="button" tabindex="0" class="premiere-bell-btn premiere-poster-bell premiere-poster-bell--overlay"' +
      ' data-action="premiere-notify-on" data-kp="' + kp + '" data-date="' + date + '"' +
      ' data-stop-card-click="1" data-buzz-stop="1" title="Отслеживать премьеру" aria-label="Отслеживать премьеру">' +
      '<span class="mp-icon mp-icon--sm" data-mp-icon="inbox"></span></span>'
    );
  }

  function renderFilmItem(item) {
    var kid = item.kp_id;
    var title = item.title || ('film ' + kid);
    var n = item.mention_count || 0;
    var cc = item.channel_count || (item.channels || []).length;
    var kinds = Array.isArray(item.kinds) ? item.kinds : [];
    if (state.kind) kinds = kinds.filter(function (k) { return k === state.kind; });
    var badges = kinds.slice(0, 3).map(kindBadge).join('');
    var href = '/f/' + encodeURIComponent(kid);
    var poster = posterUrl(item);
    if (!poster) return '';

    return (
      '<article class="buzz-tile">' +
        '<div class="buzz-tile-poster-wrap">' +
          premiereBellHtml(item) +
          '<a class="buzz-tile-link" href="' + esc(href) + '" data-kp-id="' + esc(kid) + '" data-title="' + esc(title) + '" data-poster="' + esc(poster) + '">' +
            '<span class="buzz-tile-poster">' +
              '<img src="' + esc(poster) + '" alt="' + esc(title) + '" loading="lazy">' +
            '</span>' +
          '</a>' +
        '</div>' +
        '<a class="buzz-tile-link buzz-tile-link--text" href="' + esc(href) + '" data-kp-id="' + esc(kid) + '">' +
          '<span class="buzz-tile-title">' + esc(title) + '</span>' +
          '<span class="buzz-tile-meta">' + n + ' упомин. · ' + cc + ' ист.' +
            (item.last_posted ? (' · ' + esc(item.last_posted)) : '') +
          '</span>' +
          (badges ? '<span class="buzz-tile-kinds">' + badges + '</span>' : '') +
        '</a>' +
        sourceChipsHtml(item) +
      '</article>'
    );
  }

  function renderFeedItem(item) {
    var kid = item.kp_id;
    var filmTitle = item.film_title || item.title || ('film ' + kid);
    var poster = posterUrl(item);
    if (!poster) return '';
    var href = '/f/' + encodeURIComponent(kid);
    var plat = item.platform || 'telegram';
    var chLabel = item.channel_label || item.channel_title || '@канал';
    var chKey = String(item.channel_username || chLabel).replace(/^@/, '');
    var chUrl = withBuzzUtm(item.channel_url || item.post_url || '#', {
      platform: plat, channel: chKey, kpId: kid, view: 'feed',
    });
    var postUrl = withBuzzUtm(item.post_url || item.channel_url || '#', {
      platform: plat, channel: chKey, kpId: kid, view: 'feed',
    });
    var excerpt = item.excerpt || filmTitle;
    var kind = state.kind ? state.kind : (item.channel_kind || '');
    var badge = kind ? kindBadge(kind) : kindBadge(item.channel_kind);
    var outAttrs = ' data-buzz-out="1" data-buzz-platform="' + esc(plat) +
      '" data-buzz-channel="' + esc(chKey) + '" data-buzz-kp="' + esc(kid) + '"';

    return (
      '<article class="buzz-feed-row">' +
        '<a class="buzz-feed-poster" href="' + esc(href) + '" data-kp-id="' + esc(kid) + '" data-title="' + esc(filmTitle) + '">' +
          '<img src="' + esc(poster) + '" alt="" loading="lazy">' +
        '</a>' +
        '<div class="buzz-feed-body">' +
          '<div class="buzz-feed-head">' +
            '<a class="buzz-feed-channel" href="' + esc(chUrl) + '" target="_blank" rel="noopener nofollow" data-buzz-stop="1"' + outAttrs + '>' +
              (plat === 'youtube' ? ytIcon() : '') + esc(chLabel) +
            '</a>' +
            (item.posted_at ? '<time class="buzz-feed-date">' + esc(item.posted_at) + '</time>' : '') +
            badge +
            premiereBellHtml(item) +
          '</div>' +
          '<a class="buzz-feed-excerpt" href="' + esc(postUrl) + '" target="_blank" rel="noopener nofollow" data-buzz-stop="1"' + outAttrs + '>' +
            esc(excerpt) +
          '</a>' +
          '<a class="buzz-feed-film" href="' + esc(href) + '" data-kp-id="' + esc(kid) + '">' + esc(filmTitle) + '</a>' +
        '</div>' +
      '</article>'
    );
  }

  function syncTabs() {
    document.querySelectorAll('#buzz-sort-tabs [data-buzz-sort]').forEach(function (btn) {
      var on = btn.getAttribute('data-buzz-sort') === state.sort && state.view === 'films';
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.classList.toggle('hidden', state.view !== 'films');
    });
    document.querySelectorAll('#buzz-view-tabs [data-buzz-view]').forEach(function (btn) {
      var on = btn.getAttribute('data-buzz-view') === state.view;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var sortWrap = document.getElementById('buzz-sort-tabs');
    if (sortWrap) sortWrap.classList.toggle('hidden', state.view !== 'films');
  }

  function paint() {
    var grid = document.getElementById('buzz-grid');
    var empty = document.getElementById('buzz-empty');
    var loading = document.getElementById('buzz-loading');
    var err = document.getElementById('buzz-error');
    if (!grid) return;
    if (loading) loading.classList.add('hidden');
    if (err) err.classList.add('hidden');
    syncTabs();
    var list = state.items || [];
    if (!list.length) {
      grid.innerHTML = '';
      grid.className = state.view === 'feed' ? 'buzz-feed' : 'buzz-grid';
      if (empty) {
        empty.classList.remove('hidden');
        empty.textContent = state.loaded
          ? 'За выбранный период ничего не нашлось. Попробуйте 14 дней или другой тип источника.'
          : '';
      }
      return;
    }
    if (empty) empty.classList.add('hidden');
    grid.className = state.view === 'feed' ? 'buzz-feed' : 'buzz-grid';
    grid.innerHTML = list.map(function (it) {
      return state.view === 'feed' ? renderFeedItem(it) : renderFilmItem(it);
    }).filter(Boolean).join('');

    if (typeof window.mpIconsEnhance === 'function') {
      try { window.mpIconsEnhance(grid); } catch (_) {}
    } else if (window.MpIcons && typeof window.MpIcons.enhance === 'function') {
      try { window.MpIcons.enhance(grid); } catch (_) {}
    }

    grid.querySelectorAll('[data-buzz-expand]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        state.expanded[btn.getAttribute('data-buzz-expand')] = true;
        paint();
      });
    });
    grid.querySelectorAll('[data-buzz-collapse]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        delete state.expanded[btn.getAttribute('data-buzz-collapse')];
        paint();
      });
    });
    grid.querySelectorAll('a[href^="/f/"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        var kp = (a.getAttribute('data-kp-id') || a.getAttribute('href') || '').replace(/\D/g, '');
        if (!kp) return;
        e.preventDefault();
        e.stopPropagation();
        openFilm(kp);
      });
    });
    grid.querySelectorAll('a[data-buzz-out]').forEach(function (a) {
      a.addEventListener('click', function () {
        trackBuzzOutbound({
          platform: a.getAttribute('data-buzz-platform') || '',
          channel: a.getAttribute('data-buzz-channel') || '',
          kpId: a.getAttribute('data-buzz-kp') || '',
          view: state.view,
        });
      });
    });
  }

  function load() {
    var loading = document.getElementById('buzz-loading');
    var err = document.getElementById('buzz-error');
    if (loading) loading.classList.remove('hidden');
    if (err) err.classList.add('hidden');
    var q = '/api/public/buzz?days=' + encodeURIComponent(state.days) +
      '&limit=' + (state.view === 'feed' ? '50' : '40');
    if (state.view === 'feed') {
      q += '&view=feed';
    } else {
      q += '&sort=' + encodeURIComponent(state.sort);
    }
    if (state.kind) q += '&kind=' + encodeURIComponent(state.kind);
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
        load();
      });
    }
    var sortTabs = document.getElementById('buzz-sort-tabs');
    if (sortTabs) {
      sortTabs.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-buzz-sort]');
        if (!btn || !sortTabs.contains(btn)) return;
        var sort = btn.getAttribute('data-buzz-sort') || 'mentions';
        if (sort === state.sort && state.view === 'films') return;
        state.view = 'films';
        state.sort = sort;
        syncTabs();
        load();
      });
    }
    var viewTabs = document.getElementById('buzz-view-tabs');
    if (viewTabs) {
      viewTabs.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-buzz-view]');
        if (!btn || !viewTabs.contains(btn)) return;
        var view = btn.getAttribute('data-buzz-view') || 'films';
        if (view === state.view) return;
        state.view = view;
        syncTabs();
        load();
      });
    }
    syncTabs();
  }

  function boot() {
    bindToolbar();
    var sec = document.getElementById('section-buzz');
    var onBuzz = sec && !sec.classList.contains('hidden');
    var path = (location.pathname || '').replace(/\/$/, '');
    if (onBuzz || path === '/buzz' || path === '/news') load();
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
