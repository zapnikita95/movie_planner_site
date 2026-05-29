/**
 * Публичная и авторизованная страница пользователя /u/:userId.
 */
(function (global) {
  'use strict';

  var API_BASE = (function () {
    try {
      var loc = global.location;
      var h = loc.hostname || '';
      if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') return loc.protocol + '//' + h;
    } catch (_e) {}
    return 'https://movie-planner.ru';
  })();

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function mpSessions() {
    try { return JSON.parse(localStorage.getItem('mp_site_sessions') || '[]'); } catch (_e) { return []; }
  }

  function mpToken() {
    try {
      var active = localStorage.getItem('mp_site_active_chat_id');
      var row = mpSessions().find(function (x) { return String(x.chat_id) === String(active); });
      return row ? row.token : null;
    } catch (_e) { return null; }
  }

  function mpAuthHeaders() {
    var h = { 'Content-Type': 'application/json' };
    var t = mpToken();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  function apiJson(path, options) {
    return fetch(API_BASE + path, Object.assign({ headers: mpAuthHeaders(), mode: 'cors' }, options || {}))
      .then(function (r) { return r.json(); });
  }

  function resolvePhoto(url, userId) {
    var s = String(url || '').trim();
    if (!s && userId) s = API_BASE + '/api/avatar/' + encodeURIComponent(String(userId)) + '.jpg';
    if (!s) return '';
    if (/^https?:\/\//i.test(s) || s.indexOf('data:') === 0) return s;
    if (s.indexOf('/api/') === 0) return API_BASE + s;
    return s;
  }

  function showToast(msg, isError) {
    var el = document.getElementById('public-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'public-toast';
      el.className = 'public-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg || '';
    if (isError) el.classList.add('public-toast--error');
    else el.classList.remove('public-toast--error');
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () { el.classList.remove('show'); }, 2800);
  }

  function simpleModal(html) {
    var modal = document.createElement('div');
    modal.className = 'user-profile-modal-overlay';
    modal.innerHTML =
      '<div class="user-profile-modal-panel">' + html +
      '<button type="button" class="btn btn-secondary user-profile-modal-close">Закрыть</button></div>';
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
    });
    modal.querySelector('.user-profile-modal-close').addEventListener('click', function () {
      modal.remove();
    });
    document.body.appendChild(modal);
    return modal;
  }

  function achTip(a) {
    var name = (a && a.name) || 'Ачивка';
    var id = String((a && (a.id || a.achievement_id)) || '').trim();
    if (name === id) name = 'Ачивка';
    var desc = (a && a.description) || '';
    return desc ? name + ' — ' + desc : name;
  }

  function achName(a) {
    var id = String((a && (a.id || a.achievement_id)) || '').trim();
    var raw = (a && a.name) || '';
    return raw && raw !== id ? raw : 'Ачивка';
  }

  function achCircleHtml(a) {
    var id = String((a && (a.id || a.achievement_id)) || '').trim();
    var tip = achTip(a);
    var icon = (a && a.icon) || '🏅';
    return (
      '<button type="button" class="user-profile-ach" data-ach-id="' + escapeHtml(id) + '" title="' + escapeHtml(tip) + '" aria-label="' + escapeHtml(tip) + '">' +
        '<span class="user-profile-ach-icon" aria-hidden="true">' + escapeHtml(icon) + '</span>' +
      '</button>'
    );
  }

  function ratingRowHtml(r) {
    var kp = r && r.kp_id;
    var title = escapeHtml(r.film_title || 'Фильм');
    var score = r.rating != null ? String(r.rating) : '—';
    return (
      '<button type="button" class="user-profile-rating-row" data-kp="' + escapeHtml(String(kp || '')) + '">' +
        '<span class="user-profile-rating-title">' + title + '</span>' +
        '<span class="user-profile-rating-score">' + escapeHtml(score) +
          '<span class="user-profile-rating-denom">/10</span></span>' +
      '</button>'
    );
  }

  function bindRatingRows(root) {
    root.querySelectorAll('.user-profile-rating-row[data-kp]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kp = btn.getAttribute('data-kp');
        if (kp) global.location.href = '/f/' + encodeURIComponent(String(kp).replace(/\D/g, ''));
      });
    });
  }

  function bindAchievements(root, achList) {
    var list = achList || [];
    root.querySelectorAll('.user-profile-ach[data-ach-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-ach-id');
        var a = list.find(function (x) {
          return String((x && (x.id || x.achievement_id)) || '') === String(id || '');
        });
        if (!a) return;
        var icon = (a && a.icon) || '🏅';
        var name = achName(a);
        var desc = (a && a.description) || '';
        simpleModal(
          '<div class="user-public-ach-detail-icon" aria-hidden="true">' + escapeHtml(icon) + '</div>' +
          '<h3 class="user-profile-block-title">' + escapeHtml(name) + '</h3>' +
          (desc ? '<p class="cabinet-hint">' + escapeHtml(desc) + '</p>' : '')
        );
      });
    });
  }

  function openAllAchievementsModal(achList, achTotal) {
    var items = achList || [];
    var grid = items.map(achCircleHtml).join('');
    var modal = simpleModal(
      '<h3 class="user-profile-block-title">Достижения</h3>' +
      '<p class="cabinet-hint user-profile-ach-sub-count">' +
        escapeHtml(String(items.length)) + ' из ' + escapeHtml(String(achTotal || items.length)) +
      '</p>' +
      '<div class="user-profile-ach-row user-profile-ach-row--full">' + grid + '</div>'
    );
    bindAchievements(modal, items);
  }

  function renderUserPublic(root, user, loginNow) {
    var uid = user.user_id;
    var name = user.name || 'Пользователь';
    var initial = String(name).trim().charAt(0).toUpperCase() || 'П';
    var photo = resolvePhoto(user.photo_url, uid);
    var achList = user.achievements || [];
    var achTotal = Number(user.achievements_count || achList.length || 0);
    var recent = (user.recent_ratings || []).slice(0, 12);
    var ratingsCount = Number(user.ratings_count || 0);
    var watchedCount = user.watched_count != null ? Number(user.watched_count) : null;

    var statsHtml =
      '<div class="user-profile-stats">' +
        '<div class="user-profile-stat user-profile-stat--static">' +
          '<span class="user-profile-stat-val">' + escapeHtml(String(ratingsCount)) + '</span>' +
          '<span class="user-profile-stat-label">оценок</span></div>' +
        (watchedCount != null
          ? '<div class="user-profile-stat user-profile-stat--static">' +
              '<span class="user-profile-stat-val">' + escapeHtml(String(watchedCount)) + '</span>' +
              '<span class="user-profile-stat-label">просмотрено</span></div>'
          : '') +
        '<div class="user-profile-stat user-profile-stat--static">' +
          '<span class="user-profile-stat-val">' + escapeHtml(String(achTotal)) + '</span>' +
          '<span class="user-profile-stat-label">ачивок</span></div>' +
      '</div>';

    var recentHtml = recent.length
      ? '<div class="user-profile-block">' +
          '<h3 class="user-profile-block-title">Последние оценки</h3>' +
          '<div class="user-profile-rating-list">' + recent.map(ratingRowHtml).join('') + '</div>' +
        '</div>'
      : '';

    var achHtml = achList.length || achTotal
      ? '<div class="user-profile-block" id="user-public-ach-block">' +
          '<div class="user-profile-block-head">' +
            '<h3 class="user-profile-block-title">Достижения</h3>' +
            (achTotal > 0
              ? '<button type="button" class="user-profile-ach-all" id="user-public-ach-all">Все достижения</button>'
              : '') +
          '</div>' +
          '<div class="user-profile-ach-row-wrap">' +
            '<div class="user-profile-ach-row">' + achList.map(achCircleHtml).join('') + '</div>' +
          '</div></div>'
      : '';

    root.innerHTML =
      '<article class="user-public-page user-profile-page">' +
        '<div class="user-profile-header">' +
          '<div class="user-profile-avatar">' +
            (photo
              ? '<img src="' + escapeHtml(photo) + '" alt="" loading="eager" referrerpolicy="no-referrer">'
              : escapeHtml(initial)) +
          '</div>' +
          '<div class="user-profile-head-text">' +
            '<h1 class="user-profile-name">' + escapeHtml(name) + '</h1>' +
          '</div>' +
        '</div>' +
        statsHtml +
        recentHtml +
        achHtml +
        '<div class="user-profile-actions user-public-actions">' +
          '<button type="button" class="btn btn-primary user-profile-action-main" id="user-public-add-friend">Добавить в друзья</button>' +
        '</div>' +
      '</article>';

    if (photo) {
      var img = root.querySelector('.user-profile-avatar img');
      if (img) {
        img.addEventListener('error', function () {
          var box = img.closest('.user-profile-avatar');
          if (box) box.textContent = initial;
        }, { once: true });
      }
    }

    bindRatingRows(root);
    bindAchievements(root, achList);

    var addBtn = document.getElementById('user-public-add-friend');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        if (loginNow) loginNow();
      });
    }

    var achAll = document.getElementById('user-public-ach-all');
    if (achAll) {
      achAll.addEventListener('click', function () {
        openAllAchievementsModal(achList, achTotal);
      });
    }
  }

  function pageLoadingHtml() {
    if (global.MpPageLoading && typeof MpPageLoading.html === 'function') {
      return MpPageLoading.html();
    }
    return '<div class="mp-page-loading" role="status" aria-live="polite" aria-busy="true" aria-label="Загрузка">'
      + '<div class="mp-page-loading-spinner" aria-hidden="true"></div></div>';
  }

  function loadPublicUser(userId, loginNow) {
    var root = document.getElementById('user-public-root');
    if (!root) return;
    root.innerHTML = pageLoadingHtml();
    fetch(API_BASE + '/api/public/user/' + encodeURIComponent(userId), { method: 'GET', mode: 'cors' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.success || !data.user) {
          root.innerHTML = '<p class="film-page-error-hint film-page-error-hint--centered">Профиль не найден</p>';
          return;
        }
        try { document.title = (data.user.name || 'Профиль') + ' · Movie Planner'; } catch (_e) {}
        renderUserPublic(root, data.user, loginNow);
      })
      .catch(function () {
        root.innerHTML = '<p class="film-page-error-hint film-page-error-hint--centered">Не удалось загрузить профиль</p>';
      });
  }

  function buildStandaloneHooks(userId, chrome, me) {
    var viewerUserId = me && me.user_id != null ? Number(me.user_id) : null;

    return {
      api: apiJson,
      viewerUserId: viewerUserId,
      resolvePhotoUrl: function (url, data) {
        return resolvePhoto(url, data && data.user_id);
      },
      onFilmKp: function (kp) {
        var norm = String(kp || '').replace(/\D/g, '');
        if (norm) global.location.href = '/f/' + norm;
      },
      onBack: function () {
        try {
          if (global.history.length > 1) global.history.back();
          else global.location.href = '/home';
        } catch (_e) {
          global.location.href = '/home';
        }
      },
      onTaste: function (uid) {
        apiJson('/api/friends/' + encodeURIComponent(String(uid)) + '/taste')
          .then(function (data) {
            var items = (data && data.items) || [];
            var body = items.length
              ? items.map(function (it) {
                  return '<div class="user-profile-taste-row">' +
                    '<span>' + escapeHtml(it.film_title || 'Фильм') + '</span>' +
                    '<strong>' + escapeHtml(String(it.my_rating)) + '/10 · ' + escapeHtml(String(it.friend_rating)) + '/10</strong></div>';
                }).join('')
              : '<p class="cabinet-hint">Пока нет фильмов, которые вы оба оценили</p>';
            simpleModal(
              '<h3 class="user-profile-block-title">Совпадение вкусов' +
              (data && data.taste_match != null ? ' · ' + escapeHtml(String(data.taste_match)) + '%' : '') +
              '</h3>' + body
            );
          })
          .catch(function () { showToast('Не удалось загрузить', true); });
      },
      onMutual: function (uid) {
        apiJson('/api/friends/watch-together?with_user_id=' + encodeURIComponent(String(uid)))
          .then(function (data) {
            if (!data || data.success === false) {
              showToast(data && data.error === 'not_friends' ? 'Сначала добавьте в друзья' : 'Не удалось загрузить', true);
              return;
            }
            var films = (data && data.mutual_films) || [];
            var body = films.length
              ? '<div class="user-profile-mutual-list">' + films.map(function (f) {
                  var kp = f.kp_id;
                  return '<button type="button" class="user-profile-rating-row" data-kp="' + escapeHtml(String(kp || '')) + '">' +
                    '<span class="user-profile-rating-title">' + escapeHtml(f.title || 'Фильм') + '</span></button>';
                }).join('') + '</div>'
              : '<p class="cabinet-hint">Нет общих непросмотренных фильмов</p>';
            var modal = simpleModal('<h3 class="user-profile-block-title">🎬 Смотрим вместе</h3>' + body);
            modal.querySelectorAll('[data-kp]').forEach(function (btn) {
              btn.addEventListener('click', function () {
                var kp = btn.getAttribute('data-kp');
                if (kp) global.location.href = '/f/' + kp;
              });
            });
          })
          .catch(function () { showToast('Не удалось загрузить', true); });
      },
      toast: function (msg, type) {
        showToast(msg, type === 'error');
      },
      onTitle: function (name) {
        try { document.title = (name || 'Профиль') + ' · Movie Planner'; } catch (_e) {}
      },
      onLoginNeeded: function () {
        if (chrome && chrome.loginNow) chrome.loginNow();
      },
    };
  }

  function loadAuthedUser(userId, chrome) {
    var root = document.getElementById('user-public-root');
    if (!root || !global.MpUserProfile || typeof global.MpUserProfile.mount !== 'function') {
      loadPublicUser(userId, chrome && chrome.loginNow);
      return Promise.resolve();
    }
    return apiJson('/api/site/me')
      .then(function (me) {
        return global.MpUserProfile.mount(root, userId, buildStandaloneHooks(userId, chrome, me));
      })
      .catch(function () {
        return global.MpUserProfile.mount(root, userId, buildStandaloneHooks(userId, chrome, null));
      });
  }

  function loadUserContent(userId, chrome) {
    if (mpToken()) return loadAuthedUser(userId, chrome);
    loadPublicUser(userId, chrome && chrome.loginNow);
    return Promise.resolve();
  }

  function standaloneHeaderSearchHtml() {
    if (global.MpFilmPage && typeof MpFilmPage.standaloneHeaderSearchHtml === 'function') {
      return MpFilmPage.standaloneHeaderSearchHtml();
    }
    return '<div class="header-search" id="header-search" role="search">' +
      '<span class="header-search-icon" aria-hidden="true">🔍</span>' +
      '<input type="text" id="header-search-input" class="header-search-input" placeholder="Найти фильм или сериал…" autocomplete="off" aria-label="Поиск">' +
      '<button type="button" class="header-search-mic" id="header-search-mic" aria-label="Голосовой ввод" title="Голосовой ввод">🎤</button>' +
      '<button type="button" class="header-search-clear hidden" id="header-search-clear" aria-label="Очистить">×</button>' +
      '<div class="header-search-dropdown hidden" id="header-search-dropdown" role="listbox"></div>' +
    '</div>';
  }

  function renderUserShell(userId) {
    document.body.innerHTML =
      '<div class="page-shell user-standalone-shell">' +
        '<header id="site-header">' +
          '<div class="header-content">' +
            '<a class="logo" href="/"><img src="/images/icon48.png" alt="Movie Planner"><span>Movie Planner</span></a>' +
            standaloneHeaderSearchHtml() +
            '<div class="header-buttons">' +
              '<button type="button" class="btn-primary" id="login-btn">Войти</button>' +
            '</div>' +
          '</div>' +
        '</header>' +
        (global.MpFilmPage && MpFilmPage.appOpenBannerHtml ? MpFilmPage.appOpenBannerHtml() : '') +
        '<main class="movie-page user-standalone-main">' +
          '<div class="user-public-content" id="user-public-root">' + pageLoadingHtml() + '</div>' +
        '</main>' +
        '<footer class="footer user-standalone-footer">' +
          '<div class="container"><p class="footer-bottom muted small">© ' + String(new Date().getFullYear()) + ' Movie Planner</p></div>' +
        '</footer>' +
      '</div>';

    var chrome = null;
    if (global.MpFilmPage && MpFilmPage.initStandaloneSiteChrome) {
      chrome = MpFilmPage.initStandaloneSiteChrome({
        apiBase: API_BASE,
        mainSelector: 'main.user-standalone-main',
        spaReturnPath: '/u/' + userId,
        onLoginSuccess: function () {
          loadUserContent(userId, chrome);
        },
      });
    }

    if (global.MpAppOpenBanner && MpAppOpenBanner.setupAppOpenBanner) {
      MpAppOpenBanner.setupAppOpenBanner({ id: userId, kind: 'user' });
    } else if (global.MpFilmPage && MpFilmPage.setupAppOpenBanner) {
      MpFilmPage.setupAppOpenBanner({ id: userId, kind: 'user' });
    }

    loadUserContent(userId, chrome);
  }

  function bootstrap(opts) {
    opts = opts || {};
    var userId = String(opts.userId || '').replace(/\D/g, '');
    if (!userId) return;

    try {
      document.body.classList.add('user-standalone-page');
      document.body.classList.add('film-standalone-page');
    } catch (_e) {}
    renderUserShell(userId);
  }

  global.MpUserPage = { bootstrap: bootstrap, API_BASE: API_BASE };
})(typeof window !== 'undefined' ? window : this);
