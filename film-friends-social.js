/**
 * Блок «друзья высоко оценили» на странице фильма (кабинет и /f/).
 */
(function (global) {
  'use strict';

  var HIGH_MIN = 7;
  var PREVIEW = 6;

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function pickHighWatchers(watchers) {
    return (watchers || [])
      .filter(function (w) {
        return w && w.rating != null && Number(w.rating) >= HIGH_MIN;
      })
      .sort(function (a, b) {
        return Number(b.rating) - Number(a.rating) || String(a.name || '').localeCompare(String(b.name || ''), 'ru');
      });
  }

  function friendChipHtml(w) {
    var uid = Number(w.user_id);
    var initial = String(w.name || '?').trim().charAt(0).toUpperCase() || '?';
    return (
      '<button type="button" class="film-friend-rating-chip" data-friend-profile="' + uid + '">' +
        '<span class="film-friend-rating-avatar" aria-hidden="true">' + escapeHtml(initial) + '</span>' +
        '<span class="film-friend-rating-name">' + escapeHtml(w.name || '') + '</span>' +
        '<span class="film-friend-rating-score">' + escapeHtml(String(w.rating)) +
          '<span class="film-friend-rating-denom">/10</span></span>' +
      '</button>'
    );
  }

  function renderFilmFriendsSocialHtml(social) {
    var high = pickHighWatchers((social && social.watchers) || []);
    if (!high.length) return '';

    var preview = high.slice(0, PREVIEW);
    var rest = high.slice(PREVIEW);
    var moreBtn = rest.length
      ? '<button type="button" class="film-friends-social-more" data-friends-more="1">Ещё ' + rest.length + '</button>'
      : '';
    var restHidden = rest.length
      ? '<div class="film-friends-social-list film-friends-social-list--more hidden" data-friends-rest="1">' +
          rest.map(friendChipHtml).join('') +
        '</div>'
      : '';

    return (
      '<section class="film-friends-social" aria-label="Друзья высоко оценили">' +
        '<div class="film-friends-social-head">' +
          '<span class="film-friends-social-title">Друзья высоко оценили</span>' +
          '<span class="film-friends-social-badge">' + high.length + '</span>' +
        '</div>' +
        '<div class="film-friends-social-list">' + preview.map(friendChipHtml).join('') + '</div>' +
        restHidden +
        moreBtn +
      '</section>'
    );
  }

  function bindFriendProfileClicks(root, onFriendClick) {
    if (!root) return;
    root.querySelectorAll('[data-friend-profile]').forEach(function (btn) {
      if (btn.dataset.friendBound) return;
      btn.dataset.friendBound = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var uid = btn.getAttribute('data-friend-profile');
        if (!uid) return;
        if (typeof onFriendClick === 'function') {
          onFriendClick(uid);
          return;
        }
        if (typeof global.MpSiteOpenFriendProfile === 'function') {
          global.MpSiteOpenFriendProfile(uid);
          return;
        }
        try {
          global.location.href = '/user/' + encodeURIComponent(String(uid));
        } catch (_e) {}
      });
    });
    var more = root.querySelector('[data-friends-more="1"]');
    if (more && !more.dataset.friendBound) {
      more.dataset.friendBound = '1';
      more.addEventListener('click', function () {
        var restEl = root.querySelector('[data-friends-rest="1"]');
        if (restEl) restEl.classList.remove('hidden');
        more.remove();
      });
    }
  }

  function mountFilmFriendsSocial(opts) {
    opts = opts || {};
    var kpNorm = String(opts.kpId || '').replace(/\D/g, '');
    if (!kpNorm) return Promise.resolve();
    var el = opts.container;
    if (!el && opts.containerId) el = document.getElementById(opts.containerId);
    if (!el) return Promise.resolve();

    var apiBase = opts.apiBase || '';
    var path = '/api/friends/film/' + encodeURIComponent(kpNorm) + '/social';
    var fetchFn = opts.fetchFn;
    var headers = opts.authHeaders || {};

    var req;
    if (typeof fetchFn === 'function') {
      req = fetchFn(path);
    } else {
      req = fetch(apiBase + path, {
        method: 'GET',
        mode: 'cors',
        headers: headers,
      }).then(function (r) {
        if (!r.ok) throw new Error('social_' + r.status);
        return r.json();
      });
    }

    return Promise.resolve(req).then(function (social) {
      var html = renderFilmFriendsSocialHtml(social);
      if (!html) {
        el.innerHTML = '';
        el.classList.add('hidden');
        return;
      }
      el.classList.remove('hidden');
      el.innerHTML = html;
      bindFriendProfileClicks(el, opts.onFriendClick);
    }).catch(function () {
      el.innerHTML = '';
      el.classList.add('hidden');
    });
  }

  global.MpFilmFriendsSocial = {
    HIGH_MIN: HIGH_MIN,
    mount: mountFilmFriendsSocial,
    renderHtml: renderFilmFriendsSocialHtml,
    bindFriendProfileClicks: bindFriendProfileClicks,
  };
})(typeof window !== 'undefined' ? window : this);
