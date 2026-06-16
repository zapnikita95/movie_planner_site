(function (global) {
  'use strict';

  var RUSTORE_URL = 'https://www.rustore.ru/catalog/app/com.movie_planner';
  var IOS_URL = 'https://apps.apple.com/ru/app/movie-planner/id6769016073';

  function headerShellHtml() {
    var search = global.MpFilmPage && typeof MpFilmPage.standaloneHeaderSearchHtml === 'function'
      ? MpFilmPage.standaloneHeaderSearchHtml()
      : (
        '<div class="header-search" id="header-search" role="search">' +
          '<span class="header-search-icon" aria-hidden="true">🔍</span>' +
          '<input type="text" id="header-search-input" class="header-search-input" placeholder="Найти фильм или сериал…" autocomplete="off" aria-label="Поиск">' +
          '<button type="button" class="header-search-mic" id="header-search-mic" aria-label="Голосовой ввод" title="Голосовой ввод">🎤</button>' +
          '<button type="button" class="header-search-clear hidden" id="header-search-clear" aria-label="Очистить">×</button>' +
          '<div class="header-search-dropdown hidden" id="header-search-dropdown" role="listbox"></div>' +
        '</div>'
      );
    return (
      '<div class="header-content">' +
        '<a class="logo" href="/"><img src="/images/icon48.png" alt="Movie Planner"><span>Movie Planner</span></a>' +
        search +
        '<div class="header-buttons">' +
          '<button type="button" class="btn-primary" id="login-btn">Войти</button>' +
        '</div>' +
      '</div>'
    );
  }

  function rustoreBadgeHtml() {
    return (
      '<a href="' + RUSTORE_URL + '" class="footer-store-badge article-store-rustore" data-store="rustore" target="_blank" rel="noopener">' +
        '<img src="/images/rustore-badge.svg?v=20260529rustore1" alt="Скачать в RuStore" width="135" height="40" loading="lazy">' +
      '</a>'
    );
  }

  function upgradeHeader() {
    var header = document.querySelector('.site-header-subpage, #site-header');
    if (!header) return;
    header.id = 'site-header';
    header.className = '';
    header.innerHTML = headerShellHtml();
  }

  function ensureRuStoreInRow(row) {
    if (!row || row.querySelector('[data-store="rustore"]')) return;
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
        '<a href="https://t.me/movie_planner_bot" class="footer-app-mini" target="_blank" rel="noopener">Telegram-бот</a>' +
        '<span class="footer-apps-sep" aria-hidden="true">·</span>' +
        '<a href="https://chromewebstore.google.com/detail/movie-planner-bot/fldeclcfcngcjphhklommcebkpfipdol" class="footer-app-mini" target="_blank" rel="noopener">Расширение Chrome</a>' +
      '</div>'
    );
  }

  function resolveStoreLinks() {
    var androidSel = '#article-cta-android, .footer-store-row a[href="/download"], .footer-store-row a[href="../download"]';
    document.querySelectorAll('.footer-store-row a[href="' + IOS_URL + '"], .footer-store-row a[href*="apps.apple.com"]').forEach(function (a) {
      a.href = IOS_URL;
    });
    fetch('https://api.movie-planner.ru/api/app/release', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rel) {
        if (!rel || !rel.url) return;
        document.querySelectorAll(androidSel).forEach(function (a) { a.href = rel.url; });
      })
      .catch(function () {});
  }

  function initArticleChrome() {
    try {
      document.body.classList.add('film-standalone-page');
      document.body.classList.add('article-standalone-page');
      var wrap = document.querySelector('.content-wrapper.subpage-wrapper');
      if (wrap) wrap.classList.add('page-shell');
    } catch (_e) {}

    upgradeHeader();
    upgradeStoreBadges();
    upgradeFooter();
    resolveStoreLinks();

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
