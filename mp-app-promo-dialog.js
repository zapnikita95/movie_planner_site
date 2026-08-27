/**
 * Branded promo dialogs: app download + cinema ticket hints.
 */
(function (global) {
  'use strict';

  var IOS_URL = 'https://apps.apple.com/ru/app/movie-planner/id6769016073';
  var PLAY_URL = 'https://play.google.com/store/apps/details?id=com.movie_planner&hl=ru';
  var RUSTORE_URL = 'https://www.rustore.ru/catalog/app/com.movie_planner';

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function detectPlatform() {
    var ua = global.navigator && global.navigator.userAgent ? global.navigator.userAgent : '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'other';
  }

  function storeBadgesHtml(platform) {
    var ios =
      '<a href="' + IOS_URL + '" class="mp-app-promo-stores__badge" target="_blank" rel="noopener">' +
        '<img src="/images/app-store-badge.svg?v=20260529apple1" alt="Скачать в App Store" width="120" height="40" loading="lazy" decoding="async" />' +
      '</a>';
    var play =
      '<a href="' + PLAY_URL + '" class="mp-app-promo-stores__badge" target="_blank" rel="noopener">' +
        '<img src="/images/google-play-badge.svg?v=20260529play1" alt="Google Play" width="135" height="40" loading="lazy" decoding="async" />' +
      '</a>';
    var rustore =
      '<a href="' + RUSTORE_URL + '" class="mp-app-promo-stores__badge" target="_blank" rel="noopener">' +
        '<img src="/images/rustore-badge.svg?v=20260529rustore1" alt="RuStore" width="135" height="40" loading="lazy" decoding="async" />' +
      '</a>';
    if (platform === 'ios') return '<div class="mp-app-promo-stores">' + ios + '</div>';
    if (platform === 'android') {
      return '<div class="mp-app-promo-stores mp-app-promo-stores--android">' + play + rustore + '</div>';
    }
    return '<div class="mp-app-promo-stores mp-app-promo-stores--all">' + ios + play + rustore + '</div>';
  }

  function showDialog(opts) {
    opts = opts || {};
    var title = opts.title || '';
    var body = opts.body || '';
    var primaryLabel = opts.primaryLabel || 'Понятно';
    var platform = opts.platform || detectPlatform();

    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'mp-dialog-overlay mp-app-promo-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      document.body.style.overflow = 'hidden';
      overlay.innerHTML =
        '<div class="mp-dialog-card mp-app-promo-card">' +
          '<button type="button" class="mp-dialog-close" data-mp-promo-close aria-label="Закрыть">×</button>' +
          (title ? '<h2 class="mp-app-promo-title">' + escapeHtml(title) + '</h2>' : '') +
          '<p class="mp-app-promo-body">' + body + '</p>' +
          '<div class="mp-app-promo-download">' +
            '<div class="mp-app-promo-download__label">Скачать приложение</div>' +
            storeBadgesHtml(platform) +
          '</div>' +
          '<button type="button" class="btn btn-primary btn-full mp-app-promo-ok" data-mp-promo-ok>' +
            escapeHtml(primaryLabel) +
          '</button>' +
        '</div>';

      function close() {
        document.body.style.overflow = '';
        try { overlay.remove(); } catch (_e) {}
        resolve();
      }

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });
      overlay.querySelector('[data-mp-promo-close]').addEventListener('click', close);
      overlay.querySelector('[data-mp-promo-ok]').addEventListener('click', close);
      document.body.appendChild(overlay);
      try { overlay.querySelector('[data-mp-promo-ok]').focus(); } catch (_f) {}
    });
  }

  function showTafishaTicketHint() {
    return showDialog({
      title: 'Билеты на T-Афише',
      body:
        'После покупки билета нажмите «Запланировать просмотр» и выберите «В кино». ' +
        'Билет можно будет добавить к вашему плану, а в приложении Movie Planner вам может прийти ' +
        'напоминание о фильме с билетами.',
      primaryLabel: 'Понятно',
    });
  }

  function showCinemaPlanAppHint() {
    return showDialog({
      title: 'План в кино сохранён',
      body:
        'В приложении Movie Planner вам может прийти напоминание о фильме с билетами ' +
        'перед началом сеанса, чтобы было удобно пройти в зал.',
      primaryLabel: 'Понятно',
    });
  }

  global.MpAppPromoDialog = {
    showDialog: showDialog,
    showTafishaTicketHint: showTafishaTicketHint,
    showCinemaPlanAppHint: showCinemaPlanAppHint,
    detectPlatform: detectPlatform,
  };
})(typeof window !== 'undefined' ? window : globalThis);
