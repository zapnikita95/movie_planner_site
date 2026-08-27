/**
 * Shared standalone film page (/f/:kp) for guests and authenticated users.
 */
(function (global) {
  'use strict';

  var SITE_ORIGIN = (global.MpApiConfig && global.MpApiConfig.SITE_ORIGIN) || 'https://movie-planner.ru';
  var API_BASE = (function () {
    try {
      var h = (global.location && global.location.hostname) || '';
      if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') return SITE_ORIGIN;
    } catch (_e) {}
    return (global.MpApiConfig && global.MpApiConfig.API_ORIGIN) || SITE_ORIGIN;
  })();

  // TMDB en-US genre names → RU pills (never paint Drama/Comedy on apex).
  var TMDB_GENRE_EN_RU = {
    Action: 'боевик', Adventure: 'приключения', Animation: 'мультфильм',
    Comedy: 'комедия', Crime: 'криминал', Documentary: 'документальный',
    Drama: 'драма', Family: 'семейный', Fantasy: 'фэнтези', History: 'история',
    Horror: 'ужасы', Music: 'музыка', Mystery: 'детектив', Romance: 'мелодрама',
    'Science Fiction': 'фантастика', 'TV Movie': 'телевизионный фильм',
    Thriller: 'триллер', War: 'военный', Western: 'вестерн'
  };
  function localizeGenreLabel(label) {
    var raw = String(label || '').trim();
    if (!raw) return '';
    if (/[а-яА-ЯёЁ]/.test(raw)) return raw;
    if (TMDB_GENRE_EN_RU[raw]) return TMDB_GENRE_EN_RU[raw];
    var titled = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    if (TMDB_GENRE_EN_RU[titled]) return TMDB_GENRE_EN_RU[titled];
    var keys = Object.keys(TMDB_GENRE_EN_RU);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === raw.toLowerCase()) return TMDB_GENRE_EN_RU[keys[i]];
    }
    return raw;
  }
  function localizeGenresStr(genresStr) {
    return String(genresStr || '')
      .split(/[,;/|]+/)
      .map(function (s) { return localizeGenreLabel(s); })
      .filter(Boolean)
      .join(', ');
  }

  function ensureHeaderFilmTitleSlot() {
    var header = document.getElementById('site-header');
    var content = header && header.querySelector('.header-content');
    if (!content) return null;
    var el = document.getElementById('header-film-title');
    if (!el) {
      el = document.createElement('div');
      el.id = 'header-film-title';
      el.className = 'header-film-title';
      el.setAttribute('aria-live', 'polite');
      content.appendChild(el);
    }
    return el;
  }

  function setFilmHeaderTitle(name) {
    var el = ensureHeaderFilmTitleSlot();
    if (!el) return;
    var t = String(name || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
    el.textContent = t;
    el.title = t;
    try {
      if (global.MpHeaderSearchScroll && typeof global.MpHeaderSearchScroll.refresh === 'function') {
        global.MpHeaderSearchScroll.refresh();
      }
    } catch (_e) {}
  }

  /** Parse /f/123 or /f/movie-123 / /f/tv-123 / /f/fest-slug — KP ids stay bare numbers; TMDB uses prefix. */
  function parseFilmRoute(pathname) {
    var path = String(pathname || (global.location && global.location.pathname) || '');
    var m = path.match(/^\/f\/(movie|tv)-(\d+)\/?$/i);
    if (m) {
      var mt = String(m[1] || 'movie').toLowerCase();
      var tid = String(m[2] || '');
      return {
        mode: 'tmdb',
        mediaType: mt,
        tmdbId: tid,
        catalogId: mt + '-' + tid,
        kpId: '',
        festSlug: '',
        pathKey: mt + '-' + tid,
      };
    }
    m = path.match(/^\/f\/fest-([a-z0-9\-]+)\/?$/i);
    if (m) {
      var slug = String(m[1] || '').toLowerCase();
      return {
        mode: 'fest',
        mediaType: 'movie',
        tmdbId: '',
        catalogId: 'fest-' + slug,
        kpId: '',
        festSlug: slug,
        pathKey: 'fest-' + slug,
      };
    }
    m = path.match(/^\/f\/mp-(\d+)\/?$/i);
    if (m) {
      var mpId = String(m[1] || '');
      return {
        mode: 'mp',
        mediaType: '',
        tmdbId: '',
        catalogId: 'mp-' + mpId,
        kpId: '',
        festSlug: '',
        mpFilmId: mpId,
        pathKey: 'mp-' + mpId,
      };
    }
    m = path.match(/^\/f\/(\d+)\/?$/);
    if (m) {
      return {
        mode: 'kp',
        mediaType: '',
        tmdbId: '',
        catalogId: '',
        kpId: m[1],
        festSlug: '',
        pathKey: m[1],
      };
    }
    return null;
  }

  function appOpenBannerHtml() {
    if (global.MpAppOpenBanner && MpAppOpenBanner.appOpenBannerHtml) {
      return MpAppOpenBanner.appOpenBannerHtml();
    }
    return (
      '<div id="app-open-banner" class="app-open-banner hidden">' +
        '<span class="app-open-text">Открыть в приложении Movie Planner?</span>' +
        '<div class="app-open-actions">' +
          '<button type="button" class="btn-app-open" id="app-open-btn">Открыть</button>' +
          '<button type="button" class="btn-app-dismiss" id="app-dismiss-btn">Позже</button>' +
        '</div>' +
      '</div>'
    );
  }

  function setupAppOpenBanner(opts) {
    if (global.MpAppOpenBanner && MpAppOpenBanner.setupAppOpenBanner) {
      MpAppOpenBanner.setupAppOpenBanner(opts);
      return;
    }
  }


  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function formatExtRatingVotes(n) {
    var v = Number(n);
    if (!isFinite(v) || v <= 0) return '';
    if (v < 1000) return String(Math.round(v));
    if (v < 1000000) {
      var k = v / 1000;
      var s = k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, '');
      return s + ' тыс.';
    }
    var m = v / 1000000;
    return (m >= 10 ? String(Math.round(m)) : m.toFixed(1).replace(/\.0$/, '')) + ' млн';
  }

  function buildFilmExtRatingsInnerHtml(film) {
    if (!film) return '';
    var parts = [];
    var kp = film.rating_kp != null ? Number(film.rating_kp) : NaN;
    var imdb = film.rating_imdb != null ? Number(film.rating_imdb) : NaN;
    if (isFinite(kp) && kp > 0) {
      var kv = formatExtRatingVotes(film.rating_kp_votes);
      parts.push(
        '<span class="film-modal-rkp">КП ' +
          kp.toFixed(1) +
          (kv ? '<span class="film-ext-rating-votes"> · ' + escapeHtml(kv) + '</span>' : '') +
          '</span>'
      );
    }
    if (isFinite(imdb) && imdb > 0) {
      var iv = formatExtRatingVotes(film.rating_imdb_votes);
      parts.push(
        '<span class="film-modal-rkp">IMDb ' +
          imdb.toFixed(1) +
          (iv ? '<span class="film-ext-rating-votes"> · ' + escapeHtml(iv) + '</span>' : '') +
          '</span>'
      );
    }
    return parts.join('');
  }

  function buildFilmExtRatingsSkeletonInnerHtml() {
    return (
      '<span class="film-modal-rkp film-ext-rating-skel" aria-hidden="true">КП 0.0</span>' +
      '<span class="film-modal-rkp film-ext-rating-skel" aria-hidden="true">IMDb 0.0</span>'
    );
  }

  function buildFilmExtRatingsSlotHtml(film) {
    var inner = buildFilmExtRatingsInnerHtml(film);
    if (inner) {
      return '<div class="film-ext-ratings" id="film-ext-ratings" aria-label="Рейтинги">' + inner + '</div>';
    }
    // Reserve CLS space until API resolves — never start with [hidden]/display:none].
    return (
      '<div class="film-ext-ratings is-loading" id="film-ext-ratings" aria-hidden="true">' +
        buildFilmExtRatingsSkeletonInnerHtml() +
      '</div>'
    );
  }

  function buildFilmExtRatingsHtml(film) {
    var inner = buildFilmExtRatingsInnerHtml(film);
    if (!inner) return '';
    return '<div class="film-ext-ratings" aria-label="Рейтинги">' + inner + '</div>';
  }

  function buildFilmCastSkeletonHtml() {
    // Match final height: director + actors row (collapsed cast ≈ 1–2 lines).
    return (
      '<div class="film-cast-skeleton">' +
        '<div class="film-cast-row"><span class="film-cast-label">Режиссёр:</span> <span class="film-cast-skel-line"></span></div>' +
        '<div class="film-cast-row film-cast-actors"><span class="film-cast-label">Актёры:</span> <span class="film-cast-skel-line film-cast-skel-line-wide"></span></div>' +
      '</div>'
    );
  }

  function syncFilmExtRatings(root, film) {
    var scope = root || document;
    var hero = scope.querySelector
      ? (scope.querySelector('.film-hero-with-tag, section.hero') || scope)
      : document;
    if (!hero || !hero.querySelector) hero = document;
    var eyebrow = hero.querySelector('.eyebrow, #chips');
    var row = hero.querySelector('.film-ext-ratings');
    var inner = buildFilmExtRatingsInnerHtml(film);
    if (!row) {
      var tmp = document.createElement('div');
      tmp.innerHTML = buildFilmExtRatingsSlotHtml(film);
      var node = tmp.firstElementChild;
      if (!node) return;
      var stack = hero.querySelector('.film-hero-meta-stack');
      var metaLine = hero.querySelector('#film-meta-line, .film-meta-line');
      if (stack) stack.appendChild(node);
      else if (metaLine && metaLine.parentNode) metaLine.insertAdjacentElement('afterend', node);
      else if (eyebrow && eyebrow.parentNode) eyebrow.insertAdjacentElement('afterend', node);
      else {
        var title = hero.querySelector('#film-title, h1');
        if (title && title.parentNode) title.insertAdjacentElement('afterend', node);
      }
      return;
    }
    row.classList.remove('is-loading');
    row.removeAttribute('hidden');
    if (!inner) {
      row.innerHTML = '';
      row.classList.add('is-empty');
      row.setAttribute('aria-hidden', 'true');
      row.removeAttribute('aria-label');
      return;
    }
    row.classList.remove('is-empty');
    row.removeAttribute('aria-hidden');
    row.setAttribute('aria-label', 'Рейтинги');
    row.innerHTML = inner;
  }

  function ruPlural(n, one, few, many) {
    var num = Math.abs(Number(n) || 0);
    var mod10 = num % 10;
    var mod100 = num % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function seriesStatsChipLabels(stats) {
    var out = [];
    var sc = Number((stats && stats.seasons_count) || 0);
    var ec = Number((stats && stats.episodes_total) || 0);
    if (sc > 0) {
      out.push(sc + ' ' + ruPlural(sc, 'сезон', 'сезона', 'сезонов'));
    }
    if (ec > 0) {
      out.push(ec + ' ' + ruPlural(ec, 'серия', 'серии', 'серий'));
    }
    return out;
  }


  function primaryCountryLabel(countryStr) {
    var parts = String(countryStr || '')
      .split(/[,;/|]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    return parts[0] || '';
  }

  function formatFilmAgeRating(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    if (/\d+\+/.test(s)) return s.match(/\d+\+/)[0];
    var m = s.match(/(\d+)/);
    return m ? (m[1] + '+') : s;
  }

  function buildFilmMetaLineText(film) {
    if (!film) return '';
    var bits = [];
    if (film.year) bits.push(String(film.year));
    if (film.is_series) {
      seriesStatsChipLabels(film.series_stats).forEach(function (label) { bits.push(label); });
    } else {
      var dur = film.duration_min != null ? Number(film.duration_min) : NaN;
      if (!isFinite(dur) || dur <= 0) {
        dur = film.film_length != null ? Number(film.film_length) : NaN;
      }
      if (isFinite(dur) && dur > 0) bits.push(Math.round(dur) + ' мин.');
    }
    var age = formatFilmAgeRating(film.age_rating || film.rating_age || film.ratingAgeLimits);
    if (age) bits.push(age);
    var country = primaryCountryLabel(film.country);
    if (country) bits.push(country);
    return bits.join(' · ');
  }

  function buildFilmGenresLineText(genresStr, isSeries) {
    var parts = String(localizeGenresStr(genresStr) || '')
      .split(/[,;/|]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    if (!parts.length) parts = [isSeries ? 'сериал' : 'фильм'];
    return parts.slice(0, 8).join(' · ');
  }

  function pickFilmTitleEn(film) {
    if (!film) return '';
    var en = String(film.title_en || film.name_en || film.nameEn || film.original_title || film.nameOriginal || '').trim();
    if (!en) return '';
    if (/[а-яА-ЯёЁ]/.test(en)) return '';
    var ru = String(film.title || '').trim();
    if (ru && en.toLowerCase() === ru.toLowerCase()) return '';
    return en;
  }

  function ensureFilmHeroMetaStack(hero) {
    var content = (hero && hero.classList && hero.classList.contains('hero-content'))
      ? hero
      : (hero && hero.querySelector ? (hero.querySelector('.hero-content') || hero) : document);
    var titleEl = content.querySelector('#film-title, h1');
    var stack = content.querySelector('.film-hero-meta-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'film-hero-meta-stack';
      if (titleEl && titleEl.parentNode) {
        if (titleEl.nextSibling) titleEl.parentNode.insertBefore(stack, titleEl.nextSibling);
        else titleEl.parentNode.appendChild(stack);
      } else if (content.appendChild) {
        content.appendChild(stack);
      }
    }
    function ensureSlot(sel, id, className, tag) {
      var el = stack.querySelector(sel) || content.querySelector(sel);
      if (!el) {
        el = document.createElement(tag || 'p');
        if (id) el.id = id;
        el.className = className;
        stack.appendChild(el);
      } else if (el.parentNode !== stack) {
        stack.appendChild(el);
      }
      return el;
    }
    var enEl = ensureSlot('#film-title-en, .film-title-en', 'film-title-en', 'film-title-en', 'p');
    var genresEl = ensureSlot('#film-genres-line, .film-genres-line', 'film-genres-line', 'film-genres-line', 'p');
    var metaEl = ensureSlot('#film-meta-line, .film-meta-line', 'film-meta-line', 'film-meta-line', 'p');
    var ratings = content.querySelector('.film-ext-ratings');
    if (ratings && ratings.parentNode !== stack) stack.appendChild(ratings);
    // Hard order: EN → genres → meta → ratings
    var order = [enEl, genresEl, metaEl, ratings].filter(Boolean);
    order.forEach(function (node) { stack.appendChild(node); });
    var chips = content.querySelector('#chips, .eyebrow');
    if (chips) {
      chips.innerHTML = '';
      chips.setAttribute('hidden', '');
      chips.setAttribute('aria-hidden', 'true');
    }
    return { content: content, stack: stack, titleEl: titleEl, enEl: enEl, genresEl: genresEl, metaEl: metaEl, ratings: ratings };
  }

  function setReservedLine(el, text) {
    if (!el) return;
    var val = String(text || '').trim();
    if (val) {
      el.textContent = val;
      el.classList.remove('is-empty');
      el.removeAttribute('aria-hidden');
      el.removeAttribute('hidden');
    } else {
      /* No &nbsp; — empty EN/meta must collapse (visibility:hidden still ate a line). */
      el.textContent = '';
      el.classList.add('is-empty');
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('hidden', '');
    }
  }

  function readNavFilmTitleRu(kpId) {
    try {
      var key = 'mp_film_nav_title_ru_' + String(kpId || '').replace(/\D/g, '');
      if (!key || key.endsWith('_')) return '';
      var t = String(sessionStorage.getItem(key) || '').trim();
      if (t && /[а-яА-ЯёЁ]/.test(t)) return t;
    } catch (_e) {}
    return '';
  }

  function preferRuFilmTitle(apiTitle, kpId) {
    var api = String(apiTitle || '').trim();
    var nav = readNavFilmTitleRu(kpId);
    if (nav && (!api || !/[а-яА-ЯёЁ]/.test(api))) return nav;
    if (api && /[а-яА-ЯёЁ]/.test(api)) return api;
    if (nav) return nav;
    return api;
  }

  function syncFilmHeroMeta(root, film) {
    var scope = root && root.querySelector ? root : document;
    var hero = scope.querySelector
      ? (scope.querySelector('.film-hero-with-tag, section.hero, .hero-content') || scope)
      : document;
    if (!hero || !hero.querySelector) hero = document;
    var slots = ensureFilmHeroMetaStack(hero);
    var kpForTitle = film && (film.kp_id || film.kinopoiskId || film.id);
    var titleRu = preferRuFilmTitle(film && film.title, kpForTitle);
    // Never put Latin original into #film-title when we have a RU candidate.
    if (titleRu && !/[а-яА-ЯёЁ]/.test(titleRu)) {
      var enOnly = pickFilmTitleEn(film);
      if (enOnly && titleRu.toLowerCase() === enOnly.toLowerCase()) {
        var navRu = readNavFilmTitleRu(kpForTitle);
        if (navRu) titleRu = navRu;
      }
    }
    if (slots.titleEl && titleRu) {
      var cleanTitle = titleRu.replace(/\s*\(\d{4}\)\s*$/, '').trim() || titleRu;
      slots.titleEl.textContent = cleanTitle;
      setFilmHeaderTitle(cleanTitle);
    }
    setReservedLine(slots.enEl, pickFilmTitleEn(film));
    setReservedLine(slots.genresEl, buildFilmGenresLineText(film && film.genres, film && film.is_series));
    setReservedLine(slots.metaEl, buildFilmMetaLineText(film));
    var heroTag = scope.querySelector && scope.querySelector('.film-hero-with-tag');
    if (heroTag && film && film.genres) {
      heroTag.setAttribute('data-genres', String(film.genres));
    }
  }

  function cleanPosterUrl(src) {
    var s = String(src || '').trim();
    if (!s || /no-poster|kinopoiskapiunofficial\.tech\/images\/posters/i.test(s)) return '';
    return s;
  }

  /** Absolute URL for CSS url() — relative /api/ resolves against jsDelivr stylesheet and 404s. */
  function absoluteCssPosterUrl(src) {
    var s = cleanPosterUrl(src) || String(src || '').trim();
    if (!s || /film-poster-placeholder/i.test(s)) return '';
    if (/^https?:\/\//i.test(s)) {
      return s.replace(/^https?:\/\/api\.movie-planner\.ru/i, SITE_ORIGIN);
    }
    if (s.indexOf('//') === 0) return 'https:' + s;
    if (s.charAt(0) === '/') return SITE_ORIGIN + s;
    return s;
  }

  function filmBackdropCssValue(src) {
    var abs = absoluteCssPosterUrl(src);
    if (!abs) return '';
    return 'url("' + abs.replace(/"/g, '\\"') + '")';
  }

  /** KP CDN template path — often redirects to gray «K» (HTTP 200), so onerror never fires. */
  function isKpFilmCdnTemplateUrl(src, kpId) {
    var s = String(src || '').trim().toLowerCase();
    if (!s || s.indexOf('st.kp.yandex.net') < 0) return false;
    var kp = String(kpId || '').replace(/\D/g, '');
    if (kp && s.indexOf('iphone360_' + kp + '.jpg') >= 0) return true;
    if (kp && s.indexOf('/film_big/' + kp + '.jpg') >= 0) return true;
    if (/\/film_iphone\/iphone360_\d+\.jpg/.test(s)) return true;
    if (/\/images\/film_big\/\d+\.jpg/.test(s)) return true;
    return false;
  }

  function isMpBrandedFilmPoster(src) {
    return String(src || '').toLowerCase().indexOf('film-poster-placeholder') >= 0;
  }

  function isGoodFilmPosterUrl(src) {
    var s = cleanPosterUrl(src);
    if (!s) return false;
    if (/\/no-poster(?:\.|\/|$)/i.test(s)) return false;
    return /avatars\.mds\.yandex\.net|get-kinopoisk-image|image\.tmdb\.org|\/api\/public\/poster\/tmdb\/|st\.kp\.yandex\.net|film-poster-placeholder|person-avatar-placeholder/i.test(s);
  }

  function currentFilmPosterFromDom() {
    var img = document.getElementById('poster') || document.querySelector('#film-page-content .poster, #section-film .poster');
    if (!img) return '';
    return cleanPosterUrl(img.currentSrc || img.src || '');
  }

  var MP_POSTER_PLACEHOLDER = '/images/film-poster-placeholder.png';

  function filmSimilarEscape(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function similarRailDisplayTitle(s) {
    var t = String((s && s.title) || '').trim();
    var y = parseInt((s && s.year), 10);
    if (!t || !y || y < 1000) return t;
    if (/\(\d{4}\)\s*$/.test(t)) return t;
    // Unreleased / current-year upcoming: show year so empty poster is explained.
    if (y >= new Date().getFullYear()) return t + ' (' + y + ')';
    return t;
  }

  function similarRailPosterUrl(s) {
    var p = cleanPosterUrl((s && (s.poster || s.poster_thumb)) || '');
    var y = parseInt((s && s.year), 10);
    var upcoming = Number.isFinite(y) && y >= new Date().getFullYear();
    // Upcoming + KP CDN template → gray «K» with HTTP 200; use MP branded instead.
    if (upcoming && (!p || isKpFilmCdnTemplateUrl(p, s && s.kp_id))) {
      return MP_POSTER_PLACEHOLDER;
    }
    if (!p) return MP_POSTER_PLACEHOLDER;
    return p;
  }

  function similarTitleDedupeKey(title) {
    return String(title || '')
      .toLowerCase()
      .replace(/[\(\[\{]\s*\d{4}\s*[\)\]\}]\s*$/g, '')
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function dedupeSimilarByTitle(items) {
    var seen = Object.create(null);
    var out = [];
    (items || []).forEach(function (s) {
      var key = similarTitleDedupeKey(similarRailDisplayTitle(s) || (s && s.title) || '');
      if (key && seen[key]) return;
      if (key) seen[key] = 1;
      out.push(s);
    });
    return out;
  }

  function similarHasCyrillic(title) {
    return /[А-Яа-яЁё]/.test(String(title || ''));
  }

  function filterSimilarQuality(items) {
    // Drop short-collision junk: Latin-only titles / Film NNN / branded popcorn only.
    return (items || []).filter(function (s) {
      var title = similarRailDisplayTitle(s) || String((s && s.title) || '').trim();
      if (!title || /^(film|фильм|сериал|series)\s*\d+$/i.test(title)) return false;
      if (!similarHasCyrillic(title)) return false;
      var p = similarRailPosterUrl(s);
      if (!p || isMpBrandedFilmPoster(p)) return false;
      return true;
    });
  }

  function buildFilmPageSimilarSectionLite(similar) {
    similar = filterSimilarQuality(dedupeSimilarByTitle(similar));
    if (!similar || !similar.length) return '';
    var cards = similar.map(function (s) {
      var title = similarRailDisplayTitle(s);
      var p = similarRailPosterUrl(s);
      var ph = isMpBrandedFilmPoster(p);
      var img = '<img src="' + filmSimilarEscape(p) + '" alt="" loading="lazy" referrerpolicy="no-referrer"' +
        (ph ? ' class="mp-poster-placeholder"' : '') +
        ' onerror="if(window.mpPosterOnError)window.mpPosterOnError(this); else { this.onerror=null; this.src=\'' + MP_POSTER_PLACEHOLDER + '\'; }">';
      var inBase = s.in_base_film_id ? '<span class="similar-in-base">✓</span>' : '';
      var reason = String(s.reason || s.reason_label || '').trim();
      var reasonPill = reason
        ? '<span class="similar-reason-pill">' + filmSimilarEscape(reason) + '</span>'
        : '';
      var em = s.is_series ? '📺 ' : '🎬 ';
      var href = s.kp_id ? ('/f/' + encodeURIComponent(String(s.kp_id))) : '#';
      return (
        '<a href="' + href + '" class="similar-rail-card" data-similar-kp="' + filmSimilarEscape(String(s.kp_id || '')) + '" title="' + filmSimilarEscape(title) + '" role="listitem">' +
          '<div class="similar-rail-poster">' + img + reasonPill + inBase + '</div>' +
          '<div class="similar-rail-title">' + em + filmSimilarEscape(title) + '</div>' +
        '</a>'
      );
    }).join('');
    return (
      '<section class="film-page-similar-section" aria-label="Похожие">' +
        '<h2 class="section-title section-title--compact film-page-similar-title">' +
          '<span class="section-title-text gradient">Похожие</span>' +
        '</h2>' +
        '<div class="film-page-similar-rail-wrap">' +
          '<button type="button" class="film-page-similar-prev" aria-label="Назад по похожим">‹</button>' +
          '<div class="similar-rail home-rail--draggable film-page-similar-rail" role="list">' + cards + '</div>' +
          '<button type="button" class="film-page-similar-next" aria-label="Листать похожие">›</button>' +
        '</div>' +
      '</section>'
    );
  }

  function bindFilmPageSimilarRailDrag(rail) {
    if (!rail || rail._mpDragScrollBound) return;
    rail._mpDragScrollBound = true;
    rail.classList.add('home-rail--draggable');
    var active = false;
    var dragging = false;
    var startX = 0;
    var startScroll = 0;
    // Win/Playwright: micro-move during click used to set dragging + capture-phase
    // preventDefault → dead similar links. Only suppress clicks after a real drag
    // (timestamp), never kill the click via a live `dragging` flag race.
    var THRESH = 18;
    var suppressClickUntil = 0;
    rail.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest('input, select, textarea, .film-page-similar-prev, .film-page-similar-next')) return;
      active = true;
      dragging = false;
      startX = e.clientX;
      startScroll = rail.scrollLeft;
    });
    rail.addEventListener('pointermove', function (e) {
      if (!active) return;
      var dx = e.clientX - startX;
      if (!dragging && Math.abs(dx) > THRESH) {
        dragging = true;
        rail.classList.add('is-dragging');
        try { rail.setPointerCapture(e.pointerId); } catch (_c) {}
      }
      if (!dragging) return;
      e.preventDefault();
      rail.scrollLeft = startScroll - dx;
    });
    function endDrag(e) {
      var wasActive = active;
      var wasDragging = dragging;
      active = false;
      dragging = false;
      rail.classList.remove('is-dragging');
      if (wasActive) {
        try {
          if (e && e.pointerId != null) rail.releasePointerCapture(e.pointerId);
        } catch (_r) {}
      }
      if (wasDragging) suppressClickUntil = Date.now() + 450;
    }
    rail.addEventListener('pointerup', endDrag);
    rail.addEventListener('pointercancel', endDrag);
    rail.addEventListener('lostpointercapture', endDrag);
    // Kill native image/link drag ghost that steals the gesture on posters.
    rail.addEventListener('dragstart', function (e) { e.preventDefault(); });
    rail.addEventListener('click', function (e) {
      if (Date.now() >= suppressClickUntil) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  }

  function bindFilmPageSimilarRailNav(section) {
    if (!section) return;
    var rail = section.querySelector('.film-page-similar-rail');
    var prev = section.querySelector('.film-page-similar-prev');
    var next = section.querySelector('.film-page-similar-next');
    if (!rail || !next) return;
    bindFilmPageSimilarRailDrag(rail);
    if (next.dataset.mpSimilarNavBound === '1') return;
    next.dataset.mpSimilarNavBound = '1';
    function cardStep() {
      var card = rail.querySelector('.similar-rail-card');
      if (!card) return Math.max(160, Math.floor(rail.clientWidth * 0.72));
      var gap = 10;
      try {
        var st = global.getComputedStyle(rail);
        gap = parseFloat(st.columnGap || st.gap || '10') || 10;
      } catch (_e) {}
      return card.offsetWidth + gap;
    }
    function syncNav() {
      var n = rail.querySelectorAll('.similar-rail-card').length;
      var max = Math.max(0, rail.scrollWidth - rail.clientWidth);
      // ≤10 fit in one row — no arrows (ignore 1px overflow). Need real overflow to scroll.
      var canScroll = n > 10 && max > 24;
      var atStart = rail.scrollLeft <= 4;
      var atEnd = rail.scrollLeft >= max - 4;
      var hideNext = !canScroll || atEnd;
      var hidePrev = !canScroll || atStart;
      // Match arrow height to real poster (fluid cards on ≤374 make fixed CSS wrong).
      var poster = rail.querySelector('.similar-rail-poster');
      if (poster) {
        var ph = Math.round(poster.getBoundingClientRect().height);
        if (ph >= 40) {
          next.style.height = ph + 'px';
          if (prev) prev.style.height = ph + 'px';
        }
      }
      next.hidden = hideNext;
      next.classList.toggle('is-nav-off', !canScroll);
      next.classList.toggle('is-edge-hidden', canScroll && hideNext);
      next.classList.toggle('is-at-end', atEnd);
      next.setAttribute('aria-hidden', hideNext ? 'true' : 'false');
      if (prev) {
        prev.hidden = hidePrev;
        prev.classList.toggle('is-nav-off', !canScroll);
        prev.classList.toggle('is-edge-hidden', canScroll && hidePrev);
        prev.classList.toggle('is-at-start', atStart);
        prev.setAttribute('aria-hidden', hidePrev ? 'true' : 'false');
      }
    }
    function scrollByCards(dir) {
      var n = rail.querySelectorAll('.similar-rail-card').length;
      var max = Math.max(0, rail.scrollWidth - rail.clientWidth);
      if (n <= 10 || max <= 24) return;
      var step = cardStep() * 2;
      var nextLeft = rail.scrollLeft + dir * step;
      // Clamp — never wrap (wrap made › feel like ‹ near the end).
      if (dir > 0) nextLeft = Math.min(max, nextLeft);
      else nextLeft = Math.max(0, nextLeft);
      rail.scrollTo({ left: nextLeft, behavior: 'smooth' });
    }
    next.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      scrollByCards(1);
    });
    if (prev) {
      prev.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        scrollByCards(-1);
      });
    }
    rail.addEventListener('scroll', syncNav, { passive: true });
    try {
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(syncNav).observe(rail);
        var firstPoster = rail.querySelector('.similar-rail-poster');
        if (firstPoster) new ResizeObserver(syncNav).observe(firstPoster);
      }
    } catch (_ro) {}
    rail.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) img.addEventListener('load', syncNav, { once: true });
    });
    syncNav();
  }

  function insertFilmPageSimilarLite(pageRoot, html) {
    if (!pageRoot || !html) return;
    pageRoot.querySelectorAll('.film-page-similar-section').forEach(function (el) { el.remove(); });
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    var section = wrap.firstElementChild;
    if (!section) return;
    var promo = pageRoot.querySelector('.mp-public-promo');
    var hero = pageRoot.querySelector(':scope > section.hero, :scope > section.film-hero-with-tag, :scope > section');
    if (promo) promo.insertAdjacentElement('beforebegin', section);
    else if (hero) hero.insertAdjacentElement('afterend', section);
    else pageRoot.appendChild(section);
    section.querySelectorAll('.similar-rail-card[data-similar-kp]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        var kp = card.getAttribute('data-similar-kp');
        if (!kp) return;
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        global.location.href = '/f/' + encodeURIComponent(kp);
      });
    });
    bindFilmPageSimilarRailNav(section);
    try {
      if (!mpToken() && global.MpPublicPromo && typeof global.MpPublicPromo.mountAfterHero === 'function') {
        global.MpPublicPromo.mountAfterHero(pageRoot);
      }
    } catch (_e) {}
    try {
      if (global.MpMonetization && typeof global.MpMonetization.initFilmPageFromRoot === 'function') {
        global.MpMonetization.initFilmPageFromRoot(pageRoot);
      }
    } catch (_monSim) {}
    /* TAKPRODAM_SHELF_VERTICAL_LOOP */
    try {
      if (global.MpRsy && typeof global.MpRsy.mountFilmAfterSimilar === 'function') {
        global.MpRsy.mountFilmAfterSimilar();
      }
    } catch (_rsySim) {}
  }

  function mountFilmPageSimilarBlock(kpId, pageRoot) {
    if (global.MpFilmSimilar && typeof global.MpFilmSimilar.mount === 'function') {
      global.MpFilmSimilar.mount(kpId, pageRoot);
      return;
    }
    var kp = String(kpId || '').replace(/\D/g, '');
    if (!kp || !pageRoot) return;
    var seq = (mountFilmPageSimilarBlock._seq = (mountFilmPageSimilarBlock._seq || 0) + 1);
    var fetchOpts = { method: 'GET', mode: 'cors' };
    var tok = mpToken();
    if (tok) fetchOpts.headers = { Authorization: 'Bearer ' + tok };
    fetch(API_BASE + '/api/public/film/' + encodeURIComponent(kp) + '/similar?limit=24', fetchOpts)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (seq !== mountFilmPageSimilarBlock._seq) return;
        var items = (data && data.items) || [];
        if (!items.length) return;
        insertFilmPageSimilarLite(pageRoot, buildFilmPageSimilarSectionLite(items));
      })
      .catch(function () {});
  }

  function defaultPosterForKp(kpId) {
    var kp = String(kpId || '').replace(/\D/g, '');
    if (!kp) return MP_POSTER_PLACEHOLDER;
    var boot = readMpRouteBoot();
    if (boot && boot.poster_url) {
      var bootPoster = cleanPosterUrl(boot.poster_url);
      if (bootPoster) return bootPoster;
    }
    return MP_POSTER_PLACEHOLDER;
  }

  function resolveFilmPosterDisplay(posterUrl, kpId) {
    var next = cleanPosterUrl(posterUrl);
    if (next) return next;
    var cur = currentFilmPosterFromDom();
    if (cur) return cur;
    var fallback = defaultPosterForKp(kpId);
    if (fallback) return fallback;
    return MP_POSTER_PLACEHOLDER;
  }

  function setFilmHeroBackdrop(posterUrl, kpId) {
    var display = resolveFilmPosterDisplay(posterUrl, kpId);
    if (display === MP_POSTER_PLACEHOLDER && isGoodFilmPosterUrl(currentFilmPosterFromDom())) {
      display = currentFilmPosterFromDom();
    }
    var backdrop = filmBackdropCssValue(display);
    if (!backdrop) return;
    try {
      var hero = document.querySelector('.film-hero-with-tag, main.film-page .hero, #section-film .hero');
      if (hero) hero.style.setProperty('--film-backdrop', backdrop);
      document.documentElement.style.setProperty('--film-backdrop', backdrop);
    } catch (_e) {}
  }

  function applyFilmPosterEl(posterUrl, kpId) {
    var next = cleanPosterUrl(posterUrl);
    var cur = currentFilmPosterFromDom();
    if (!next) {
      if (isGoodFilmPosterUrl(cur)) {
        setFilmHeroBackdrop(cur, kpId);
        return;
      }
    }
    var display = next || defaultPosterForKp(kpId) || MP_POSTER_PLACEHOLDER;
    // Never replace our branded stub with KP CDN template (→ no-poster.gif / gray «K»).
    if (
      isMpBrandedFilmPoster(cur) &&
      isKpFilmCdnTemplateUrl(display, kpId) &&
      !isMpBrandedFilmPoster(display)
    ) {
      setFilmHeroBackdrop(cur, kpId);
      return;
    }
    var pEl = document.getElementById('poster');
    // Gray «K» CDN is "good" URL but must lose to branded when API says so.
    if (
      pEl &&
      isGoodFilmPosterUrl(cur) &&
      !isMpBrandedFilmPoster(cur) &&
      !isKpFilmCdnTemplateUrl(cur, kpId) &&
      !/no-poster/i.test(String(cur || '')) &&
      display === MP_POSTER_PLACEHOLDER
    ) {
      setFilmHeroBackdrop(cur, kpId);
      return;
    }
    if (pEl) {
      pEl.src = display;
      pEl.setAttribute('referrerpolicy', 'no-referrer');
      pEl.classList.toggle('mp-poster-placeholder', display.indexOf('film-poster-placeholder') >= 0);
      pEl.onerror = function () {
        if (global.mpPosterOnError) global.mpPosterOnError(this);
        else { this.onerror = null; this.src = MP_POSTER_PLACEHOLDER; this.classList.add('mp-poster-placeholder'); }
      };
      pEl.onload = function () {
        if (global.mpPosterGuardLoaded) global.mpPosterGuardLoaded(this);
      };
      var wrap = pEl.closest('.poster-wrap');
      if (wrap) wrap.classList.toggle('film-poster-has-placeholder', display.indexOf('film-poster-placeholder') >= 0);
    }
    setFilmHeroBackdrop(display === MP_POSTER_PLACEHOLDER ? (cur || '') : display, kpId);
  }

  try {
    if (!global.mpPosterOnError) {
      global.mpPosterOnError = function (img) {
        if (!img || img.dataset.mpPosterFailed === '1') return;
        img.onerror = null;
        img.dataset.mpPosterFailed = '1';
        img.src = MP_POSTER_PLACEHOLDER;
        img.classList.add('mp-poster-placeholder');
        var wrap = img.closest('.poster-wrap');
        if (wrap) wrap.classList.add('film-poster-has-placeholder');
        setFilmHeroBackdrop('');
      };
    }
    global.mpPosterGuardLoaded = function (img) {
      if (!img || img.dataset.mpPosterFailed === '1') return;
      var src = String(img.currentSrc || img.src || '');
      if (/no-poster/i.test(src)) {
        global.mpPosterOnError(img);
        return;
      }
      try {
        if (img.naturalWidth > 0 && img.naturalWidth <= 48 && img.naturalHeight <= 48) {
          global.mpPosterOnError(img);
        }
      } catch (_w) {}
    };
  } catch (_mpPh) {}

  function isFilmDescPlaceholder(text) {
    var s = String(text || '').trim().toLowerCase();
    if (!s) return true;
    if (s === '—' || s === '-' || s === '–') return true;
    if (s === 'нет описания' || s === 'no description') return true;
    if (s.indexOf('откройте в movie planner') === 0) return true;
    if (s.indexOf('откройте фильм в movie planner') === 0) return true;
    if (s.indexOf('open in movie planner') === 0) return true;
    return false;
  }

  function normalizeFilmDescriptionText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function isTruncatedFilmDescription(text) {
    return /…$|\.\.\.$/.test(normalizeFilmDescriptionText(text));
  }

  function filmDescriptionsConflict(a, b) {
    var x = normalizeFilmDescriptionText(a);
    var y = normalizeFilmDescriptionText(b);
    if (!x || !y || x === y) return false;
    if (x.slice(0, 48) === y.slice(0, 48)) return false;
    if (x.indexOf(y.slice(0, 28)) >= 0 || y.indexOf(x.slice(0, 28)) >= 0) return false;
    return true;
  }

  function pickFilmDescription(film) {
    if (!film) return '';
    // Same order as SSR boot (`description`/`plot` first). Do NOT prefer a longer
    // TMDB overview_ru — that swapped the plot under the user's eyes after paint.
    var ordered = [
      film.description,
      film.plot,
      film.overview_ru,
      film.shortDescription,
      film.overview_en,
    ];
    var cyrFirst = '';
    var anyFirst = '';
    for (var i = 0; i < ordered.length; i++) {
      var s = normalizeFilmDescriptionText(ordered[i]);
      if (!s || isFilmDescPlaceholder(s)) continue;
      if (!anyFirst) anyFirst = s;
      if (/[а-яА-ЯёЁ]/.test(s)) {
        // Upgrade truncated → full only when same opening.
        if (!cyrFirst) {
          cyrFirst = s;
          continue;
        }
        if (isTruncatedFilmDescription(cyrFirst) && !isTruncatedFilmDescription(s) && !filmDescriptionsConflict(cyrFirst, s)) {
          cyrFirst = s;
        }
      }
    }
    return cyrFirst || anyFirst;
  }

  function trimMetaText(text, maxLen) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (s.length <= maxLen) return s;
    var cut = s.slice(0, maxLen - 1);
    var sp = cut.lastIndexOf(' ');
    if (sp > 40) cut = cut.slice(0, sp);
    return cut.replace(/[.,;:!?\s]+$/, '') + '…';
  }

  function filmMetaDescription(film, fallbackTitle) {
    var title = fallbackTitle || 'Фильм';
    var plot = pickFilmDescription(film);
    if (plot) return trimMetaText(title + '. ' + plot, 160);
    var genres = film && film.genres ? String(film.genres).trim() : '';
    if (genres) return trimMetaText(title + ' — ' + genres + '. Карточка на Movie Planner.', 160);
    return title + ' — карточка фильма на Movie Planner.';
  }

  var lastFilmDescription = '';
  var FILM_DESC_PREVIEW_LEN = 220;

  function buildFilmDescWrapHtml() {
    return (
      '<div class="film-desc-wrap" id="film-desc-wrap">' +
        '<p class="description" id="film-desc">' +
          '<span class="film-desc-short"></span>' +
          '<span class="film-desc-full hidden">' +
            '<span class="film-desc-plot"></span>' +
            '<span class="film-desc-facts-inline"></span>' +
          '</span>' +
          '<button type="button" class="film-actors-more-btn film-desc-more-btn hidden" aria-expanded="false">ещё</button>' +
        '</p>' +
      '</div>'
    );
  }

  function buildFilmReviewsSlotHtml() {
    return '<div id="film-desc-reviews-slot" class="film-desc-reviews-inline" aria-live="polite"></div>';
  }

  function filmDescPlotText(wrap) {
    if (!wrap) return String(lastFilmDescription || '').trim();
    var legacy = wrap.querySelector('#film-desc.film-hero-desc');
    return normalizeFilmDescriptionText(
      wrap.getAttribute('data-plot-text') ||
      (wrap.querySelector('.film-desc-plot') && wrap.querySelector('.film-desc-plot').textContent) ||
      (wrap.querySelector('.film-desc-short') && wrap.querySelector('.film-desc-short').textContent) ||
      (legacy && !legacy.querySelector('.film-desc-short') && legacy.textContent) ||
      lastFilmDescription ||
      ''
    );
  }

  function filmDescFactsInlineHtml(payload) {
    var items = filmFactsItemsFromPayload(payload);
    if (!items.length) return '';
    return '<div class="film-desc-facts-title">Интересные факты</div>' +
      '<ul class="film-toolbar-facts-list film-desc-facts-list">' +
      items.map(function (x) { return renderFilmDescFactItem(x); }).join('') +
      '</ul>';
  }

  function upgradeLegacyFilmDescWrap(wrap) {
    if (!wrap || wrap.querySelector('.film-desc-full')) return false;
    var legacyDesc = wrap.querySelector('#film-desc');
    var legacyText = normalizeFilmDescriptionText(
      wrap.getAttribute('data-plot-text') ||
      (legacyDesc && !legacyDesc.querySelector('.film-desc-short') && legacyDesc.textContent) ||
      lastFilmDescription ||
      ''
    );
    var tmp = document.createElement('div');
    tmp.innerHTML = buildFilmDescWrapHtml();
    wrap.innerHTML = tmp.firstElementChild.innerHTML;
    if (!wrap.id) wrap.id = 'film-desc-wrap';
    wrap.classList.add('film-desc-wrap');
    if (legacyText) {
      wrap.setAttribute('data-plot-text', legacyText);
      lastFilmDescription = legacyText;
    }
    bindFilmDescExpand(wrap);
    if (legacyText) {
      updateFilmDescCollapseState(wrap, legacyText, wrap.getAttribute('data-has-facts') === '1');
    }
    return true;
  }

  function migrateFilmDescWrap(wrap) {
    if (!wrap) return;
    upgradeLegacyFilmDescWrap(wrap);
    var fullEl = wrap.querySelector('.film-desc-full');
    if (!fullEl) return;
    var plotEl = fullEl.querySelector('.film-desc-plot');
    var plotText = String(
      wrap.getAttribute('data-plot-text') ||
      (plotEl && plotEl.textContent) ||
      (wrap.querySelector('.film-desc-short') && wrap.querySelector('.film-desc-short').textContent) ||
      lastFilmDescription ||
      ''
    ).trim();
    if (plotText) wrap.setAttribute('data-plot-text', plotText);
    if (!plotEl) {
      plotEl = document.createElement('span');
      plotEl.className = 'film-desc-plot';
      /* Never wipe facts via textContent on the full block. */
      fullEl.insertBefore(plotEl, fullEl.firstChild);
    }
    plotEl.textContent = plotText;
    /* Canon: facts live inside collapsed «ещё» (.film-desc-full), not always-open under the plot. */
    var factsEl = fullEl.querySelector('.film-desc-facts-inline');
    if (!factsEl) {
      factsEl = wrap.querySelector('.film-desc-facts-inline');
    }
    if (!factsEl) {
      factsEl = document.createElement('span');
      factsEl.className = 'film-desc-facts-inline';
    }
    if (factsEl.parentNode !== fullEl) fullEl.appendChild(factsEl);
    /* Reviews live AFTER the toolbar (#film-desc-reviews-slot) — never inside desc wrap. */
    var nestedReviews = wrap.querySelector('.film-desc-reviews-inline');
    if (nestedReviews && nestedReviews.id !== 'film-desc-reviews-slot') {
      var hero = wrap.closest('.hero-content');
      var slot = ensureFilmReviewsSlot(hero);
      if (slot && nestedReviews.innerHTML.trim() && !slot.innerHTML.trim()) {
        slot.innerHTML = nestedReviews.innerHTML;
      }
      nestedReviews.remove();
    }
    var legacyList = wrap.querySelector('#film-desc-facts-list');
    if (legacyList && legacyList.innerHTML.trim() && !factsEl.innerHTML.trim()) {
      factsEl.innerHTML = '<ul class="film-toolbar-facts-list film-desc-facts-list">' + legacyList.innerHTML + '</ul>';
      wrap.setAttribute('data-has-facts', '1');
    }
    var legacyFacts = wrap.querySelector('#film-desc-facts');
    if (legacyFacts) legacyFacts.remove();
    bindFilmDescExpand(wrap);
  }

  function ensureFilmReviewsSlot(heroContent) {
    if (!heroContent) {
      heroContent = document.querySelector('#film-page-content .hero-content, .film-page .hero-content, .movie-page .hero-content');
    }
    if (!heroContent) return null;
    var slot = heroContent.querySelector('#film-desc-reviews-slot');
    if (slot) return slot;
    slot = document.createElement('div');
    slot.id = 'film-desc-reviews-slot';
    slot.className = 'film-desc-reviews-inline';
    slot.setAttribute('aria-live', 'polite');
    var toolbar = heroContent.querySelector('.film-page-toolbar');
    if (toolbar && toolbar.parentNode) {
      if (toolbar.nextSibling) toolbar.parentNode.insertBefore(slot, toolbar.nextSibling);
      else toolbar.parentNode.appendChild(slot);
    } else {
      heroContent.appendChild(slot);
    }
    return slot;
  }

  function ensureFilmDescWrap(heroContent) {
    if (!heroContent) return null;
    var wrap = heroContent.querySelector('#film-desc-wrap');
    if (wrap) {
      migrateFilmDescWrap(wrap);
      return wrap;
    }
    var toolbar = heroContent.querySelector('.film-page-toolbar');
    var tmp = document.createElement('div');
    tmp.innerHTML = buildFilmDescWrapHtml();
    wrap = tmp.firstElementChild;
    if (toolbar) heroContent.insertBefore(wrap, toolbar);
    else heroContent.appendChild(wrap);
    bindFilmDescExpand(wrap);
    return wrap;
  }

  function updateFilmDescCollapseState(wrap, fullText, hasFacts) {
    if (!wrap) return;
    migrateFilmDescWrap(wrap);
    var text = String(fullText || filmDescPlotText(wrap) || '').trim();
    wrap.setAttribute('data-plot-text', text);
    var descEl = wrap.querySelector('#film-desc');
    var shortEl = wrap.querySelector('.film-desc-short');
    var fullEl = wrap.querySelector('.film-desc-full');
    var plotEl = wrap.querySelector('.film-desc-plot');
    var btn = wrap.querySelector('.film-desc-more-btn');
    if (!descEl || !shortEl || !fullEl || !plotEl || !btn) return;
    var extras = !!hasFacts || wrap.getAttribute('data-has-facts') === '1';
    if (!text && !extras) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    var expanded = btn.getAttribute('aria-expanded') === 'true';
    /* Short plot + facts must still offer «ещё» — otherwise facts stay forever open. */
    var needsMore = text.length > FILM_DESC_PREVIEW_LEN || extras;
    if (text.length > FILM_DESC_PREVIEW_LEN) {
      var cut = text.slice(0, FILM_DESC_PREVIEW_LEN).replace(/\s+\S*$/, '');
      shortEl.textContent = cut + '…';
    } else {
      shortEl.textContent = text;
    }
    plotEl.textContent = text;
    btn.classList.toggle('hidden', !needsMore);
    if (!needsMore) {
      shortEl.classList.remove('hidden');
      fullEl.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = 'ещё';
    } else if (!expanded) {
      shortEl.classList.remove('hidden');
      fullEl.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = 'ещё';
    } else {
      shortEl.classList.add('hidden');
      fullEl.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
      btn.textContent = 'свернуть';
    }
    descEl.classList.remove('hidden', 'skeleton');
  }

  function bindFilmDescExpand(wrap) {
    if (!wrap || wrap._mpDescExpandBound) return;
    wrap._mpDescExpandBound = true;
    var btn = wrap.querySelector('.film-desc-more-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      var next = !expanded;
      var shortEl = wrap.querySelector('.film-desc-short');
      var fullEl = wrap.querySelector('.film-desc-full');
      if (shortEl) shortEl.classList.toggle('hidden', next);
      if (fullEl) fullEl.classList.toggle('hidden', !next);
      btn.textContent = next ? 'свернуть' : 'ещё';
      btn.setAttribute('aria-expanded', next ? 'true' : 'false');
    });
  }

  function renderFilmDescFactItem(wf) {
    if (typeof wf === 'string') {
      return wf ? '<li>' + escapeHtml(wf) + '</li>' : '';
    }
    if (!wf || !wf.fact) return '';
    function esc(c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    }
    function formatWebFactHtml(text) {
      return String(text || '').replace(/[&<>"']/g, esc).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }
    function webFactBodyHtml(item) {
      if (item && item.fact_html) return String(item.fact_html);
      return formatWebFactHtml(item && item.fact);
    }
    function webFactSourceUrl(item) {
      var url = String((item && item.source_url) || '').trim();
      return /^https?:\/\//i.test(url) ? url : '';
    }
    var cat = wf.category ? ('<strong>' + escapeHtml(wf.category) + ':</strong> ') : '';
    var text = webFactBodyHtml(wf);
    var src = '';
    var srcUrl = webFactSourceUrl(wf);
    var srcLabel = wf.source_label || wf.source_title || 'Источник';
    if (srcUrl) {
      src = ' <cite class="film-fact-cite"><a class="film-fact-source" href="' +
        escapeHtml(srcUrl) + '" target="_blank" rel="noopener nofollow">' +
        escapeHtml(srcLabel) + '</a></cite>';
    }
    return '<li>' + cat + text + src + '</li>';
  }

  function stripWikiFootnotesClient(text) {
    return String(text || '').replace(/(?:\s*\[\d+\])+\s*$/g, '').trim();
  }

  function filmFactDedupeKey(text) {
    return stripWikiFootnotesClient(text).toLowerCase();
  }

  function filmFactsItemsFromPayload(d) {
    // Web enrich first (with sources), then Kinopoisk trivia — never drop KP when web exists.
    var web = (d && Array.isArray(d.web_facts))
      ? d.web_facts.filter(function (f) { return f && f.fact && !f.is_spoiler; })
      : [];
    var kp = (d && Array.isArray(d.facts)) ? d.facts : [];
    var out = [];
    var seen = {};

    function alreadyHave(key) {
      if (!key || seen[key]) return true;
      if (key.length > 40) {
        for (var prev in seen) {
          if (prev.length > 40 && (key.indexOf(prev) !== -1 || prev.indexOf(key) !== -1)) {
            return true;
          }
        }
      }
      return false;
    }

    function pushWeb(item) {
      var raw = stripWikiFootnotesClient(item && item.fact);
      if (!raw) return;
      var key = filmFactDedupeKey(raw);
      if (alreadyHave(key)) return;
      seen[key] = true;
      var copy = {};
      for (var k in item) {
        if (Object.prototype.hasOwnProperty.call(item, k)) copy[k] = item[k];
      }
      copy.fact = raw;
      if (copy.fact_html) {
        copy.fact_html = String(copy.fact_html).replace(/(?:\s*\[\d+\])+(?=(?:\s|<|$))/g, '');
      } else {
        copy.fact_html = undefined;
      }
      out.push(copy);
    }

    function pushPlain(text) {
      var raw = stripWikiFootnotesClient(text);
      if (!raw) return;
      var key = filmFactDedupeKey(raw);
      if (alreadyHave(key)) return;
      seen[key] = true;
      out.push(raw);
    }

    web.forEach(pushWeb);
    kp.forEach(pushPlain);
    if (!out.length && d && Array.isArray(d.bloopers)) {
      d.bloopers.forEach(pushPlain);
    }
    return out.slice(0, 8);
  }

  /** Real Kinopoisk film id only — never digits from fest-/movie-/tv- catalog keys (year → /f/2025/facts wipe). */
  function numericKpFilmId(id) {
    var s = String(id == null ? '' : id).trim();
    return /^\d+$/.test(s) ? s : '';
  }

  function paintFilmDescFacts(wrap, payload) {
    if (!wrap) wrap = document.getElementById('film-desc-wrap');
    if (!wrap) return;
    migrateFilmDescWrap(wrap);
    var factsEl = wrap.querySelector('.film-desc-facts-inline');
    if (!factsEl) return;
    var items = filmFactsItemsFromPayload(payload);
    // Empty KP/facts response must not erase SSR/boot/editorial facts already painted.
    if (!items.length) {
      if (wrap.getAttribute('data-has-facts') === '1' && factsEl.innerHTML.trim()) {
        return;
      }
      factsEl.innerHTML = '';
      wrap.setAttribute('data-has-facts', '0');
      updateFilmDescCollapseState(
        wrap,
        filmDescPlotText(wrap),
        false
      );
      return;
    }
    factsEl.innerHTML = filmDescFactsInlineHtml(payload);
    wrap.setAttribute('data-has-facts', '1');
    updateFilmDescCollapseState(
      wrap,
      filmDescPlotText(wrap),
      true
    );
  }

  function withReviewUtm(url, channelTitle, medium, kpId, view) {
    if (global.MpFilmOutbound && typeof global.MpFilmOutbound.withUtm === 'function') {
      return global.MpFilmOutbound.withUtm(url, {
        channel: channelTitle,
        medium: medium || 'film_reviews',
        kpId: kpId,
        view: view || medium || 'film_reviews',
        platform: /t\.me\//i.test(String(url || '')) ? 'telegram' : 'youtube',
      });
    }
    var raw = String(url || '').trim();
    if (!/^https?:\/\//i.test(raw)) return raw;
    try {
      var u = new URL(raw);
      if (!u.searchParams.get('utm_source')) u.searchParams.set('utm_source', 'movie_planner');
      if (!u.searchParams.get('utm_medium')) {
        u.searchParams.set('utm_medium', medium || 'film_reviews');
      }
      if (!u.searchParams.get('utm_campaign')) u.searchParams.set('utm_campaign', 'news');
      var content = String(channelTitle || 'youtube').replace(/[^\w.\-@]+/g, '_').slice(0, 80);
      if (content && !u.searchParams.get('utm_content')) u.searchParams.set('utm_content', content);
      var term = [kpId || '', view || medium || ''].filter(Boolean).join('_').slice(0, 80);
      if (term && !u.searchParams.get('utm_term')) u.searchParams.set('utm_term', term);
      return u.toString();
    } catch (_) {
      return raw;
    }
  }

  function filmSocialIconHtml(platform) {
    var p = String(platform || '').toLowerCase();
    if (p === 'instagram') {
      return '<span class="film-review-ig" aria-hidden="true" title="Instagram">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
        '<path d="M12 2.2c3.2 0 3.6 0 4.9.1 3.2.1 4.7 1.7 4.9 4.9.1 1.3.1 1.7.1 4.8s0 3.6-.1 4.9c-.2 3.1-1.7 4.7-4.9 4.9-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-3.2-.2-4.7-1.8-4.9-4.9-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9C2.4 4 3.9 2.4 7.1 2.3 8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.2 0-3.5 0-4.8.1-2.3.1-3.4 1.2-3.5 3.5-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.8c.1 2.2 1.2 3.4 3.5 3.5 1.2.1 1.6.1 4.8.1s3.5 0 4.8-.1c2.3-.1 3.4-1.3 3.5-3.5.1-1.3.1-1.6.1-4.8s0-3.5-.1-4.8c-.1-2.2-1.2-3.4-3.5-3.5-1.3-.1-1.6-.1-4.8-.1zm0 3.1a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2zm0 1.8a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6zm6.5-2.1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/>' +
        '</svg></span>';
    }
    return '<span class="film-review-yt" aria-hidden="true" title="YouTube">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
      '<path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.8 15.5v-7l6.2 3.5-6.2 3.5z"/>' +
      '</svg></span>';
  }

  function filmDescSocialsInlineHtml(socials, kpId) {
    if (!socials || !socials.length) return '';
    var lis = socials.slice(0, 6).map(function (it) {
      if (!it || !it.url) return '';
      var plat = String(it.platform || 'link');
      var label = escapeHtml(it.label || (it.handle ? '@' + it.handle : plat));
      var handle = escapeHtml(it.handle || label);
      var url = escapeHtml(withReviewUtm(it.url, it.handle || it.label || plat, 'film_social', kpId, 'film_social'));
      return '<li class="film-review-item">' + filmSocialIconHtml(plat) +
        '<a class="film-review-link" href="' + url + '" target="_blank" rel="noopener nofollow"' +
        ' data-review-out="1" data-review-view="film_social"' +
        ' data-review-platform="' + escapeHtml(plat) + '"' +
        ' data-review-channel="' + handle + '">' +
        label + '</a></li>';
    }).filter(Boolean).join('');
    if (!lis) return '';
    return '<div class="film-desc-reviews-title">В соцсетях</div>' +
      '<ul class="film-desc-reviews-list">' + lis + '</ul>';
  }

  function filmDescReviewsInlineHtml(items, socials, kpId) {
    var ytSvg = filmSocialIconHtml('youtube');
    var lis = (items || []).slice(0, 8).map(function (it) {
      if (!it || !it.url) return '';
      var title = escapeHtml(it.title || 'Видео');
      var ch = escapeHtml(it.channel_title || '');
      var url = escapeHtml(withReviewUtm(it.url, it.channel_title || '', 'film_reviews', kpId, 'film_reviews'));
      var chBit = ch ? '<span class="film-review-channel"> ' + ch + '</span>' : '';
      return '<li class="film-review-item">' + ytSvg +
        '<a class="film-review-link" href="' + url + '" target="_blank" rel="noopener nofollow"' +
        ' data-review-out="1" data-review-view="film_reviews"' +
        ' data-review-platform="youtube" data-review-channel="' + ch + '">' +
        title + chBit + '</a></li>';
    }).filter(Boolean).join('');
    var ytBlock = lis
      ? ('<div class="film-desc-reviews-title">Разборы на YouTube</div><ul class="film-desc-reviews-list">' + lis + '</ul>')
      : '';
    return filmDescSocialsInlineHtml(socials, kpId) + ytBlock;
  }

  function filmBuzzFeedHtml(posts, kpId) {
    var list = (posts || []).filter(function (p) { return p && p.post_url; }).slice(0, 4);
    if (!list.length) return '';
    var lis = list.map(function (p) {
      var teaser = escapeHtml(String(p.teaser || p.title_raw || '').trim().slice(0, 140));
      if (!teaser) return '';
      var ch = escapeHtml(String(p.channel_label || p.channel_title || 'источник').trim());
      var url = escapeHtml(withReviewUtm(p.post_url, p.channel_label || '', 'film_buzz', kpId, 'film_buzz'));
      var dt = String(p.posted_at || '').slice(0, 10);
      var dtBit = '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
        dtBit = '<time class="film-buzz-date" datetime="' + escapeHtml(dt) + '">' +
          escapeHtml(dt.slice(8, 10) + '.' + dt.slice(5, 7)) + '</time>';
      }
      var plat = escapeHtml(String(p.platform || 'telegram'));
      return '<li class="film-buzz-item">' +
        (dtBit || '') +
        '<a class="film-buzz-link" href="' + url + '" target="_blank" rel="noopener nofollow"' +
        ' data-review-out="1" data-review-view="film_buzz"' +
        ' data-review-platform="' + plat + '"' +
        ' data-review-channel="' + ch + '">' + ch + '</a>' +
        '<span class="film-buzz-teaser"> — ' + teaser + '</span></li>';
    }).filter(Boolean).join('');
    if (!lis) return '';
    return '<div class="film-buzz-block" id="film-buzz-block">' +
      '<div class="film-buzz-head">' +
      '<span class="film-buzz-chip" aria-hidden="true">●</span>' +
      '<div class="film-desc-reviews-title film-buzz-title">Обсуждают сейчас:</div>' +
      '<a class="film-buzz-all" href="/buzz">Все</a>' +
      '</div>' +
      '<ul class="film-buzz-list">' + lis + '</ul></div>';
  }

  function paintFilmDescReviews(wrap, items, socials, buzzPosts, kpId) {
    if (!wrap) wrap = document.getElementById('film-desc-wrap');
    var hero = (wrap && wrap.closest('.hero-content')) ||
      document.querySelector('#film-page-content .hero-content, .film-page .hero-content, .movie-page .hero-content');
    var revEl = ensureFilmReviewsSlot(hero);
    if (!revEl) return;
    var list = Array.isArray(items) ? items : [];
    var soc = Array.isArray(socials) ? socials : [];
    var buzz = Array.isArray(buzzPosts) ? buzzPosts : [];
    var kp = kpId || wrap.getAttribute('data-kp-id') || '';
    var buzzHtml = filmBuzzFeedHtml(buzz, kp);
    var rest = (list.length || soc.length) ? filmDescReviewsInlineHtml(list, soc, kp) : '';
    // YouTube / соцсети сверху, «В тренде» ниже (актуальность buzz короче).
    revEl.innerHTML = rest + buzzHtml;
    if (global.MpFilmOutbound && typeof global.MpFilmOutbound.bind === 'function') {
      global.MpFilmOutbound.bind(revEl, kp);
    } else {
      revEl.querySelectorAll('a[data-review-out]').forEach(function (a) {
        a.addEventListener('click', function () {
          try {
            if (typeof window.ym === 'function') {
              window.ym(110038199, 'reachGoal', 'buzz_outbound', {
                platform: a.getAttribute('data-review-platform') || 'youtube',
                channel: a.getAttribute('data-review-channel') || '',
                kp_id: kp,
                view: a.getAttribute('data-review-view') ||
                  (a.closest('.film-buzz-block') ? 'film_buzz' : 'film_reviews'),
              });
            }
          } catch (_) {}
        });
      });
    }
  }

  function loadFilmDescReviews(kpId, root) {
    var kp = numericKpFilmId(kpId);
    if (!kp) return Promise.resolve();
    var scope = root || document;
    var wrap = scope.querySelector('#film-desc-wrap');
    if (!wrap) return Promise.resolve();
    if (wrap.getAttribute('data-reviews-loaded') === kp) return Promise.resolve();
    if (wrap.getAttribute('data-reviews-loading') === kp) return Promise.resolve();
    wrap.setAttribute('data-reviews-loading', kp);
    var reviewsP = fetch(API_BASE + '/api/public/film/' + encodeURIComponent(kp) + '/reviews', {
      method: 'GET',
      mode: 'cors',
    })
      .then(function (r) {
        if (!r.ok) throw new Error('api_' + r.status);
        return r.json();
      })
      .catch(function () { return { items: [], socials: [] }; });
    var buzzP = fetch(API_BASE + '/api/public/buzz/film/' + encodeURIComponent(kp) + '?days=14', {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
    })
      .then(function (r) {
        if (!r.ok) throw new Error('api_' + r.status);
        return r.json();
      })
      .then(function (d) { return (d && d.posts) || []; })
      .catch(function () { return []; });
    return Promise.all([reviewsP, buzzP])
      .then(function (pair) {
        wrap.setAttribute('data-reviews-loaded', kp);
        var d = pair[0] || {};
        paintFilmDescReviews(wrap, d.items || [], d.socials || [], pair[1] || [], kp);
      })
      .catch(function () {})
      .then(function () { wrap.removeAttribute('data-reviews-loading'); });
  }

  function loadFilmDescFacts(kpId, root) {
    var kp = numericKpFilmId(kpId);
    if (!kp) return Promise.resolve();
    var scope = root || document;
    var wrap = scope.querySelector('#film-desc-wrap');
    if (!wrap) return Promise.resolve();
    if (wrap.getAttribute('data-facts-loaded') === kp) {
      return loadFilmDescReviews(kp, root);
    }
    if (wrap.getAttribute('data-facts-loading') === kp) {
      return Promise.resolve();
    }
    wrap.setAttribute('data-facts-loading', kp);
    return fetch(API_BASE + '/api/public/film/' + encodeURIComponent(kp) + '/facts', {
      method: 'GET',
      mode: 'cors',
    })
      .then(function (r) {
        if (!r.ok) throw new Error('api_' + r.status);
        return r.json();
      })
      .then(function (d) {
        wrap.setAttribute('data-facts-loaded', kp);
        paintFilmDescFacts(wrap, d);
      })
      .catch(function () {})
      .then(function () {
        wrap.removeAttribute('data-facts-loading');
        return loadFilmDescReviews(kp, root);
      });
  }

  function setFilmDescription(text) {
    var heroContent = document.querySelector('#film-page-content .hero-content, .film-page .hero-content');
    var wrap = ensureFilmDescWrap(heroContent);
    if (!wrap) return;
    var s = normalizeFilmDescriptionText(text);
    var prev = normalizeFilmDescriptionText(
      lastFilmDescription || wrap.getAttribute('data-plot-text') || ''
    );
    // Keep first painted plot — API must not swap KP boot text for a different TMDB overview.
    if (prev && s && filmDescriptionsConflict(prev, s)) {
      if (!isTruncatedFilmDescription(prev) || isTruncatedFilmDescription(s)) {
        s = prev;
      }
    }
    if (prev && s && s.length < prev.length && (prev.length > s.length + 24 || isTruncatedFilmDescription(prev))) {
      s = prev;
    }
    if (!s || isFilmDescPlaceholder(s)) {
      if (lastFilmDescription) {
        var extras0 = wrap.getAttribute('data-has-facts') === '1';
        updateFilmDescCollapseState(wrap, lastFilmDescription, extras0);
        return;
      }
      wrap.classList.add('hidden');
      return;
    }
    lastFilmDescription = s;
    var extras1 = wrap.getAttribute('data-has-facts') === '1';
    updateFilmDescCollapseState(wrap, s, extras1);
  }

  function buildRatingStars(current) {
    var cur = Number(current) || 0;
    var html = '';
    for (var i = 1; i <= 10; i++) {
      html += '<button type="button" class="rating-star' + (cur >= i ? ' filled' : '') + '" data-rating-value="' + i + '" aria-label="Оценить на ' + i + '">' + i + '</button>';
    }
    if (cur) html += '<span class="rating-current" data-rating-current>' + cur + '/10</span>';
    return html;
  }

  function buildFilmPlanDropdown(item) {
    if (!item || !item.kp_id) return '';
    var kp = String(item.kp_id).replace(/\D/g, '');
    if (!kp) return '';
    var titleAttr = escapeHtml(item.title || '');
    var yearAttr = escapeHtml(String(item.year || ''));
    var showCinemaWatch = item.plan_type === 'cinema' || item.in_cinema === true;
    var planItems = [
      '<button type="button" class="action-dropdown-item" data-goto-plans="home">🏠 Дома</button>',
      '<button type="button" class="action-dropdown-item" data-goto-plans="cinema">🎥 В кино</button>',
    ].join('');
    var watchItems = [];
    if (item.online_link) {
      watchItems.push('<a class="action-dropdown-item" href="' + escapeHtml(item.online_link) + '" target="_blank" rel="noopener">🎞 Онлайн-кинотеатр</a>');
    }
    if (showCinemaWatch) {
      watchItems.push('<button type="button" class="action-dropdown-item" data-tickets="1" data-kp="' + kp + '" data-title="' + titleAttr + '" data-year="' + yearAttr + '">🎫 В кино (билет)</button>');
    }
    var menuItems = planItems + watchItems.join('');
    return '<div class="action-dropdown" data-dropdown-root="plan">' +
      buildGlassCtaButtonHtml({
        className: 'action-dropdown-btn film-toolbar-plan',
        icon: 'calendar',
        label: 'Запланировать просмотр',
        caret: true,
        dropdownToggle: true,
      }) +
      '<div class="action-dropdown-menu">' + menuItems + '</div></div>';
  }

  function mpToolbarIcon(name, opts) {
    if (global.MPIcons && global.MPIcons.html) return global.MPIcons.html(name, opts || { size: 'sm' });
    return name === 'bellOff' ? '🔕' : '🔔';
  }

  /** Liquid glass layers from glass-cta-button.html. */
  function glassCtaLayersHtml() {
    return (
      '<span class="glass-cta__bloom" aria-hidden="true"></span>' +
      '<span class="glass-cta__body" aria-hidden="true"></span>' +
      '<span class="glass-cta__tint" aria-hidden="true"></span>' +
      '<span class="glass-cta__ring" aria-hidden="true"></span>' +
      '<span class="glass-cta__flare" aria-hidden="true"></span>'
    );
  }
  function glassCtaIconHtml(iconKey) {
    var inner = mpToolbarIcon(iconKey, { size: 'md' });
    if (!inner && iconKey === 'calendar') {
      inner = '<i class="ph ph-calendar" aria-hidden="true"></i>';
    }
    if (!inner && iconKey === 'watchlist') {
      inner = '<i class="ph ph-bookmark-simple" aria-hidden="true"></i>';
    }
    return '<span class="glass-cta__icon" aria-hidden="true">' + inner + '</span>';
  }
  function glassCtaLabelHtml(label, opts) {
    var text = String((opts && opts.label) != null ? opts.label : (label || ''));
    /* Two-line centered labels on narrow screens (CSS also centers). */
    /* Space before <br>: when br is display:none on desktop, words stay separated. */
    if (text === 'В список просмотра') {
      return 'В список <br class="glass-cta__br">просмотра';
    }
    if (text === 'Запланировать просмотр') {
      return 'Запланировать <br class="glass-cta__br">просмотр';
    }
    return escapeHtml(text);
  }
  function buildGlassCtaButtonHtml(opts) {
    opts = opts || {};
    var idAttr = opts.id ? (' id="' + escapeHtml(opts.id) + '"') : '';
    var extra = opts.className ? (' ' + opts.className) : '';
    if (opts.loginHint) extra += ' glass-cta--login-hint';
    var dataAttrs = opts.dataAttrs || '';
    var caret = opts.caret
      ? '<span class="action-dropdown-caret glass-cta__caret" aria-hidden="true">▾</span>'
      : '';
    var loginHint = opts.loginHint
      ? '<span class="glass-cta__login" aria-hidden="true">Войти</span>'
      : '';
    var toggle = opts.dropdownToggle ? ' data-dropdown-toggle="1"' : '';
    return (
      '<div class="glass-cta-stage">' +
        '<button type="button" class="glass-cta' + extra + '"' + idAttr + toggle + dataAttrs +
          ' aria-label="' + escapeHtml(opts.label || '') + '">' +
          glassCtaLayersHtml() +
          glassCtaIconHtml(opts.icon || 'watchlist') +
          '<span class="glass-cta__label">' + glassCtaLabelHtml(opts.label, opts) + '</span>' +
          loginHint +
          caret +
        '</button>' +
      '</div>'
    );
  }

  function renderFilmToolbarPremiereBtn(item) {
    if (!item || !item.is_upcoming_premiere) return '';
    var kp = escapeHtml(String(item.kp_id || ''));
    var date = escapeHtml(String(item.premiere_date || ''));
    var active = !!(item.premiere_reminder_set || item.reminder_set);
    var action = active ? 'premiere-notify-off' : 'premiere-notify-on';
    var label = active ? 'Напоминание включено' : 'Напоминание о премьере';
    var cls = 'film-icon-btn film-icon-btn--premiere' + (active ? ' on' : '');
    var icon = active ? mpToolbarIcon('bellOff') : mpToolbarIcon('inbox');
    return '<button type="button" class="' + cls + '" data-action="' + action + '" data-kp="' + kp + '" data-date="' + date + '" title="' + label + '" aria-label="' + label + '">' + icon + '</button>';
  }

  function syncFilmToolbarPremiereButton(btn, item) {
    if (!btn || !item) return;
    var active = !!(item.premiere_reminder_set || item.reminder_set);
    var kp = String(item.kp_id || btn.getAttribute('data-kp') || '');
    var date = String(item.premiere_date || btn.getAttribute('data-date') || '');
    var action = active ? 'premiere-notify-off' : 'premiere-notify-on';
    var label = active ? 'Напоминание включено' : 'Напоминание о премьере';
    btn.className = 'film-icon-btn film-icon-btn--premiere' + (active ? ' on' : '');
    btn.setAttribute('data-action', action);
    btn.setAttribute('data-kp', kp);
    btn.setAttribute('data-date', date);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-label', label);
    btn.innerHTML = active ? mpToolbarIcon('bellOff') : mpToolbarIcon('inbox');
    btn.disabled = false;
  }

  function handleFilmPremiereNotify(button, loginNow) {
    if (!button || button.disabled) return;
    if (!mpToken()) {
      if (loginNow) loginNow();
      else if (global.MpPublicFilmLogin) global.MpPublicFilmLogin.open('');
      return;
    }
    var action = button.getAttribute('data-action');
    var kp = button.getAttribute('data-kp');
    var date = button.getAttribute('data-date');
    if (!kp || !action) return;
    var isOn = action === 'premiere-notify-on';
    var oldHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '…';
    var req = {
      method: isOn ? 'POST' : 'DELETE',
      headers: mpAuthHeaders(),
    };
    if (isOn) req.body = JSON.stringify({ premiere_date: date });
    fetch(API_BASE + '/api/site/premieres/' + encodeURIComponent(kp) + '/notify', req)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.success) {
          showPublicToast((data && (data.message || data.error)) || 'Не удалось изменить напоминание');
          button.disabled = false;
          button.innerHTML = oldHtml;
          return;
        }
        syncFilmToolbarPremiereButton(button, {
          kp_id: kp,
          premiere_date: date,
          premiere_reminder_set: isOn,
        });
        showPublicToast(isOn ? 'Премьера отслеживается' : 'Напоминание отключено');
      })
      .catch(function () {
        showPublicToast('Ошибка сети');
        button.disabled = false;
        button.innerHTML = oldHtml;
      });
  }

  function filmPageToast(message) {
    var el = document.getElementById('public-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'public-toast';
      el.className = 'public-toast';
      document.body.appendChild(el);
    }
    el.textContent = message || '';
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () { el.classList.remove('show'); }, 2800);
  }

  var SERIES_EP_COLS = 10;
  var SERIES_EP_ROWS = 5;
  var SERIES_EP_PAGE_SIZE = SERIES_EP_COLS * SERIES_EP_ROWS;

  function seriesEpisodeOrd(season, episode) {
    return Number(season) * 100000 + Number(episode);
  }

  function seriesEpisodeCode(season, episode) {
    if (season == null || episode == null) return '';
    return 'S' + season + 'E' + episode;
  }

  function seriesToolbarProgressCode(item) {
    var sp = (item && item.series_progress) || {};
    var last = sp.last_watched;
    if (last && last.season != null && last.episode != null) {
      return seriesEpisodeCode(last.season, last.episode);
    }
    var next = sp.next_unwatched || (item && item.next_episode);
    if (next && next.season != null && next.episode != null) {
      return seriesEpisodeCode(next.season, next.episode);
    }
    return 'S1E1';
  }

  function seriesProgressFromPayload(payload) {
    if (!payload) return null;
    return {
      seasons: payload.seasons || [],
      last_watched: payload.last_watched || null,
      next_unwatched: payload.next_unwatched || null,
      catalog_available: !!payload.catalog_available,
      watched_count: payload.watched_count || 0,
      all_episodes_watched: !!payload.all_episodes_watched,
    };
  }

  function seriesLastWatchedEp(progress) {
    var watched = [];
    (progress.seasons || []).forEach(function (s) {
      (s.episodes || []).forEach(function (ep) {
        if (ep.watched) watched.push({ season: s.season, episode: ep.episode });
      });
    });
    if (!watched.length) return null;
    watched.sort(function (a, b) { return seriesEpisodeOrd(a.season, a.episode) - seriesEpisodeOrd(b.season, b.episode); });
    return watched[watched.length - 1];
  }

  function seriesNextUnwatchedEp(progress) {
    var seasons = progress.seasons || [];
    for (var si = 0; si < seasons.length; si++) {
      var eps = seasons[si].episodes || [];
      for (var ei = 0; ei < eps.length; ei++) {
        if (!eps[ei].watched) {
          return { season: seasons[si].season, episode: eps[ei].episode };
        }
      }
    }
    return null;
  }

  function seriesEpIsWatched(progress, season, episode) {
    var s = (progress.seasons || []).find(function (x) { return Number(x.season) === Number(season); });
    if (!s) return false;
    var ep = (s.episodes || []).find(function (x) { return Number(x.episode) === Number(episode); });
    return !!(ep && ep.watched);
  }

  function applySeriesProgressToFilm(film, progress) {
    if (!film || !progress) return film;
    film.series_progress = progress;
    film.next_episode = progress.next_unwatched || null;
    if (progress.last_watched) {
      film.progress = 'S' + progress.last_watched.season + ' • E' + progress.last_watched.episode;
    }
    return film;
  }

  function updateSeriesToolbarButton(root, code) {
    var btn = root && root.querySelector('[data-series-toggle]');
    if (!btn) return;
    var label = code || 'S1E1';
    btn.setAttribute('aria-label', 'Прогресс сериала ' + label);
    btn.setAttribute('title', 'Прогресс: ' + label);
    var ico = btn.querySelector('.film-series-code');
    if (ico) ico.textContent = label;
  }

  function renderSeriesToolbarPanelHtml(state) {
    var st = state || {};
    var progress = st.progress || {};
    var seasons = progress.seasons || [];
    if (!seasons.length) {
      return '<p class="film-series-toolbar-empty">' + escapeHtml(st.error || 'Список серий недоступен') + '</p>';
    }
    var selSeason = st.selectedSeason != null ? st.selectedSeason : (seasons[0] && seasons[0].season);
    var seasonRow = seasons.find(function (s) { return Number(s.season) === Number(selSeason); }) || seasons[0];
    var eps = (seasonRow && seasonRow.episodes) || [];
    var totalEps = eps.length;
    var pageSize = SERIES_EP_PAGE_SIZE;
    var totalPages = Math.max(1, Math.ceil(totalEps / pageSize));
    var page = Math.min(Math.max(0, st.page || 0), totalPages - 1);
    var pageEps = eps.slice(page * pageSize, page * pageSize + pageSize);
    var seasonLabel = seasonRow ? ('Сезон ' + seasonRow.season) : '';
    var countLabel = totalEps ? (totalEps + ' ' + ruPlural(totalEps, 'серия', 'серии', 'серий')) : '';
    var html = '<div class="film-series-toolbar-head">'
      + '<div class="film-series-toolbar-title">' + escapeHtml(seasonLabel) + '</div>'
      + (countLabel ? '<div class="film-series-toolbar-meta">' + escapeHtml(countLabel) + '</div>' : '')
      + '</div>';
    if (seasons.length > 1) {
      html += '<div class="film-series-seasons" role="tablist">' + seasons.map(function (s) {
        var active = Number(s.season) === Number(selSeason);
        return '<button type="button" class="film-series-season-tab' + (active ? ' is-active' : '') + '" data-series-season="' + escapeHtml(String(s.season)) + '" role="tab">' + escapeHtml('S' + s.season) + '</button>';
      }).join('') + '</div>';
    }
    html += '<div class="film-series-ep-grid" role="list">' + pageEps.map(function (ep) {
      var watched = !!ep.watched;
      var selected = st.selected && Number(st.selected.season) === Number(seasonRow.season) && Number(st.selected.episode) === Number(ep.episode);
      var cls = ['film-series-ep-btn', watched ? 'is-watched' : '', selected ? 'is-selected' : ''].filter(Boolean).join(' ');
      var code = ep.code || seriesEpisodeCode(seasonRow.season, ep.episode);
      return '<button type="button" class="' + cls + '" data-series-ep-season="' + escapeHtml(String(seasonRow.season)) + '" data-series-ep="' + escapeHtml(String(ep.episode)) + '" role="listitem">' + escapeHtml(code) + '</button>';
    }).join('') + '</div>';
    if (totalPages > 1) {
      html += '<div class="film-series-ep-pager">'
        + '<button type="button" class="film-series-ep-pager-btn" data-series-page="' + (page - 1) + '"' + (page <= 0 ? ' disabled' : '') + ' aria-label="Предыдущая страница">‹</button>'
        + '<span class="film-series-ep-pager-label">' + (page + 1) + ' / ' + totalPages + '</span>'
        + '<button type="button" class="film-series-ep-pager-btn" data-series-page="' + (page + 1) + '"' + (page >= totalPages - 1 ? ' disabled' : '') + ' aria-label="Следующая страница">›</button>'
        + '</div>';
    }
    if (st.showMarkUpTo && st.selected) {
      var markLabel = st.markMode === 'up_to' ? 'Отметить до выбранной' : 'Отметить серию';
      html += '<button type="button" class="film-series-mark-up-to-btn" data-series-mark-up-to="1">' + markLabel + '</button>';
    }
    return html;
  }

  function bindSeriesToolbarPanel(root, film, panelRoot, state, rerender, apiBase, authHeadersFn) {
    if (!panelRoot) return;
    function postMark(body) {
      state.pending = true;
      rerender();
      ensureFilmIdForSeriesFilm(film, apiBase, authHeadersFn).then(function () {
        return fetch(apiBase + '/api/site/series/' + film.film_id + '/episodes/mark', {
          method: 'POST',
          headers: authHeadersFn(),
          body: JSON.stringify(body),
        }).then(function (r) { return r.json(); });
      }).then(function (data) {
        if (!data || !data.success) throw new Error((data && data.error) || 'error');
        if (body.mark_all_previous) filmPageToast('Отмечено серий: ' + (data.marked_count || 0));
        else if (body.watched === false) filmPageToast('Отметка снята');
        else filmPageToast('Серия отмечена');
        state.progress = seriesProgressFromPayload(data);
        state.selected = null;
        state.showMarkUpTo = false;
        state.markMode = null;
        applySeriesProgressToFilm(film, state.progress);
        updateSeriesToolbarButton(root, seriesToolbarProgressCode(film));
      }).catch(function () {
        filmPageToast('Не удалось сохранить прогресс');
      }).finally(function () {
        state.pending = false;
        rerender();
      });
    }
    panelRoot.querySelectorAll('[data-series-season]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.selectedSeason = parseInt(btn.getAttribute('data-series-season'), 10);
        state.page = 0;
        state.selected = null;
        state.showMarkUpTo = false;
        state.markMode = null;
        rerender();
      });
    });
    panelRoot.querySelectorAll('[data-series-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        state.page = parseInt(btn.getAttribute('data-series-page'), 10);
        rerender();
      });
    });
    panelRoot.querySelectorAll('[data-series-ep]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var season = parseInt(btn.getAttribute('data-series-ep-season'), 10);
        var episode = parseInt(btn.getAttribute('data-series-ep'), 10);
        if (!Number.isFinite(season) || !Number.isFinite(episode) || season < 1 || episode < 1) return;
        var progress = state.progress || {};
        var next = seriesNextUnwatchedEp(progress);
        var watched = seriesEpIsWatched(progress, season, episode);
        if (watched) {
          postMark({ season: season, episode: episode, watched: false });
          return;
        }
        if (!watched && next && Number(next.season) === season && Number(next.episode) === episode) {
          postMark({ season: season, episode: episode, mark_all_previous: false });
          return;
        }
        state.selected = { season: season, episode: episode };
        var afterNext = !!(next && seriesEpisodeOrd(season, episode) > seriesEpisodeOrd(next.season, next.episode));
        state.showMarkUpTo = true;
        state.markMode = afterNext ? 'up_to' : 'single';
        rerender();
      });
    });
    var markUpTo = panelRoot.querySelector('[data-series-mark-up-to]');
    if (markUpTo) {
      markUpTo.addEventListener('click', function () {
        if (!state.selected || state.pending) return;
        postMark({
          season: state.selected.season,
          episode: state.selected.episode,
          mark_all_previous: state.markMode === 'up_to',
        });
      });
    }
  }

  function filmPageConfirmDialog(title, message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'mp-dialog-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      document.body.style.overflow = 'hidden';
      var equal = !!opts.equalButtons;
      var okClass = equal ? 'btn btn-secondary' : 'btn btn-primary';
      var closeHtml = opts.showClose
        ? '<button type="button" class="mp-dialog-close" id="mp-confirm-close" aria-label="Закрыть">×</button>'
        : '';
      overlay.innerHTML =
        '<div class="mp-dialog-card">' +
          closeHtml +
          '<div class="modal-title">' + escapeHtml(title || 'Подтверждение') + '</div>' +
          '<p class="cabinet-hint">' + escapeHtml(message || '') + '</p>' +
          '<div style="display:flex;gap:10px;margin-top:16px;justify-content:center">' +
            '<button type="button" class="btn btn-secondary" id="mp-confirm-cancel">' + escapeHtml(opts.cancelLabel || 'Нет') + '</button>' +
            '<button type="button" class="' + okClass + '" id="mp-confirm-ok">' + escapeHtml(opts.confirmLabel || 'Да') + '</button>' +
          '</div>' +
        '</div>';
      function close(result) {
        document.body.style.overflow = '';
        try { overlay.remove(); } catch (_e) {}
        resolve(!!result);
      }
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close(false);
      });
      var closeBtn = overlay.querySelector('#mp-confirm-close');
      if (closeBtn) closeBtn.addEventListener('click', function () { close(false); });
      overlay.querySelector('#mp-confirm-cancel').addEventListener('click', function () { close(false); });
      overlay.querySelector('#mp-confirm-ok').addEventListener('click', function () { close(true); });
      document.body.appendChild(overlay);
    });
  }

  function ensureFilmIdForSeriesFilm(film, apiBase, authHeadersFn) {
    if (film && film.film_id) return Promise.resolve(film.film_id);
    var kp = String((film && film.kp_id) || '').replace(/\D/g, '');
    if (!kp) return Promise.reject(new Error('no_kp'));
    return fetch(apiBase + '/api/site/add-film', {
      method: 'POST',
      headers: authHeadersFn(),
      body: JSON.stringify({ kp_id: Number(kp) }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.success || !res.film_id) throw new Error((res && res.error) || 'add_failed');
      film.film_id = Number(res.film_id);
      film.is_series = true;
      return film.film_id;
    });
  }

  function mountSeriesToolbarPanel(root, film, apiBase, authHeadersFn) {
    var panelWrap = root && root.querySelector('#series-toolbar-panel-root');
    if (!panelWrap || !film || !film.is_series) return;
    function loadPanel() {
      if (!root._mpSeriesToolbarState) root._mpSeriesToolbarState = {};
      var state = root._mpSeriesToolbarState;
      if (!state.progress) {
        state.progress = seriesProgressFromPayload(film.series_progress || {});
        if (film.series_progress && film.series_progress.last_watched) {
          state.selectedSeason = film.series_progress.last_watched.season;
        } else if (film.series_progress && film.series_progress.next_unwatched) {
          state.selectedSeason = film.series_progress.next_unwatched.season;
        }
      }
      function rerender() {
        if (state.loading) {
          panelWrap.innerHTML = '<div class="film-series-toolbar-loading">Загрузка серий…</div>';
          return;
        }
        if (state.pending) {
          panelWrap.innerHTML = renderSeriesToolbarPanelHtml(state) + '<div class="film-series-toolbar-loading film-series-toolbar-loading--overlay">Сохраняем…</div>';
          bindSeriesToolbarPanel(root, film, panelWrap, state, rerender, apiBase, authHeadersFn);
          return;
        }
        panelWrap.innerHTML = renderSeriesToolbarPanelHtml(state);
        bindSeriesToolbarPanel(root, film, panelWrap, state, rerender, apiBase, authHeadersFn);
      }
      if (state.loaded && state.progress && (state.progress.seasons || []).length) {
        rerender();
        return;
      }
      state.loading = true;
      rerender();
      fetch(apiBase + '/api/site/series/' + film.film_id + '/progress', { headers: authHeadersFn() })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !data.success) {
            state.error = (data && data.error) || 'Не удалось загрузить серии';
            if (!state.progress || !(state.progress.seasons || []).length) state.progress = { seasons: [] };
            return;
          }
          state.progress = seriesProgressFromPayload(data);
          state.loaded = true;
          state.error = null;
          var anchor = data.last_watched || data.next_unwatched;
          if (anchor && anchor.season != null) state.selectedSeason = anchor.season;
          applySeriesProgressToFilm(film, state.progress);
          updateSeriesToolbarButton(root, seriesToolbarProgressCode(film));
        })
        .catch(function () {
          state.error = 'Не удалось загрузить серии';
        })
        .finally(function () {
          state.loading = false;
          rerender();
        });
    }
    if (film.film_id) {
      loadPanel();
      return;
    }
    panelWrap.innerHTML = '<div class="film-series-toolbar-loading">Добавляем в базу…</div>';
    ensureFilmIdForSeriesFilm(film, apiBase, authHeadersFn).then(function () {
      updateSeriesToolbarButton(root, seriesToolbarProgressCode(film));
      loadPanel();
    }).catch(function () {
      panelWrap.innerHTML = '<p class="film-series-toolbar-empty">Не удалось добавить сериал в базу</p>';
    });
  }

  function buildFilmPageToolbar(item, opts) {
    opts = opts || {};
    var inBase = !!opts.inBase;
    var watched = !!opts.watched;
    var myRating = Number(opts.myRating) || 0;
    var canRate = opts.canRate !== false;
    var ratingLocked = !!opts.ratingLocked;
    var authenticated = !!opts.authenticated;
    var usePublicRatingGrid = !ratingLocked;
    var ratingInner = '';
    if (ratingLocked) {
      ratingInner = '<p class="film-rating-locked-hint">В группе оценку ставят только администраторы и создатель.</p>';
    } else if (usePublicRatingGrid) {
      ratingInner = '<div class="film-toolbar-rating-grid rating-grid" id="rate-grid">' +
        [1,2,3,4,5,6,7,8,9,10].map(function (n) {
          var sel = (myRating === n) ? ' is-selected' : '';
          return '<button type="button" class="rate-btn' + sel + '" data-rate="' + n + '">' + n + '</button>';
        }).join('') +
        '</div>';
    } else {
      ratingInner = '<div class="film-toolbar-rating-grid"><div class="rating-stars" data-rating-stars="1">' + buildRatingStars(myRating) + '</div></div>' +
        (myRating ? '<div class="film-rating-share-row"><button type="button" class="rating-remove-btn" data-action="remove-rating">Убрать оценку</button></div>' : '');
    }
    var rateIco = (myRating >= 1 && myRating <= 10) ? String(myRating) : '★';
    var rateAria = myRating ? ('Оценка ' + myRating) : 'Оценить';
    var rateBtnClass = 'film-icon-btn' + (myRating ? ' film-icon-btn--rated' : '');
    var rateLabelHtml = myRating ? '' : '<span class="film-icon-label">Оценить</span>';
    var ratePanelHtml = (canRate && !ratingLocked)
      ? '<div class="film-toolbar-expand hidden" id="rating-expand-panel"><div class="public-rating-title">Ваша оценка</div>' + ratingInner + '</div>'
      : '';
    var rateBtnOnly = canRate && !ratingLocked
      ? '<button type="button" class="' + rateBtnClass + '" id="rate-toggle-btn" data-rate-toggle="1" aria-label="' + rateAria + '" title="' + rateAria + '"><span class="film-icon-ico">' + rateIco + '</span>' + rateLabelHtml + '</button>'
      : '';
    var shareBtn =
      '<button type="button" class="film-icon-btn" id="share-film-btn" data-share-film="1" data-kp="' +
      escapeHtml(String(item.kp_id || '')) +
      '" aria-label="Поделиться" title="Поделиться"><span class="film-icon-ico">↗</span><span class="film-icon-label">Поделиться</span></button>';

    /* Guest: glass «В список просмотра» + Просмотрено / ★ / Поделиться (без ярлыка в углу) */
    if (!authenticated) {
      var eyeIco = mpToolbarIcon('eye', { size: 'sm', className: 'film-icon-ico' }) ||
        '<span class="film-icon-ico" aria-hidden="true"><i class="ph ph-eye"></i></span>';
      return (
        '<div class="film-page-toolbar film-page-toolbar--guest">' +
          '<div class="film-toolbar-plan-wrap">' +
            buildGlassCtaButtonHtml({
              id: 'guest-watchlist-cta',
              icon: 'watchlist',
              label: 'В список просмотра',
              loginHint: true,
              dataAttrs: ' data-guest-watchlist="1"',
            }) +
          '</div>' +
          '<div class="film-toolbar-icons">' +
            '<button type="button" class="film-icon-btn" id="guest-watched-btn" data-guest-watched="1" aria-label="Просмотрено" title="Просмотрено">' +
              eyeIco + '<span class="film-icon-label">Просмотрено</span>' +
            '</button>' +
            rateBtnOnly +
            shareBtn +
          '</div>' +
          '<div class="film-toolbar-panels">' + ratePanelHtml + '</div>' +
        '</div>'
      );
    }

    var planBlock = inBase
      ? '<div class="film-toolbar-plan-wrap">' + buildFilmPlanDropdown(item) + '</div>'
      : '<div class="film-toolbar-plan-wrap">' +
          buildGlassCtaButtonHtml({
            id: 'plan-watch-btn',
            className: 'film-toolbar-plan',
            icon: 'calendar',
            label: 'Запланировать просмотр',
          }) +
        '</div>';
    var addIconBtn = !inBase
      ? '<button type="button" class="film-icon-btn" id="add-btn" aria-label="Добавить в базу" title="Добавить в базу"><span class="film-icon-ico">+</span><span class="film-icon-label">В базу</span></button>'
      : '';
    var watchIconBtn = inBase
      ? '<button type="button" class="film-icon-btn film-icon-btn--watched' + (watched ? ' on' : '') + '" data-action="remove-from-base" aria-label="Удалить из базы" title="Удалить из базы"><span class="film-icon-ico">✓</span><span class="film-icon-label">В базе</span></button>'
      : '';
    var premiereBtn = renderFilmToolbarPremiereBtn(item);
    var showSeriesToolbar = !!(
      item.is_series && (
        (opts.inBase && item.film_id) || (!opts.inBase && item.kp_id)
      )
    );
    var seriesCode = showSeriesToolbar
      ? (opts.inBase && item.film_id ? seriesToolbarProgressCode(item) : 'S1E1')
      : '';
    var seriesBtn = showSeriesToolbar
      ? '<button type="button" class="film-icon-btn film-icon-btn--series" id="series-progress-toggle" data-series-toggle="1" data-film-id="' + escapeHtml(String(item.film_id || '')) + '" data-kp-id="' + escapeHtml(String(item.kp_id || '')) + '" aria-label="Прогресс сериала ' + escapeHtml(seriesCode) + '" title="Прогресс: ' + escapeHtml(seriesCode) + '"><span class="film-icon-ico film-series-code">' + escapeHtml(seriesCode) + '</span></button>'
      : '';
    var seriesPanelHtml = showSeriesToolbar
      ? '<div class="film-toolbar-expand hidden" id="series-expand-panel"><div class="film-series-toolbar-panel" id="series-toolbar-panel-root"><div class="film-series-toolbar-loading">Загрузка серий…</div></div></div>'
      : '';
    var panelsHtml = '<div class="film-toolbar-panels">' + ratePanelHtml + seriesPanelHtml + '</div>';
    return '<div class="film-page-toolbar">' + planBlock +
      '<div class="film-toolbar-icons">' + addIconBtn + watchIconBtn + seriesBtn + rateBtnOnly + premiereBtn +
      shareBtn + '</div>' +
      panelsHtml + '</div>';
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

  function sessionNameFromStorage() {
    try {
      var active = localStorage.getItem('mp_site_active_chat_id');
      var row = mpSessions().find(function (x) { return String(x.chat_id) === String(active); });
      return (row && row.name) || 'Профиль';
    } catch (_e) { return 'Профиль'; }
  }

  var _filmPlanDropdownDocBound = false;

  function closeFilmPlanDropdowns(except) {
    document.querySelectorAll('.action-dropdown.open').forEach(function (d) {
      if (d !== except) d.classList.remove('open');
    });
  }

  function bindFilmPlanDropdowns(root, onPickPlace) {
    if (!root) return;
    root.querySelectorAll('[data-dropdown-toggle="1"]').forEach(function (tog) {
      if (tog._mpPlanToggleBound) return;
      tog._mpPlanToggleBound = true;
      tog.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var dd = tog.closest('.action-dropdown');
        if (!dd) return;
        var wasOpen = dd.classList.contains('open');
        closeFilmPlanDropdowns(wasOpen ? null : dd);
        if (!wasOpen) dd.classList.add('open');
      });
    });
    root.querySelectorAll('[data-goto-plans]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeFilmPlanDropdowns();
        var place = btn.getAttribute('data-goto-plans') || 'home';
        if (onPickPlace) onPickPlace(place);
      });
    });
    if (!_filmPlanDropdownDocBound) {
      _filmPlanDropdownDocBound = true;
      document.addEventListener('click', function (ev) {
        if (!ev.target.closest('.action-dropdown')) closeFilmPlanDropdowns();
      });
    }
  }

  function standaloneHeaderSearchHtml() {
    return '<div class="header-search" id="header-search" role="search">' +
      '<span class="header-search-icon mp-icon" data-mp-icon="search" aria-hidden="true"></span>' +
      '<input type="text" id="header-search-input" class="header-search-input" placeholder="Найти фильм или сериал…" autocomplete="off" aria-label="Поиск">' +
      '<button type="button" class="header-search-mic mp-icon-btn" id="header-search-mic" data-mp-icon="voice" data-mp-icon-weight="duotone" aria-label="Голосовой ввод" title="Голосовой ввод"></button>' +
      '<button type="button" class="header-search-clear hidden" id="header-search-clear" aria-label="Очистить">×</button>' +
      '<div class="header-search-dropdown hidden" id="header-search-dropdown" role="listbox"></div>' +
    '</div>';
  }

  var STANDALONE_SECTION_PATHS = {
    settings: '/settings',
    groups: '/groups',
    stats: '/stats',
    shazam: '/shazam',
    integrations: '/integrations',
    collections: '/features/collections',
    about: '/about',
    home: '/home',
    tournament: '/tournament',
  };

  function standaloneNavHtml() {
    var tabs = [
      { href: '/home', label: 'Главная', icon: 'home' },
      { href: '/plans', label: 'Планы', icon: 'plans' },
      { href: '/watchlist', label: 'База', icon: 'library' },
      { href: '/whattowatch', label: 'Смотреть', icon: 'watch' },
      { href: '/premieres', label: 'Премьеры', icon: 'premieres' },
      { href: '/buzz', label: 'В тренде', icon: 'trend' },
      { href: '/tournament', label: 'Турнир', icon: 'tournament' },
    ];
    return '<nav class="cabinet-nav film-standalone-nav" id="film-standalone-nav" aria-label="Разделы">' +
      tabs.map(function (t) {
        /* data-mp-icon: hydrate after async mp-icons.js (articles mount nav before MPIcons). */
        return '<a class="cabinet-nav-btn" href="' + t.href + '"><span class="cabinet-nav-btn-emoji" data-mp-icon="' + escapeHtml(t.icon) + '"></span><span class="cabinet-nav-btn-text">' + escapeHtml(t.label) + '</span></a>';
      }).join('') +
    '</nav>';
  }

  function resetStandaloneHeaderSearchState() {
    try {
      var dd = document.getElementById('header-search-dropdown');
      if (dd) dd.classList.add('hidden');
      document.body.classList.remove('header-search-dropdown-open', 'header-search-body-locked');
      if (document.body) document.body.style.top = '';
    } catch (_e) {}
  }

  function bindStandaloneNavLinks(navEl) {
    if (!navEl) return;
    navEl.querySelectorAll('a.cabinet-nav-btn[href]').forEach(function (a) {
      if (a.dataset.mpStandaloneNavBound === '1') return;
      a.dataset.mpStandaloneNavBound = '1';
      a.addEventListener('click', function (e) {
        var href = a.getAttribute('href') || '';
        if (!href) return;
        e.preventDefault();
        resetStandaloneHeaderSearchState();
        global.location.href = href;
      });
    });
  }

  function setStandaloneHeaderAvatar(el, url, name, apiBase) {
    if (!el) return;
    var initial = String(name || 'П').trim().charAt(0).toUpperCase() || 'П';
    var src = String(url || '').trim();
    if (src && !/^https?:\/\//i.test(src) && src.indexOf('data:') !== 0) {
      if (src.indexOf('/api/') === 0) src = apiBase + src;
    }
    if (src) {
      el.innerHTML = '<img src="' + escapeHtml(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
      var img = el.querySelector('img');
      if (img) img.addEventListener('error', function () { el.textContent = initial; }, { once: true });
    } else {
      el.textContent = initial;
    }
  }

  function hideCabinetSectionNavWhenStandalone() {
    // Guest /f/: #film-standalone-nav + #cabinet-readonly .cabinet-nav both painted
    // (Win/guest thin shell) → two menu rows. Prefer standalone hrefs nav.
    document.querySelectorAll(
      '#cabinet-readonly > .container > .cabinet-nav, #cabinet-readonly > .cabinet-nav'
    ).forEach(function (el) {
      el.classList.add('mp-film-nav-dup-hidden');
      el.setAttribute('hidden', '');
      el.setAttribute('aria-hidden', 'true');
    });
  }

  function mountStandaloneCabinetNav(mainSelector) {
    var old = document.getElementById('film-standalone-nav');
    if (old) old.remove();
    var navWrap = document.createElement('div');
    navWrap.innerHTML = standaloneNavHtml();
    var navEl = navWrap.firstElementChild;
    if (!navEl) return;

    var inserted = false;
    var shell = document.querySelector('.page-shell');
    var main = shell && (shell.querySelector(mainSelector || 'main') || shell.querySelector('main'));
    if (shell && main) {
      shell.insertBefore(navEl, main);
      inserted = true;
    } else {
      var header = document.getElementById('site-header');
      var parent = header && header.parentNode;
      if (header && parent) {
        parent.insertBefore(navEl, header.nextSibling);
        inserted = true;
      }
    }
    if (!inserted) return;

    hideCabinetSectionNavWhenStandalone();
    bindStandaloneNavLinks(navEl);
    try {
      if (global.MPIcons && global.MPIcons.hydrate) global.MPIcons.hydrate(navEl);
    } catch (_e) {}
  }

  function bindStandaloneLogoHome() {
    document.querySelectorAll('a.logo[href="/"], a.logo[href="/index.html"]').forEach(function (a) {
      if (a.dataset.mpLogoHomeBound) return;
      a.dataset.mpLogoHomeBound = '1';
      a.addEventListener('click', function (e) {
        if (!mpToken()) return;
        e.preventDefault();
        global.location.href = '/home';
      });
    });
  }

  function bindStandaloneSearch(apiBase, loginNow) {
    if (global.__MP_CABINET_HEADER_SEARCH || global.__MP_HEADER_SEARCH_BOUND) return;
    var filmCabinetRoute = !!(document.getElementById('cabinet-readonly') &&
      document.getElementById('cabinet-readonly').classList.contains('film-page-mode'));
    if (document.body && document.body.classList.contains('in-cabinet') && !filmCabinetRoute) return;
    global.__MP_HEADER_SEARCH_BOUND = true;
    var input = document.getElementById('header-search-input');
    var dd = document.getElementById('header-search-dropdown');
    var clearBtn = document.getElementById('header-search-clear');
    var iconBtn = document.getElementById('header-search-icon-btn');
    var searchWrap = document.getElementById('header-search');
    var timer = null;
    var controller = null;
    var seq = 0;
    var hubSeq = 0;
    var SEARCH_DEBOUNCE_MS = 260;
    var QUICK_QUERIES = [
      'Оппенгеймер', 'Барби', 'Дюна', '1+1', 'Интерстеллар', 'Начало', 'Матрица', 'Нолан',
    ];
    if (!input || !dd) return;
    function escapeText(v) {
      return String(v || '').replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
      });
    }
    function setDropdownOpen(open) {
      if (!document.body) return;
      document.body.classList.toggle('header-search-dropdown-open', !!open);
      if (searchWrap) {
        if (open) searchWrap.classList.remove('header-search--retracted');
      }
      if (iconBtn) {
        iconBtn.setAttribute('aria-label', open ? 'Закрыть поиск' : 'Поиск');
        iconBtn.classList.toggle('header-search-icon-btn--close', !!open);
      }
      try {
        if (global.MpHeaderSearchScroll && typeof global.MpHeaderSearchScroll.refresh === 'function') {
          global.MpHeaderSearchScroll.refresh();
        }
      } catch (_e) {}
    }
    function hide() {
      dd.classList.add('hidden');
      dd.innerHTML = '';
      setDropdownOpen(false);
    }
    function cleanPoster(src) { return cleanPosterUrl(src); }
    function searchLoadingHtml() {
      if (global.__MP_SEARCH_LOADING_HTML) return global.__MP_SEARCH_LOADING_HTML();
      return '<div class="mp-search-loading" role="status" aria-live="polite" aria-busy="true" aria-label="Ищем">'
        + '<div class="mp-search-loading-rings" aria-hidden="true"><span></span><span></span></div>'
        + '<p class="mp-search-loading-text">Ищем фильмы и людей…</p></div>';
    }
    function readRecentQueries() {
      try {
        var raw = localStorage.getItem('mp_header_search_recent_v1');
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter(function (x) { return String(x || '').trim().length >= 2; }).slice(0, 8) : [];
      } catch (_e) { return []; }
    }
    function applyQuery(q) {
      var query = String(q || '').trim();
      if (query.length < 2) return;
      input.value = query;
      if (clearBtn) clearBtn.classList.remove('hidden');
      run(query);
    }
    function renderStandaloneHub(premieres) {
      var popular = QUICK_QUERIES.slice(0, 8);
      var recent = readRecentQueries();
      var html = '<div class="hs-hub">';
      html += '<div class="header-search-recent-title">Популярные запросы</div><div class="header-search-recent-row hs-hub-chips-row">';
      popular.forEach(function (q) {
        html += '<button type="button" class="header-search-chip" data-hs-popular-q="' + escapeText(q) + '">' + escapeText(q) + '</button>';
      });
      html += '</div>';
      if (recent.length) {
        html += '<div class="header-search-recent-title">Недавние запросы</div><div class="header-search-recent-row hs-hub-chips-row">';
        recent.forEach(function (q) {
          html += '<button type="button" class="header-search-chip" data-hs-recent-q="' + escapeText(q) + '">' + escapeText(q) + '</button>';
        });
        html += '</div>';
      }
      html += '<div class="header-search-recent-title">Сейчас в прокате</div>';
      if (premieres && premieres.length) {
        html += '<div class="hs-hub-prem-scroll">';
        premieres.slice(0, 10).forEach(function (p) {
          var kp = String((p && p.kp_id) || '').replace(/\D/g, '');
          var title = escapeText((p && p.title) || '—');
          var poster = cleanPoster((p && p.poster) || '') || '/images/film-poster-placeholder.png';
          html += '<a class="hs-hub-prem-card" href="/f/' + encodeURIComponent(kp) + '">'
            + '<img class="hs-hub-prem-img" src="' + poster.replace(/"/g, '&quot;') + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">'
            + '<span class="hs-hub-prem-title">' + title + '</span></a>';
        });
        html += '</div>';
      } else {
        html += '<div class="header-search-empty hs-hub-empty">Список проката временно пуст</div>';
      }
      html += '<div class="hs-hub-foot"><a class="hs-hub-more" href="/search">Расширенный поиск →</a></div>';
      html += '</div>';
      dd.innerHTML = html;
      dd.classList.remove('hidden');
      setDropdownOpen(true);
    }
    function showStandaloneHub() {
      if (typeof global.showHeaderSearchHub === 'function' && global.__MP_CABINET_HEADER_SEARCH) {
        global.showHeaderSearchHub(dd);
        return;
      }
      var my = ++hubSeq;
      renderStandaloneHub([]);
      fetch(apiBase + '/api/public/premieres?period=month&limit=12', { method: 'GET', mode: 'cors' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (my !== hubSeq) return;
          if (input.value.trim().length >= 2) return;
          renderStandaloneHub((data && data.items) || []);
        })
        .catch(function () {});
    }
    if (typeof global.showHeaderSearchHub !== 'function') {
      global.showHeaderSearchHub = function (target) {
        if (target && target !== dd) return;
        showStandaloneHub();
      };
    }
    function render(items, persons) {
      items = items || [];
      persons = persons || [];
      if (!items.length && !persons.length) {
        dd.innerHTML = '<div class="header-search-empty">Ничего не нашлось</div>';
        dd.classList.remove('hidden');
        setDropdownOpen(true);
        return;
      }
      var html = '';
      if (persons.length) {
        html += persons.slice(0, 1).map(function (p) {
          var photo = cleanPoster(p.photo) || '/images/person-avatar-placeholder.png';
          var ru = String(p.name_ru || '').trim();
          var en = String(p.name_en || '').trim();
          var name = escapeText(ru || en || p.display_name || 'Персона');
          var secondary = (ru && en && en !== ru) ? escapeText(en) : '';
          var prof = escapeText(String(p.professions || '').slice(0, 60));
          return '<a class="hs-result hs-result-person search-result" href="/s/' + encodeURIComponent(String(p.kp_person_id)) + '">'
            + '<img class="hs-result-poster hs-result-person-photo search-result-poster" src="' + photo.replace(/"/g, '&quot;') + '" alt="" loading="lazy" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">'
            + '<span><span class="search-result-title site-search-person-name">' + name + '</span>'
            + (secondary ? '<span class="search-result-meta site-search-person-en">' + secondary + '</span>' : '')
            + '<span class="search-result-meta"><span>Актёр / режиссёр</span>'
            + (prof ? '<span>·</span><span>' + prof + '</span>' : '') + '</span></span></a>';
        }).join('');
      }
      html += items.slice(0, 6).map(function (it) {
        var typeLabel = it.type === 'series' ? 'Сериал' : 'Фильм';
        var year = it.year && String(it.year) !== 'null' ? String(it.year) : '';
        var posterSafe = cleanPoster(it.poster).replace(/"/g, '&quot;');
        // Never show bare kp_id as title (API bug showed «5502» for Back to the Future 2).
        var rawTitle = String(it.title || '').trim();
        if (/^\d+$/.test(rawTitle) || (it.kp_id && rawTitle === String(it.kp_id))) rawTitle = '';
        return '<a class="search-result" href="/f/' + encodeURIComponent(String(it.kp_id)) + '">' +
          (posterSafe ? '<img class="search-result-poster" src="' + posterSafe + '" alt="" loading="lazy" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">' : '<img class="search-result-poster mp-poster-placeholder" src="/images/film-poster-placeholder.png" alt="" loading="lazy">') +
          '<span><span class="search-result-title">' + escapeText(rawTitle || 'Фильм') + '</span>' +
          '<span class="search-result-meta"><span>' + escapeText(typeLabel) + '</span>' + (year ? '<span>·</span><span>' + escapeText(year) + '</span>' : '') + '</span></span></a>';
      }).join('');
      dd.innerHTML = html;
      dd.classList.remove('hidden');
      setDropdownOpen(true);
    }
    function run(q) {
      q = String(q || '').trim();
      if (clearBtn) clearBtn.classList.toggle('hidden', !q);
      if (q.length < 2) {
        showStandaloneHub();
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(function () {
        var mySeq = ++seq;
        if (controller) controller.abort();
        controller = global.AbortController ? new AbortController() : null;
        dd.innerHTML = searchLoadingHtml();
        dd.classList.remove('hidden');
        setDropdownOpen(true);
        fetch(apiBase + '/api/public/search?q=' + encodeURIComponent(q.slice(0, 60)) + '&limit=6&person_limit=1', {
          method: 'GET',
          mode: 'cors',
          signal: controller ? controller.signal : undefined,
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (mySeq !== seq) return;
            render((data && data.items) || [], (data && data.persons) || []);
          })
          .catch(function (e) {
            if (e && e.name === 'AbortError') return;
            if (mySeq === seq) {
              dd.innerHTML = '<div class="header-search-empty">Не удалось найти</div>';
              setDropdownOpen(true);
            }
          });
      }, SEARCH_DEBOUNCE_MS);
    }
    input.addEventListener('input', function () { run(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; if (clearBtn) clearBtn.classList.add('hidden'); hide(); input.blur(); }
      if (e.key === 'Enter') {
        var q = input.value.trim();
        if (q.length >= 2) global.location.href = '/search?q=' + encodeURIComponent(q);
      }
    });
    input.addEventListener('focus', function () {
      if (filmCabinetRoute && typeof global.ensureFullCabinet === 'function') {
        try { global.ensureFullCabinet(); } catch (_cab) {}
      }
      if (searchWrap) searchWrap.classList.remove('header-search--retracted');
      if (input.value.trim().length >= 2) {
        if (dd.innerHTML && !dd.querySelector('.hs-hub')) {
          dd.classList.remove('hidden');
          setDropdownOpen(true);
        } else {
          run(input.value);
        }
      } else {
        showStandaloneHub();
      }
    });
    if (iconBtn && !iconBtn.dataset.mpStandaloneSearchIcon) {
      iconBtn.dataset.mpStandaloneSearchIcon = '1';
      iconBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (document.body && document.body.classList.contains('header-search-dropdown-open')) {
          hide();
          input.blur();
          return;
        }
        input.focus();
        showStandaloneHub();
      });
    }
    if (dd && !dd.dataset.mpStandaloneHubClicks) {
      dd.dataset.mpStandaloneHubClicks = '1';
      dd.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('[data-hs-popular-q], [data-hs-recent-q]') : null;
        if (!chip) return;
        e.preventDefault();
        applyQuery(chip.getAttribute('data-hs-popular-q') || chip.getAttribute('data-hs-recent-q') || '');
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        input.value = '';
        clearBtn.classList.add('hidden');
        showStandaloneHub();
        input.focus();
      });
    }
    document.addEventListener('click', function (e) {
      var wrap = document.getElementById('header-search');
      var chromeBtn = document.getElementById('header-chrome-search-btn');
      if (chromeBtn && (e.target === chromeBtn || (chromeBtn.contains && chromeBtn.contains(e.target)))) return;
      if (wrap && !wrap.contains(e.target)) hide();
    });
  }

  function bindStandaloneVoiceMic(apiBase, loginNow) {
    var mic = document.getElementById('header-search-mic');
    var input = document.getElementById('header-search-input');
    if (!mic || mic._mpVoxBound) return;
    mic._mpVoxBound = true;
    mic.addEventListener('click', function () {
      if (!mpToken()) { if (loginNow) loginNow(); return; }
      if (mic._mpRec) {
        var r = mic._mpRecorder;
        if (r && r.state === 'recording') { try { r.stop(); } catch (_e) {} }
        return;
      }
      if (mic._mpPending) return;
      if (!navigator.mediaDevices || !global.MediaRecorder) return;
      mic._mpPending = true;
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        mic._mpPending = false;
        var ch = [];
        var opt = (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') && 'audio/webm;codecs=opus') ||
          (MediaRecorder.isTypeSupported('audio/webm') && 'audio/webm') || 'audio/ogg';
        var rec = new MediaRecorder(stream, { mimeType: opt });
        mic._mpRecorder = rec;
        rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) ch.push(ev.data); };
        rec.onstop = function () {
          try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_e) {}
          mic._mpRecorder = null;
          mic.classList.remove('recording');
          mic._mpRec = false;
          if (!ch.length) return;
          var blob = new Blob(ch, { type: rec.mimeType || 'audio/webm' });
          var fd = new FormData();
          fd.append('audio', blob, 'q.webm');
          var voxH = mpAuthHeaders();
          delete voxH['Content-Type'];
          fetch(apiBase + '/api/site/voice-transcribe', { method: 'POST', body: fd, headers: voxH })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d && d.success && d.text && input) {
                input.value = d.text;
                input.dispatchEvent(new Event('input', { bubbles: true }));
              }
            })
            .catch(function () {});
        };
        mic._mpRec = true;
        mic.classList.add('recording');
        rec.start(100);
      }).catch(function () { mic._mpPending = false; });
    });
  }

  function closeStandaloneAccountDropdown() {
    var dd = document.getElementById('header-settings-dropdown');
    var settingsBtn = document.getElementById('header-settings-btn');
    if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'false');
    if (dd) {
      dd.classList.add('hidden');
      dd.classList.remove('open');
    }
    var bd = document.getElementById('header-settings-backdrop');
    if (bd) bd.remove();
    document.body.classList.remove('account-menu-open');
  }

  function bindStandaloneAccountOutsideClose() {
    if (document.documentElement.dataset.mpStandaloneAccountOutsideClose) return;
    document.documentElement.dataset.mpStandaloneAccountOutsideClose = '1';
    document.addEventListener('click', function (e) {
      var dd = document.getElementById('header-settings-dropdown');
      if (!dd || dd.classList.contains('hidden') || !document.body.classList.contains('account-menu-open')) return;
      if (e.target.closest('#header-settings-dropdown') || e.target.closest('#header-settings-btn')) return;
      closeStandaloneAccountDropdown();
    });
  }

  function blockStandaloneGhostClicks(ms) {
    var blocker = document.getElementById('mp-touch-blocker');
    if (!blocker) {
      blocker = document.createElement('div');
      blocker.id = 'mp-touch-blocker';
      blocker.className = 'mp-touch-blocker';
      document.body.appendChild(blocker);
    }
    blocker.classList.add('active');
    setTimeout(function () { blocker.classList.remove('active'); }, ms || 480);
  }

  function standaloneLogoutAll(kpId) {
    try {
      localStorage.removeItem('mp_site_sessions');
      localStorage.removeItem('mp_site_active_chat_id');
      localStorage.removeItem('mp_site_token');
      sessionStorage.setItem('mp_public_film_force', String(kpId || ''));
    } catch (_e) {}
    blockStandaloneGhostClicks(520);
    closeStandaloneAccountDropdown();
    var kp = String(kpId || '').replace(/\D/g, '');
    global.location.href = kp ? ('/f/' + kp) : '/';
  }

  function bindStandaloneLogoutBtn(btn, kpId) {
    if (!btn || btn._mpLogoutBound) return;
    btn._mpLogoutBound = true;
    var run = function (e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = 'Выход…';
      setTimeout(function () { standaloneLogoutAll(kpId); }, 32);
    };
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
    btn.addEventListener('click', run);
  }

  function openStandaloneAccountDropdown(opts) {
    opts = opts || {};
    var dd = document.getElementById('header-settings-dropdown');
    var settingsBtn = document.getElementById('header-settings-btn');
    if (!dd) return;
    if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'true');
    var html = '<div class="header-dropdown-title">Перейти</div>'
      + '<button type="button" class="header-settings-nav-item" data-settings-go="settings">👤 Профиль</button>'
      + '<button type="button" class="header-settings-nav-item" data-settings-go="groups">👥 Друзья и группы</button>'
      + '<button type="button" class="header-settings-nav-item" data-settings-go="stats"><span class="mp-icon mp-icon--sm" data-mp-icon="stats"></span><span>Статистика</span></button>'
      + '<button type="button" class="header-settings-nav-item" data-settings-go="shazam">🔮 Подбор по описанию</button>'
      + '<button type="button" class="header-settings-nav-item" data-settings-go="integrations">🔌 Интеграции</button>'
      + '<button type="button" class="header-settings-nav-item" data-settings-go="about">ℹ️ О проекте</button>'
      + '<div class="header-dropdown-divider"></div>'
      + '<button type="button" class="header-dropdown-logout" data-action="logout-all">Выйти</button>';
    dd.innerHTML = html;
    dd.querySelectorAll('[data-settings-go]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        closeStandaloneAccountDropdown();
        var go = btn.getAttribute('data-settings-go');
        var path = STANDALONE_SECTION_PATHS[go];
        if (path) global.location.href = path;
      });
    });
    var logoutBtn = dd.querySelector('[data-action="logout-all"]');
    if (logoutBtn) bindStandaloneLogoutBtn(logoutBtn, opts.kpId || '');
    bindStandaloneAccountOutsideClose();
    var staleBd = document.getElementById('header-settings-backdrop');
    if (staleBd) staleBd.remove();
    document.body.classList.add('account-menu-open');
    dd.classList.remove('hidden');
    dd.classList.add('open');
  }

  function bindStandaloneHeaderChrome(me, opts) {
    opts = opts || {};
    var uid = me && me.user_id;
    var pill = document.getElementById('header-profile-pill');
    if (pill && !pill.dataset.mpStandaloneBound) {
      pill.dataset.mpStandaloneBound = '1';
      pill.addEventListener('click', function (e) {
        e.preventDefault();
        closeStandaloneAccountDropdown();
        if (uid) {
          global.location.href = '/u/' + encodeURIComponent(String(uid));
        }
      });
    }
    var settingsBtn = document.getElementById('header-settings-btn');
    if (settingsBtn && !settingsBtn.dataset.mpStandaloneBound) {
      settingsBtn.dataset.mpStandaloneBound = '1';
      settingsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var dd = document.getElementById('header-settings-dropdown');
        if (dd && dd.classList.contains('open') && !dd.classList.contains('hidden')) {
          closeStandaloneAccountDropdown();
        } else {
          openStandaloneAccountDropdown({ kpId: opts.kpId || '' });
        }
      });
    }
    var coinsBtn = document.getElementById('header-coins-btn');
    if (coinsBtn && me && me.coins && !coinsBtn.dataset.mpCoinsBound) {
      coinsBtn.dataset.mpCoinsBound = '1';
      coinsBtn.addEventListener('click', function () {
        var c = me.coins;
        var msg = c.is_infinite ? 'Безлимитные монетки' : ('Монетки: ' + (c.balance != null ? c.balance : '—'));
        try {
          var el = document.getElementById('public-toast');
          if (!el) {
            el = document.createElement('div');
            el.id = 'public-toast';
            el.className = 'public-toast';
            document.body.appendChild(el);
          }
          el.textContent = msg;
          el.classList.add('show');
          clearTimeout(el._hideTimer);
          el._hideTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
        } catch (_e) {}
      });
    }
    if (!global._mpStandaloneDropdownCloseBound) {
      global._mpStandaloneDropdownCloseBound = true;
    }
  }

  function standaloneHeaderHasAuthShell() {
    var wrap = document.getElementById('header-user-wrap');
    var search = document.getElementById('header-search');
    return !!(wrap && search);
  }

  function patchStandaloneAuthHeader(me, opts) {
    opts = opts || {};
    var apiBase = opts.apiBase || API_BASE;
    var mainSelector = opts.mainSelector || 'main.film-page';
    var name = (me && me.name) || 'Профиль';
    var coinsVal = '—';
    if (me && me.coins) {
      coinsVal = me.coins.is_infinite ? '∞' : (me.coins.balance != null ? String(me.coins.balance) : '—');
    }
    var photo = (me && (me.photo_url || me.avatar_url)) || '';
    if (!photo && me && me.chat_id) {
      photo = apiBase + '/api/avatar/' + encodeURIComponent(String(me.chat_id)) + '.jpg';
    }
    try {
      document.documentElement.classList.add('mp-session');
    } catch (_sess) {}
    var loginBtn = document.getElementById('login-btn') || document.querySelector('#site-header [data-action="login"]');
    if (loginBtn) loginBtn.classList.add('hidden');
    var wrap = document.getElementById('header-user-wrap');
    if (wrap) wrap.classList.remove('hidden');
    var pill = document.getElementById('header-profile-pill');
    if (pill) pill.classList.remove('hidden');
    var nameEl = document.getElementById('header-profile-name');
    if (nameEl) nameEl.textContent = name;
    /* Thin /f/|/s/ shell: cabinet-app.js is not loaded — unhide coins/inbox ourselves. */
    var coinsBtn = document.getElementById('header-coins-btn');
    if (coinsBtn) coinsBtn.classList.remove('hidden');
    var coinsEl = document.getElementById('header-coins-val');
    if (coinsEl) coinsEl.textContent = coinsVal;
    var inboxWrap = document.getElementById('header-inbox-wrap');
    if (inboxWrap) inboxWrap.classList.remove('hidden');
    setStandaloneHeaderAvatar(document.getElementById('header-profile-avatar'), photo, name, apiBase);
    bindStandaloneHeaderChrome(me, Object.assign({}, opts, { kpId: opts.kpId || '' }));
    var inboxBtn = document.getElementById('header-inbox-btn');
    if (inboxBtn && !inboxBtn.dataset.mpInboxBound) {
      inboxBtn.dataset.mpInboxBound = '1';
      inboxBtn.addEventListener('click', function (e) {
        e.preventDefault();
        closeStandaloneAccountDropdown();
        global.location.href = '/inbox';
      });
    }
    if (!opts.skipStandaloneNav) {
      var shell = document.querySelector('.page-shell');
      var main = shell && shell.querySelector(mainSelector);
      var nav = document.getElementById('film-standalone-nav');
      if (nav) nav.remove();
      if (shell && main) {
        var navWrap = document.createElement('div');
        navWrap.innerHTML = standaloneNavHtml();
        var navEl = navWrap.firstElementChild;
        shell.insertBefore(navEl, main);
        hideCabinetSectionNavWhenStandalone();
        bindStandaloneNavLinks(navEl);
        try {
          if (global.MPIcons && global.MPIcons.hydrate) global.MPIcons.hydrate(navEl);
        } catch (_e) {}
      }
    }
    bindStandaloneSearch(apiBase, opts.loginNow);
    bindStandaloneVoiceMic(apiBase, opts.loginNow);
    bindStandaloneLogoHome();
  }

  function applyStandaloneAuthChrome(me, opts) {
    opts = opts || {};
    var apiBase = opts.apiBase || API_BASE;
    var mainSelector = opts.mainSelector || 'main.film-page';
    var header = document.getElementById('site-header');
    if (!header) return;
    // Thin /f/ shell + cabinetMode: still paint name/avatar/coins/inbox (do NOT wait for cabinet-app.js).
    if (opts.cabinetMode || standaloneHeaderHasAuthShell()) {
      patchStandaloneAuthHeader(me, Object.assign({}, opts, { skipStandaloneNav: !!opts.cabinetMode }));
      return;
    }
    var name = (me && me.name) || 'Профиль';
    var coinsVal = '—';
    if (me && me.coins) {
      coinsVal = me.coins.is_infinite ? '∞' : (me.coins.balance != null ? String(me.coins.balance) : '—');
    }
    var photo = (me && (me.photo_url || me.avatar_url)) || '';
    if (!photo && me && me.chat_id) {
      photo = apiBase + '/api/avatar/' + encodeURIComponent(String(me.chat_id)) + '.jpg';
    }
    header.innerHTML =
      '<div class="header-content">' +
        '<a class="logo" href="/"><img src="/images/icon48.png" alt="Movie Planner"><span>Movie Planner</span></a>' +
        standaloneHeaderSearchHtml() +
        '<div class="header-buttons">' +
          '<div class="header-user-wrap account-switcher" id="header-user-wrap" style="position:relative">' +
            '<div class="header-util-row" id="header-util-row">' +
              '<button type="button" class="header-chrome-search-btn" id="header-chrome-search-btn" aria-label="Поиск" title="Поиск">' +
                '<svg class="header-chrome-search-glyph" width="20" height="20" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg>' +
              '</button>' +
              '<button type="button" class="header-coins-btn" id="header-coins-btn" aria-label="Монетки">' +
                '<span class="header-coins-sprite"></span><span id="header-coins-val">' + escapeHtml(coinsVal) + '</span>' +
              '</button>' +
              '<div class="header-inbox-wrap" id="header-inbox-wrap">' +
                '<button type="button" class="header-inbox-btn" id="header-inbox-btn" aria-label="Уведомления" title="Уведомления">' +
                  '<span class="header-inbox-icon" aria-hidden="true">📥</span>' +
                '</button>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="header-profile-pill" id="header-profile-pill" aria-label="Профиль">' +
              '<span class="header-profile-avatar" id="header-profile-avatar"></span>' +
              '<span class="header-profile-name" id="header-profile-name">' + escapeHtml(name) + '</span>' +
            '</button>' +
            '<button type="button" class="header-settings-btn" id="header-settings-btn" aria-haspopup="true" aria-expanded="false" title="Настройки">' +
              '<span class="header-settings-btn-icon" aria-hidden="true">⚙️</span><span class="header-settings-btn-text">Настройки</span>' +
            '</button>' +
            '<div class="header-settings-dropdown account-dropdown hidden" id="header-settings-dropdown" role="menu"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    setStandaloneHeaderAvatar(document.getElementById('header-profile-avatar'), photo, name, apiBase);
    bindStandaloneHeaderChrome(me, Object.assign({}, opts, { kpId: opts.kpId || '' }));
    var inboxBtn = document.getElementById('header-inbox-btn');
    if (inboxBtn && !inboxBtn.dataset.mpInboxBound) {
      inboxBtn.dataset.mpInboxBound = '1';
      inboxBtn.addEventListener('click', function (e) {
        e.preventDefault();
        closeStandaloneAccountDropdown();
        global.location.href = '/inbox';
      });
    }
    var shell = document.querySelector('.page-shell');
    var main = shell && shell.querySelector(mainSelector);
    var nav = document.getElementById('film-standalone-nav');
    if (nav) nav.remove();
    if (shell && main) {
      var navWrap = document.createElement('div');
      navWrap.innerHTML = standaloneNavHtml();
      var navEl = navWrap.firstElementChild;
      shell.insertBefore(navEl, main);
      hideCabinetSectionNavWhenStandalone();
      bindStandaloneNavLinks(navEl);
    }
    bindStandaloneSearch(apiBase, opts.loginNow);
    bindStandaloneVoiceMic(apiBase, opts.loginNow);
    bindStandaloneLogoHome();
  }

  function refreshStandaloneAuthChrome(opts) {
    opts = opts || {};
    var apiBase = opts.apiBase || API_BASE;
    var mainSelector = opts.mainSelector || 'main.film-page';
    if (!mpToken() || opts.forcePublic) {
      mountStandaloneCabinetNav(mainSelector);
      return;
    }
    fetch(apiBase + '/api/site/me', { headers: mpAuthHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (me) {
        if (!me || !me.success) return;
        applyStandaloneAuthChrome(me, Object.assign({}, opts, { kpId: opts.kpId || '' }));
        if (opts.onAuthSuccess) opts.onAuthSuccess(me);
      })
      .catch(function () {});
  }

  function initStandaloneSiteChrome(opts) {
    opts = opts || {};
    var apiBase = opts.apiBase || API_BASE;
    var loginNow = opts.loginNow || function (action) {
      if (global.MpPublicFilmLogin) {
        MpPublicFilmLogin.open(action || '');
        return;
      }
      if (typeof global.showLoginModalOverlay === 'function') {
        global.showLoginModalOverlay();
        return;
      }
      var modal = document.getElementById('login-modal');
      if (modal) {
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        modal.classList.add('mp-login-portal');
        document.body.classList.add('login-only-overlay');
        document.body.style.overflow = 'hidden';
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        return;
      }
      var path = opts.spaReturnPath || global.location.pathname || '/';
      if (/^\/f\/\d+$/.test(path) || /^\/s\/\d+$/.test(path)) return;
      global.location.href = '/?open_login=1&__spa=' + encodeURIComponent(path);
    };
    var loginBtn = document.getElementById('login-btn') || document.querySelector('#site-header [data-action="login"]');
    if (loginBtn && opts.bindLogin !== false) {
      loginBtn.addEventListener('click', function () { loginNow(); });
    }
    bindStandaloneSearch(apiBase, loginNow);
    bindStandaloneVoiceMic(apiBase, loginNow);
    bindStandaloneLogoHome();
    try {
      if (global.MPIcons && global.MPIcons.hydrate) global.MPIcons.hydrate(document.getElementById('site-header'));
    } catch (_hydrate) {}
    if (global.MpPublicFilmLogin && opts.initPublicFilmLogin !== false) {
      MpPublicFilmLogin.init({
        kpId: opts.kpId || '',
        apiBase: apiBase,
        onSuccess: function () {
          refreshStandaloneAuthChrome(opts);
          if (opts.onLoginSuccess) opts.onLoginSuccess();
        },
      });
    }
    function refresh() { refreshStandaloneAuthChrome(opts); }
    refresh();
    return { refresh: refresh, loginNow: loginNow };
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

  function buildFilmMainInnerHtml(kpId, poster) {
    var kpNumeric = numericKpFilmId(kpId);
    var posterSrc = resolveFilmPosterDisplay(poster, kpNumeric);
    var phCls = posterSrc.indexOf('film-poster-placeholder') >= 0 ? ' mp-poster-placeholder' : '';
    var isAuthed = !!mpToken();
    var toolbarHtml = buildFilmPageToolbar({ kp_id: kpNumeric }, { inBase: false, authenticated: isAuthed, canRate: true });
    var tagBtn = isAuthed
      ? ('<button type="button" class="film-hero-tag-btn" id="film-user-tag-btn" aria-label="В список" title="В список">' +
          (global.MPIcons ? global.MPIcons.html('bookmark', { className: 'film-hero-tag-ico', weight: 'fill' }) : '<span data-tag-emoji>🔖</span>') +
        '</button>')
      : '';
    return (
      '<section class="hero film-hero-with-tag' + (isAuthed ? ' film-hero--authed' : '') + '" data-kp-id="' + escapeHtml(kpNumeric) + '">' +
        tagBtn +
        '<div class="poster-wrap' + (phCls ? ' film-poster-has-placeholder' : '') + '"><img class="poster' + phCls + '" id="poster" src="' + posterSrc + '" alt="Постер" referrerpolicy="no-referrer" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)"></div>' +
        '<div class="hero-content">' +
          '<h1 id="film-title"><span class="mp-film-title-loading">Загрузка…</span></h1>' +
          '<div class="film-hero-meta-stack">' +
            '<p class="film-title-en is-empty" id="film-title-en" aria-hidden="true" hidden></p>' +
            '<p class="film-genres-line is-empty" id="film-genres-line" aria-hidden="true" hidden></p>' +
            '<p class="film-meta-line is-empty" id="film-meta-line" aria-hidden="true" hidden></p>' +
            buildFilmExtRatingsSlotHtml(null) +
          '</div>' +
          '<div class="film-hero-crew is-loading" id="film-cast-root">' + buildFilmCastSkeletonHtml() + '</div>' +
          buildFilmDescWrapHtml() +
          toolbarHtml +
          buildFilmReviewsSlotHtml() +
          '<p class="status" id="hint"></p>' +
        '</div>' +
      '</section>'
    );
  }

  function paintFilmPublicLoadFail(message) {
    var msg = String(message || 'Не удалось загрузить карточку фильма').trim();
    var tEl = document.getElementById('film-title');
    if (tEl) {
      var loading = tEl.querySelector('.mp-film-title-loading');
      if (loading || !String(tEl.textContent || '').trim() || /загрузка/i.test(tEl.textContent || '')) {
        var boot = null;
        try { boot = readMpRouteBoot(); } catch (_b) {}
        var bootTitle = boot && boot.title ? String(boot.title).trim() : '';
        if (bootTitle && !isGenericFilmTitle(bootTitle)) {
          tEl.textContent = bootTitle + (boot.year ? ' (' + boot.year + ')' : '');
        } else {
          tEl.textContent = 'Фильм';
        }
      }
    }
    if (!String(lastFilmDescription || '').trim()) {
      try {
        var bootKeep = readMpRouteBoot();
        if (bootKeep && bootKeep.description) setFilmDescription(bootKeep.description);
      } catch (_d) {}
    }
    var hint = document.getElementById('hint');
    if (hint) hint.textContent = msg;
    try {
      document.documentElement.classList.add('mp-route-ready');
      document.documentElement.classList.remove('mp-route-pending');
    } catch (_r) {}
  }

  function isGenericFilmTitle(title) {
    var t = String(title || '').trim();
    if (!t || t === 'Фильм' || t === 'Film' || t === 'Сериал' || t === 'Series') return true;
    return /^(фильм|сериал|film|series)\s+\d+$/i.test(t);
  }

  function paintCabinetRouteBoot(routeKey, pageRoot, poster, routeMeta) {
    var boot = readMpRouteBoot();
    if (!boot || boot.type !== 'film') return false;
    var meta = routeMeta || {};
    var bootKp = String(boot.kp_id || '').replace(/\D/g, '');
    var bootCatalog = String(boot.catalog_id || '').toLowerCase();
    var bootTmdb = String(boot.tmdb_id || '').replace(/\D/g, '');
    var key = String(routeKey || '');
    var keyDigits = key.replace(/\D/g, '');
    var match = false;
    if (meta.mode === 'tmdb') {
      var wantCatalog = String(meta.catalogId || '').toLowerCase();
      var wantTmdb = String(meta.tmdbId || '').replace(/\D/g, '');
      match = (bootCatalog && wantCatalog && bootCatalog === wantCatalog)
        || (bootTmdb && wantTmdb && bootTmdb === wantTmdb)
        || (key && bootCatalog && bootCatalog === key.toLowerCase());
    } else if (meta.mode === 'fest') {
      var wantFest = String(meta.festSlug || '').toLowerCase();
      var bootFest = String(boot.fest_slug || '').toLowerCase();
      match = (bootFest && wantFest && bootFest === wantFest)
        || (bootCatalog && key && bootCatalog === key.toLowerCase())
        || (bootCatalog && bootCatalog.indexOf('fest-') === 0 && key && bootCatalog === ('fest-' + wantFest));
    } else if (meta.mode === 'mp') {
      var wantMp = String(meta.mpFilmId || '').replace(/\D/g, '');
      var bootMp = String(boot.mp_film_id || '').replace(/\D/g, '');
      match = (bootMp && wantMp && bootMp === wantMp)
        || (bootCatalog && key && bootCatalog === key.toLowerCase())
        || (bootCatalog && bootCatalog.indexOf('mp-') === 0 && wantMp && bootCatalog === ('mp-' + wantMp));
    } else {
      match = bootKp && keyDigits && bootKp === keyDigits;
    }
    if (!match) return false;
    var title = preferRuFilmTitle(boot.title || '', bootKp || keyDigits) || boot.title || 'Фильм';
    if (isGenericFilmTitle(title) && !readNavFilmTitleRu(bootKp || keyDigits)) {
      title = 'Загрузка…';
    }
    // Boot sometimes carries Latin original — never paint that into #film-title when RU exists.
    if (title && !/[а-яА-ЯёЁ]/.test(title)) {
      var navEarly = readNavFilmTitleRu(bootKp || keyDigits);
      if (navEarly) title = navEarly;
    }
    var bootPoster = boot.poster_url || poster;
    var year = boot.year ? ' (' + boot.year + ')' : '';
    var heroKey = (meta.mode === 'tmdb' || meta.mode === 'fest' || meta.mode === 'mp')
      ? (meta.catalogId || key)
      : (bootKp || keyDigits);
    pageRoot.className = 'movie-page';
    pageRoot.innerHTML = buildFilmMainInnerHtml(heroKey, bootPoster);
    setFilmHeroBackdrop(bootPoster, heroKey);
    var titleEl = document.getElementById('film-title');
    if (titleEl) titleEl.textContent = title;
    setFilmHeaderTitle(title);
    syncFilmHeroMeta(pageRoot, {
      title: title,
      title_en: boot.title_en || boot.name_en || '',
      year: boot.year,
      duration_min: boot.duration_min || boot.film_length,
      age_rating: boot.age_rating,
      country: boot.country,
      genres: boot.genres,
      is_series: !!boot.is_series,
      series_stats: boot.series_stats,
      rating_kp: boot.rating_kp,
      rating_imdb: boot.rating_imdb,
      rating_kp_votes: boot.rating_kp_votes,
      rating_imdb_votes: boot.rating_imdb_votes,
    });
    syncFilmExtRatings(pageRoot, boot);
    if (boot.description) setFilmDescription(boot.description);
    var descWrapBoot = pageRoot.querySelector('#film-desc-wrap');
    if (descWrapBoot) {
      bindFilmDescExpand(descWrapBoot);
      if (boot.facts && boot.facts.length || boot.web_facts && boot.web_facts.length) {
        paintFilmDescFacts(descWrapBoot, { facts: boot.facts || [], web_facts: boot.web_facts || [] });
      }
    }
    try {
      if (!mpToken() && global.MpPublicPromo && typeof global.MpPublicPromo.mountAfterHero === 'function') {
        global.MpPublicPromo.mountAfterHero(pageRoot);
      }
    } catch (_e) {}
    // fest-/movie- keys contain years (…-2025); never treat those digits as kp_id → empty /facts wipe.
    if (descWrapBoot && meta.mode !== 'tmdb' && meta.mode !== 'fest' && meta.mode !== 'mp') {
      try {
        var bootFactsKp = numericKpFilmId(boot.kp_id);
        if (bootFactsKp) loadFilmDescFacts(bootFactsKp, pageRoot);
      } catch (_facts) {}
    }
    try {
      document.title = title + year + ' · Movie Planner';
    } catch (_e) {}
    return true;
  }

  function filmHeroContentRoot(cabinetMode) {
    return document.querySelector(cabinetMode ? '#film-page-content .hero-content' : '.film-page .hero-content');
  }

  function renderFilmPage(opts) {
    opts = opts || {};
    var cabinetMode = !!opts.cabinetMode;
    var routeFromPath = parseFilmRoute();
    var tmdbId = String(opts.tmdbId || (routeFromPath && routeFromPath.tmdbId) || '').replace(/\D/g, '');
    var mediaType = String(opts.mediaType || (routeFromPath && routeFromPath.mediaType) || '').toLowerCase();
    if (mediaType !== 'tv') mediaType = mediaType === 'movie' ? 'movie' : (tmdbId ? 'movie' : '');
    var catalogId = String(opts.catalogId || (routeFromPath && routeFromPath.catalogId) || '');
    if (!catalogId && tmdbId && mediaType) catalogId = mediaType + '-' + tmdbId;
    var kpId = String(opts.kpId || (routeFromPath && routeFromPath.kpId) || '').replace(/\D/g, '');
    var festSlug = String(opts.festSlug || (routeFromPath && routeFromPath.festSlug) || '').trim();
    var mpFilmId = String(opts.mpFilmId || (routeFromPath && routeFromPath.mpFilmId) || '').replace(/\D/g, '');
    var isMp = !kpId && !tmdbId && !festSlug && !!mpFilmId;
    var isFest = !kpId && !tmdbId && !mpFilmId && !!festSlug;
    var isTmdbOnly = !kpId && !!tmdbId && !isFest && !isMp;
    if (isTmdbOnly && !mediaType) mediaType = 'movie';
    if (isTmdbOnly && !catalogId) catalogId = mediaType + '-' + tmdbId;
    if (isFest && !catalogId) catalogId = 'fest-' + festSlug;
    if (isMp && !catalogId) catalogId = 'mp-' + mpFilmId;
    var pathKey = isMp ? ('mp-' + mpFilmId) : (isFest ? ('fest-' + festSlug) : (isTmdbOnly ? catalogId : kpId));
    if (!pathKey) return;
    var routeMeta = {
      mode: isMp ? 'mp' : (isFest ? 'fest' : (isTmdbOnly ? 'tmdb' : 'kp')),
      kpId: kpId,
      tmdbId: tmdbId,
      mediaType: mediaType,
      catalogId: catalogId,
      festSlug: festSlug,
      mpFilmId: mpFilmId,
      pathKey: pathKey,
    };
    var publicFilmApi = isMp
      ? '/api/public/film/mp/' + encodeURIComponent(mpFilmId)
      : (isFest
      ? '/api/public/film/fest/' + encodeURIComponent(festSlug)
      : (isTmdbOnly
      ? '/api/public/film/tmdb/' + encodeURIComponent(mediaType) + '/' + encodeURIComponent(tmdbId)
      : '/api/public/film/' + encodeURIComponent(kpId)));
    var publicCastApi = isMp
      ? '/api/public/film/mp/' + encodeURIComponent(mpFilmId) + '/cast'
      : (isFest
      ? '/api/public/film/fest/' + encodeURIComponent(festSlug) + '/cast'
      : (isTmdbOnly
      ? '/api/public/film/tmdb/' + encodeURIComponent(mediaType) + '/' + encodeURIComponent(tmdbId) + '/cast'
      : '/api/public/film/' + encodeURIComponent(kpId) + '/cast'));

      function sessionsEarly() {
        try { return JSON.parse(localStorage.getItem('mp_site_sessions') || '[]'); } catch (_e) { return []; }
      }
      function tokenEarly() {
        try {
          var active = localStorage.getItem('mp_site_active_chat_id');
          var row = sessionsEarly().find(function (x) { return String(x.chat_id) === String(active); });
          return row ? row.token : null;
        } catch (_e) { return null; }
      }
      var forcePublic = false;
      try {
        var forceKp = sessionStorage.getItem('mp_public_film_force');
        if (forceKp && String(forceKp) === String(pathKey)) {
          sessionStorage.removeItem('mp_public_film_force');
          forcePublic = true;
          localStorage.removeItem('mp_site_active_chat_id');
          localStorage.setItem('mp_site_sessions', '[]');
          localStorage.removeItem('mp_site_token');
        }
      } catch (_e) {}
      var poster = MP_POSTER_PLACEHOLDER;
      var tgMini = 'https://t.me/movie_planner_bot/app?startapp=' + encodeURIComponent(
        isTmdbOnly ? ('tmdb_' + mediaType + '_' + tmdbId) : ('film_' + kpId)
      );
      var apiBase = opts.apiBase || API_BASE;
      var pageUrl = (opts.pageUrl || (window.location.origin + '/f/' + pathKey));
      var fallbackFacts = [
        'Добавьте фильм в базу, чтобы он появился в вашем Movie Planner.',
        'Оценка сохранится в профиле и поможет рекомендациям.',
        'Фильм можно сразу запланировать для домашнего просмотра или кинотеатра.'
      ];

      document.title = 'Фильм · Movie Planner';
      setFilmHeroBackdrop('');
      try {
        document.documentElement.classList.remove('mp-route-pending');
        document.documentElement.classList.add('mp-route-ready');
      } catch (_route) {}

      if (cabinetMode) {
        var pageRoot = document.getElementById('film-page-content');
        if (!pageRoot) return;
        if (!paintCabinetRouteBoot(pathKey, pageRoot, poster, routeMeta)) {
          var hasBootHero = pageRoot.querySelector('.film-hero-with-tag, .hero.film-hero-with-tag, .film-page--boot');
          if (hasBootHero) {
            pageRoot.className = 'movie-page';
          } else {
            var shellKey = (routeMeta && routeMeta.mode === 'kp')
              ? (kpId || pathKey)
              : ((routeMeta && routeMeta.catalogId) || pathKey);
            pageRoot.className = 'movie-page';
            pageRoot.innerHTML = buildFilmMainInnerHtml(shellKey, poster);
            setFilmHeroBackdrop(poster, shellKey);
          }
        }
      } else {
      document.body.innerHTML =
        '<div class="page-shell">' +
          '<header id="site-header">' +
            '<div class="header-content">' +
              '<a class="logo" href="/"><img src="/images/icon48.png" alt="Movie Planner"><span>Movie Planner</span></a>' +
              '<div class="header-search" id="header-search" role="search">' +
                '<span class="header-search-icon mp-icon" data-mp-icon="search" aria-hidden="true"></span>' +
                '<input type="text" id="header-search-input" class="header-search-input" placeholder="Найти фильм или сериал…" autocomplete="off" aria-label="Поиск">' +
                '<button type="button" class="header-search-mic mp-icon-btn" id="header-search-mic" data-mp-icon="voice" data-mp-icon-weight="duotone" aria-label="Голосовой ввод" title="Голосовой ввод"></button>' +
                '<button type="button" class="header-search-clear hidden" id="header-search-clear" aria-label="Очистить">×</button>' +
                '<div class="header-search-dropdown hidden" id="header-search-dropdown" role="listbox"></div>' +
              '</div>' +
              '<div class="header-buttons">' +
                '<button type="button" class="btn-primary" id="login-btn">Войти</button>' +
              '</div>' +
            '</div>' +
          '</header>' +
          appOpenBannerHtml() +
          '<main class="film-page">' +
            '<section class="hero film-hero-with-tag">' +
              '<div class="poster-wrap film-poster-has-placeholder"><img class="poster mp-poster-placeholder" id="poster" src="' + MP_POSTER_PLACEHOLDER + '" alt="Постер" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)"></div>' +
              '<div class="hero-content">' +
                '<h1 id="film-title"><span class="mp-film-title-loading">Загрузка…</span></h1>' +
                '<div class="film-hero-meta-stack">' +
                  '<p class="film-title-en is-empty" id="film-title-en" aria-hidden="true" hidden></p>' +
                  '<p class="film-genres-line is-empty" id="film-genres-line" aria-hidden="true" hidden></p>' +
                  '<p class="film-meta-line is-empty" id="film-meta-line" aria-hidden="true" hidden></p>' +
                  buildFilmExtRatingsSlotHtml(null) +
                '</div>' +
                '<div class="film-hero-crew is-loading" id="film-cast-root">' + buildFilmCastSkeletonHtml() + '</div>' +
                buildFilmDescWrapHtml() +
                buildFilmPageToolbar({ kp_id: '' }, { inBase: false, authenticated: false, canRate: true }) +
                buildFilmReviewsSlotHtml() +
                '<div id="film-friends-social-block" class="hidden"></div>' +
                '<p class="status" id="hint"></p>' +
              '</div>' +
            '</section>' +
          '</main>' +
          '<aside id="film-seo-root" class="film-seo-root visually-hidden" aria-label="О фильме"></aside>' +
          '<footer class="footer">' +
            '<div class="container">' +
              '<div class="footer-content">' +
                '<div class="footer-info">' +
                  '<h3>Контакты</h3>' +
                  '<p>📍 Москва</p>' +
                  '<p>📞 +7 (977) 613-45-08</p>' +
                  '<p>✉️ <a href="mailto:movie-planner-bot@yandex.com">movie-planner-bot@yandex.com</a></p>' +
                  '<p>💬 <a href="https://t.me/zapnikita95" target="_blank" rel="noopener">По всем вопросам: @zapnikita95</a></p>' +
                '</div>' +
                '<div class="footer-social">' +
                  '<h3>Мы в соцсетях</h3>' +
                  '<div class="social-links">' +
                    '<a href="https://t.me/movie_planner_channel" target="_blank" rel="noopener" class="social-link" aria-label="Telegram канал"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161l-1.84 8.68c-.135.608-.486.758-.984.472l-2.72-2.004-1.313 1.26c-.149.15-.275.275-.564.275l.2-2.83 5.033-4.547c.22-.196-.048-.305-.342-.11l-6.22 3.918-2.68-.84c-.584-.183-.598-.584.11-.88l10.46-4.03c.486-.18.91.112.75.7z"/></svg></a>' +
                    '<a href="https://instagram.com/movie_planner_bot" target="_blank" rel="noopener" class="social-link" aria-label="Instagram"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></a>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="footer-bottom">' +
                '<p>© ' + String(new Date().getFullYear()) + ' Movie Planner. Все права защищены. · ' +
                  '<a href="/usloviya-ispolzovaniya.html" class="footer-link-muted">Условия использования</a>' +
                  ' · <a href="/politika-konfidentsialnosti.html" class="footer-link-muted">Политика конфиденциальности</a>' +
                  ' · <a href="/oferta-i-oplata.html" class="footer-link-muted">Оплата и оферта</a>' +
                  ' · <a href="/agents.html" class="footer-link-muted">API и нейросети</a>' +
                  ' · <a href="https://movie-planner.ru/developer" class="footer-link-muted">Документация API</a>' +
                '</p>' +
              '</div>' +
            '</div>' +
          '</footer>' +
        '</div>';

      var initDescWrap = document.querySelector('#film-desc-wrap');
      if (initDescWrap) bindFilmDescExpand(initDescWrap);

      }

      if (tokenEarly() && !forcePublic && !cabinetMode) {
        applyStandaloneAuthChrome({
          success: true,
          name: sessionNameFromStorage(),
          chat_id: localStorage.getItem('mp_site_active_chat_id'),
        }, {
          apiBase: apiBase,
          mainSelector: 'main.film-page',
          kpId: kpId,
          forcePublic: forcePublic,
          loginNow: function (action) {
            if (global.MpPublicFilmLogin) {
              MpPublicFilmLogin.open(action || '');
              return;
            }
            if (typeof global.showLoginModalOverlay === 'function') {
              global.showLoginModalOverlay();
              return;
            }
            var modal = document.getElementById('login-modal');
            if (modal) {
              document.body.classList.add('login-only-overlay');
              document.body.style.overflow = 'hidden';
              modal.classList.remove('hidden');
              modal.setAttribute('aria-hidden', 'false');
            }
          },
        });
      }

      var hint = document.getElementById('hint');

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

      function setOgFromFilm(film, headline) {
        var head = document.head;
        var title = (film && film.page_title) || (headline + ' — смотреть онлайн, описание, рейтинг, актёры | Movie Planner');
        var desc = (film && film.meta_description) || filmMetaDescription(film, headline);
        var keywords = (film && film.meta_keywords) || '';
        var img = String((film && film.poster_url) || poster || '').trim();
        setPageFavicon(img);
        function meta(attr, name, content) {
          if (!content) return;
          var el = head.querySelector('meta[' + attr + '="' + name + '"]');
          if (!el) {
            el = document.createElement('meta');
            el.setAttribute(attr, name);
            head.appendChild(el);
          }
          el.setAttribute('content', content);
        }
        document.title = title;
        meta('property', 'og:type', 'video.movie');
        meta('property', 'og:site_name', 'Movie Planner');
        meta('property', 'og:locale', 'ru_RU');
        meta('property', 'og:url', pageUrl);
        meta('property', 'og:title', (film && film.title ? ((film.title + (film.year ? ' (' + film.year + ')' : ''))) : headline));
        meta('property', 'og:description', desc);
        if (keywords) meta('name', 'keywords', keywords);
        if (img) {
          meta('property', 'og:image', img);
          meta('property', 'og:image:secure_url', img);
          meta('property', 'og:image:width', '1000');
          meta('property', 'og:image:height', '1500');
          meta('property', 'og:image:alt', 'Постер: ' + headline);
          meta('name', 'twitter:image', img);
          meta('name', 'twitter:image:alt', 'Постер: ' + headline);
        }
        meta('name', 'twitter:card', 'summary_large_image');
        meta('name', 'twitter:title', headline);
        meta('name', 'twitter:description', desc);
        meta('name', 'description', desc);
        meta('name', 'robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
        var canon = head.querySelector('link[rel="canonical"]');
        if (!canon) {
          canon = document.createElement('link');
          canon.rel = 'canonical';
          head.appendChild(canon);
        }
        canon.href = (film && film.canonical) || pageUrl;
      }
      setPageFavicon(poster);
      (function () {
        var boot = readMpRouteBoot();
        var bootTitle = (boot && boot.type === 'film' && !isGenericFilmTitle(boot.title)) ? boot.title : '';
        setOgFromFilm(null, bootTitle || 'Загрузка…');
      })();

      function setFilmJsonLd(film) {
        try {
          var head = document.head;
          var node = head.querySelector('#film-jsonld');
          if (!node) {
            node = document.createElement('script');
            node.type = 'application/ld+json';
            node.id = 'film-jsonld';
            head.appendChild(node);
          }
          if (film && film.json_ld) {
            node.textContent = JSON.stringify(film.json_ld);
            return;
          }
          var kp = String(kpId || '').replace(/\D/g, '');
          var title = String((film && film.title) || '').trim();
          var year = Number((film && film.year) || 0) || null;
          var description = String((pickFilmDescription(film) || title || 'Фильм в Movie Planner')).trim();
          var image = String((film && film.poster_url) || poster || '').trim();
          var genres = String((film && film.genres) || '')
            .split(/[,;/|]+/)
            .map(function (s) { return String(s || '').trim(); })
            .filter(Boolean)
            .slice(0, 6);
          var payload = {
            '@context': 'https://schema.org',
            '@type': 'Movie',
            name: title || ('Фильм ' + kp),
            description: description,
            url: pageUrl,
            image: image || undefined,
            datePublished: year ? (String(year) + '-01-01') : undefined,
            genre: genres.length ? genres : undefined,
            sameAs: kp ? ('https://www.kinopoisk.ru/film/' + kp + '/') : undefined,
          };
          if (film && film.country) {
            payload.countryOfOrigin = {
              '@type': 'Country',
              name: String(film.country),
            };
          }
          if (film && film.director && film.director.name_ru) {
            payload.director = { '@type': 'Person', name: String(film.director.name_ru) };
          }
          node.textContent = JSON.stringify(payload);
        } catch (_e) {}
      }

      function sessions() {
        try { return JSON.parse(localStorage.getItem('mp_site_sessions') || '[]'); } catch (_e) { return []; }
      }
      function token() {
        try {
          var active = localStorage.getItem('mp_site_active_chat_id');
          var row = sessions().find(function (x) { return String(x.chat_id) === String(active); });
          return row ? row.token : null;
        } catch (_e) { return null; }
      }
      function authHeaders() {
        var h = { 'Content-Type': 'application/json' };
        var t = token();
        if (t) h.Authorization = 'Bearer ' + t;
        return h;
      }
      function loginNow(action) {
        if (action) rememberAction(action);
        if (window.MpPublicFilmLogin && typeof MpPublicFilmLogin.open === 'function') {
          MpPublicFilmLogin.open(action || '');
          return;
        }
        if (typeof window.showLoginModalOverlay === 'function') {
          window.showLoginModalOverlay();
          return;
        }
        var modal = document.getElementById('login-modal');
        if (modal) {
          if (modal.parentElement !== document.body) document.body.appendChild(modal);
          modal.classList.add('mp-login-portal');
          document.body.classList.add('login-only-overlay');
          document.body.style.overflow = 'hidden';
          modal.classList.remove('hidden');
          modal.setAttribute('aria-hidden', 'false');
          return;
        }
        showPublicToast('Не удалось открыть вход');
      }
      function rememberAction(action) {
        try { sessionStorage.setItem('mp_public_film_action', action + ':' + pathKey); } catch (_e) {}
      }
      function apiGet(path) {
        return fetch(apiBase + path, { method: 'GET', mode: 'cors' }).then(function (r) {
          if (!r.ok) throw new Error('api_' + r.status);
          return r.json();
        });
      }
      function renderGenreChips(genresStr, isSeries, seriesStats, countryStr) {
        var container = document.getElementById('chips');
        if (!container) return;
        container.innerHTML = '';
        if (isSeries) {
          seriesStatsChipLabels(seriesStats).forEach(function (label) {
            var statChip = document.createElement('span');
            statChip.className = 'chip';
            statChip.textContent = label;
            container.appendChild(statChip);
          });
        }
        var parts = String(localizeGenresStr(genresStr) || '')
          .split(/[,;/|]+/)
          .map(function (s) { return s.trim(); })
          .filter(Boolean);
        if (!parts.length && !isSeries) parts = ['фильм'];
        else if (!parts.length && isSeries) parts = ['сериал'];
        // Decorative meta chips only — click→search was broken on /f/ (overlay search, URL stuck).
        parts.slice(0, 8).forEach(function (label) {
          var chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = label;
          container.appendChild(chip);
        });
        String(countryStr || '')
          .split(/[,;/|]+/)
          .map(function (s) { return s.trim(); })
          .filter(Boolean)
          .slice(0, 3)
          .forEach(function (label) {
            var chip = document.createElement('span');
            chip.className = 'chip chip-country';
            chip.setAttribute('data-chip-country', label);
            chip.textContent = label;
            container.appendChild(chip);
          });
      }
      function scheduleLoadFacts() {
        if (isFest || isTmdbOnly || isMp || !numericKpFilmId(kpId)) return;
        var run = function () { loadFilmDescFacts(kpId, document); };
        run();
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(run, { timeout: 1200 });
        } else {
          setTimeout(run, 400);
        }
      }
      var CAST_VISIBLE = 4;
      function castPersonLink(entry) {
        if (!entry) return '';
        // KP cast uses name_ru/name_en; TMDB catalog cast uses `name`.
        var nm = String(entry.name_ru || entry.name_en || entry.name || '').replace(/[&<>"']/g, function (c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
        if (!nm) return '';
        var path = String(entry.person_path || '').trim();
        if (!path) {
          var fest = String(entry.fest_person_slug || '').trim();
          if (fest) path = '/s/fest-' + fest;
        }
        if (!path) {
          var kpRaw = entry.kp_person_id;
          if (kpRaw != null && kpRaw !== '') {
            var kp = String(kpRaw).replace(/\D/g, '');
            if (kp) path = '/s/' + kp;
          }
        }
        if (!path) {
          var tid = String(entry.tmdb_person_id || entry.person_id || '').replace(/\D/g, '');
          if (tid) path = '/s/tmdb-' + tid;
        }
        if (!path) return '<span class="staff-cast-plain">' + nm + '</span>';
        var photoAttr = entry.photo ? (' data-staff-photo="' + String(entry.photo).replace(/"/g, '&quot;') + '"') : '';
        var roleRaw = String(entry.character || entry.role || '').trim();
        if (roleRaw.length > 72) roleRaw = roleRaw.slice(0, 69).replace(/\s+\S*$/, '') + '…';
        var roleAttr = roleRaw ? (' data-staff-character="' + roleRaw.replace(/"/g, '&quot;') + '"') : '';
        var kpAttr = '';
        var kpOnly = String(entry.kp_person_id || '').replace(/\D/g, '');
        if (kpOnly) kpAttr = ' data-staff-kp="' + kpOnly + '"';
        var tmdbAttr = '';
        var tmdbOnly = String(entry.tmdb_person_id || (!kpOnly && entry.person_id) || '').replace(/\D/g, '');
        if (tmdbOnly && !kpOnly) tmdbAttr = ' data-staff-tmdb="' + tmdbOnly + '"';
        return '<a href="' + path.replace(/"/g, '') + '" class="staff-cast-link"' + kpAttr + tmdbAttr + ' data-staff-name="' + nm + '"' + photoAttr + roleAttr + '>' + nm + '</a>';
      }
      function buildPublicCastHtml(director, actors, country) {
        var parts = [];
        // Country lives only in genre/country chips — not duplicated in cast.
        void country;
        if (director) {
          var dirHtml = castPersonLink(director);
          if (dirHtml) {
            parts.push('<div class="film-cast-row"><span class="film-cast-label">Режиссёр:</span> ' + dirHtml + '</div>');
          }
        }
        var links = (actors || []).map(castPersonLink).filter(Boolean);
        if (!links.length) return parts.join('');
        var collapsed = links.slice(0, CAST_VISIBLE);
        var hasMore = links.length > CAST_VISIBLE;
        var row = '<div class="film-cast-row film-cast-actors"><span class="film-cast-label">Актёры:</span> ';
        if (hasMore) {
          // Expanded view must list ALL actors — not "tail-only" with a leading comma
          // (that produced ", Patrick Criado, …" after «ещё»).
          row += '<span class="film-actors-short">' + collapsed.join('<span class="film-cast-sep">, </span>') + '</span>';
          row += '<span class="film-actors-full hidden">' + links.join('<span class="film-cast-sep">, </span>') + '</span>';
          row += ' <button type="button" class="film-actors-more-btn" aria-expanded="false">ещё</button>';
        } else {
          row += links.join('<span class="film-cast-sep">, </span>');
        }
        row += '</div>';
        parts.push(row);
        return parts.join('');
      }
      function bindPublicCastLinks(root) {
        if (!root) return;
        var hoverEl = document.getElementById('staff-hover-preview');
        if (!hoverEl) {
          hoverEl = document.createElement('div');
          hoverEl.id = 'staff-hover-preview';
          hoverEl.className = 'staff-hover-preview hidden';
          hoverEl.innerHTML = '<img alt="" class="staff-hover-photo"><div class="staff-hover-name"></div><div class="staff-hover-role"></div>';
          document.body.appendChild(hoverEl);
        } else if (!hoverEl.querySelector('.staff-hover-role')) {
          var roleSlot = document.createElement('div');
          roleSlot.className = 'staff-hover-role';
          hoverEl.appendChild(roleSlot);
        }
        var hoverTimer = null;
        var activeLink = null;
        var PERSON_PH = '/images/person-avatar-placeholder.png';
        function hidePreview() {
          clearTimeout(hoverTimer);
          hoverTimer = null;
          activeLink = null;
          hoverEl.classList.add('hidden');
        }
        if (!window._mpStaffHoverGlobalBound) {
          window._mpStaffHoverGlobalBound = true;
          document.addEventListener('scroll', hidePreview, { passive: true, capture: true });
          window.addEventListener('popstate', hidePreview);
        }
        root.querySelectorAll('.staff-cast-link').forEach(function (link) {
          link.addEventListener('click', function (e) {
            hidePreview();
            var href = String(link.getAttribute('href') || '');
            /* Fest / TMDB person pages are full navigations — do not hijack into KP-only SPA. */
            if (/\/s\/(?:fest-|tmdb-)/i.test(href)) return;
            var kp = link.getAttribute('data-staff-kp');
            if (!kp) return;
            if (global.MpCabinetNav && typeof global.MpCabinetNav.openStaffPage === 'function') {
              e.preventDefault();
              e.stopPropagation();
              global.MpCabinetNav.openStaffPage(kp, { replace: false });
              return;
            }
          });
          link.addEventListener('mouseenter', function (e) {
            if (window.matchMedia && !window.matchMedia('(hover: hover)').matches) return;
            var nm = link.getAttribute('data-staff-name') || link.textContent || '';
            var role = (link.getAttribute('data-staff-character') || '').trim();
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(function () {
              activeLink = link;
              hoverEl.querySelector('.staff-hover-name').textContent = nm;
              var roleEl = hoverEl.querySelector('.staff-hover-role');
              if (roleEl) {
                roleEl.textContent = role || '';
                roleEl.style.display = role ? 'block' : 'none';
              }
              var img = hoverEl.querySelector('.staff-hover-photo');
              img.removeAttribute('src');
              hoverEl.classList.remove('hidden');
              hoverEl.style.left = Math.min(window.innerWidth - 220, e.clientX + 14) + 'px';
              hoverEl.style.top = Math.min(window.innerHeight - 140, e.clientY + 14) + 'px';
              var custom = (link.getAttribute('data-staff-photo') || '').trim();
              img.onerror = function () {
                if (global.mpPersonOnError) global.mpPersonOnError(img);
                else { img.src = PERSON_PH; img.onerror = null; }
              };
              var kpHover = (link.getAttribute('data-staff-kp') || '').replace(/\D/g, '');
              var tmdbHover = (link.getAttribute('data-staff-tmdb') || '').replace(/\D/g, '');
              if (custom && !/no-poster/i.test(custom)) {
                img.src = custom;
              } else if (kpHover) {
                fetch(API_BASE + '/api/public/person/' + encodeURIComponent(kpHover) + '/head', { credentials: 'omit' })
                  .then(function (r) { return r.json(); })
                  .then(function (payload) {
                    var ph = payload && payload.person && payload.person.photo ? String(payload.person.photo) : '';
                    if (activeLink === link) img.src = (ph && !/no-poster/i.test(ph)) ? ph : PERSON_PH;
                  })
                  .catch(function () { if (activeLink === link) img.src = PERSON_PH; });
              } else if (tmdbHover) {
                fetch(API_BASE + '/api/public/person/tmdb/' + encodeURIComponent(tmdbHover) + '/head', { credentials: 'omit' })
                  .then(function (r) { return r.json(); })
                  .then(function (payload) {
                    var ph = payload && payload.person && (payload.person.photo || payload.person.photo_url)
                      ? String(payload.person.photo || payload.person.photo_url) : '';
                    if (activeLink === link) img.src = (ph && !/no-poster/i.test(ph)) ? ph : PERSON_PH;
                  })
                  .catch(function () { if (activeLink === link) img.src = PERSON_PH; });
              } else {
                img.src = PERSON_PH;
              }
              img.style.display = 'block';
            }, 180);
          });
          link.addEventListener('mouseleave', function () {
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(function () {
              if (activeLink === link) hidePreview();
            }, 120);
          });
        });
        var moreBtn = root.querySelector('.film-actors-more-btn');
        if (moreBtn) {
          moreBtn.addEventListener('click', function () {
            var shortEl = root.querySelector('.film-actors-short');
            var fullEl = root.querySelector('.film-actors-full');
            var wrap = root.querySelector('.film-actors-more-wrap');
            if (!shortEl || !fullEl) return;
            var expanded = fullEl.classList.contains('hidden');
            fullEl.classList.toggle('hidden', !expanded);
            shortEl.classList.toggle('hidden', expanded);
            if (expanded) {
              // Keep «свернуть» visible after the full list (not inside hidden short).
              if (fullEl.parentNode) {
                fullEl.parentNode.insertBefore(moreBtn, fullEl.nextSibling);
              }
              moreBtn.textContent = 'свернуть';
            } else {
              if (wrap) wrap.appendChild(moreBtn);
              moreBtn.textContent = 'ещё';
            }
            moreBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          });
        }
      }
      var publicFilmCountry = '';
      function markCastRootResolved(root, hasContent) {
        if (!root) return;
        root.classList.remove('is-loading');
        if (hasContent) root.classList.remove('is-empty');
        else root.classList.add('is-empty');
      }
      function applyPublicCastPayload(d) {
        var root = document.getElementById('film-cast-root') || document.getElementById('film-hero-cast-root');
        if (!root || !d) return;
        var html = buildPublicCastHtml(d.director, d.actors || [], publicFilmCountry);
        root.innerHTML = html || '';
        markCastRootResolved(root, !!html);
        if (html) bindPublicCastLinks(root);
        /* COURSE_OFFERS_SYNC_V1 */
        var hero = document.querySelector('.film-hero-with-tag');
        var dirKp = d.director && d.director.kp_person_id != null
          ? String(d.director.kp_person_id).replace(/\D/g, '')
          : '';
        if (hero && dirKp) hero.setAttribute('data-director-id', dirKp);
        try {
          if (global.MpMonetization && typeof global.MpMonetization.mountCourseOffers === 'function') {
            global.MpMonetization.mountCourseOffers(document.getElementById('film-page-content') || document.querySelector('main.film-page'), kpId);
          }
        } catch (_courseRemount) {}
      }
      function loadPublicCast() {
        var root = document.getElementById('film-cast-root') || document.getElementById('film-hero-cast-root');
        if (!root) return;
        var castKey = pathKey;
        if (root.getAttribute('data-mp-cast-loaded') === castKey && root.querySelector('.staff-cast-link, .film-cast-row')) {
          return;
        }
        if (root.getAttribute('data-mp-cast-pending') === '1') return;
        if (!root.innerHTML.trim() || root.querySelector('.film-cast-skeleton')) {
          root.innerHTML = buildFilmCastSkeletonHtml();
          root.classList.add('is-loading');
          root.classList.remove('is-empty');
        }
        root.setAttribute('data-mp-cast-pending', '1');
        apiGet(publicCastApi)
          .then(function (d) {
            root.removeAttribute('data-mp-cast-pending');
            if (!d || !d.success) { return; }
            if (d.director || (d.actors && d.actors.length)) {
              applyPublicCastPayload(d);
              root.setAttribute('data-mp-cast-loaded', castKey);
            } else if (!root.querySelector('.staff-cast-link, .film-cast-row')) {
              root.innerHTML = '';
              markCastRootResolved(root, false);
            }
          })
          .catch(function () {
            root.removeAttribute('data-mp-cast-pending');
            var root2 = document.getElementById('film-cast-root') || document.getElementById('film-hero-cast-root');
            if (root2 && !root2.querySelector('.staff-cast-link, .film-cast-row')) {
              root2.innerHTML = '';
              markCastRootResolved(root2, false);
            }
          });
      }
      function showPublicToast(message) {
        var el = document.getElementById('public-toast');
        if (!el) {
          el = document.createElement('div');
          el.id = 'public-toast';
          el.className = 'public-toast';
          document.body.appendChild(el);
        }
        el.textContent = message || '';
        requestAnimationFrame(function () { el.classList.add('show'); });
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(function () { el.classList.remove('show'); }, 2800);
      }
      function showPublicCoinPop(anchor, delta) {
        var rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
        if (!rect) return;
        var pop = document.createElement('div');
        pop.className = 'public-coin-pop';
        pop.textContent = '🪙 +' + String(delta || 40);
        pop.style.left = Math.round(rect.left + rect.width / 2) + 'px';
        pop.style.top = Math.round(rect.top + rect.height / 2) + 'px';
        document.body.appendChild(pop);
        setTimeout(function () { try { pop.remove(); } catch (_e) {} }, 1300);
      }

      function filmTitleForPlan() {
        var el = document.getElementById('film-title');
        var raw = el ? String(el.textContent || '').trim() : '';
        return raw.replace(/\s*\(\d{4}\)\s*$/, '').trim() || 'Фильм';
      }

      function openStandalonePlanModal(filmLike, place, extra) {
        if (!window.MpPlanModal || typeof MpPlanModal.open !== 'function') {
          showPublicToast('Форма плана недоступна');
          return;
        }
        var fl = filmLike || {};
        var opts = {
          apiBase: apiBase,
          getAuthHeaders: authHeaders,
          onToast: showPublicToast,
          film: {
            film_id: fl.film_id != null ? Number(fl.film_id) : null,
            kp_id: fl.kp_id || kpId,
            title: fl.title || filmTitleForPlan(),
            year: fl.year,
            poster: fl.poster || fl.poster_url,
          },
          mode: place === 'cinema' ? 'cinema' : 'home',
          onSuccess: function () {
            if (hint) hint.textContent = '';
            loadAuthFilmState();
          },
        };
        if (extra && typeof extra === 'object') {
          Object.keys(extra).forEach(function (k) { opts[k] = extra[k]; });
        }
        MpPlanModal.open(opts);
      }

      function rememberPendingGuestPlan(planPayload) {
        try {
          sessionStorage.setItem('mp_pending_guest_plan', JSON.stringify({
            kpId: pathKey,
            mode: planPayload.mode || 'home',
            body: planPayload.body || {},
          }));
        } catch (_e) {}
      }

      function submitPendingGuestPlan() {
        var raw;
        try { raw = sessionStorage.getItem('mp_pending_guest_plan'); } catch (_e) { return; }
        if (!raw || !token()) return;
        var pending;
        try { pending = JSON.parse(raw); } catch (_e) { return; }
        if (String(pending.kpId) !== String(pathKey)) return;
        sessionStorage.removeItem('mp_pending_guest_plan');
        var endpoint = pending.mode === 'cinema' ? '/api/miniapp/plans/cinema' : '/api/miniapp/plans/home';
        var body = pending.body || {};
        function postPlan(filmBody) {
          var payload = Object.assign({}, body, filmBody);
          return fetch(apiBase + endpoint, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(payload),
          }).then(function (r) { return r.json(); })
            .then(function (res) {
              if (res && res.success !== false && !res.error) {
                showPublicToast(pending.mode === 'cinema' ? 'План в кино сохранён' : 'План дома сохранён');
                loadAuthFilmState();
              } else {
                showPublicToast((res && res.error) || 'Не удалось сохранить план');
              }
            })
            .catch(function () { showPublicToast('Ошибка сети'); });
        }
        if (body.film_id) return postPlan({});
        return ensureFilm().then(function (d) {
          if (!d || !d.success) {
            showPublicToast((d && d.error) || 'Не удалось добавить фильм');
            return;
          }
          var planBody = { film_id: d.film_id };
          if (!isTmdbOnly) planBody.kp_id = Number(kpId);
          else {
            planBody.tmdb_id = Number(tmdbId);
            planBody.media_type = mediaType || 'movie';
          }
          return postPlan(planBody);
        });
      }

      function startPlanFlow(place) {
        place = place === 'cinema' ? 'cinema' : 'home';
        if (!token()) {
          openStandalonePlanModal(
            isTmdbOnly
              ? { tmdb_id: Number(tmdbId), media_type: mediaType, catalog_id: catalogId, title: filmTitleForPlan() }
              : { kp_id: kpId, title: filmTitleForPlan() },
            place,
            {
              guestMode: true,
              onRequireAuth: function (planPayload) {
                rememberPendingGuestPlan(planPayload);
                loginNow('plan');
              },
            }
          );
          return;
        }
        if (isTmdbOnly) {
          return ensureFilm().then(function (d) {
            if (!d || !d.success) {
              if (hint) hint.textContent = (d && d.error) || 'Не удалось подготовить фильм';
              return;
            }
            openStandalonePlanModal({
              film_id: d.film_id,
              tmdb_id: Number(tmdbId),
              media_type: mediaType,
              title: filmTitleForPlan(),
            }, place);
          });
        }
        fetch(apiBase + '/api/site/film-by-kp/' + encodeURIComponent(kpId), { headers: authHeaders() })
          .then(function (r) { return r.json(); })
          .then(function (lookup) {
            if (lookup && lookup.in_library && lookup.film_id) {
              return fetch(apiBase + '/api/site/film/' + encodeURIComponent(String(lookup.film_id)), { headers: authHeaders() })
                .then(function (r2) { return r2.json(); })
                .then(function (detail) {
                  var f = detail && detail.film ? detail.film : { kp_id: kpId, film_id: lookup.film_id };
                  openStandalonePlanModal(f, place);
                });
            }
            return ensureFilm().then(function (d) {
              if (!d || !d.success) {
                if (hint) hint.textContent = (d && d.error) || 'Не удалось подготовить фильм';
                return;
              }
              openStandalonePlanModal({ kp_id: kpId, film_id: d.film_id, title: filmTitleForPlan() }, place);
            });
          })
          .catch(function () { showPublicToast('Ошибка сети'); });
      }

      loadPublicCast();
      if (!isTmdbOnly) scheduleLoadFacts();
      apiGet(publicFilmApi)
        .then(function (data) {
          if (data && data.redirect && data.film && data.film.kp_id) {
            try { window.location.replace('/f/' + encodeURIComponent(String(data.film.kp_id))); } catch (_r) {}
            return;
          }
          if (!data || !data.success || !data.film) {
            paintFilmPublicLoadFail((data && data.error) || 'Фильм не найден или временно недоступен');
            return;
          }
          var f = data.film;
          publicFilmCountry = f.country || '';
          if (data.cast && (data.cast.director || (data.cast.actors && data.cast.actors.length))) {
            applyPublicCastPayload(data.cast);
          }
          var bootTitleKeep = '';
          try {
            var bootT = readMpRouteBoot();
            if (bootT && bootT.type === 'film' && bootT.title) bootTitleKeep = String(bootT.title).trim();
          } catch (_bt) {}
          var apiTitle = String(f.title || '').trim();
          var titleBase = preferRuFilmTitle(apiTitle, pathKey || kpId) || apiTitle || 'Фильм';
          if (bootTitleKeep && /[а-яА-ЯёЁ]/.test(bootTitleKeep) && titleBase && !/[а-яА-ЯёЁ]/.test(titleBase)) {
            titleBase = bootTitleKeep;
          } else {
            var tEl0 = document.getElementById('film-title');
            var curTitle = tEl0 ? String(tEl0.textContent || '').replace(/\s*\(\d{4}\)\s*$/, '').trim() : '';
            if (curTitle && /[а-яА-ЯёЁ]/.test(curTitle) && titleBase && !/[а-яА-ЯёЁ]/.test(titleBase)) {
              titleBase = curTitle;
            }
          }
          var title = titleBase;
          var tEl = document.getElementById('film-title');
          var dEl = document.getElementById('film-desc');
          if (tEl) tEl.textContent = title;
          setFilmHeaderTitle(title);
          setFilmDescription(pickFilmDescription(f));
          if (isTmdbOnly || isFest || isMp) {
            var wf = (Array.isArray(data.web_facts) && data.web_facts.length)
              ? data.web_facts
              : (Array.isArray(f.web_facts) ? f.web_facts : []);
            if (wf.length) {
              var descWrapFacts = document.getElementById('film-desc-wrap');
              if (descWrapFacts) {
                bindFilmDescExpand(descWrapFacts);
                paintFilmDescFacts(descWrapFacts, { web_facts: wf });
              }
            }
          }
          syncFilmHeroMeta(document, f);
          syncFilmExtRatings(document, f);

          if (f.is_series) {
            try { global.__mpFilmPageSeriesKp = pathKey; } catch (_e) {}
            var heroSec = document.querySelector('.film-hero-with-tag');
            if (heroSec) heroSec.setAttribute('data-is-series', '1');
          }
          var boot = readMpRouteBoot();
          var posterToApply = f.poster_url;
          if (boot && boot.poster_url && (!cleanPosterUrl(posterToApply) || !isGoodFilmPosterUrl(posterToApply))) {
            posterToApply = boot.poster_url;
          }
          // API iphone360 stub must not overwrite boot/MP branded.
          if (
            isKpFilmCdnTemplateUrl(posterToApply, pathKey) &&
            boot &&
            isMpBrandedFilmPoster(boot.poster_url)
          ) {
            posterToApply = boot.poster_url;
          }
          applyFilmPosterEl(posterToApply, pathKey);
          setOgFromFilm(f, titleBase + (f.year ? ' (' + f.year + ')' : ''));
          setFilmJsonLd(f);
          if (f.seo_body_html) {
            var seoRoot = document.getElementById('film-seo-root');
            if (seoRoot) seoRoot.innerHTML = f.seo_body_html;
          }
          if (f.is_upcoming_premiere) {
            var heroToolbar = document.querySelector('.film-page-toolbar');
            var iconsRow = heroToolbar && heroToolbar.querySelector('.film-toolbar-icons');
            var shareBtnEl = iconsRow && iconsRow.querySelector('#share-film-btn');
            var existingPrem = iconsRow && iconsRow.querySelector('.film-icon-btn--premiere');
            if (iconsRow && !existingPrem) {
              var premHtml = renderFilmToolbarPremiereBtn(f);
              if (premHtml && shareBtnEl) shareBtnEl.insertAdjacentHTML('beforebegin', premHtml);
              else if (premHtml) iconsRow.insertAdjacentHTML('beforeend', premHtml);
              var newPrem = iconsRow.querySelector('.film-icon-btn--premiere');
              if (newPrem) {
                newPrem.addEventListener('click', function (e) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleFilmPremiereNotify(newPrem, loginNow);
                });
              }
            } else if (existingPrem) {
              syncFilmToolbarPremiereButton(existingPrem, f);
            }
          }
          if (hint) hint.textContent = '';
          try {
            if (!token() && global.MpPublicPromo && typeof global.MpPublicPromo.mountAfterHero === 'function') {
              var promoRoot = document.getElementById('film-page-content')
                || document.querySelector('.movie-page')
                || document.querySelector('.film-page');
              if (promoRoot) global.MpPublicPromo.mountAfterHero(promoRoot);
            }
          } catch (_e) {}
        })
        .catch(function () {
          paintFilmPublicLoadFail('Ошибка сети. Обновите страницу');
        });

      function ensureFilm() {
        var body = isTmdbOnly
          ? { tmdb_id: Number(tmdbId), media_type: mediaType || 'movie', catalog_id: catalogId }
          : { kp_id: Number(kpId) };
        return fetch(apiBase + '/api/site/add-film', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(body)
        }).then(function (r) {
          if (r.status === 401) { loginNow(); return null; }
          return r.json();
        });
      }
      function goCabinet(action) {
        if (action) {
          try { sessionStorage.setItem('mp_public_film_action', String(action) + ':' + pathKey); } catch (_) {}
        }
        window.location.href = '/f/' + encodeURIComponent(pathKey);
      }
      function addCurrentFilm() {
        if (!token()) { rememberAction('add'); loginNow('add'); return; }
        ensureFilm()
          .then(function (d) {
            if (!d) return;
            if (d.success) {
              if (hint) hint.textContent = 'Фильм добавлен';
              loadAuthFilmState();
            } else if (hint) {
              hint.textContent = d.error || 'Не удалось добавить';
            }
          })
          .catch(function () { if (hint) hint.textContent = 'Ошибка сети'; });
      }
      function markWatchedCurrentFilm() {
        if (!token()) { rememberAction('watched'); loginNow('watched'); return; }
        ensureFilm()
          .then(function (d) {
            if (!d || !d.success || !d.film_id) throw new Error('Не удалось подготовить фильм');
            return fetch(apiBase + '/api/site/film/' + encodeURIComponent(String(d.film_id)) + '/watched', {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({ watched: true }),
            });
          })
          .then(function (r) {
            if (!r) return null;
            if (r.status === 401) { loginNow(); return null; }
            return r.json();
          })
          .then(function (d) {
            if (!d) return;
            if (d.success) {
              if (hint) hint.textContent = 'Отмечено как просмотренное';
              showPublicToast('Отмечено как просмотренное');
              loadAuthFilmState();
            } else if (hint) hint.textContent = d.error || 'Не удалось отметить';
          })
          .catch(function (e) {
            if (hint) hint.textContent = (e && e.message) || 'Ошибка';
          });
      }
      function planCurrentFilm() {
        startPlanFlow('home');
      }
      function setCurrentRating(v, anchor) {
        if (!token()) { rememberAction('rate' + String(v)); loginNow('rate' + String(v)); return; }
        ensureFilm()
          .then(function (d) {
            if (!d || !d.success || !d.film_id) throw new Error('Не удалось подготовить фильм');
            return fetch(apiBase + '/api/site/film/' + encodeURIComponent(String(d.film_id)) + '/rating', {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({ rating: v })
            });
          })
          .then(function (r) {
            if (!r) return null;
            if (r.status === 401) { loginNow(); return null; }
            return r.json();
          })
          .then(function (d) {
            if (!d) return;
            if (d.success) {
              hint.textContent = 'Оценка ' + String(v) + '/10 сохранена';
              if (anchor) showPublicCoinPop(anchor, Number(d.coins_added) || 40);
              showPublicToast('Оценка сохранена. Начислили монетки за активность.');
              loadAuthFilmState();
            } else hint.textContent = d.error || 'Не удалось поставить оценку';
          })
          .catch(function (e) {
            hint.textContent = (e && e.message) || 'Ошибка оценки';
          });
      }
      function rebindGuestToolbarActions() {
        var addBtn = document.getElementById('add-btn');
        if (addBtn) addBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          addCurrentFilm();
        });
        var planWatchBtn = document.getElementById('plan-watch-btn');
        if (planWatchBtn) planWatchBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          planCurrentFilm();
        });
        var guestWatchlist = document.getElementById('guest-watchlist-cta');
        if (guestWatchlist) guestWatchlist.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          try { sessionStorage.setItem('mp_public_film_action', 'add:' + pathKey); } catch (_e) {}
          addCurrentFilm();
        });
        var guestWatched = document.getElementById('guest-watched-btn');
        if (guestWatched) guestWatched.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          markWatchedCurrentFilm();
        });
        var rg = document.getElementById('rate-grid');
        if (!rg) return;
        rg.querySelectorAll('[data-rate]').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var v = Number(btn.getAttribute('data-rate'));
            if (!(v >= 1 && v <= 10)) return;
            setCurrentRating(v, btn);
          });
        });
      }
      rebindGuestToolbarActions();
      var loginBtn = document.getElementById('login-btn');
      if (loginBtn) loginBtn.addEventListener('click', function () { loginNow(); });

      function consumePendingAction() {
        try {
          var pending = sessionStorage.getItem('mp_public_film_action') || '';
          if (!pending || pending.split(':')[1] !== pathKey || !token()) return;
          sessionStorage.removeItem('mp_public_film_action');
          if (pending.indexOf('plan:') === 0) {
            if (sessionStorage.getItem('mp_pending_guest_plan')) submitPendingGuestPlan();
            else startPlanFlow('home');
          }
          else if (pending.indexOf('add:') === 0) addCurrentFilm();
          else if (pending.indexOf('watched:') === 0) markWatchedCurrentFilm();
          else if (pending.indexOf('rate') === 0) {
            var rating = Number((pending.split(':')[0] || '').replace('rate', ''));
            var rateToggle = document.getElementById('rate-toggle-btn');
            var ratingPanel = document.getElementById('rating-expand-panel');
            if (rateToggle && ratingPanel) {
              ratingPanel.classList.remove('hidden');
              rateToggle.classList.add('is-active');
            }
            if (rating >= 1 && rating <= 10) setCurrentRating(rating, document.querySelector('[data-rate="' + rating + '"]'));
          }
        } catch (_e) {}
      }

      function bindPublicFilmToolbar(toolbarRoot, filmCtx) {
        var root = toolbarRoot || document.querySelector('.film-page-toolbar');
        if (!root || root.getAttribute('data-mp-toolbar-bound') === '1') return;
        root.setAttribute('data-mp-toolbar-bound', '1');
        if (filmCtx) root._mpFilm = filmCtx;
        var rateToggle = root.querySelector('[data-rate-toggle]') || root.querySelector('#rate-toggle-btn');
        var seriesToggle = root.querySelector('[data-series-toggle]');
        var shareBtn = root.querySelector('[data-share-film]') || root.querySelector('#share-film-btn');
        var ratingPanel = root.querySelector('#rating-expand-panel');
        var seriesPanel = root.querySelector('#series-expand-panel');
        function togglePanel(btn, panel) {
          if (!btn || !panel) return;
          var open = !panel.classList.contains('hidden');
          if (ratingPanel && panel !== ratingPanel) ratingPanel.classList.add('hidden');
          if (seriesPanel && panel !== seriesPanel) seriesPanel.classList.add('hidden');
          [rateToggle, seriesToggle].forEach(function (b) { if (b) b.classList.remove('is-active'); });
          if (open) {
            panel.classList.add('hidden');
            btn.classList.remove('is-active');
            return;
          }
          panel.classList.remove('hidden');
          btn.classList.add('is-active');
        }
        if (rateToggle) {
          rateToggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (!token()) { rememberAction('rate'); loginNow('rate'); return; }
            togglePanel(rateToggle, ratingPanel);
          });
        }
        if (numericKpFilmId(kpId)) loadFilmDescFacts(kpId, document);
        if (seriesToggle && seriesPanel) {
          seriesToggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (!token()) { loginNow(); return; }
            togglePanel(seriesToggle, seriesPanel);
            if (!seriesPanel.classList.contains('hidden')) {
              var film = root._mpFilm || filmCtx || {};
              if (!film.is_series && global.__mpFilmPageSeriesKp === kpId) film.is_series = true;
              if (!film.kp_id) film.kp_id = kpId;
              if (film.is_series) {
                mountSeriesToolbarPanel(root, film, apiBase, authHeaders);
              }
            }
          });
        }
        if (shareBtn) {
          shareBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var url = pageUrl;
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(url).then(function () {
                showPublicToast('Ссылка скопирована');
              }).catch(function () { showPublicToast(url); });
            } else {
              showPublicToast(url);
            }
          });
        }
        var premiereBtn = root.querySelector('.film-icon-btn--premiere[data-action="premiere-notify-on"], .film-icon-btn--premiere[data-action="premiere-notify-off"]');
        if (premiereBtn && !premiereBtn.getAttribute('data-mp-premiere-bound')) {
          premiereBtn.setAttribute('data-mp-premiere-bound', '1');
          premiereBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            handleFilmPremiereNotify(premiereBtn, loginNow);
          });
        }
        var guestWl = root.querySelector('#guest-watchlist-cta,[data-guest-watchlist]');
        if (guestWl && !guestWl.getAttribute('data-mp-guest-bound')) {
          guestWl.setAttribute('data-mp-guest-bound', '1');
          guestWl.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            addCurrentFilm();
          });
        }
        var guestWd = root.querySelector('#guest-watched-btn,[data-guest-watched]');
        if (guestWd && !guestWd.getAttribute('data-mp-guest-bound')) {
          guestWd.setAttribute('data-mp-guest-bound', '1');
          guestWd.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            markWatchedCurrentFilm();
          });
        }
      }
      setupAppOpenBanner({ id: pathKey, kind: 'film' });
      bindPublicFilmToolbar();
      try {
        document.body.classList.toggle('mp-authed', !!token());
      } catch (_ba) {}

      function applyAuthToolbar(filmState) {
        var hero = filmHeroContentRoot(cabinetMode);
        if (!hero) return;
        var stub = filmState.film || { kp_id: kpId };
        if (!stub.is_series) {
          if (global.__mpFilmPageSeriesKp === kpId) stub.is_series = true;
          else {
            var heroSec = document.querySelector('.film-hero-with-tag[data-is-series="1"]');
            if (heroSec) stub.is_series = true;
          }
        }
        if (!stub.kp_id) stub.kp_id = kpId;
        var opts = filmState.toolbarOpts || {};
        var sig = [
          String(stub.kp_id || ''),
          String(stub.film_id || ''),
          opts.inBase ? '1' : '0',
          opts.watched ? '1' : '0',
          String(opts.myRating || 0),
          stub.is_series ? '1' : '0',
        ].join('|');
        var old = hero.querySelector('.film-page-toolbar');
        if (old && old.getAttribute('data-mp-toolbar-sig') === sig) {
          loadFilmFriendsSocialBlock();
          return;
        }
        var toolbarHtml = buildFilmPageToolbar(stub, opts);
        if (old) {
          // Replace in place so reviews/friends below the toolbar keep their spot
          // and «Запланировать» does not jump when auth state patches.
          old.outerHTML = toolbarHtml;
        } else {
          var descWrap = hero.querySelector('#film-desc-wrap');
          if (descWrap && descWrap.parentNode) {
            descWrap.insertAdjacentHTML('afterend', toolbarHtml);
          } else {
            hero.insertAdjacentHTML('beforeend', toolbarHtml);
          }
        }
        var newToolbar = hero.querySelector('.film-page-toolbar');
        if (newToolbar) newToolbar.setAttribute('data-mp-toolbar-sig', sig);
        ensureFilmReviewsSlot(hero);
        bindAuthToolbar(stub, filmState);
        bindPublicFilmToolbar(newToolbar, stub);
        var castRoot = document.getElementById('film-cast-root') || document.getElementById('film-hero-cast-root');
        if (!castRoot || !castRoot.querySelector('.staff-cast-link, .film-cast-row')) {
          loadPublicCast();
        }
        loadFilmFriendsSocialBlock();
        if (!(opts && opts.inBase)) rebindGuestToolbarActions();
        try {
          if (global.MpMonetization && typeof global.MpMonetization.initFilmPageFromRoot === 'function') {
            global.MpMonetization.initFilmPageFromRoot(hero, stub.kp_id);
          }
        } catch (_monToolbar) {}
      }

      function bindAuthToolbar(film, filmState) {
        filmState = filmState || {};
        var toolbarOpts = filmState.toolbarOpts || {};
        var root = document.querySelector('.film-page-toolbar');
        if (!root) return;
        if (toolbarOpts.inBase && film.film_id) {
          var removeBaseBtn = root.querySelector('[data-action="remove-from-base"]');
          if (removeBaseBtn) {
            removeBaseBtn.addEventListener('click', function () {
              var hasRating = !!(Number(toolbarOpts.myRating) >= 1);
              var msg = hasRating
                ? 'Вы действительно хотите удалить фильм из базы? Ваша оценка тоже будет удалена.'
                : 'Вы действительно хотите удалить фильм из базы?';
              filmPageConfirmDialog('Удалить из базы?', msg, {
                confirmLabel: 'Да',
                cancelLabel: 'Нет',
                equalButtons: true,
                showClose: true,
              }).then(function (ok) {
                if (!ok) return;
                fetch(apiBase + '/api/site/film/' + film.film_id, {
                  method: 'DELETE',
                  headers: authHeaders(),
                }).then(function (r) { return r.json(); }).then(function (d) {
                  if (!d || !d.success) {
                    showPublicToast('Не удалось удалить из базы');
                    return;
                  }
                  film.film_id = null;
                  film.watched = false;
                  film.series_progress = null;
                  film.next_episode = null;
                  var tb = document.querySelector('.film-page-toolbar');
                  if (tb) tb._mpSeriesToolbarState = null;
                  if (!filmState.toolbarOpts) filmState.toolbarOpts = {};
                  filmState.toolbarOpts.inBase = false;
                  filmState.toolbarOpts.watched = false;
                  filmState.toolbarOpts.myRating = 0;
                  filmState.toolbarOpts.authenticated = true;
                  filmState.film = film;
                  applyAuthToolbar(filmState);
                  showPublicToast('Удалено из базы');
                }).catch(function () {
                  showPublicToast('Не удалось удалить из базы');
                });
              });
            });
          }
          var starsWrap = root.querySelector('[data-rating-stars="1"]');
          if (starsWrap) {
            starsWrap.querySelectorAll('.rating-star').forEach(function (btn) {
              btn.addEventListener('click', function () {
                var v = Number(btn.getAttribute('data-rating-value'));
                fetch(apiBase + '/api/site/film/' + film.film_id + '/rating', {
                  method: 'POST', headers: authHeaders(), body: JSON.stringify({ rating: v }),
                }).then(function (r) { return r.json(); }).then(function (d) {
                  if (d && d.success) {
                    showPublicToast('Оценка сохранена');
                    if (!filmState.toolbarOpts) filmState.toolbarOpts = {};
                    filmState.toolbarOpts.myRating = v;
                    filmState.toolbarOpts.inBase = true;
                    filmState.toolbarOpts.authenticated = true;
                    filmState.film = film;
                    applyAuthToolbar(filmState);
                  }
                });
              });
            });
          }
          var rateGrid = root.querySelector('#rate-grid');
          if (rateGrid) {
            rateGrid.querySelectorAll('[data-rate]').forEach(function (btn) {
              btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var v = Number(btn.getAttribute('data-rate'));
                if (!(v >= 1 && v <= 10)) return;
                fetch(apiBase + '/api/site/film/' + film.film_id + '/rating', {
                  method: 'POST', headers: authHeaders(), body: JSON.stringify({ rating: v }),
                }).then(function (r) { return r.json(); }).then(function (d) {
                  if (d && d.success) {
                    showPublicToast('Оценка ' + v + '/10 сохранена');
                    if (!filmState.toolbarOpts) filmState.toolbarOpts = {};
                    filmState.toolbarOpts.myRating = v;
                    filmState.toolbarOpts.inBase = true;
                    filmState.toolbarOpts.authenticated = true;
                    filmState.film = film;
                    applyAuthToolbar(filmState);
                  } else {
                    showPublicToast((d && d.error) || 'Не удалось поставить оценку');
                  }
                }).catch(function () {
                  showPublicToast('Ошибка сети');
                });
              });
            });
          }
          var rem = root.querySelector('[data-action="remove-rating"]');
          if (rem) {
            rem.addEventListener('click', function () {
              fetch(apiBase + '/api/site/film/' + film.film_id + '/rating', { method: 'DELETE', headers: authHeaders() })
                .then(function (r) { return r.json(); }).then(function () {
                  if (!filmState.toolbarOpts) filmState.toolbarOpts = {};
                  filmState.toolbarOpts.myRating = 0;
                  filmState.toolbarOpts.inBase = true;
                  filmState.toolbarOpts.authenticated = true;
                  filmState.film = film;
                  applyAuthToolbar(filmState);
                });
            });
          }
          bindFilmPlanDropdowns(root, function (place) {
            openStandalonePlanModal(film, place === 'cinema' ? 'cinema' : 'home');
          });
          var tagBtn = document.getElementById('film-user-tag-btn');
          if (tagBtn && global.MpFilmUserTags && global.MpFilmUserTags.bindButton) {
            global.MpFilmUserTags.bindButton(tagBtn, film.film_id);
          }
        }
      }

      function loadFilmFriendsSocialBlock() {
        if (!token() || forcePublic) return;
        if (!global.MpFilmFriendsSocial || typeof global.MpFilmFriendsSocial.mount !== 'function') return;
        global.MpFilmFriendsSocial.mount({
          kpId: kpId,
          apiBase: apiBase,
          containerId: 'film-friends-social-block',
          authHeaders: authHeaders(),
          onFriendClick: function (uid) {
            try {
              global.location.href = '/u/' + encodeURIComponent(String(uid));
            } catch (_e) {}
          },
        });
      }

      function fetchJsonAuth(url, timeoutMs) {
        var ms = timeoutMs || 25000;
        return new Promise(function (resolve, reject) {
          var done = false;
          var timer = setTimeout(function () {
            if (done) return;
            done = true;
            reject(new Error('timeout'));
          }, ms);
          fetch(apiBase + url, { headers: authHeaders() })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (done) return;
              done = true;
              clearTimeout(timer);
              resolve(data);
            })
            .catch(function (err) {
              if (done) return;
              done = true;
              clearTimeout(timer);
              reject(err);
            });
        });
      }

      function loadAuthFilmState() {
        if (!token() || forcePublic) return;
        if (isMp || isFest) {
          applyAuthToolbar({
            film: {
              catalog_id: catalogId,
              mp_film_id: isMp ? Number(mpFilmId) : undefined,
              is_series: !!(readMpRouteBoot() && readMpRouteBoot().is_series),
            },
            toolbarOpts: { inBase: false, authenticated: true },
          });
          return;
        }
        if (!kpId) {
          applyAuthToolbar({ toolbarOpts: { inBase: false, authenticated: true } });
          return;
        }
        if (isTmdbOnly) {
          // TMDB-only: library state via add-film idempotent lookup path is not exposed;
          // keep toolbar authenticated without KP film-by-kp.
          applyAuthToolbar({
            film: { tmdb_id: Number(tmdbId), media_type: mediaType, catalog_id: catalogId },
            toolbarOpts: { inBase: false, authenticated: true },
          });
          return;
        }
        fetchJsonAuth('/api/site/film-by-kp/' + encodeURIComponent(kpId), 15000)
          .then(function (lookup) {
            if (!lookup || !lookup.in_library || !lookup.film_id) {
              applyAuthToolbar({ film: { kp_id: kpId }, toolbarOpts: { inBase: false, authenticated: true } });
              return;
            }
            // Сразу показываем "в базе", даже если детальная карточка подвиснет.
            applyAuthToolbar({
              film: { kp_id: kpId, film_id: lookup.film_id },
              toolbarOpts: { inBase: true, authenticated: true },
            });
            return fetchJsonAuth('/api/site/film/' + encodeURIComponent(String(lookup.film_id)), 8500)
              .then(function (detail) {
                if (!detail || !detail.success || !detail.film) {
                  if (hint) hint.textContent = 'Не удалось загрузить ваши данные по сериалу';
                  return;
                }
                var f = detail.film;
                var myRating = 0;
                var uid = detail.me && detail.me.user_id;
                (detail.ratings || []).forEach(function (r) {
                  if (uid && String(r.user_id) === String(uid)) myRating = Number(r.rating) || 0;
                });
                var desc = pickFilmDescription(f);
                if (desc) setFilmDescription(desc);
                applyAuthToolbar({
                  film: f,
                  toolbarOpts: {
                    inBase: true,
                    authenticated: true,
                    watched: !!f.watched,
                    myRating: myRating,
                    canRate: !(f.is_virtual_room && f.can_rate_in_group === false),
                    ratingLocked: f.is_virtual_room && f.can_rate_in_group === false,
                  },
                });
              })
              .catch(function (_e) {
                return fetchJsonAuth('/api/site/series/' + encodeURIComponent(String(lookup.film_id)) + '/progress', 5000)
                  .then(function (progressData) {
                  if (!progressData || !progressData.success) return;
                  applyAuthToolbar({
                    film: {
                      kp_id: kpId,
                      film_id: lookup.film_id,
                      is_series: true,
                      progress: progressData.progress || null,
                      series_progress: progressData,
                    },
                    toolbarOpts: { inBase: true, authenticated: true },
                  });
                })
                  .catch(function () {});
              });
          })
          .catch(function () {
            if (hint) hint.textContent = 'Не удалось загрузить данные кабинета';
          });
      }

      initStandaloneSiteChrome({
        apiBase: apiBase,
        mainSelector: cabinetMode ? '#film-page-content' : 'main.film-page',
        spaReturnPath: '/f/' + pathKey,
        kpId: kpId || pathKey,
        forcePublic: forcePublic,
        cabinetMode: cabinetMode,
        bindLogin: !cabinetMode,
        loginNow: loginNow,
        onLoginSuccess: function () {
          loadAuthFilmState();
          loadFilmFriendsSocialBlock();
          consumePendingAction();
          try { document.dispatchEvent(new CustomEvent('mp:film-login-success')); } catch (_e) {}
        },
      });

      loadAuthFilmState();
      loadFilmFriendsSocialBlock();
      consumePendingAction();
      document.addEventListener('mp:film-refresh-auth', function () {
        loadAuthFilmState();
        loadFilmFriendsSocialBlock();
        consumePendingAction();
      });
      if (opts.onReady) {
        try { opts.onReady(); } catch (_ready) {}
      }
      var similarRoot = cabinetMode
        ? document.getElementById('film-page-content')
        : document.querySelector('main.film-page');
      if (!isTmdbOnly) mountFilmPageSimilarBlock(kpId, similarRoot);
      try {
        if (!token() && global.MpPublicPromo && typeof global.MpPublicPromo.mountAfterHero === 'function' && similarRoot) {
          global.MpPublicPromo.mountAfterHero(similarRoot);
        }
      } catch (_promoEnd) {}
      try {
        if (global.MpRsy && typeof global.MpRsy.mountFilmPage === 'function') {
          global.MpRsy.mountFilmPage();
        }
      } catch (_rsyFilm) {}
      try {
        if (global.MpMonetization && typeof global.MpMonetization.initFilmPage === 'function' && similarRoot && kpId) {
          var _monTitleEl = document.getElementById('film-title');
          var _monTitle = _monTitleEl ? String(_monTitleEl.textContent || '').trim() : '';
          var _monSeries = !!(document.querySelector('.film-hero-with-tag[data-is-series="1"]'));
          global.MpMonetization.initFilmPage({
            root: similarRoot,
            kpId: kpId,
            title: _monTitle,
            isSeries: _monSeries,
          });
        }
      } catch (_monEnd) {}
  }

  function bootstrap(opts) {
    opts = opts || {};
    try {
      document.documentElement.classList.remove('mp-route-pending');
      document.documentElement.classList.add('mp-route-ready');
      /* Thin /f/ shell uses cabinetMode but still needs film-standalone sticky chrome */
      document.body.classList.add('film-standalone-page');
      document.body.classList.remove('staff-standalone-page', 'landing-root-page');
      document.body.classList.remove(
        'staff-header-title-on',
        'staff-header-title-only',
        'staff-header-search-with-title'
      );
      var staffTitleEl = document.getElementById('header-staff-title');
      if (staffTitleEl) {
        staffTitleEl.textContent = '';
        staffTitleEl.removeAttribute('title');
      }
    } catch (_e) {}
    renderFilmPage(opts);
    try {
      if (global.MpHeaderSearchScroll && typeof global.MpHeaderSearchScroll.bind === 'function') {
        global.MpHeaderSearchScroll.bind();
      }
      if (global.MpHeaderSearchScroll && typeof global.MpHeaderSearchScroll.refresh === 'function') {
        global.MpHeaderSearchScroll.refresh();
      }
    } catch (_scroll) {}
  }

  global.MpFilmPage = {
    bootstrap: bootstrap,
    renderFilmPage: renderFilmPage,
    parseFilmRoute: parseFilmRoute,
    buildFilmPageToolbar: buildFilmPageToolbar,
    initStandaloneSiteChrome: initStandaloneSiteChrome,
    standaloneNavHtml: standaloneNavHtml,
    mountStandaloneCabinetNav: mountStandaloneCabinetNav,
    refreshStandaloneAuthChrome: refreshStandaloneAuthChrome,
    applyStandaloneAuthChrome: applyStandaloneAuthChrome,
    setupAppOpenBanner: setupAppOpenBanner,
    appOpenBannerHtml: appOpenBannerHtml,
    standaloneHeaderSearchHtml: standaloneHeaderSearchHtml,
    API_BASE: API_BASE,
  };
})(typeof window !== 'undefined' ? window : this);
