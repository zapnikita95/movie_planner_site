/**
 * Auth modal film rail: always show posters.
 * /f/{id} → current + similar; /s/{id} → top-rated person films; else buzz.
 */
(function (global) {
  'use strict';

  var DOT_COUNT = 3;
  var railLoadToken = 0;

  function apiBase() {
    try {
      var h = (global.location && global.location.hostname) || '';
      if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') {
        return global.location.protocol + '//' + h;
      }
    } catch (_e) {}
    return 'https://movie-planner.ru';
  }

  function pathMatch(re) {
    try {
      var path = (global.location.pathname || '').replace(/\/$/, '') || '/';
      var m = path.match(re);
      return m ? m[1] : '';
    } catch (_e) {
      return '';
    }
  }

  function filmKpFromPath() {
    return pathMatch(/^\/f\/(\d+)$/i);
  }

  function staffKpFromPath() {
    return pathMatch(/^\/s\/(\d+)$/i);
  }

  function posterOf(item) {
    if (!item) return '';
    return String(
      item.poster || item.poster_url || item.posterUrl || item.src || ''
    ).trim();
  }

  function titleOf(item) {
    if (!item) return '';
    return String(item.title || item.name || item.name_ru || item.title_ru || '').trim();
  }

  function kpOf(item) {
    if (!item) return '';
    // staff_pick payload uses `kp`; public APIs use kp_id / id
    var v = item.kp_id || item.kp || item.kinopoiskId || item.id || item.kpId;
    if (v == null || v === '') return '';
    return String(v).replace(/\D/g, '') || String(v);
  }

  function normalizeItem(raw, opts) {
    var poster = posterOf(raw);
    if (!poster) return null;
    if (poster.indexOf('image.tmdb.org') === 0 || poster.indexOf('https://image.tmdb.org') === 0) {
      var m = poster.match(/\/(w\d+|original)\/([^/?#]+)/);
      if (m) poster = '/api/public/poster/tmdb/' + m[1] + '/' + m[2];

    var mKp = poster.match(/^https?:\/\/avatars\.mds\.yandex\.net\/(get-kinopoisk-image\/[^?#]+)/i);
    if (mKp) poster = '/api/public/poster/kp/mds/' + mKp[1];
    mKp = poster.match(/^https?:\/\/st\.kp\.yandex\.net\/(images\/(?:film_iphone|film_big|actor_iphone|actor_big|film_poster)\/[^?#]+)/i);
    if (mKp) poster = '/api/public/poster/kp/st/' + mKp[1];    }
    if (poster.charAt(0) === '/') poster = apiBase() + poster;
    return {
      kp_id: kpOf(raw),
      title: titleOf(raw),
      poster: poster,
      current: !!(opts && opts.current),
      selected: !!(opts && (opts.selected || opts.current)),
    };
  }

  function ensureRailDom() {
    var modal = document.getElementById('login-modal');
    if (!modal) return null;
    var rail = document.getElementById('login-film-rail');
    if (rail) return rail;
    rail = document.createElement('div');
    rail.id = 'login-film-rail';
    rail.className = 'login-film-rail';
    rail.hidden = true;
    rail.innerHTML =
      '<p class="login-film-rail__caption" id="login-film-rail-caption"></p>' +
      '<div class="login-film-rail__track" id="login-film-rail-track"></div>' +
      '<div class="login-film-rail__dots" id="login-film-rail-dots" aria-hidden="true"></div>';
    var cta = modal.querySelector('#login-modal-cta');
    var tabs = modal.querySelector('.login-auth-tabs');
    var title = modal.querySelector('.modal-title');
    if (cta && cta.parentNode) cta.insertAdjacentElement('afterend', rail);
    else if (tabs && tabs.parentNode) tabs.parentNode.insertBefore(rail, tabs);
    else if (title) title.insertAdjacentElement('afterend', rail);
    return rail;
  }

  function syncDots(track, dotsEl) {
    if (!track || !dotsEl) return;
    var spans = dotsEl.querySelectorAll('span');
    if (!spans.length) return;
    var max = track.scrollWidth - track.clientWidth;
    var idx = 0;
    if (max > 4) {
      idx = Math.round((track.scrollLeft / max) * (spans.length - 1));
    }
    if (idx < 0) idx = 0;
    if (idx > spans.length - 1) idx = spans.length - 1;
    for (var i = 0; i < spans.length; i++) {
      spans[i].classList.toggle('on', i === idx);
    }
  }

  function bindDots(track, dotsEl) {
    if (!track || !dotsEl || track._mpRailDotsBound) return;
    track._mpRailDotsBound = true;
    var onScroll = function () { syncDots(track, dotsEl); };
    track.addEventListener('scroll', onScroll, { passive: true });
    global.addEventListener('resize', onScroll);
    syncDots(track, dotsEl);
  }

  function renderRail(items, caption, mode) {
    var rail = ensureRailDom();
    if (!rail) return;
    var track = document.getElementById('login-film-rail-track') || rail.querySelector('.login-film-rail__track');
    var dots = document.getElementById('login-film-rail-dots') || rail.querySelector('.login-film-rail__dots');
    var cap = document.getElementById('login-film-rail-caption') || rail.querySelector('.login-film-rail__caption');
    if (!track || !dots) return;

    var list = Array.isArray(items) ? items.filter(Boolean).slice(0, 12) : [];
    track.innerHTML = '';
    dots.innerHTML = '';
    track._mpRailDotsBound = false;
    rail.classList.toggle('login-film-rail--pick', mode === 'pick');

    if (!list.length) {
      rail.hidden = true;
      return;
    }

    if (cap) cap.textContent = caption || '';
    list.forEach(function (it) {
      var card = document.createElement('div');
      var hi = it.current || it.selected || mode === 'pick';
      card.className = 'login-film-rail__card' + (hi ? ' is-current' : '');
      if (it.title) card.title = it.title;
      var img = document.createElement('img');
      img.src = it.poster;
      img.alt = it.title || '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.onerror = function () {
        try { card.remove(); syncDots(track, dots); } catch (_e) {}
      };
      card.appendChild(img);
      track.appendChild(card);
    });

    for (var d = 0; d < DOT_COUNT; d++) {
      var sp = document.createElement('span');
      if (d === 0) sp.className = 'on';
      dots.appendChild(sp);
    }

    rail.hidden = !track.childNodes.length;
    bindDots(track, dots);
    try { track.scrollLeft = 0; } catch (_s) {}
    syncDots(track, dots);
  }

  function fetchJson(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      return r.json().catch(function () { return {}; });
    });
  }

  function loadFilmContext(kp) {
    var base = apiBase();
    return Promise.all([
      fetchJson(base + '/api/public/film/' + encodeURIComponent(kp)),
      fetchJson(base + '/api/public/film/' + encodeURIComponent(kp) + '/similar?limit=10'),
    ]).then(function (pair) {
      var filmPayload = pair[0] || {};
      var similarPayload = pair[1] || {};
      var film = filmPayload.film || filmPayload;
      var items = [];
      var cur = normalizeItem(film, { current: true });
      if (cur) {
        cur.kp_id = cur.kp_id || String(kp);
        items.push(cur);
      }
      var similar = similarPayload.items || similarPayload.films || [];
      similar.forEach(function (s) {
        var n = normalizeItem(s);
        if (!n) return;
        if (cur && n.kp_id && n.kp_id === cur.kp_id) return;
        items.push(n);
      });
      return { items: items, caption: 'Этот фильм и похожие' };
    });
  }

  function loadStaffContext(kp) {
    var base = apiBase();
    var url =
      base +
      '/api/public/person/' +
      encodeURIComponent(kp) +
      '/films?role=ACTOR&limit=12&sort=rating_desc';
    return fetchJson(url).then(function (data) {
      var films = data.films || data.items || [];
      var items = films.map(function (f) { return normalizeItem(f); }).filter(Boolean);
      return { items: items, caption: 'Лучшие фильмы актёра' };
    });
  }

  function loadBuzzContext() {
    var base = apiBase();
    return fetchJson(base + '/api/public/buzz?days=7&limit=12&view=films').then(function (data) {
      var films = data.items || data.films || [];
      var items = films.map(function (f) { return normalizeItem(f); }).filter(Boolean);
      return { items: items, caption: 'Сейчас обсуждают' };
    });
  }

  function loadFromChips(chips) {
    var items = (Array.isArray(chips) ? chips : [])
      .map(function (c) { return normalizeItem(c, { selected: true }); })
      .filter(Boolean)
      .slice(0, 12);
    return Promise.resolve({ items: items, caption: 'Ваш выбор', mode: 'pick' });
  }

  function loadAuthFilmRail(opts) {
    opts = opts || {};
    var token = ++railLoadToken;
    ensureRailDom();

    var loader;
    var isPick = !!(opts.chips && opts.chips.length);
    if (isPick) {
      loader = loadFromChips(opts.chips);
    } else {
      var filmKp = filmKpFromPath();
      var staffKp = staffKpFromPath();
      if (filmKp) loader = loadFilmContext(filmKp);
      else if (staffKp) loader = loadStaffContext(staffKp);
      else loader = loadBuzzContext();
    }

    return loader
      .catch(function () {
        if (isPick) return { items: [], caption: '', mode: 'pick' };
        return loadBuzzContext().catch(function () {
          return { items: [], caption: '' };
        });
      })
      .then(function (pack) {
        if (token !== railLoadToken) return;
        renderRail(pack.items || [], pack.caption || '', pack.mode || (isPick ? 'pick' : ''));
      });
  }

  function upgradeLoginModalLayout() {
    var modal = document.getElementById('login-modal');
    if (!modal) return;

    ensureRailDom();

    var name = document.getElementById('login-register-name');
    if (name && /имя профиля/i.test(name.placeholder || '') && name.placeholder.indexOf('необяз') < 0) {
      name.placeholder = 'Имя профиля (необязательно)';
    }

    var regPane = document.getElementById('login-pane-register');
    if (!regPane) return;

    var privacy = modal.querySelector('#login-register-privacy');
    var label = privacy && privacy.closest('.login-oauth-privacy');
    if (label && !label.classList.contains('login-register-privacy--top')) {
      label.classList.add('login-register-privacy--top');
    }
    var status = document.getElementById('login-register-status');
    var oauth = regPane.querySelector('.login-register-oauth-block');
    if (label && oauth && label.parentNode !== regPane) {
      regPane.insertBefore(label, oauth);
      if (status && status.parentNode !== regPane) {
        regPane.insertBefore(status, oauth);
      } else if (status) {
        regPane.insertBefore(status, oauth);
      }
    } else if (label && oauth && label.nextElementSibling !== status && status) {
      regPane.insertBefore(status, oauth);
    }
  }

  global.MpLoginAuthRail = {
    load: loadAuthFilmRail,
    upgrade: upgradeLoginModalLayout,
    render: renderRail,
  };
})(typeof window !== 'undefined' ? window : this);
