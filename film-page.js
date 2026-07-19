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

  function cleanPosterUrl(src) {
    var s = String(src || '').trim();
    if (!s || /no-poster|kinopoiskapiunofficial\.tech\/images\/posters/i.test(s)) return '';
    return s;
  }

  function isGoodFilmPosterUrl(src) {
    var s = cleanPosterUrl(src);
    if (!s) return false;
    return /avatars\.mds\.yandex\.net|get-kinopoisk-image|image\.tmdb\.org|st\.kp\.yandex\.net|film-poster-placeholder|person-avatar-placeholder/i.test(s);
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

  function buildFilmPageSimilarSectionLite(similar) {
    if (!similar || !similar.length) return '';
    var cards = similar.map(function (s) {
      var p = s.poster || s.poster_thumb || '';
      var img = p
        ? '<img src="' + filmSimilarEscape(p) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">'
        : '';
      var inBase = s.in_base_film_id ? '<span class="similar-in-base">✓</span>' : '';
      var em = s.is_series ? '📺 ' : '🎬 ';
      return (
        '<button type="button" class="similar-rail-card" data-similar-kp="' + filmSimilarEscape(String(s.kp_id)) + '" title="' + filmSimilarEscape(s.title || '') + '" role="listitem">' +
          '<div class="similar-rail-poster">' + img + inBase + '</div>' +
          '<div class="similar-rail-title">' + em + filmSimilarEscape(s.title || '') + '</div>' +
        '</button>'
      );
    }).join('');
    return (
      '<section class="film-page-similar-section" aria-label="Похожие">' +
        '<h2 class="section-title section-title--compact film-page-similar-title">' +
          '<span class="section-title-text gradient">Похожие</span>' +
        '</h2>' +
        '<div class="film-page-similar-rail-wrap">' +
          '<div class="similar-rail home-rail--draggable film-page-similar-rail" role="list">' + cards + '</div>' +
          '<button type="button" class="film-page-similar-next" aria-label="Листать похожие">›</button>' +
        '</div>' +
      '</section>'
    );
  }

  function bindFilmPageSimilarRailNav(section) {
    if (!section) return;
    var rail = section.querySelector('.film-page-similar-rail');
    var btn = section.querySelector('.film-page-similar-next');
    if (!rail || !btn || btn.dataset.mpSimilarNavBound === '1') return;
    btn.dataset.mpSimilarNavBound = '1';
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
      var max = Math.max(0, rail.scrollWidth - rail.clientWidth);
      var canScroll = max > 8;
      btn.hidden = !canScroll;
      btn.classList.toggle('is-at-end', canScroll && rail.scrollLeft >= max - 4);
      btn.setAttribute('aria-hidden', canScroll ? 'false' : 'true');
    }
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var max = Math.max(0, rail.scrollWidth - rail.clientWidth);
      if (max <= 8) return;
      var next = rail.scrollLeft + cardStep() * 2;
      if (next >= max - 4) next = 0;
      rail.scrollTo({ left: next, behavior: 'smooth' });
    });
    rail.addEventListener('scroll', syncNav, { passive: true });
    try {
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(syncNav).observe(rail);
      }
    } catch (_ro) {}
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
      card.addEventListener('click', function () {
        var kp = card.getAttribute('data-similar-kp');
        if (kp) global.location.href = '/f/' + encodeURIComponent(kp);
      });
    });
    bindFilmPageSimilarRailNav(section);
    try {
      if (!mpToken() && global.MpPublicPromo && typeof global.MpPublicPromo.mountAfterHero === 'function') {
        global.MpPublicPromo.mountAfterHero(pageRoot);
      }
    } catch (_e) {}
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
    try {
      document.documentElement.style.setProperty('--film-backdrop', 'url("' + display.replace(/"/g, '\\"') + '")');
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
    var pEl = document.getElementById('poster');
    if (pEl && isGoodFilmPosterUrl(cur) && display === MP_POSTER_PLACEHOLDER) {
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
  } catch (_mpPh) {}

  function isFilmDescPlaceholder(text) {
    var s = String(text || '').trim().toLowerCase();
    if (!s) return true;
    if (s.indexOf('откройте в movie planner') === 0) return true;
    if (s.indexOf('откройте фильм в movie planner') === 0) return true;
    return false;
  }

  function pickFilmDescription(film) {
    if (!film) return '';
    var candidates = [
      film.description,
      film.plot,
      film.overview_ru,
      film.overview_en,
      film.shortDescription,
    ];
    var best = '';
    candidates.forEach(function (raw) {
      var s = String(raw || '').trim();
      if (!s || isFilmDescPlaceholder(s)) return;
      if (!best || s.length > best.length) best = s;
      else if (best.endsWith('…') && s.length >= best.length - 1 && !s.endsWith('…')) best = s;
    });
    return best;
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
            '<span class="film-desc-reviews-inline"></span>' +
          '</span>' +
          '<button type="button" class="film-actors-more-btn film-desc-more-btn hidden" aria-expanded="false">ещё</button>' +
        '</p>' +
      '</div>'
    );
  }

  function filmDescPlotText(wrap) {
    if (!wrap) return String(lastFilmDescription || '').trim();
    return String(wrap.getAttribute('data-plot-text') || lastFilmDescription || '').trim();
  }

  function filmDescFactsInlineHtml(payload) {
    var items = filmFactsItemsFromPayload(payload);
    if (!items.length) return '';
    return '<div class="film-desc-facts-title">Интересные факты</div>' +
      '<ul class="film-toolbar-facts-list film-desc-facts-list">' +
      items.map(function (x) { return renderFilmDescFactItem(x); }).join('') +
      '</ul>';
  }

  function migrateFilmDescWrap(wrap) {
    if (!wrap) return;
    var fullEl = wrap.querySelector('.film-desc-full');
    if (!fullEl) return;
    var plotText = String(
      wrap.getAttribute('data-plot-text') ||
      (fullEl.querySelector('.film-desc-plot') && fullEl.querySelector('.film-desc-plot').textContent) ||
      fullEl.textContent ||
      (wrap.querySelector('.film-desc-short') && wrap.querySelector('.film-desc-short').textContent) ||
      lastFilmDescription ||
      ''
    ).trim();
    if (plotText) wrap.setAttribute('data-plot-text', plotText);
    var plotEl = fullEl.querySelector('.film-desc-plot');
    if (!plotEl) {
      plotEl = document.createElement('span');
      plotEl.className = 'film-desc-plot';
      fullEl.textContent = '';
      fullEl.appendChild(plotEl);
    }
    plotEl.textContent = plotText;
    var factsEl = fullEl.querySelector('.film-desc-facts-inline');
    if (!factsEl) {
      factsEl = document.createElement('span');
      factsEl.className = 'film-desc-facts-inline';
      fullEl.appendChild(factsEl);
    }
    var reviewsEl = fullEl.querySelector('.film-desc-reviews-inline');
    if (!reviewsEl) {
      reviewsEl = document.createElement('span');
      reviewsEl.className = 'film-desc-reviews-inline';
      fullEl.appendChild(reviewsEl);
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
    if (!text) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    var expanded = btn.getAttribute('aria-expanded') === 'true';
    var needsMore = text.length > FILM_DESC_PREVIEW_LEN || !!hasFacts;
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

  function filmFactsItemsFromPayload(d) {
    var web = (d && Array.isArray(d.web_facts))
      ? d.web_facts.filter(function (f) { return f && f.fact; })
      : [];
    if (web.length) return web.slice(0, 8);
    var arr = (d && Array.isArray(d.facts) && d.facts.length) ? d.facts.slice(0, 8) : [];
    if (!arr.length && d && Array.isArray(d.bloopers)) arr = d.bloopers.slice(0, 6);
    return arr;
  }

  function paintFilmDescFacts(wrap, payload) {
    if (!wrap) wrap = document.getElementById('film-desc-wrap');
    if (!wrap) return;
    migrateFilmDescWrap(wrap);
    var factsEl = wrap.querySelector('.film-desc-facts-inline');
    if (!factsEl) return;
    var items = filmFactsItemsFromPayload(payload);
    factsEl.innerHTML = items.length ? filmDescFactsInlineHtml(payload) : '';
    var hasFacts = items.length > 0;
    var hasReviews = wrap.getAttribute('data-has-reviews') === '1';
    wrap.setAttribute('data-has-facts', hasFacts ? '1' : '0');
    updateFilmDescCollapseState(wrap, filmDescPlotText(wrap), hasFacts || hasReviews);
  }

  function withReviewUtm(url, channelTitle) {
    var raw = String(url || '').trim();
    if (!/^https?:\/\//i.test(raw)) return raw;
    try {
      var u = new URL(raw);
      if (!u.searchParams.get('utm_source')) u.searchParams.set('utm_source', 'movie_planner');
      if (!u.searchParams.get('utm_medium')) u.searchParams.set('utm_medium', 'film_reviews');
      if (!u.searchParams.get('utm_campaign')) u.searchParams.set('utm_campaign', 'news');
      var content = String(channelTitle || 'youtube').replace(/[^\w.\-@]+/g, '_').slice(0, 80);
      if (content && !u.searchParams.get('utm_content')) u.searchParams.set('utm_content', content);
      return u.toString();
    } catch (_) {
      return raw;
    }
  }

  function filmDescReviewsInlineHtml(items) {
    if (!items || !items.length) return '';
    var ytSvg = '<span class="film-review-yt" aria-hidden="true" title="YouTube">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
      '<path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.8 15.5v-7l6.2 3.5-6.2 3.5z"/>' +
      '</svg></span>';
    var lis = items.slice(0, 8).map(function (it) {
      if (!it || !it.url) return '';
      var title = escapeHtml(it.title || 'Видео');
      var ch = escapeHtml(it.channel_title || '');
      var url = escapeHtml(withReviewUtm(it.url, it.channel_title || ''));
      var chBit = ch
        ? ' <span class="film-review-channel">' + ch + '</span>'
        : '';
      return '<li class="film-review-item">' + ytSvg +
        '<a class="film-review-link" href="' + url + '" target="_blank" rel="noopener nofollow"' +
        ' data-review-out="1" data-review-channel="' + ch + '">' +
        title + '</a>' + chBit + '</li>';
    }).filter(Boolean).join('');
    if (!lis) return '';
    return '<div class="film-desc-reviews-title">Разборы</div>' +
      '<ul class="film-desc-reviews-list">' + lis + '</ul>';
  }

  function paintFilmDescReviews(wrap, items) {
    if (!wrap) wrap = document.getElementById('film-desc-wrap');
    if (!wrap) return;
    migrateFilmDescWrap(wrap);
    var fullEl = wrap.querySelector('.film-desc-full');
    if (!fullEl) return;
    var revEl = fullEl.querySelector('.film-desc-reviews-inline');
    if (!revEl) {
      revEl = document.createElement('span');
      revEl.className = 'film-desc-reviews-inline';
      fullEl.appendChild(revEl);
    }
    var list = Array.isArray(items) ? items : [];
    revEl.innerHTML = list.length ? filmDescReviewsInlineHtml(list) : '';
    revEl.querySelectorAll('a[data-review-out]').forEach(function (a) {
      a.addEventListener('click', function () {
        try {
          if (typeof window.ym === 'function') {
            window.ym(110038199, 'reachGoal', 'buzz_outbound', {
              platform: 'youtube',
              channel: a.getAttribute('data-review-channel') || '',
              view: 'film_reviews',
            });
          }
        } catch (_) {}
      });
    });
    var hasReviews = list.length > 0;
    wrap.setAttribute('data-has-reviews', hasReviews ? '1' : '0');
    var hasFacts = wrap.getAttribute('data-has-facts') === '1';
    updateFilmDescCollapseState(wrap, filmDescPlotText(wrap), hasFacts || hasReviews);
  }

  function loadFilmDescReviews(kpId, root) {
    var kp = String(kpId || '').replace(/\D/g, '');
    if (!kp) return Promise.resolve();
    var scope = root || document;
    var wrap = scope.querySelector('#film-desc-wrap');
    if (!wrap) return Promise.resolve();
    if (wrap.getAttribute('data-reviews-loaded') === kp) return Promise.resolve();
    return fetch(API_BASE + '/api/public/film/' + encodeURIComponent(kp) + '/reviews', {
      method: 'GET',
      mode: 'cors',
    })
      .then(function (r) {
        if (!r.ok) throw new Error('api_' + r.status);
        return r.json();
      })
      .then(function (d) {
        wrap.setAttribute('data-reviews-loaded', kp);
        paintFilmDescReviews(wrap, (d && d.items) || []);
      })
      .catch(function () {});
  }

  function loadFilmDescFacts(kpId, root) {
    var kp = String(kpId || '').replace(/\D/g, '');
    if (!kp) return Promise.resolve();
    var scope = root || document;
    var wrap = scope.querySelector('#film-desc-wrap');
    if (!wrap) return Promise.resolve();
    if (wrap.getAttribute('data-facts-loaded') === kp) {
      return loadFilmDescReviews(kp, root);
    }
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
      .then(function () { return loadFilmDescReviews(kp, root); });
  }

  function setFilmDescription(text) {
    var heroContent = document.querySelector('#film-page-content .hero-content, .film-page .hero-content');
    var wrap = ensureFilmDescWrap(heroContent);
    if (!wrap) return;
    var s = String(text || '').trim();
    var prev = String(lastFilmDescription || wrap.getAttribute('data-plot-text') || '').trim();
    if (prev && s && s.length < prev.length && (prev.length > s.length + 24 || prev.endsWith('…'))) {
      s = prev;
    }
    if (!s || isFilmDescPlaceholder(s)) {
      if (lastFilmDescription) {
        updateFilmDescCollapseState(wrap, lastFilmDescription, wrap.getAttribute('data-has-facts') === '1');
        return;
      }
      wrap.classList.add('hidden');
      return;
    }
    lastFilmDescription = s;
    updateFilmDescCollapseState(wrap, s, wrap.getAttribute('data-has-facts') === '1');
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
    var planIcon = (global.MPIcons && global.MPIcons.html)
      ? global.MPIcons.html('calendar', { size: 'sm', className: 'action-dropdown-btn-ico' })
      : '';
    return '<div class="action-dropdown" data-dropdown-root="plan">' +
      '<button type="button" class="action-dropdown-btn film-toolbar-plan" data-dropdown-toggle="1">' +
      '<span class="action-dropdown-btn-label">' + planIcon + '<span class="action-dropdown-btn-text">Запланировать просмотр</span></span>' +
      '<span class="action-dropdown-caret">▾</span></button>' +
      '<div class="action-dropdown-menu">' + menuItems + '</div></div>';
  }

  function mpToolbarIcon(name, opts) {
    if (global.MPIcons && global.MPIcons.html) return global.MPIcons.html(name, opts || { size: 'sm' });
    return name === 'bellOff' ? '🔕' : '🔔';
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
      overlay.innerHTML =
        '<div class="mp-dialog-card">' +
          '<div class="modal-title">' + escapeHtml(title || 'Подтверждение') + '</div>' +
          '<p class="cabinet-hint">' + escapeHtml(message || '') + '</p>' +
          '<div style="display:flex;gap:10px;margin-top:16px">' +
            '<button type="button" class="btn btn-secondary" id="mp-confirm-cancel">' + escapeHtml(opts.cancelLabel || 'Отмена') + '</button>' +
            '<button type="button" class="btn btn-primary" id="mp-confirm-ok">' + escapeHtml(opts.confirmLabel || 'Да') + '</button>' +
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
    var planBlock = (authenticated && inBase)
      ? '<div class="film-toolbar-plan-wrap">' + buildFilmPlanDropdown(item) + '</div>'
      : '<button type="button" class="film-toolbar-plan" id="plan-watch-btn"><span class="action-dropdown-btn-ico mp-icon mp-icon--sm" aria-hidden="true"><i class="ph ph-calendar"></i></span><span>Запланировать просмотр</span></button>';
    var addIconBtn = !inBase
      ? '<button type="button" class="film-icon-btn" id="add-btn" aria-label="Добавить в базу" title="Добавить в базу"><span class="film-icon-ico">+</span><span class="film-icon-label">В базу</span></button>'
      : '';
    var watchIconBtn = inBase
      ? '<button type="button" class="film-icon-btn film-icon-btn--watched' + (watched ? ' on' : '') + '" data-action="toggle-watched" aria-label="' + (watched ? 'Просмотрен' : 'Отметить просмотренным') + '" title="' + (watched ? 'Просмотрен' : 'Отметить просмотренным') + '"><span class="film-icon-ico">✓</span><span class="film-icon-label">' + (watched ? 'Просмотрен' : 'Просмотрен') + '</span></button>'
      : '';
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
    var premiereBtn = renderFilmToolbarPremiereBtn(item);
    var showSeriesToolbar = !!(
      item.is_series && opts.authenticated && (
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
      '<button type="button" class="film-icon-btn" id="share-film-btn" data-share-film="1" data-kp="' + escapeHtml(String(item.kp_id || '')) + '" aria-label="Поделиться" title="Поделиться"><span class="film-icon-ico">↗</span><span class="film-icon-label">Поделиться</span></button></div>' +
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
        var iconHtml = (window.MPIcons && MPIcons.html) ? MPIcons.html(t.icon, { size: 'md' }) : '';
        return '<a class="cabinet-nav-btn" href="' + t.href + '"><span class="cabinet-nav-btn-emoji">' + iconHtml + '</span><span class="cabinet-nav-btn-text">' + escapeHtml(t.label) + '</span></a>';
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

  function mountStandaloneCabinetNav(mainSelector) {
    var shell = document.querySelector('.page-shell');
    var main = shell && shell.querySelector(mainSelector || 'main');
    var old = document.getElementById('film-standalone-nav');
    if (old) old.remove();
    if (!shell || !main) return;
    var navWrap = document.createElement('div');
    navWrap.innerHTML = standaloneNavHtml();
    var navEl = navWrap.firstElementChild;
    if (navEl) {
      shell.insertBefore(navEl, main);
      bindStandaloneNavLinks(navEl);
      try {
        if (global.MPIcons && global.MPIcons.hydrate) global.MPIcons.hydrate(navEl);
      } catch (_e) {}
    }
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
    var input = document.getElementById('header-search-input');
    var dd = document.getElementById('header-search-dropdown');
    var clearBtn = document.getElementById('header-search-clear');
    var timer = null;
    var controller = null;
    var seq = 0;
    var SEARCH_DEBOUNCE_MS = 260;
    if (!input || !dd) return;
    function escapeText(v) {
      return String(v || '').replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
      });
    }
    function hide() { dd.classList.add('hidden'); dd.innerHTML = ''; }
    function cleanPoster(src) { return cleanPosterUrl(src); }
    function searchLoadingHtml() {
      if (global.__MP_SEARCH_LOADING_HTML) return global.__MP_SEARCH_LOADING_HTML();
      return '<div class="mp-search-loading" role="status" aria-live="polite" aria-busy="true" aria-label="Ищем">'
        + '<div class="mp-search-loading-rings" aria-hidden="true"><span></span><span></span></div>'
        + '<p class="mp-search-loading-text">Ищем фильмы и людей…</p></div>';
    }
    function render(items, persons) {
      items = items || [];
      persons = persons || [];
      if (!items.length && !persons.length) {
        dd.innerHTML = '<div class="header-search-empty">Ничего не нашлось</div>';
        dd.classList.remove('hidden');
        return;
      }
      var html = '';
      if (persons.length) {
        html += persons.slice(0, 1).map(function (p) {
          var photo = cleanPoster(p.photo) || '/images/person-avatar-placeholder.png';
          var name = escapeText(p.name_ru || p.name_en || 'Персона');
          var prof = escapeText(String(p.professions || '').slice(0, 60));
          return '<a class="hs-result hs-result-person search-result" href="/s/' + encodeURIComponent(String(p.kp_person_id)) + '">'
            + '<img class="hs-result-poster hs-result-person-photo search-result-poster" src="' + photo.replace(/"/g, '&quot;') + '" alt="" loading="lazy" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">'
            + '<span><span class="search-result-title">' + name + '</span>'
            + '<span class="search-result-meta"><span>Актёр / режиссёр</span>'
            + (prof ? '<span>·</span><span>' + prof + '</span>' : '') + '</span></span></a>';
        }).join('');
      }
      html += items.slice(0, 6).map(function (it) {
        var typeLabel = it.type === 'series' ? 'Сериал' : 'Фильм';
        var year = it.year && String(it.year) !== 'null' ? String(it.year) : '';
        var posterSafe = cleanPoster(it.poster).replace(/"/g, '&quot;');
        return '<a class="search-result" href="/f/' + encodeURIComponent(String(it.kp_id)) + '">' +
          (posterSafe ? '<img class="search-result-poster" src="' + posterSafe + '" alt="" loading="lazy" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">' : '<img class="search-result-poster mp-poster-placeholder" src="/images/film-poster-placeholder.png" alt="" loading="lazy">') +
          '<span><span class="search-result-title">' + escapeText(it.title) + '</span>' +
          '<span class="search-result-meta"><span>' + escapeText(typeLabel) + '</span>' + (year ? '<span>·</span><span>' + escapeText(year) + '</span>' : '') + '</span></span></a>';
      }).join('');
      dd.innerHTML = html;
      dd.classList.remove('hidden');
    }
    function run(q) {
      q = String(q || '').trim();
      if (clearBtn) clearBtn.classList.toggle('hidden', !q);
      if (q.length < 2) { hide(); return; }
      clearTimeout(timer);
      timer = setTimeout(function () {
        var mySeq = ++seq;
        if (controller) controller.abort();
        controller = global.AbortController ? new AbortController() : null;
        dd.innerHTML = searchLoadingHtml();
        dd.classList.remove('hidden');
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
            if (mySeq === seq) dd.innerHTML = '<div class="header-search-empty">Не удалось найти</div>';
          });
      }, SEARCH_DEBOUNCE_MS);
    }
    input.addEventListener('input', function () { run(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; if (clearBtn) clearBtn.classList.add('hidden'); hide(); }
      if (e.key === 'Enter') {
        var q = input.value.trim();
        if (q.length >= 2) global.location.href = '/search?q=' + encodeURIComponent(q);
      }
    });
    input.addEventListener('focus', function () {
      if (filmCabinetRoute && typeof global.ensureFullCabinet === 'function') {
        try { global.ensureFullCabinet(); } catch (_cab) {}
      }
      if (input.value.trim().length >= 2 && dd.innerHTML) dd.classList.remove('hidden');
      else if (global.showHeaderSearchHub && dd) global.showHeaderSearchHub(dd);
    });
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        input.value = '';
        clearBtn.classList.add('hidden');
        hide();
        input.focus();
      });
    }
    document.addEventListener('click', function (e) {
      var wrap = document.getElementById('header-search');
      if (wrap && !wrap.contains(e.target)) dd.classList.add('hidden');
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
    var loginBtn = document.getElementById('login-btn') || document.querySelector('#site-header [data-action="login"]');
    if (loginBtn) loginBtn.classList.add('hidden');
    var wrap = document.getElementById('header-user-wrap');
    if (wrap) wrap.classList.remove('hidden');
    var pill = document.getElementById('header-profile-pill');
    if (pill) pill.classList.remove('hidden');
    var nameEl = document.getElementById('header-profile-name');
    if (nameEl) nameEl.textContent = name;
    var coinsEl = document.getElementById('header-coins-val');
    if (coinsEl) coinsEl.textContent = coinsVal;
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
      bindStandaloneNavLinks(navEl);
      try {
        if (global.MPIcons && global.MPIcons.hydrate) global.MPIcons.hydrate(navEl);
      } catch (_e) {}
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
    if (opts.cabinetMode) {
      bindStandaloneHeaderChrome(me, Object.assign({}, opts, { kpId: opts.kpId || '' }));
      bindStandaloneLogoHome();
      return;
    }
    if (standaloneHeaderHasAuthShell()) {
      patchStandaloneAuthHeader(me, opts);
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
            '<button type="button" class="header-profile-pill" id="header-profile-pill" aria-label="Профиль">' +
              '<span class="header-profile-avatar" id="header-profile-avatar"></span>' +
              '<span class="header-profile-name" id="header-profile-name">' + escapeHtml(name) + '</span>' +
            '</button>' +
            '<div class="header-util-row">' +
              '<button type="button" class="header-inbox-btn" id="header-inbox-btn" aria-label="Уведомления" title="Уведомления">' +
                '<span class="header-inbox-icon" aria-hidden="true">📥</span>' +
              '</button>' +
              '<button type="button" class="header-coins-btn" id="header-coins-btn" aria-label="Монетки">' +
                '<span class="header-coins-sprite"></span><span id="header-coins-val">' + escapeHtml(coinsVal) + '</span>' +
              '</button>' +
            '</div>' +
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
    var posterSrc = resolveFilmPosterDisplay(poster, kpId);
    var phCls = posterSrc.indexOf('film-poster-placeholder') >= 0 ? ' mp-poster-placeholder' : '';
    var toolbarHtml = buildFilmPageToolbar({ kp_id: kpId }, { inBase: false, authenticated: !!mpToken(), canRate: true });
    return (
      '<section class="hero film-hero-with-tag" data-kp-id="' + escapeHtml(String(kpId || '')) + '">' +
        '<button type="button" class="film-hero-tag-btn" id="film-user-tag-btn" aria-label="В список" title="В список">' +
          (global.MPIcons ? global.MPIcons.html('bookmark', { className: 'film-hero-tag-ico', weight: 'fill' }) : '<span data-tag-emoji>🔖</span>') +
        '</button>' +
        '<div class="poster-wrap' + (phCls ? ' film-poster-has-placeholder' : '') + '"><img class="poster' + phCls + '" id="poster" src="' + posterSrc + '" alt="Постер" referrerpolicy="no-referrer" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)"></div>' +
        '<div class="hero-content">' +
          '<h1 id="film-title"><span class="mp-film-title-loading">Загрузка…</span></h1>' +
          '<div class="eyebrow" id="chips"></div>' +
          '<div class="film-hero-crew" id="film-cast-root"></div>' +
          buildFilmDescWrapHtml() +
          toolbarHtml +
          '<p class="status" id="hint"></p>' +
        '</div>' +
      '</section>'
    );
  }

  function isGenericFilmTitle(title) {
    var t = String(title || '').trim();
    if (!t || t === 'Фильм' || t === 'Film' || t === 'Сериал' || t === 'Series') return true;
    return /^(фильм|сериал|film|series)\s+\d+$/i.test(t);
  }

  function paintCabinetRouteBoot(kpId, pageRoot, poster) {
    var boot = readMpRouteBoot();
    if (!boot || boot.type !== 'film') return false;
    if (String(boot.kp_id || '').replace(/\D/g, '') !== String(kpId || '').replace(/\D/g, '')) return false;
    if (isGenericFilmTitle(boot.title)) return false;
    var title = boot.title || 'Фильм';
    var bootPoster = boot.poster_url || poster;
    var year = boot.year ? ' (' + boot.year + ')' : '';
    pageRoot.className = 'movie-page';
    pageRoot.innerHTML = buildFilmMainInnerHtml(kpId, bootPoster);
    setFilmHeroBackdrop(bootPoster, kpId);
    var titleEl = document.getElementById('film-title');
    if (titleEl) titleEl.textContent = title + year;
    var chips = document.getElementById('chips');
    if (chips && boot.genres) {
      String(boot.genres).split(/[,;/|]+/).slice(0, 8).forEach(function (label) {
        var chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = String(label || '').trim();
        if (chip.textContent) chips.appendChild(chip);
      });
    }
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
    if (descWrapBoot) {
      try {
        loadFilmDescFacts(String(boot.kp_id || kpId), pageRoot);
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
    var kpId = String(opts.kpId || '').replace(/\D/g, '');
    if (!kpId) return;

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
        if (forceKp && String(forceKp) === String(kpId)) {
          sessionStorage.removeItem('mp_public_film_force');
          forcePublic = true;
          localStorage.removeItem('mp_site_active_chat_id');
          localStorage.setItem('mp_site_sessions', '[]');
          localStorage.removeItem('mp_site_token');
        }
      } catch (_e) {}
      var poster = MP_POSTER_PLACEHOLDER;
      var tgMini = 'https://t.me/movie_planner_bot/app?startapp=' + encodeURIComponent('film_' + kpId);
      var apiBase = opts.apiBase || API_BASE;
      var pageUrl = (opts.pageUrl || (window.location.origin + '/f/' + kpId));
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
        if (!paintCabinetRouteBoot(kpId, pageRoot, poster)) {
          pageRoot.className = 'movie-page loading';
          pageRoot.innerHTML = (global.MpPageLoading && MpPageLoading.html())
            ? MpPageLoading.html()
            : '<div class="mp-page-loading" role="status"><div class="mp-page-loading-spinner"></div></div>';
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
              '<button type="button" class="film-hero-tag-btn" id="film-user-tag-btn" aria-label="В список" title="В список">' +
                (global.MPIcons ? global.MPIcons.html('bookmark', { className: 'film-hero-tag-ico', weight: 'fill' }) : '<span data-tag-emoji>🔖</span>') +
              '</button>' +
              '<div class="poster-wrap film-poster-has-placeholder"><img class="poster mp-poster-placeholder" id="poster" src="' + MP_POSTER_PLACEHOLDER + '" alt="Постер" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)"></div>' +
              '<div class="hero-content">' +
                '<h1 id="film-title"><span class="mp-film-title-loading">Загрузка…</span></h1>' +
                '<div class="eyebrow" id="chips"></div>' +
                '<div class="film-hero-crew" id="film-cast-root"></div>' +
                buildFilmDescWrapHtml() +
                '<div class="film-page-toolbar">' +
                  '<div class="film-toolbar-plan-wrap">' +
                    '<button type="button" class="film-toolbar-plan" id="plan-watch-btn"><span class="action-dropdown-btn-ico mp-icon mp-icon--sm" aria-hidden="true"><i class="ph ph-calendar"></i></span><span>Запланировать просмотр</span></button>' +
                  '</div>' +
                  '<div class="film-toolbar-icons">' +
                    '<button type="button" class="film-icon-btn" id="add-btn" aria-label="Добавить в базу" title="Добавить в базу"><span class="film-icon-ico">+</span><span class="film-icon-label">В базу</span></button>' +
                    '<button type="button" class="film-icon-btn" id="rate-toggle-btn" aria-label="Оценить" title="Оценить"><span class="film-icon-ico">★</span><span class="film-icon-label">Оценить</span></button>' +
                    '<button type="button" class="film-icon-btn" id="share-film-btn" aria-label="Поделиться" title="Поделиться"><span class="film-icon-ico">↗</span><span class="film-icon-label">Поделиться</span></button>' +
                  '</div>' +
                  '<div class="film-toolbar-friends-wrap">' +
                    '<div id="film-friends-social-block" class="hidden"></div>' +
                  '</div>' +
                  '<div class="film-toolbar-expand hidden" id="rating-expand-panel">' +
                    '<div class="public-rating-title">Ваша оценка</div>' +
                    '<div class="film-toolbar-rating-grid rating-grid" id="rate-grid">' +
                      [1,2,3,4,5,6,7,8,9,10].map(function (n) {
                        return '<button class="rate-btn" data-rate="' + n + '" type="button">' + n + '</button>';
                      }).join('') +
                    '</div>' +
                  '</div>' +
                '</div>' +
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
        try { sessionStorage.setItem('mp_public_film_action', action + ':' + kpId); } catch (_e) {}
      }
      function apiGet(path) {
        return fetch(apiBase + path, { method: 'GET', mode: 'cors' }).then(function (r) {
          if (!r.ok) throw new Error('api_' + r.status);
          return r.json();
        });
      }
      function renderGenreChips(genresStr, isSeries, seriesStats) {
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
        var parts = String(genresStr || '')
          .split(/[,;/|]+/)
          .map(function (s) { return s.trim(); })
          .filter(Boolean);
        if (!parts.length && !isSeries) parts = ['фильм'];
        else if (!parts.length && isSeries) parts = ['сериал'];
        parts.slice(0, 8).forEach(function (label) {
          var chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'chip chip-link';
          chip.textContent = label;
          chip.addEventListener('click', function () {
            var q = encodeURIComponent(label);
            if (global.MpCabinetNav && typeof global.MpCabinetNav.openSearch === 'function') {
              global.MpCabinetNav.openSearch({ genre: label });
              return;
            }
            global.location.href = '/search?genre=' + q;
          });
          container.appendChild(chip);
        });
      }
      function scheduleLoadFacts() {
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
        var nm = String(entry.name_ru || entry.name_en || '').replace(/[&<>"']/g, function (c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
        if (!nm) return '';
        var kpRaw = entry.kp_person_id;
        if (kpRaw == null || kpRaw === '') {
          return '<span class="staff-cast-plain">' + nm + '</span>';
        }
        var kp = String(kpRaw).replace(/\D/g, '');
        if (!kp) return '<span class="staff-cast-plain">' + nm + '</span>';
        var photoAttr = entry.photo ? (' data-staff-photo="' + String(entry.photo).replace(/"/g, '&quot;') + '"') : '';
        return '<a href="/s/' + encodeURIComponent(kp) + '" class="staff-cast-link" data-staff-kp="' + kp + '" data-staff-name="' + nm + '"' + photoAttr + '>' + nm + '</a>';
      }
      function buildPublicCastHtml(director, actors, country) {
        var parts = [];
        var ctry = String(country || '').trim();
        if (ctry) {
          parts.push('<div class="film-cast-row"><span class="film-cast-label">Страна:</span> ' + ctry.replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
          }) + '</div>');
        }
        if (director) {
          var dirHtml = castPersonLink(director);
          if (dirHtml) {
            parts.push('<div class="film-cast-row"><span class="film-cast-label">Режиссёр:</span> ' + dirHtml + '</div>');
          }
        }
        var links = (actors || []).map(castPersonLink).filter(Boolean);
        if (!links.length) return parts.join('');
        var collapsed = links.slice(0, CAST_VISIBLE);
        var hiddenLinks = links.slice(CAST_VISIBLE);
        var row = '<div class="film-cast-row film-cast-actors"><span class="film-cast-label">Актёры:</span> ';
        if (hiddenLinks.length) {
          row += '<span class="film-actors-short">' + collapsed.join('<span class="film-cast-sep">, </span>') + '</span>';
          row += '<span class="film-actors-full hidden"><span class="film-cast-sep">, </span>' +
            hiddenLinks.join('<span class="film-cast-sep">, </span>') + '</span>';
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
          hoverEl.innerHTML = '<img alt="" class="staff-hover-photo"><div class="staff-hover-name"></div>';
          document.body.appendChild(hoverEl);
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
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(function () {
              activeLink = link;
              hoverEl.querySelector('.staff-hover-name').textContent = nm;
              var img = hoverEl.querySelector('.staff-hover-photo');
              img.removeAttribute('src');
              hoverEl.classList.remove('hidden');
              hoverEl.style.left = Math.min(window.innerWidth - 220, e.clientX + 14) + 'px';
              hoverEl.style.top = Math.min(window.innerHeight - 120, e.clientY + 14) + 'px';
              var custom = (link.getAttribute('data-staff-photo') || '').trim();
              img.onerror = function () {
                if (global.mpPersonOnError) global.mpPersonOnError(img);
                else { img.src = PERSON_PH; img.onerror = null; }
              };
              var kpHover = (link.getAttribute('data-staff-kp') || '').replace(/\D/g, '');
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
            if (!shortEl || !fullEl) return;
            var expanded = fullEl.classList.contains('hidden');
            fullEl.classList.toggle('hidden', !expanded);
            shortEl.classList.toggle('hidden', expanded);
            moreBtn.textContent = expanded ? 'свернуть' : 'ещё';
            moreBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          });
        }
      }
      var publicFilmCountry = '';
      function buildPublicCastSkeletonHtml() {
        // Только режиссёр в скелете — строку «Актёры» не рисуем, пока API не подтвердил состав
        // (анимация и т.п. часто без актёров).
        return '<div class="film-cast-skeleton">' +
          '<div class="film-cast-row"><span class="film-cast-label">Режиссёр:</span> <span class="film-cast-skel-line"></span></div>' +
        '</div>';
      }
      function applyPublicCastPayload(d) {
        var root = document.getElementById('film-cast-root') || document.getElementById('film-hero-cast-root');
        if (!root || !d) return;
        var html = buildPublicCastHtml(d.director, d.actors || [], publicFilmCountry);
        root.innerHTML = html || '';
        if (html) bindPublicCastLinks(root);
      }
      function loadPublicCast() {
        var root = document.getElementById('film-cast-root') || document.getElementById('film-hero-cast-root');
        if (!root) return;
        if (root.getAttribute('data-mp-cast-pending') === '1') return;
        if (!root.innerHTML.trim() || root.querySelector('.film-cast-skeleton')) {
          root.innerHTML = buildPublicCastSkeletonHtml();
        }
        root.setAttribute('data-mp-cast-pending', '1');
        apiGet('/api/public/film/' + encodeURIComponent(kpId) + '/cast')
          .then(function (d) {
            root.removeAttribute('data-mp-cast-pending');
            if (!d || !d.success) { return; }
            if (d.director || (d.actors && d.actors.length)) applyPublicCastPayload(d);
            else root.innerHTML = '';
          })
          .catch(function () {
            root.removeAttribute('data-mp-cast-pending');
            var root2 = document.getElementById('film-cast-root') || document.getElementById('film-hero-cast-root');
            if (root2) root2.innerHTML = '';
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
            kpId: kpId,
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
        if (String(pending.kpId) !== String(kpId)) return;
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
          return postPlan({ film_id: d.film_id, kp_id: Number(kpId) });
        });
      }

      function startPlanFlow(place) {
        place = place === 'cinema' ? 'cinema' : 'home';
        if (!token()) {
          openStandalonePlanModal(
            { kp_id: kpId, title: filmTitleForPlan() },
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
      scheduleLoadFacts();
      document.addEventListener('mp:cabinet-full-ready', function onCabinetReady() {
        document.removeEventListener('mp:cabinet-full-ready', onCabinetReady);
        loadPublicCast();
      });
      apiGet('/api/public/film/' + encodeURIComponent(kpId))
        .then(function (data) {
          if (!data || !data.success || !data.film) {
            return;
          }
          var f = data.film;
          publicFilmCountry = f.country || '';
          if (data.cast && (data.cast.director || (data.cast.actors && data.cast.actors.length))) {
            applyPublicCastPayload(data.cast);
          }
          var title = (f.title || 'Фильм') + (f.year ? ' (' + f.year + ')' : '');
          var tEl = document.getElementById('film-title');
          var dEl = document.getElementById('film-desc');
          if (tEl) tEl.textContent = title;
          setFilmDescription(pickFilmDescription(f));
          renderGenreChips(f.genres, f.is_series, f.series_stats);
          if (f.is_series) {
            try { global.__mpFilmPageSeriesKp = kpId; } catch (_e) {}
            var heroSec = document.querySelector('.film-hero-with-tag');
            if (heroSec) heroSec.setAttribute('data-is-series', '1');
          }
          var boot = readMpRouteBoot();
          var posterToApply = f.poster_url;
          if (boot && boot.poster_url && (!cleanPosterUrl(posterToApply) || !isGoodFilmPosterUrl(posterToApply))) {
            posterToApply = boot.poster_url;
          }
          applyFilmPosterEl(posterToApply, kpId);
          setOgFromFilm(f, title);
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
          /* Keep boot/SSR description if public card fetch fails — do not wipe the plot. */
          if (!String(lastFilmDescription || '').trim()) {
            var bootKeep = readMpRouteBoot();
            if (bootKeep && bootKeep.description) setFilmDescription(bootKeep.description);
          }
        });

      function ensureFilm() {
        return fetch(apiBase + '/api/site/add-film', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ kp_id: Number(kpId) })
        }).then(function (r) {
          if (r.status === 401) { loginNow(); return null; }
          return r.json();
        });
      }
      function goCabinet(action) {
        if (action) {
          try { sessionStorage.setItem('mp_public_film_action', String(action) + ':' + kpId); } catch (_) {}
        }
        window.location.href = '/f/' + encodeURIComponent(kpId);
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
        var tagBtn = document.getElementById('film-user-tag-btn');
        if (tagBtn && !token()) {
          tagBtn.setAttribute('title', 'добавить в список');
          tagBtn.addEventListener('click', function () { loginNow('tag'); });
        }
      }
      rebindGuestToolbarActions();
      var loginBtn = document.getElementById('login-btn');
      if (loginBtn) loginBtn.addEventListener('click', function () { loginNow(); });

      function consumePendingAction() {
        try {
          var pending = sessionStorage.getItem('mp_public_film_action') || '';
          if (!pending || pending.split(':')[1] !== kpId || !token()) return;
          sessionStorage.removeItem('mp_public_film_action');
          if (pending.indexOf('plan:') === 0) {
            if (sessionStorage.getItem('mp_pending_guest_plan')) submitPendingGuestPlan();
            else startPlanFlow('home');
          }
          else if (pending.indexOf('add:') === 0) addCurrentFilm();
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
            if (!token()) { rememberAction('rate'); loginNow(); return; }
            togglePanel(rateToggle, ratingPanel);
          });
        }
        loadFilmDescFacts(kpId, document);
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
      }
      setupAppOpenBanner({ id: kpId, kind: 'film' });
      bindPublicFilmToolbar();

      function applyAuthToolbar(filmState) {
        var hero = filmHeroContentRoot(cabinetMode);
        if (!hero) return;
        var old = hero.querySelector('.film-page-toolbar');
        if (old) old.remove();
        var stub = filmState.film || { kp_id: kpId };
        if (!stub.is_series) {
          if (global.__mpFilmPageSeriesKp === kpId) stub.is_series = true;
          else {
            var heroSec = document.querySelector('.film-hero-with-tag[data-is-series="1"]');
            if (heroSec) stub.is_series = true;
          }
        }
        if (!stub.kp_id) stub.kp_id = kpId;
        var toolbarHtml = buildFilmPageToolbar(stub, filmState.toolbarOpts || {});
        hero.insertAdjacentHTML('beforeend', toolbarHtml);
        var newToolbar = hero.querySelector('.film-page-toolbar');
        bindAuthToolbar(stub, filmState);
        bindPublicFilmToolbar(newToolbar, stub);
        loadPublicCast();
        loadFilmFriendsSocialBlock();
        if (!(filmState.toolbarOpts && filmState.toolbarOpts.inBase)) rebindGuestToolbarActions();
      }

      function bindAuthToolbar(film, filmState) {
        filmState = filmState || {};
        var toolbarOpts = filmState.toolbarOpts || {};
        var root = document.querySelector('.film-page-toolbar');
        if (!root) return;
        if (toolbarOpts.inBase && film.film_id) {
          var watchedBtn = root.querySelector('[data-action="toggle-watched"]');
          if (watchedBtn) {
            watchedBtn.addEventListener('click', function () {
              var nextWatched = !film.watched;
              function doToggle() {
                fetch(apiBase + '/api/site/film/' + film.film_id + '/watched', {
                  method: 'POST', headers: authHeaders(), body: JSON.stringify({ watched: nextWatched }),
                }).then(function (r) { return r.json(); }).then(function (d) {
                  if (!d || !d.success) return;
                  film.watched = nextWatched;
                  if (film.is_series && !nextWatched) {
                    film.series_progress = { seasons: [], last_watched: null, next_unwatched: null, catalog_available: true };
                    film.next_episode = null;
                    var tb = document.querySelector('.film-page-toolbar');
                    if (tb) tb._mpSeriesToolbarState = null;
                  }
                  applyAuthToolbar({ film: film, toolbarOpts: filmState.toolbarOpts });
                });
              }
              if (film.watched && !nextWatched) {
                var msg = film.is_series
                  ? 'Снять отметку «просмотрен»? Весь прогресс по сериям будет сброшен. Сериал останется в базе.'
                  : 'Снять отметку «просмотрен»?';
                filmPageConfirmDialog('Снять просмотрен?', msg, { confirmLabel: 'Да, снять' }).then(function (ok) {
                  if (ok) doToggle();
                });
                return;
              }
              doToggle();
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
                  if (d && d.success) { showPublicToast('Оценка сохранена'); filmState.toolbarOpts.myRating = v; applyAuthToolbar(film, filmState); }
                });
              });
            });
          }
          var rem = root.querySelector('[data-action="remove-rating"]');
          if (rem) {
            rem.addEventListener('click', function () {
              fetch(apiBase + '/api/site/film/' + film.film_id + '/rating', { method: 'DELETE', headers: authHeaders() })
                .then(function (r) { return r.json(); }).then(function () {
                  filmState.toolbarOpts.myRating = 0; applyAuthToolbar(film, filmState);
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
        spaReturnPath: '/f/' + kpId,
        kpId: kpId,
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
      mountFilmPageSimilarBlock(kpId, similarRoot);
      try {
        if (!token() && global.MpPublicPromo && typeof global.MpPublicPromo.mountAfterHero === 'function' && similarRoot) {
          global.MpPublicPromo.mountAfterHero(similarRoot);
        }
      } catch (_promoEnd) {}
  }

  function bootstrap(opts) {
    opts = opts || {};
    try {
      document.documentElement.classList.remove('mp-route-pending');
      document.documentElement.classList.add('mp-route-ready');
      if (!opts.cabinetMode) document.body.classList.add('film-standalone-page');
    } catch (_e) {}
    renderFilmPage(opts);
  }

  global.MpFilmPage = {
    bootstrap: bootstrap,
    renderFilmPage: renderFilmPage,
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
