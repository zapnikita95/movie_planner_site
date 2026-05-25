(function (global) {
  'use strict';

  var TELEGRAM_BOT_USERNAME = 'movie_planner_bot';
  var cfg = {
    kpId: '',
    apiBase: (function () {
      try {
        var loc = global.location;
        var h = loc.hostname || '';
        if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') return loc.protocol + '//' + h;
      } catch (_e) {}
      return 'https://api.movie-planner.ru';
    })(),
    onSuccess: function () {},
  };
  var pfBotPoll = null;
  var pfBotDeepLink = null;

  function pfFetchJson(path, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 20000);
    var opts = Object.assign({ headers: { 'Content-Type': 'application/json' }, signal: controller.signal }, options || {});
    return fetch(cfg.apiBase + path, opts)
      .finally(function () { clearTimeout(timer); })
      .then(function (r) { return r.json(); })
      .catch(function (err) {
        if (err && err.name === 'AbortError') throw err;
        return {};
      });
  }

  function pfNetworkError(err) {
    if (err && err.name === 'AbortError') return 'Сервер не ответил. Попробуйте ещё раз.';
    return 'Ошибка сети';
  }

  function stopPfBotPoll() {
    if (pfBotPoll) {
      clearInterval(pfBotPoll);
      pfBotPoll = null;
    }
  }

  function pollPfBotOnce(code, statusEl) {
    return pfFetchJson('/api/auth/telegram-mobile/check', {
      method: 'POST',
      body: JSON.stringify({ code: code }),
    })
      .then(function (checkData) {
        if (checkData.success && checkData.verified === false) return false;
        if (!checkData.success || !checkData.access) {
          if (checkData.error === 'expired') {
            stopPfBotPoll();
            setStatus(statusEl, 'Время истекло — нажмите Telegram ещё раз', 'error');
          }
          return false;
        }
        stopPfBotPoll();
        return pfFetchJson('/api/site/session/from-jwt', {
          method: 'POST',
          body: JSON.stringify({ access: checkData.access }),
        })
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

  function updatePfBotReopenLink(url) {
    var el = $('login-bot-reopen');
    if (!el) return;
    if (url) {
      el.href = url;
      el.setAttribute('aria-disabled', 'false');
    } else {
      el.href = '#';
      el.setAttribute('aria-disabled', 'true');
    }
  }

  function openPfTelegramLink(url, preOpenedWindow) {
    if (typeof global.MpOpenTelegramLink === 'function') {
      return global.MpOpenTelegramLink(url, preOpenedWindow);
    }
    try {
      if (preOpenedWindow && !preOpenedWindow.closed) {
        preOpenedWindow.location.href = url;
        preOpenedWindow.focus();
        return true;
      }
      return !!global.open(url, '_blank', 'noopener,noreferrer');
    } catch (_e) {
      return false;
    }
  }

  function startPfBotAuth(statusEl, botPanel, preOpenedWindow) {
    stopPfBotPoll();
    pfBotDeepLink = null;
    updatePfBotReopenLink(null);
    if (botPanel) botPanel.classList.remove('hidden');
    setStatus(statusEl, 'Открываем Telegram…');
    pfFetchJson('/api/auth/telegram-mobile/start', { method: 'POST', body: JSON.stringify({}) })
      .then(function (startData) {
        if (!startData.success || !startData.code) {
          if (preOpenedWindow && !preOpenedWindow.closed) {
            try { preOpenedWindow.close(); } catch (_e) {}
          }
          setStatus(statusEl, 'Не удалось начать вход через бота', 'error');
          return;
        }
        var code = String(startData.code);
        pfBotDeepLink = startData.deep_link
          || ('https://t.me/' + TELEGRAM_BOT_USERNAME + '?start=mobileauth_' + encodeURIComponent(code));
        updatePfBotReopenLink(pfBotDeepLink);
        if (!openPfTelegramLink(pfBotDeepLink, preOpenedWindow)) {
          setStatus(statusEl, 'Нажмите «Открыть бота ещё раз»', 'error');
        } else {
          setStatus(statusEl, 'Нажмите Start в боте — войдём автоматически');
        }
        pfBotPoll = setInterval(function () {
          pollPfBotOnce(code, statusEl).catch(function () {});
        }, 2500);
        pollPfBotOnce(code, statusEl).catch(function () {});
      })
      .catch(function (err) {
        if (preOpenedWindow && !preOpenedWindow.closed) {
          try { preOpenedWindow.close(); } catch (_e) {}
        }
        setStatus(statusEl, pfNetworkError(err), 'error');
      });
  }

  function injectModal() {
    if (document.getElementById('login-modal')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="modal hidden" id="login-modal" aria-hidden="true">' +
        '<div data-action="close-login" style="position:absolute;inset:0;z-index:0;cursor:pointer"></div>' +
        '<div class="modal-content" style="position:relative;z-index:1;max-height:min(90vh,720px);overflow:auto">' +
          '<button type="button" class="modal-close" data-action="close-login" aria-label="Закрыть">&times;</button>' +
          '<div class="modal-title">Movie Planner</div>' +
          '<div class="login-auth-tabs" role="tablist" aria-label="Вход и регистрация">' +
            '<button type="button" class="login-auth-tab active" data-login-tab="login" role="tab" aria-selected="true">Вход</button>' +
            '<button type="button" class="login-auth-tab" data-login-tab="register" role="tab" aria-selected="false">Регистрация</button>' +
          '</div>' +
          '<div class="login-auth-pane" id="login-pane-login" data-login-pane="login">' +
            '<div class="login-oauth-caption">Войти с помощью</div>' +
            '<div class="login-methods-grid" role="group" aria-label="Способы входа">' +
              '<button type="button" class="login-oauth-btn login-oauth-google" id="login-oauth-google" title="Google" aria-label="Google">' +
                '<span class="login-oauth-icon login-oauth-icon--google" aria-hidden="true"></span>' +
              '</button>' +
              '<button type="button" class="login-oauth-btn login-oauth-yandex" id="login-oauth-yandex" title="Яндекс" aria-label="Яндекс">' +
                '<img src="/images/yandex-id.png" class="login-oauth-img login-oauth-img--yandex" alt="" aria-hidden="true">' +
              '</button>' +
              '<button type="button" id="login-tg-widget-wrap" class="login-oauth-btn login-oauth-telegram login-tg-widget-wrap login-tg-widget-wrap--locked" title="Telegram" aria-label="Telegram">' +
                '<span class="login-oauth-icon login-oauth-icon--telegram" aria-hidden="true"></span>' +
              '</button>' +
            '</div>' +
            '<label class="login-oauth-privacy">' +
              '<input type="checkbox" id="login-oauth-privacy"/>' +
              '<span>Согласен с <a href="/politika-konfidentsialnosti.html" target="_blank" rel="noopener">политикой конфиденциальности</a></span>' +
            '</label>' +
            '<div class="login-privacy-hint" id="login-privacy-hint">Отметьте согласие, чтобы продолжить вход.</div>' +
            '<div id="login-bot-panel" class="login-bot-panel hidden">' +
              '<p class="login-bot-wait-lead">Откроется Telegram-бот. Нажмите «Start» — вход произойдёт автоматически.</p>' +
              '<p class="login-status" id="login-status"></p>' +
              '<a href="#" id="login-bot-reopen" target="_blank" rel="noopener noreferrer" class="modal-button modal-button-secondary login-bot-reopen">Открыть бота ещё раз</a>' +
            '</div>' +
            '<div class="login-email-section">' +
              '<div class="login-email-caption">Войти по почте</div>' +
              '<form id="login-email-form" class="login-email-request-row">' +
                '<input type="email" id="login-email" name="email" placeholder="Email" autocomplete="email" class="modal-input login-email-input">' +
                '<button type="submit" class="modal-button modal-button-primary login-email-send-btn" id="login-email-request-btn">Код</button>' +
              '</form>' +
              '<p class="login-status" id="login-email-status"></p>' +
              '<form id="login-email-code-form" class="login-email-code-row hidden">' +
                '<input type="text" id="login-email-code" name="code" placeholder="Код из письма" maxlength="8" inputmode="numeric" autocomplete="one-time-code" class="modal-input login-email-code-input">' +
                '<button type="submit" class="modal-button modal-button-primary">Войти</button>' +
                '<button type="button" class="modal-button login-email-back-btn" id="login-email-back-btn">Назад</button>' +
              '</form>' +
            '</div>' +
          '</div>' +
          '<div class="login-auth-pane hidden" id="login-pane-register" data-login-pane="register">' +
            '<div class="login-register-card">' +
              '<div class="login-register-title">Создать аккаунт</div>' +
              '<form id="login-register-form" class="login-register-form">' +
                '<input type="text" id="login-register-name" name="display_name" placeholder="Имя профиля" autocomplete="name" class="modal-input login-register-input">' +
                '<div class="login-email-request-row">' +
                  '<input type="email" id="login-register-email" name="email" placeholder="Email" autocomplete="email" class="modal-input login-email-input">' +
                  '<button type="submit" class="modal-button modal-button-primary login-email-send-btn" id="login-register-request-btn">Код</button>' +
                '</div>' +
                '<label class="login-oauth-privacy login-register-privacy">' +
                  '<input type="checkbox" id="login-register-privacy"/>' +
                  '<span>Согласен с <a href="/politika-konfidentsialnosti.html" target="_blank" rel="noopener">политикой конфиденциальности</a></span>' +
                '</label>' +
                '<p class="login-status" id="login-register-status"></p>' +
              '</form>' +
              '<form id="login-register-code-form" class="login-email-code-row hidden">' +
                '<input type="text" id="login-register-code" name="code" placeholder="Код из письма" maxlength="8" inputmode="numeric" autocomplete="one-time-code" class="modal-input login-email-code-input">' +
                '<button type="submit" class="modal-button modal-button-primary">Завершить</button>' +
                '<button type="button" class="modal-button login-email-back-btn" id="login-register-back-btn">Назад</button>' +
              '</form>' +
              '<div class="login-register-switch">Уже есть аккаунт? <button type="button" data-login-tab-jump="login">Войти</button></div>' +
            '</div>' +
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

  function setLoginTab(tabName) {
    var tab = tabName === 'register' ? 'register' : 'login';
    document.querySelectorAll('[data-login-tab]').forEach(function (btn) {
      var active = btn.getAttribute('data-login-tab') === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-login-pane]').forEach(function (pane) {
      pane.classList.toggle('hidden', pane.getAttribute('data-login-pane') !== tab);
    });
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
    var cb = $('login-oauth-privacy');
    return !!(cb && cb.checked);
  }

  function nudgePrivacy(statusEl) {
    var cb = $('login-oauth-privacy');
    if (cb && cb.closest('.login-oauth-privacy')) {
      cb.closest('.login-oauth-privacy').classList.add('needs-attention');
      cb.focus({ preventScroll: true });
      setTimeout(function () {
        cb.closest('.login-oauth-privacy').classList.remove('needs-attention');
      }, 1600);
    }
    var hint = $('login-privacy-hint');
    if (hint) hint.classList.add('is-visible');
    if (statusEl) setStatus(statusEl, 'Отметьте согласие с политикой конфиденциальности', 'error');
  }

  function syncPrivacyLock() {
    var ok = privacyOk();
    ['login-oauth-google', 'login-oauth-yandex'].forEach(function (id) {
      var btn = $(id);
      if (!btn) return;
      btn.classList.toggle('is-locked', !ok);
      btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    });
    var tgWrap = $('login-tg-widget-wrap');
    if (tgWrap) tgWrap.classList.toggle('login-tg-widget-wrap--locked', !ok);
    var hint = $('login-privacy-hint');
    if (hint) hint.classList.toggle('is-visible', !ok);
  }

  function finishLogin(data) {
    if (!data || !data.token) return;
    saveSession(data);
    close();
    try { cfg.onSuccess(data); } catch (_e) {}
  }

  function applyDisplayName(token, name) {
    var n = (name || '').trim();
    if (!token || !n) return Promise.resolve();
    return fetch(cfg.apiBase + '/api/miniapp/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ display_name: n }),
    }).catch(function () {});
  }

  function bindEvents() {
    var modal = $('login-modal');
    if (!modal || modal._pfBound) return;
    modal._pfBound = true;

    document.querySelectorAll('[data-action="close-login"]').forEach(function (node) {
      node.addEventListener('click', function () { close(); });
    });

    document.querySelectorAll('[data-login-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { setLoginTab(btn.getAttribute('data-login-tab')); });
    });
    document.querySelectorAll('[data-login-tab-jump]').forEach(function (btn) {
      btn.addEventListener('click', function () { setLoginTab(btn.getAttribute('data-login-tab-jump')); });
    });

    var priv = $('login-oauth-privacy');
    if (priv) priv.addEventListener('change', syncPrivacyLock);
    syncPrivacyLock();

    var g = $('login-oauth-google');
    if (g) {
      g.addEventListener('click', function () {
        if (!privacyOk()) { nudgePrivacy(); return; }
        rememberOAuthReturn();
        global.location.href = cfg.apiBase + '/api/site/oauth/google/start?accept=1';
      });
    }
    var y = $('login-oauth-yandex');
    if (y) {
      y.addEventListener('click', function () {
        if (!privacyOk()) { nudgePrivacy(); return; }
        rememberOAuthReturn();
        global.location.href = cfg.apiBase + '/api/site/oauth/yandex/start?accept=1';
      });
    }
    var tg = $('login-tg-widget-wrap');
    var botPanel = $('login-bot-panel');
    if (tg) {
      tg.addEventListener('click', function (e) {
        e.preventDefault();
        if (!privacyOk()) { nudgePrivacy(); return; }
        var tgWin = null;
        try { tgWin = global.open('about:blank', '_blank'); } catch (_e) {}
        startPfBotAuth($('login-status'), botPanel, tgWin);
      });
    }

    var botReopen = $('login-bot-reopen');
    if (botReopen) {
      botReopen.addEventListener('click', function (e) {
        if (pfBotDeepLink) return;
        e.preventDefault();
        var tgWin = null;
        try { tgWin = global.open('about:blank', '_blank'); } catch (_e) {}
        startPfBotAuth($('login-status'), botPanel, tgWin);
      });
    }

    var emailForm = $('login-email-form');
    var emailCodeForm = $('login-email-code-form');
    var emailInput = $('login-email');
    var emailCodeInput = $('login-email-code');
    if (emailForm) {
      emailForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = ((emailInput && emailInput.value) || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          setStatus($('login-email-status'), 'Укажите корректный email', 'error');
          return;
        }
        if (!privacyOk()) {
          nudgePrivacy($('login-email-status'));
          return;
        }
        setStatus($('login-email-status'), 'Отправляем…');
        pfFetchJson('/api/auth/email/request-code', {
          method: 'POST',
          body: JSON.stringify({ email: email, accept_privacy: true }),
        })
          .then(function (d) {
            if (!d.success) {
              setStatus($('login-email-status'), d.error === 'rate_limit' ? 'Слишком часто' : (d.message || 'Не удалось отправить код'), 'error');
              return;
            }
            setStatus($('login-email-status'), 'Код отправлен', 'success');
            emailForm.classList.add('hidden');
            if (emailCodeForm) emailCodeForm.classList.remove('hidden');
            if (emailCodeInput) emailCodeInput.focus();
          })
          .catch(function (err) { setStatus($('login-email-status'), pfNetworkError(err), 'error'); });
      });
    }
    if (emailCodeForm) {
      emailCodeForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = ((emailInput && emailInput.value) || '').trim().toLowerCase();
        var code = ((emailCodeInput && emailCodeInput.value) || '').trim();
        if (!/^\d{4,8}$/.test(code)) {
          setStatus($('login-email-status'), 'Введите код из письма', 'error');
          return;
        }
        setStatus($('login-email-status'), 'Проверка…');
        pfFetchJson('/api/auth/email/verify', {
          method: 'POST',
          body: JSON.stringify({ email: email, code: code }),
        })
          .then(function (verify) {
            if (!verify.success || !verify.access) {
              setStatus($('login-email-status'), verify.message || verify.error || 'Неверный код', 'error');
              return;
            }
            return pfFetchJson('/api/site/session/from-jwt', {
              method: 'POST',
              body: JSON.stringify({ access: verify.access }),
            });
          })
          .then(function (d) {
            if (!d) return;
            if (d.success && d.token) finishLogin(d);
            else setStatus($('login-email-status'), d.error || 'Не удалось создать сессию', 'error');
          })
          .catch(function (err) { setStatus($('login-email-status'), pfNetworkError(err), 'error'); });
      });
    }
    var emailBack = $('login-email-back-btn');
    if (emailBack) {
      emailBack.addEventListener('click', function () {
        if (emailCodeForm) emailCodeForm.classList.add('hidden');
        if (emailForm) emailForm.classList.remove('hidden');
        if (emailCodeInput) emailCodeInput.value = '';
      });
    }

    var regForm = $('login-register-form');
    var regCodeForm = $('login-register-code-form');
    var regName = $('login-register-name');
    var regEmail = $('login-register-email');
    var regCode = $('login-register-code');
    var regPrivacy = $('login-register-privacy');
    var regBtn = $('login-register-request-btn');
    var regBack = $('login-register-back-btn');

    function registrationName() {
      return ((regName && regName.value) || '').trim().slice(0, 80);
    }

    if (regForm) {
      regForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = ((regEmail && regEmail.value) || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          setStatus($('login-register-status'), 'Укажите корректный email', 'error');
          return;
        }
        if (!registrationName()) {
          setStatus($('login-register-status'), 'Укажите имя', 'error');
          return;
        }
        if (!regPrivacy || !regPrivacy.checked) {
          nudgePrivacy($('login-register-status'));
          return;
        }
        if (regBtn) { regBtn.disabled = true; regBtn.textContent = 'Отправляем…'; }
        setStatus($('login-register-status'), '');
        pfFetchJson('/api/auth/email/request-code', {
          method: 'POST',
          body: JSON.stringify({ email: email, accept_privacy: true, acceptPrivacy: true }),
        })
          .then(function (d) {
            if (regBtn) { regBtn.disabled = false; regBtn.textContent = 'Код'; }
            if (!d.success) {
              setStatus($('login-register-status'), d.error === 'rate_limit' ? 'Слишком часто' : (d.message || 'Не удалось отправить код'), 'error');
              return;
            }
            setStatus($('login-register-status'), 'Код отправлен', 'success');
            regForm.classList.add('hidden');
            if (regCodeForm) regCodeForm.classList.remove('hidden');
            if (regCode) regCode.focus();
          })
          .catch(function (err) {
            if (regBtn) { regBtn.disabled = false; regBtn.textContent = 'Код'; }
            setStatus($('login-register-status'), pfNetworkError(err), 'error');
          });
      });
    }

    if (regBack) {
      regBack.addEventListener('click', function () {
        if (regCodeForm) regCodeForm.classList.add('hidden');
        if (regForm) regForm.classList.remove('hidden');
        if (regCode) regCode.value = '';
        setStatus($('login-register-status'), '');
      });
    }

    if (regCodeForm) {
      regCodeForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = ((regEmail && regEmail.value) || '').trim().toLowerCase();
        var code = ((regCode && regCode.value) || '').trim();
        if (!/^\d{4,8}$/.test(code)) {
          setStatus($('login-register-status'), 'Введите код из письма', 'error');
          return;
        }
        setStatus($('login-register-status'), 'Проверка…');
        pfFetchJson('/api/auth/email/verify', {
          method: 'POST',
          body: JSON.stringify({ email: email, code: code }),
        })
          .then(function (verify) {
            if (!verify.success || !verify.access) {
              setStatus($('login-register-status'), verify.message || verify.error || 'Неверный код', 'error');
              return;
            }
            return pfFetchJson('/api/site/session/from-jwt', {
              method: 'POST',
              body: JSON.stringify({ access: verify.access }),
            })
              .then(function (exchange) {
                if (!exchange.success || !exchange.token) {
                  setStatus($('login-register-status'), exchange.error || 'Не удалось создать сессию', 'error');
                  return;
                }
                return applyDisplayName(exchange.token, registrationName()).then(function () {
                  finishLogin(Object.assign({}, exchange, { name: registrationName() || exchange.name }));
                });
              });
          })
          .catch(function (err) { setStatus($('login-register-status'), pfNetworkError(err), 'error'); });
      });
    }
  }

  function open(action) {
    injectModal();
    if (action) {
      try { sessionStorage.setItem('mp_public_film_action', action + ':' + cfg.kpId); } catch (_e) {}
    }
    setLoginTab('login');
    var modal = $('login-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    stopPfBotPoll();
    var modal = $('login-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    var botPanel = $('login-bot-panel');
    if (botPanel) botPanel.classList.add('hidden');
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
