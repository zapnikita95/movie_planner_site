/**
 * Standalone actor/person page (/s/:kp) for guests and logged-in users.
 */
(function (global) {
  'use strict';

  var API_BASE = (function () {
    try {
      var h = global.location.hostname || '';
      if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') return 'https://api.movie-planner.ru';
    } catch (_e) {}
    return 'https://api.movie-planner.ru';
  })();

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
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

  function filmGridHtml(films) {
    var chunk = (films || []).slice(0, 80);
    if (!chunk.length) return '<p class="staff-empty-role muted small">Нет фильмов</p>';
    return '<div class="staff-film-grid">' + chunk.map(function (f) {
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
  }

  function renderStaffShell(personId) {
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
      });
    }
  }

  function setStaffOg(person, personId) {
    try {
      var name = (person && (person.name_ru || person.name_en)) || 'Персона';
      var pageUrl = global.location.origin + '/s/' + personId;
      var photo = person && person.photo ? String(person.photo) : '';
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
      meta('property', 'og:type', 'profile');
      meta('property', 'og:url', pageUrl);
      meta('property', 'og:title', name + ' · Movie Planner');
      meta('property', 'og:site_name', 'Movie Planner');
      if (photo) meta('property', 'og:image', photo);
      meta('name', 'twitter:card', photo ? 'summary_large_image' : 'summary');
      meta('name', 'twitter:title', name + ' · Movie Planner');
      if (photo) meta('name', 'twitter:image', photo);
      meta('name', 'robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
      meta(
        'name',
        'description',
        (person && (person.name_ru || person.name_en)
          ? ('Фильмография: ' + String(person.name_ru || person.name_en) + ' — фильмы и роли.')
          : 'Страница персоны и фильмография в Movie Planner')
      );
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
    var roles = data.films_by_role || [];
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
        roles.map(function (block) {
          var roleTitle = block.role_name || block.role_key || '';
          var films = block.films || [];
          if (!films.length) return '';
          return (
            '<section class="staff-role-block">' +
              '<div class="staff-role-head"><h2>' + escapeHtml(roleTitle) + '</h2>' +
              '<span class="staff-role-count">' + films.length + '</span></div>' +
              filmGridHtml(films) +
            '</section>'
          );
        }).join('') +
      '</article>';
  }

  function loadStaff(personId) {
    return fetch(API_BASE + '/api/public/person/' + encodeURIComponent(personId), { method: 'GET', mode: 'cors' })
      .then(function (r) {
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then(function (d) {
        renderStaffData(d, personId);
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
