/**
 * Cookie consent — movie-planner.ru
 * Ненавязчивое уведомление: «Хорошо» или продолжение использования = согласие.
 * Метрика и РСЯ подключаются после согласия.
 */
(function (global) {
  'use strict';

  var BUILD = '20260825cookieRsyStrip1';
  var STORAGE_KEY = 'mp_cookie_consent_v1';
  var PRIVACY_URL = '/politika-konfidentsialnosti.html#cookie';

  var state = {
    necessary: true,
    analytics: false,
    ads: false,
  };

  var ui = {
    bar: null,
    settings: null,
    toggleAnalytics: null,
    toggleAds: null,
    btnSettings: null,
  };

  var impliedListenersBound = false;

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
      loadScriptOnce('/yandex-rsy.js?v=20260825takprodamShelf2', '__mpRsyLoadRequested');
    }
  }

  function closeBanner() {
    if (ui.bar) ui.bar.classList.remove('is-visible');
    unbindImpliedConsent();
  }

  function openBanner(withSettings) {
    if (!ui.bar) return;
    ui.bar.classList.add('is-visible');
    if (ui.settings) {
      ui.settings.hidden = !withSettings;
      ui.settings.classList.toggle('is-open', !!withSettings);
    }
    if (ui.btnSettings) {
      ui.btnSettings.textContent = withSettings ? 'Свернуть' : 'Настроить';
      ui.btnSettings.hidden = !!withSettings;
    }
    if (ui.toggleAnalytics) ui.toggleAnalytics.checked = !!state.analytics;
    if (ui.toggleAds) ui.toggleAds.checked = !!state.ads;
    bindImpliedConsent();
  }

  function commit(consent, close) {
    applyState(consent);
    writeStored(consent);
    dispatchChange();
    applyTrackers();
    if (close !== false) closeBanner();
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

  function onImpliedContinue(ev) {
    if (readStored()) return;
    if (ev && ev.target && ev.target.closest && ev.target.closest('#mp-cookie-bar')) return;
    saveAcceptAll();
  }

  function bindImpliedConsent() {
    if (impliedListenersBound || readStored()) return;
    impliedListenersBound = true;
    document.addEventListener('scroll', onImpliedContinue, { passive: true, capture: true });
    document.addEventListener('touchstart', onImpliedContinue, { passive: true, capture: true });
    document.addEventListener('keydown', onImpliedContinue, true);
    document.addEventListener('click', onImpliedContinue, true);
  }

  function unbindImpliedConsent() {
    if (!impliedListenersBound) return;
    impliedListenersBound = false;
    document.removeEventListener('scroll', onImpliedContinue, true);
    document.removeEventListener('touchstart', onImpliedContinue, true);
    document.removeEventListener('keydown', onImpliedContinue, true);
    document.removeEventListener('click', onImpliedContinue, true);
  }

  function bindUi(root) {
    ui.bar = root.querySelector('#mp-cookie-bar');
    ui.settings = root.querySelector('#mp-cookie-settings');
    ui.toggleAnalytics = root.querySelector('#mp-cookie-toggle-analytics');
    ui.toggleAds = root.querySelector('#mp-cookie-toggle-ads');
    ui.btnSettings = root.querySelector('#mp-cookie-btn-settings');

    var btnOk = root.querySelector('#mp-cookie-accept');
    var btnSave = root.querySelector('#mp-cookie-save');

    if (btnOk) btnOk.addEventListener('click', saveAcceptAll);
    if (btnSave) btnSave.addEventListener('click', saveFromSettings);
    if (ui.btnSettings) {
      ui.btnSettings.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var open = ui.settings && !ui.settings.classList.contains('is-open');
        if (ui.settings) {
          ui.settings.hidden = !open;
          ui.settings.classList.toggle('is-open', open);
        }
        ui.btnSettings.textContent = open ? 'Свернуть' : 'Настроить';
        ui.btnSettings.hidden = !!open;
      });
    }
  }

  function mount() {
    if (document.getElementById('mp-cookie-bar')) return;

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="mp-cookie-bar" id="mp-cookie-bar" role="region" aria-labelledby="mp-cookie-title" aria-live="polite">' +
        '<div class="mp-cookie-strip">' +
          '<div class="mp-cookie-strip-text">' +
            '<p class="mp-cookie-line" id="mp-cookie-title">Сайт использует cookie для работы сервиса, статистики и показа рекламы.</p>' +
            '<p class="mp-cookie-line mp-cookie-line--sub" id="mp-cookie-desc">Продолжая пользоваться сайтом, вы соглашаетесь на использование cookie в соответствии с нашими <a href="' + PRIVACY_URL + '">Cookie-правилами</a>.</p>' +
            '<button type="button" class="mp-cookie-btn mp-cookie-btn-text mp-cookie-btn-settings" id="mp-cookie-btn-settings">Настроить</button>' +
          '</div>' +
          '<button type="button" class="mp-cookie-btn mp-cookie-btn-primary mp-cookie-btn-ok" id="mp-cookie-accept">Хорошо</button>' +
        '</div>' +
        '<div class="mp-cookie-settings" id="mp-cookie-settings" aria-label="Настройки cookie" hidden>' +
          '<div class="mp-cookie-settings-inner">' +
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
            '<button type="button" class="mp-cookie-btn mp-cookie-btn-primary" id="mp-cookie-save">Сохранить</button>' +
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
