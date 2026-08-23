/**
 * Cookie consent — movie-planner.ru
 * Метрика и реклама (РСЯ) подключаются только после выбора пользователя.
 */
(function (global) {
  'use strict';

  var BUILD = '20260824rsyLayout4';
  var STORAGE_KEY = 'mp_cookie_consent_v1';
  var PRIVACY_URL = '/politika-konfidentsialnosti.html#cookie';

  var state = {
    necessary: true,
    analytics: false,
    ads: false,
  };

  var ui = {
    backdrop: null,
    bar: null,
    settings: null,
    toggleAnalytics: null,
    toggleAds: null,
    btnSettings: null,
  };

  function readStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        necessary: true,
        analytics: !!parsed.analytics,
        ads: !!parsed.ads,
        ts: Number(parsed.ts) || 0,
      };
    } catch (_e) {
      return null;
    }
  }

  function writeStored(consent) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          necessary: true,
          analytics: !!consent.analytics,
          ads: !!consent.ads,
          ts: Date.now(),
        })
      );
    } catch (_e) {}
  }

  function applyState(consent) {
    state.necessary = true;
    state.analytics = !!consent.analytics;
    state.ads = !!consent.ads;
  }

  function dispatchChange() {
    try {
      var ev = new CustomEvent('mp:cookie-consent', {
        detail: {
          necessary: state.necessary,
          analytics: state.analytics,
          ads: state.ads,
        },
      });
      document.dispatchEvent(ev);
    } catch (_e) {}
  }

  function allows(category) {
    if (category === 'necessary') return true;
    if (category === 'analytics') return !!state.analytics;
    if (category === 'ads') return !!state.ads;
    return false;
  }

  function shouldSkipTrackers() {
    try {
      var q = String(global.location && global.location.search || '');
      if (/[?&]e2e=/.test(q)) return true;
      if (sessionStorage.getItem('mp_metrika_skip_e2e') === '1') return true;
    } catch (_e) {}
    var ua = String((global.navigator && global.navigator.userAgent) || '');
    return /HeadlessChrome|Playwright|Puppeteer/i.test(ua);
  }

  function loadScriptOnce(src, flag) {
    if (global[flag]) return;
    global[flag] = true;
    if (document.querySelector('script[src="' + src + '"]')) return;
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    (document.head || document.documentElement).appendChild(s);
  }

  function applyTrackers() {
    if (shouldSkipTrackers()) return;
    if (allows('analytics')) {
      loadScriptOnce('/yandex-metrika.js?v=' + BUILD, '__mpMetrikaLoadRequested');
    }
    if (allows('ads')) {
      loadScriptOnce('/yandex-rsy.js?v=' + BUILD, '__mpRsyLoadRequested');
    }
  }

  function lockScroll() {
    try {
      document.body.style.overflow = 'hidden';
    } catch (_e) {}
  }

  function unlockScroll() {
    try {
      document.body.style.overflow = '';
    } catch (_e) {}
  }

  function closeBanner() {
    if (ui.bar) ui.bar.classList.remove('is-visible');
    if (ui.backdrop) {
      ui.backdrop.classList.remove('is-open');
      ui.backdrop.setAttribute('aria-hidden', 'true');
    }
    unlockScroll();
  }

  function openBanner(withSettings) {
    if (!ui.bar) return;
    ui.bar.classList.add('is-visible');
    if (ui.backdrop) {
      ui.backdrop.classList.add('is-open');
      ui.backdrop.setAttribute('aria-hidden', 'false');
    }
    if (ui.settings) {
      ui.settings.classList.toggle('is-open', !!withSettings);
    }
    if (ui.btnSettings) {
      ui.btnSettings.textContent = withSettings ? 'Свернуть настройки' : 'Настроить cookie';
    }
    if (ui.toggleAnalytics) ui.toggleAnalytics.checked = !!state.analytics;
    if (ui.toggleAds) ui.toggleAds.checked = !!state.ads;
    lockScroll();
  }

  function commit(consent, close) {
    applyState(consent);
    writeStored(consent);
    dispatchChange();
    applyTrackers();
    if (close !== false) closeBanner();
  }

  function saveNecessaryOnly() {
    commit({ analytics: false, ads: false });
  }

  function saveAcceptAll() {
    commit({ analytics: true, ads: true });
  }

  function saveFromSettings() {
    commit({
      analytics: !!(ui.toggleAnalytics && ui.toggleAnalytics.checked),
      ads: !!(ui.toggleAds && ui.toggleAds.checked),
    });
  }

  function bindUi(root) {
    ui.backdrop = root.querySelector('#mp-cookie-backdrop');
    ui.bar = root.querySelector('#mp-cookie-bar');
    ui.settings = root.querySelector('#mp-cookie-settings');
    ui.toggleAnalytics = root.querySelector('#mp-cookie-toggle-analytics');
    ui.toggleAds = root.querySelector('#mp-cookie-toggle-ads');
    ui.btnSettings = root.querySelector('#mp-cookie-btn-settings');

    var btnClose = root.querySelector('#mp-cookie-close');
    var btnNecessary = root.querySelector('#mp-cookie-necessary');
    var btnAccept = root.querySelector('#mp-cookie-accept');
    var btnSave = root.querySelector('#mp-cookie-save');

    if (btnClose) btnClose.addEventListener('click', saveNecessaryOnly);
    if (btnNecessary) btnNecessary.addEventListener('click', saveNecessaryOnly);
    if (btnAccept) btnAccept.addEventListener('click', saveAcceptAll);
    if (btnSave) btnSave.addEventListener('click', saveFromSettings);
    if (ui.btnSettings) {
      ui.btnSettings.addEventListener('click', function () {
        var open = ui.settings && !ui.settings.classList.contains('is-open');
        if (ui.settings) ui.settings.classList.toggle('is-open', open);
        ui.btnSettings.textContent = open ? 'Свернуть настройки' : 'Настроить cookie';
      });
    }
    if (ui.backdrop) {
      ui.backdrop.addEventListener('click', saveNecessaryOnly);
    }
  }

  function mount() {
    if (document.getElementById('mp-cookie-bar')) return;

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="mp-cookie-backdrop" id="mp-cookie-backdrop" aria-hidden="true"></div>' +
      '<div class="mp-cookie-bar" id="mp-cookie-bar" role="dialog" aria-labelledby="mp-cookie-title" aria-describedby="mp-cookie-desc" aria-modal="true">' +
        '<div class="mp-cookie-card">' +
          '<button type="button" class="mp-dialog-close" id="mp-cookie-close" aria-label="Закрыть">×</button>' +
          '<div class="mp-cookie-main">' +
            '<h2 class="mp-cookie-title" id="mp-cookie-title">Cookie</h2>' +
            '<p class="mp-cookie-lead" id="mp-cookie-desc">Сайт использует cookie. Подробнее — в <a href="' + PRIVACY_URL + '">политике конфиденциальности</a>.</p>' +
            '<div class="mp-cookie-actions mp-cookie-actions--row">' +
              '<button type="button" class="mp-cookie-btn mp-cookie-btn-ghost" id="mp-cookie-necessary">Только необходимые</button>' +
              '<button type="button" class="mp-cookie-btn mp-cookie-btn-primary" id="mp-cookie-accept">Принять все</button>' +
            '</div>' +
            '<button type="button" class="mp-cookie-btn mp-cookie-btn-text" id="mp-cookie-btn-settings">Настроить cookie</button>' +
          '</div>' +
          '<div class="mp-cookie-settings" id="mp-cookie-settings" aria-label="Настройки cookie">' +
            '<h3>Категории</h3>' +
            '<div class="mp-cookie-option">' +
              '<div class="mp-cookie-option-text"><strong>Необходимые <span class="mp-cookie-badge">всегда</span></strong><span>Вход, сессия, безопасность.</span></div>' +
              '<label class="mp-cookie-toggle"><input type="checkbox" checked disabled aria-label="Необходимые cookie"><span class="mp-cookie-toggle-track"></span></label>' +
            '</div>' +
            '<div class="mp-cookie-option">' +
              '<div class="mp-cookie-option-text"><strong>Аналитика</strong><span>Статистика посещений и улучшение сервиса.</span></div>' +
              '<label class="mp-cookie-toggle"><input type="checkbox" id="mp-cookie-toggle-analytics" aria-label="Аналитика"><span class="mp-cookie-toggle-track"></span></label>' +
            '</div>' +
            '<div class="mp-cookie-option">' +
              '<div class="mp-cookie-option-text"><strong>Реклама</strong><span>Показ объявлений на сайте.</span></div>' +
              '<label class="mp-cookie-toggle"><input type="checkbox" id="mp-cookie-toggle-ads" aria-label="Реклама"><span class="mp-cookie-toggle-track"></span></label>' +
            '</div>' +
            '<div class="mp-cookie-actions" style="margin-top:12px"><button type="button" class="mp-cookie-btn mp-cookie-btn-primary" id="mp-cookie-save">Сохранить выбор</button></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    while (wrap.firstChild) {
      document.body.appendChild(wrap.firstChild);
    }
    bindUi(document);
  }

  function init() {
    var stored = readStored();
    if (stored) {
      applyState(stored);
      applyTrackers();
      return;
    }
    var run = function () {
      mount();
      openBanner(false);
    };
    if (document.body) run();
    else document.addEventListener('DOMContentLoaded', run);
  }

  global.MpCookieConsent = {
    BUILD: BUILD,
    allows: allows,
    get: function () {
      return {
        necessary: state.necessary,
        analytics: state.analytics,
        ads: state.ads,
      };
    },
    applyTrackers: applyTrackers,
    openSettings: function () {
      mount();
      openBanner(true);
    },
  };

  init();
})(window);
