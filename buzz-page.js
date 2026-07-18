/**
 * Public /buzz («В тренде») — сетка по фильмам или лента постов.
 */
(function () {
  'use strict';

  var API_BASE = (typeof window.MP_API_BASE === 'string' && window.MP_API_BASE)
    ? window.MP_API_BASE.replace(/\/$/, '')
    : ((typeof window.location !== 'undefined' && window.location.origin) || 'https://movie-planner.ru');

  var PLACEHOLDER = '/images/film-poster-placeholder.png';
  var CHIPS_COLLAPSED = 4;
  var CLIENT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; /* 6h — контент обновляется раз в ~2–3 дня */
  var BELL_SVG =
    '<svg class="mp-icon-svg-fallback" width="14" height="14" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">' +
    '<path d="M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216ZM48,184c7.7-13.24,16-43.92,16-80a64,64,0,1,1,128,0c0,36.05,8.28,66.73,16,80Z"/>' +
    '</svg>';

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

  function normTitle(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

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

  function cacheKey() {
    return 'mp_buzz_v2:' + state.view + ':' + state.days + ':' + state.sort + ':' + (state.kind || '');
  }

  function readClientCache() {
    try {
      var raw = sessionStorage.getItem(cacheKey());
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.ts || !Array.isArray(parsed.items)) return null;
      if (Date.now() - parsed.ts > CLIENT_CACHE_TTL_MS) return null;
      return parsed.items;
    } catch (_) {
      return null;
    }
  }

  function writeClientCache(items) {
    try {
      sessionStorage.setItem(cacheKey(), JSON.stringify({ ts: Date.now(), items: items || [] }));
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
      if (state.kind && String(c.channel_kind || '') !== state.kind) return;
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
      '<span role="button" tabindex="0" class="premiere-bell-btn premiere-poster-bell premiere-poster-bell--overlay buzz-premiere-bell"' +
      ' data-action="premiere-notify-on" data-kp="' + kp + '" data-date="' + date + '"' +
      ' data-stop-card-click="1" data-buzz-stop="1" title="Отслеживать премьеру" aria-label="Отслеживать премьеру">' +
      BELL_SVG + '</span>'
    );
  }

  function renderFilmItem(item) {
    var kid = item.kp_id;
    var title = item.title || ('film ' + kid);
    var n = item.mention_count || 0;
    var chans = Array.isArray(item.channels) ? item.channels : [];
    if (state.kind) {
      chans = chans.filter(function (c) { return String(c.channel_kind || '') === state.kind; });
    }
    var cc = item.channel_count || chans.length;
    var href = '/f/' + encodeURIComponent(kid);
    var poster = posterUrl(item);
    if (!poster) return '';
    var itemForChips = Object.assign({}, item, { channels: chans });

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
        '</a>' +
        sourceChipsHtml(itemForChips) +
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
    var chUrl = withBuzzUtm(item.channel_url || (plat === 'telegram' ? ('https://t.me/' + chKey) : item.post_url) || '#', {
      platform: plat, channel: chKey, kpId: kid, view: 'feed',
    });
    var postUrl = withBuzzUtm(item.post_url || item.channel_url || '#', {
      platform: plat, channel: chKey, kpId: kid, view: 'feed',
    });
    var teaser = String(item.teaser || item.excerpt || '').trim();
    if (teaser && normTitle(teaser) === normTitle(filmTitle)) teaser = '';
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
            premiereBellHtml(item) +
          '</div>' +
          '<a class="buzz-feed-film" href="' + esc(href) + '" data-kp-id="' + esc(kid) + '">' + esc(filmTitle) + '</a>' +
          (teaser
            ? ('<a class="buzz-feed-excerpt" href="' + esc(postUrl) + '" target="_blank" rel="noopener nofollow" data-buzz-stop="1"' + outAttrs + '>' +
                esc(teaser) +
              '</a>')
            : ('<a class="buzz-feed-excerpt buzz-feed-excerpt--link" href="' + esc(postUrl) + '" target="_blank" rel="noopener nofollow" data-buzz-stop="1"' + outAttrs + '>' +
                (plat === 'youtube' ? 'Открыть ролик' : 'Открыть пост') +
              '</a>')) +
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

    try {
      if (window.MPIcons && typeof window.MPIcons.hydrate === 'function') {
        window.MPIcons.hydrate(grid);
      }
    } catch (_) {}

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

  function load(opts) {
    var silent = opts && opts.silent;
    var loading = document.getElementById('buzz-loading');
    var err = document.getElementById('buzz-error');
    if (!silent && !state.items.length && loading) loading.classList.remove('hidden');
    if (err) err.classList.add('hidden');

    var cached = readClientCache();
    if (cached && cached.length && !state.loaded) {
      state.items = cached;
      state.loaded = true;
      paint();
    }

    var q = '/api/public/buzz?days=' + encodeURIComponent(state.days) +
      '&limit=' + (state.view === 'feed' ? '50' : '40');
    if (state.view === 'feed') {
      q += '&view=feed';
    } else {
      q += '&sort=' + encodeURIComponent(state.sort);
    }
    if (state.kind) q += '&kind=' + encodeURIComponent(state.kind);
    return fetch(API_BASE + q, { method: 'GET', mode: 'cors', credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error('api_' + r.status);
        return r.json();
      })
      .then(function (d) {
        state.items = (d && d.items) || [];
        state.loaded = true;
        writeClientCache(state.items);
        paint();
      })
      .catch(function () {
        if (state.items && state.items.length) {
          /* keep stale client cache on network blip */
          paint();
          return;
        }
        state.loaded = true;
        state.items = [];
        if (loading) loading.classList.add('hidden');
        if (err) {
          err.classList.remove('hidden');
          err.textContent = 'Не удалось загрузить «В тренде».';
        }
      });
  }

  function digestStatus(msg, isErr) {
    var el = document.getElementById('buzz-digest-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isErr ? '#ff6b6b' : '';
  }

  function markSkipOnboardingUntilHome() {
    try { sessionStorage.setItem('mp_skip_onboard_until_home', '1'); } catch (_) {}
  }

  function bindDigest() {
    var emailBtn = document.getElementById('buzz-digest-email-btn');
    var tgBtn = document.getElementById('buzz-digest-tg-btn');
    if (emailBtn && !emailBtn._mpBound) {
      emailBtn._mpBound = true;
      emailBtn.addEventListener('click', function () {
        var email = (document.getElementById('buzz-digest-email') || {}).value || '';
        var freq = (document.getElementById('buzz-digest-freq') || {}).value || 'week';
        email = String(email).trim();
        if (!email || email.indexOf('@') < 0) {
          digestStatus('Укажите email', true);
          return;
        }
        digestStatus('Отправляем письмо…');
        emailBtn.disabled = true;
        fetch(API_BASE + '/api/public/buzz/digest/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: 'email', email: email, frequency: freq, days_window: state.days }),
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (res) {
            emailBtn.disabled = false;
            if (!res.ok || !(res.d && res.d.success)) {
              digestStatus((res.d && res.d.error) === 'bad_email' ? 'Некорректный email' : 'Не удалось подписаться', true);
              return;
            }
            markSkipOnboardingUntilHome();
            digestStatus(res.d.confirm_sent
              ? 'Проверьте почту и подтвердите подписку. Онбординг не запускаем.'
              : 'Заявка принята. Подтвердите письмо, когда придёт.');
          })
          .catch(function () {
            emailBtn.disabled = false;
            digestStatus('Сеть недоступна', true);
          });
      });
    }
    if (tgBtn && !tgBtn._mpBound) {
      tgBtn._mpBound = true;
      tgBtn.addEventListener('click', function () {
        markSkipOnboardingUntilHome();
        digestStatus('Войдите через Telegram — подписка без онбординга, пока не зайдёте на Главную.');
        try {
          if (typeof window.showLoginModalOverlay === 'function') {
            window.showLoginModalOverlay('login');
            return;
          }
        } catch (_) {}
        var loginBtn = document.querySelector('[data-action="open-login"], #header-login-btn, .header-login');
        if (loginBtn) loginBtn.click();
        else window.location.href = '/?open_login=1&from=buzz_digest';
      });
    }
    try {
      var params = new URLSearchParams(location.search || '');
      if (params.get('digest') === 'confirmed') digestStatus('Подписка подтверждена.');
      if (params.get('digest') === 'error') digestStatus('Ссылка подтверждения недействительна.', true);
    } catch (_) {}
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
        state.loaded = false;
        load();
      });
    }
    if (kindSel) {
      kindSel.addEventListener('change', function () {
        state.kind = kindSel.value || '';
        state.loaded = false;
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
        state.loaded = false;
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
        state.loaded = false;
        syncTabs();
        load();
      });
    }
    bindDigest();
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
