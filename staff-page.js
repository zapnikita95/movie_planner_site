/**
 * Standalone actor/person page (/s/:kp) for guests and logged-in users.
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

  var PERSON_FILMS_PREVIEW = 20;
  var _staffLastData = null;
  var _staffExpandedRoles = {};
  var _staffFilterState = { year: '', genre: '', mainRolesOnly: false, friendsRatedOnly: false };
  var _staffPersonId = '';
  var _staffLoginNow = null;
  var _staffPendingFriendsFilter = false;
  var _staffGlobalFilters = { years: [], genres: [] };

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
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

  function filterPersonFilmsClient(films, state) {
    var st = state || {};
    var genreL = String(st.genre || '').trim().toLowerCase();
    var yearExact = st.year != null && st.year !== '' ? parseInt(st.year, 10) : null;
    return (films || []).filter(function (f) {
      if (!f || !f.kp_id) return false;
      var yr = f.year != null ? parseInt(f.year, 10) : null;
      if (yearExact != null && yr !== yearExact) return false;
      if (genreL) {
        var gblob = (f.genres || []).join(' ').toLowerCase();
        if (gblob.indexOf(genreL) < 0) return false;
      }
      if (st.mainRolesOnly) {
        var cr = f.cast_rank;
        if (cr == null || parseInt(cr, 10) > 3) return false;
      }
      if (st.friendsRatedOnly) {
        if (!f.friend_rated_high) return false;
        if (f.watched || f.has_rating) return false;
      }
      return true;
    });
  }

  function sortRolesByFilmCount(roles) {
    return (roles || []).slice().sort(function (a, b) {
      return (b.films || []).length - (a.films || []).length;
    });
  }

  function staffMetaLine(person) {
    if (!person) return '';
    var parts = [];
    if (person.birth_year) {
      var y = String(person.birth_year);
      if (person.death_year) y += ' — ' + person.death_year;
      parts.push(y);
    }
    if (person.country) parts.push(String(person.country));
    if (!parts.length) return '';
    return '<p class="staff-hero-meta">' + escapeHtml(parts.join(' · ')) + '</p>';
  }

  function yearOptionsHtml() {
    var years = _staffGlobalFilters.years || [];
    var opts = '<option value="">Любой</option>';
    years.forEach(function (y) {
      var sel = String(_staffFilterState.year) === String(y) ? ' selected' : '';
      opts += '<option value="' + y + '"' + sel + '>' + y + '</option>';
    });
    return opts;
  }

  function genreOptionsHtml() {
    var genres = _staffGlobalFilters.genres || [];
    var opts = '<option value="">Любой</option>';
    genres.forEach(function (g) {
      var sel = _staffFilterState.genre === g ? ' selected' : '';
      opts += '<option value="' + escapeHtml(g) + '"' + sel + '>' + escapeHtml(g) + '</option>';
    });
    return opts;
  }

  function filtersBarHtml() {
    return (
      '<div class="person-filters" id="staff-person-filters">' +
        '<div class="person-filters-row">' +
          '<label class="person-filter-field">' +
            '<span class="person-filter-k">Год</span>' +
            '<select class="person-filter-select" id="staff-filter-year">' + yearOptionsHtml() + '</select>' +
          '</label>' +
          '<label class="person-filter-field">' +
            '<span class="person-filter-k">Жанр</span>' +
            '<select class="person-filter-select" id="staff-filter-genre">' + genreOptionsHtml() + '</select>' +
          '</label>' +
        '</div>' +
        '<div class="person-filters-toggles">' +
          '<button type="button" class="chip' + (_staffFilterState.mainRolesOnly ? ' chip-on' : '') + '" id="staff-toggle-main" aria-pressed="' + (_staffFilterState.mainRolesOnly ? 'true' : 'false') + '">Главные роли</button>' +
          '<button type="button" class="chip' + (_staffFilterState.friendsRatedOnly ? ' chip-on' : '') + '" id="staff-toggle-friends" aria-pressed="' + (_staffFilterState.friendsRatedOnly ? 'true' : 'false') + '">Друзья хорошо оценили</button>' +
        '</div>' +
      '</div>'
    );
  }

  function filmGridHtml(films, roleKey) {
    var all = films || [];
    if (!all.length) return '';
    var expanded = !!_staffExpandedRoles[roleKey];
    var chunk = expanded ? all : all.slice(0, PERSON_FILMS_PREVIEW);
    var grid = '<div class="staff-film-grid">' + chunk.map(function (f) {
      var kp = String(f.kp_id || '').replace(/\D/g, '');
      if (!kp) return '';
      var poster = f.poster
        ? '<img class="staff-film-poster" src="' + escapeHtml(f.poster) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
        : '<div class="staff-film-poster staff-film-ph">🎬</div>';
      var rating = f.rating != null && !isNaN(Number(f.rating))
        ? '<span class="staff-film-rating">' + escapeHtml(String(f.rating)) + '</span>'
        : '';
      return (
        '<a class="staff-film-card" href="/f/' + encodeURIComponent(kp) + '">' +
          '<div class="staff-film-media">' + poster + rating + '</div>' +
          '<div class="staff-film-title">' + escapeHtml(f.title || '—') + '</div>' +
          (f.year ? '<div class="staff-film-year">' + escapeHtml(String(f.year)) + '</div>' : '') +
        '</a>'
      );
    }).join('') + '</div>';
    if (!expanded && all.length > PERSON_FILMS_PREVIEW) {
      grid += (
        '<button type="button" class="staff-role-expand" data-role-expand="' + escapeHtml(roleKey || '') + '">' +
          'Развернуть · ' + (all.length - PERSON_FILMS_PREVIEW) +
        '</button>'
      );
    }
    return grid;
  }

  function rolesHtml(roles) {
    return sortRolesByFilmCount(roles).map(function (block) {
      var roleTitle = block.role_name || block.role_key || '';
      var roleKey = block.role_key || roleTitle;
      var filtered = filterPersonFilmsClient(block.films || [], _staffFilterState);
      if (!filtered.length) return '';
      return (
        '<section class="staff-role-block">' +
          '<div class="staff-role-head"><h2>' + escapeHtml(roleTitle) + '</h2>' +
          '<span class="staff-role-count">' + filtered.length + '</span></div>' +
          filmGridHtml(filtered, roleKey) +
        '</section>'
      );
    }).join('');
  }

  function bindStaffFilters(root) {
    if (!root) return;
    var yearEl = root.querySelector('#staff-filter-year');
    var genreEl = root.querySelector('#staff-filter-genre');
    var mainBtn = root.querySelector('#staff-toggle-main');
    var friendsBtn = root.querySelector('#staff-toggle-friends');

    if (yearEl) {
      yearEl.addEventListener('change', function (e) {
        _staffFilterState.year = e.target.value || '';
        paintStaffRoles();
      });
    }
    if (genreEl) {
      genreEl.addEventListener('change', function (e) {
        _staffFilterState.genre = e.target.value || '';
        paintStaffRoles();
      });
    }
    if (mainBtn) {
      mainBtn.addEventListener('click', function () {
        _staffFilterState.mainRolesOnly = !_staffFilterState.mainRolesOnly;
        paintStaffRoles();
      });
    }
    if (friendsBtn) {
      friendsBtn.addEventListener('click', function () {
        if (!mpToken()) {
          _staffPendingFriendsFilter = true;
          if (_staffLoginNow) _staffLoginNow('person_friends');
          else if (global.MpPublicFilmLogin) global.MpPublicFilmLogin.open('person_friends');
          return;
        }
        _staffFilterState.friendsRatedOnly = !_staffFilterState.friendsRatedOnly;
        paintStaffRoles();
      });
    }
    root.querySelectorAll('[data-role-expand]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var rk = btn.getAttribute('data-role-expand') || '';
        if (!rk) return;
        _staffExpandedRoles[rk] = true;
        paintStaffRoles();
      });
    });
  }

  function paintStaffRoles() {
    var root = document.getElementById('staff-root');
    if (!root || !_staffLastData) return;
    var rolesRoot = root.querySelector('#staff-roles-root');
    if (rolesRoot) rolesRoot.innerHTML = rolesHtml(_staffLastData.films_by_role || []);
    var filtersRoot = root.querySelector('#staff-person-filters');
    if (filtersRoot) {
      var yearEl = filtersRoot.querySelector('#staff-filter-year');
      var genreEl = filtersRoot.querySelector('#staff-filter-genre');
      var mainBtn = filtersRoot.querySelector('#staff-toggle-main');
      var friendsBtn = filtersRoot.querySelector('#staff-toggle-friends');
      if (yearEl) yearEl.value = _staffFilterState.year || '';
      if (genreEl) genreEl.value = _staffFilterState.genre || '';
      if (mainBtn) {
        mainBtn.classList.toggle('chip-on', !!_staffFilterState.mainRolesOnly);
        mainBtn.setAttribute('aria-pressed', _staffFilterState.mainRolesOnly ? 'true' : 'false');
      }
      if (friendsBtn) {
        friendsBtn.classList.toggle('chip-on', !!_staffFilterState.friendsRatedOnly);
        friendsBtn.setAttribute('aria-pressed', _staffFilterState.friendsRatedOnly ? 'true' : 'false');
      }
    }
    bindStaffFilters(root);
  }

  function renderStaffShell(personId) {
    _staffPersonId = personId;
    document.title = 'Персона · Movie Planner';
    document.body.innerHTML =
      '<div class="page-shell staff-standalone-shell">' +
        '<header id="site-header">' +
          '<div class="header-content">' +
            '<a class="logo" href="/"><img src="/images/icon48.png" alt="Movie Planner"><span>Movie Planner</span></a>' +
            '<div class="header-search" id="header-search" role="search">' +
              '<span class="header-search-icon" aria-hidden="true">🔍</span>' +
              '<input type="text" id="header-search-input" class="header-search-input" placeholder="Найти фильм или сериал…" autocomplete="off" aria-label="Поиск">' +
              '<button type="button" class="header-search-mic" id="header-search-mic" aria-label="Голосовой ввод" title="Голосовой ввод">🎤</button>' +
              '<button type="button" class="header-search-clear hidden" id="header-search-clear" aria-label="Очистить">×</button>' +
              '<div class="header-search-dropdown hidden" id="header-search-dropdown" role="listbox"></div>' +
            '</div>' +
            '<div class="header-buttons">' +
              '<button type="button" class="btn-primary" id="login-btn">Войти</button>' +
            '</div>' +
          '</div>' +
        '</header>' +
        (global.MpFilmPage && MpFilmPage.appOpenBannerHtml ? MpFilmPage.appOpenBannerHtml() : '') +
        '<main class="movie-page staff-standalone-main">' +
          '<div class="staff-page-content" id="staff-root"><p class="staff-loading">Загрузка…</p></div>' +
        '</main>' +
        '<footer class="footer staff-standalone-footer">' +
          '<div class="container"><p class="footer-bottom muted small">© ' + String(new Date().getFullYear()) + ' Movie Planner</p></div>' +
        '</footer>' +
      '</div>';

    if (global.MpFilmPage && MpFilmPage.initStandaloneSiteChrome) {
      MpFilmPage.initStandaloneSiteChrome({
        apiBase: API_BASE,
        mainSelector: 'main.staff-standalone-main',
        spaReturnPath: '/s/' + personId,
        onLoginSuccess: function () {
          if (_staffPendingFriendsFilter) {
            _staffPendingFriendsFilter = false;
            _staffFilterState.friendsRatedOnly = true;
          }
          loadStaff(personId);
        },
      });
      _staffLoginNow = function (action) {
        if (global.MpPublicFilmLogin) {
          global.MpPublicFilmLogin.open(action || '');
          return;
        }
        global.location.href = '/?open_login=1&__spa=' + encodeURIComponent('/s/' + personId);
      };
    }
    if (global.MpAppOpenBanner && MpAppOpenBanner.setupAppOpenBanner) {
      MpAppOpenBanner.setupAppOpenBanner({ id: personId, kind: 'person' });
    } else if (global.MpFilmPage && MpFilmPage.setupAppOpenBanner) {
      MpFilmPage.setupAppOpenBanner({ id: personId, kind: 'person' });
    }
  }

  function setStaffOg(person, personId) {
    try {
      var name = (person && (person.name_ru || person.name_en)) || 'Персона';
      var pageUrl = global.location.origin + '/s/' + personId;
      var photo = person && person.photo ? String(person.photo) : '';
      var prof = person && person.profession_keys && person.profession_keys.length
        ? person.profession_keys.join(', ')
        : '';
      var desc = prof
        ? (name + ' — ' + prof + '. Фильмография на Movie Planner.')
        : (name + ' — фильмография, роли и фильмы на Movie Planner.');
      var head = document.head;
      function meta(attr, key, content) {
        if (!content) return;
        var el = head.querySelector('meta[' + attr + '="' + key + '"]');
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute(attr, key);
          head.appendChild(el);
        }
        el.setAttribute('content', content);
      }
      document.title = name + ' · Movie Planner';
      meta('property', 'og:type', 'profile');
      meta('property', 'og:url', pageUrl);
      meta('property', 'og:title', name);
      meta('property', 'og:site_name', 'Movie Planner');
      meta('property', 'og:locale', 'ru_RU');
      meta('property', 'og:description', desc);
      if (photo) {
        meta('property', 'og:image', photo);
        meta('property', 'og:image:secure_url', photo);
        meta('property', 'og:image:width', '400');
        meta('property', 'og:image:height', '400');
        meta('property', 'og:image:alt', 'Фото: ' + name);
        meta('name', 'twitter:image', photo);
        meta('name', 'twitter:image:alt', 'Фото: ' + name);
      }
      meta('name', 'twitter:card', photo ? 'summary_large_image' : 'summary');
      meta('name', 'twitter:title', name);
      meta('name', 'twitter:description', desc);
      meta('name', 'description', desc);
      meta('name', 'robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
      var link = head.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        head.appendChild(link);
      }
      link.setAttribute('href', pageUrl);

      var ld = head.querySelector('#staff-jsonld');
      if (!ld) {
        ld = document.createElement('script');
        ld.type = 'application/ld+json';
        ld.id = 'staff-jsonld';
        head.appendChild(ld);
      }
      var payload = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: name,
        url: pageUrl,
        image: photo || undefined,
        sameAs: 'https://www.kinopoisk.ru/name/' + personId + '/',
      };
      if (person && person.birth_year) payload.birthDate = String(person.birth_year) + '-01-01';
      if (person && person.death_year) payload.deathDate = String(person.death_year) + '-01-01';
      if (person && person.country) {
        payload.nationality = { '@type': 'Country', name: String(person.country) };
      }
      ld.textContent = JSON.stringify(payload);
    } catch (_e) {}
  }

  function renderStaffData(data, personId) {
    var root = document.getElementById('staff-root');
    if (!root) return;
    if (!data || !data.success) {
      root.innerHTML = '<p class="film-page-error-hint">Не удалось загрузить</p>';
      return;
    }
    var person = data.person || {};
    _staffLastData = data;
    _staffGlobalFilters = data.filters || { years: [], genres: [] };
    var titleName = person.name_ru || person.name_en || 'Персона';
    document.title = titleName + ' · Movie Planner';
    setStaffOg(person, personId);

    var photo = person.photo
      ? '<img class="staff-hero-photo" src="' + escapeHtml(person.photo) + '" alt="" referrerpolicy="no-referrer">'
      : '<div class="staff-hero-photo staff-hero-ph" aria-hidden="true">👤</div>';

    root.innerHTML =
      '<article class="staff-page">' +
        '<header class="staff-hero">' + photo +
          '<div class="staff-hero-text">' +
            '<h1 class="staff-hero-name">' + escapeHtml(titleName) + '</h1>' +
            (person.name_en && person.name_en !== person.name_ru
              ? '<p class="staff-hero-sub">' + escapeHtml(person.name_en) + '</p>' : '') +
            staffMetaLine(person) +
          '</div>' +
        '</header>' +
        filtersBarHtml() +
        '<div id="staff-roles-root">' + rolesHtml(data.films_by_role || []) + '</div>' +
      '</article>';

    bindStaffFilters(root);
  }

  function loadStaff(personId) {
    var authed = !!mpToken();
    var url = authed
      ? API_BASE + '/api/site/persons/' + encodeURIComponent(personId)
      : API_BASE + '/api/public/person/' + encodeURIComponent(personId);
    var headers = authed ? mpAuthHeaders() : {};
    return fetch(url, { method: 'GET', mode: 'cors', headers: headers })
      .then(function (r) {
        if (r.status === 401 && authed) {
          return fetch(API_BASE + '/api/public/person/' + encodeURIComponent(personId), { method: 'GET', mode: 'cors' })
            .then(function (r2) {
              if (!r2.ok) throw new Error('http_' + r2.status);
              return r2.json();
            });
        }
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then(function (d) {
        renderStaffData(d, personId);
        if (_staffFilterState.friendsRatedOnly && mpToken()) {
          paintStaffRoles();
        }
      })
      .catch(function () {
        var root = document.getElementById('staff-root');
        if (root) root.innerHTML = '<p class="film-page-error-hint">Ошибка сети</p>';
      });
  }

  function bootstrap(opts) {
    opts = opts || {};
    var personId = String(opts.personId || '').replace(/\D/g, '');
    if (!personId) return;
    try { document.body.classList.add('film-standalone-page', 'staff-standalone-page'); } catch (_e) {}
    renderStaffShell(personId);
    loadStaff(personId);
  }

  global.MpStaffPage = { bootstrap: bootstrap, API_BASE: API_BASE };
})(typeof window !== 'undefined' ? window : this);
