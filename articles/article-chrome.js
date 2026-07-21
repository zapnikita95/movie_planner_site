(function (global) {
  'use strict';

  var BUILD = '20260721socials1';
  var RUSTORE_URL = 'https://www.rustore.ru/catalog/app/com.movie_planner';
  var IOS_URL_RU = 'https://apps.apple.com/ru/app/movie-planner/id6769016073';
  var IOS_URL_EN = 'https://apps.apple.com/app/movie-planner/id6769016073';
  var SEARCH_SVG =
    '<svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">' +
    '<path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg>';
  var MIC_SVG =
    '<svg class="mp-icon-svg-fallback" width="18" height="18" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">' +
    '<path d="M128,176a48.05,48.05,0,0,0,48-48V64a48,48,0,0,0-96,0v64A48.05,48.05,0,0,0,128,176ZM96,64a32,32,0,0,1,64,0v64a32,32,0,0,1-64,0Zm40,143.83V232a8,8,0,0,1-16,0V207.83A80.09,80.09,0,0,1,48,128a8,8,0,0,1,16,0,64,64,0,0,0,128,0,8,8,0,0,1,16,0A80.09,80.09,0,0,1,136,207.83Z"/></svg>';

  if (!global.__mpMetrikaSite) {
    var ms = document.createElement('script');
    ms.src = '/yandex-metrika.js?v=20260621';
    ms.async = true;
    (document.head || document.documentElement).appendChild(ms);
  }

  function ensureStylesheet(href) {
    if (document.querySelector('link[rel="stylesheet"][href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    (document.head || document.documentElement).appendChild(link);
  }

  function ensureIconAssets(done) {
    ensureStylesheet('https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css');
    ensureStylesheet('https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/duotone/style.css');
    if (global.MPIcons && typeof global.MPIcons.hydrate === 'function') {
      if (done) done();
      return;
    }
    var existing = document.querySelector('script[src*="mp-icons.js"]');
    if (existing) {
      existing.addEventListener('load', function () { if (done) done(); });
      if (global.MPIcons && done) done();
      return;
    }
    var s = document.createElement('script');
    s.src = '/mp-icons.js?v=' + BUILD;
    s.async = true;
    s.onload = function () { if (done) done(); };
    s.onerror = function () { if (done) done(); };
    (document.head || document.documentElement).appendChild(s);
  }

  function ensureSearchChromeIcons() {
    var searchIcon = document.querySelector('#header-search .header-search-icon');
    if (searchIcon && !searchIcon.querySelector('i, svg')) {
      searchIcon.innerHTML = SEARCH_SVG;
    }
    var mic = document.getElementById('header-search-mic');
    if (mic) {
      mic.classList.remove('hidden');
      mic.removeAttribute('hidden');
      /* Always keep a visible SVG: Phosphor <i> alone can render blank if CDN font fails. */
      if (!mic.querySelector('svg')) {
        var ph = mic.querySelector('i');
        if (ph) ph.insertAdjacentHTML('afterend', MIC_SVG);
        else mic.innerHTML = MIC_SVG;
      }
      mic.style.display = 'inline-flex';
      mic.style.visibility = 'visible';
      mic.style.opacity = '1';
    }
  }

  var root = document.documentElement;
  var locale = (root.getAttribute('lang') || 'ru').slice(0, 2);
  if (document.body && document.body.getAttribute('data-mp-article-locale')) {
    locale = document.body.getAttribute('data-mp-article-locale');
  }

  var COPY = {
    ru: {
      'sign-in': 'Войти',
      'open-cabinet': 'Открыть кабинет',
      'cta-lead': 'Попробуйте в приложении или веб-кабинете',
      'sign-in-link': 'Войти в кабинет',
      'home-link': 'На главную',
      'lang-switch': 'English',
      'search-placeholder': 'Найти фильм или сериал…',
      'search-label': 'Поиск',
      'voice-input': 'Голосовой ввод',
      'clear': 'Очистить',
      'download-appstore': 'Скачать в App Store',
      'download-play': 'Скачать в Google Play',
      'download-rustore': 'Скачать в RuStore'
    },
    en: {
      'sign-in': 'Sign in',
      'open-cabinet': 'Open cabinet',
      'cta-lead': 'Try the app or web cabinet',
      'sign-in-link': 'Sign in to cabinet',
      'home-link': 'Home',
      'lang-switch': 'Русский',
      'search-placeholder': 'Search for a film or series…',
      'search-label': 'Search',
      'voice-input': 'Voice search',
      'clear': 'Clear',
      'download-appstore': 'Download on the App Store',
      'download-play': 'Get it on Google Play',
      'download-rustore': 'Get it on RuStore'
    }
  };

  var strings = COPY[locale] || COPY.ru;
  var iosUrl = locale === 'en' ? IOS_URL_EN : IOS_URL_RU;

  function t(key) {
    return strings[key] || COPY.ru[key] || key;
  }

  function hasStoredSiteSession() {
    if (global.MpArticleSessionBoot && typeof MpArticleSessionBoot.hasStoredSiteSession === 'function') {
      return MpArticleSessionBoot.hasStoredSiteSession();
    }
    try {
      var active = localStorage.getItem('mp_site_active_chat_id');
      var sessions = JSON.parse(localStorage.getItem('mp_site_sessions') || '[]');
      if (Array.isArray(sessions)) {
        for (var i = 0; i < sessions.length; i++) {
          if (String(sessions[i].chat_id) === String(active) && sessions[i].token) return true;
        }
        for (var j = 0; j < sessions.length; j++) {
          if (sessions[j] && sessions[j].token) return true;
        }
      }
      return !!localStorage.getItem('mp_site_token');
    } catch (_e) {
      return false;
    }
  }

  function applyChromeCopy() {
    Object.keys(strings).forEach(function (key) {
      document.querySelectorAll('[data-mp-chrome="' + key + '"]').forEach(function (el) {
        el.textContent = strings[key];
      });
    });
    var loginBtn = document.getElementById('login-btn') || document.querySelector('[data-action="login"]');
    if (loginBtn) loginBtn.textContent = t('sign-in');
    var searchInput = document.getElementById('header-search-input');
    if (searchInput) {
      searchInput.placeholder = t('search-placeholder');
      searchInput.setAttribute('aria-label', t('search-label'));
    }
    var mic = document.getElementById('header-search-mic');
    if (mic) {
      mic.setAttribute('aria-label', t('voice-input'));
      mic.setAttribute('title', t('voice-input'));
    }
    var clearBtn = document.getElementById('header-search-clear');
    if (clearBtn) clearBtn.setAttribute('aria-label', t('clear'));
  }

  function headerShellHtml() {
    var search = global.MpFilmPage && typeof MpFilmPage.standaloneHeaderSearchHtml === 'function'
      ? MpFilmPage.standaloneHeaderSearchHtml()
      : (
        '<div class="header-search" id="header-search" role="search">' +
          '<span class="header-search-icon mp-icon" data-mp-icon="search" aria-hidden="true">' + SEARCH_SVG + '</span>' +
          '<input type="text" id="header-search-input" class="header-search-input" placeholder="' + t('search-placeholder') + '" autocomplete="off" aria-label="' + t('search-label') + '">' +
          '<button type="button" class="header-search-mic mp-icon-btn" id="header-search-mic" data-mp-icon="voice" data-mp-icon-weight="duotone" aria-label="' + t('voice-input') + '" title="' + t('voice-input') + '">' + MIC_SVG + '</button>' +
          '<button type="button" class="header-search-clear hidden" id="header-search-clear" aria-label="' + t('clear') + '">×</button>' +
          '<div class="header-search-dropdown hidden" id="header-search-dropdown" role="listbox"></div>' +
        '</div>'
      );
    return (
      '<div class="header-content">' +
        '<a class="logo" href="/"><img src="/images/icon48.png" alt="Movie Planner"><span>Movie Planner</span></a>' +
        search +
        '<div class="header-buttons">' +
          '<button type="button" class="header-login-btn" data-action="login" id="login-btn">' + t('sign-in') + '</button>' +
          '<div class="header-user-wrap hidden account-switcher" id="header-user-wrap" style="position:relative">' +
            '<button type="button" class="header-profile-pill hidden" id="header-profile-pill" aria-label="Профиль">' +
              '<span class="header-profile-avatar" id="header-profile-avatar"></span>' +
              '<span class="header-profile-name" id="header-profile-name"></span>' +
            '</button>' +
            '<div class="header-util-row">' +
              '<button type="button" class="header-inbox-btn" id="header-inbox-btn" aria-label="Уведомления" title="Уведомления">' +
                '<span class="header-inbox-icon" aria-hidden="true">📥</span>' +
              '</button>' +
              '<button type="button" class="header-coins-btn" id="header-coins-btn" aria-label="Монетки">' +
                '<span class="header-coins-sprite"></span><span id="header-coins-val">—</span>' +
              '</button>' +
            '</div>' +
            '<button type="button" class="header-settings-btn" id="header-settings-btn" aria-haspopup="true" aria-expanded="false" title="Настройки">' +
              '<span class="header-settings-btn-icon" aria-hidden="true">⚙️</span><span class="header-settings-btn-text">Настройки</span>' +
            '</button>' +
            '<div class="header-settings-dropdown account-dropdown hidden" id="header-settings-dropdown" role="menu"></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function headerAlreadyModern(header) {
    return !!(header && header.querySelector('#header-search') && header.querySelector('.header-buttons'));
  }

  function upgradeHeader() {
    var header = document.querySelector('.site-header-subpage, #site-header');
    if (!header) return;
    header.id = 'site-header';
    header.className = '';
    if (headerAlreadyModern(header)) {
      if (hasStoredSiteSession()) {
        document.documentElement.classList.add('mp-session', 'mp-auth-boot');
        if (global.MpArticleSessionBoot && typeof MpArticleSessionBoot.paintSessionHeaderStub === 'function') {
          MpArticleSessionBoot.paintSessionHeaderStub(MpArticleSessionBoot.readStoredSession());
        }
      }
      return;
    }
    header.innerHTML = headerShellHtml();
    if (hasStoredSiteSession()) {
      document.documentElement.classList.add('mp-session', 'mp-auth-boot');
      if (global.MpArticleSessionBoot && typeof MpArticleSessionBoot.paintSessionHeaderStub === 'function') {
        MpArticleSessionBoot.paintSessionHeaderStub(MpArticleSessionBoot.readStoredSession());
      }
    }
  }

  function mountArticleNav() {
    if (!global.MpFilmPage) return;
    if (typeof MpFilmPage.mountStandaloneCabinetNav === 'function') {
      MpFilmPage.mountStandaloneCabinetNav('main.subpage-main');
      return;
    }
    if (typeof MpFilmPage.standaloneNavHtml !== 'function') return;
    var shell = document.querySelector('.page-shell');
    var main = shell && shell.querySelector('main.subpage-main');
    if (!shell || !main || document.getElementById('film-standalone-nav')) return;
    var navWrap = document.createElement('div');
    navWrap.innerHTML = MpFilmPage.standaloneNavHtml();
    var navEl = navWrap.firstElementChild;
    if (navEl) shell.insertBefore(navEl, main);
  }

  function rustoreBadgeHtml() {
    return (
      '<a href="' + RUSTORE_URL + '" class="footer-store-badge article-store-rustore" data-store="rustore" target="_blank" rel="noopener">' +
        '<img src="/images/rustore-badge.svg?v=20260529rustore1" alt="' + t('download-rustore') + '" width="135" height="40" loading="lazy">' +
      '</a>'
    );
  }

  function ensureRuStoreInRow(row) {
    if (!row) return;
    // Already has RuStore (by marker or href) — do not inject a duplicate badge.
    if (row.querySelector('[data-store="rustore"], a[href*="rustore.ru"]')) return;
    row.insertAdjacentHTML('beforeend', rustoreBadgeHtml());
  }

  function upgradeStoreBadges() {
    document.querySelectorAll('.footer-store-row').forEach(ensureRuStoreInRow);
  }

  function upgradeFooter() {
    var apps = document.querySelector('.article-footer-apps, #cabinet-footer-apps');
    if (!apps) return;
    apps.className = 'footer-apps-cabinet';
    apps.id = 'cabinet-footer-apps';
    ensureRuStoreInRow(apps.querySelector('.footer-store-row'));
    if (apps.querySelector('.footer-apps-extra')) return;
    apps.insertAdjacentHTML(
      'beforeend',
      '<div class="footer-apps-extra">' +
        '<a href="https://t.me/movie_planner_bot/app" class="footer-app-mini" target="_blank" rel="noopener">Telegram Mini App</a>' +
        '<span class="footer-apps-sep" aria-hidden="true">·</span>' +
        '<a href="https://t.me/movie_planner_bot" class="footer-app-mini" target="_blank" rel="noopener">Telegram bot</a>' +
        '<span class="footer-apps-sep" aria-hidden="true">·</span>' +
        '<a href="https://chromewebstore.google.com/detail/movie-planner-bot/fldeclcfcngcjphhklommcebkpfipdol" class="footer-app-mini" target="_blank" rel="noopener">Chrome extension</a>' +
      '</div>'
    );
  }

  /** Never leave «Мы в соцсетях» with Telegram only — keep IG in sync with main footer. */
  function ensureFooterSocials() {
    var IG_SVG =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>' +
      '</svg>';
    document.querySelectorAll('.footer-social .social-links, footer .social-links').forEach(function (row) {
      if (!row) return;
      if (row.querySelector('a[href*="instagram.com/movie_planner"]')) return;
      row.insertAdjacentHTML(
        'beforeend',
        '<a href="https://instagram.com/movie_planner_bot" target="_blank" rel="noopener" class="social-link" aria-label="Instagram">' +
          IG_SVG +
        '</a>'
      );
    });
  }

  function resolveStoreLinks() {
    var androidSel = '#article-cta-android, #article-cta-android-footer, .footer-store-row a[href="/download"], .footer-store-row a[href="../download"]';
    document.querySelectorAll('.footer-store-row a[href="' + IOS_URL_RU + '"], .footer-store-row a[href="' + IOS_URL_EN + '"], .footer-store-row a[href*="apps.apple.com"]').forEach(function (a) {
      a.href = iosUrl;
    });
    fetch('https://api.movie-planner.ru/api/app/release', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rel) {
        if (!rel || !rel.url) return;
        document.querySelectorAll(androidSel).forEach(function (a) { a.href = rel.url; });
      })
      .catch(function () {});
  }

  function bumpArticleStylesheet() {
    /* Never rewrite an already-versioned stylesheet — swapping ?v= mid-load
       causes a second CSS fetch (FOUC / “bare HTML” flash on refresh). */
    document.querySelectorAll('link[rel="stylesheet"][href*="style-v2"]').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      if (!href || href.indexOf('?v=') !== -1) return;
      link.href = href.split('?')[0] + '?v=' + BUILD;
    });
  }

  function hydrateArticleIcons() {
    try {
      if (global.MPIcons && global.MPIcons.hydrate) {
        var header = document.getElementById('site-header');
        if (header) MPIcons.hydrate(header);
        var nav = document.getElementById('film-standalone-nav');
        if (nav) MPIcons.hydrate(nav);
      }
    } catch (_e) {}
    ensureSearchChromeIcons();
  }

  function initArticleChrome() {
    try {
      document.body.classList.add('film-standalone-page');
      document.body.classList.add('article-standalone-page');
      var wrap = document.querySelector('.content-wrapper.subpage-wrapper');
      if (wrap) wrap.classList.add('page-shell');
    } catch (_e) {}

    bumpArticleStylesheet();
    upgradeHeader();
    ensureSearchChromeIcons();
    mountArticleNav();
    upgradeStoreBadges();
    upgradeFooter();
    ensureFooterSocials();
    applyChromeCopy();
    resolveStoreLinks();
    ensureIconAssets(function () {
      hydrateArticleIcons();
    });

    if (!global.MpFilmPage || typeof MpFilmPage.initStandaloneSiteChrome !== 'function') return;

    MpFilmPage.initStandaloneSiteChrome({
      spaReturnPath: global.location.pathname + global.location.search,
      mainSelector: 'main.subpage-main',
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArticleChrome);
  } else {
    initArticleChrome();
  }
})(typeof window !== 'undefined' ? window : this);
