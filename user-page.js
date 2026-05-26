/**
 * Публичная страница пользователя /u/:userId (OG + карточка профиля).
 */
(function (global) {
  'use strict';

  var API_BASE = (function () {
    try {
      var loc = global.location;
      var h = loc.hostname || '';
      if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') return loc.protocol + '//' + h;
    } catch (_e) {}
    return 'https://api.movie-planner.ru';
  })();

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function mpToken() {
    try {
      var active = localStorage.getItem('mp_site_active_chat_id');
      var sessions = JSON.parse(localStorage.getItem('mp_site_sessions') || '[]');
      var row = sessions.find(function (x) { return String(x.chat_id) === String(active); });
      return row ? row.token : null;
    } catch (_e) { return null; }
  }

  function resolvePhoto(url) {
    var s = String(url || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s) || s.indexOf('data:') === 0) return s;
    if (s.indexOf('/api/') === 0) return API_BASE + s;
    return s;
  }

  function achHtml(list) {
    return (list || []).slice(0, 8).map(function (a) {
      var icon = (a && a.icon) || '🏅';
      var name = (a && a.name) || '';
      var cap = (name || '').split(' ')[0] || '…';
      return '<span class="user-public-ach" title="' + escapeHtml(name) + '"><span aria-hidden="true">' +
        escapeHtml(icon) + '</span><span class="user-public-ach-cap">' + escapeHtml(cap) + '</span></span>';
    }).join('');
  }

  function renderUserPublic(root, user) {
    var uid = user.user_id;
    var name = user.name || 'Пользователь';
    var initial = String(name).trim().charAt(0).toUpperCase() || 'П';
    var photo = resolvePhoto(user.photo_url);
    var stats = [];
    if (user.ratings_count) stats.push('<span><strong>' + escapeHtml(String(user.ratings_count)) + '</strong> оценок</span>');
    if (user.achievements_count) stats.push('<span><strong>' + escapeHtml(String(user.achievements_count)) + '</strong> ачивок</span>');
    var ach = achHtml(user.achievements);

    root.innerHTML =
      '<article class="user-public-page">' +
        '<div class="user-public-card">' +
          '<div class="user-public-header">' +
            '<div class="user-public-avatar">' +
              (photo
                ? '<img src="' + escapeHtml(photo) + '" alt="" loading="eager" referrerpolicy="no-referrer">'
                : escapeHtml(initial)) +
            '</div>' +
            '<div class="user-public-head">' +
              '<h1 class="user-public-name">' + escapeHtml(name) + '</h1>' +
              (stats.length ? '<div class="user-public-stats">' + stats.join('') + '</div>' : '') +
            '</div>' +
          '</div>' +
          (ach ? '<div class="user-public-ach-row">' + ach + '</div>' : '') +
          '<div class="user-public-actions">' +
            '<a class="btn-primary user-public-open" href="/?user_open=' + encodeURIComponent(String(uid)) + '">Открыть в Movie Planner</a>' +
            '<a class="btn btn-secondary user-public-add" href="/?add=' + encodeURIComponent(String(uid)) + '">Добавить в друзья</a>' +
          '</div>' +
        '</div>' +
      '</article>';

    if (photo) {
      var img = root.querySelector('.user-public-avatar img');
      if (img) {
        img.addEventListener('error', function () {
          var box = img.closest('.user-public-avatar');
          if (box) box.textContent = initial;
        }, { once: true });
      }
    }
  }

  function loadUser(userId) {
    var root = document.getElementById('user-public-root');
    if (!root) return;
    fetch(API_BASE + '/api/public/user/' + encodeURIComponent(userId), { method: 'GET', mode: 'cors' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.success || !data.user) {
          root.innerHTML = '<p class="film-page-error-hint">Профиль не найден</p>';
          return;
        }
        try { document.title = (data.user.name || 'Профиль') + ' · Movie Planner'; } catch (_e) {}
        renderUserPublic(root, data.user);
      })
      .catch(function () {
        root.innerHTML = '<p class="film-page-error-hint">Не удалось загрузить профиль</p>';
      });
  }

  function renderUserShell(userId) {
    document.body.innerHTML =
      '<div class="page-shell user-standalone-shell">' +
        '<header id="site-header">' +
          '<div class="header-content">' +
            '<a class="logo" href="/"><img src="/images/icon48.png" alt="Movie Planner"><span>Movie Planner</span></a>' +
            '<div class="header-buttons">' +
              '<button type="button" class="btn-primary" id="login-btn">Войти</button>' +
            '</div>' +
          '</div>' +
        '</header>' +
        (global.MpFilmPage && MpFilmPage.appOpenBannerHtml ? MpFilmPage.appOpenBannerHtml() : '') +
        '<main class="movie-page user-standalone-main">' +
          '<div class="user-public-content" id="user-public-root"><p class="cabinet-hint">Загрузка…</p></div>' +
        '</main>' +
        '<footer class="footer user-standalone-footer">' +
          '<div class="container"><p class="footer-bottom muted small">© ' + String(new Date().getFullYear()) + ' Movie Planner</p></div>' +
        '</footer>' +
      '</div>';

    if (global.MpFilmPage && MpFilmPage.initStandaloneSiteChrome) {
      MpFilmPage.initStandaloneSiteChrome({
        apiBase: API_BASE,
        mainSelector: 'main.user-standalone-main',
        spaReturnPath: '/u/' + userId,
      });
    }
    var loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', function () {
        global.location.href = '/?open_login=1&user_open=' + encodeURIComponent(userId);
      });
    }
    if (global.MpFilmPage && MpFilmPage.setupAppOpenBanner) {
      MpFilmPage.setupAppOpenBanner({ id: userId, kind: 'film' });
    }
  }

  function bootstrap(opts) {
    opts = opts || {};
    var userId = String(opts.userId || '').replace(/\D/g, '');
    if (!userId) return;

    if (mpToken()) {
      global.location.replace('/?user_open=' + encodeURIComponent(userId));
      return;
    }

    try { document.body.classList.add('user-standalone-page'); } catch (_e) {}
    renderUserShell(userId);
    loadUser(userId);
  }

  global.MpUserPage = { bootstrap: bootstrap, API_BASE: API_BASE };
})(typeof window !== 'undefined' ? window : this);
