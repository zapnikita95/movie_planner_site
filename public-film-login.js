(function (global) {
  'use strict';

  var TELEGRAM_BOT_ID = '8554485843';
  var TELEGRAM_BOT_USERNAME = 'movie_planner_bot';
  var cfg = { kpId: '', apiBase: 'https://api.movie-planner.ru', onSuccess: function () {} };
  var pfBotPoll = null;
  var pfBotDeepLink = null;

  function stopPfBotPoll() {
    if (pfBotPoll) {
      clearInterval(pfBotPoll);
      pfBotPoll = null;
    }
  }

  function pollPfBotOnce(code, statusEl) {
    return fetch(cfg.apiBase + '/api/auth/telegram-mobile/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code }),
    })
      .then(function (r) { return r.json(); })
      .then(function (checkData) {
        if (checkData.success && checkData.verified === false) return false;
        if (!checkData.success || !checkData.access) {
          if (checkData.error === 'expired') {
            stopPfBotPoll();
            setStatus(statusEl, 'Время истекло — нажмите 🤖 ещё раз', 'error');
          }
          return false;
        }
        stopPfBotPoll();
        return fetch(cfg.apiBase + '/api/site/session/from-jwt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access: checkData.access }),
        })
          .then(function (r) { return r.json(); })
          .then(function (exchangeData) {
            if (exchangeData.success && exchangeData.token) {
              finishLogin(exchangeData);
              setStatus(statusEl, 'Готово', 'success');
              return true;
            }
            setStatus(statusEl, exchangeData.error || 'Не удалось создать сессию', 'error');
            return true;
          });
      });
  }

  function startPfBotAuth(statusEl, botPanel) {
    stopPfBotPoll();
    pfBotDeepLink = null;
    if (botPanel) botPanel.classList.remove('hidden');
    setStatus(statusEl, 'Открываем Telegram…');
    fetch(cfg.apiBase + '/api/auth/telegram-mobile/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(function (r) { return r.json(); })
      .then(function (startData) {
        if (!startData.success || !startData.code) {
          setStatus(statusEl, 'Не удалось начать вход через бота', 'error');
          return;
        }
        var code = String(startData.code);
        pfBotDeepLink = startData.deep_link
          || ('https://t.me/' + TELEGRAM_BOT_USERNAME + '?start=mobileauth_' + encodeURIComponent(code));
        try { global.open(pfBotDeepLink, '_blank', 'noopener'); } catch (_e) {}
        setStatus(statusEl, 'Нажмите Start в боте — войдём автоматически');
        pfBotPoll = setInterval(function () {
          pollPfBotOnce(code, statusEl).catch(function () {});
        }, 2500);
        pollPfBotOnce(code, statusEl).catch(function () {});
      })
      .catch(function () { setStatus(statusEl, 'Ошибка сети', 'error'); });
  }

  function injectModal() {
    if (document.getElementById('public-login-modal')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="modal hidden" id="public-login-modal" aria-hidden="true">' +
        '<div data-action="close-public-login" style="position:absolute;inset:0;z-index:0;cursor:pointer"></div>' +
        '<div class="modal-content" style="position:relative;z-index:1;max-height:min(90vh,720px);overflow:auto">' +
          '<button type="button" class="modal-close" data-action="close-public-login" aria-label="Закрыть">&times;</button>' +
          '<div class="modal-title">Вход</div>' +
          '<div class="login-oauth-caption">Войти с помощью</div>' +
          '<div class="login-methods-grid" role="group" aria-label="Способы входа">' +
            '<button type="button" class="login-oauth-btn login-oauth-google" id="pf-login-google" title="Google" aria-label="Google">' +
              '<span class="login-oauth-icon login-oauth-icon--google" aria-hidden="true"></span>' +
            '</button>' +
            '<button type="button" class="login-oauth-btn login-oauth-yandex" id="pf-login-yandex" title="Яндекс" aria-label="Яндекс">' +
              '<img src="/images/yandex-id.png" class="login-oauth-img login-oauth-img--yandex" alt="" aria-hidden="true">' +
            '</button>' +
            '<button type="button" class="login-oauth-btn login-oauth-telegram login-tg-widget-wrap" id="pf-login-telegram" title="Telegram" aria-label="Telegram">' +
              '<span class="login-oauth-icon login-oauth-icon--telegram" aria-hidden="true"></span>' +
            '</button>' +
            '<button type="button" class="login-oauth-btn login-oauth-bot" id="pf-login-bot-toggle" title="Войти через Telegram-бота" aria-label="Войти через Telegram-бота">🤖</button>' +
          '</div>' +
          '<label class="login-oauth-privacy">' +
            '<input type="checkbox" id="pf-login-privacy"/>' +
            '<span>Согласен с <a href="/politika-konfidentsialnosti.html" target="_blank" rel="noopener">политикой конфиденциальности</a></span>' +
          '</label>' +
          '<div class="login-privacy-hint" id="pf-login-privacy-hint">Отметьте согласие для Google, Яндекс и Telegram.</div>' +
          '<div id="pf-login-bot-panel" class="login-bot-panel hidden">' +
            '<p class="login-bot-wait-lead">Откроется Telegram-бот. Нажмите «Start» — вход произойдёт автоматически.</p>' +
            '<p class="login-status" id="pf-login-status"></p>' +
            '<button type="button" class="modal-button modal-button-secondary login-bot-reopen" id="pf-login-bot-reopen">Открыть бота ещё раз</button>' +
          '</div>' +
          '<div class="login-email-section">' +
            '<div class="login-email-caption">Войти по почте</div>' +
            '<form id="pf-login-email-form" class="login-email-request-row">' +
              '<input type="email" id="pf-login-email" name="email" placeholder="Email" autocomplete="email" class="modal-input login-email-input">' +
              '<button type="submit" class="modal-button modal-button-primary login-email-send-btn">Код</button>' +
            '</form>' +
            '<p class="login-status" id="pf-login-email-status"></p>' +
            '<form id="pf-login-email-code-form" class="login-email-code-row hidden">' +
              '<input type="text" id="pf-login-email-code" name="code" placeholder="Код из письма" maxlength="8" inputmode="numeric" autocomplete="one-time-code" class="modal-input login-email-code-input">' +
              '<button type="submit" class="modal-button modal-button-primary">Войти</button>' +
              '<button type="button" class="modal-button login-email-back-btn" id="pf-login-email-back">Назад</button>' +
            '</form>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap.firstElementChild);
    bindEvents();
  }

  function $(id) { return document.getElementById(id); }

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'login-status' + (kind ? ' ' + kind : '');
  }

  function getSessions() {
    try { return JSON.parse(localStorage.getItem('mp_site_sessions') || '[]'); } catch (_e) { return []; }
  }

  function saveSession(d) {
    var sessions = getSessions();
    var chatId = String(d.chat_id);
    var row = sessions.find(function (s) { return String(s.chat_id) === chatId; });
    if (row) {
      row.token = d.token;
      row.name = d.name || row.name;
      if (d.has_data !== undefined) row.has_data = !!d.has_data;
      row.is_personal = d.is_personal !== undefined ? !!d.is_personal : true;
    } else {
      sessions.push({
        chat_id: chatId,
        token: d.token,
        name: d.name || 'Профиль',
        has_data: !!d.has_data,
        is_personal: d.is_personal !== undefined ? !!d.is_personal : true,
      });
    }
    localStorage.setItem('mp_site_sessions', JSON.stringify(sessions));
    localStorage.setItem('mp_site_active_chat_id', chatId);
    localStorage.removeItem('mp_site_token');
  }

  function rememberOAuthReturn() {
    try {
      sessionStorage.setItem('mp_oauth_return', window.location.pathname + window.location.search);
    } catch (_e) {}
  }

  function privacyOk() {
    var cb = $('pf-login-privacy');
    return !!(cb && cb.checked);
  }

  function nudgePrivacy() {
    var cb = $('pf-login-privacy');
    if (cb && cb.closest('.login-oauth-privacy')) {
      cb.closest('.login-oauth-privacy').classList.add('needs-attention');
      cb.focus({ preventScroll: true });
      setTimeout(function () {
        cb.closest('.login-oauth-privacy').classList.remove('needs-attention');
      }, 1600);
    }
    var hint = $('pf-login-privacy-hint');
    if (hint) hint.classList.add('is-visible');
  }

  function syncPrivacyLock() {
    var ok = privacyOk();
    ['pf-login-google', 'pf-login-yandex', 'pf-login-telegram'].forEach(function (id) {
      var btn = $(id);
      if (!btn) return;
      btn.classList.toggle('is-locked', !ok);
      btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    });
    var hint = $('pf-login-privacy-hint');
    if (hint) hint.classList.toggle('is-visible', !ok);
  }

  function finishLogin(data) {
    if (!data || !data.token) return;
    saveSession(data);
    close();
    try { cfg.onSuccess(data); } catch (_e) {}
  }

  function startTelegramLogin() {
    if (!privacyOk()) { nudgePrivacy(); return; }
    var width = 550;
    var height = 470;
    var left = Math.max(0, (global.screen.width - width) / 2) + (global.screen.availLeft || 0);
    var top = Math.max(0, (global.screen.height - height) / 2) + (global.screen.availTop || 0);
    var origin = global.location.origin || (global.location.protocol + '//' + global.location.hostname);
    var popupUrl = 'https://oauth.telegram.org/auth?bot_id=' + encodeURIComponent(TELEGRAM_BOT_ID)
      + '&origin=' + encodeURIComponent(origin)
      + '&request_access=write'
      + '&return_to=' + encodeURIComponent(global.location.href);
    var popup = null;
    var onMessage = function (event) {
      if (!popup || event.source !== popup) return;
      var payload = {};
      try { payload = JSON.parse(event.data); } catch (_e) {}
      if (payload && payload.event === 'auth_result' && payload.result) {
        global.removeEventListener('message', onMessage);
        try { popup.close(); } catch (_e) {}
        fetch(cfg.apiBase + '/api/site/auth/telegram-widget', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({}, payload.result, { accept_privacy: true, acceptPrivacy: true })),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d.success && d.token) finishLogin(d);
            else setStatus($('pf-login-status'), d.error || 'Не удалось войти через Telegram', 'error');
          })
          .catch(function () { setStatus($('pf-login-status'), 'Ошибка сети', 'error'); });
      }
    };
    global.addEventListener('message', onMessage);
    popup = global.open(
      popupUrl,
      'telegram_oauth_bot' + TELEGRAM_BOT_ID,
      'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + ',status=0,location=0,menubar=0,toolbar=0'
    );
    if (!popup) {
      global.removeEventListener('message', onMessage);
      setStatus($('pf-login-status'), 'Разрешите всплывающие окна для Telegram', 'error');
    } else {
      popup.focus();
    }
  }

  function bindEvents() {
    var modal = $('public-login-modal');
    if (!modal || modal._pfBound) return;
    modal._pfBound = true;

    document.querySelectorAll('[data-action="close-public-login"]').forEach(function (node) {
      node.addEventListener('click', function () { close(); });
    });

    var priv = $('pf-login-privacy');
    if (priv) priv.addEventListener('change', syncPrivacyLock);
    syncPrivacyLock();

    var g = $('pf-login-google');
    if (g) {
      g.addEventListener('click', function () {
        if (!privacyOk()) { nudgePrivacy(); return; }
        rememberOAuthReturn();
        global.location.href = cfg.apiBase + '/api/site/oauth/google/start?accept=1';
      });
    }
    var y = $('pf-login-yandex');
    if (y) {
      y.addEventListener('click', function () {
        if (!privacyOk()) { nudgePrivacy(); return; }
        rememberOAuthReturn();
        global.location.href = cfg.apiBase + '/api/site/oauth/yandex/start?accept=1';
      });
    }
    var tg = $('pf-login-telegram');
    if (tg) tg.addEventListener('click', function (e) { e.preventDefault(); startTelegramLogin(); });

    var botToggle = $('pf-login-bot-toggle');
    var botPanel = $('pf-login-bot-panel');
    var botReopen = $('pf-login-bot-reopen');
    if (botToggle) {
      botToggle.addEventListener('click', function () {
        startPfBotAuth($('pf-login-status'), botPanel);
      });
    }
    if (botReopen) {
      botReopen.addEventListener('click', function () {
        if (pfBotDeepLink) {
          try { global.open(pfBotDeepLink, '_blank', 'noopener'); } catch (_e) {}
        } else {
          startPfBotAuth($('pf-login-status'), botPanel);
        }
      });
    }

    var emailForm = $('pf-login-email-form');
    var emailCodeForm = $('pf-login-email-code-form');
    var emailInput = $('pf-login-email');
    var emailCodeInput = $('pf-login-email-code');
    if (emailForm) {
      emailForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = ((emailInput && emailInput.value) || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          setStatus($('pf-login-email-status'), 'Укажите корректный email', 'error');
          return;
        }
        setStatus($('pf-login-email-status'), 'Отправляем…');
        fetch(cfg.apiBase + '/api/auth/email/request-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, accept_privacy: true }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (!d.success) {
              setStatus($('pf-login-email-status'), d.error === 'rate_limit' ? 'Слишком часто' : 'Не удалось отправить код', 'error');
              return;
            }
            setStatus($('pf-login-email-status'), 'Код отправлен', 'success');
            emailForm.classList.add('hidden');
            if (emailCodeForm) emailCodeForm.classList.remove('hidden');
            if (emailCodeInput) emailCodeInput.focus();
          })
          .catch(function () { setStatus($('pf-login-email-status'), 'Ошибка сети', 'error'); });
      });
    }
    if (emailCodeForm) {
      emailCodeForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = ((emailInput && emailInput.value) || '').trim().toLowerCase();
        var code = ((emailCodeInput && emailCodeInput.value) || '').trim();
        if (!/^\d{4,8}$/.test(code)) {
          setStatus($('pf-login-email-status'), 'Введите код из письма', 'error');
          return;
        }
        setStatus($('pf-login-email-status'), 'Проверка…');
        fetch(cfg.apiBase + '/api/auth/email/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, code: code }),
        })
          .then(function (r) { return r.json(); })
          .then(function (verify) {
            if (!verify.success || !verify.access) {
              setStatus($('pf-login-email-status'), verify.message || verify.error || 'Неверный код', 'error');
              return;
            }
            return fetch(cfg.apiBase + '/api/site/session/from-jwt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access: verify.access }),
            }).then(function (r) { return r.json(); });
          })
          .then(function (d) {
            if (!d) return;
            if (d.success && d.token) finishLogin(d);
            else setStatus($('pf-login-email-status'), d.error || 'Не удалось создать сессию', 'error');
          })
          .catch(function () { setStatus($('pf-login-email-status'), 'Ошибка сети', 'error'); });
      });
    }
    var emailBack = $('pf-login-email-back');
    if (emailBack) {
      emailBack.addEventListener('click', function () {
        if (emailCodeForm) emailCodeForm.classList.add('hidden');
        if (emailForm) emailForm.classList.remove('hidden');
        if (emailCodeInput) emailCodeInput.value = '';
      });
    }
  }

  function open(action) {
    injectModal();
    if (action) {
      try { sessionStorage.setItem('mp_public_film_action', action + ':' + cfg.kpId); } catch (_e) {}
    }
    var modal = $('public-login-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    stopPfBotPoll();
    var modal = $('public-login-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
  }

  function consumeOAuthHash() {
    try {
      var raw = (location.hash || '').replace(/^#/, '');
      if (!raw || raw.indexOf('token=') < 0 || raw.charAt(0) === '/') return false;
      var params = new URLSearchParams(raw);
      var tok = params.get('token');
      if (!tok) return false;
      try { tok = decodeURIComponent(tok); } catch (_e) {}
      var chatId = params.get('chat_id');
      if (!chatId) return false;
      var name = params.get('name') || 'Профиль';
      try { name = decodeURIComponent(name); } catch (_e) {}
      finishLogin({ token: tok, chat_id: chatId, name: name, has_data: false, is_personal: true });
      history.replaceState({}, '', location.pathname + location.search);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function init(options) {
    cfg = Object.assign(cfg, options || {});
    injectModal();
    consumeOAuthHash();
  }

  global.MpPublicFilmLogin = { init: init, open: open, close: close };
})(window);
