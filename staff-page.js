/**
 * Standalone actor/person page (/s/:kp) for guests and logged-in users.
 */
(function (global) {
  'use strict';

  var SITE_ORIGIN = (global.MpApiConfig && global.MpApiConfig.SITE_ORIGIN) || 'https://movie-planner.ru';
  var API_BASE = (global.MpApiConfig && global.MpApiConfig.API_ORIGIN) || SITE_ORIGIN;

  var PERSON_FILMS_PREVIEW_PRIMARY = 21;
  var PERSON_FILMS_PREVIEW_OTHER = 14;
  var PERSON_FILM_BATCH_PRIMARY = 21;
  var PERSON_FILM_BATCH_OTHER = 14;
  var MP_POSTER_PLACEHOLDER = '/images/film-poster-placeholder.png';
  var MP_PERSON_PLACEHOLDER = '/images/person-avatar-placeholder.png';
  var _staffLastData = null;
  var _staffExpandedRoles = {};
  var _staffRoleHasMore = {};
  var _staffPrimaryRoleKey = '';
  var _staffFilterState = { year: '', genre: '', mainRolesOnly: false, friendsRatedOnly: false };
  var _staffSortMode = 'default';
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

  function sortRolesForDisplay(roles) {
    var primary = ['ACTOR', 'DIRECTOR', 'WRITER', 'PRODUCER'];
    function key(block) {
      var rk = String(block.role_key || block.role_name || '').toUpperCase();
      var total = parseInt(block.total, 10);
      if (isNaN(total)) total = (block.films || []).length;
      if (rk === 'UNCREDITED') return [3, 0, rk];
      if (rk === 'CAMEO') return [2, 0, rk];
      var pri = primary.indexOf(rk);
      if (pri >= 0) return [0, -total, pri];
      return [1, -total, rk];
    }
    return (roles || []).slice().sort(function (a, b) {
      var ka = key(a);
      var kb = key(b);
      for (var i = 0; i < 3; i++) {
        if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
      }
      return 0;
    });
  }

  function sortFilmsForDisplay(films) {
    var list = (films || []).slice();
    if (_staffSortMode === 'rating_desc') {
      return list.sort(function (a, b) {
        var ra = parseFloat(a.rating);
        var rb = parseFloat(b.rating);
        if (isNaN(ra)) ra = 0;
        if (isNaN(rb)) rb = 0;
        if (rb !== ra) return rb - ra;
        return (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0);
      });
    }
    if (_staffSortMode === 'year_asc') {
      return list.sort(function (a, b) {
        return (parseInt(a.year, 10) || 9999) - (parseInt(b.year, 10) || 9999);
      });
    }
    if (_staffSortMode === 'year_desc') {
      return list.sort(function (a, b) {
        return (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0);
      });
    }
    return list;
  }

  function resolvePrimaryRoleKey(roles) {
    var sorted = sortRolesForDisplay(roles || []);
    if (!sorted.length) return '';
    return String(sorted[0].role_key || '').toUpperCase();
  }

  function personFilmPreviewLimit(roleKey) {
    var rk = String(roleKey || '').toUpperCase();
    var primary = _staffPrimaryRoleKey || resolvePrimaryRoleKey(
      (_staffLastData && _staffLastData.films_by_role) || []
    );
    return primary && rk === primary ? PERSON_FILMS_PREVIEW_PRIMARY : PERSON_FILMS_PREVIEW_OTHER;
  }

  function personFilmBatchLimit(roleKey) {
    var rk = String(roleKey || '').toUpperCase();
    var primary = _staffPrimaryRoleKey || resolvePrimaryRoleKey(
      (_staffLastData && _staffLastData.films_by_role) || []
    );
    return primary && rk === primary ? PERSON_FILM_BATCH_PRIMARY : PERSON_FILM_BATCH_OTHER;
  }

  function sortRolesByFilmCount(roles) {
    return sortRolesForDisplay(roles);
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
    if (!parts.length && person.professions) {
      parts.push(String(person.professions).slice(0, 96));
    }
    if (!parts.length) return '';
    return '<p class="staff-hero-meta">' + escapeHtml(parts.join(' · ')) + '</p>';
  }

  function countStaffFilmsWithState(state) {
    var total = 0;
    ((_staffLastData && _staffLastData.films_by_role) || []).forEach(function (block) {
      total += filterPersonFilmsClient(block.films || [], state).length;
    });
    return total;
  }

  function staffToggleChipAvailability() {
    var base = {
      year: _staffFilterState.year || '',
      genre: _staffFilterState.genre || '',
      mainRolesOnly: !!_staffFilterState.mainRolesOnly,
      friendsRatedOnly: !!_staffFilterState.friendsRatedOnly,
    };
    return {
      mainDisabled: !base.mainRolesOnly && countStaffFilmsWithState(Object.assign({}, base, { mainRolesOnly: true })) === 0,
      friendsDisabled: !base.friendsRatedOnly && countStaffFilmsWithState(Object.assign({}, base, { friendsRatedOnly: true })) === 0,
    };
  }

  function staffToggleChipAttrs(kind, avail) {
    var disabled = kind === 'main' ? avail.mainDisabled : avail.friendsDisabled;
    var on = kind === 'main' ? !!_staffFilterState.mainRolesOnly : !!_staffFilterState.friendsRatedOnly;
    return ' class="chip' + (on ? ' chip-on' : '') + (disabled ? ' chip-disabled' : '') + '"'
      + (disabled ? ' disabled aria-disabled="true"' : ' aria-disabled="false"')
      + ' aria-pressed="' + (on ? 'true' : 'false') + '"';
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
    var avail = staffToggleChipAvailability();
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
          '<button type="button"' + staffToggleChipAttrs('main', avail) + ' id="staff-toggle-main">Главные роли</button>' +
          '<button type="button"' + staffToggleChipAttrs('friends', avail) + ' id="staff-toggle-friends">Друзья хорошо оценили</button>' +
        '</div>' +
        '<div class="person-filters-sort">' +
          '<span class="person-filter-k">Сортировка</span>' +
          '<button type="button" class="chip' + (_staffSortMode === 'rating_desc' ? ' chip-on' : '') + '" id="staff-sort-rating" aria-pressed="' + (_staffSortMode === 'rating_desc' ? 'true' : 'false') + '">По оценке</button>' +
          '<button type="button" class="chip' + (_staffSortMode === 'year_desc' ? ' chip-on' : '') + '" id="staff-sort-year-desc" aria-pressed="' + (_staffSortMode === 'year_desc' ? 'true' : 'false') + '">Сначала новые</button>' +
          '<button type="button" class="chip' + (_staffSortMode === 'year_asc' ? ' chip-on' : '') + '" id="staff-sort-year-asc" aria-pressed="' + (_staffSortMode === 'year_asc' ? 'true' : 'false') + '">Сначала старые</button>' +
        '</div>' +
      '</div>'
    );
  }

  function cleanStaffPoster(src) {
    var s = String(src || '').trim();
    if (!s || /no-poster|kinopoiskapiunofficial/i.test(s)) return '';
    return s;
  }

  function cleanStaffPersonPhoto(src) {
    var s = String(src || '').trim();
    if (!s || /no-poster/i.test(s)) return '';
    return s;
  }

  function staffFilmPosterHtml(poster, kpId) {
    var kp = String(kpId || '').replace(/\D/g, '');
    var p = cleanStaffPoster(poster);
    var src = p;
    if (!src) src = MP_POSTER_PLACEHOLDER;
    var phCls = src === MP_POSTER_PLACEHOLDER ? ' mp-poster-placeholder' : '';
    return (
      '<img class="staff-film-poster' + phCls + '" src="' + escapeHtml(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer" ' +
      (kp ? ('data-kp="' + escapeHtml(kp) + '" ') : '') +
      'onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">'
    );
  }

  function bindStaffImportButtons(root, personId) {
    if (!root) return;
    root.querySelectorAll('.staff-import-btn').forEach(function (btn) {
      if (btn._staffImportBound) return;
      btn._staffImportBound = true;
      btn.addEventListener('click', function () {
        var rk = btn.getAttribute('data-role-key') || '';
        var ids = btn._importIds || [];
        if (!mpToken()) {
          if (_staffLoginNow) _staffLoginNow('staff_import');
          else if (global.MpPublicFilmLogin) global.MpPublicFilmLogin.open('staff_import');
          return;
        }
        if (!rk || !ids.length) {
          if (global.showToast) global.showToast('Все фильмы уже в базе');
          return;
        }
        if (!window.confirm('Добавить ' + ids.length + ' фильмов в базу?')) return;
        btn.disabled = true;
        var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mpToken() };
        fetch(API_BASE + '/api/site/persons/' + encodeURIComponent(personId) + '/import', {
          method: 'POST',
          mode: 'cors',
          headers: headers,
          body: JSON.stringify({ role_key: rk, film_kp_ids: ids }),
        }).then(function (r) { return r.json(); }).then(function (res) {
          if (res && res.success) {
            if (global.showToast) global.showToast('Добавлено: ' + (res.added || 0));
            loadStaff(personId);
          } else if (global.showToast) {
            global.showToast((res && res.error) || 'Импорт не удался');
          }
        }).catch(function () {
          if (global.showToast) global.showToast('Ошибка сети');
        }).finally(function () { btn.disabled = false; });
      });
    });
  }

  function filmGridHtml(films, roleKey, roleTotal) {
    var all = sortFilmsForDisplay(films || []);
    if (!all.length) return '';
    var previewLimit = personFilmPreviewLimit(roleKey);
    var expanded = !!_staffExpandedRoles[roleKey];
    var chunk = expanded ? all : all.slice(0, previewLimit);
    var grid = '<div class="staff-film-grid">' + chunk.map(function (f) {
      var kp = String(f.kp_id || '').replace(/\D/g, '');
      if (!kp) return '';
      var poster = staffFilmPosterHtml(f.poster, kp);
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
    var totalHint = Math.max(all.length, parseInt(roleTotal, 10) || 0);
    if (!expanded && totalHint > previewLimit) {
      grid += (
        '<button type="button" class="staff-role-expand" data-role-expand="' + escapeHtml(roleKey || '') + '">' +
          'Развернуть · ' + (totalHint - previewLimit) +
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
      var importable = filtered.filter(function (f) { return f.importable !== false; }).map(function (f) { return String(f.kp_id || ''); });
      return (
        '<section class="staff-role-block">' +
          '<div class="staff-role-head"><h2>' + escapeHtml(roleTitle) + '</h2>' +
          '<button type="button" class="link-inline staff-import-btn" data-role-key="' + escapeHtml(roleKey) + '">В базу →' +
          (importable.length ? (' (' + importable.length + ')') : '') + '</button></div>' +
          filmGridHtml(filtered, roleKey, block.total || filtered.length) +
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
        if (mainBtn.disabled || mainBtn.classList.contains('chip-disabled')) return;
        _staffFilterState.mainRolesOnly = !_staffFilterState.mainRolesOnly;
        paintStaffRoles();
      });
    }
    if (friendsBtn) {
      friendsBtn.addEventListener('click', function () {
        if (friendsBtn.disabled || friendsBtn.classList.contains('chip-disabled')) return;
        if (!mpToken()) {
          _staffPendingFriendsFilter = true;
          if (_staffLoginNow) _staffLoginNow('person_friends');
          else if (global.MpPublicFilmLogin) global.MpPublicFilmLogin.open('person_friends');
          else showStaffLoginModal();
          return;
        }
        _staffFilterState.friendsRatedOnly = !_staffFilterState.friendsRatedOnly;
        paintStaffRoles();
      });
    }
    function bindSortChip(id, mode) {
      var el = root.querySelector(id);
      if (!el) return;
      el.addEventListener('click', function () {
        _staffSortMode = _staffSortMode === mode ? 'default' : mode;
        paintStaffRoles();
      });
    }
    bindSortChip('#staff-sort-rating', 'rating_desc');
    bindSortChip('#staff-sort-year-desc', 'year_desc');
    bindSortChip('#staff-sort-year-asc', 'year_asc');
    root.querySelectorAll('[data-role-expand]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var rk = btn.getAttribute('data-role-expand') || '';
        if (!rk) return;
        _staffExpandedRoles[rk] = true;
        paintStaffRoles();
        if (_staffRoleHasMore[rk] && _staffPersonId) {
          var block = (_staffLastData.films_by_role || []).find(function (b) {
            return String(b.role_key || '') === rk;
          });
          var loaded = block && block.films ? block.films.length : 0;
          loadStaffRoleFilmsBackground(_staffPersonId, rk, loaded).catch(function () {});
        }
      });
    });
  }

  function showStaffLoginModal() {
    if (typeof global.showLoginModalOverlay === 'function') {
      global.showLoginModalOverlay();
      return;
    }
    var modal = document.getElementById('login-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('login-only-overlay');
    }
  }

  function updateStaffToggleChips(filtersRoot) {
    if (!filtersRoot) return;
    var avail = staffToggleChipAvailability();
    var mainBtn = filtersRoot.querySelector('#staff-toggle-main');
    var friendsBtn = filtersRoot.querySelector('#staff-toggle-friends');
    if (mainBtn) {
      mainBtn.classList.toggle('chip-on', !!_staffFilterState.mainRolesOnly);
      mainBtn.classList.toggle('chip-disabled', !!avail.mainDisabled);
      mainBtn.disabled = !!avail.mainDisabled;
      mainBtn.setAttribute('aria-pressed', _staffFilterState.mainRolesOnly ? 'true' : 'false');
      mainBtn.setAttribute('aria-disabled', avail.mainDisabled ? 'true' : 'false');
    }
    if (friendsBtn) {
      friendsBtn.classList.toggle('chip-on', !!_staffFilterState.friendsRatedOnly);
      friendsBtn.classList.toggle('chip-disabled', !!avail.friendsDisabled);
      friendsBtn.disabled = !!avail.friendsDisabled;
      friendsBtn.setAttribute('aria-pressed', _staffFilterState.friendsRatedOnly ? 'true' : 'false');
      friendsBtn.setAttribute('aria-disabled', avail.friendsDisabled ? 'true' : 'false');
    }
  }

  function paintStaffRoles() {
    var root = staffContentRoot();
    if (!root || !_staffLastData) return;
    var rolesRoot = root.querySelector('#staff-roles-root');
    if (rolesRoot) rolesRoot.innerHTML = rolesHtml(_staffLastData.films_by_role || []);
    var filtersRoot = root.querySelector('#staff-person-filters');
    if (filtersRoot) {
      var yearEl = filtersRoot.querySelector('#staff-filter-year');
      var genreEl = filtersRoot.querySelector('#staff-filter-genre');
      if (yearEl) yearEl.value = _staffFilterState.year || '';
      if (genreEl) genreEl.value = _staffFilterState.genre || '';
      updateStaffToggleChips(filtersRoot);
      var sortRating = filtersRoot.querySelector('#staff-sort-rating');
      var sortYearDesc = filtersRoot.querySelector('#staff-sort-year-desc');
      var sortYearAsc = filtersRoot.querySelector('#staff-sort-year-asc');
      if (sortRating) sortRating.classList.toggle('chip-on', _staffSortMode === 'rating_desc');
      if (sortYearDesc) sortYearDesc.classList.toggle('chip-on', _staffSortMode === 'year_desc');
      if (sortYearAsc) sortYearAsc.classList.toggle('chip-on', _staffSortMode === 'year_asc');
      if (yearEl && _staffGlobalFilters.years && _staffGlobalFilters.years.length) {
        var cur = yearEl.innerHTML;
        var next = yearOptionsHtml();
        if (cur !== next) yearEl.innerHTML = next;
      }
      if (genreEl && _staffGlobalFilters.genres && _staffGlobalFilters.genres.length) {
        var curG = genreEl.innerHTML;
        var nextG = genreOptionsHtml();
        if (curG !== nextG) genreEl.innerHTML = nextG;
      }
    }
    bindStaffFilters(root);
    if (_staffPersonId) bindStaffImportButtons(root, _staffPersonId);
  }

  function readMpRouteBoot() {
    try {
      var el = document.getElementById('mp-route-boot');
      if (!el) return null;
      return JSON.parse(el.textContent || '');
    } catch (_e) {
      return null;
    }
  }

  function bootMatchesPerson(boot, personId) {
    if (!boot || boot.type !== 'staff') return false;
    var bootKp = String(boot.kp_person_id || boot.kp_id || '').replace(/\D/g, '');
    var want = String(personId || _staffPersonId || '').replace(/\D/g, '');
    return !!(bootKp && want && bootKp === want);
  }

  function staffLoadingHtml(label) {
    var boot = readMpRouteBoot();
    var text = String(label || '').trim();
    if (!text && bootMatchesPerson(boot)) {
      text = boot.display_name || boot.name_ru || 'Загрузка…';
    }
    if (!text) text = 'Загрузка…';
    return (
      '<div class="mp-page-loading mp-route-boot-loading" role="status" aria-live="polite" aria-busy="true">' +
        '<div class="mp-page-loading-spinner" aria-hidden="true"></div>' +
        '<p class="mp-page-loading-text">' + escapeHtml(text) + '</p>' +
      '</div>'
    );
  }

  function staffBootHeroHtml() {
    var boot = readMpRouteBoot();
    if (!bootMatchesPerson(boot)) return staffLoadingHtml();
    var title = boot.display_name || boot.name_ru || 'Персона';
    var secondary = boot.name_en && boot.name_en !== boot.name_ru ? boot.name_en : '';
    var photo = cleanStaffPersonPhoto(String(boot.photo_url || '').trim()) || MP_PERSON_PLACEHOLDER;
    var photoHtml = photo
      ? '<img class="staff-hero-photo" src="' + escapeHtml(photo) + '" alt="" referrerpolicy="no-referrer" onerror="if(window.mpPersonOnError)window.mpPersonOnError(this);else{this.onerror=null;this.src=\'/images/person-avatar-placeholder.png\';}">'
      : '<div class="staff-hero-photo staff-hero-ph" aria-hidden="true">👤</div>';
    return (
      '<article class="staff-page staff-page--boot">' +
        '<header class="staff-hero">' + photoHtml +
          '<div class="staff-hero-text">' +
            '<h1 class="staff-hero-name">' + escapeHtml(title) + '</h1>' +
            (secondary ? '<p class="staff-hero-sub">' + escapeHtml(secondary) + '</p>' : '') +
          '</div>' +
        '</header>' +
        staffLoadingHtml('Фильмография…') +
      '</article>'
    );
  }

  function staffContentRoot() {
    return document.getElementById('staff-root') || document.getElementById('film-page-content');
  }

  function canUseInlineCabinetShell() {
    return !!(
      document.getElementById('film-page-content') &&
      document.getElementById('site-header') &&
      document.getElementById('cabinet-readonly')
    );
  }

  function bootstrapInlineCabinetShell(personId) {
    _staffPersonId = personId;
    try {
      document.body.classList.add('in-cabinet', 'staff-standalone-page');
      document.documentElement.classList.add('mp-staff-boot');
      var landing = document.getElementById('landing');
      if (landing) landing.classList.add('hidden');
      var cabinet = document.getElementById('cabinet-readonly');
      if (cabinet) {
        cabinet.classList.remove('hidden');
        cabinet.classList.add('film-page-mode');
      }
      document.querySelectorAll('#cabinet-readonly .cabinet-section').forEach(function (sec) {
        if (sec) sec.classList.toggle('hidden', sec.id !== 'section-film');
      });
      var hs = document.getElementById('header-search');
      if (hs) hs.classList.remove('hidden');
      var homeStats = document.getElementById('cabinet-home-stats');
      if (homeStats) homeStats.classList.add('hidden');
    } catch (_e) {}

    var pageRoot = document.getElementById('film-page-content');
    if (pageRoot) {
      pageRoot.className = 'container film-page-container staff-page-content';
      pageRoot.innerHTML = '<div id="staff-root" class="staff-page-content-inner">' + staffBootHeroHtml() + '</div>';
    }

    if (global.MpPublicFilmLogin) {
      global.MpPublicFilmLogin.init({
        kpId: personId,
        onSuccess: function () {
          if (_staffPendingFriendsFilter) {
            _staffPendingFriendsFilter = false;
            _staffFilterState.friendsRatedOnly = true;
          }
          loadStaff(personId);
        },
      });
      _staffLoginNow = function (action) {
        global.MpPublicFilmLogin.open(action || '');
      };
    } else {
      _staffLoginNow = function (action) {
        global.location.href = '/?open_login=1&__spa=' + encodeURIComponent('/s/' + personId);
      };
    }
    document.querySelectorAll('[data-action="login"], #login-btn').forEach(function (btn) {
      if (btn._staffInlineLoginBound) return;
      btn._staffInlineLoginBound = true;
      btn.addEventListener('click', function (e) {
        if (mpToken()) return;
        e.preventDefault();
        if (_staffLoginNow) _staffLoginNow('');
      });
    });
  }

  function guestCabinetNavHtml() {
    if (global.MpFilmPage && typeof MpFilmPage.standaloneNavHtml === 'function') {
      return MpFilmPage.standaloneNavHtml();
    }
    return '';
  }

  function bindGuestCabinetNav() {
    document.querySelectorAll('#film-standalone-nav .cabinet-nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        var href = btn.getAttribute('href') || '/';
        if (mpToken()) return;
        var path = href.replace(/\/$/, '') || '/';
        if (path === '/home' || path === '/premieres' || path === '/') return;
        e.preventDefault();
        if (_staffLoginNow) _staffLoginNow('nav');
        else global.location.href = '/?open_login=1&__spa=' + encodeURIComponent('/s/' + _staffPersonId);
      });
    });
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
        (global.MpAppOpenBanner && MpAppOpenBanner.appOpenBannerHtml ? MpAppOpenBanner.appOpenBannerHtml() : '') +
        '<main class="movie-page staff-standalone-main">' +
          '<div class="staff-page-content" id="staff-root">' + staffBootHeroHtml() + '</div>' +
        '</main>' +
        '<aside id="staff-seo-root" class="film-seo-root visually-hidden" aria-label="Об актёре"></aside>' +
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
    bindGuestCabinetNav();
    if (global.MpFilmPage && typeof MpFilmPage.mountStandaloneCabinetNav === 'function') {
      MpFilmPage.mountStandaloneCabinetNav('main.staff-standalone-main');
    }
  }

  function applyStaffSeoFromApi(staffPayload) {
    if (!staffPayload || !staffPayload.success || !staffPayload.staff) return;
    var s = staffPayload.staff;
    try {
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
      if (s.page_title) document.title = s.page_title;
      if (s.meta_description) {
        meta('name', 'description', s.meta_description);
        meta('property', 'og:description', s.meta_description);
        meta('name', 'twitter:description', s.meta_description);
      }
      if (s.meta_keywords) meta('name', 'keywords', s.meta_keywords);
      if (s.canonical) {
        var link = head.querySelector('link[rel="canonical"]');
        if (!link) {
          link = document.createElement('link');
          link.rel = 'canonical';
          head.appendChild(link);
        }
        link.href = s.canonical;
      }
      if (s.json_ld) {
        var ld = head.querySelector('#staff-jsonld');
        if (!ld) {
          ld = document.createElement('script');
          ld.type = 'application/ld+json';
          ld.id = 'staff-jsonld';
          head.appendChild(ld);
        }
        ld.textContent = JSON.stringify(s.json_ld);
      }
      if (s.seo_body_html) {
        var seoRoot = document.getElementById('staff-seo-root');
        if (seoRoot) seoRoot.innerHTML = s.seo_body_html;
      }
    } catch (_e) {}
  }

  function setPageFavicon(imgUrl) {
    var url = String(imgUrl || '').trim();
    if (!url) return;
    var head = document.head;
    ['icon', 'apple-touch-icon'].forEach(function (rel) {
      var el = head.querySelector('link[rel="' + rel + '"]');
      if (!el) {
        el = document.createElement('link');
        el.rel = rel;
        head.appendChild(el);
      }
      el.href = url;
    });
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
        setPageFavicon(photo);
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
    var root = staffContentRoot();
    if (!root) return;
    if (!data || !data.success) {
      root.innerHTML = '<p class="film-page-error-hint">Не удалось загрузить</p>';
      return;
    }
    var person = data.person || {};
    _staffLastData = data;
    _staffRoleHasMore = {};
    _staffPrimaryRoleKey = resolvePrimaryRoleKey(data.films_by_role || []);
    _staffGlobalFilters = data.filters || { years: [], genres: [] };
    var titleName = person.display_name || person.name_ru || person.name_en || 'Персона';
    var secondaryName = person.secondary_name || (
      person.name_en && person.name_en !== person.name_ru ? person.name_en : ''
    );
    document.title = titleName + ' · Movie Planner';
    setStaffOg(person, personId);

    var personPhoto = cleanStaffPersonPhoto(person.photo) || MP_PERSON_PLACEHOLDER;
    var photo = personPhoto
      ? '<img class="staff-hero-photo" src="' + escapeHtml(personPhoto) + '" alt="" referrerpolicy="no-referrer" onerror="if(window.mpPersonOnError)window.mpPersonOnError(this);else{this.onerror=null;this.src=\'/images/person-avatar-placeholder.png\';}">'
      : '<div class="staff-hero-photo staff-hero-ph" aria-hidden="true">👤</div>';

    root.innerHTML =
      '<article class="staff-page">' +
        '<header class="staff-hero">' + photo +
          '<div class="staff-hero-text">' +
            '<h1 class="staff-hero-name">' + escapeHtml(titleName) + '</h1>' +
            (secondaryName
              ? '<p class="staff-hero-sub">' + escapeHtml(secondaryName) + '</p>' : '') +
            staffMetaLine(person) +
          '</div>' +
        '</header>' +
        filtersBarHtml() +
        '<div id="staff-roles-root">' + rolesHtml(data.films_by_role || []) + '</div>' +
      '</article>';

    bindStaffFilters(root);
    bindStaffImportButtons(root, personId);
    root.querySelectorAll('.staff-import-btn').forEach(function (btn) {
      var rk = btn.getAttribute('data-role-key') || '';
      var block = (_staffLastData.films_by_role || []).find(function (b) {
        return String(b.role_key || '') === rk;
      });
      var filtered = block ? filterPersonFilmsClient(block.films || [], _staffFilterState) : [];
      btn._importIds = filtered.map(function (f) { return String(f.kp_id || ''); }).filter(Boolean);
    });
  }

  function mergeStaffFilmsBatch(roleKey, batchFilms, append) {
    if (!_staffLastData || !Array.isArray(_staffLastData.films_by_role)) return;
    var rk = String(roleKey || '').toUpperCase();
    var block = (_staffLastData.films_by_role || []).find(function (b) {
      return String(b.role_key || '').toUpperCase() === rk;
    });
    if (!block) {
      block = { role_key: rk, role_name: rk, films: [] };
      _staffLastData.films_by_role.push(block);
    }
    var incoming = batchFilms || [];
    if (append) block.films = (block.films || []).concat(incoming);
    else block.films = incoming.slice();
  }

  function loadStaffRoleFilms(personId, roleKey, offset, limitOverride) {
    var off = Math.max(0, parseInt(offset, 10) || 0);
    var lim = limitOverride != null ? parseInt(limitOverride, 10) : personFilmBatchLimit(roleKey);
    if (isNaN(lim) || lim < 1) lim = personFilmBatchLimit(roleKey);
    var url = API_BASE + '/api/public/person/' + encodeURIComponent(personId) +
      '/films?role=' + encodeURIComponent(roleKey) + '&offset=' + off + '&limit=' + lim;
    return fetch(url, { method: 'GET', mode: 'cors' })
      .then(function (r) {
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then(function (batch) {
        if (!batch || !batch.success) return batch;
        mergeStaffFilmsBatch(roleKey, batch.films || [], off > 0);
        _staffRoleHasMore[roleKey] = !!batch.has_more;
        var block = (_staffLastData.films_by_role || []).find(function (b) {
          return String(b.role_key || '') === String(roleKey || '');
        });
        if (block && batch.total != null) block.total = batch.total;
        paintStaffRoles();
        return batch;
      });
  }

  function loadStaffRoleFilmsBackground(personId, roleKey, offset) {
    return loadStaffRoleFilms(personId, roleKey, offset).then(function (batch) {
      if (!batch || !batch.has_more || !_staffExpandedRoles[roleKey]) return;
      var block = (_staffLastData.films_by_role || []).find(function (b) {
        return String(b.role_key || '') === String(roleKey || '');
      });
      var nextOff = block && block.films ? block.films.length : offset;
      return loadStaffRoleFilmsBackground(personId, roleKey, nextOff);
    });
  }

  function loadStaffRolesProgressive(personId, rolesMeta) {
    var pending = (rolesMeta || []).filter(function (rm) {
      return rm && rm.role_key && (rm.total > 0);
    });
    if (!pending.length) return Promise.resolve();

    var primary = pending[0];
    var rest = pending.slice(1);
    var primaryLim = PERSON_FILM_BATCH_PRIMARY;
    return loadStaffRoleFilms(personId, primary.role_key, 0, primaryLim).then(function () {
      var idx = 0;
      function loadNextPair() {
        if (idx >= rest.length) return Promise.resolve();
        var pair = rest.slice(idx, idx + 2);
        idx += 2;
        return Promise.all(pair.map(function (rm) {
          var batchLim = PERSON_FILM_BATCH_OTHER;
          return loadStaffRoleFilms(personId, rm.role_key, 0, batchLim).catch(function () {});
        })).then(loadNextPair);
      }
      return loadNextPair();
    });
  }

  function loadStaffProgressive(personId) {
    return fetch(API_BASE + '/api/public/person/' + encodeURIComponent(personId) + '/head', { method: 'GET', mode: 'cors' })
      .then(function (r) {
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then(function (head) {
        if (!head || !head.success) throw new Error('head');
        var rolesMeta = head.roles || [];
        _staffPrimaryRoleKey = rolesMeta.length
          ? String(rolesMeta[0].role_key || '').toUpperCase()
          : '';
        var filmsByRole = rolesMeta.map(function (rm) {
          return {
            role_key: rm.role_key,
            role_name: rm.role_name || rm.role_key,
            films: [],
            total: rm.total || 0,
          };
        });
        renderStaffData({
          success: true,
          person: head.person || {},
          filters: head.filters || { years: [], genres: [] },
          films_by_role: filmsByRole,
        }, personId);
        return loadStaffRolesProgressive(personId, rolesMeta);
      });
  }

  function loadStaffLegacy(personId, authed) {
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
      });
  }

  function loadStaff(personId) {
    var loadPromise = loadStaffProgressive(personId);
    return loadPromise
      .then(function () {
        fetch(API_BASE + '/api/public/staff/' + encodeURIComponent(personId), { method: 'GET', mode: 'cors' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (seo) { applyStaffSeoFromApi(seo); })
          .catch(function () {});
      })
      .catch(function (err) {
        var root = staffContentRoot();
        if (!root) return;
        var msg = (err && String(err.message || err).indexOf('http_404') >= 0)
          ? 'Не удалось загрузить фильмографию. Попробуйте обновить страницу.'
          : 'Ошибка сети';
        root.innerHTML = '<p class="film-page-error-hint">' + msg + '</p>';
      });
  }

  function markRouteReady() {
    try {
      document.documentElement.classList.remove('mp-route-pending');
      document.documentElement.classList.add('mp-route-ready');
    } catch (_e) {}
  }

  function bootstrap(opts) {
    opts = opts || {};
    var personId = String(opts.personId || '').replace(/\D/g, '');
    if (!personId) {
      markRouteReady();
      return;
    }
    markRouteReady();
    try { document.body.classList.add('film-standalone-page', 'staff-standalone-page'); } catch (_e) {}
    if (canUseInlineCabinetShell()) {
      bootstrapInlineCabinetShell(personId);
    } else {
      renderStaffShell(personId);
    }
    loadStaff(personId);
  }

  global.MpStaffPage = { bootstrap: bootstrap, API_BASE: API_BASE };
})(typeof window !== 'undefined' ? window : this);
