/**
 * Movie Planner — личный кабинет на сайте
 * Прод: API на поддомене Railway (без GitHub Pages → без ложного 404 для curl).
 */
(function () {
  'use strict';

  const API_BASE = (function () {
    try {
      var h = window.location.hostname || '';
      if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') {
        return 'https://api.movie-planner.ru';
      }
    } catch (e) {}
    return 'https://web-production-3921c.up.railway.app';
  })();
  const BOT_LINK = 'https://t.me/movie_planner_bot';
  const BOT_START_LINK = 'https://t.me/movie_planner_bot?start=start';
  const BOT_CODE_LINK = 'https://t.me/movie_planner_bot?start=code';
  const BOT_SEARCH_LINK = BOT_LINK + '?start=search';
  const BOT_PREMIERES_LINK = BOT_LINK + '?start=premieres';
  const BOT_RANDOM_LINK = BOT_LINK + '?start=random';
  const BOT_SCHEDULE_LINK = BOT_LINK + '?start=schedule';
  let _chromeExtUrl = 'https://chromewebstore.google.com/detail/movie-planner-bot/fldeclcfcngcjphhklommcebkpfipdol?authuser=0&hl=ru';
  const LS_SEARCH_RECENT = 'mp_header_search_recent_v1';
  const LS_FILM_RECENT = 'mp_film_open_recent_v1';
  let cabinetHasData = false;
  let cabinetUserId = null; // user_id текущей сессии (для подсветки «моей» оценки в группах)
  // Состояние TV-подключения (tv_type и токен агента), подгружается после входа.
  let tvSettings = { tv_type: null, agent_token_exists: false, agent_online: false };

  function posterUrl(kpId) {
    if (!kpId) return '';
    return 'https://st.kp.yandex.net/images/film_big/' + String(kpId).replace(/\D/g, '') + '.jpg';
  }

  // Глобальный toast — простое, но заметное уведомление внизу экрана.
  // Использование: showToast('📋 Ссылка скопирована').
  function showToast(message, opts) {
    try {
      let el = document.getElementById('mp-global-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'mp-global-toast';
        el.style.cssText = [
          'position:fixed', 'left:50%', 'bottom:28px', 'transform:translateX(-50%) translateY(20px)',
          'background:rgba(20,20,28,0.95)', 'color:#fff', 'font-size:14px', 'font-weight:500',
          'padding:12px 20px', 'border-radius:14px', 'border:1px solid rgba(255,255,255,0.08)',
          'box-shadow:0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset',
          'opacity:0', 'pointer-events:none', 'z-index:99999',
          'transition:opacity 200ms ease, transform 200ms ease', 'max-width:88vw', 'text-align:center',
        ].join(';');
        document.body.appendChild(el);
      }
      el.textContent = message || '';
      if (opts && opts.type === 'error') {
        el.style.background = 'rgba(120,30,30,0.95)';
      } else {
        el.style.background = 'rgba(20,20,28,0.95)';
      }
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(0)';
      });
      clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(-50%) translateY(20px)';
      }, (opts && opts.duration) || 2400);
    } catch (_) {}
  }

  // Копирование в clipboard с фолбэком на execCommand — работает даже
  // когда navigator.clipboard недоступен (иногда в http/iframe).
  /** Публичный base URL для Bearer/curl (совпадает с API_BASE на проде). */
  function getPublicApiBase() {
    try {
      const h = window.location.hostname;
      if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') {
        return 'https://api.movie-planner.ru';
      }
    } catch (_) {}
    return API_BASE;
  }

  function copyToClipboard(text) {
    if (!text) return Promise.reject(new Error('no text'));
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(String(text));
    }
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = String(text);
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand failed'));
      } catch (e) { reject(e); }
    });
  }

  const STORAGE_SESSIONS = 'mp_site_sessions';
  const STORAGE_ACTIVE = 'mp_site_active_chat_id';
  const MAX_PERSONAL = 2;
  const MAX_GROUP = 2;

  function getSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_SESSIONS);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function setSessions(sessions) {
    localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(sessions));
  }

  function getActiveChatId() {
    return localStorage.getItem(STORAGE_ACTIVE);
  }

  function getActiveSession() {
    const sessions = getSessions();
    const active = getActiveChatId();
    return sessions.find((s) => String(s.chat_id) === String(active)) || null;
  }

  function setActiveChatId(chatId) {
    if (chatId != null && chatId !== '') localStorage.setItem(STORAGE_ACTIVE, String(chatId));
    else localStorage.removeItem(STORAGE_ACTIVE);
  }

  function getToken() {
    const sessions = getSessions();
    const active = getActiveChatId();
    const session = sessions.find((s) => String(s.chat_id) === String(active));
    return session ? session.token : null;
  }

  function removeSessionByToken(token) {
    const sessions = getSessions();
    const removed = sessions.find((s) => s.token === token);
    const active = getActiveChatId();
    const wasActive = removed && String(removed.chat_id) === String(active);
    const next = sessions.filter((s) => s.token !== token);
    setSessions(next);
    if (wasActive) {
      if (next.length) setActiveChatId(next[0].chat_id);
      else setActiveChatId(null);
    }
  }

  function api(url, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + url, { ...options, headers }).then((r) => {
      if (r.status === 401 && token) {
        removeSessionByToken(token);
        if (!getActiveChatId()) window.dispatchEvent(new CustomEvent('mp:logout'));
      }
      return r.json().catch(() => ({}));
    });
  }

  function apiPublic(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    return fetch(API_BASE + url, { ...options, headers }).then((r) => r.json().catch(() => ({})));
  }

  function filmDeepLink(filmId, kpId, isSeries) {
    const chatId = getActiveChatId();
    const session = getActiveSession();
    const isPersonal = session ? session.is_personal : true;
    if (isPersonal === false && chatId) {
      return `${BOT_LINK}?start=g${chatId}_${filmId}`;
    }
    return `${BOT_LINK}?start=view_film_${filmId}`;
  }

  function planDeepLink() {
    return BOT_START_LINK;
  }

  function getStatsScrollTopOffset() {
    const header = document.getElementById('site-header');
    if (!header || header.classList.contains('hidden')) return 16;
    return (header.offsetHeight || 0) + 12;
  }

  /** Считаем абсолютное расстояние от верха документа через offsetParent-цепочку —
   *  getBoundingClientRect().top + scrollY даёт ошибки при css scroll-behavior:smooth. */
  function getDocumentOffsetTop(el) {
    let top = 0;
    let curr = el;
    while (curr && curr !== document.body && curr !== document.documentElement) {
      top += curr.offsetTop || 0;
      curr = curr.offsetParent;
    }
    return top;
  }

  function scrollToStatsSection(el) {
    if (!el) return;
    const top = getDocumentOffsetTop(el) - getStatsScrollTopOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  // ——— UI: шапка, выпадающее меню аккаунтов ———
  function closeAccountDropdown() {
    const dd = document.getElementById('header-settings-dropdown');
    const settingsBtn = document.getElementById('header-settings-btn');
    if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'false');
    if (dd) { dd.classList.add('hidden'); dd.classList.remove('open'); }
  }

  function openAccountDropdown() {
    const dd = document.getElementById('header-settings-dropdown');
    const settingsBtn = document.getElementById('header-settings-btn');
    if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'true');
    if (!dd) return;
    const extUrl = typeof _chromeExtUrl !== 'undefined' && _chromeExtUrl ? _chromeExtUrl
      : 'https://chromewebstore.google.com/detail/movie-planner-bot/fldeclcfcngcjphhklommcebkpfipdol?authuser=0&hl=ru';
    let topNav = '<div class="header-dropdown-title">Перейти</div>';
    topNav += '<button type="button" class="header-settings-nav-item" data-settings-go="tv">📺 Телевизор</button>';
    topNav += '<button type="button" class="header-settings-nav-item" data-settings-go="groups">👥 Друзья и группы</button>';
    topNav += '<a class="header-settings-nav-item header-settings-nav-item--external" id="header-settings-ext-link" href="' + escapeHtml(extUrl) + '" target="_blank" rel="noopener">💻 Расширение для Chrome</a>';
    topNav += '<button type="button" class="header-settings-nav-item" data-settings-go="about">ℹ️ О проекте</button>';
    topNav += '<button type="button" class="header-settings-nav-item" data-settings-go="settings">⚙️ Все настройки на сайте</button>';
    topNav += '<div class="header-dropdown-divider"></div>';
    const sessions = getSessions();
    const activeId = getActiveChatId();
    const personalCount = sessions.filter((s) => s.is_personal).length;
    const groupCount = sessions.filter((s) => !s.is_personal).length;
    const canAddPersonal = personalCount < MAX_PERSONAL;
    const canAddGroup = groupCount < MAX_GROUP;
    const canAdd = sessions.length < MAX_PERSONAL + MAX_GROUP && (canAddPersonal || canAddGroup);

    let html = topNav;
    if (sessions.length) {
      html += '<div class="header-dropdown-title">Текущие входы</div>';
      sessions.forEach((s) => {
        const isActive = String(s.chat_id) === String(activeId);
        const typeLabel = s.is_personal ? 'личный' : 'группа';
        const name = escapeHtml(s.name || 'Кабинет');
        html += '<div class="header-dropdown-account' + (isActive ? ' is-active' : '') + '" data-chat-id="' + escapeHtml(String(s.chat_id)) + '">';
        html += '<div class="header-dropdown-account-line">';
        html += '<span class="header-dropdown-account-name">' + name + '<span class="header-dropdown-account-type"> (' + typeLabel + ')</span></span>';
        html += '<button type="button" class="header-dropdown-account-remove" data-chat-id="' + escapeHtml(String(s.chat_id)) + '" aria-label="Убрать вход">×</button>';
        html += '</div></div>';
      });
      html += '<div class="header-dropdown-divider"></div>';
    }
    html += '<button type="button" class="header-dropdown-add' + (canAdd ? '' : ' disabled') + '" data-action="add-account"' + (canAdd ? '' : ' disabled') + '>+ Добавить вход</button>';
    if (sessions.length) {
      html += '<div class="header-dropdown-divider"></div>';
      html += '<button type="button" class="header-dropdown-logout" data-action="logout-all">Выйти из всех</button>';
    }
    dd.innerHTML = html;

    dd.querySelectorAll('[data-settings-go]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const go = btn.getAttribute('data-settings-go');
        closeAccountDropdown();
        if (go === 'tv') { showSection('tv'); if (typeof renderTvSection === 'function') renderTvSection(); return; }
        if (go === 'groups') { showSection('groups'); if (typeof renderGroupsSection === 'function') renderGroupsSection(); return; }
        if (go === 'about') { showSection('about'); return; }
        if (go === 'settings') { showSection('settings'); if (typeof renderSettingsSection === 'function') renderSettingsSection(); }
      });
    });

    dd.querySelectorAll('.header-dropdown-account').forEach((el) => {
      const chatId = el.getAttribute('data-chat-id');
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('header-dropdown-account-remove')) return;
        setActiveChatId(chatId);
        closeAccountDropdown();
        loadMeAndShowCabinet();
      });
    });
    dd.querySelectorAll('.header-dropdown-account-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chatId = btn.getAttribute('data-chat-id');
        const sessions = getSessions().filter((s) => String(s.chat_id) !== String(chatId));
        const wasActive = String(getActiveChatId()) === String(chatId);
        setSessions(sessions);
        if (sessions.length) {
          if (wasActive) {
            setActiveChatId(sessions[0].chat_id);
            loadMeAndShowCabinet();
          }
        } else {
          setActiveChatId(null);
          renderHeader(null);
          showScreen('landing');
        }
        closeAccountDropdown();
      });
    });
    const addBtn = dd.querySelector('[data-action="add-account"]');
    if (addBtn && canAdd) {
      addBtn.addEventListener('click', () => {
        closeAccountDropdown();
        document.getElementById('login-modal')?.classList.remove('hidden');
      });
    }
    const logoutAllBtn = dd.querySelector('[data-action="logout-all"]');
    if (logoutAllBtn) {
      logoutAllBtn.addEventListener('click', () => {
        setSessions([]);
        setActiveChatId(null);
        closeAccountDropdown();
        renderHeader(null);
        showScreen('landing');
      });
    }
    dd.classList.remove('hidden');
    dd.classList.add('open');
  }

  function renderHeader(me) {
    const header = document.getElementById('site-header');
    if (!header) return;
    const loginBtn = header.querySelector('[data-action="login"]');
    const userWrap = document.getElementById('header-user-wrap');
    if (me && me.name) {
      if (loginBtn) loginBtn.classList.add('hidden');
      if (userWrap) userWrap.classList.remove('hidden');
    } else {
      if (loginBtn) loginBtn.classList.remove('hidden');
      if (userWrap) userWrap.classList.add('hidden');
    }
    closeAccountDropdown();
  }

  function showScreen(screenId) {
    ['landing', 'cabinet-readonly', 'cabinet-onboarding', 'public-stats'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    const header = document.getElementById('site-header');
    if (header) header.classList.toggle('hidden', screenId === 'public-stats');
    const target = document.getElementById(screenId);
    if (target) target.classList.remove('hidden');
    const inCabinet = (screenId === 'cabinet-readonly' || screenId === 'cabinet-onboarding');
    document.body.classList.toggle('in-cabinet', inCabinet);
    document.body.classList.toggle('in-public-stats', screenId === 'public-stats');
    const hs = document.getElementById('header-search');
    if (hs) hs.classList.toggle('hidden', !(screenId === 'cabinet-readonly'));
  }

  // P4.3: маппинг между разделами кабинета и URL-путями
  const SECTION_TO_PATH = {
    home: '/home',
    plans: '/plans',
    unwatched: '/watchlist',
    series: '/series',
    whattowatch: '/whattowatch',
    shazam: '/shazam',
    ratings: '/ratings',
    stats: '/stats',
    premieres: '/premieres',
    groups: '/groups',
    tv: '/tv',
    about: '/about',
    settings: '/settings',
  };
  const PATH_TO_SECTION = Object.fromEntries(Object.entries(SECTION_TO_PATH).map(([k, v]) => [v, k]));

  function sectionFromPath(pathname) {
    if (!pathname) return null;
    const normalized = pathname.replace(/\/$/, '') || '/';
    if (normalized === '/') return 'home';
    return PATH_TO_SECTION[normalized] || null;
  }

  const _filmPathRe = /^\/film\/(\d+)(?:\/?)?$/;
  const DEFAULT_DOC_TITLE = typeof document !== 'undefined' && document.title ? document.title : 'Movie Planner';
  function filmIdFromPathname(pathname) {
    if (!pathname) return null;
    const p = (pathname || '').split('?')[0].replace(/\/$/, '') || '/';
    const m = p.match(_filmPathRe);
    return m ? parseInt(m[1], 10) : null;
  }
  function isFilmPageOpen() {
    const s = document.getElementById('section-film');
    return s && !s.classList.contains('hidden');
  }
  function getFilmRenderRoot() {
    if (isFilmPageOpen()) {
      return document.getElementById('film-page-content') || document.getElementById('film-modal-content');
    }
    return document.getElementById('film-modal-content');
  }
  function showFilmPageLayout() {
    const ro = document.getElementById('cabinet-readonly');
    if (!ro || ro.classList.contains('hidden')) return;
    ro.querySelectorAll('.cabinet-section').forEach((el) => {
      el.classList.toggle('hidden', el.id !== 'section-film');
    });
    ro.querySelectorAll('.cabinet-nav .cabinet-nav-btn').forEach((b) => b.classList.remove('active'));
  }
  function setFilmPageToolbar(film) {
    const t = document.getElementById('film-page-toolbar-title');
    const k = document.getElementById('film-page-kicker');
    if (t) t.textContent = (film && (film.title || 'Фильм')) || 'Загрузка…';
    if (k) k.textContent = film && film.is_series ? '📺 Сериал' : '🎬 Фильм';
  }
  function restoreDocumentTitle() {
    try { document.title = DEFAULT_DOC_TITLE; } catch (_) {}
  }

  function pushSectionUrl(sectionId, replace) {
    try {
      const path = SECTION_TO_PATH[sectionId] || '/';
      const url = path + window.location.search + window.location.hash;
      if (replace) {
        window.history.replaceState({ section: sectionId }, '', url);
      } else if (window.location.pathname !== path) {
        window.history.pushState({ section: sectionId }, '', url);
      }
    } catch (_) {}
  }

  function showSection(sectionId, opts) {
    const options = opts || {};
    const readonly = document.getElementById('cabinet-readonly');
    const onboarding = document.getElementById('cabinet-onboarding');
    let rendered = false;
    let tShown = null;
    if (readonly && !readonly.classList.contains('hidden')) {
      readonly.querySelectorAll('.cabinet-section').forEach((el) => el.classList.add('hidden'));
      const t = readonly.querySelector('#section-' + sectionId);
      if (t) t.classList.remove('hidden');
      tShown = t;
      readonly.querySelectorAll('.cabinet-nav button').forEach((b) => {
        b.classList.remove('active');
        if (b.getAttribute('data-section') === sectionId) b.classList.add('active');
      });
      rendered = true;
    } else if (onboarding && !onboarding.classList.contains('hidden')) {
      onboarding.querySelectorAll('.cabinet-section').forEach((el) => el.classList.add('hidden'));
      const t = onboarding.querySelector('#section-' + sectionId);
      if (t) t.classList.remove('hidden');
      tShown = t;
      onboarding.querySelectorAll('.cabinet-nav button').forEach((b) => {
        b.classList.remove('active');
        if (b.getAttribute('data-section') === sectionId) b.classList.add('active');
      });
      rendered = true;
    }
    if (rendered && tShown && tShown.id && tShown.id !== 'section-film') {
      _filmModalCurrentId = null;
      try { restoreDocumentTitle(); } catch (e) {}
    }
    if (rendered && !options.skipPush && SECTION_TO_PATH[sectionId]) {
      pushSectionUrl(sectionId, !!options.replace);
    }
    if (rendered && sectionId === 'home') {
      try { scheduleHomeDashboardRefresh(); } catch (_) {}
    }
    if (rendered && sectionId === 'shazam') {
      try {
        const ta = document.getElementById('home-shazam-query');
        if (ta) setTimeout(function () { ta.focus(); }, 0);
      } catch (_) {}
    }
  }

  // ——— Вход по коду ———
  function bindLogin() {
    const modal = document.getElementById('login-modal');
    const openBtn = document.querySelector('[data-action="login"]');
    const closeElements = document.querySelectorAll('[data-action="close-login"]');
    const form = document.getElementById('login-form');
    const status = document.getElementById('login-status');

    if (openBtn) openBtn.addEventListener('click', () => modal && modal.classList.remove('hidden'));
    closeElements.forEach((el) => el.addEventListener('click', () => modal && modal.classList.add('hidden')));

    // P4.2: переключение табов Telegram / Email
    const tabButtons = document.querySelectorAll('.login-tab-btn');
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-login-tab');
        tabButtons.forEach((b) => {
          const active = b.getAttribute('data-login-tab') === target;
          b.classList.toggle('active', active);
          b.style.background = active ? 'rgba(255,255,255,0.08)' : 'transparent';
          b.style.color = active ? '#fff' : '#aab';
        });
        document.querySelectorAll('.login-tab-panel').forEach((p) => p.classList.add('hidden'));
        const panel = document.getElementById('login-tab-' + target);
        if (panel) panel.classList.remove('hidden');
      });
    });

    bindEmailLogin();

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = (form.code && form.code.value || '').trim().toUpperCase();
        if (!code) {
          if (status) { status.textContent = 'Введите код'; status.className = 'login-status error'; }
          return;
        }
        if (status) { status.textContent = 'Проверка...'; status.className = 'login-status'; }
        const data = await api('/api/site/validate', { method: 'POST', body: JSON.stringify({ code: code }) });
        if (data.success && data.token) {
          const sessions = getSessions();
          const isPersonal = !!data.is_personal;
          const chatId = String(data.chat_id);
          const existing = sessions.find((s) => String(s.chat_id) === chatId);
          if (existing) {
            existing.token = data.token;
            existing.name = data.name;
            existing.has_data = data.has_data;
            existing.is_personal = isPersonal;
            setSessions(sessions);
          } else {
            const personalCount = sessions.filter((s) => s.is_personal).length;
            const groupCount = sessions.filter((s) => !s.is_personal).length;
            if (isPersonal && personalCount >= MAX_PERSONAL) {
              if (status) { status.textContent = 'Максимум 2 личных кабинета'; status.className = 'login-status error'; }
              return;
            }
            if (!isPersonal && groupCount >= MAX_GROUP) {
              if (status) { status.textContent = 'Максимум 2 групповых кабинета'; status.className = 'login-status error'; }
              return;
            }
            sessions.push({ chat_id: chatId, token: data.token, name: data.name, has_data: data.has_data, is_personal: isPersonal });
            setSessions(sessions);
          }
          setActiveChatId(chatId);
          if (status) { status.textContent = 'Успешно!'; status.className = 'login-status success'; }
          setTimeout(() => {
            modal.classList.add('hidden');
            loadMeAndShowCabinet();
          }, 500);
        } else {
          if (status) { status.textContent = data.error || 'Неверный код'; status.className = 'login-status error'; }
        }
      });
    }
  }

  // P4.2: email-логин на сайте — переиспользуем mobile /api/auth/email/*
  // и обмениваем полученный JWT на site_session через /api/site/session/from-jwt
  function bindEmailLogin() {
    const modal = document.getElementById('login-modal');
    const reqForm = document.getElementById('login-email-form');
    const codeForm = document.getElementById('login-email-code-form');
    const emailInput = document.getElementById('login-email');
    const codeInput = document.getElementById('login-email-code');
    const statusEl = document.getElementById('login-email-status');
    const codeHint = document.getElementById('login-email-code-hint');
    const reqBtn = document.getElementById('login-email-request-btn');
    const backBtn = document.getElementById('login-email-back-btn');

    function setStatus(text, kind) {
      if (!statusEl) return;
      statusEl.textContent = text || '';
      statusEl.className = 'login-status' + (kind ? ' ' + kind : '');
    }

    if (reqForm) {
      reqForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = (emailInput && emailInput.value || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          setStatus('Укажите корректный email', 'error');
          return;
        }
        if (reqBtn) { reqBtn.disabled = true; reqBtn.textContent = 'Отправляем…'; }
        setStatus('');
        try {
          const resp = await fetch(API_BASE + '/api/auth/email/request-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const data = await resp.json().catch(() => ({}));
          if (reqBtn) { reqBtn.disabled = false; reqBtn.textContent = 'Отправить код'; }
          if (!data.success) {
            setStatus(data.error === 'rate_limit' ? 'Слишком часто. Попробуйте через минуту.' : 'Не удалось отправить код. Проверьте email и повторите.', 'error');
            return;
          }
          if (codeHint) codeHint.textContent = 'Код отправлен на ' + email + '. Проверьте почту.';
          reqForm.classList.add('hidden');
          if (codeForm) codeForm.classList.remove('hidden');
          if (codeInput) setTimeout(() => codeInput.focus(), 100);
        } catch (_) {
          if (reqBtn) { reqBtn.disabled = false; reqBtn.textContent = 'Отправить код'; }
          setStatus('Ошибка сети. Попробуйте ещё раз.', 'error');
        }
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (codeForm) codeForm.classList.add('hidden');
        if (reqForm) reqForm.classList.remove('hidden');
        if (codeInput) codeInput.value = '';
      });
    }

    if (codeForm) {
      codeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = (emailInput && emailInput.value || '').trim().toLowerCase();
        const code = (codeInput && codeInput.value || '').trim();
        if (!/^\d{4,8}$/.test(code)) {
          setStatus('Введите код из письма', 'error');
          return;
        }
        setStatus('Проверка…');
        try {
          const verifyResp = await fetch(API_BASE + '/api/auth/email/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code }),
          });
          const verifyData = await verifyResp.json().catch(() => ({}));
          if (!verifyData.success || !verifyData.access) {
            setStatus(verifyData.message || verifyData.error || 'Неверный код', 'error');
            return;
          }
          const exchangeResp = await fetch(API_BASE + '/api/site/session/from-jwt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access: verifyData.access }),
          });
          const exchangeData = await exchangeResp.json().catch(() => ({}));
          if (!exchangeData.success || !exchangeData.token) {
            setStatus(exchangeData.error || 'Не удалось создать сессию', 'error');
            return;
          }
          const sessions = getSessions();
          const chatId = String(exchangeData.chat_id);
          const existing = sessions.find((s) => String(s.chat_id) === chatId);
          if (existing) {
            existing.token = exchangeData.token;
            existing.name = exchangeData.name;
            existing.is_personal = true;
          } else {
            sessions.push({
              chat_id: chatId,
              token: exchangeData.token,
              name: exchangeData.name,
              has_data: false,
              is_personal: true,
              email: exchangeData.email || email,
            });
          }
          setSessions(sessions);
          setActiveChatId(chatId);
          setStatus('Добро пожаловать!', 'success');
          setTimeout(() => {
            if (modal) modal.classList.add('hidden');
            loadMeAndShowCabinet();
          }, 400);
        } catch (_) {
          setStatus('Ошибка сети. Попробуйте ещё раз.', 'error');
        }
      });
    }
  }

  function loadMeAndShowCabinet() {
    api('/api/site/me').then((me) => {
      if (!me.success) {
        showScreen('landing');
        renderHeader(null);
        return;
      }
      cabinetHasData = !!me.has_data;
      cabinetUserId = me.user_id || null;
      renderHeader(me);
      updateProfileSwitcherUI(me);
      loadExtensionConfig();
      loadTvSettings();
      try {
        const pending = localStorage.getItem('mp_pending_invite_token');
        if (pending) {
          localStorage.removeItem('mp_pending_invite_token');
          showInviteConfirmModal(pending);
        }
      } catch (_) {}
      if (me.has_data) {
        showScreen('cabinet-readonly');
        loadPlans();
        loadUnwatched();
        loadSeries();
        loadRatings();
        // P4.3: deep-link — страница фильма /film/:id или раздел
        const pathFid = filmIdFromPathname(window.location.pathname);
        if (pathFid) {
          openFilmPage(pathFid, { skipHistory: true, replace: true });
        } else {
          const deepSection = sectionFromPath(window.location.pathname);
          if (deepSection) {
            showSection(deepSection, { replace: true, skipPush: false });
            if (deepSection === 'tv') { try { renderTvSection && renderTvSection(); } catch (_) {} }
            if (deepSection === 'premieres') { try { renderPremieresSection && renderPremieresSection(); } catch (_) {} }
            if (deepSection === 'groups') { try { renderGroupsSection && renderGroupsSection(); } catch (_) {} }
            if (deepSection === 'whattowatch') { try { renderWhattowatchSection && renderWhattowatchSection(); } catch (_) {} }
            if (deepSection === 'settings') { try { renderSettingsSection && renderSettingsSection(); } catch (_) {} }
          } else {
            showSection('home', { replace: true });
          }
        }
        // Если открыта вкладка статистики — перезагрузить её
        const statsSection = document.getElementById('section-stats');
        if (statsSection && !statsSection.classList.contains('hidden') && pathFid == null) {
          initStatsSelectors();
          const monthEl = document.getElementById('stats-month');
          const yearEl = document.getElementById('stats-year');
          const now = new Date();
          (function () { const g = window._getStatsMonthYear ? window._getStatsMonthYear() : (function () { const y = document.getElementById('stats-year'); const p = document.getElementById('stats-month-pills'); const a = p && p.querySelector('.month-pill.active'); const m = a ? parseInt(a.getAttribute('data-month'), 10) : now.getMonth() + 1; return { m, y: y ? parseInt(y.value, 10) : now.getFullYear() }; })(); loadStats(g.m, g.y); })();
        }
      } else {
        showScreen('cabinet-onboarding');
        let deepSection = sectionFromPath(window.location.pathname);
        if (deepSection === 'home') deepSection = 'onboard-main';
        if (deepSection === 'shazam') {
          try { window.history.replaceState({}, '', '/'); } catch (_) {}
          deepSection = 'onboard-main';
        }
        if (deepSection) showSection(deepSection, { replace: true });
        else showSection('onboard-main', { replace: true });
      }
    });
  }

  function loadExtensionConfig() {
    fetch(API_BASE + '/api/site/config').then((r) => r.json()).then((data) => {
      if (!data.success || !data.chromeExtensionUrl) return;
      const ua = navigator.userAgent || '';
      const isOpera = /opr|opera/i.test(ua) || (navigator.browser && navigator.browser.opera);
      const url = isOpera ? (data.operaExtensionUrl || data.chromeExtensionUrl) : data.chromeExtensionUrl;
      _chromeExtUrl = url;
      document.querySelectorAll('#cabinet-extension-link, #cabinet-extension-link-onboard, #cabinet-footer-extension-link, #header-settings-ext-link').forEach((a) => {
        if (a) { a.href = url; a.classList.remove('hidden'); }
      });
    }).catch(() => {});
  }

  // Перенос названия: до maxCh символов в строке, слово целиком; если слово длиннее — разбить
  function wrapTitleHtml(title, maxCh) {
    if (!title) return '';
    const safe = escapeHtml(title);
    if (safe.length <= maxCh) return safe;
    const parts = [];
    let rest = safe;
    while (rest.length > 0) {
      if (rest.length <= maxCh) {
        parts.push(rest);
        break;
      }
      const chunk = rest.slice(0, maxCh);
      const lastSpace = chunk.lastIndexOf(' ');
      const breakAt = lastSpace >= 0 ? lastSpace + 1 : maxCh;
      const word = rest.slice(0, breakAt);
      if (word.length > maxCh) {
        for (let i = 0; i < word.length; i += maxCh) parts.push(word.slice(i, i + maxCh));
      } else {
        parts.push(word);
      }
      rest = rest.slice(word.length);
    }
    return parts.map((p) => '<span class="plan-title-line">' + p + '</span>').join('');
  }

  let _plansData = { home: [], cinema: [], premieres: [] };
  let _plansViewFilter = 'all';

  function _sortPlansByTime(arr) {
    return (arr || []).slice().sort((a, b) => {
      const ta = a.plan_datetime ? new Date(a.plan_datetime).getTime() : 0;
      const tb = b.plan_datetime ? new Date(b.plan_datetime).getTime() : 0;
      return ta - tb;
    });
  }

  function _planTypeLabel(p) {
    const place = p.plan_type === 'cinema' ? '🎥 В кино' : '🏠 Дома';
    if (p.is_premiere_reminder) {
      return '🎭 Премьера · ' + place;
    }
    return place;
  }

  // ——— Главная кабинета: конструктор превью (ключи localStorage как в миниаппе) ———
  const HOME_LS_ORDER = 'sections_order';
  const HOME_LS_HIDDEN = 'sections_hidden';
  const HOME_LS_EMOJI = 'mp_home_emoji_v1';
  const HOME_BLOCK_IDS = ['plans', 'unwatched', 'series', 'premieres'];
  const DEFAULT_HOME_SECTION_ORDER = ['plans', 'unwatched', 'series', 'premieres'];

  function loadHomeSectionsOrder() {
    try {
      const raw = localStorage.getItem(HOME_LS_ORDER);
      if (!raw) return DEFAULT_HOME_SECTION_ORDER.slice();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) return DEFAULT_HOME_SECTION_ORDER.slice();
      const known = arr.filter((x) => HOME_BLOCK_IDS.indexOf(x) >= 0);
      const missing = DEFAULT_HOME_SECTION_ORDER.filter((x) => known.indexOf(x) < 0);
      return known.concat(missing);
    } catch (_) {
      return DEFAULT_HOME_SECTION_ORDER.slice();
    }
  }
  function saveHomeSectionsOrder(arr) {
    try { localStorage.setItem(HOME_LS_ORDER, JSON.stringify(arr)); } catch (_) {}
  }
  function loadHomeSectionsHidden() {
    try {
      const raw = localStorage.getItem(HOME_LS_HIDDEN);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }
  function saveHomeSectionsHidden(arr) {
    try { localStorage.setItem(HOME_LS_HIDDEN, JSON.stringify(arr)); } catch (_) {}
  }
  function loadHomeEmojiVis() {
    try {
      const raw = localStorage.getItem(HOME_LS_EMOJI);
      if (!raw) return { random: true, shazam: true };
      const j = JSON.parse(raw);
      return {
        random: j.random !== false,
        shazam: j.shazam !== false,
      };
    } catch (_) {
      return { random: true, shazam: true };
    }
  }
  function saveHomeEmojiVis(next) {
    try { localStorage.setItem(HOME_LS_EMOJI, JSON.stringify(next)); } catch (_) {}
  }

  function applyHomeEmojiVisibility() {
    const v = loadHomeEmojiVis();
    const wrap = document.getElementById('home-quick-actions');
    if (!wrap) return;
    wrap.querySelectorAll('[data-home-emoji-key]').forEach((el) => {
      const k = el.getAttribute('data-home-emoji-key');
      const on = k === 'random' ? v.random : k === 'shazam' ? v.shazam : true;
      el.classList.toggle('hidden', !on);
    });
  }

  let _homeDashTimer = null;
  function scheduleHomeDashboardRefresh() {
    clearTimeout(_homeDashTimer);
    _homeDashTimer = setTimeout(() => {
      try { renderHomeDashboardFromCache(); } catch (_) {}
    }, 120);
  }

  function _mergePlansForHomePreview() {
    const d = _plansData || { home: [], cinema: [], premieres: [] };
    return _sortPlansByTime((d.home || []).concat(d.cinema || []).concat(d.premieres || []));
  }

  const HOME_BLOCK_META = {
    plans: { title: 'Ближайшие просмотры', section: 'plans', moreLabel: 'Все планы →' },
    unwatched: { title: 'Непросмотренные', section: 'unwatched', moreLabel: 'Весь список →' },
    series: { title: 'Сериалы', section: 'series', moreLabel: 'Все сериалы →' },
    premieres: { title: 'Премьеры', section: 'premieres', moreLabel: 'Все премьеры →' },
  };

  function renderHomeBlockHtml(blockId) {
    const meta = HOME_BLOCK_META[blockId];
    if (!meta) return '';
    const head = '<div class="home-dash-head"><h3 class="home-dash-h">' + escapeHtml(meta.title) + '</h3>'
      + '<button type="button" class="link-inline home-dash-more" data-home-show-section="' + escapeHtml(meta.section) + '">'
      + escapeHtml(meta.moreLabel) + '</button></div>';

    if (blockId === 'plans') {
      const plans = _mergePlansForHomePreview().slice(0, 5);
      if (!plans.length) {
        return '<section class="home-dash-block">' + head
          + '<div class="home-dash-empty"><p class="empty-hint">Запланированных просмотров пока нет.</p><div class="plans-empty-actions">'
          + '<button type="button" class="btn btn-small btn-primary" data-plans-action="open-add-film">Добавить фильм</button> '
          + '<button type="button" class="btn btn-small btn-secondary" data-home-show-section="whattowatch">Что посмотреть</button> '
          + '<button type="button" class="btn btn-small btn-secondary" data-home-show-section="premieres">Премьеры</button>'
          + '</div></div></section>';
      }
      const rows = plans.map((p) => {
        const dt = p.plan_datetime ? new Date(p.plan_datetime) : null;
        const dateLine = dt ? dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';
        const timeLine = dt ? dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
        const poster = posterUrl(p.kp_id);
        return '<div class="home-dash-row film-card-v2" data-film-id="' + (p.film_id || '') + '"><div class="home-dash-row-text">'
          + '<div class="home-dash-row-poster">' + (poster ? ('<img src="' + escapeHtml(poster) + '" alt="" loading="lazy">') : '<span>🎬</span>') + '</div>'
          + '<div class="home-dash-row-main">'
          + '<div class="home-dash-row-title">' + escapeHtml(p.title || '') + '</div>'
          + '<div class="home-dash-row-meta">' + escapeHtml((dateLine + ' ' + timeLine).trim()) + ' · ' + _planTypeLabel(p) + '</div>'
          + '</div></div></div>';
      }).join('');
      return '<section class="home-dash-block">' + head + '<div class="home-dash-rows">' + rows + '</div></section>';
    }

    if (blockId === 'unwatched') {
      const items = (typeof unwatchedItems !== 'undefined' ? unwatchedItems : []).slice(0, 5);
      if (!items.length) {
        return '<section class="home-dash-block">' + head
          + '<div class="home-dash-empty"><p class="empty-hint">В списке пока пусто.</p><div class="plans-empty-actions">'
          + '<button type="button" class="btn btn-small btn-primary" data-plans-action="open-add-film">Добавить фильм</button> '
          + '<button type="button" class="btn btn-small btn-secondary" data-home-show-section="whattowatch">Что посмотреть</button>'
          + '</div></div></section>';
      }
      const rows = items.map((m) => '<div class="home-dash-row film-card-v2" data-film-id="' + (m.film_id || '') + '"><div class="home-dash-row-text">'
        + '<div class="home-dash-row-poster">' + (m.kp_id ? ('<img src="' + escapeHtml(posterUrl(m.kp_id)) + '" alt="" loading="lazy">') : '<span>🎬</span>') + '</div>'
        + '<div class="home-dash-row-main">'
        + '<div class="home-dash-row-title">' + escapeHtml(m.title || '') + '</div>'
        + '<div class="home-dash-row-meta">' + (m.year ? escapeHtml(String(m.year)) : '') + '</div>'
        + '</div></div></div>').join('');
      return '<section class="home-dash-block">' + head + '<div class="home-dash-rows">' + rows + '</div></section>';
    }

    if (blockId === 'series') {
      const items = (typeof seriesItems !== 'undefined' ? seriesItems : []).slice(0, 5);
      if (!items.length) {
        return '<section class="home-dash-block">' + head
          + '<div class="home-dash-empty"><p class="empty-hint">Сериалов пока нет.</p><div class="plans-empty-actions">'
          + '<button type="button" class="btn btn-small btn-primary" data-plans-action="open-add-film">Добавить сериал</button>'
          + '</div></div></section>';
      }
      const rows = items.map((s) => '<div class="home-dash-row film-card-v2" data-film-id="' + (s.film_id || '') + '"><div class="home-dash-row-text">'
        + '<div class="home-dash-row-poster">' + (s.kp_id ? ('<img src="' + escapeHtml(posterUrl(s.kp_id)) + '" alt="" loading="lazy">') : '<span>📺</span>') + '</div>'
        + '<div class="home-dash-row-main">'
        + '<div class="home-dash-row-title">' + escapeHtml(s.title || '') + '</div>'
        + '<div class="home-dash-row-meta">' + escapeHtml(s.progress || 'Сериал') + '</div>'
        + '</div></div></div>').join('');
      return '<section class="home-dash-block">' + head + '<div class="home-dash-rows">' + rows + '</div></section>';
    }

    if (blockId === 'premieres') {
      const raw = typeof _homePremierePreview !== 'undefined' ? _homePremierePreview : [];
      let items = raw.slice();
      if (typeof filterPremieresUpcomingMsk === 'function') {
        items = filterPremieresUpcomingMsk(items);
      }
      items = items.slice(0, 5);
      if (!items.length) {
        return '<section class="home-dash-block">' + head
          + '<div class="home-dash-empty"><p class="empty-hint">Скорых премьер в этом месяце не найдено.</p><div class="plans-empty-actions">'
          + '<button type="button" class="btn btn-small btn-primary" data-home-show-section="premieres">Открыть «Премьеры»</button>'
          + '</div></div></section>';
      }
      const rows = items.map((it) => {
        const fid = it.already_in_base_film_id;
        const kp = it.kp_id;
        const poster = it.poster || posterUrl(kp);
        const dateLabel = typeof formatPremiereDate === 'function' ? formatPremiereDate(it.premiere_date) : (it.premiere_date || '');
        if (fid) {
          return '<div class="home-dash-row film-card-v2" data-film-id="' + fid + '"><div class="home-dash-row-text">'
            + '<div class="home-dash-row-poster">' + (poster ? ('<img src="' + escapeHtml(poster) + '" alt="" loading="lazy">') : '<span>🎭</span>') + '</div>'
            + '<div class="home-dash-row-main">'
            + '<div class="home-dash-row-title">' + escapeHtml(it.title || '') + '</div>'
            + '<div class="home-dash-row-meta">' + escapeHtml(dateLabel) + '</div>'
            + '</div></div></div>';
        }
        return '<div class="home-dash-row home-dash-row--premiere"><div class="home-dash-row-text">'
          + '<div class="home-dash-row-poster">' + (poster ? ('<img src="' + escapeHtml(poster) + '" alt="" loading="lazy">') : '<span>🎭</span>') + '</div>'
          + '<div class="home-dash-row-main">'
          + '<div class="home-dash-row-title">' + escapeHtml(it.title || '') + '</div>'
          + '<div class="home-dash-row-meta">' + escapeHtml(dateLabel)
          + '</div></div></div>'
          + '<button type="button" class="btn btn-small btn-secondary" data-home-show-section="premieres">В премьерах</button></div>';
      }).join('');
      return '<section class="home-dash-block">' + head + '<div class="home-dash-rows">' + rows + '</div></section>';
    }
    return '';
  }

  let _homePremierePreview = [];

  function renderHomeDashboardFromCache() {
    const root = document.getElementById('home-dashboard-root');
    const secHome = document.getElementById('section-home');
    if (!root || !secHome || secHome.classList.contains('hidden')) return;

    applyHomeEmojiVisibility();

    api('/api/site/premieres?period=current_month').then((data) => {
      if (data && data.success && Array.isArray(data.items)) {
        let items = data.items.slice();
        items.sort((a, b) => String(a.premiere_date || '').localeCompare(String(b.premiere_date || '')));
        _homePremierePreview = items;
      } else {
        _homePremierePreview = [];
      }
    }).catch(() => {
      _homePremierePreview = [];
    }).finally(() => {
      applyHomeEmojiVisibility();
      const order = loadHomeSectionsOrder();
      const hidden = loadHomeSectionsHidden();
      let html = '';
      order.forEach((bid) => {
        if (hidden.indexOf(bid) >= 0) return;
        html += renderHomeBlockHtml(bid);
      });
      if (!html.trim()) {
        html = '<p class="cabinet-hint">Все блоки скрыты. Откройте «Настроить главную…», чтобы вернуть превью.</p>';
      }
      root.innerHTML = html;
    });
  }

  function bindHomeSectionNavOnce() {
    if (window._mpHomeNavBound) return;
    window._mpHomeNavBound = true;
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-home-show-section]');
      if (!t) return;
      if (t.closest('.header-settings-dropdown')) return;
      e.preventDefault();
      const sec = t.getAttribute('data-home-show-section');
      if (!sec) return;
      showSection(sec);
      if (sec === 'premieres' && typeof renderPremieresSection === 'function') renderPremieresSection();
    });
  }

  function syncHomeLayoutModalFromStorage() {
    const order = loadHomeSectionsOrder();
    const hidden = loadHomeSectionsHidden();
    const em = loadHomeEmojiVis();
    const er = document.getElementById('home-layout-emoji-random');
    const es = document.getElementById('home-layout-emoji-shazam');
    if (er) er.checked = !!em.random;
    if (es) es.checked = !!em.shazam;
    const listEl = document.getElementById('home-layout-section-list');
    if (!listEl) return;
    const titles = { plans: 'Ближайшие просмотры', unwatched: 'Непросмотренные', series: 'Сериалы', premieres: 'Премьеры' };
    listEl.innerHTML = order.map((id) => {
      const vis = hidden.indexOf(id) < 0;
      const title = titles[id] || id;
      return '<li class="home-layout-li" data-section-id="' + escapeHtml(id) + '">'
        + '<label class="home-layout-vis"><input type="checkbox" class="home-layout-show-cb"' + (vis ? ' checked' : '') + '> '
        + escapeHtml(title) + '</label>'
        + '<span class="home-layout-order">'
        + '<button type="button" class="btn btn-small btn-secondary home-layout-up" aria-label="Выше">↑</button>'
        + '<button type="button" class="btn btn-small btn-secondary home-layout-down" aria-label="Ниже">↓</button>'
        + '</span></li>';
    }).join('');
  }

  function persistHomeLayoutFromModal() {
    const listEl = document.getElementById('home-layout-section-list');
    if (!listEl) return;
    const order = [];
    const hidden = [];
    listEl.querySelectorAll('.home-layout-li').forEach((li) => {
      const id = li.getAttribute('data-section-id');
      if (!id) return;
      order.push(id);
      const cb = li.querySelector('.home-layout-show-cb');
      if (cb && !cb.checked) hidden.push(id);
    });
    saveHomeSectionsOrder(order);
    saveHomeSectionsHidden(hidden);
    const er = document.getElementById('home-layout-emoji-random');
    const es = document.getElementById('home-layout-emoji-shazam');
    saveHomeEmojiVis({
      random: er ? !!er.checked : true,
      shazam: es ? !!es.checked : true,
    });
  }

  function closeHomeLayoutModal() {
    const modal = document.getElementById('modal-home-layout');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function openHomeLayoutModal() {
    const modal = document.getElementById('modal-home-layout');
    if (!modal) return;
    syncHomeLayoutModalFromStorage();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function bindHomeLayoutModalOnce() {
    const openBtn = document.getElementById('home-layout-open-btn');
    const modal = document.getElementById('modal-home-layout');
    const listEl = document.getElementById('home-layout-section-list');
    if (!modal || modal._mpBound) return;
    modal._mpBound = true;
    if (openBtn && !openBtn._mpBound) {
      openBtn._mpBound = true;
      openBtn.addEventListener('click', () => openHomeLayoutModal());
    }
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="close-home-layout"]')) {
        persistHomeLayoutFromModal();
        closeHomeLayoutModal();
        scheduleHomeDashboardRefresh();
      }
    });
    if (listEl && !listEl._mpBound) {
      listEl._mpBound = true;
      listEl.addEventListener('click', (e) => {
        const up = e.target.closest('.home-layout-up');
        const dn = e.target.closest('.home-layout-down');
        const li = e.target.closest('.home-layout-li');
        if (!li || (!up && !dn)) return;
        e.preventDefault();
        const parent = li.parentNode;
        if (up && li.previousElementSibling) parent.insertBefore(li, li.previousElementSibling);
        if (dn && li.nextElementSibling) parent.insertBefore(li.nextElementSibling, li);
      });
    }
  }

  function bindHomeShazamOnce() {
    const btn = document.getElementById('home-shazam-submit');
    const ta = document.getElementById('home-shazam-query');
    const status = document.getElementById('home-shazam-status');
    const results = document.getElementById('home-shazam-results');
    if (!btn || btn._mpBound) return;
    btn._mpBound = true;
    btn.addEventListener('click', () => {
      const q = (ta && ta.value || '').trim();
      if (q.length < 3) {
        if (status) {
          status.textContent = 'Введите хотя бы 3 символа';
          status.classList.remove('hidden');
        }
        return;
      }
      if (status) {
        status.textContent = 'Ищем…';
        status.classList.remove('hidden');
      }
      if (results) results.innerHTML = '';
      api('/api/miniapp/shazam', { method: 'POST', body: JSON.stringify({ query: q }) })
        .then((data) => {
          if (!data || !data.success) {
            const err = (data && data.message) || (data && data.error) || 'Не удалось выполнить поиск';
            if (status) status.textContent = typeof err === 'string' ? err : 'Ошибка';
            return;
          }
          if (status) status.classList.add('hidden');
          const items = data.items || [];
          if (!items.length) {
            if (results) results.innerHTML = '<p class="cabinet-hint">Ничего не нашли — уточните описание.</p>';
            return;
          }
          if (results) {
            results.innerHTML = '<div class="home-shazam-grid">' + items.map((it) => {
              const kp = it.kp_id != null ? String(it.kp_id) : '';
              const poster = it.poster
                ? '<img src="' + escapeHtml(it.poster) + '" alt="" class="home-shazam-poster" loading="lazy" referrerpolicy="no-referrer">'
                : '<div class="home-shazam-poster home-shazam-poster--empty"></div>';
              const btnAdd = kp
                ? '<button type="button" class="btn btn-small btn-primary" data-action="add-film-pick" data-kp="' + escapeHtml(kp) + '">В базу</button>'
                : '';
              return '<div class="home-shazam-card">' + poster + '<div class="home-shazam-card-body">'
                + '<div class="home-shazam-card-title">' + escapeHtml(it.title || '') + '</div>'
                + '<div class="home-shazam-card-meta">' + (it.year ? escapeHtml(String(it.year)) : '') + '</div>'
                + btnAdd + '</div></div>';
            }).join('') + '</div>';
          }
        })
        .catch(() => {
          if (status) {
            status.textContent = 'Ошибка сети';
            status.classList.remove('hidden');
          }
        });
    });
  }

  function bindHomeQuickActionsOnce() {
    const wrap = document.getElementById('home-quick-actions');
    if (!wrap || wrap._mpBound) return;
    wrap._mpBound = true;
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-home-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-home-action');
      if (action === 'shazam') {
        showSection('shazam');
        return;
      }
      if (action === 'random') {
        showSection('whattowatch');
        setTimeout(() => {
          if (typeof runSiteRandomMode === 'function') runSiteRandomMode('my_unwatched');
        }, 80);
      }
    });
  }

  function _getPlansListForView() {
    const d = _plansData;
    if (_plansViewFilter === 'home') return _sortPlansByTime(d.home);
    if (_plansViewFilter === 'cinema') return _sortPlansByTime(d.cinema);
    if (_plansViewFilter === 'premieres') return _sortPlansByTime(d.premieres);
    return _sortPlansByTime((d.home || []).concat(d.cinema || []).concat(d.premieres || []));
  }

  function shareCabinetPlanLink(planId) {
    const pid = parseInt(planId, 10);
    if (!pid || Number.isNaN(pid)) return;
    if (!getToken()) {
      showToast('Войдите в кабинет', { type: 'error' });
      return;
    }
    showToast('Готовим ссылку на событие…', { duration: 1600 });
    api('/api/site/plans/' + pid + '/share', { method: 'POST', body: JSON.stringify({}) })
      .then(function (res) {
        if (!res || res.success === false || !res.share_url) {
          const err = (res && (res.error || res.message)) || 'Не удалось создать ссылку';
          showToast(err, { type: 'error' });
          return;
        }
        const url = res.share_url;
        const line = '🎬 Событие в Movie Planner — присоединяйтесь к просмотру';
        if (navigator.share) {
          navigator.share({ title: line, text: line + '\n' + url, url: url }).catch(function () {
            copyToClipboard(url + '\n' + line).then(function () {
              showToast('📋 Ссылка скопирована — вставьте в паблик или чат');
            }).catch(function () {
              showToast(url);
            });
          });
        } else {
          copyToClipboard(url + '\n' + line).then(function () {
            showToast('📋 Ссылка для паблика скопирована');
          }).catch(function () {
            showToast(url);
          });
        }
      })
      .catch(function () {
        showToast('Не удалось создать ссылку', { type: 'error' });
      });
  }

  function _renderPlanCard(p) {
    const dt = p.plan_datetime ? new Date(p.plan_datetime) : null;
    const dateLine = dt ? dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';
    const timeLine = dt ? dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    const typeLabel = _planTypeLabel(p);
    const link = filmDeepLink(p.film_id, p.kp_id, p.is_series);
    const poster = posterUrl(p.kp_id);
    const titleSafe = escapeHtml(p.title || '');
    const planId = p.id != null ? String(p.id) : '';
    const shareRow = planId
      ? '<div class="plan-card-share-row"><button type="button" class="btn btn-small plan-card-share-btn" data-plan-share-id="' + escapeHtml(planId) + '" title="Публичная страница с датой, группой, вступлением и календарём">↗ Поделиться событием</button></div>'
      : '';
    return `
          <div class="card plan-card film-card-v2" data-film-id="${p.film_id || ''}" data-kp-id="${p.kp_id || ''}" data-context="plan">
            <div class="film-card-v2-poster">
              ${poster ? '<img src="' + poster + '" alt="" class="card-poster" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : ''}
              <div class="film-poster-placeholder" style="${poster ? 'display:none' : ''}">🎬</div>
              ${buildFilmTelegramTriangle(link)}
              ${buildFilmRateStar(p.film_id, 0)}
            </div>
            <div class="film-card-v2-body">
              <div class="film-card-v2-meta">
                <span class="plan-date-line">📅 ${escapeHtml(dateLine)}</span>
                <span class="plan-time-line">${escapeHtml(timeLine)}</span>
                <span class="plan-type">${typeLabel}</span>
              </div>
              <div class="film-card-v2-title">${titleSafe}</div>
              ${shareRow}
              ${buildFilmActionBar({ kp_id: p.kp_id, title: p.title, year: p.year, plan_type: p.plan_type })}
            </div>
          </div>`;
  }

  function _plansEmptyMessage() {
    /** Один корневой узел: иначе grid (.plans-today-list + .cards-list) кладёт p и кнопки в разные колонки / сжимает кнопки. */
    let inner;
    if (_plansViewFilter === 'home') {
      let html = '<p class="empty-hint">Нет планов просмотра дома.</p><div class="plans-empty-actions">';
      html += '<button type="button" class="btn btn-small btn-primary" data-plans-action="open-add-film">Добавить фильм</button> ';
      html += '<button type="button" class="btn btn-small btn-secondary" data-home-show-section="whattowatch">🔍 Что посмотреть</button> ';
      html += '<button type="button" class="btn btn-small btn-secondary" data-home-show-section="premieres">📆 Премьеры</button> ';
      html += '<button type="button" class="btn btn-small btn-secondary" data-goto-plans="all">Все планы</button>';
      html += '</div>';
      inner = html;
    } else if (_plansViewFilter === 'cinema') {
      inner = '<p class="empty-hint">Нет планов в кино.</p><div class="plans-empty-actions">'
        + '<button type="button" class="btn btn-small btn-primary" data-plans-action="open-add-film">Добавить фильм</button> '
        + '<button type="button" class="btn btn-small btn-secondary" data-home-show-section="whattowatch">🔍 Что посмотреть</button> '
        + '<button type="button" class="btn btn-small btn-secondary" data-home-show-section="premieres">📆 Премьеры</button></div>';
    } else if (_plansViewFilter === 'premieres') {
      inner = '<p class="empty-hint">Пока нет напоминаний о премьерах. Включите напоминание на экране «Премьеры».</p><div class="plans-empty-actions"><button type="button" class="btn btn-small btn-primary" data-plans-goto="premieres">🎭 Раздел «Премьеры»</button></div>';
    } else {
      inner = '<p class="empty-hint">Нет запланированного просмотра.</p><div class="plans-empty-actions">'
        + '<button type="button" class="btn btn-small btn-primary" data-plans-action="open-add-film">Добавить фильм</button> '
        + '<button type="button" class="btn btn-small btn-secondary" data-home-show-section="whattowatch">🔍 Что посмотреть</button> '
        + '<button type="button" class="btn btn-small btn-secondary" data-home-show-section="premieres">📆 Премьеры</button>'
        + '</div>';
    }
    return '<div class="plans-list-empty-wrap">' + inner + '</div>';
  }

  function renderPlansList() {
    const listEl = document.getElementById('plans-list');
    if (!listEl) return;
    const items = _getPlansListForView();
    if (!items.length) {
      listEl.innerHTML = _plansEmptyMessage();
      return;
    }
    listEl.innerHTML = items.map(_renderPlanCard).join('');
  }

  function bindPlansFilterOnce() {
    const bar = document.getElementById('plans-filter-tabs');
    if (!bar || bar._mpPlansBound) return;
    bar._mpPlansBound = true;
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-plans-filter]');
      if (!btn || !bar.contains(btn)) return;
      e.preventDefault();
      const f = btn.getAttribute('data-plans-filter');
      if (!f) return;
      _plansViewFilter = f;
      bar.querySelectorAll('[data-plans-filter]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderPlansList();
    });
  }

  function bindPlansGotoOnce() {
    if (window._mpPlansGoto) return;
    window._mpPlansGoto = true;
    document.addEventListener('click', (e) => {
      const sharePlanEl = e.target.closest('[data-plan-share-id]');
      if (sharePlanEl) {
        e.preventDefault();
        e.stopPropagation();
        const sid = sharePlanEl.getAttribute('data-plan-share-id');
        if (sid) shareCabinetPlanLink(sid);
        return;
      }
      const act = e.target.closest('[data-plans-action]');
      if (act) {
        e.preventDefault();
        const action = act.getAttribute('data-plans-action');
        if (action === 'open-add-film') {
          openAddFilmModal();
          return;
        }
        if (action === 'show-premieres') {
          showSection('premieres');
          if (typeof renderPremieresSection === 'function') renderPremieresSection(true);
          return;
        }
        if (action === 'show-all') {
          showSection('plans');
          _plansViewFilter = 'all';
          renderPlansList();
          return;
        }
      }
      const goPlans = e.target.closest('[data-goto-plans]');
      if (goPlans) {
        e.preventDefault();
        const filter = goPlans.getAttribute('data-goto-plans') || 'all';
        showSection('plans');
        _plansViewFilter = filter;
        const tabs = document.getElementById('plans-filter-tabs');
        if (tabs) {
          tabs.querySelectorAll('[data-plans-filter]').forEach((b) => {
            const on = b.getAttribute('data-plans-filter') === filter;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
          });
        }
        renderPlansList();
        return;
      }
      const t = e.target.closest('[data-plans-goto]');
      if (!t) return;
      e.preventDefault();
      const sec = t.getAttribute('data-plans-goto');
      if (sec === 'premieres') {
        if (typeof showSection === 'function') showSection('premieres');
        if (typeof renderPremieresSection === 'function') renderPremieresSection();
      }
    });
  }

  // ——— Загрузка данных кабинета ———
  function loadPlans() {
    api('/api/site/plans').then((data) => {
      if (!data.success) return;
      const home = data.home || [];
      const cinema = data.cinema || [];
      const premieres = data.premieres || [];
      _plansData = { home, cinema, premieres };
      _plansViewFilter = 'all';
      const todayWrap = document.getElementById('plans-today-wrap');
      if (todayWrap) todayWrap.classList.remove('hidden');
      const tabs = document.getElementById('plans-filter-tabs');
      if (tabs) {
        tabs.querySelectorAll('[data-plans-filter]').forEach((b) => {
          const isAll = b.getAttribute('data-plans-filter') === 'all';
          b.classList.toggle('active', isAll);
          b.setAttribute('aria-selected', isAll ? 'true' : 'false');
        });
      }
      bindPlansFilterOnce();
      renderPlansList();
      try { scheduleHomeDashboardRefresh(); } catch (_) {}
    });
  }

  let unwatchedItems = [];
  let unwatchedSortMode = 'date';
  let seriesItems = [];
  let ratingsItems = [];

  function sectionSearchQuery(section) {
    const el = document.getElementById('section-search-' + section);
    return (el && el.value || '').trim().toLowerCase();
  }

  function filterByTitle(items, query, titleKey) {
    if (!query) return items.slice();
    const key = titleKey || 'title';
    const filtered = items.filter((item) => {
      const t = (item[key] || '').toLowerCase();
      return t.includes(query);
    });
    return filtered.sort((a, b) => {
      const ta = (a[key] || '').toLowerCase();
      const tb = (b[key] || '').toLowerCase();
      const ia = ta.indexOf(query);
      const ib = tb.indexOf(query);
      return ia - ib;
    });
  }

  function renderUnwatchedCard(m) {
    const link = filmDeepLink(m.film_id, m.kp_id, m.is_series);
    const year = m.year ? ` (${m.year})` : '';
    const poster = posterUrl(m.kp_id);
    const ratingStr = m.rating_kp != null ? ' · КП: ' + Number(m.rating_kp).toFixed(1) : '';
    const desc = (m.description || '').trim();
    const descHtml = desc ? '<div class="film-description">' + escapeHtml(desc.slice(0, 200)) + (desc.length > 200 ? '…' : '') + '</div>' : '';
    const streamingUrl = (m.online_link || '').trim();
    const streamingBtn = streamingUrl
      ? '<a href="' + escapeHtml(streamingUrl) + '" target="_blank" rel="noopener" class="btn btn-small btn-secondary film-streaming-btn" onclick="event.stopPropagation()"><span class="streaming-btn-text">На стриминг</span><span class="streaming-btn-emoji"> ▶️</span></a>'
      : '';
    const progressStatus = m.is_series
      ? (m.progress ? 'Прогресс: ' + escapeHtml(m.progress) : 'Не начат')
      : '';
    const progressHtml = progressStatus ? '<div class="film-card-v2-status">' + progressStatus + '</div>' : '';
    return `
      <div class="card film-card film-card-v2" data-film-id="${m.film_id || ''}" data-kp-id="${m.kp_id || ''}" data-context="unwatched">
        <div class="film-card-v2-poster">
          ${poster ? '<img src="' + poster + '" alt="" class="card-poster" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : ''}
          <div class="film-poster-placeholder" style="${poster ? 'display:none' : ''}">${m.is_series ? '📺' : '🎬'}</div>
          ${buildFilmTelegramTriangle(link)}
          ${buildFilmRateStar(m.film_id, 0)}
        </div>
        <div class="film-card-v2-body">
          <div class="film-card-v2-title">${escapeHtml(m.title)}${year}${ratingStr}</div>
          ${progressHtml}
          ${buildFilmActionBar({ kp_id: m.kp_id, title: m.title, year: m.year })}
        </div>
      </div>`;
  }

  function renderUnwatchedList() {
    const el = document.getElementById('unwatched-list');
    if (!el) return;
    if (!unwatchedItems.length) {
      el.innerHTML = '<p class="empty-hint">Нет непросмотренных. Добавьте фильмы в боте.</p>';
      return;
    }
    const query = sectionSearchQuery('unwatched');
    let list = filterByTitle(unwatchedItems, query);
    if (!query) {
      if (unwatchedSortMode === 'date_old') list.reverse();
      if (unwatchedSortMode === 'az') list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
      if (unwatchedSortMode === 'za') list.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'ru'));
    }
    el.innerHTML = list.length ? list.map(renderUnwatchedCard).join('') : '<p class="empty-hint">Ничего не найдено</p>';
  }

  function loadUnwatched() {
    api('/api/site/unwatched').then((data) => {
      unwatchedItems = Array.isArray(data && data.items) ? data.items : [];
      const sortSelect = document.getElementById('unwatched-sort');
      if (sortSelect && !sortSelect.dataset.bound) {
        sortSelect.dataset.bound = '1';
        sortSelect.addEventListener('change', () => {
          unwatchedSortMode = sortSelect.value;
          renderUnwatchedList();
        });
      }
      if (sortSelect) sortSelect.value = unwatchedSortMode;
      bindSectionSearchOnce('unwatched', renderUnwatchedList);
      renderUnwatchedList();
      try { scheduleHomeDashboardRefresh(); } catch (_) {}
    }).catch(() => {
      unwatchedItems = [];
      renderUnwatchedList();
      try { scheduleHomeDashboardRefresh(); } catch (_) {}
    });
  }

  function renderSeriesCard(s) {
    const link = filmDeepLink(s.film_id, s.kp_id, true);
    const progress = s.progress ? `Прогресс: ${s.progress}` : 'Не начат';
    const poster = posterUrl(s.kp_id);
    const streamingUrl = (s.online_link || '').trim();
    const streamingBtn = streamingUrl
      ? '<a href="' + escapeHtml(streamingUrl) + '" target="_blank" rel="noopener" class="btn btn-small btn-secondary film-streaming-btn" onclick="event.stopPropagation()"><span class="streaming-btn-text">На стриминг</span><span class="streaming-btn-emoji"> ▶️</span></a>'
      : '';
    return `
      <div class="card series-card film-card-v2" data-film-id="${s.film_id || ''}" data-kp-id="${s.kp_id || ''}" data-context="series">
        <div class="film-card-v2-poster">
          ${poster ? '<img src="' + poster + '" alt="" class="card-poster" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : ''}
          <div class="film-poster-placeholder" style="${poster ? 'display:none' : ''}">📺</div>
          ${buildFilmTelegramTriangle(link)}
          ${buildFilmRateStar(s.film_id, 0)}
        </div>
        <div class="film-card-v2-body">
          <div class="film-card-v2-title">${escapeHtml(s.title)}</div>
          <div class="film-card-v2-status">${progress}</div>
          ${buildFilmActionBar({ kp_id: s.kp_id, title: s.title, is_series: true })}
        </div>
      </div>`;
  }

  function renderSeriesList() {
    const el = document.getElementById('series-list');
    if (!el) return;
    if (!seriesItems.length) {
      el.innerHTML = '<p class="empty-hint">Нет сериалов. Добавьте в боте.</p>';
      return;
    }
    const list = filterByTitle(seriesItems, sectionSearchQuery('series'));
    el.innerHTML = list.length ? list.map(renderSeriesCard).join('') : '<p class="empty-hint">Ничего не найдено</p>';
  }

  function loadSeries() {
    api('/api/site/series').then((data) => {
      if (!data.success) return;
      seriesItems = Array.isArray(data.items) ? data.items : [];
      bindSectionSearchOnce('series', renderSeriesList);
      renderSeriesList();
      try { scheduleHomeDashboardRefresh(); } catch (_) {}
    });
  }

  function formatRatedDate(ratedAt) {
    if (!ratedAt) return '';
    try {
      const d = new Date(ratedAt);
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) { return ''; }
  }

  function renderRatingsCard(r) {
    const link = filmDeepLink(r.film_id, r.kp_id, false);
    const year = r.year ? ` (${r.year})` : '';
    const poster = posterUrl(r.kp_id);
    const ratingKpStr = r.rating_kp != null ? ' · КП: ' + Number(r.rating_kp).toFixed(1) : '';
    const desc = (r.description || '').trim();
    const descHtml = desc ? '<div class="film-description">' + escapeHtml(desc.slice(0, 200)) + (desc.length > 200 ? '…' : '') + '</div>' : '';
    const raterStr = (r.rater_username && r.rater_username.trim()) ? ' · ' + escapeHtml(r.rater_username.trim()) : '';
    const ratedDateStr = formatRatedDate(r.rated_at);
    const ratedDateHtml = ratedDateStr ? '<div class="film-rated-date">Оценено ' + escapeHtml(ratedDateStr) + '</div>' : '';
    const streamingUrl = (r.online_link || '').trim();
    const streamingBtn = streamingUrl
      ? '<a href="' + escapeHtml(streamingUrl) + '" target="_blank" rel="noopener" class="btn btn-small btn-secondary film-streaming-btn" onclick="event.stopPropagation()"><span class="streaming-btn-text">На стриминг</span><span class="streaming-btn-emoji"> ▶️</span></a>'
      : '';
    return `
      <div class="card film-card film-card-v2" data-film-id="${r.film_id || ''}" data-kp-id="${r.kp_id || ''}" data-context="ratings">
        <div class="film-card-v2-poster">
          ${poster ? '<img src="' + poster + '" alt="" class="card-poster" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : ''}
          <div class="film-poster-placeholder" style="${poster ? 'display:none' : ''}">⭐</div>
          ${buildFilmTelegramTriangle(link)}
          ${buildFilmRateStar(r.film_id, r.rating)}
        </div>
        <div class="film-card-v2-body">
          <div class="film-card-v2-title">${escapeHtml(r.title)}${year}${ratingKpStr}</div>
          <div class="film-card-v2-status">⭐ ${r.rating}${raterStr}</div>
          ${ratedDateHtml}
          ${buildFilmActionBar({ kp_id: r.kp_id, title: r.title, year: r.year })}
        </div>
      </div>`;
  }

  let ratingsMemberFilter = '';

  function renderRatingsList() {
    const el = document.getElementById('ratings-list');
    if (!el) return;
    let list = filterByTitle(ratingsItems, sectionSearchQuery('ratings'));
    if (ratingsMemberFilter) {
      list = list.filter((r) => (r.rater_username || '').trim() === ratingsMemberFilter);
    }
    if (!list.length) {
      el.innerHTML = '<p class="empty-hint">' + (ratingsItems.length ? 'Ничего не найдено' : 'Нет оценок.') + '</p>';
      return;
    }
    el.innerHTML = list.map(renderRatingsCard).join('');
  }

  const sectionSearchBound = {};
  function bindSectionSearchOnce(section, onInput) {
    if (sectionSearchBound[section]) return;
    sectionSearchBound[section] = true;
    const input = document.getElementById('section-search-' + section);
    if (input) input.addEventListener('input', onInput);
  }

  function loadRatings() {
    const el = document.getElementById('ratings-list');
    if (!el) return;
    ratingsMemberFilter = '';
    api('/api/site/ratings').then((data) => {
      ratingsItems = Array.isArray(data && data.items) ? data.items : [];
      bindSectionSearchOnce('ratings', renderRatingsList);
      const session = getActiveSession();
      const isGroup = session && !session.is_personal;
      const toolbar = document.getElementById('ratings-toolbar');
      const memberSelect = document.getElementById('ratings-member-filter');
      if (toolbar && memberSelect && isGroup) {
        const raters = [];
        const seen = {};
        ratingsItems.forEach((r) => {
          const u = (r.rater_username || '').trim();
          if (u && !seen[u]) { seen[u] = true; raters.push(u); }
        });
        raters.sort();
        if (raters.length) {
          toolbar.style.display = 'flex';
          memberSelect.innerHTML = '<option value="">Все</option>' + raters.map((u) => '<option value="' + escapeHtml(u) + '">' + escapeHtml(u) + '</option>').join('');
          if (!memberSelect._bound) {
            memberSelect._bound = true;
            memberSelect.addEventListener('change', () => {
              ratingsMemberFilter = (memberSelect.value || '').trim();
              renderRatingsList();
            });
          }
        } else {
          toolbar.style.display = 'none';
        }
      } else if (toolbar) {
        toolbar.style.display = 'none';
      }
      renderRatingsList();
    }).catch(() => {
      if (el) el.innerHTML = '<p class="empty-hint">Не удалось загрузить оценки.</p>';
    });
  }

  function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ——— Статистика ———
  const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  const MONTH_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  function initStatsSelectors() {
    const yearEl = document.getElementById('stats-year');
    const pillsEl = document.getElementById('stats-month-pills');
    const debugLink = document.getElementById('stats-debug-link');
    if (!yearEl || !pillsEl) return;
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();
    const years = [];
    for (let y = curYear; y >= curYear - 3; y--) years.push(y);
    yearEl.innerHTML = years.map((y) => '<option value="' + y + '"' + (y === curYear ? ' selected' : '') + '>' + y + '</option>').join('');
    function renderMonthPills() {
      const selYear = parseInt(yearEl.value, 10);
      const maxMonth = (selYear === curYear) ? curMonth : 12;
      let activeMonth = curMonth;
      const activeEl = pillsEl.querySelector('.month-pill.active');
      if (activeEl) {
        const m = parseInt(activeEl.getAttribute('data-month'), 10);
        if (m <= maxMonth) activeMonth = m;
        else activeMonth = maxMonth;
      } else if (selYear < curYear) activeMonth = 12;
      pillsEl.innerHTML = MONTH_SHORT.map((name, i) => {
        const monthNum = i + 1;
        if (monthNum > maxMonth) return '';
        return '<button type="button" class="month-pill' + (monthNum === activeMonth ? ' active' : '') + '" data-month="' + monthNum + '">' + name + '</button>';
      }).filter(Boolean).join('');
    }
    renderMonthPills();
    function getMonthYear() {
      const active = pillsEl.querySelector('.month-pill.active');
      const m = active ? parseInt(active.getAttribute('data-month'), 10) : curMonth;
      const y = parseInt(yearEl.value, 10);
      return { m, y };
    }
    if (!pillsEl._bound) {
      pillsEl._bound = yearEl._bound = true;
      pillsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.month-pill');
        if (!btn) return;
        pillsEl.querySelectorAll('.month-pill').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        const { m, y } = getMonthYear();
        loadStats(m, y);
      });
      yearEl.addEventListener('change', () => {
        renderMonthPills();
        const { m, y } = getMonthYear();
        loadStats(m, y);
      });
    }
    window._getStatsMonthYear = getMonthYear;
    if (debugLink && !debugLink._bound) {
      debugLink._bound = true;
      debugLink.addEventListener('click', function (e) {
        e.preventDefault();
        const { m, y } = getMonthYear();
        api('/api/site/stats/debug?month=' + m + '&year=' + y)
          .then((r) => {
            if (r && r.debug) {
              console.log('[Stats Debug]', r.debug);
              alert('Debug: ' + JSON.stringify(r.debug, null, 2));
            }
          })
          .catch(() => alert('Ошибка загрузки debug'));
      });
    }
  }

  function loadStats(month, year) {
    const loading = document.getElementById('stats-loading');
    const error = document.getElementById('stats-error');
    const content = document.getElementById('stats-content');
    const personalWrap = document.getElementById('stats-personal-wrap');
    const groupWrap = document.getElementById('stats-group-wrap');
    const session = getActiveSession();
    const isGroup = session && !session.is_personal;

    if (loading) { loading.classList.remove('hidden'); loading.textContent = 'Загрузка…'; }
    if (error) { error.classList.add('hidden'); error.textContent = ''; }
    if (content) content.style.visibility = 'hidden';
    if (personalWrap) personalWrap.classList.toggle('hidden', !!isGroup);
    if (groupWrap) groupWrap.classList.toggle('hidden', !isGroup);

    const m = month || new Date().getMonth() + 1;
    const y = year || new Date().getFullYear();
    const url = isGroup ? '/api/site/group-stats?month=' + m + '&year=' + y : '/api/site/stats?month=' + m + '&year=' + y;

    api(url)
      .then((data) => {
        if (loading) loading.classList.add('hidden');
        if (content) content.style.visibility = '';
        if (!data || !data.success) {
          if (error) {
            error.classList.remove('hidden');
            const msg = (data && data.error) || 'Не удалось загрузить статистику.';
            error.textContent = msg + (data && data.debug ? ' [' + data.debug + ']' : '');
          }
          return;
        }
        if (data.debug_available) {
          const dl = document.getElementById('stats-debug-link');
          if (dl) { dl.classList.remove('hidden'); }
        }
        if (isGroup) {
          renderGroupStats(data);
        } else {
          renderStatsProfilePersonal(data, {
            profileElId: 'stats-profile-personal',
            achGridId: 'stats-ach-panel-grid',
            achCountId: 'stats-ach-panel-count',
            achPanelId: 'stats-ach-panel',
            allBtnId: 'stats-ach-all-btn',
            closeBtnId: 'stats-ach-panel-close-btn',
            achievementsKey: '_cabinetAchievements'
          });
          renderStatsPersonalShare(data.share_url, data.share_views);
          renderStatsSummary(data.summary, 'stats-summary', 'personal');
          renderStatsTopFilms(data.top_films || [], undefined, data.period);
          renderStatsRatingBreakdown(data.rating_breakdown || {});
          renderStatsPlatforms(data.platforms || []);
          renderStatsCinema(data.cinema || []);
          renderStatsWatched(data.watched || [], undefined, data.period, { canEdit: true, isGroup: false });
        }
      })
      .catch(() => {
        if (loading) loading.classList.add('hidden');
        if (content) content.style.visibility = '';
        if (error) { error.classList.remove('hidden'); error.textContent = 'Сервис статистики пока недоступен.'; }
      });
  }

  // ——— Public stats (share link: group or user) ———
  function parsePublicStatsHash() {
    const h = (location.hash || '').replace(/^#/, '');
    const pathPart = h.split('?')[0];
    const params = new URLSearchParams(h.split('?')[1] || '');
    const month = parseInt(params.get('m'), 10) || new Date().getMonth() + 1;
    const year = parseInt(params.get('y'), 10) || new Date().getFullYear();
    let decoded = pathPart || '';
    try { decoded = decodeURIComponent(pathPart || ''); } catch (_) {}
    const gMatch = decoded.match(/^\/g\/([^/]+)\/stats/);
    if (gMatch) { try { return { type: 'group', slug: decodeURIComponent(gMatch[1]), month, year }; } catch (_) { return { type: 'group', slug: gMatch[1], month, year }; } }
    const uMatch = decoded.match(/^\/u\/([^/]+)\/stats/);
    if (uMatch) return { type: 'user', slug: decodeURIComponent(uMatch[1]), month, year };
    return null;
  }

  function loadPublicGroupStats(slug, month, year) {
    const loading = document.getElementById('public-stats-loading');
    const error = document.getElementById('public-stats-error');
    const content = document.getElementById('public-stats-content');
    const subtitle = document.getElementById('public-stats-subtitle');
    if (loading) { loading.classList.remove('hidden'); loading.textContent = 'Загрузка…'; }
    if (error) { error.classList.add('hidden'); error.textContent = ''; }
    if (content) content.style.visibility = 'hidden';
    if (subtitle) subtitle.textContent = 'Статистика группы';

    apiPublic('/api/site/group-stats/public/' + encodeURIComponent(slug) + '?month=' + (month || new Date().getMonth() + 1) + '&year=' + (year || new Date().getFullYear()))
      .then((data) => {
        if (loading) loading.classList.add('hidden');
        if (content) content.style.visibility = '';
        if (!data || !data.success) {
          if (error) {
            error.classList.remove('hidden');
            const msg = (data && data.error) || 'Не удалось загрузить статистику.';
            error.textContent = msg + (data && data.debug ? ' [' + data.debug + ']' : '');
          }
          return;
        }
        const group = data.group || {};
        if (subtitle) subtitle.textContent = 'Статистика: ' + (group.title || 'Группа');
        const ctx = {
          headerEl: document.getElementById('public-stats-group-header'),
          summaryEl: document.getElementById('public-stats-summary'),
          mvpEl: document.getElementById('public-stats-mvp'),
          gridEl: document.getElementById('public-stats-grid'),
          lbPrefix: 'public-lb'
        };
        renderPublicStatsProfileGroup(data);
        renderGroupStats(data, ctx);
      })
      .catch(() => {
        if (loading) loading.classList.add('hidden');
        if (content) content.style.visibility = '';
        if (error) { error.classList.remove('hidden'); error.textContent = 'Сервис статистики пока недоступен.'; }
      });
  }

  function initPublicStatsSelectors(slug, month, year, type) {
    type = type || 'group';
    const monthEl = document.getElementById('public-stats-month');
    const yearEl = document.getElementById('public-stats-year');
    if (!monthEl || !yearEl) return;
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();
    const selMonth = month || curMonth;
    const selYear = year || curYear;
    const years = [];
    for (let y = curYear; y >= curYear - 3; y--) years.push(y);
    yearEl.innerHTML = years.map((y) => '<option value="' + y + '"' + (y === selYear ? ' selected' : '') + '>' + y + '</option>').join('');
    function renderMonthOptions() {
      const y = parseInt(yearEl.value, 10);
      const maxMonth = (y === curYear) ? curMonth : 12;
      let selected = parseInt(monthEl.value, 10) || selMonth;
      if (selected > maxMonth) selected = maxMonth;
      monthEl.innerHTML = MONTH_NAMES.map((name, i) => {
        const m = i + 1;
        if (m > maxMonth) return '';
        return '<option value="' + m + '"' + (m === selected ? ' selected' : '') + '>' + name + '</option>';
      }).filter(Boolean).join('');
    }
    renderMonthOptions();
    const base = type === 'user' ? '#/u/' + encodeURIComponent(slug) + '/stats' : '#/g/' + encodeURIComponent(slug) + '/stats';
    if (!monthEl._publicBound) {
      monthEl._publicBound = yearEl._publicBound = true;
      const onChange = () => {
        const m = parseInt(monthEl.value, 10);
        const y = parseInt(yearEl.value, 10);
        if (type === 'user') loadPublicUserStats(slug, m, y);
        else loadPublicGroupStats(slug, m, y);
        location.hash = base + (m && y ? '?m=' + m + '&y=' + y : '');
      };
      monthEl.addEventListener('change', onChange);
      yearEl.addEventListener('change', () => { renderMonthOptions(); onChange(); });
    }
  }

  function loadPublicUserStats(slug, month, year) {
    const loading = document.getElementById('public-stats-loading');
    const error = document.getElementById('public-stats-error');
    const content = document.getElementById('public-stats-content');
    const subtitle = document.getElementById('public-stats-subtitle');
    const groupWrap = document.getElementById('public-stats-group-wrap');
    const personalWrap = document.getElementById('public-stats-personal-wrap');
    if (loading) { loading.classList.remove('hidden'); loading.textContent = 'Загрузка…'; }
    if (error) { error.classList.add('hidden'); error.textContent = ''; }
    if (content) content.style.visibility = 'hidden';
    if (groupWrap) groupWrap.classList.add('hidden');
    if (personalWrap) personalWrap.classList.add('hidden');
    if (subtitle) subtitle.textContent = 'Статистика';
    document.getElementById('public-stats-ach-panel')?.classList.remove('open');

    apiPublic('/api/site/stats/public/' + encodeURIComponent(slug) + '?month=' + (month || new Date().getMonth() + 1) + '&year=' + (year || new Date().getFullYear()))
      .then((data) => {
        if (loading) loading.classList.add('hidden');
        if (content) content.style.visibility = '';
        if (!data || !data.success) {
          if (error) {
            error.classList.remove('hidden');
            const msg = (data && data.error) || 'Не удалось загрузить статистику.';
            error.textContent = msg + (data && data.debug ? ' [' + data.debug + ']' : '');
          }
          return;
        }
        const user = data.user || {};
        if (subtitle) subtitle.textContent = 'Статистика: ' + (user.name || slug);
        if (groupWrap) groupWrap.classList.add('hidden');
        if (personalWrap) personalWrap.classList.remove('hidden');
        renderStatsProfilePersonal(data, {
          profileElId: 'public-stats-profile-personal',
          achGridId: 'ach-panel-grid',
          achCountId: 'ach-panel-count',
          achPanelId: 'public-stats-ach-panel',
          allBtnId: 'public-ach-all-btn',
          closeBtnId: 'ach-panel-close-btn',
          achievementsKey: '_publicAchievements'
        });
        renderStatsSummary(data.summary, 'public-stats-personal-summary', 'personal');
        renderStatsTopFilms(data.top_films || [], 'public-stats-personal-top', data.period);
        renderStatsRatingBreakdown(data.rating_breakdown || {}, 'public-stats-personal-rating');
        renderStatsPlatforms(data.platforms || [], 'public-stats-personal-platforms');
        renderStatsCinema(data.cinema || [], 'public-stats-personal-cinema');
        renderStatsWatched(data.watched || [], 'public-stats-personal-watched', data.period);
      })
      .catch(() => {
        if (loading) loading.classList.add('hidden');
        if (content) content.style.visibility = '';
        if (error) { error.classList.remove('hidden'); error.textContent = 'Сервис статистики пока недоступен.'; }
      });
  }

  function showPublicStatsView(parsed) {
    if (!parsed || !parsed.slug) return;
    showScreen('public-stats');
    loadExtensionConfig();
    const footerExt = document.getElementById('cabinet-footer-extension-link');
    if (footerExt) { footerExt.classList.remove('hidden'); }
    initPublicStatsSelectors(parsed.slug, parsed.month, parsed.year, parsed.type);
    if (parsed.type === 'user') {
      loadPublicUserStats(parsed.slug, parsed.month, parsed.year);
    } else {
      document.getElementById('public-stats-group-wrap')?.classList.remove('hidden');
      document.getElementById('public-stats-personal-wrap')?.classList.add('hidden');
      loadPublicGroupStats(parsed.slug, parsed.month, parsed.year);
    }
  }

  // ——— Group stats ———
  function memberById(members, userId) {
    if (!members || !Array.isArray(members)) return null;
    const id = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    return members.find((m) => (m.user_id === id || String(m.user_id) === String(userId))) || null;
  }

  function memberInitial(member) {
    if (!member) return '?';
    let name = member.first_name || member.username || '';
    if (name && name[0] === '@') name = name.slice(1);
    return (name || '?')[0].toUpperCase();
  }

  function groupAvatar(member, size) {
    if (!member) return '';
    const color = member.avatar_color || '#9b4dff';
    const initial = memberInitial(member);
    const cls = size ? 'avatar avatar-' + size : 'avatar';
    const titleStr = member.first_name || member.username || '';
    return '<div class="' + cls + '" style="background:' + escapeHtml(color) + '" title="' + escapeHtml(titleStr) + '">' + escapeHtml(initial) + '</div>';
  }

  function ratingColor(r) {
    if (r >= 8) return 'var(--stats-green, #34d399)';
    if (r >= 6) return 'var(--stats-amber, #fbbf24)';
    return 'var(--stats-pink, #ff2d7b)';
  }

  function renderGroupStats(data, ctx) {
    ctx = ctx || {};
    const headerEl = ctx.headerEl || document.getElementById('stats-group-header');
    const summaryEl = ctx.summaryEl || document.getElementById('stats-group-summary');
    const mvpEl = ctx.mvpEl || document.getElementById('stats-group-mvp');
    let gridEl = ctx.gridEl || document.getElementById('stats-group-grid');
    const members = data.members || [];
    const group = data.group || {};
    const period = data.period || {};
    const summary = data.summary || {};
    const mvp = data.mvp || {};
    const topFilms = data.top_films || [];
    const ratingBreakdown = data.rating_breakdown || {};
    const leaderboard = data.leaderboard || {};
    const controversial = data.controversial || [];
    const compatibility = data.compatibility || [];
    const genres = data.genres || [];
    const achievements = data.achievements || [];
    const heatmap = data.activity_heatmap || {};

    // Header (and share URL / enable button in cabinet)
    if (headerEl) {
      const shareUrl = data.share_url || (group.public_slug ? (window.location.origin + '/#/g/' + encodeURIComponent(group.public_slug) + '/stats') : '');
      const shareViews = data.share_views;
      const isCabinet = !ctx || !ctx.lbPrefix || ctx.lbPrefix !== 'public-lb';
      let shareHtml = '';
      if (shareUrl) {
        let viewsHtml = '';
        if (shareViews != null && shareViews >= 0) {
          viewsHtml = '<div class="stats-share-views">Переходов по ссылке: ' + shareViews + '</div>';
        }
        shareHtml = '<div class="stats-group-share"><span class="stats-group-share-url">' + escapeHtml(shareUrl) + '</span><button type="button" class="stats-group-copy-btn" data-url="' + escapeHtml(shareUrl) + '">Копировать</button></div>' + viewsHtml;
      } else if (isCabinet) {
        shareHtml = '<div class="stats-group-share"><span class="stats-personal-share-note">Поделиться: </span><button type="button" class="btn btn-small btn-primary stats-enable-share-btn">Включить публичную ссылку</button></div>';
      }
      const groupTitle = (group.title || 'Группа').length > 35 ? (group.title || 'Группа').slice(0, 32) + '…' : (group.title || 'Группа');
      headerEl.innerHTML = '<div class="stats-group-header-inner"><h3 class="stats-group-title">Статистика: <span class="stats-group-name">' + escapeHtml(groupTitle) + '</span></h3>' +
        '<div class="stats-group-meta">' + escapeHtml((group.members_active || 0) + ' участников') + ' &middot; ' + escapeHtml((group.total_films_alltime || 0) + ' фильмов за всё время') + '</div></div>' + shareHtml;
      headerEl.querySelector('.stats-group-copy-btn')?.addEventListener('click', function () {
        const u = this.getAttribute('data-url');
        if (!u) return;
        const self = this;
        copyToClipboard(u).then(() => {
          self.textContent = 'Скопировано!';
          showToast('📋 Ссылка скопирована');
          setTimeout(() => { self.textContent = 'Копировать'; }, 2000);
        }).catch(() => showToast('Не удалось скопировать', { type: 'error' }));
      });
      headerEl.querySelector('.stats-enable-share-btn')?.addEventListener('click', function () {
        const btn = this;
        btn.disabled = true;
        btn.textContent = 'Включение…';
        api('/api/site/group-stats/settings', { method: 'PUT', body: JSON.stringify({ public_enabled: true }) })
          .then((r) => {
            if (r.success) {
              const monthEl = document.getElementById('stats-month');
              const yearEl = document.getElementById('stats-year');
              const now = new Date();
              (function () { const g = window._getStatsMonthYear ? window._getStatsMonthYear() : (function () { const y = document.getElementById('stats-year'); const p = document.getElementById('stats-month-pills'); const a = p && p.querySelector('.month-pill.active'); const m = a ? parseInt(a.getAttribute('data-month'), 10) : now.getMonth() + 1; return { m, y: y ? parseInt(y.value, 10) : now.getFullYear() }; })(); loadStats(g.m, g.y); })();
            } else {
              btn.disabled = false;
              btn.textContent = 'Включить публичную ссылку';
            }
          })
          .catch(() => { btn.disabled = false; btn.textContent = 'Включить публичную ссылку'; });
      });
    }

    // Summary cards
    if (summaryEl) {
      const cards = [
        { val: summary.group_films ?? 0, label: 'Просмотренных фильмов', cls: 'stat-card-pink' },
        { val: summary.group_ratings ?? 0, label: 'Оценок поставлено', cls: 'stat-card-purple' },
        { val: summary.group_cinema ?? 0, label: 'Походов в кино', cls: 'stat-card-cyan' },
        { val: (summary.group_series ?? 0) + ' / ' + (summary.group_episodes ?? 0), label: 'Сериалов / серий', cls: 'stat-card-green' },
        { val: summary.active_members ?? 0, label: 'Активных участников', cls: 'stat-card-amber' }
      ];
      summaryEl.innerHTML = cards.map((c) => {
        let scrollTarget = null;
        if (c.label === 'Просмотренных фильмов') {
          scrollTarget = 'group-watched';
        } else if (c.label === 'Оценок поставлено') {
          scrollTarget = 'group-rating-breakdown';
        } else if (c.label === 'Сериалов / серий') {
          scrollTarget = 'group-platforms';
        } else if (c.label === 'Походов в кино') {
          scrollTarget = 'group-cinema';
        }
        const clickable = scrollTarget ? ' style="cursor:pointer" data-scroll-to="' + escapeHtml(scrollTarget) + '"' : '';
        return '<div class="stat-card ' + c.cls + '"' + clickable + '><div class="stat-card-icon">' + (c.cls.includes('pink') ? '🎬' : c.cls.includes('purple') ? '⭐' : c.cls.includes('cyan') ? '🎥' : c.cls.includes('green') ? '📺' : '👥') + '</div><div class="stat-card-value">' + escapeHtml(String(c.val)) + '</div><div class="stat-card-label">' + escapeHtml(c.label) + '</div></div>';
      }).join('');
    }

    // MVP
    if (mvpEl && mvp.user_id != null) {
      const mvpMember = memberById(members, mvp.user_id);
      const reasonLabels = { most_active: 'Больше всех смотрел и оценивал', most_ratings: 'Лидер по оценкам', most_cinema: 'Больше всех в кино', most_series: 'Больше всех серий' };
      mvpEl.innerHTML = '<div class="stats-mvp-card"><div class="stats-mvp-crown">👑</div><div class="stats-mvp-title">Киноман месяца</div>' +
        groupAvatar(mvpMember, 'xl') +
        '<div class="stats-mvp-name">' + escapeHtml(mvpMember ? (mvpMember.first_name || mvpMember.username || 'Участник') : '') + '</div>' +
        '<div class="stats-mvp-meta">' + escapeHtml(mvpMember && mvpMember.username ? mvpMember.username : '') + ' · ' + escapeHtml(reasonLabels[mvp.reason] || mvp.reason || '') + '</div>' +
        '<div class="stats-mvp-stats">' +
        '<div class="stats-mvp-stat"><span class="stats-mvp-stat-val">' + (mvp.films ?? 0) + '</span><span class="stats-mvp-stat-lbl">просмотров</span></div>' +
        '<div class="stats-mvp-stat"><span class="stats-mvp-stat-val">' + (mvp.ratings ?? 0) + '</span><span class="stats-mvp-stat-lbl">оценок</span></div>' +
        '<div class="stats-mvp-stat"><span class="stats-mvp-stat-val">' + (mvp.avg_rating != null ? Number(mvp.avg_rating).toFixed(1) : '—') + '</span><span class="stats-mvp-stat-lbl">средняя</span></div>' +
        '</div></div>';
    } else {
      if (mvpEl) mvpEl.innerHTML = '';
    }

    // Grid blocks
    if (!gridEl) return;

    const blocks = [];

    // Top films
    if (topFilms.length) {
      blocks.push('<div class="stats-block"><div class="stats-block-title">🏆 Топ фильмов группы</div><p class="stats-block-sub">По средней оценке участников</p>' +
        topFilms.slice(0, 10).map((f, i) => {
          const ratedBy = f.rated_by || [];
          const voters = ratedBy.map((r) => {
            const m = memberById(members, r.user_id);
            return '<span class="stats-top-chip">' + groupAvatar(m, 'sm') + '<span style="color:' + ratingColor(r.rating) + '">' + r.rating + '</span></span>';
          }).join('');
          return '<div class="top-film-row"><div class="top-film-rank">' + (i + 1) + '</div>' +
            '<img src="' + posterUrl(f.kp_id) + '" alt="" class="top-film-poster" loading="lazy" onerror="this.style.display=\'none\'">' +
            '<div class="top-film-info"><div class="top-film-name">' + escapeHtml(f.title || '') + '</div><div class="top-film-meta">' + escapeHtml((f.year ? f.year + ' · ' : '') + (f.genre || '')) + '</div><div class="stats-top-voters">' + voters + '</div></div>' +
            '<div class="top-film-avg"><span style="color:' + ratingColor(f.avg_rating) + '">' + (f.avg_rating != null ? Number(f.avg_rating).toFixed(1) : '—') + '</span><div class="top-film-avg-sub">средняя</div></div></div>';
        }).join('') + '</div>');
    }

    // Rating breakdown
    const maxRb = Math.max(1, ...Object.values(ratingBreakdown).map(Number));
    const totalRb = Object.entries(ratingBreakdown).reduce((s, [k, v]) => s + parseInt(k, 10) * Number(v), 0);
    const countRb = Object.values(ratingBreakdown).reduce((s, v) => s + Number(v), 0);
    const avgRb = countRb > 0 ? (totalRb / countRb).toFixed(1) : '—';
    const bars = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => {
      const c = ratingBreakdown[r] ?? 0;
      const pct = maxRb ? (c / maxRb) * 100 : 0;
      const bgStyle = c > 0 ? 'background:hsl(' + ((r - 1) * 12) + ',80%,55%)' : '';
      const minW = c > 0 ? 'min-width:24px;' : '';
      return '<div class="rating-bar-row"><div class="rating-bar-label">' + r + '</div><div class="rating-bar-track"><div class="rating-bar-fill" style="width:' + pct + '%;' + minW + bgStyle + '">' + (c > 0 ? c : '') + '</div></div><div class="rating-bar-count">' + c + '</div></div>';
    }).join('');
    blocks.push('<div class="stats-block"><div class="stats-block-title">📊 Распределение оценок группы</div><p class="stats-block-sub">Средняя группы: <span style="color:' + ratingColor(+avgRb) + ';font-weight:700">' + avgRb + '</span></p>' + bars + '</div>');

    // Leaderboard
    const lb = leaderboard;
    const lbTabs = ['watched', 'ratings', 'avg_rating', 'cinema'];
    const lbLabels = { watched: 'Просмотры', ratings: 'Оценки', avg_rating: 'Средняя', cinema: 'Кинотеатр' };
    const lbData = {};
    lbTabs.forEach((key) => {
      const arr = lb[key] || [];
      lbData[key] = arr;
    });
    const maxW = Math.max(1, ...(lb.watched || []).map((x) => x.count));
    const maxR = Math.max(1, ...(lb.ratings || []).map((x) => x.count));
    const maxA = Math.max(0.1, ...(lb.avg_rating || []).map((x) => x.value));
    const maxC = Math.max(1, ...(lb.cinema || []).map((x) => x.count));
    function lbValueClass(lbType, val, pct) {
      if (lbType === 'avg_rating') {
        if (val >= 8) return 'value-high';
        if (val >= 5) return 'value-mid';
        return 'value-low';
      }
      if (pct >= 80) return 'value-high';
      if (pct >= 40) return 'value-mid';
      return 'value-low';
    }
    function lbRows(items, valueKey, maxVal, suffix, lbType) {
      lbType = lbType || 'count';
      return (items || []).map((item, i) => {
        const m = memberById(members, item.user_id);
        const val = item[valueKey];
        const pct = maxVal ? (val / maxVal) * 100 : 0;
        const color = m && m.avatar_color ? m.avatar_color : '#9b4dff';
        const vc = lbValueClass(lbType, val, pct);
        return '<div class="stats-lb-row"><div class="stats-lb-rank">' + (i + 1) + '</div>' + groupAvatar(m) + '<div class="stats-lb-info"><div class="stats-lb-name">' + escapeHtml(m ? (m.first_name || m.username || 'Участник') : '') + '</div></div><div class="stats-lb-bar-wrap"><div class="stats-lb-bar" style="width:' + pct + '%;background:' + color + '"></div></div><div class="stats-lb-value ' + vc + '">' + val + suffix + '</div></div>';
      }).join('');
    }
    const lbPref = ctx.lbPrefix || 'lb';
    blocks.push('<div class="stats-block"><div class="stats-block-title">🏆 Лидерборд</div><div class="stats-lb-tabs">' +
      '<button type="button" class="stats-lb-tab active" data-lb="watched">Просмотры</button>' +
      '<button type="button" class="stats-lb-tab" data-lb="ratings">Оценки</button>' +
      '<button type="button" class="stats-lb-tab" data-lb="avg_rating">Средняя</button>' +
      '<button type="button" class="stats-lb-tab" data-lb="cinema">Кинотеатр</button></div>' +
      '<div id="' + lbPref + '-watched" class="stats-lb-content">' + lbRows(lb.watched, 'count', maxW, '', 'count') + '</div>' +
      '<div id="' + lbPref + '-ratings" class="stats-lb-content hidden">' + lbRows(lb.ratings, 'count', maxR, '', 'count') + '</div>' +
      '<div id="' + lbPref + '-avg_rating" class="stats-lb-content hidden">' + lbRows(lb.avg_rating, 'value', maxA, '', 'avg_rating') + '</div>' +
      '<div id="' + lbPref + '-cinema" class="stats-lb-content hidden">' + lbRows(lb.cinema, 'count', maxC, '', 'count') + '</div></div>');

    // Cinema (походы в кино)
    const cinemaList = data.cinema || [];
    if (cinemaList.length) {
      const cinemaHtml = cinemaList.map((c) => {
        const poster = posterUrl(c.kp_id);
        const dateStr = c.date ? new Date(c.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        return '<div class="watched-row">' +
          (poster ? '<img src="' + poster + '" alt="" class="top-film-poster" loading="lazy">' : '<div class="top-film-poster"></div>') +
          '<div class="top-film-info"><div class="top-film-name">' + escapeHtml(c.title || '') + '</div><div class="top-film-meta">' + (c.year ? c.year + ' · ' : '') + dateStr + (c.rating != null ? ' · ⭐ ' + c.rating : '') + '</div></div></div>';
      }).join('');
      blocks.push('<div class="stats-block stats-block-full"><div class="stats-block-title">🎥 Походы в кино</div>' + cinemaHtml + '</div>');
    }

    // Controversial
    if (controversial.length) {
      blocks.push('<div class="stats-block"><div class="stats-block-title">🔥 Спорные фильмы</div><p class="stats-block-sub">Самый большой разброс оценок</p>' +
        controversial.slice(0, 5).map((f) => {
          const rats = (f.ratings || []).map((r) => {
            const m = memberById(members, r.user_id);
            return '<span class="stats-contro-chip">' + groupAvatar(m, 'sm') + '<span style="color:' + ratingColor(r.rating) + '">' + r.rating + '</span></span>';
          }).join('');
          return '<div class="stats-contro-row"><img src="' + posterUrl(f.kp_id) + '" alt="" class="stats-contro-poster" loading="lazy" onerror="this.style.background=\'var(--bg-surface-alt)\'"><div class="stats-contro-info"><div class="stats-contro-title">' + escapeHtml(f.title || '') + ' <span class="stats-contro-year">(' + (f.year || '') + ')</span></div><div class="stats-contro-ratings">' + rats + '</div></div><div class="stats-contro-spread">Δ' + (f.spread ?? 0) + '<div class="stats-contro-spread-lbl">разброс</div></div></div>';
        }).join('') + '</div>');
    }

    // Compatibility
    if (compatibility.length) {
      const compatCards = compatibility.map((c) => {
        const pair = c.pair || [];
        const m1 = memberById(members, pair[0]);
        const m2 = memberById(members, pair[1]);
        const pct = c.pct ?? 0;
        const color = pct >= 80 ? 'var(--stats-green)' : pct >= 60 ? 'var(--stats-amber)' : 'var(--stats-pink)';
        const r = 34;
        const circ = 2 * Math.PI * r;
        const offset = circ * (1 - pct / 100);
        return '<div class="stats-compat-card"><div class="stats-compat-avatars">' + groupAvatar(m1) + groupAvatar(m2) + '</div><div class="stats-compat-ring"><svg width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="' + r + '" fill="none" stroke="var(--bg-surface-alt)" stroke-width="6"/><circle cx="40" cy="40" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="6" stroke-dasharray="' + circ + '" stroke-dashoffset="' + offset + '" stroke-linecap="round"/></svg><div class="stats-compat-value">' + pct + '%</div></div><div class="stats-compat-label">' + escapeHtml((m1 ? m1.first_name : '') + ' & ' + (m2 ? m2.first_name : '')) + ' · ' + (c.common_films ?? 0) + ' общих</div></div>';
      }).join('');
      blocks.push('<div class="stats-block"><div class="stats-block-title">💕 Совпадение вкусов</div><div class="stats-compat-grid">' + compatCards + '</div></div>');
    }

    // Genres
    if (genres.length) {
      const memberOrder = members.map((m) => m.user_id);
      const maxG = Math.max(1, ...genres.flatMap((g) => (g.by_member || []).map((bm) => bm.count || 0)));
      const genreRows = genres.slice(0, 8).map((g) => {
        const byMember = g.by_member || [];
        const bars = memberOrder.map((uid) => {
          const bm = byMember.find((x) => String(x.user_id) === String(uid));
          const cnt = bm ? (bm.count || 0) : 0;
          const m = memberById(members, uid);
          const pct = maxG ? (cnt / maxG) * 100 : 0;
          return '<div class="stats-genre-bar-line"><div class="stats-genre-bar-user">' + (m ? memberInitial(m) : '') + '</div><div class="stats-genre-bar-track"><div class="stats-genre-bar-fill" style="width:' + pct + '%;background:' + (m && m.avatar_color ? m.avatar_color : '#9b4dff') + '">' + (cnt > 0 ? cnt : '') + '</div></div></div>';
        }).join('');
        return '<div class="stats-genre-row"><div class="stats-genre-label">' + escapeHtml(g.genre || '') + '</div><div class="stats-genre-bars">' + bars + '</div></div>';
      }).join('');
      blocks.push('<div class="stats-block stats-block-full"><div class="stats-block-title">🎭 Жанры: кто что смотрит</div><div class="stats-genre-legend">' + members.map((m) => '<span>' + groupAvatar(m, 'sm') + ' ' + escapeHtml(m.first_name || m.username || '') + '</span>').join('') + '</div>' + genreRows + '</div>');
    }

    // Achievements
    if (achievements.length) {
      const achCards = achievements.map((a) => {
        const holder = a.holder_user_id != null ? memberById(members, a.holder_user_id) : null;
        const cls = a.earned ? 'earned' : '';
        return '<div class="stats-achievement ' + cls + '"><div class="stats-achievement-icon">' + (a.icon || '🏅') + '</div><div class="stats-achievement-name">' + escapeHtml(a.name || '') + '</div><div class="stats-achievement-desc">' + escapeHtml(a.description || '') + '</div>' + (holder ? '<div class="stats-achievement-holder">' + escapeHtml(holder.first_name || holder.username || '') + '</div>' : '<div class="stats-achievement-holder stats-achievement-locked">Не получена</div>') + '</div>';
      }).join('');
      blocks.push('<div class="stats-block stats-block-full"><div class="stats-block-title">🏅 Ачивки месяца</div><div class="stats-achievements-grid">' + achCards + '</div></div>');
    }

    // Heatmap: цвет по отношению к средней активности группы
    const heatKeys = Object.keys(heatmap).filter((k) => k !== '...' && !isNaN(parseInt(k, 10)));
    if (heatKeys.length && members.length) {
      const dayCount = parseInt(period.month, 10) ? new Date(period.year, period.month, 0).getDate() : 31;
      let totalSum = 0;
      for (let d = 1; d <= dayCount; d++) {
        const dayData = heatmap[String(d)] || {};
        members.forEach((m) => { totalSum += dayData[String(m.user_id)] ?? 0; });
      }
      const numCells = dayCount * members.length;
      const avg = numCells > 0 ? totalSum / numCells : 0.001;
      let cols = '';
      for (let d = 1; d <= dayCount; d++) {
        const dayData = heatmap[String(d)] || {};
        let cells = '';
        members.forEach((m) => {
          const v = dayData[String(m.user_id)] ?? 0;
          let lvl = '';
          if (v > 0) {
            if (v <= avg) lvl = 'l1';
            else if (v <= avg * 1.5) lvl = 'l2';
            else if (v <= avg * 2.5) lvl = 'l3';
            else lvl = 'l4';
          }
          cells += '<div class="stats-heatmap-cell ' + lvl + '" title="День ' + d + ': ' + v + '"></div>';
        });
        cols += '<div class="stats-heatmap-col"><div class="stats-heatmap-day">' + d + '</div>' + cells + '</div>';
      }
      blocks.push('<div class="stats-block stats-block-full"><div class="stats-block-title">📅 Активность группы по дням</div><div class="stats-heatmap-wrap"><div class="stats-heatmap">' + cols + '</div></div><div class="stats-heatmap-legend-bar">Меньше <span class="stats-heatmap-cell"></span><span class="stats-heatmap-cell l1"></span><span class="stats-heatmap-cell l2"></span><span class="stats-heatmap-cell l3"></span><span class="stats-heatmap-cell l4"></span> Больше</div></div>');
    }

    // Watched list
    const watched = data.watched || [];
    const watchedOptions = { canEdit: true, isGroup: true };
    blocks.push('<div class="stats-block stats-block-full">' + buildWatchedBlockHtml(watched, period, watchedOptions) + '</div>');

    gridEl.innerHTML = blocks.join('');
    bindWatchedExpand(gridEl);
    const watchedWrap = gridEl.querySelector('.watched-block-wrap');
    if (watchedWrap) bindWatchedChangeMonth(watchedWrap.closest('.stats-block-full') || gridEl, period, watchedOptions);

    // Leaderboard tab switch
    gridEl.querySelectorAll('.stats-lb-tab').forEach((tab) => {
      tab.addEventListener('click', function () {
        const key = this.getAttribute('data-lb');
        if (!key) return;
        gridEl.querySelectorAll('.stats-lb-tab').forEach((t) => t.classList.remove('active'));
        this.classList.add('active');
        gridEl.querySelectorAll('.stats-lb-content').forEach((c) => c.classList.add('hidden'));
        const content = document.getElementById((ctx.lbPrefix || 'lb') + '-' + key);
        if (content) content.classList.remove('hidden');
      });
    });

    // Bind click handlers for scroll (group stats) - after grid is rendered
    const summaryElForScroll = ctx.summaryEl || document.getElementById('stats-group-summary') || document.getElementById('public-stats-summary');
    if (summaryElForScroll) {
      summaryElForScroll.querySelectorAll('.stat-card[data-scroll-to]').forEach((card) => {
        card.addEventListener('click', function() {
          const targetId = this.getAttribute('data-scroll-to');
          if (!targetId || !gridEl) return;
          let target = null;
          const allBlocks = Array.from(gridEl.querySelectorAll('.stats-block'));
          if (targetId === 'group-watched') {
            // Find block with "просмотренное" or "Просмотренное" in title
            target = allBlocks.find((b) => {
              const title = b.querySelector('.stats-block-title');
              if (!title) return false;
              const text = title.textContent || '';
              return text.toLowerCase().includes('просмотренное') || text.includes('📋');
            });
          } else if (targetId === 'group-rating-breakdown') {
            // Find "Распределение оценок" block
            target = allBlocks.find((b) => {
              const title = b.querySelector('.stats-block-title');
              if (!title) return false;
              const text = title.textContent || '';
              return text.includes('Распределение оценок') || text.includes('📊');
            });
          } else if (targetId === 'group-platforms') {
            // Find "Платформы" block
            target = allBlocks.find((b) => {
              const title = b.querySelector('.stats-block-title');
              if (!title) return false;
              const text = title.textContent || '';
              return text.includes('Платформы') || text.includes('📺');
            });
          } else if (targetId === 'group-cinema') {
            // Find "Походы в кино" block
            target = allBlocks.find((b) => {
              const title = b.querySelector('.stats-block-title');
              if (!title) return false;
              const text = title.textContent || '';
              return text.includes('Походы в кино') || text.includes('🎥');
            });
          }
          if (target) scrollToStatsSection(target);
        });
      });
    }
  }

  function formatMemberSince(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const m = dateStr.match(/^(\d{4})-(\d{2})/);
    if (!m) return dateStr;
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const month = months[parseInt(m[2], 10) - 1] || m[2];
    return 'с ' + month + ' ' + m[1];
  }

  function renderStatsProfilePersonal(data, ctx) {
    ctx = ctx || {};
    const profileElId = ctx.profileElId || 'public-stats-profile-personal';
    const allBtnId = ctx.allBtnId || 'public-ach-all-btn';
    const el = document.getElementById(profileElId);
    if (!el) return;
    const profile = data.user_profile || {};
    const user = data.user || {};
    const achievements = data.achievements || [];
    const name = profile.first_name || user.name || ('@' + (profile.username || user.username || '').replace(/^@/, '')) || 'Пользователь';
    const initial = (name[0] || '?').toUpperCase();
    const since = formatMemberSince(profile.member_since);
    const meta = [
      profile.total_films_alltime != null ? '🎬 ' + profile.total_films_alltime + ' фильмов' : null,
      profile.total_series_alltime != null ? '📺 ' + profile.total_series_alltime + ' сериалов' : null,
      profile.avg_rating_alltime != null ? '⭐ ' + Number(profile.avg_rating_alltime).toFixed(1) + ' средняя' : null,
      since ? '📅 ' + since : null
    ].filter(Boolean).join(' · ');
    const earned = achievements.filter((a) => a.earned);
    const show = earned.slice(0, 5);
    const remaining = earned.length - show.length;
    let badgesHtml = show.map((a) => {
      const rarity = (a.rarity || 'common');
      return '<div class="badge-mini ' + rarity + '"><span class="badge-mini-icon">' + (a.icon || '🏅') + '</span><span class="badge-mini-name">' + escapeHtml(a.name || '') + '</span><div class="badge-tip"><strong>' + (a.icon || '') + ' ' + escapeHtml(a.name || '') + '</strong> ' + escapeHtml(a.description || '') + '</div></div>';
    }).join('');
    if (remaining > 0) badgesHtml += '<span class="badges-more" role="button" tabindex="0">+' + remaining + ' ещё</span>';
    badgesHtml += '<span class="badges-more" role="button" tabindex="0" style="margin-left:auto;" id="' + escapeHtml(allBtnId) + '">🏅 Все ачивки</span>';
    el.innerHTML = '<div class="stats-profile-top"><div class="stats-profile-avatar">' + escapeHtml(initial) + '</div><div class="stats-profile-info"><div class="stats-profile-name">' + escapeHtml(name) + '</div><div class="stats-profile-meta">' + escapeHtml(meta) + '</div></div></div><div class="stats-profile-badges">' + badgesHtml + '</div>';
    el.classList.remove('hidden');
    const achievementsKey = ctx.achievementsKey || '_publicAchievements';
    window[achievementsKey] = achievements;
    renderAchPanel(achievements, null, ctx);
    bindAchPanel(ctx);
  }

  const ACH_CATEGORIES = {
    'films_': '🎬 Киноман',
    'ratings_': '⭐ Критик',
    'cinema_': '🎟️ Кинозритель',
    'series_completed_': '📺 Сериалы',
    'series_ep_': '🔥 Серии',
    'genres_': '🌈 Всеядный',
    'plans_': '📅 Планировщик'
  };
  function getAchCategory(achId) {
    if (!achId) return null;
    for (const prefix in ACH_CATEGORIES) {
      if (achId.startsWith(prefix)) return ACH_CATEGORIES[prefix];
    }
    return '🏆 Особые';
  }

  function renderAchPanel(achievements, filterRarity, ctx) {
    ctx = ctx || {};
    const gridId = ctx.achGridId || 'ach-panel-grid';
    const countId = ctx.achCountId || 'ach-panel-count';
    const grid = document.getElementById(gridId);
    const countEl = document.getElementById(countId);
    if (!grid) return;
    const list = Array.isArray(achievements) ? (filterRarity ? achievements.filter((a) => (a.rarity || 'common') === filterRarity) : achievements) : [];
    const earnedCount = (achievements || []).filter((a) => a.earned).length;
    const total = (achievements || []).length;
    if (countEl) countEl.innerHTML = 'Получено: <span style="color:var(--amber);font-weight:700;">' + earnedCount + '</span> / ' + total;
    const getProgressPct = function (a) {
      const p = a.progress;
      if (!p || p.target <= 0) return 0;
      return Math.round((100 * (p.current || 0)) / p.target);
    };
    const progressColor = function (rarity) {
      if (rarity === 'legendary') return 'var(--amber)';
      if (rarity === 'epic') return 'var(--purple)';
      if (rarity === 'rare') return 'var(--cyan)';
      return 'var(--text-muted)';
    };
    const rarityDot = function (r) {
      if (r === 'common') return '•';
      if (r === 'rare') return '••';
      if (r === 'epic') return '•••';
      return '★';
    };
    const renderCard = function (a) {
      const rarity = a.rarity || 'common';
      const cls = a.earned ? 'earned' : 'locked';
      const progressPct = getProgressPct(a);
      const progressHtml = (!a.earned && progressPct > 0) ? '<div class="ach-panel-progress"><div class="ach-panel-progress-fill" style="width:' + progressPct + '%;background:' + progressColor(rarity) + '"></div></div>' : '';
      return '<div class="ach-panel-card ' + cls + '"><div class="ach-panel-icon">' + (a.icon || '🏅') + '</div><div class="ach-panel-info"><div class="ach-panel-name">' + escapeHtml(a.name || '') + '</div><div class="ach-panel-desc">' + escapeHtml(a.description || '') + '</div>' + progressHtml + '</div><span class="ach-panel-rarity r-' + rarity + '">' + rarityDot(rarity) + '</span></div>';
    };
    const byCategory = {};
    list.forEach(function (a) {
      const cat = getAchCategory(a.id) || 'Прочее';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(a);
    });
    const categoryOrder = ['🎬 Киноман', '⭐ Критик', '🎟️ Кинозритель', '📺 Сериалы', '🔥 Серии', '🌈 Всеядный', '📅 Планировщик', '🏆 Особые'];
    let html = '';
    categoryOrder.forEach(function (cat) {
      const items = byCategory[cat];
      if (!items || !items.length) return;
      html += '<div class="ach-panel-category"><div class="ach-panel-category-title">' + escapeHtml(cat) + '</div><div class="ach-panel-category-grid">' + items.map(renderCard).join('') + '</div></div>';
    });
    const uncategorized = Object.keys(byCategory).filter(function (c) { return categoryOrder.indexOf(c) === -1; });
    uncategorized.forEach(function (cat) {
      html += '<div class="ach-panel-category"><div class="ach-panel-category-title">' + escapeHtml(cat) + '</div><div class="ach-panel-category-grid">' + byCategory[cat].map(renderCard).join('') + '</div></div>';
    });
    grid.innerHTML = html || list.map(renderCard).join('');
  }

  function toggleAchPanel(panelId) {
    const panel = document.getElementById(panelId || 'public-stats-ach-panel');
    if (!panel) return;
    panel.classList.toggle('open');
    panel.setAttribute('aria-hidden', panel.classList.contains('open') ? 'false' : 'true');
    if (panel.classList.contains('open')) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function bindAchPanel(ctx) {
    ctx = ctx || {};
    const allBtnId = ctx.allBtnId || 'public-ach-all-btn';
    const closeBtnId = ctx.closeBtnId || 'ach-panel-close-btn';
    const panelId = ctx.achPanelId || 'public-stats-ach-panel';
    const achievementsKey = ctx.achievementsKey || '_publicAchievements';
    const allBtn = document.getElementById(allBtnId);
    const closeBtn = document.getElementById(closeBtnId);
    const panel = document.getElementById(panelId);
    const filters = panel ? panel.querySelectorAll('.ach-panel-filter-btn[data-filter]') : [];
    const click = function (el, fn) {
      if (!el) return;
      el.addEventListener('click', fn);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
    };
    const toggleFn = function () {
      toggleAchPanel(panelId);
    };
    click(allBtn, toggleFn);
    click(closeBtn, toggleFn);
    const profileEl = document.getElementById(ctx.profileElId || 'public-stats-profile-personal');
    if (profileEl) {
      profileEl.querySelectorAll('.stats-profile-badges .badges-more').forEach(function (b) {
        if (b.id !== allBtnId) { click(b, toggleFn); }
      });
    }
    filters.forEach(function (f) {
      const filter = f.getAttribute('data-filter');
      click(f, function () {
        renderAchPanel(window[achievementsKey] || [], filter === 'all' ? null : filter, ctx);
      });
    });
  }

  function renderPublicStatsProfileGroup(data) {
    const el = document.getElementById('public-stats-profile-group');
    if (!el) return;
    const group = data.group || {};
    const s = data.summary || {};
    const achievements = data.achievements || [];
    const title = group.title || 'Группа';
    const initial = (title[0] || 'Г').toUpperCase();
    const meta = [
      s.group_films != null ? '🎬 ' + s.group_films + ' фильмов' : null,
      s.group_ratings != null ? '⭐ ' + s.group_ratings + ' оценок' : null,
      s.group_cinema != null ? '🎥 ' + s.group_cinema + ' в кино' : null,
      (group.members_active || 0) ? '👥 ' + group.members_active + ' участников' : null
    ].filter(Boolean).join(' · ');
    const earned = achievements.filter((a) => a.earned);
    const show = earned.slice(0, 5);
    const remaining = earned.length - show.length;
    let badgesHtml = show.map((a) => {
      const rarity = (a.rarity || 'common');
      return '<div class="badge-mini ' + rarity + '"><span class="badge-mini-icon">' + (a.icon || '🏅') + '</span><span class="badge-mini-name">' + escapeHtml(a.name || '') + '</span><div class="badge-tip"><strong>' + (a.icon || '') + ' ' + escapeHtml(a.name || '') + '</strong>' + escapeHtml(a.description || '') + '</div></div>';
    }).join('');
    if (remaining > 0) {
      badgesHtml += '<span class="badges-more">+' + remaining + ' ещё</span>';
    }
    el.innerHTML = '<div class="stats-profile-top"><div class="stats-profile-avatar">' + escapeHtml(initial) + '</div><div class="stats-profile-info"><div class="stats-profile-name">' + escapeHtml(title) + '</div><div class="stats-profile-meta">' + escapeHtml(meta) + '</div></div></div>' + (badgesHtml ? '<div class="stats-profile-badges">' + badgesHtml + '</div>' : '');
    el.classList.remove('hidden');
  }

  function renderStatsPersonalShare(shareUrl, shareViews) {
    const el = document.getElementById('stats-personal-share');
    if (!el) return;
    if (shareUrl) {
      let viewsHtml = '';
      if (shareViews != null && shareViews >= 0) {
        viewsHtml = '<div class="stats-share-views">Переходов по ссылке: ' + shareViews + '</div>';
      }
      el.innerHTML = '<div class="stats-group-header-inner"><h3 class="stats-group-title">Статистика</h3>' +
        '<div class="stats-group-share"><span class="stats-group-share-url">' + escapeHtml(shareUrl) + '</span>' +
        '<button type="button" class="stats-group-copy-btn" data-url="' + escapeHtml(shareUrl) + '">Копировать</button></div>' + viewsHtml + '</div>';
      el.querySelector('.stats-group-copy-btn')?.addEventListener('click', function () {
        const u = this.getAttribute('data-url');
        if (!u) return;
        const self = this;
        copyToClipboard(u).then(() => {
          self.textContent = 'Скопировано!';
          showToast('📋 Ссылка скопирована');
          setTimeout(() => { self.textContent = 'Копировать'; }, 2000);
        }).catch(() => showToast('Не удалось скопировать', { type: 'error' }));
      });
      el.classList.remove('hidden');
    } else {
      el.innerHTML = '<div class="stats-personal-share-note">Поделиться статистикой: <button type="button" class="btn btn-small btn-primary stats-enable-share-btn">Включить публичную ссылку</button></div>';
      el.classList.remove('hidden');
      el.querySelector('.stats-enable-share-btn')?.addEventListener('click', function () {
        this.disabled = true;
        this.textContent = 'Включение…';
        api('/api/site/stats/settings', { method: 'PUT', body: JSON.stringify({ public_enabled: true }) })
          .then((r) => {
            if (r.success) {
              const monthEl = document.getElementById('stats-month');
              const yearEl = document.getElementById('stats-year');
              const now = new Date();
              (function () { const g = window._getStatsMonthYear ? window._getStatsMonthYear() : (function () { const y = document.getElementById('stats-year'); const p = document.getElementById('stats-month-pills'); const a = p && p.querySelector('.month-pill.active'); const m = a ? parseInt(a.getAttribute('data-month'), 10) : now.getMonth() + 1; return { m, y: y ? parseInt(y.value, 10) : now.getFullYear() }; })(); loadStats(g.m, g.y); })();
            } else {
              this.disabled = false;
              this.textContent = 'Включить публичную ссылку';
            }
          })
          .catch(() => { this.disabled = false; this.textContent = 'Включить публичную ссылку'; });
      });
    }
  }

  function renderStatsSummary(s, elId, style) {
    const el = document.getElementById(elId || 'stats-summary');
    if (!el || !s) return;
    if (style === 'personal') {
      const total = s.total_watched != null ? s.total_watched : (s.films_watched || 0) + (s.episodes_watched || 0);
      const cards = [
        { val: s.films_watched || 0, label: 'Фильмов', cls: 'stat-card-pink', icon: '🎬' },
        { val: (s.series_watched || 0) + ' / ' + (s.episodes_watched || 0), label: 'Сериалов / серий', cls: 'stat-card-green', icon: '📺' },
        { val: s.cinema_visits || 0, label: 'Походов в кино', cls: 'stat-card-cyan', icon: '🎥' },
        { val: total, label: 'Всего просмотров', cls: 'stat-card-purple', icon: '📊' },
        { val: s.avg_rating != null ? Number(s.avg_rating).toFixed(1) : '—', label: 'Средняя оценка', cls: 'stat-card-amber', icon: '⭐' }
      ];
      el.innerHTML = cards.map((c) => {
        let scrollTarget = null;
        if (c.label === 'Фильмов') scrollTarget = 'watched';
        else if (c.label === 'Средняя оценка') scrollTarget = 'rating-breakdown';
        else if (c.label === 'Сериалов / серий') scrollTarget = 'platforms';
        else if (c.label === 'Походов в кино') scrollTarget = 'cinema';
        const clickable = scrollTarget ? ' style="cursor:pointer" data-scroll-to="' + escapeHtml(scrollTarget) + '"' : '';
        return '<div class="stat-card ' + c.cls + '"' + clickable + '><div class="stat-card-icon">' + c.icon + '</div><div class="stat-card-value">' + escapeHtml(String(c.val)) + '</div><div class="stat-card-label">' + escapeHtml(c.label) + '</div></div>';
      }).join('');
      el.classList.add('stats-group-summary');
      // Bind click handlers for scroll (personal stats - both cabinet and public)
      el.querySelectorAll('.stat-card[data-scroll-to]').forEach((card) => {
        card.addEventListener('click', function() {
          const targetKey = this.getAttribute('data-scroll-to');
          // Try cabinet IDs first, then public IDs
          const targetIds = targetKey === 'watched' ? ['stats-watched', 'public-stats-personal-watched'] :
                           targetKey === 'rating-breakdown' ? ['stats-rating-breakdown', 'public-stats-personal-rating'] :
                           targetKey === 'platforms' ? ['stats-platforms', 'public-stats-personal-platforms'] :
                           targetKey === 'cinema' ? ['stats-cinema', 'public-stats-personal-cinema'] : [];
          let target = null;
          for (const id of targetIds) {
            target = document.getElementById(id);
            if (target) break;
          }
          if (target) scrollToStatsSection(target);
        });
      });
    } else {
      el.classList.remove('stats-group-summary');
      el.innerHTML = [
        { val: s.films_watched || 0, label: 'Фильмов' },
        { val: s.series_watched || 0, label: 'Сериалов' },
        { val: s.episodes_watched || 0, label: 'Серий' },
        { val: s.cinema_visits || 0, label: 'Походов в кино' },
        { val: s.total_watched != null ? s.total_watched : (s.films_watched || 0) + (s.episodes_watched || 0), label: 'Всего просмотров' },
        { val: s.avg_rating != null ? Number(s.avg_rating).toFixed(1) : '—', label: 'Средняя оценка' }
      ].map((x) => '<div class="stat-card"><div class="stat-card-value">' + escapeHtml(String(x.val)) + '</div><div class="stat-card-label">' + escapeHtml(x.label) + '</div></div>').join('');
    }
  }

  function renderStatsTopFilms(list, elId, period) {
    const el = document.getElementById(elId || 'stats-top-films');
    if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="stats-block-title">🏆 Топ оценок</div><p class="empty-hint">Нет данных за выбранный период.</p>'; return; }
    const VISIBLE = 5;
    const full = list.slice(0, 10);
    const visible = full.slice(0, VISIBLE);
    const hasMore = full.length > VISIBLE;
    let html = '<div class="stats-block-title">🏆 Топ оценок</div>';
    html += visible.map((f, i) => {
      const poster = posterUrl(f.kp_id);
      return '<div class="top-film-row"><span class="top-film-rank">' + (i + 1) + '</span>' +
        (poster ? '<img src="' + poster + '" alt="" class="top-film-poster" loading="lazy">' : '<div class="top-film-poster"></div>') +
        '<div class="top-film-info"><div class="top-film-name">' + escapeHtml(f.title || '') + '</div><div class="top-film-meta">' + escapeHtml((f.year ? f.year + ' · ' : '') + (f.genre || '')) + '</div></div>' +
        '<span class="top-film-rating">⭐ ' + (f.rating != null ? f.rating : '—') + '</span></div>';
    }).join('');
    if (hasMore) {
      const rest = full.slice(VISIBLE);
      html += '<div class="top-films-expand-wrap"><button type="button" class="top-films-expand-btn">Развернуть ещё ' + rest.length + '</button>';
      html += '<div class="top-films-rest hidden">' + rest.map((f, i) => {
        const poster = posterUrl(f.kp_id);
        return '<div class="top-film-row"><span class="top-film-rank">' + (VISIBLE + i + 1) + '</span>' +
          (poster ? '<img src="' + poster + '" alt="" class="top-film-poster" loading="lazy">' : '<div class="top-film-poster"></div>') +
          '<div class="top-film-info"><div class="top-film-name">' + escapeHtml(f.title || '') + '</div><div class="top-film-meta">' + escapeHtml((f.year ? f.year + ' · ' : '') + (f.genre || '')) + '</div></div>' +
          '<span class="top-film-rating">⭐ ' + (f.rating != null ? f.rating : '—') + '</span></div>';
      }).join('') + '</div></div>';
    }
    el.innerHTML = html;
    el.querySelector('.top-films-expand-btn')?.addEventListener('click', function () {
      const rest = el.querySelector('.top-films-rest');
      if (rest) { rest.classList.remove('hidden'); this.remove(); }
    });
  }

  const RATING_HSL = { 10: 'hsl(108,80%,55%)', 9: 'hsl(96,80%,55%)', 8: 'hsl(84,80%,55%)', 7: 'hsl(72,80%,55%)', 6: 'hsl(60,80%,55%)', 5: 'hsl(48,80%,55%)', 4: 'hsl(36,80%,55%)', 3: 'hsl(24,80%,55%)', 2: 'hsl(12,80%,55%)', 1: 'hsl(0,80%,55%)' };
  function renderStatsRatingBreakdown(rb, elId) {
    const el = document.getElementById(elId || 'stats-rating-breakdown');
    if (!el) return;
    const max = Math.max(1, ...Object.values(rb).map(Number));
    const rows = [];
    for (let i = 10; i >= 1; i--) {
      const c = rb[i] != null ? Number(rb[i]) : 0;
      const pct = max ? (c / max) * 100 : 0;
      const bg = c > 0 ? (RATING_HSL[i] || 'hsl(60,80%,55%)') : '';
      const fillInner = c > 0 ? String(c) : '';
      const minW = c > 0 ? 'min-width:24px;' : '';
      rows.push('<div class="rating-bar-row"><div class="rating-bar-label">' + i + '</div><div class="rating-bar-track"><div class="rating-bar-fill" style="width:' + pct + '%;' + minW + (bg ? 'background:' + bg : '') + '">' + fillInner + '</div></div><div class="rating-bar-count">' + c + '</div></div>');
    }
    el.innerHTML = '<div class="stats-block-title">📊 Распределение оценок</div>' + (rows.length ? rows.join('') : '<p class="empty-hint">Нет данных.</p>');
  }

  function renderStatsCinema(list, elId) {
    const el = document.getElementById(elId || 'stats-cinema');
    if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="stats-block-title">🎥 Походы в кино</div><p class="empty-hint">Нет походов в кино за выбранный период.</p>'; return; }
    el.innerHTML = '<div class="stats-block-title">🎥 Походы в кино</div>' + list.map((c) => {
      const poster = posterUrl(c.kp_id);
      const dateStr = c.date ? new Date(c.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return '<div class="watched-row">' +
        (poster ? '<img src="' + poster + '" alt="" class="top-film-poster" loading="lazy">' : '<div class="top-film-poster"></div>') +
        '<div class="top-film-info"><div class="top-film-name">' + escapeHtml(c.title || '') + '</div><div class="top-film-meta">' + escapeHtml((c.year ? c.year + ' · ' : '') + (dateStr || '') + (c.rating != null ? ' · ⭐ ' + c.rating : '')) + '</div></div></div>';
    }).join('');
  }

  function renderStatsPlatforms(list, elId) {
    const el = document.getElementById(elId || 'stats-platforms');
    if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="stats-block-title">📺 Платформы</div><p class="empty-hint">Нет данных за выбранный период.</p>'; return; }
    el.innerHTML = '<div class="stats-block-title">📺 Платформы</div>' + list.map((p) =>
      '<div class="platform-row"><span>' + escapeHtml(p.platform || '') + '</span><span>' + (p.count != null ? p.count : 0) + '</span></div>'
    ).join('');
  }

  function buildWatchedBlockHtml(list, period, options) {
    options = options || {};
    const canEdit = !!options.canEdit;
    const monthLabel = period && period.label ? (period.label.split(' ')[0] || '').toLowerCase() : '';
    const title = monthLabel ? '📋 Всё просмотренное за ' + monthLabel : '📋 Просмотренное';
    if (!list.length) return '<div class="stats-block-title">' + title + '</div><p class="empty-hint">Нет данных за выбранный период.</p>';
    const itemsHtml = list.map((w) => {
      const poster = posterUrl(w.kp_id);
      const dateObj = w.date ? new Date(w.date + 'T12:00:00') : null;
      const metaDate = dateObj ? (dateObj.getDate() + ' ' + MONTH_SHORT[(dateObj.getMonth())].toLowerCase()) : '';
      const metaStr = metaDate + (w.rating != null ? ' · ⭐ ' + w.rating : '');
      let badgeCls = 'badge-film';
      let badgeLabel = 'Фильм';
      if (w.is_cinema) { badgeCls = 'badge-cinema'; badgeLabel = 'Кино'; }
      else if (w.type === 'series') { badgeCls = 'badge-series'; badgeLabel = 'Сериал'; }
      const dataAttrs = ' data-film-id="' + (w.film_id || '') + '" data-source="' + (w.source || '') + '" data-user-id="' + (w.user_id != null ? String(w.user_id) : '') + '" data-can-change="' + (w.can_change_month && w.source ? '1' : '0') + '"';
      const actionsHtml = canEdit ? '<div class="watched-item-actions"><button type="button" class="watched-menu-dots" aria-label="Ещё">⋮</button><div class="watched-menu-dropdown hidden"><button type="button" data-action="change-watched-month">Изменить месяц просмотра</button></div></div>' : '';
      return '<div class="watched-item"' + dataAttrs + '>' +
        (poster ? '<img src="' + poster + '" alt="' + escapeHtml(w.title || '') + '" class="watched-poster" loading="lazy" onerror="this.style.background=\'var(--bg-surface-alt)\'">' : '<div class="watched-poster"></div>') +
        '<div class="watched-info"><div class="watched-name">' + escapeHtml(w.title || '') + '</div><div class="watched-meta">' + escapeHtml(metaStr) + '</div></div>' +
        '<span class="watched-badge ' + badgeCls + '">' + escapeHtml(badgeLabel) + '</span>' +
        actionsHtml + '</div>';
    }).join('');
    const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    const visibleCount = isMobile ? 7 : 16;
    const restCount = Math.max(0, list.length - visibleCount);
    const collapsedClass = restCount > 0 ? ' watched-list-collapsed' : '';
    let expandHtml = '';
    if (restCount > 0) {
      expandHtml = '<div class="watched-expand-wrap"><button type="button" class="watched-expand-btn">Развернуть ещё ' + restCount + '</button></div>';
    }
    return '<div class="stats-block-title">' + title + '</div><div class="watched-block-wrap' + collapsedClass + '"><div class="watched-list">' + itemsHtml + '</div>' + expandHtml + '</div>';
  }

  function bindWatchedExpand(container) {
    if (!container) return;
    container.querySelectorAll('.watched-expand-btn').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        const wrap = this.closest('.watched-block-wrap');
        if (wrap) { wrap.classList.remove('watched-list-collapsed'); this.parentElement?.remove(); }
      });
    });
  }

  function openChangeMonthModal(filmId, source, userId, isGroup, currentMonth, currentYear, onSuccess) {
    const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const now = new Date();
    let monthHtml = '';
    for (let m = 1; m <= 12; m++) monthHtml += '<option value="' + m + '"' + (m === currentMonth ? ' selected' : '') + '>' + MONTH_NAMES[m - 1] + '</option>';
    let yearHtml = '';
    for (let y = now.getFullYear(); y >= 2020; y--) yearHtml += '<option value="' + y + '"' + (y === currentYear ? ' selected' : '') + '>' + y + '</option>';
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'change-month-modal';
    modal.innerHTML =
      '<div class="modal-content">' +
        '<button type="button" class="modal-close" aria-label="Закрыть">&times;</button>' +
        '<div class="modal-title">Изменить месяц</div>' +
        '<div class="modal-hint">Укажите месяц, в который перенести просмотр. Ачивки не отзываются.</div>' +
        '<div class="change-month-fields">' +
          '<label>Месяц <select id="cmm-month-select">' + monthHtml + '</select></label>' +
          '<label>Год <select id="cmm-year-select">' + yearHtml + '</select></label>' +
        '</div>' +
        '<button type="button" class="modal-button modal-button-telegram" id="cmm-save-btn">Сохранить</button>' +
      '</div>';
    document.body.appendChild(modal);
    const monthSelect = modal.querySelector('#cmm-month-select');
    const yearSelect = modal.querySelector('#cmm-year-select');
    const close = function () { modal.remove(); };
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#cmm-save-btn').addEventListener('click', function () {
      const targetMonth = parseInt(monthSelect && monthSelect.value || 1, 10);
      const targetYear = parseInt(yearSelect && yearSelect.value || now.getFullYear(), 10);
      const body = { film_id: filmId, target_month: targetMonth, target_year: targetYear, source: source };
      if (isGroup && userId != null) body.user_id = userId;
      if (source === 'st') { body.current_month = currentMonth; body.current_year = currentYear; }
      api('/api/site/stats/set-watched-month', { method: 'PUT', body: JSON.stringify(body) }).then(function (res) {
        if (res && res.success) { close(); if (typeof onSuccess === 'function') onSuccess(); }
        else { alert(res && res.error ? res.error : 'Ошибка'); }
      }).catch(function (err) {
        console.warn('set-watched-month failed', err);
        alert('Не удалось сохранить. Проверьте интернет или попробуйте позже.');
      });
    });
  }

  function bindWatchedChangeMonth(container, period, options) {
    if (!container || !options || !options.canEdit || !period || period.month == null || period.year == null) return;
    const isGroup = !!options.isGroup;
    const currentMonth = period.month;
    const currentYear = period.year;
    const onSuccess = function () {
      const g = window._getStatsMonthYear ? window._getStatsMonthYear() : (function () {
        const y = document.getElementById('stats-year');
        const p = document.getElementById('stats-month-pills');
        const a = p && p.querySelector('.month-pill.active');
        return { m: a ? parseInt(a.getAttribute('data-month'), 10) : currentMonth, y: y ? parseInt(y.value, 10) : currentYear };
      })();
      loadStats(g.m, g.y);
    };
    container.querySelectorAll('.watched-menu-dots').forEach(function (dotsBtn) {
      if (dotsBtn._bound) return;
      dotsBtn._bound = true;
      dotsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var drop = this.nextElementSibling;
        container.querySelectorAll('.watched-menu-dropdown').forEach(function (d) { if (d !== drop) d.classList.add('hidden'); });
        if (drop && drop.classList) {
          drop.classList.toggle('hidden');
          var close = function (ev) {
            if (ev.target.closest('.watched-item-actions')) return;
            drop.classList.add('hidden');
            document.removeEventListener('click', close);
          };
          document.addEventListener('click', close);
        }
      });
    });
    container.querySelectorAll('[data-action="change-watched-month"]').forEach(function (btn) {
      if (btn._changeMonthBound) return;
      btn._changeMonthBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var item = this.closest('.watched-item');
        if (!item) return;
        var drop = this.closest('.watched-menu-dropdown');
        if (drop) drop.classList.add('hidden');
        var filmId = parseInt(item.getAttribute('data-film-id'), 10);
        var source = item.getAttribute('data-source') || '';
        if (!source) source = 'ensure_wm';
        var userIdVal = item.getAttribute('data-user-id');
        var userId = userIdVal !== '' && userIdVal != null ? parseInt(userIdVal, 10) : null;
        openChangeMonthModal(filmId, source, userId, isGroup, currentMonth, currentYear, onSuccess);
      });
    });
  }

  function renderStatsWatched(list, elId, period, options) {
    const el = document.getElementById(elId || 'stats-watched');
    if (!el) return;
    options = options || {};
    el.innerHTML = buildWatchedBlockHtml(list, period, options);
    bindWatchedExpand(el);
    bindWatchedChangeMonth(el, period, options);
  }

  // ——— FAQ аккордеон ———
  function bindFaq() {
    document.querySelectorAll('.faq-item').forEach((item) => {
      const head = item.querySelector('.faq-head');
      if (!head) return;
      head.addEventListener('click', () => item.classList.toggle('open'));
    });
  }

  // ——— Инициализация ———
  var carouselData = {}; // { carouselId: { goTo, getIdx, total } }

  function initCarousels() {
    document.querySelectorAll('.carousel[data-carousel]').forEach((carouselEl) => {
      const id = carouselEl.getAttribute('data-carousel');
      const track = carouselEl.querySelector('.carousel-track');
      const slides = carouselEl.querySelectorAll('.carousel-slide');
      const prevBtn = carouselEl.querySelector('.carousel-btn-prev');
      const nextBtn = carouselEl.querySelector('.carousel-btn-next');
      const dotsEl = document.querySelector('.carousel-dots[data-carousel="' + id + '"]');
      const total = slides.length;
      let idx = 0;
      if (!track || !total) return;
      function goTo(i) {
        idx = Math.max(0, Math.min(i, total - 1));
        track.style.transform = 'translateX(-' + idx * 100 + '%)';
        if (dotsEl) {
          dotsEl.querySelectorAll('.dot').forEach((d, di) => d.classList.toggle('active', di === idx));
        }
      }
      function renderDots() {
        if (!dotsEl) return;
        dotsEl.innerHTML = '';
        for (let i = 0; i < total; i++) {
          const dot = document.createElement('span');
          dot.className = 'dot' + (i === 0 ? ' active' : '');
          dot.setAttribute('aria-label', 'Слайд ' + (i + 1));
          dot.addEventListener('click', () => goTo(i));
          dotsEl.appendChild(dot);
        }
      }
      renderDots();
      if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); goTo(idx - 1); });
      if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); goTo(idx + 1); });

      // Swipe support
      let touchStartX = 0, touchEndX = 0;
      carouselEl.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
      carouselEl.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        var diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 40) {
          if (diff > 0) goTo(idx + 1);
          else goTo(idx - 1);
        }
      }, { passive: true });

      carouselData[id] = { goTo: goTo, getIdx: function() { return idx; }, total: total, slides: slides };
    });
  }

  function initLightbox() {
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightbox-img');
    const backdrop = lb && lb.querySelector('.lightbox-backdrop');
    const closeBtn = lb && lb.querySelector('.lightbox-close');
    const content = lb && lb.querySelector('.lightbox-content');
    const prevBtn = lb && lb.querySelector('.lightbox-prev');
    const nextBtn = lb && lb.querySelector('.lightbox-next');
    if (!lb || !lbImg) return;

    var currentCarouselId = null;
    var currentIdx = 0;
    var allImages = [];

    function showImage(i) {
      if (i < 0 || i >= allImages.length) return;
      currentIdx = i;
      lbImg.src = allImages[i].src;
      lbImg.alt = allImages[i].alt || '';
      lbImg.classList.remove('zoomed', 'zoomed-2');
      // Sync carousel
      if (currentCarouselId && carouselData[currentCarouselId]) {
        carouselData[currentCarouselId].goTo(i);
      }
    }

    function prevImage() { showImage(currentIdx - 1); }
    function nextImage() { showImage(currentIdx + 1); }

    document.querySelectorAll('.carousel-img').forEach((img) => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        // Find which carousel this image belongs to
        var carouselEl = img.closest('.carousel[data-carousel]');
        if (carouselEl) {
          currentCarouselId = carouselEl.getAttribute('data-carousel');
          var slides = carouselEl.querySelectorAll('.carousel-img');
          allImages = Array.from(slides);
          currentIdx = allImages.indexOf(img);
        } else {
          currentCarouselId = null;
          allImages = [img];
          currentIdx = 0;
        }
        showImage(currentIdx);
        lb.classList.remove('hidden');
        lb.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      });
    });

    function close() {
      lb.classList.add('hidden');
      lb.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    // Click on left/right side of lightbox content navigates
    if (content) {
      content.addEventListener('click', (e) => {
        if (e.target === lbImg) return; // handled separately
        var rect = content.getBoundingClientRect();
        var x = e.clientX - rect.left;
        if (x < rect.width * 0.25 && currentIdx > 0) {
          prevImage();
        } else if (x > rect.width * 0.75 && currentIdx < allImages.length - 1) {
          nextImage();
        } else {
          close();
        }
      });
    }

    if (backdrop) backdrop.addEventListener('click', close);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prevImage(); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); nextImage(); });

    lbImg.addEventListener('click', (e) => {
      e.stopPropagation();
      var rect = lbImg.getBoundingClientRect();
      var x = e.clientX - rect.left;
      // If not zoomed, clicking sides navigates
      if (!lbImg.classList.contains('zoomed') && !lbImg.classList.contains('zoomed-2')) {
        if (x < rect.width * 0.25 && currentIdx > 0) {
          prevImage();
          return;
        } else if (x > rect.width * 0.75 && currentIdx < allImages.length - 1) {
          nextImage();
          return;
        }
      }
      // Otherwise toggle zoom
      if (lbImg.classList.contains('zoomed-2')) {
        lbImg.classList.remove('zoomed', 'zoomed-2');
      } else if (lbImg.classList.contains('zoomed')) {
        lbImg.classList.remove('zoomed');
        lbImg.classList.add('zoomed-2');
      } else {
        lbImg.classList.add('zoomed');
      }
    });

    // Swipe support in lightbox
    let lbTouchStartX = 0;
    lb.addEventListener('touchstart', (e) => { lbTouchStartX = e.changedTouches[0].screenX; }, { passive: true });
    lb.addEventListener('touchend', (e) => {
      var diff = lbTouchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 40) {
        if (diff > 0) nextImage();
        else prevImage();
      }
    }, { passive: true });

    document.addEventListener('keydown', function(e) {
      if (lb.classList.contains('hidden')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') prevImage();
      if (e.key === 'ArrowRight') nextImage();
    });
  }

  // ====================================================================
  // TV / Streaming / Tickets — расширенные кнопки в карточках фильмов
  // ====================================================================

  // Старый набор раздельных кнопок — больше не используется в карточках.
  // Оставлен как shim на случай, если вдруг вызов остался где-то ещё.
  function buildFilmExtraButtons(item) {
    return buildFilmActionBar(item);
  }

  // Маленький прозрачный треугольник в углу постера — быстрый переход в Telegram.
  function buildFilmTelegramTriangle(link) {
    return '';
  }

  // Кнопка со звёздочкой в углу постера — быстрая оценка фильма.
  function buildFilmRateStar(filmId, currentRating) {
    if (!filmId) return '';
    const cur = Number(currentRating) || 0;
    const label = cur ? `${cur}/10` : '';
    return (
      `<button type="button" class="film-card-rate-star${cur ? ' is-rated' : ''}" ` +
      `data-rate-star="1" data-rate-film-id="${filmId}" data-current-rating="${cur}" ` +
      `title="Оценить фильм" aria-label="Оценить фильм">` +
      `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 2.5l2.955 6.305 6.545.835-4.77 4.62 1.2 6.74L12 17.77l-5.93 3.23 1.2-6.74L2.5 9.64l6.545-.835L12 2.5z"/></svg>` +
      (label ? `<span class="film-card-rate-star-label">${label}</span>` : '') +
      `</button>`
    );
  }

  // Единая панель действий: «Запланировать ▾» + «Смотреть ▾».
  // item: { kp_id, title, year, is_series?, plan_type? ('cinema'|'home'), in_cinema? }
  function buildFilmActionBar(item) {
    if (!item || !item.kp_id) return '';
    const kp = String(item.kp_id).replace(/\D/g, '');
    if (!kp) return '';
    const titleAttr = escapeHtml(item.title || '');
    const yearAttr = escapeHtml(String(item.year || ''));
    const showCinemaWatch = item.plan_type === 'cinema' || item.in_cinema === true;

    const planItems = [
      `<button type="button" class="action-dropdown-item" data-goto-plans="home">🏠 Дома</button>`,
      `<button type="button" class="action-dropdown-item" data-goto-plans="cinema">🎥 В кино</button>`,
      `<button type="button" class="action-dropdown-item" data-plans-action="open-add-film">＋ Добавить фильм</button>`,
    ].join('');

    const watchItems = [];
    watchItems.push(
      `<button type="button" class="action-dropdown-item" data-streaming="1" data-kp="${kp}">🎞 Онлайн</button>`
    );
    if (tvSettings && tvSettings.tv_type) {
      watchItems.push(
        `<button type="button" class="action-dropdown-item" data-tv-launch="1" data-kp="${kp}" data-title="${titleAttr}">📺 На ТВ</button>`
      );
    }
    if (showCinemaWatch) {
      watchItems.push(
        `<button type="button" class="action-dropdown-item" data-tickets="1" data-kp="${kp}" data-title="${titleAttr}" data-year="${yearAttr}">🎫 В кино (билет)</button>`
      );
    }

    return (
      `<div class="film-action-bar">` +
        `<div class="action-dropdown" data-dropdown-root="plan">` +
          `<button type="button" class="action-dropdown-btn action-dropdown-btn-plan" data-dropdown-toggle="1">` +
            `<span class="action-dropdown-btn-label">📅 Запланировать</span>` +
            `<span class="action-dropdown-caret">▾</span>` +
          `</button>` +
          `<div class="action-dropdown-menu">${planItems}</div>` +
        `</div>` +
        `<div class="action-dropdown" data-dropdown-root="watch">` +
          `<button type="button" class="action-dropdown-btn action-dropdown-btn-watch" data-dropdown-toggle="1">` +
            `<span class="action-dropdown-btn-label">▶️ Смотреть</span>` +
            `<span class="action-dropdown-caret">▾</span>` +
          `</button>` +
          `<div class="action-dropdown-menu">${watchItems.join('')}</div>` +
        `</div>` +
      `</div>`
    );
  }

  function closeAllActionDropdowns(except) {
    document.querySelectorAll('.action-dropdown.open').forEach((el) => {
      if (el !== except) el.classList.remove('open');
    });
  }

  // ====================================================================
  // Мини-попап быстрой оценки (при клике на звёздочку в углу постера)
  // ====================================================================

  function closeRatePopover() {
    document.querySelectorAll('.rate-popover').forEach((el) => el.remove());
  }

  function openRatePopover(starBtn) {
    closeRatePopover();
    closeAllActionDropdowns();
    closeAllFilmPopovers && closeAllFilmPopovers();

    const filmId = Number(starBtn.getAttribute('data-rate-film-id'));
    if (!filmId) return;
    const cur = Number(starBtn.getAttribute('data-current-rating')) || 0;
    const card = starBtn.closest('[data-film-id]');
    const context = card ? (card.getAttribute('data-context') || '') : '';

    const pop = document.createElement('div');
    pop.className = 'rate-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Оцените фильм');

    const stars = [];
    for (let i = 1; i <= 10; i += 1) {
      const filled = cur >= i ? ' is-filled' : '';
      stars.push(
        `<button type="button" class="rate-popover-star${filled}" data-rate-value="${i}" aria-label="Оценить на ${i}">${i}</button>`
      );
    }
    const removeBtn = cur
      ? `<button type="button" class="rate-popover-remove" data-rate-remove="1">✕ Убрать оценку</button>`
      : '';
    pop.innerHTML =
      `<div class="rate-popover-header">` +
        `<span class="rate-popover-title">Ваша оценка</span>` +
        `<button type="button" class="rate-popover-close" data-rate-close="1" aria-label="Закрыть">×</button>` +
      `</div>` +
      `<div class="rate-popover-stars">${stars.join('')}</div>` +
      (removeBtn ? `<div class="rate-popover-actions">${removeBtn}</div>` : '');

    document.body.appendChild(pop);

    positionRatePopover(pop, starBtn);

    pop._filmId = filmId;
    pop._context = context;
    pop._starBtn = starBtn;

    pop.querySelectorAll('.rate-popover-star').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        const v = Number(el.getAttribute('data-rate-value'));
        pop.querySelectorAll('.rate-popover-star').forEach((b) => {
          const bv = Number(b.getAttribute('data-rate-value'));
          b.classList.toggle('is-filled', bv <= v);
        });
      });
      el.addEventListener('mouseleave', () => {
        const curVal = Number(starBtn.getAttribute('data-current-rating')) || 0;
        pop.querySelectorAll('.rate-popover-star').forEach((b) => {
          const bv = Number(b.getAttribute('data-rate-value'));
          b.classList.toggle('is-filled', bv <= curVal);
        });
      });
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const v = Number(el.getAttribute('data-rate-value'));
        submitQuickRating(filmId, v, context, starBtn);
      });
    });
    const rm = pop.querySelector('[data-rate-remove="1"]');
    if (rm) {
      rm.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        submitQuickRatingDelete(filmId, context, starBtn);
      });
    }
    const closeBtn = pop.querySelector('[data-rate-close="1"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeRatePopover();
      });
    }
  }

  function positionRatePopover(pop, anchor) {
    const rect = anchor.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    pop.style.position = 'absolute';
    pop.style.zIndex = '200';
    // временно прикрепим в DOM, чтобы измерить
    pop.style.left = '-9999px';
    pop.style.top = '-9999px';
    const pw = pop.offsetWidth || 280;
    const ph = pop.offsetHeight || 140;
    const vw = window.innerWidth;
    let left = rect.left + scrollX + rect.width / 2 - pw / 2;
    if (left < 12) left = 12;
    if (left + pw > vw - 12) left = vw - 12 - pw;
    let top = rect.bottom + scrollY + 8;
    if (top + ph > (scrollY + window.innerHeight) - 12) {
      top = rect.top + scrollY - ph - 8;
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function submitQuickRating(filmId, rating, context, starBtn) {
    api('/api/site/film/' + filmId + '/rating', {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }).then((res) => {
      if (!res || !res.success) {
        alert((res && res.error) || 'Не удалось сохранить оценку');
        return;
      }
      closeRatePopover();
      // Обновляем локальные кэши карточек
      if (typeof _filmModalCache !== 'undefined' && _filmModalCache[filmId]) {
        const cache = _filmModalCache[filmId];
        const myUserId = (cache.me && cache.me.user_id) || cabinetUserId;
        const idx = cache.ratings.findIndex((r) => String(r.user_id) === String(myUserId));
        const row = { user_id: myUserId, rating, username: 'Вы' };
        if (idx >= 0) cache.ratings[idx] = row; else cache.ratings.unshift(row);
        cache.film.watched = true;
      }
      // Обновляем звёздочку на карточке
      if (starBtn) {
        starBtn.setAttribute('data-current-rating', String(rating));
        starBtn.classList.add('is-rated');
        const lbl = starBtn.querySelector('.film-card-rate-star-label');
        if (lbl) lbl.textContent = rating + '/10';
        else {
          const newLbl = document.createElement('span');
          newLbl.className = 'film-card-rate-star-label';
          newLbl.textContent = rating + '/10';
          starBtn.appendChild(newLbl);
        }
      }
      // Обновляем списки
      if (typeof applyRatingToLists === 'function') applyRatingToLists(filmId, rating);
      // Если оценили из планов — удаляем этот фильм из плановых карточек на фронте.
      // Бэкенд (site_film_rating) также удаляет записи из plans.
      if (context === 'plan') {
        if (typeof loadPlans === 'function') loadPlans();
      }
    }).catch(() => {
      alert('Сервер не отвечает. Попробуйте позже.');
    });
  }

  function submitQuickRatingDelete(filmId, context, starBtn) {
    api('/api/site/film/' + filmId + '/rating', { method: 'DELETE' }).then((res) => {
      if (!res || !res.success) {
        alert((res && res.error) || 'Не удалось удалить оценку');
        return;
      }
      closeRatePopover();
      if (starBtn) {
        starBtn.setAttribute('data-current-rating', '0');
        starBtn.classList.remove('is-rated');
        const lbl = starBtn.querySelector('.film-card-rate-star-label');
        if (lbl) lbl.remove();
      }
      if (typeof removeRatingFromLists === 'function') removeRatingFromLists(filmId);
    });
  }

  function closeAllFilmPopovers() {
    document.querySelectorAll('.streaming-popover, .tickets-popover').forEach((el) => el.remove());
  }

  function buildStreamingPopover(anchorBtn, kpId) {
    closeAllFilmPopovers();
    const pop = document.createElement('div');
    pop.className = 'streaming-popover';
    pop.innerHTML = '<div class="streaming-popover-empty">Ищем онлайн-кинотеатры…</div>';
    document.body.appendChild(pop);
    const rect = anchorBtn.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';
    pop.style.top = (rect.bottom + 6) + 'px';
    apiPublic('/api/extension/streaming-services?kp_id=' + encodeURIComponent(kpId)).then((data) => {
      const services = (data && data.services) || [];
      if (!services.length) {
        pop.innerHTML = '<div class="streaming-popover-empty">Фильм пока не найден ни на одном онлайн-кинотеатре.<br>Попробуйте позже.</div>';
        return;
      }
      pop.innerHTML = services.map((s) => {
        const name = escapeHtml(s.name || '');
        const url = escapeHtml(s.url || '#');
        const icon = iconForStreaming(s.name || '');
        return `<a href="${url}" target="_blank" rel="noopener" class="streaming-popover-item"><span>${icon}</span><span>${name}</span></a>`;
      }).join('');
    }).catch(() => {
      pop.innerHTML = '<div class="streaming-popover-empty">Ошибка загрузки. Попробуйте позже.</div>';
    });
    setTimeout(() => {
      document.addEventListener('click', function onDoc(e) {
        if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', onDoc); }
      });
    }, 0);
  }

  function iconForStreaming(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('кинопоиск') || n.includes('kinopoisk')) return '🟡';
    if (n.includes('okko')) return '🟠';
    if (n.includes('ivi')) return '🔵';
    if (n.includes('netflix')) return '🔴';
    if (n.includes('more') || n.includes('start')) return '🟢';
    if (n.includes('premier') || n.includes('премьер')) return '🟣';
    return '🎬';
  }

  function buildTicketsPopover(anchorBtn, title, year) {
    closeAllFilmPopovers();
    const q = encodeURIComponent((title || '') + (year ? ' ' + year : ''));
    const kp = anchorBtn.getAttribute('data-kp');
    const kpSessionsUrl = kp ? `https://www.kinopoisk.ru/film/${kp}/sessions/` : `https://www.kinopoisk.ru/s/?query=${q}`;
    const yaUrl = `https://afisha.yandex.ru/events/?text=${q}`;
    const ramblerUrl = `https://www.rambler.ru/search?query=${q}+%D0%B1%D0%B8%D0%BB%D0%B5%D1%82%D1%8B&utm_source=kassa`;
    const items = [
      { icon: '🟡', name: 'Кинопоиск — сеансы', url: kpSessionsUrl, sub: 'Все кинотеатры в одном месте' },
      { icon: '🔴', name: 'Яндекс.Афиша', url: yaUrl, sub: 'Сеансы и покупка билета' },
      { icon: '🟣', name: 'Рамблер/касса', url: ramblerUrl, sub: 'Поиск сеансов' },
    ];
    const pop = document.createElement('div');
    pop.className = 'streaming-popover tickets-popover';
    pop.innerHTML = items.map((it) => (
      `<a href="${escapeHtml(it.url)}" target="_blank" rel="noopener" class="streaming-popover-item">
        <span>${it.icon}</span>
        <span><b>${escapeHtml(it.name)}</b><br><small style="color:var(--text-muted,#aaa)">${escapeHtml(it.sub)}</small></span>
      </a>`
    )).join('');
    document.body.appendChild(pop);
    const rect = anchorBtn.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
    pop.style.top = (rect.bottom + 6) + 'px';
    setTimeout(() => {
      document.addEventListener('click', function onDoc(e) {
        if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', onDoc); }
      });
    }, 0);
  }

  function showTvLaunchModal(kpId, title) {
    const modal = document.createElement('div');
    modal.className = 'tv-launch-modal';
    modal.innerHTML = `
      <div class="tv-launch-box" style="position:relative">
        <button type="button" class="tv-launch-close" aria-label="Закрыть">×</button>
        <h3>📺 Запуск на ТВ</h3>
        <div class="tv-launch-sub">${escapeHtml(title || 'Фильм')}</div>
        <div id="tv-launch-content"><div style="color:var(--text-muted,#aaa);padding:16px 0;">Отправляю команду…</div></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.tv-launch-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    api('/api/site/tv/launch', {
      method: 'POST',
      body: JSON.stringify({ kp_id: kpId, title: title || '' }),
    }).then((data) => {
      const c = modal.querySelector('#tv-launch-content');
      if (!c) return;
      if (!data.success) {
        c.innerHTML = '<div style="color:#ff7a7a;padding:12px 0;">Не удалось отправить команду: ' + escapeHtml(data.error || '') + '</div>';
        return;
      }
      const cast = data.cast_url;
      const agentMsg = data.agent_sent
        ? '<div style="color:#34c759;margin-bottom:10px;font-weight:600;">⚡ Команда отправлена агенту — фильм скоро запустится на ТВ.</div>'
        : '<div style="color:var(--text-muted,#aaa);margin-bottom:10px;">Отсканируйте QR-код пультом ТВ или откройте страницу запуска на телефоне.</div>';
      const qrSrc = API_BASE + '/api/tv/qr/' + encodeURIComponent(kpId);
      c.innerHTML = `
        ${agentMsg}
        <img class="tv-launch-qr" src="${qrSrc}" alt="QR">
        <div class="tv-launch-btns">
          <a class="btn btn-primary" href="${escapeHtml(cast)}" target="_blank" rel="noopener">🚀 Открыть страницу запуска</a>
          <a class="btn btn-secondary" href="https://hd.kinopoisk.ru/film/${encodeURIComponent(kpId)}" target="_blank" rel="noopener">🟡 Прямо в Кинопоиск HD</a>
        </div>`;
    });
  }

  // ————— Секция «Телевизор» в кабинете —————

  function loadTvSettings() {
    return api('/api/site/tv/settings').then((data) => {
      if (data && data.success) {
        tvSettings = {
          tv_type: data.tv_type || null,
          agent_token_exists: !!data.agent_token_exists,
          agent_online: !!data.agent_online,
        };
      }
      return tvSettings;
    });
  }

  function renderTvSection() {
    const wrap = document.getElementById('tv-settings-wrap');
    if (!wrap) return;
    loadTvSettings().then(() => {
      const grid = document.getElementById('tv-type-grid');
      if (grid) {
        grid.querySelectorAll('.tv-type-btn').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-tv') === tvSettings.tv_type);
          if (!b._bound) {
            b._bound = true;
            b.addEventListener('click', () => {
              const tv = b.getAttribute('data-tv');
              const newType = (tvSettings.tv_type === tv) ? null : tv;
              api('/api/site/tv/settings', {
                method: 'POST',
                body: JSON.stringify({ tv_type: newType }),
              }).then((data) => {
                if (data && data.success) {
                  tvSettings.tv_type = data.tv_type || null;
                  renderTvSection();
                  // Перерисовать карточки, чтобы обновилась кнопка «На ТВ»
                  if (typeof loadUnwatched === 'function') loadUnwatched();
                  loadPlans();
                  loadSeries();
                  loadRatings();
                }
              });
            });
          }
        });
      }
      const status = document.getElementById('tv-current-status');
      if (status) {
        const names = {
          android_tv: 'Android TV / Яндекс ТВ / Google TV',
          samsung: 'Samsung Smart TV (Tizen)',
          lg: 'LG Smart TV (WebOS)',
          other: 'Smart TV',
        };
        if (!tvSettings.tv_type) {
          status.classList.add('hidden');
          status.classList.remove('is-warn', 'is-ok');
        } else {
          status.classList.remove('hidden');
          const tvName = escapeHtml(names[tvSettings.tv_type] || tvSettings.tv_type);
          const needsAgent = (tvSettings.tv_type === 'android_tv');
          if (needsAgent) {
            if (tvSettings.agent_online) {
              status.classList.remove('is-warn');
              status.classList.add('is-ok');
              status.innerHTML = '✅ <b>' + tvName + '</b> подключён, агент онлайн — фильм запускается в один клик.';
            } else if (tvSettings.agent_token_exists) {
              status.classList.remove('is-ok');
              status.classList.add('is-warn');
              status.innerHTML = '⚠️ <b>' + tvName + '</b> выбран, токен агента создан, но агент ещё не онлайн. Запустите агент на домашнем устройстве — тогда фильмы будут запускаться сразу.';
            } else {
              status.classList.remove('is-ok');
              status.classList.add('is-warn');
              status.innerHTML = '☑️ <b>' + tvName + '</b> выбран. Запуск через QR-код уже работает. Для <b>мгновенного запуска</b> сгенерируйте токен агента ниже и поднимите его дома.';
            }
          } else {
            status.classList.remove('is-warn');
            status.classList.add('is-ok');
            status.innerHTML = '✅ <b>' + tvName + '</b> выбран. В карточках фильмов появилась кнопка «📺 На ТВ» — откроется страница запуска с QR-кодом, Cast и ссылками на стриминги.';
          }
        }
      }
      const agentBlock = document.getElementById('tv-agent-block');
      if (agentBlock) {
        if (tvSettings.tv_type === 'android_tv') agentBlock.classList.remove('hidden');
        else agentBlock.classList.add('hidden');
      }
      const badge = document.getElementById('tv-agent-status-badge');
      if (badge) {
        if (tvSettings.agent_token_exists) {
          badge.textContent = tvSettings.agent_online ? 'онлайн' : 'токен сгенерирован';
          badge.classList.toggle('online', !!tvSettings.agent_online);
        } else {
          badge.textContent = 'не подключён';
          badge.classList.remove('online');
        }
      }
      const createBtn = document.getElementById('tv-agent-create-btn');
      const revealBtn = document.getElementById('tv-agent-reveal-btn');
      const resetBtn = document.getElementById('tv-agent-reset-btn');
      const tokenWrap = document.getElementById('tv-agent-token-wrap');
      if (createBtn) createBtn.classList.toggle('hidden', tvSettings.agent_token_exists);
      if (revealBtn) revealBtn.classList.toggle('hidden', !tvSettings.agent_token_exists);
      if (resetBtn) resetBtn.classList.toggle('hidden', !tvSettings.agent_token_exists);

      if (createBtn && !createBtn._bound) {
        createBtn._bound = true;
        createBtn.addEventListener('click', () => {
          api('/api/site/tv/agent/regenerate', { method: 'POST' }).then((data) => {
            if (data && data.success) {
              tvSettings.agent_token_exists = true;
              showAgentToken(data.token);
              renderTvSection();
            }
          });
        });
      }
      if (revealBtn && !revealBtn._bound) {
        revealBtn._bound = true;
        revealBtn.addEventListener('click', () => {
          api('/api/site/tv/agent/reveal').then((data) => {
            if (data && data.success && data.token) showAgentToken(data.token);
          });
        });
      }
      if (resetBtn && !resetBtn._bound) {
        resetBtn._bound = true;
        resetBtn.addEventListener('click', () => {
          if (!confirm('Сбросить токен агента? Старый агент перестанет работать.')) return;
          api('/api/site/tv/agent', { method: 'DELETE' }).then((data) => {
            if (data && data.success) {
              tvSettings.agent_token_exists = false;
              if (tokenWrap) tokenWrap.classList.add('hidden');
              renderTvSection();
            }
          });
        });
      }
    });
  }

  function showAgentToken(token) {
    const wrap = document.getElementById('tv-agent-token-wrap');
    const value = document.getElementById('tv-agent-token-value');
    const cmd = document.getElementById('tv-agent-install-cmd');
    if (!wrap || !value || !cmd) return;
    value.textContent = token;
    cmd.textContent =
      'git clone https://github.com/Movie-Planner/moviebot-tv-agent.git\n' +
      'cd moviebot-tv-agent\n' +
      'pip install -r requirements.txt\n' +
      'MP_AGENT_TOKEN=' + token + ' MP_API_BASE=https://movie-planner.ru TV_IP=192.168.1.X python agent.py';
    wrap.classList.remove('hidden');
  }

  // Делегированные клики по кнопкам в карточках
  document.addEventListener('click', (e) => {
    // Треугольник Telegram в углу постера — не мешаем клику по ссылке,
    // но закрываем выпадашки и не даём сработать клику по карточке.
    const tgTriangle = e.target.closest('.film-card-tg-triangle');
    if (tgTriangle) {
      e.stopPropagation();
      closeAllActionDropdowns();
      closeRatePopover();
      return;
    }
    // Звёздочка быстрой оценки в углу постера.
    const rateStar = e.target.closest('[data-rate-star="1"]');
    if (rateStar) {
      e.preventDefault();
      e.stopPropagation();
      openRatePopover(rateStar);
      return;
    }
    // Переключение выпадающего меню (Запланировать/Смотреть).
    const ddToggle = e.target.closest('[data-dropdown-toggle="1"]');
    if (ddToggle) {
      e.preventDefault();
      e.stopPropagation();
      const root = ddToggle.closest('.action-dropdown');
      if (root) {
        const wasOpen = root.classList.contains('open');
        closeAllActionDropdowns(wasOpen ? null : root);
        if (wasOpen) root.classList.remove('open');
        else root.classList.add('open');
      }
      return;
    }
    const tvBtn = e.target.closest('[data-tv-launch="1"]');
    if (tvBtn) {
      e.preventDefault();
      e.stopPropagation();
      closeAllActionDropdowns();
      const kp = tvBtn.getAttribute('data-kp');
      const title = tvBtn.getAttribute('data-title') || '';
      if (kp) showTvLaunchModal(kp, title);
      return;
    }
    const streamingBtn = e.target.closest('[data-streaming="1"]');
    if (streamingBtn) {
      e.preventDefault();
      e.stopPropagation();
      closeAllActionDropdowns();
      const kp = streamingBtn.getAttribute('data-kp');
      if (kp) buildStreamingPopover(streamingBtn, kp);
      return;
    }
    const ticketsBtn = e.target.closest('[data-tickets="1"]');
    if (ticketsBtn) {
      e.preventDefault();
      e.stopPropagation();
      closeAllActionDropdowns();
      const title = ticketsBtn.getAttribute('data-title') || '';
      const year = ticketsBtn.getAttribute('data-year') || '';
      buildTicketsPopover(ticketsBtn, title, year);
      return;
    }
    // Клик в любое место, кроме меню — закрываем открытые дропдауны.
    if (!e.target.closest('.action-dropdown-menu')) {
      closeAllActionDropdowns();
    }
    // Закрываем попап оценки, если кликнули вне него и вне звёздочки.
    if (!e.target.closest('.rate-popover') && !e.target.closest('[data-rate-star="1"]')) {
      closeRatePopover();
    }

    // Закрытие модалки
    const closer = e.target.closest('[data-action="close-film-modal"]');
    if (closer) {
      e.preventDefault();
      closeFilmModal();
      return;
    }

    // Открытие модалки фильма по явной кнопке (например, из Add-Film-Modal)
    const openBtn = e.target.closest('[data-action="open-film-modal"]');
    if (openBtn) {
      e.preventDefault();
      const fid = openBtn.getAttribute('data-film-id');
      if (fid) {
        closeAddFilmModal();
        if (typeof openFilmModal === 'function') openFilmModal(Number(fid));
      }
      return;
    }

    // Клик по карточке фильма → открыть модалку (вместо перехода в Telegram)
    const card = e.target.closest('[data-film-id]');
    if (card) {
      // Не перехватываем клик, если клик был по кнопке действия внутри карточки
      // (tel-btn, streaming-btn, tickets-btn, "В Telegram").
      const actionBtn = e.target.closest('.btn-primary, .film-tv-btn, .film-streaming-btn, .tickets-btn, a[href^="http"].btn, [data-action], .film-card-tg-triangle, .action-dropdown, .action-dropdown-btn, .action-dropdown-item, [data-dropdown-toggle], [data-rate-star], .rate-popover');
      // "В Telegram" теперь должна нормально открываться — её не блокируем.
      if (actionBtn && actionBtn !== card && !actionBtn.classList.contains('film-card-main')) {
        return;
      }
      const filmId = card.getAttribute('data-film-id');
      if (!filmId) return;
      // Пропускаем спец-модификаторы (средний клик, ctrl/cmd-клик — пусть открывают Telegram)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      openFilmModal(Number(filmId));
    }
  });

  // ====================================================================
  // Film Modal: подробности, оценка, «посмотрено», похожие
  // ====================================================================

  const _filmModalCache = Object.create(null);
  let _filmModalCurrentId = null;
  let _filmModalPreviewRating = 0; // hover-подсветка звёзд

  function closeFilmModal() {
    const modal = document.getElementById('film-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (!isFilmPageOpen()) {
      _filmModalCurrentId = null;
    }
    _filmModalPreviewRating = 0;
  }

  function openFilmPage(filmId, opts) {
    const o = opts || {};
    if (!getToken()) {
      showToast('Войдите в кабинет');
      return;
    }
    const pageRoot = document.getElementById('film-page-content');
    if (!pageRoot) {
      showToast('Страница фильма недоступна');
      return;
    }
    closeAddFilmModal();
    closeFilmModal();
    _filmModalCurrentId = filmId;
    showScreen('cabinet-readonly');
    showFilmPageLayout();
    if (!o.skipHistory) {
      try {
        const path = '/film/' + filmId;
        (o.replace ? history.replaceState : history.pushState).call(history, { view: 'film', filmId }, '', path);
      } catch (e) {}
    }

    const runLoad = (cached) => {
      if (cached) {
        setFilmPageToolbar(cached.film);
        try {
          document.title = (cached.film && cached.film.title ? cached.film.title + ' · Movie Planner' : DEFAULT_DOC_TITLE);
        } catch (e) {}
        renderFilmDetail(cached.film, cached.ratings, cached.similar, cached.me, pageRoot);
      } else {
        pageRoot.className = 'container film-page-container film-modal-content loading';
        pageRoot.innerHTML = 'Загрузка…';
        setFilmPageToolbar({ title: 'Загрузка…', is_series: false });
      }
    };
    if (_filmModalCache[filmId]) {
      runLoad(_filmModalCache[filmId]);
    } else {
      runLoad(null);
    }
    return Promise.all([
      api('/api/site/film/' + filmId),
      api('/api/site/film/' + filmId + '/similar').catch(() => ({ success: true, items: [] })),
    ]).then(([detail, sim]) => {
      if (!detail || !detail.success) {
        pageRoot.className = 'container film-page-container';
        pageRoot.innerHTML = '<p class="film-page-error-hint">Не удалось загрузить: ' + escapeHtml((detail && detail.error) || 'ошибка') + '</p><p class="film-page-error-actions"><button type="button" class="btn btn-primary" data-action="close-film-page">← Назад</button></p>';
        setFilmPageToolbar({ title: 'Ошибка', is_series: false });
        return;
      }
      if (_filmModalCurrentId !== filmId) return;
      const data = {
        film: detail.film,
        ratings: detail.ratings || [],
        me: detail.me || { user_id: cabinetUserId },
        similar: (sim && sim.items) || [],
      };
      try { pushHeaderFilmRecent(detail.film); } catch (e) {}
      _filmModalCache[filmId] = { film: data.film, ratings: data.ratings, similar: data.similar, me: data.me };
      try { document.title = (data.film && data.film.title ? data.film.title + ' · Movie Planner' : DEFAULT_DOC_TITLE); } catch (e) {}
      renderFilmDetail(data.film, data.ratings, data.similar, data.me, pageRoot);
      setFilmPageToolbar(data.film);
      try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) { try { window.scrollTo(0, 0); } catch (_) {} }
    });
  }

  function closeFilmPage() {
    restoreDocumentTitle();
    if (window.history.length > 1) {
      try { window.history.back(); } catch (e) { showSection('home', { replace: true }); try { scheduleHomeDashboardRefresh(); } catch (_) {} }
    } else {
      showSection('home', { replace: true });
      try { scheduleHomeDashboardRefresh(); } catch (_) {}
    }
  }

  function openFilmModal(filmId) {
    return openFilmPage(filmId, {});
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isFilmPageOpen() && _filmModalCurrentId != null) {
      e.preventDefault();
      closeFilmPage();
      return;
    }
    if (!isFilmPageOpen() && _filmModalCurrentId != null) closeFilmModal();
  });

  function renderFilmModal(film, ratings, similar, me) {
    const content = getFilmRenderRoot() || document.getElementById('film-modal-content');
    if (!content) return;
    return renderFilmDetail(film, ratings, similar, me, content);
  }

  function renderFilmDetail(film, ratings, similar, me, content) {
    if (!content) return;
    const isPage = content.getAttribute && content.getAttribute('data-film-page-root');
    content.className = isPage
      ? 'container film-page-container film-modal-content'
      : 'film-modal-content';
    const myUserId = (me && me.user_id) || cabinetUserId;
    const myRatingObj = ratings.find((r) => r.user_id && myUserId && String(r.user_id) === String(myUserId));
    const myRating = myRatingObj ? Number(myRatingObj.rating) : 0;

    const poster = posterUrl(film.kp_id);
    const year = film.year ? `(${film.year})` : '';
    const genresHtml = film.genres ? `<span>${escapeHtml(film.genres)}</span>` : '';
    const kpRating = film.rating_kp != null ? `<span class="film-modal-rkp">★ КП ${Number(film.rating_kp).toFixed(1)}</span>` : '';
    const imdbRating = film.rating_imdb != null ? `<span class="film-modal-rkp" style="background:rgba(200,200,200,0.12);color:#e0e0e0">IMDb ${Number(film.rating_imdb).toFixed(1)}</span>` : '';
    const progress = film.progress ? `<span>📺 ${escapeHtml(film.progress)}</span>` : '';
    const desc = film.description ? `<div class="film-modal-desc">${escapeHtml(film.description)}</div>` : '';
    const crewParts = [];
    if (film.director && film.director !== 'Не указан') crewParts.push(`<div><b>Режиссёр:</b> ${escapeHtml(film.director)}</div>`);
    if (film.actors) crewParts.push(`<div><b>В ролях:</b> ${escapeHtml(film.actors)}</div>`);
    const crew = crewParts.length ? `<div class="film-modal-crew">${crewParts.join('')}</div>` : '';

    const tgLink = filmDeepLink(film.film_id, film.kp_id, film.is_series);

    // Rating stars
    const starsHtml = buildRatingStars(myRating);
    const ratingBlock = `
      <div class="film-modal-section">
        <h3>Ваша оценка</h3>
        <div class="rating-stars" data-rating-stars="1">${starsHtml}</div>
        ${myRating ? `<button type="button" class="rating-remove-btn" data-action="remove-rating">Убрать оценку</button>` : ''}
      </div>`;

    // Group ratings
    const groupRatings = ratings.filter((r) => !myUserId || String(r.user_id) !== String(myUserId));
    const groupHtml = groupRatings.length
      ? `<div class="film-modal-section"><h3>Оценки участников</h3><div class="rating-group-list">${
          ratings.map((r) => {
            const isMine = myUserId && String(r.user_id) === String(myUserId);
            const who = isMine ? 'Вы' : (r.username || 'Участник');
            return `<div class="rg-row ${isMine ? 'mine' : ''}"><span>${escapeHtml(who)}</span><span class="rg-rating">★ ${Number(r.rating).toFixed(0)}</span></div>`;
          }).join('')
        }</div></div>`
      : '';

    // Watched toggle
    const watchedHtml = `
      <button type="button" class="watched-toggle ${film.watched ? 'on' : ''}" data-action="toggle-watched">
        <span class="wt-mark">${film.watched ? '✓' : ''}</span>
        <span>${film.watched ? 'Просмотрен' : 'Отметить просмотренным'}</span>
      </button>`;

    // Actions
    const extra = buildFilmExtraButtons({
      kp_id: film.kp_id, title: film.title, year: film.year,
      plan_type: film.plan_type,
    });
    const actions = `
      <div class="film-modal-actions">
        ${watchedHtml}
        <a class="btn btn-small btn-secondary" href="${tgLink}" target="_blank" rel="noopener">💬 В Telegram</a>
        ${extra}
      </div>`;

    // Similar grid
    const similarHtml = similar && similar.length
      ? `<div class="film-modal-section"><h3>Похожие фильмы</h3><div class="similar-grid">${
          similar.map((s) => {
            const p = s.poster || posterUrl(s.kp_id) || '';
            const img = p ? `<img src="${escapeHtml(p)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
            const inBase = s.in_base_film_id ? '<span class="similar-in-base">✓</span>' : '';
            const clickAttr = s.in_base_film_id
              ? `data-film-id="${s.in_base_film_id}"`
              : `data-similar-kp="${escapeHtml(String(s.kp_id))}"`;
            return `<div class="similar-card" ${clickAttr} title="${escapeHtml(s.title || '')}">
              ${img}
              ${inBase}
              <div class="similar-overlay">${escapeHtml(s.title || '')}</div>
            </div>`;
          }).join('')
        }</div></div>`
      : '';

    const trailerHtml = `
      <div class="film-modal-section film-modal-trailer" data-trailer-wrap="1">
        <button type="button" class="film-modal-trailer-btn" data-action="load-trailer" data-film-id="${film.film_id}">▶ Смотреть трейлер</button>
        <div class="film-modal-trailer-embed hidden" data-trailer-embed="1"></div>
      </div>`;

    content.innerHTML = `
      <div class="film-modal-poster-wrap">
        ${poster ? `<img src="${escapeHtml(poster)}" alt="" loading="lazy">` : '<div style="color:#665;">🎬</div>'}
      </div>
      <div class="film-modal-info">
        <h2>${escapeHtml(film.title || '')} <span style="opacity:.6;font-weight:400;">${year}</span></h2>
        <div class="film-modal-meta">
          ${genresHtml}
          ${kpRating}
          ${imdbRating}
          ${progress}
        </div>
        ${crew}
        ${desc}
        ${actions}
        ${trailerHtml}
        ${ratingBlock}
        ${groupHtml}
        ${similarHtml}
      </div>`;

    bindFilmModalInteractions(film, content);
  }

  function buildRatingStars(current) {
    const cur = Number(current) || 0;
    let html = '';
    for (let i = 1; i <= 10; i += 1) {
      const filled = cur >= i;
      html += `<button type="button" class="rating-star${filled ? ' filled' : ''}" data-rating-value="${i}" aria-label="Оценить на ${i}">${i}</button>`;
    }
    if (cur) html += `<span class="rating-current" data-rating-current>${cur}/10</span>`;
    return html;
  }

  function bindFilmModalInteractions(film, rootEl) {
    const content = rootEl || getFilmRenderRoot();
    if (!content) return;

    // Rating stars: click/hover
    const starsWrap = content.querySelector('[data-rating-stars="1"]');
    if (starsWrap) {
      starsWrap.querySelectorAll('.rating-star').forEach((btn) => {
        btn.addEventListener('mouseenter', () => {
          const v = Number(btn.getAttribute('data-rating-value'));
          previewRating(starsWrap, v);
        });
        btn.addEventListener('mouseleave', () => {
          const cur = _filmModalCache[film.film_id];
          const myUserId = (cur && cur.me && cur.me.user_id) || cabinetUserId;
          const mine = cur && cur.ratings.find((r) => String(r.user_id) === String(myUserId));
          previewRating(starsWrap, mine ? Number(mine.rating) : 0);
        });
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const v = Number(btn.getAttribute('data-rating-value'));
          setRating(film.film_id, v);
        });
      });
    }

    const removeBtn = content.querySelector('[data-action="remove-rating"]');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        deleteRating(film.film_id);
      });
    }

    const watchedBtn = content.querySelector('[data-action="toggle-watched"]');
    if (watchedBtn) {
      watchedBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleWatched(film.film_id, !film.watched);
      });
    }

    // Similar: клик по карточке похожего
    content.querySelectorAll('[data-similar-kp]').forEach((card) => {
      card.addEventListener('click', () => {
        const kp = card.getAttribute('data-similar-kp');
        // Если нет в базе — отправляем в Telegram на добавление
        const url = 'https://t.me/movie_planner_bot?start=addfilm_' + encodeURIComponent(kp);
        window.open(url, '_blank', 'noopener');
      });
    });

    // Trailer: ленивая подгрузка
    const trailerBtn = content.querySelector('[data-action="load-trailer"]');
    if (trailerBtn) {
      trailerBtn.addEventListener('click', () => {
        const wrap = content.querySelector('[data-trailer-wrap="1"]');
        const embed = wrap && wrap.querySelector('[data-trailer-embed="1"]');
        if (!wrap || !embed) return;
        trailerBtn.disabled = true;
        trailerBtn.textContent = 'Ищем трейлер…';
        api('/api/site/film/' + film.film_id + '/trailer').then((data) => {
          if (!data || !data.success || !data.youtube_id) {
            trailerBtn.disabled = false;
            trailerBtn.textContent = 'Трейлер не найден';
            return;
          }
          embed.innerHTML = '<iframe src="https://www.youtube.com/embed/' + encodeURIComponent(data.youtube_id) + '?autoplay=1&rel=0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>';
          embed.classList.remove('hidden');
          trailerBtn.style.display = 'none';
        }).catch(() => {
          trailerBtn.disabled = false;
          trailerBtn.textContent = 'Ошибка. Повторите';
        });
      });
    }
    // Похожие фильмы, которые уже в базе — откроются автоматически делегированным обработчиком
  }

  function previewRating(starsWrap, v) {
    starsWrap.querySelectorAll('.rating-star').forEach((b) => {
      const bv = Number(b.getAttribute('data-rating-value'));
      b.classList.toggle('filled', bv <= v);
    });
    const curEl = starsWrap.querySelector('[data-rating-current]');
    if (curEl) curEl.textContent = v ? v + '/10' : '';
  }

  function setRating(filmId, rating) {
    api('/api/site/film/' + filmId + '/rating', {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }).then((res) => {
      if (!res || !res.success) return;
      const cache = _filmModalCache[filmId];
      if (cache) {
        const myUserId = (cache.me && cache.me.user_id) || cabinetUserId;
        const idx = cache.ratings.findIndex((r) => String(r.user_id) === String(myUserId));
        const row = { user_id: myUserId, rating, username: 'Вы' };
        if (idx >= 0) cache.ratings[idx] = row; else cache.ratings.unshift(row);
        cache.film.watched = true;
        renderFilmDetail(cache.film, cache.ratings, cache.similar, cache.me, getFilmRenderRoot());
      }
      applyRatingToLists(filmId, rating);
    });
  }

  function deleteRating(filmId) {
    api('/api/site/film/' + filmId + '/rating', { method: 'DELETE' }).then((res) => {
      if (!res || !res.success) return;
      const cache = _filmModalCache[filmId];
      if (cache) {
        const myUserId = (cache.me && cache.me.user_id) || cabinetUserId;
        cache.ratings = cache.ratings.filter((r) => String(r.user_id) !== String(myUserId));
        renderFilmDetail(cache.film, cache.ratings, cache.similar, cache.me, getFilmRenderRoot());
      }
      removeRatingFromLists(filmId);
    });
  }

  function toggleWatched(filmId, watched) {
    api('/api/site/film/' + filmId + '/watched', {
      method: 'POST',
      body: JSON.stringify({ watched }),
    }).then((res) => {
      if (!res || !res.success) return;
      const cache = _filmModalCache[filmId];
      if (cache) {
        cache.film.watched = !!watched;
        renderFilmDetail(cache.film, cache.ratings, cache.similar, cache.me, getFilmRenderRoot());
      }
      applyWatchedToLists(filmId, watched);
    });
  }

  function applyRatingToLists(filmId, rating) {
    if (typeof unwatchedItems !== 'undefined') {
      // при ставе оценки фильм считается просмотренным — убираем из unwatched
      const before = unwatchedItems.length;
      unwatchedItems = unwatchedItems.filter((m) => Number(m.film_id) !== Number(filmId));
      if (unwatchedItems.length !== before && typeof renderUnwatchedList === 'function') renderUnwatchedList();
    }
    if (typeof ratingsItems !== 'undefined') {
      const idx = ratingsItems.findIndex((r) => Number(r.film_id) === Number(filmId));
      if (idx >= 0) {
        ratingsItems[idx].rating = rating;
      } else {
        // Нет в списке — можно перезагрузить
        if (typeof loadRatings === 'function') loadRatings();
        return;
      }
      if (typeof renderRatingsList === 'function') renderRatingsList();
    }
  }

  function removeRatingFromLists(filmId) {
    if (typeof ratingsItems !== 'undefined') {
      const cache = _filmModalCache[filmId];
      const myUserId = (cache && cache.me && cache.me.user_id) || cabinetUserId;
      ratingsItems = ratingsItems.filter((r) => !(Number(r.film_id) === Number(filmId) && String(r.rater_user_id || myUserId) === String(myUserId)));
      if (typeof renderRatingsList === 'function') renderRatingsList();
    }
  }

  function applyWatchedToLists(filmId, watched) {
    if (typeof unwatchedItems !== 'undefined') {
      if (watched) {
        unwatchedItems = unwatchedItems.filter((m) => Number(m.film_id) !== Number(filmId));
      } else {
        // Если отметили «не просмотрен» и фильма нет в списке — перезагрузим
        if (!unwatchedItems.find((m) => Number(m.film_id) === Number(filmId)) && typeof loadUnwatched === 'function') {
          loadUnwatched();
          return;
        }
      }
      if (typeof renderUnwatchedList === 'function') renderUnwatchedList();
    }
  }

  // ————————————————————————————————————————————————————
  // Phase 3: Add Film modal
  // ————————————————————————————————————————————————————

  let _addFilmSearchSeq = 0;
  let _addFilmDebounce = null;
  let _addFilmType = 'any';

  function openAddFilmModal() {
    const modal = document.getElementById('add-film-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    const input = document.getElementById('add-film-input');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 30);
    }
    const status = document.getElementById('add-film-status');
    if (status) { status.textContent = 'Начните вводить название или вставьте ссылку.'; status.className = 'add-film-status'; }
    const results = document.getElementById('add-film-results');
    if (results) results.innerHTML = '';
  }

  function closeAddFilmModal() {
    const modal = document.getElementById('add-film-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function runAddFilmSearch(query) {
    const seq = ++_addFilmSearchSeq;
    const status = document.getElementById('add-film-status');
    const results = document.getElementById('add-film-results');
    if (!query || query.length < 2) {
      if (status) { status.textContent = 'Введите минимум 2 символа.'; status.className = 'add-film-status'; }
      if (results) results.innerHTML = '';
      return;
    }
    if (status) { status.textContent = 'Ищем…'; status.className = 'add-film-status'; }
    api('/api/site/search?q=' + encodeURIComponent(query) + '&type=' + encodeURIComponent(_addFilmType))
      .then((data) => {
        if (seq !== _addFilmSearchSeq) return;
        if (!data || !data.success) {
          if (status) { status.textContent = (data && data.error) || 'Ошибка поиска.'; status.className = 'add-film-status error'; }
          if (results) results.innerHTML = '';
          return;
        }
        const items = data.items || [];
        if (!items.length) {
          if (status) { status.textContent = 'Ничего не нашлось.'; status.className = 'add-film-status'; }
          if (results) results.innerHTML = '';
          return;
        }
        if (status) { status.textContent = 'Найдено: ' + items.length; status.className = 'add-film-status'; }
        if (results) {
          results.innerHTML = items.map((it) => {
            const poster = it.poster || '';
            const meta = [it.type === 'series' ? 'Сериал' : 'Фильм', it.year].filter(Boolean).join(' · ');
            const inBase = it.already_in_base_film_id;
            const btn = inBase
              ? `<button type="button" class="add-search-result-btn" disabled>В базе</button>`
              : `<button type="button" class="add-search-result-btn" data-action="add-film-pick" data-kp="${escapeHtml(String(it.kp_id))}">Добавить</button>`;
            const openBtn = inBase
              ? `<button type="button" class="add-search-result-btn" data-action="open-film-modal" data-film-id="${escapeHtml(String(inBase))}" style="margin-top:6px;border-color:rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);color:#fff;">Открыть</button>`
              : '';
            return `<div class="add-search-result">
              ${poster ? `<img class="add-search-result-poster" src="${escapeHtml(poster)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<div class="add-search-result-poster"></div>'}
              <div class="add-search-result-info">
                <div class="add-search-result-title">${escapeHtml(it.title || '')}</div>
                <div class="add-search-result-meta">${escapeHtml(meta)}</div>
                ${btn}
                ${openBtn}
              </div>
            </div>`;
          }).join('');
        }
      })
      .catch(() => {
        if (seq !== _addFilmSearchSeq) return;
        if (status) { status.textContent = 'Ошибка сети. Повторите попытку.'; status.className = 'add-film-status error'; }
      });
  }

  function pickAddFilm(kpId, btn) {
    if (!kpId) return;
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Добавляем…'; }
    api('/api/site/add-film', { method: 'POST', body: JSON.stringify({ kp_id: kpId }) })
      .then((data) => {
        if (!data || !data.success) {
          if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
          const status = document.getElementById('add-film-status');
          if (status) { status.textContent = (data && data.error) || 'Не удалось добавить фильм.'; status.className = 'add-film-status error'; }
          return;
        }
        if (btn) { btn.textContent = data.already_existed ? 'Уже в базе' : '✓ Добавлен'; btn.disabled = true; }
        // Optimistic refresh
        if (!data.already_existed && typeof loadUnwatched === 'function') loadUnwatched();
        // Автозакрыть модалку, если это только что добавленный фильм
        if (!data.already_existed) {
          setTimeout(() => { closeAddFilmModal(); showSection('unwatched'); }, 700);
        }
      })
      .catch(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
      });
  }

  function pickAddFilmByLink(link) {
    const status = document.getElementById('add-film-status');
    if (status) { status.textContent = 'Добавляем по ссылке…'; status.className = 'add-film-status'; }
    return api('/api/site/add-film/by-link', { method: 'POST', body: JSON.stringify({ link }) })
      .then((data) => {
        if (!data || !data.success) {
          if (status) { status.textContent = (data && data.error) || 'Не удалось распознать ссылку.'; status.className = 'add-film-status error'; }
          return false;
        }
        if (status) { status.textContent = data.already_existed ? 'Фильм уже в базе.' : '✓ Фильм добавлен!'; status.className = 'add-film-status'; }
        if (!data.already_existed && typeof loadUnwatched === 'function') loadUnwatched();
        setTimeout(() => { closeAddFilmModal(); if (!data.already_existed) showSection('unwatched'); }, 900);
        return true;
      });
  }

  function bindAddFilmModal() {
    const addBtn = document.getElementById('cabinet-add-film-btn');
    if (addBtn) addBtn.addEventListener('click', openAddFilmModal);

    const input = document.getElementById('add-film-input');
    if (input) {
      input.addEventListener('input', () => {
        const val = input.value.trim();
        if (_addFilmDebounce) clearTimeout(_addFilmDebounce);
        // Link shortcut
        if (/kinopoisk\.(ru|com)\/(film|series)\//i.test(val) || /imdb\.com\/title\/tt\d+/i.test(val)) {
          _addFilmDebounce = setTimeout(() => pickAddFilmByLink(val), 350);
          return;
        }
        _addFilmDebounce = setTimeout(() => runAddFilmSearch(val), 300);
      });
    }
    document.querySelectorAll('.add-film-type-btn').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.add-film-type-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        _addFilmType = b.getAttribute('data-type') || 'any';
        if (input && input.value.trim().length >= 2) runAddFilmSearch(input.value.trim());
      });
    });
    document.addEventListener('click', (e) => {
      const close = e.target.closest('[data-action="close-add-film-modal"]');
      if (close) { e.preventDefault(); closeAddFilmModal(); return; }
      const pick = e.target.closest('[data-action="add-film-pick"]');
      if (pick) { e.preventDefault(); pickAddFilm(pick.getAttribute('data-kp'), pick); return; }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('add-film-modal');
        if (modal && !modal.classList.contains('hidden')) closeAddFilmModal();
      }
    });
  }

  // ————————————————————————————————————————————————————
  // Phase 4: Header search (hybrid dropdown + full modal)
  // ————————————————————————————————————————————————————

  let _headerSearchSeq = 0;
  let _headerSearchDebounce = null;

  function _readJsonLs(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function _writeJsonLs(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }
  function pushHeaderSearchQuery(q) {
    const t = (q || '').trim();
    if (t.length < 2) return;
    const a = _readJsonLs(LS_SEARCH_RECENT, []);
    const next = [t].concat(a.filter((x) => x !== t)).slice(0, 10);
    _writeJsonLs(LS_SEARCH_RECENT, next);
  }
  function pushHeaderFilmRecent(f) {
    if (!f) return;
    const fid = f.film_id != null ? f.film_id : f.id;
    if (!fid) return;
    const row = { film_id: Number(fid), title: f.title || 'Фильм', kp_id: f.kp_id };
    const a = _readJsonLs(LS_FILM_RECENT, []);
    const next = [row].concat(a.filter((x) => String(x.film_id) !== String(row.film_id))).slice(0, 8);
    _writeJsonLs(LS_FILM_RECENT, next);
  }
  function showHeaderSearchRecents(dd) {
    if (!dd) return;
    const recQ = _readJsonLs(LS_SEARCH_RECENT, []);
    const recF = _readJsonLs(LS_FILM_RECENT, []);
    if (!recQ.length && !recF.length) {
      dd.innerHTML = '<div class="header-search-empty">Введите запрос не менее 2 символов</div>';
      return;
    }
    let h = '';
    if (recQ.length) {
      h += '<div class="header-search-recent-title">Недавние запросы</div><div class="header-search-recent-row">';
      recQ.forEach((q) => {
        h += '<button type="button" class="header-search-chip" data-hs-recent-q="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>';
      });
      h += '</div>';
    }
    if (recF.length) {
      h += '<div class="header-search-recent-title">Недавние карточки</div>';
      recF.forEach((f) => {
        h += '<div class="hs-result" style="cursor:pointer" data-hs-open-film="' + escapeHtml(String(f.film_id)) + '">'
        + (f.kp_id ? ('<img class="hs-result-poster" src="' + escapeHtml(posterUrl(f.kp_id)) + '" alt="">' ) : '<div class="hs-result-poster"></div>')
        + '<div class="hs-result-info"><div class="hs-result-title">' + escapeHtml(f.title) + '</div></div></div>';
      });
    }
    dd.innerHTML = h;
    dd.classList.remove('hidden');
  }

  function renderHeaderSearchDropdown(items, query) {
    const dd = document.getElementById('header-search-dropdown');
    if (!dd) return;
    if (!items || !items.length) {
      dd.innerHTML = `<div class="header-search-empty">Ничего не нашлось по «${escapeHtml(query)}»</div>`;
      dd.classList.remove('hidden');
      return;
    }
    const top = items.slice(0, 6);
    dd.innerHTML = top.map((it) => {
      const poster = it.poster || '';
      const meta = [it.type === 'series' ? 'Сериал' : 'Фильм', it.year].filter(Boolean).join(' · ');
      const inBase = it.already_in_base_film_id;
      const actionBtn = inBase
        ? `<button type="button" class="hs-result-btn hs-btn-open" data-hs-open-film="${escapeHtml(String(inBase))}">Открыть</button>`
        : `<button type="button" class="hs-result-btn hs-btn-add" data-hs-add-kp="${escapeHtml(String(it.kp_id))}">＋ Добавить</button>`;
      return `<div class="hs-result">
        ${poster ? `<img class="hs-result-poster" src="${escapeHtml(poster)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<div class="hs-result-poster"></div>'}
        <div class="hs-result-info">
          <div class="hs-result-title">${escapeHtml(it.title || '')}</div>
          <div class="hs-result-meta">${escapeHtml(meta)}${inBase ? ' · <span class="hs-in-base">в базе</span>' : ''}</div>
        </div>
        ${actionBtn}
      </div>`;
    }).join('') + (items.length > 6
      ? `<div class="hs-result-more"><button type="button" data-hs-show-all>Показать все результаты (${items.length})</button></div>`
      : '');
    dd.classList.remove('hidden');
  }

  function runHeaderSearch(query) {
    const seq = ++_headerSearchSeq;
    const dd = document.getElementById('header-search-dropdown');
    if (!query || query.length < 2) {
      if (dd) { dd.classList.add('hidden'); dd.innerHTML = ''; }
      return;
    }
    if (dd) {
      dd.innerHTML = '<div class="header-search-loading">Ищем…</div>';
      dd.classList.remove('hidden');
    }
    // Link shortcut
    if (/kinopoisk\.(ru|com)\/(film|series)\//i.test(query) || /imdb\.com\/title\/tt\d+/i.test(query)) {
      if (dd) dd.innerHTML = '<div class="header-search-empty">Распознали ссылку — откройте полную форму для добавления.</div>';
      return;
    }
    api('/api/site/search?q=' + encodeURIComponent(query) + '&type=any')
      .then((data) => {
        if (seq !== _headerSearchSeq) return;
        if (!data || !data.success) {
          if (dd) dd.innerHTML = '<div class="header-search-empty">Ошибка поиска</div>';
          return;
        }
        if ((data.items || []).length) pushHeaderSearchQuery(query);
        renderHeaderSearchDropdown(data.items || [], query);
      })
      .catch(() => {
        if (seq !== _headerSearchSeq) return;
        if (dd) dd.innerHTML = '<div class="header-search-empty">Ошибка сети</div>';
      });
  }

  function bindHeaderSearch() {
    const wrap = document.getElementById('header-search');
    const input = document.getElementById('header-search-input');
    const dd = document.getElementById('header-search-dropdown');
    const clearBtn = document.getElementById('header-search-clear');
    if (!wrap || !input) return;

    input.addEventListener('input', () => {
      const v = input.value.trim();
      if (clearBtn) clearBtn.classList.toggle('hidden', !v);
      if (_headerSearchDebounce) clearTimeout(_headerSearchDebounce);
      _headerSearchDebounce = setTimeout(() => runHeaderSearch(v), 280);
    });
    input.addEventListener('focus', () => {
      const v = input.value.trim();
      if (v.length < 2 && dd) showHeaderSearchRecents(dd);
      else if (v.length >= 2 && dd && dd.innerHTML) dd.classList.remove('hidden');
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.value = ''; if (dd) dd.classList.add('hidden'); input.blur(); }
      if (e.key === 'Enter') {
        const v = input.value.trim();
        if (v.length >= 2) {
          if (dd) dd.classList.add('hidden');
          openAddFilmModal();
          const modalInput = document.getElementById('add-film-input');
          if (modalInput) { modalInput.value = v; runAddFilmSearch(v); }
        }
      }
    });
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.add('hidden');
        if (dd) { dd.classList.add('hidden'); dd.innerHTML = ''; }
        input.focus();
      });
    }
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        if (dd) dd.classList.add('hidden');
      }
    });
    // Dropdown delegation
    if (dd) {
      dd.addEventListener('click', (e) => {
        const recQbtn = e.target.closest('[data-hs-recent-q]');
        if (recQbtn) {
          e.preventDefault();
          e.stopPropagation();
          const q = recQbtn.getAttribute('data-hs-recent-q') || recQbtn.textContent;
          if (q && input) { input.value = q; input.dispatchEvent(new Event('input', { bubbles: true })); }
          return;
        }
        const addBtn = e.target.closest('[data-hs-add-kp]');
        if (addBtn) {
          e.preventDefault();
          const kp = addBtn.getAttribute('data-hs-add-kp');
          addBtn.disabled = true;
          const prev = addBtn.textContent;
          addBtn.textContent = '…';
          api('/api/site/add-film', { method: 'POST', body: JSON.stringify({ kp_id: kp }) })
            .then((data) => {
              if (data && data.success) {
                addBtn.textContent = data.already_existed ? 'Уже в базе' : '✓ Добавлен';
                if (!data.already_existed && typeof loadUnwatched === 'function') loadUnwatched();
              } else {
                addBtn.disabled = false;
                addBtn.textContent = prev;
              }
            })
            .catch(() => { addBtn.disabled = false; addBtn.textContent = prev; });
          return;
        }
        const openFilm = e.target.closest('[data-hs-open-film]');
        if (openFilm) {
          e.preventDefault();
          const id = openFilm.getAttribute('data-hs-open-film');
          if (dd) dd.classList.add('hidden');
          input.value = '';
          if (clearBtn) clearBtn.classList.add('hidden');
          if (typeof openFilmModal === 'function') openFilmModal(id);
          return;
        }
        const showAll = e.target.closest('[data-hs-show-all]');
        if (showAll) {
          e.preventDefault();
          const v = input.value.trim();
          if (dd) dd.classList.add('hidden');
          openAddFilmModal();
          const modalInput = document.getElementById('add-film-input');
          if (modalInput) { modalInput.value = v; runAddFilmSearch(v); }
        }
      });
    }
    const mic = document.getElementById('header-search-mic');
    if (mic && !mic._mpVox) {
      mic._mpVox = true;
      let rec = null; let ch = [];
      mic.addEventListener('click', () => {
        if (!getToken()) { showToast('Войдите в кабинет'); return; }
        if (mic._mpRec) {
          const r = mic._mpRecorder;
          if (r && r.state === 'recording') { try { r.stop(); } catch (e) {} }
          return;
        }
        if (mic._mpPending) return;
        if (!navigator.mediaDevices || !window.MediaRecorder) { showToast('В браузере нет записи с микрофона'); return; }
        mic._mpPending = true;
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          mic._mpPending = false;
          ch = [];
          const opt = (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') && 'audio/webm;codecs=opus') || (MediaRecorder.isTypeSupported('audio/webm') && 'audio/webm') || 'audio/ogg';
          rec = new MediaRecorder(stream, { mimeType: opt });
          mic._mpRecorder = rec;
          rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) ch.push(ev.data); };
          rec.onstop = () => {
            try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
            mic._mpRecorder = null;
            mic.classList.remove('recording');
            mic._mpRec = false;
            if (!ch.length) { showToast('Пустая запись'); return; }
            const blob = new Blob(ch, { type: rec.mimeType || 'audio/webm' });
            const fd = new FormData();
            fd.append('audio', blob, 'q.webm');
            const h = { Authorization: 'Bearer ' + getToken() };
            fetch(API_BASE + '/api/site/voice-transcribe', { method: 'POST', body: fd, headers: h })
              .then((r) => r.json())
              .then((d) => {
                if (d && d.success && d.text) {
                  if (input) { input.value = d.text; input.dispatchEvent(new Event('input', { bubbles: true })); }
                } else {
                  showToast('Не распознали. Повторите или введите текст');
                }
              })
              .catch(() => { showToast('Ошибка сети'); });
          };
          mic._mpRec = true; mic.classList.add('recording');
          rec.start(100);
        }).catch(() => { mic._mpPending = false; showToast('Нет доступа к микрофону'); });
      });
    }
  }

  // ————————————————————————————————————————————————————
  // Phase 3: Profile switcher (cabinet-topbar)
  // ————————————————————————————————————————————————————

  function updateProfileSwitcherUI(me) {
    const nameEl = document.getElementById('cabinet-profile-name');
    const emojiEl = document.getElementById('cabinet-profile-emoji');
    if (!nameEl || !me) return;
    nameEl.textContent = me.name || 'Профиль';
    if (emojiEl) {
      const em = (me.room_emoji != null && String(me.room_emoji).trim() !== '') ? me.room_emoji : '';
      emojiEl.textContent = em;
    }
  }

  function closeProfileMenu() {
    const menu = document.getElementById('cabinet-profile-menu');
    const btn = document.getElementById('cabinet-profile-btn');
    if (menu) menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function openProfileMenu() {
    const menu = document.getElementById('cabinet-profile-menu');
    const btn = document.getElementById('cabinet-profile-btn');
    if (!menu) return;
    menu.classList.remove('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    menu.innerHTML = '<div class="profile-menu-hint">Загружаем профили…</div>';
    api('/api/site/profiles').then((data) => {
      if (!data || !data.success) {
        menu.innerHTML = '<div class="profile-menu-hint">' + escapeHtml((data && data.error) || 'Не удалось загрузить профили') + '</div>';
        return;
      }
      const profiles = data.profiles || [];
      const activeChatId = data.active_chat_id;
      if (!profiles.length) {
        menu.innerHTML = '<div class="profile-menu-hint">Пока только этот профиль. Добавьте бота в группу и получите /invite, чтобы появился второй.</div>';
        return;
      }
      menu.innerHTML = profiles.map((p) => {
        const emoji = p.is_personal
          ? ''
          : (p.group_emoji && String(p.group_emoji).trim() ? p.group_emoji : (p.is_virtual ? '🎬' : '💬'));
        const typeLabel = p.is_personal ? 'личный' : (p.is_virtual ? 'комната' : 'группа');
        const active = p.is_active || String(p.chat_id) === String(activeChatId);
        const disp = escapeHtml(p.display_name || p.name || 'Профиль');
        const nameHtml = active
          ? `<div class="profile-menu-item-name profile-menu-item-name-active">${disp}</div>`
          : `<div class="profile-menu-item-name">${disp}</div>`;
        return `<div class="profile-menu-item ${active ? 'active' : ''}" data-chat-id="${escapeHtml(String(p.chat_id))}">
          <div class="profile-menu-item-main">
            <span class="profile-menu-item-emoji">${escapeHtml(emoji)}</span>
            <div class="profile-menu-item-info">
              ${nameHtml}
              <div class="profile-menu-item-meta">${typeLabel} · ${p.movies_count || 0} фильмов · ${p.ratings_count || 0} оценок</div>
            </div>
          </div>
          ${active ? '<span class="profile-menu-item-active-tag">активен</span>' : ''}
        </div>`;
      }).join('') + '<div class="profile-menu-hint">Создавайте новые профили через <code>/invite</code> в Telegram-группе или кнопку «Создать комнату».</div>';

      menu.querySelectorAll('.profile-menu-item').forEach((el) => {
        el.addEventListener('click', () => {
          const chatId = el.getAttribute('data-chat-id');
          if (!chatId) return;
          if (el.classList.contains('active')) { closeProfileMenu(); return; }
          switchProfileTo(chatId);
        });
      });
    }).catch(() => {
      menu.innerHTML = '<div class="profile-menu-hint">Сервер не отвечает.</div>';
    });
  }

  function switchProfileTo(chatId) {
    api('/api/site/profiles/switch', { method: 'POST', body: JSON.stringify({ target_chat_id: Number(chatId) }) }).then((data) => {
      if (!data || !data.success) {
        alert((data && data.error) || 'Не удалось переключить профиль.');
        return;
      }
      const sessions = getSessions();
      const existing = sessions.find((s) => String(s.chat_id) === String(chatId));
      if (existing) {
        existing.token = data.token;
        existing.name = data.name || existing.name;
      } else {
        sessions.push({ chat_id: String(chatId), token: data.token, name: data.name, is_personal: Number(chatId) > 0, has_data: true });
      }
      setSessions(sessions);
      setActiveChatId(chatId);
      closeProfileMenu();
      loadMeAndShowCabinet();
    });
  }

  function bindProfileSwitcher() {
    const btn = document.getElementById('cabinet-profile-btn');
    const nameEl = document.getElementById('cabinet-profile-name');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (nameEl && (e.target === nameEl || (nameEl.contains && nameEl.contains(e.target)))) {
          closeProfileMenu();
          openAccountDropdown();
          return;
        }
        const menu = document.getElementById('cabinet-profile-menu');
        if (menu && menu.classList.contains('hidden')) openProfileMenu();
        else closeProfileMenu();
      });
    }
    document.addEventListener('click', (e) => {
      const sw = document.getElementById('cabinet-profile-switcher');
      if (sw && !sw.contains(e.target)) closeProfileMenu();
    });
  }

  // ————————————————————————————————————————————————————
  // Что посмотреть / настройки (как в миниаппе)
  // ————————————————————————————————————————————————————

  const WTW_MENU_MODES = [
    { id: 'my_unwatched', kind: 'random', emoji: '🎲', title: 'Рандом по своей базе', hint: 'Случайный непросмотренный из базы' },
    { id: 'kp_random', kind: 'random', emoji: '🎬', title: 'Рандом по Кинопоиску', hint: 'Случайный фильм с КП' },
    { id: 'my_top_rated', kind: 'random', emoji: '⭐', title: 'По моим оценкам 9–10', hint: 'Из оцененных вами высоко' },
    { id: 'wizard', kind: 'wizard', emoji: '🎯', title: 'По жанрам / годам / рейтингу', hint: 'Пошаговый подбор' },
    { id: 'premieres_reco', kind: 'nav', target: 'premieres', emoji: '🎟️', title: 'Рекомендации премьер', hint: 'Экран «Премьеры»' },
  ];

  function setWhatchtwatchResult(html) {
    const el = document.getElementById('whattowatch-result');
    if (el) el.innerHTML = html;
  }

  function runSiteRandomMode(mode) {
    setWhatchtwatchResult('<p class="cabinet-hint">Подбираем…</p>');
    api('/api/miniapp/random', { method: 'POST', body: JSON.stringify({ mode }) })
      .then((data) => {
        if (!data || !data.film) {
          const msg = (data && data.message) || 'Нет подходящих фильмов. Попробуйте другой режим или PRO-тариф.';
          setWhatchtwatchResult('<div class="cabinet-hint">' + escapeHtml(msg) + '</div>');
          return;
        }
        const f = data.film;
        const title = f.title || '—';
        const y = f.year ? f.year : '';
        const g = f.genres || '';
        const poster = f.poster || posterUrl(f.kp_id);
        if (f.film_id) {
          setWhatchtwatchResult(
            '<div class="whattowatch-result-card">'
            + '<div class="whattowatch-result-poster">' + (poster ? '<img src="' + escapeHtml(poster) + '" alt="" loading="lazy">' : '<span>🎬</span>') + '</div>'
            + '<div class="whattowatch-result-body"><p><b>' + escapeHtml(title) + '</b> ' + escapeHtml(y) + '</p><p class="cabinet-hint">'
            + escapeHtml(g) + '</p><button type="button" class="btn btn-primary" id="wtw-open">Открыть карточку</button> '
            + '<button type="button" class="btn btn-secondary" id="wtw-again">🎲 Ещё</button></div></div>',
          );
          const o = document.getElementById('wtw-open');
          const a = document.getElementById('wtw-again');
          if (o) o.addEventListener('click', () => openFilmModal(Number(f.film_id)));
          if (a) a.addEventListener('click', () => runSiteRandomMode(mode));
        } else {
          setWhatchtwatchResult('<div class="cabinet-hint">Найден «' + escapeHtml(title) + '». Добавьте в базу через кнопку ниже.</div><button type="button" class="btn btn-primary" id="wtw-add-kp">Добавить в базу</button>');
          const addBtn = document.getElementById('wtw-add-kp');
          if (addBtn) {
            addBtn.addEventListener('click', () => {
              addBtn.disabled = true;
              addBtn.textContent = 'Добавляем…';
              api('/api/site/add-film', { method: 'POST', body: JSON.stringify({ kp_id: f.kp_id }) })
                .then((r) => {
                  if (r && r.success) {
                    addBtn.textContent = 'Добавлено';
                    if (typeof loadUnwatched === 'function') loadUnwatched();
                  } else {
                    addBtn.disabled = false;
                    addBtn.textContent = 'Добавить в базу';
                  }
                })
                .catch(() => {
                  addBtn.disabled = false;
                  addBtn.textContent = 'Добавить в базу';
                });
            });
          }
        }
      })
      .catch(() => { setWhatchtwatchResult('<p class="cabinet-hint">Ошибка сети</p>'); });
  }

  function renderWhattowatchSection() {
    const root = document.getElementById('whattowatch-content');
    if (!root) return;
    const btns = WTW_MENU_MODES.map((m) => {
      if (m.kind === 'nav') {
        return `<button type="button" class="whattowatch-mode-btn" data-wtw-nav="${m.target}"><span class="whattowatch-mode-emoji">${m.emoji}</span><div><b>${escapeHtml(m.title)}</b><div class="cabinet-hint">${escapeHtml(m.hint)}</div></div></button>`;
      }
      if (m.kind === 'wizard') {
        return `<button type="button" class="whattowatch-mode-btn" data-wtw-wizard="1"><span class="whattowatch-mode-emoji">${m.emoji}</span><div><b>${escapeHtml(m.title)}</b><div class="cabinet-hint">Пошаговый опросник на сайте: жанры, годы, рейтинги, тип и настроение.</div></div></button>`;
      }
      return `<button type="button" class="whattowatch-mode-btn" data-wtw-mode="${m.id}"><span class="whattowatch-mode-emoji">${m.emoji}</span><div><b>${escapeHtml(m.title)}</b><div class="cabinet-hint">${escapeHtml(m.hint)}</div></div></button>`;
    }).join('');
    root.innerHTML = '<div class="whattowatch-modes">' + btns + '</div><div id="whattowatch-result"></div>';
    root.querySelectorAll('[data-wtw-mode]').forEach((b) => {
      b.addEventListener('click', () => runSiteRandomMode(b.getAttribute('data-wtw-mode')));
    });
    root.querySelectorAll('[data-wtw-nav]').forEach((b) => {
      b.addEventListener('click', () => {
        const t = b.getAttribute('data-wtw-nav');
        if (t) { showSection(t); if (t === 'premieres' && renderPremieresSection) renderPremieresSection(true); }
      });
    });
    root.querySelectorAll('[data-wtw-wizard]').forEach((b) => {
      b.addEventListener('click', () => {
        renderWhattowatchWizard();
      });
    });
  }

  function renderWhattowatchWizard() {
    const root = document.getElementById('whattowatch-result');
    if (!root) return;
    const genres = [
      { id: 'comedy', label: 'Комедия' },
      { id: 'drama', label: 'Драма' },
      { id: 'thriller', label: 'Триллер' },
      { id: 'fantasy', label: 'Фэнтези' },
      { id: 'action', label: 'Экшен' },
      { id: 'detective', label: 'Детектив' },
      { id: 'horror', label: 'Ужасы' },
      { id: 'sci_fi', label: 'Фантастика' },
      { id: 'romance', label: 'Романтика' },
      { id: 'adventure', label: 'Приключения' },
    ];
    root.innerHTML = '<form id="wtw-wizard-form" class="wtw-wizard">' +
      '<div class="wtw-wizard-title">Опросник подбора</div>' +
      '<div class="wtw-wizard-grid">' +
      '<label>Ключевые слова<input type="text" id="wtw-q" placeholder="например: космос, выживание, семья"></label>' +
      '<label>Год от<input type="number" id="wtw-year-from" min="1900" max="2100" placeholder="2000"></label>' +
      '<label>Год до<input type="number" id="wtw-year-to" min="1900" max="2100" placeholder="2026"></label>' +
      '<label>Рейтинг от<input type="number" id="wtw-rating-from" min="1" max="10" step="0.1" placeholder="7"></label>' +
      '<label>Тип<select id="wtw-type"><option value="">Любой</option><option value="films">Фильмы</option><option value="series">Сериалы</option></select></label>' +
      '<label>Где смотреть<select id="wtw-source"><option value="">Любой источник</option><option value="my_base">Из моей базы</option><option value="kinopoisk">По Кинопоиску</option></select></label>' +
      '</div>' +
      '<div class="wtw-wizard-genres">' + genres.map((g) => '<label><input type="checkbox" value="' + g.id + '"> ' + g.label + '</label>').join('') + '</div>' +
      '<div class="wtw-wizard-actions"><button type="submit" class="btn btn-primary">Подобрать</button><button type="button" class="btn btn-secondary" id="wtw-wizard-back">Назад</button></div>' +
      '</form>';

    const back = document.getElementById('wtw-wizard-back');
    if (back) back.addEventListener('click', () => { renderWhattowatchSection(); });
    const form = document.getElementById('wtw-wizard-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const selectedGenres = [];
      form.querySelectorAll('.wtw-wizard-genres input[type="checkbox"]:checked').forEach((cb) => selectedGenres.push(cb.value));
      const payload = {
        mode: 'wizard',
        query: (document.getElementById('wtw-q') && document.getElementById('wtw-q').value || '').trim(),
        genres: selectedGenres,
        year_from: Number((document.getElementById('wtw-year-from') && document.getElementById('wtw-year-from').value) || 0) || null,
        year_to: Number((document.getElementById('wtw-year-to') && document.getElementById('wtw-year-to').value) || 0) || null,
        rating_from: Number((document.getElementById('wtw-rating-from') && document.getElementById('wtw-rating-from').value) || 0) || null,
        type: (document.getElementById('wtw-type') && document.getElementById('wtw-type').value) || '',
        source: (document.getElementById('wtw-source') && document.getElementById('wtw-source').value) || '',
      };
      runSiteWizardMode(payload);
    });
  }

  function renderWizardCards(items) {
    if (!items.length) {
      return '<div class="cabinet-hint">Ничего не найдено. Измените фильтры и попробуйте снова.</div>';
    }
    return '<div class="wtw-cards">' + items.map((f) => {
      const poster = f.poster || posterUrl(f.kp_id);
      const year = f.year ? String(f.year) : '';
      const genres = f.genres || '';
      const filmId = f.film_id ? String(f.film_id) : '';
      const cardAction = filmId
        ? '<button type="button" class="btn btn-small btn-primary" data-wtw-open-film="' + escapeHtml(filmId) + '">Открыть</button>'
        : '<button type="button" class="btn btn-small btn-secondary" data-wtw-add-kp="' + escapeHtml(String(f.kp_id || '')) + '">Добавить в базу</button>';
      return '<div class="wtw-card">' +
        '<div class="wtw-card-poster">' + (poster ? '<img src="' + escapeHtml(poster) + '" alt="" loading="lazy">' : '<span>🎬</span>') + '</div>' +
        '<div class="wtw-card-body">' +
        '<div class="wtw-card-title">' + escapeHtml(f.title || 'Без названия') + '</div>' +
        '<div class="wtw-card-meta">' + escapeHtml([year, genres].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="wtw-card-actions">' + cardAction + '</div></div></div>';
    }).join('') + '</div>';
  }

  function runSiteWizardMode(payload) {
    const root = document.getElementById('whattowatch-result');
    if (!root) return;
    root.innerHTML = '<div class="cabinet-hint">Подбираем по фильтрам…</div>';
    api('/api/miniapp/random', { method: 'POST', body: JSON.stringify(payload) })
      .then((data) => {
        const list = [];
        if (data && Array.isArray(data.items)) {
          list.push.apply(list, data.items);
        } else if (data && data.film) {
          list.push(data.film);
        }
        root.innerHTML = '<div class="wtw-wizard-actions"><button type="button" class="btn btn-secondary" id="wtw-wizard-edit">Изменить фильтры</button></div>' + renderWizardCards(list);
        const edit = document.getElementById('wtw-wizard-edit');
        if (edit) edit.addEventListener('click', () => renderWhattowatchWizard());
        root.querySelectorAll('[data-wtw-open-film]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-wtw-open-film');
            if (id) openFilmModal(Number(id));
          });
        });
        root.querySelectorAll('[data-wtw-add-kp]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const kp = btn.getAttribute('data-wtw-add-kp');
            if (!kp) return;
            btn.disabled = true;
            btn.textContent = 'Добавляем…';
            api('/api/site/add-film', { method: 'POST', body: JSON.stringify({ kp_id: kp }) })
              .then((r) => {
                if (r && r.success) {
                  btn.textContent = 'Добавлено';
                  if (typeof loadUnwatched === 'function') loadUnwatched();
                } else {
                  btn.disabled = false;
                  btn.textContent = 'Добавить в базу';
                }
              })
              .catch(() => {
                btn.disabled = false;
                btn.textContent = 'Добавить в базу';
              });
          });
        });
      })
      .catch(() => {
        root.innerHTML = '<div class="cabinet-hint">Ошибка сети. Попробуйте ещё раз.</div>';
      });
  }

  function renderSettingsSection() {
    const root = document.getElementById('settings-content');
    if (!root) return;
    root.innerHTML = '<div class="cabinet-hint">Загружаем…</div>';
    api('/api/miniapp/profile').then((d) => {
      const u = d && d.user;
      const sub = d && d.subscription;
      const name = (u && (u.first_name || u.username)) ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.username : 'Профиль';
      root.innerHTML = `
        <p class="cabinet-hint">Настройки аккаунта, главной страницы и устройств для просмотра.</p>
        <div class="settings-block"><div class="header-dropdown-title" style="margin-top:0">Профиль</div>
        <p><b>${escapeHtml(name || '')}</b> ${u && u.username ? ' · @' + escapeHtml(u.username) : ''}</p>
        ${sub ? '<p>💎 Подписка: активна</p>' : '<p>🆓 Бесплатный режим</p>'}
        </div>
        <div class="settings-block" id="settings-api-token-block">
        <div class="header-dropdown-title" style="margin-top:0">API и нейросети</div>
        <p class="cabinet-hint" style="margin-bottom:10px;line-height:1.45">
        Тот же секрет, что использует кабинет при запросах к серверу. Укажите в Zapier, Cursor MCP или curl как заголовок
        <code style="font-size:12px">Authorization: Bearer …</code>. Не публикуйте токен.
        </p>
        <p class="muted small" style="margin-bottom:8px">Адрес API: <code id="settings-api-base" style="font-size:12px"></code></p>
        <div class="settings-block settings-list" style="margin-top:0;padding-top:0;border:none">
        <button type="button" class="settings-row" id="settings-copy-api-token">🔑 Скопировать токен</button>
        <a href="${API_BASE}/developer" class="settings-row" rel="noopener">Документация и OAuth</a>
        <a href="${API_BASE}/integration" class="settings-row" rel="noopener">Страница токена (как в браузере)</a>
        </div>
        <p class="muted small" id="settings-api-token-hint" style="margin-top:8px"></p>
        </div>
        <div class="settings-block settings-list">
        <button type="button" class="settings-row" data-sets-go="home-layout">🏠 Настроить главную</button>
        <button type="button" class="settings-row" data-sets-go="tv">📺 Телевизор</button>
        <button type="button" class="settings-row" data-sets-go="groups">Друзья и группы</button>
        <a href="#" class="settings-row" id="settings-app-apk" target="_blank" rel="noopener">Скачать Android-приложение (APK)</a>
        </div>
        <div class="settings-block" id="settings-toggles">Загрузка уведомлений…</div>`;
      const apk = document.getElementById('settings-app-apk');
      if (apk) {
        fetch(API_BASE + '/api/app/release', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((rel) => {
            if (rel && rel.url) {
              apk.href = rel.url;
            } else {
              apk.href = API_BASE + '/download';
            }
          })
          .catch(() => { apk.href = API_BASE + '/download'; });
      }
      root.querySelectorAll('[data-sets-go]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const g = btn.getAttribute('data-sets-go');
          if (g === 'home-layout') { openHomeLayoutModal(); return; }
          if (g === 'tv') { showSection('tv'); if (renderTvSection) renderTvSection(); }
          if (g === 'groups') { showSection('groups'); if (renderGroupsSection) renderGroupsSection(); }
        });
      });
      const baseEl = document.getElementById('settings-api-base');
      const copyBtn = document.getElementById('settings-copy-api-token');
      const hintEl = document.getElementById('settings-api-token-hint');
      if (baseEl) baseEl.textContent = getPublicApiBase();
      const curTok = getToken();
      if (copyBtn) {
        if (!curTok) {
          copyBtn.disabled = true;
          if (hintEl) hintEl.textContent = 'Войдите в кабинет — токен доступен после входа.';
        } else {
          copyBtn.addEventListener('click', () => {
            copyToClipboard(curTok)
              .then(() => { showToast('Токен скопирован'); })
              .catch(() => { alert('Не удалось скопировать'); });
          });
        }
      }
    }).catch(() => { root.innerHTML = '<p class="cabinet-hint">Не удалось загрузить настройки. Попробуйте обновить страницу.</p>'; });
  }

  // ————————————————————————————————————————————————————
  // Phase 3: Groups section
  // ————————————————————————————————————————————————————

  function groupCardEmoji(p) {
    if (p.is_personal) return '';
    if (p.is_virtual) return (p.group_emoji && String(p.group_emoji).trim()) ? p.group_emoji : '🎬';
    return '💬';
  }

  function leaveOrDeleteGroup(p) {
    const id = p.chat_id;
    const isVirt = !!p.is_virtual;
    if (p.is_personal) return;
    const isOwner = (p.my_role || '') === 'owner';
    const doDelete = isVirt && isOwner
      && window.confirm('Удалить комнату навсегда? Данные и участники будут сняты.');
    const doLeave = !doDelete
      && window.confirm(isVirt
        ? 'Покинуть комнату? К базе вы потеряете доступ, пока вас снова не пригласят.'
        : 'Покинуть группу в кабинете? (Telegram-чат не удалится.)');
    if (!doDelete && !doLeave) return;
    if (doDelete) {
      api('/api/site/rooms/' + encodeURIComponent(id), { method: 'DELETE' }).then((r) => {
        if (r && r.success) { renderGroupsSection(); loadMeAndShowCabinet(); }
        else { alert((r && r.message) || (r && r.error) || 'Не удалось удалить'); }
      });
      return;
    }
    api('/api/site/rooms/' + encodeURIComponent(id) + '/leave', { method: 'POST' }).then((r) => {
      if (r && r.success) { renderGroupsSection(); loadMeAndShowCabinet(); }
      else { alert((r && r.message) || (r && r.error) || 'Не удалось выйти'); }
    });
  }

  function openRoomMembersModal(chatId) {
    const modal = document.getElementById('room-members-modal');
    const body = document.getElementById('room-members-body');
    if (!modal || !body) return;
    body.innerHTML = '<div class="cabinet-hint">Загружаем…</div>';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    api('/api/site/rooms/' + encodeURIComponent(chatId) + '/members').then((d) => {
      if (!d || !d.success) {
        body.innerHTML = '<p class="cabinet-hint">' + escapeHtml((d && d.error) || 'Нет доступа') + '</p>';
        return;
      }
      if (!d.can_manage_members) {
        body.innerHTML = '<p class="cabinet-hint">Управление участниками доступно владельцу и администраторам.</p>';
        return;
      }
      const mem = d.members || [];
      body.innerHTML = mem.map((m) => {
        if (m.is_me) {
          return '<div class="room-member-row"><span class="room-member-name">' + escapeHtml(m.name || '') + ' <span class="muted">(вы)</span></span></div>';
        }
        const isOwner = m.is_owner;
        if (isOwner) {
          return '<div class="room-member-row"><span class="room-member-name">' + escapeHtml(m.name || '') + '</span><span class="muted">создатель</span></div>';
        }
        const role = (m.role || 'member') === 'admin' ? 'admin' : 'member';
        return `<div class="room-member-row" data-muid="${escapeHtml(String(m.user_id))}">
          <span class="room-member-name">${escapeHtml(m.name || '')}</span>
          <div class="room-member-controls">
            <select data-mem-role>
              <option value="member"${role === 'member' ? ' selected' : ''}>Участник</option>
              <option value="admin"${role === 'admin' ? ' selected' : ''}>Админ</option>
            </select>
            <label class="muted small" style="display:flex;align-items:center;gap:4px;cursor:pointer">
              <input type="checkbox" data-mem-delegate${m.can_manage_admins ? ' checked' : ''}> Может назн. админов
            </label>
            <button type="button" class="btn btn-small btn-primary" data-mem-apply>Применить</button>
          </div>
        </div>`;
      }).join('');
      body.querySelectorAll('[data-mem-apply]').forEach((btn) => {
        const row = btn.closest('.room-member-row');
        if (!row) return;
        btn.addEventListener('click', () => {
          const uid = row.getAttribute('data-muid');
          const roleSel = row.querySelector('[data-mem-role]');
          const del = row.querySelector('[data-mem-delegate]');
          const role = roleSel ? roleSel.value : 'member';
          const canD = del && del.checked;
          api('/api/site/rooms/' + encodeURIComponent(chatId) + '/members/' + uid, {
            method: 'PATCH',
            body: JSON.stringify({ role, can_manage_admins: canD }),
          }).then((r) => {
            if (r && r.success) { showToast('Сохранено'); openRoomMembersModal(chatId); }
            else { alert((r && r.error) || 'Ошибка'); }
          });
        });
      });
    });
    const closeModal = function () { modal.classList.add('hidden'); document.body.style.overflow = ''; };
    if (!modal._mpRmCloseBound) {
      modal._mpRmCloseBound = true;
      modal.querySelectorAll('[data-action="close-room-members-modal"]').forEach((c) => {
        c.addEventListener('click', (ev) => { ev.preventDefault(); closeModal(); });
      });
    }
  }

  function renderGroupsSection() {
    const list = document.getElementById('groups-list');
    if (!list) return;
    list.innerHTML = '<div class="cabinet-hint">Загружаем профили…</div>';
    api('/api/site/profiles').then((data) => {
      if (!data || !data.success) {
        list.innerHTML = '<div class="cabinet-hint">' + escapeHtml((data && data.error) || 'Не удалось загрузить профили') + '</div>';
        return;
      }
      const profiles = data.profiles || [];
      if (!profiles.length) {
        list.innerHTML = '<div class="cabinet-hint">Пока только этот профиль. Создайте виртуальную комнату кнопкой справа — и позовите друзей.</div>';
        return;
      }
      list.innerHTML = profiles.map((p) => {
        const emoji = groupCardEmoji(p);
        let type;
        if (p.is_personal) type = 'Личный';
        else if (p.is_virtual) type = 'Виртуальная комната';
        else type = 'Telegram-группа';
        const active = p.is_active;
        const showClose = !p.is_personal;
        const showManage = p.is_virtual;
        const shareBtn = (!p.is_personal)
          ? '<button type="button" data-action="share-profile" data-chat-id="' + escapeHtml(String(p.chat_id)) + '" data-is-virtual="' + (p.is_virtual ? 1 : 0) + '">🔗 Пригласить</button>'
          : '';
        return `<div class="group-card ${active ? 'active' : ''}${p.is_virtual ? ' group-card-virtual' : ''}">
          ${showClose ? '<button type="button" class="group-card-close" data-action="group-exit" data-cid="' + escapeHtml(String(p.chat_id)) + '" title="Удалить или выйти">×</button>' : ''}
          <div class="group-card-head">
            <span class="group-card-emoji">${escapeHtml(emoji)}</span>
            <span class="group-card-name">${escapeHtml(p.display_name || p.name || 'Профиль')}</span>
          </div>
          <div class="group-card-type">${type}</div>
          <div class="group-card-meta"><span>🎬 ${p.movies_count || 0}</span><span>⭐ ${p.ratings_count || 0}</span></div>
          <div class="group-card-actions">
            ${active
        ? '<button type="button" disabled>Активен</button>'
        : '<button type="button" class="primary" data-action="switch-profile" data-chat-id="' + escapeHtml(String(p.chat_id)) + '">Открыть</button>'}
            ${shareBtn}
            ${showManage ? '<button type="button" class="group-card-manage" data-action="group-manage" data-cid="' + escapeHtml(String(p.chat_id)) + '">Участники</button>' : ''}
          </div>
        </div>`;
      }).join('');

      const profByCid = Object.fromEntries(profiles.map((p) => [String(p.chat_id), p]));
      list.querySelectorAll('[data-action="group-exit"]').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const cid = b.getAttribute('data-cid');
          const p = profByCid[cid];
          if (p) leaveOrDeleteGroup(p);
        });
      });
      list.querySelectorAll('[data-action="group-manage"]').forEach((b) => {
        b.addEventListener('click', () => openRoomMembersModal(b.getAttribute('data-cid')));
      });
      list.querySelectorAll('[data-action="switch-profile"]').forEach((b) => {
        b.addEventListener('click', () => switchProfileTo(b.getAttribute('data-chat-id')));
      });
      list.querySelectorAll('[data-action="share-profile"]').forEach((b) => {
        b.addEventListener('click', () => generateRoomInvite(b.getAttribute('data-chat-id'), b.getAttribute('data-is-virtual') === '1'));
      });
    });
  }

  // ————————————————————————————————————————————————————
  // Phase 4: Virtual rooms — create & share invite
  // ————————————————————————————————————————————————————

  function openCreateRoomModal() {
    const modal = document.getElementById('create-room-modal');
    if (!modal) return;
    const input = document.getElementById('create-room-name');
    const statusEl = document.getElementById('create-room-status');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'add-film-status'; }
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeCreateRoomModal() {
    const modal = document.getElementById('create-room-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function bindCreateRoomModal() {
    const openBtn = document.getElementById('groups-create-room-btn');
    if (openBtn) openBtn.addEventListener('click', openCreateRoomModal);
    const modal = document.getElementById('create-room-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-action') === 'close-create-room-modal') closeCreateRoomModal();
      });
    }
    const emojiRow = document.getElementById('create-room-emoji-row');
    if (emojiRow) {
      emojiRow.addEventListener('click', (e) => {
        const btn = e.target.closest('.create-room-emoji-btn');
        if (!btn) return;
        emojiRow.querySelectorAll('.create-room-emoji-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    }
    const submitBtn = document.getElementById('create-room-submit');
    if (submitBtn) submitBtn.addEventListener('click', submitCreateRoom);
    const nameInput = document.getElementById('create-room-name');
    if (nameInput) nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitCreateRoom(); });
  }

  function submitCreateRoom() {
    const nameInput = document.getElementById('create-room-name');
    const statusEl = document.getElementById('create-room-status');
    const submitBtn = document.getElementById('create-room-submit');
    const emojiActive = document.querySelector('#create-room-emoji-row .create-room-emoji-btn.active');
    const name = (nameInput && nameInput.value || '').trim();
    const emoji = (emojiActive && emojiActive.getAttribute('data-emoji')) || '🎬';
    if (!name) { if (statusEl) { statusEl.textContent = 'Введите название комнаты'; statusEl.className = 'add-film-status error'; } return; }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Создаём…'; }
    api('/api/site/rooms', { method: 'POST', body: JSON.stringify({ name, emoji }) }).then((data) => {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Создать комнату'; }
      if (!data || !data.success) {
        if (statusEl) { statusEl.textContent = (data && data.error) || 'Не удалось создать комнату'; statusEl.className = 'add-film-status error'; }
        return;
      }
      closeCreateRoomModal();
      // Сразу переключаемся в комнату
      try { localStorage.setItem('mp_site_token', data.token); } catch (_) {}
      // Показываем ссылку-приглашение
      showShareInvite({
        chat_id: data.chat_id,
        url: data.invite_url,
        name: `${data.emoji || '🎬'} ${data.name}`.trim(),
        is_virtual: true,
      });
      // После закрытия share-modal — обновим кабинет
    }).catch(() => {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Создать комнату'; }
      if (statusEl) { statusEl.textContent = 'Ошибка сети'; statusEl.className = 'add-film-status error'; }
    });
  }

  function generateRoomInvite(chatId, isVirtual) {
    if (!chatId) return;
    api(`/api/site/rooms/${encodeURIComponent(chatId)}/invite`, { method: 'POST' }).then((data) => {
      if (!data || !data.success) {
        showToast((data && data.error) || 'Не удалось создать приглашение', { type: 'error' });
        return;
      }
      // Сразу копируем ссылку в буфер и даём пользователю понять,
      // что всё получилось — даже если модалка не откроется по каким-то причинам.
      copyToClipboard(data.invite_url)
        .then(() => showToast('📋 Ссылка скопирована — отправьте другу'))
        .catch(() => showToast('🔗 Ссылка создана — нажмите «Скопировать» в окне'));
      showShareInvite({
        chat_id: chatId,
        url: data.invite_url,
        name: '',
        is_virtual: !!isVirtual,
        expires_at: data.expires_at,
      });
    });
  }

  function showShareInvite(info) {
    const modal = document.getElementById('share-invite-modal');
    if (!modal) return;
    const urlEl = document.getElementById('share-invite-url');
    const titleEl = document.getElementById('share-invite-title');
    const hintEl = document.getElementById('share-invite-hint');
    const metaEl = document.getElementById('share-invite-meta');
    const copyBtn = document.getElementById('share-invite-copy');
    const tgLink = document.getElementById('share-invite-telegram');
    const waLink = document.getElementById('share-invite-whatsapp');
    if (urlEl) urlEl.textContent = info.url || '';
    if (titleEl) titleEl.textContent = info.name ? `Пригласить в «${info.name}»` : 'Ссылка для приглашения';
    if (hintEl) hintEl.textContent = info.is_virtual
      ? 'Отправьте эту ссылку — друг попадёт в вашу виртуальную комнату прямо с сайта, без Telegram.'
      : 'Отправьте эту ссылку — друг получит доступ к этой группе в личном кабинете на сайте.';
    if (metaEl) {
      const parts = ['Ссылка действует 7 дней', 'до 10 приглашений'];
      metaEl.textContent = parts.join(' · ');
    }
    const text = `Присоединяйся к моей комнате на movie-planner.ru: ${info.url}`;
    if (tgLink) tgLink.href = `https://t.me/share/url?url=${encodeURIComponent(info.url || '')}&text=${encodeURIComponent('Присоединяйся к моей комнате на Movie Planner')}`;
    if (waLink) waLink.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (copyBtn && !copyBtn._bound) {
      copyBtn._bound = true;
      copyBtn.addEventListener('click', () => {
        const url = urlEl ? urlEl.textContent : '';
        if (!url) return;
        copyToClipboard(url)
          .then(() => {
            copyBtn.textContent = '✅ Скопировано';
            showToast('📋 Ссылка скопирована');
            setTimeout(() => { copyBtn.textContent = '📋 Скопировать'; }, 1500);
          })
          .catch(() => {
            copyBtn.textContent = '✅ Скопировано';
            showToast('📋 Ссылка скопирована');
          });
      });
    }
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    if (!modal._bound) {
      modal._bound = true;
      modal.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-action') === 'close-share-invite-modal') {
          modal.classList.add('hidden');
          modal.setAttribute('aria-hidden', 'true');
          // После закрытия — если мы на вкладке Groups — перерисуем и пересоздадим кабинет
          try { loadMeAndShowCabinet(); } catch (_) {}
        }
      });
    }
    document.body.style.overflow = 'hidden';
  }

  // ————————————————————————————————————————————————————
  // Phase 3: Premieres section
  // ————————————————————————————————————————————————————

  function premiereTodayYmdMsk() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }
  function premiereExtractYmd(dateStr) {
    if (dateStr == null || dateStr === '') return null;
    const s = String(dateStr);
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dmy) {
      const dd = dmy[1].padStart(2, '0');
      const mm = dmy[2].padStart(2, '0');
      return dmy[3] + '-' + mm + '-' + dd;
    }
    return null;
  }
  /** Текущий / следующий месяц: только даты строго после сегодня (МСК), как «Скоро» в миниаппе. */
  function filterPremieresUpcomingMsk(items) {
    const today = premiereTodayYmdMsk();
    return (items || []).filter((p) => {
      const ymd = premiereExtractYmd(p.premiere_date);
      return ymd && ymd > today;
    });
  }

  let _premieresData = [];
  let _premieresPeriod = 'current_month';
  let _premieresSort = 'date';

  function renderPremieresSection(forceReload) {
    const periodSel = document.getElementById('premieres-period');
    const sortSel = document.getElementById('premieres-sort');
    if (periodSel && periodSel.value) _premieresPeriod = periodSel.value;
    if (periodSel && !periodSel._bound) {
      periodSel._bound = true;
      periodSel.addEventListener('change', () => { _premieresPeriod = periodSel.value; renderPremieresSection(true); });
    }
    if (sortSel && !sortSel._bound) {
      sortSel._bound = true;
      sortSel.addEventListener('change', () => { _premieresSort = sortSel.value; renderPremieresList(); });
    }
    const loading = document.getElementById('premieres-loading');
    const errorEl = document.getElementById('premieres-error');
    const grid = document.getElementById('premieres-grid');
    if (errorEl) { errorEl.classList.add('hidden'); errorEl.textContent = ''; }
    if (forceReload || !_premieresData.length) {
      if (loading) loading.classList.remove('hidden');
      if (grid) grid.innerHTML = '';
      api('/api/site/premieres?period=' + encodeURIComponent(_premieresPeriod)).then((data) => {
        if (loading) loading.classList.add('hidden');
        if (!data || !data.success) {
          if (errorEl) { errorEl.textContent = (data && data.error) || 'Не удалось загрузить премьеры'; errorEl.classList.remove('hidden'); }
          _premieresData = [];
          return;
        }
        _premieresData = data.items || [];
        renderPremieresList();
      }).catch(() => {
        if (loading) loading.classList.add('hidden');
        if (errorEl) { errorEl.textContent = 'Ошибка сети.'; errorEl.classList.remove('hidden'); }
      });
    } else {
      renderPremieresList();
    }
  }

  function renderPremieresList() {
    const grid = document.getElementById('premieres-grid');
    if (!grid) return;
    let items = (_premieresData || []).slice();
    if (_premieresSort === 'genre') {
      items.sort((a, b) => (a.genres || '').localeCompare(b.genres || ''));
    } else {
      items.sort((a, b) => String(a.premiere_date || '').localeCompare(String(b.premiere_date || '')));
    }
    if (_premieresPeriod === 'current_month' || _premieresPeriod === 'next_month') {
      items = filterPremieresUpcomingMsk(items);
    }
    if (!items.length) {
      grid.innerHTML = '<div class="cabinet-hint">На этот период премьер нет.</div>';
      return;
    }
    grid.innerHTML = items.map((it) => {
      const poster = it.poster || '';
      const year = it.year ? ` · ${it.year}` : '';
      const dateLabel = formatPremiereDate(it.premiere_date);
      const inBase = it.already_in_base_film_id;
      const reminder = it.reminder_set;
      const reminderBtn = reminder
        ? `<button type="button" class="active" data-action="premiere-notify-off" data-kp="${escapeHtml(String(it.kp_id))}" data-film-id="${escapeHtml(String(inBase||''))}">🔔 Отключить</button>`
        : `<button type="button" data-action="premiere-notify-on" data-kp="${escapeHtml(String(it.kp_id))}" data-date="${escapeHtml(String(it.premiere_date||''))}">🔔 Напомнить</button>`;
      const addBtn = inBase
        ? `<button type="button" disabled>В базе</button>`
        : `<button type="button" data-action="premiere-add" data-kp="${escapeHtml(String(it.kp_id))}">＋ В базу</button>`;
      return `<div class="premiere-card" data-film-id="${escapeHtml(String(inBase||''))}" data-kp="${escapeHtml(String(it.kp_id))}">
        ${poster ? `<img class="premiere-card-poster" src="${escapeHtml(poster)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<div class="premiere-card-poster"></div>'}
        <div class="premiere-card-body">
          <div class="premiere-card-title">${escapeHtml(it.title || '')}</div>
          ${dateLabel ? `<div class="premiere-card-date">🎬 ${escapeHtml(dateLabel)}</div>` : ''}
          <div class="premiere-card-meta">${escapeHtml(it.genres || '')}${year}</div>
          <div class="premiere-card-actions" data-stop-card-click="1">
            ${reminderBtn}
            ${addBtn}
          </div>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('[data-action="premiere-notify-on"]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const kp = b.getAttribute('data-kp');
        const date = b.getAttribute('data-date');
        b.disabled = true; b.textContent = '…';
        api('/api/site/premieres/' + encodeURIComponent(kp) + '/notify', {
          method: 'POST', body: JSON.stringify({ premiere_date: date }),
        }).then((data) => {
          if (!data || !data.success) { alert((data && data.error) || 'Не удалось'); b.disabled = false; b.textContent = '🔔 Напомнить'; return; }
          const it = _premieresData.find((x) => String(x.kp_id) === String(kp));
          if (it) { it.reminder_set = true; it.already_in_base_film_id = it.already_in_base_film_id || data.film_id; }
          renderPremieresList();
        });
      });
    });
    grid.querySelectorAll('[data-action="premiere-notify-off"]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const kp = b.getAttribute('data-kp');
        b.disabled = true; b.textContent = '…';
        api('/api/site/premieres/' + encodeURIComponent(kp) + '/notify', { method: 'DELETE' }).then((data) => {
          if (!data || !data.success) { alert((data && data.error) || 'Не удалось'); b.disabled = false; return; }
          const it = _premieresData.find((x) => String(x.kp_id) === String(kp));
          if (it) it.reminder_set = false;
          renderPremieresList();
        });
      });
    });
    grid.querySelectorAll('[data-action="premiere-add"]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const kp = b.getAttribute('data-kp');
        b.disabled = true; b.textContent = 'Добавляем…';
        api('/api/site/add-film', { method: 'POST', body: JSON.stringify({ kp_id: kp }) }).then((data) => {
          if (!data || !data.success) { alert((data && data.error) || 'Не удалось'); b.disabled = false; b.textContent = '＋ В базу'; return; }
          const it = _premieresData.find((x) => String(x.kp_id) === String(kp));
          if (it) it.already_in_base_film_id = data.film_id;
          if (typeof loadUnwatched === 'function') loadUnwatched();
          renderPremieresList();
        });
      });
    });
    grid.querySelectorAll('.premiere-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-stop-card-click]')) return;
        const filmId = card.getAttribute('data-film-id');
        if (filmId && filmId !== 'null' && filmId !== '') {
          if (typeof openFilmModal === 'function') openFilmModal(Number(filmId));
        }
      });
    });
  }

  function formatPremiereDate(s) {
    if (!s) return '';
    try {
      // YYYY-MM-DD или DD.MM.YYYY
      const m1 = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m1) {
        const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
        const d = parseInt(m1[3], 10), mo = parseInt(m1[2], 10) - 1;
        return d + ' ' + months[mo];
      }
      const m2 = String(s).match(/^(\d{2})\.(\d{2})\.(\d{4})/);
      if (m2) {
        const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
        return parseInt(m2[1], 10) + ' ' + months[parseInt(m2[2], 10) - 1];
      }
    } catch (_) {}
    return s;
  }

  // ————————————————————————————————————————————————————
  // Phase 3/4: invite token handling (?invite_token=...)
  // ————————————————————————————————————————————————————

  function handleInviteTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('invite_token');
    if (!t) return;
    params.delete('invite_token');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
    // Всегда показываем preview + confirmation (и для auth, и для guest'ов).
    showInviteConfirmModal(t);
  }

  function showInviteConfirmModal(token) {
    const modal = document.getElementById('invite-confirm-modal');
    if (!modal) return;
    const emojiEl = document.getElementById('invite-confirm-emoji');
    const titleEl = document.getElementById('invite-confirm-title');
    const hintEl = document.getElementById('invite-confirm-hint');
    const metaEl = document.getElementById('invite-confirm-meta');
    const statusEl = document.getElementById('invite-confirm-status');
    const submitBtn = document.getElementById('invite-confirm-submit');
    if (emojiEl) emojiEl.textContent = '👥';
    if (titleEl) titleEl.textContent = 'Загружаем приглашение…';
    if (hintEl) hintEl.textContent = '';
    if (metaEl) metaEl.textContent = '';
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'add-film-status'; }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Присоединиться'; }
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (!modal._bound) {
      modal._bound = true;
      modal.addEventListener('click', (e) => {
        const el = e.target;
        if (el && el.getAttribute && el.getAttribute('data-action') === 'close-invite-confirm-modal') {
          closeInviteConfirmModal();
        }
      });
    }

    // Подтягиваем preview (публично, без авторизации)
    fetch(API_BASE + '/api/site/invite/info?token=' + encodeURIComponent(token))
      .then((r) => r.json().catch(() => ({})))
      .then((info) => {
        if (!info || !info.success) {
          if (titleEl) titleEl.textContent = 'Не удалось загрузить приглашение';
          if (hintEl) hintEl.textContent = 'Попросите отправителя создать новую ссылку.';
          return;
        }
        if (info.is_expired) {
          if (emojiEl) emojiEl.textContent = '⌛';
          if (titleEl) titleEl.textContent = 'Ссылка больше не работает';
          if (hintEl) {
            hintEl.textContent = info.reason === 'uses_exhausted'
              ? 'Лимит использований этой ссылки исчерпан. Попросите создать новую.'
              : 'Срок действия ссылки истёк. Попросите отправителя сгенерировать новую.';
          }
          return;
        }
        if (emojiEl) emojiEl.textContent = info.emoji || '👥';
        if (titleEl) titleEl.textContent = 'Присоединиться к «' + (info.name || 'Группа') + '»?';
        if (hintEl) {
          hintEl.textContent = info.is_virtual
            ? 'Это виртуальная комната — общая база планов и фильмов с друзьями, без Telegram-чата.'
            : 'Это Telegram-группа с общей базой фильмов и планов.';
        }
        if (metaEl) {
          const parts = [];
          if (info.members_count != null) parts.push(info.members_count + ' ' + pluralRu(info.members_count, ['участник','участника','участников']));
          if (info.uses_left != null) parts.push('ещё ' + info.uses_left + ' ' + pluralRu(info.uses_left, ['приглашение','приглашения','приглашений']));
          metaEl.textContent = parts.join(' · ');
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.onclick = () => handleInviteConfirmClick(token, info);
        }
      })
      .catch(() => {
        if (titleEl) titleEl.textContent = 'Не удалось загрузить приглашение';
        if (hintEl) hintEl.textContent = 'Проверьте интернет и попробуйте ещё раз.';
      });
  }

  function pluralRu(n, forms) {
    n = Math.abs(n) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  }

  function closeInviteConfirmModal() {
    const modal = document.getElementById('invite-confirm-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function handleInviteConfirmClick(token, info) {
    if (!getToken()) {
      // Guest: сохраняем токен и предлагаем залогиниться.
      try { localStorage.setItem('mp_pending_invite_token', token); } catch (_) {}
      const statusEl = document.getElementById('invite-confirm-status');
      if (statusEl) {
        statusEl.textContent = 'Нужно войти, чтобы присоединиться. Откроется окно входа…';
        statusEl.className = 'add-film-status';
      }
      setTimeout(() => {
        closeInviteConfirmModal();
        try {
          const lm = document.getElementById('login-modal');
          if (lm) { lm.classList.remove('hidden'); lm.setAttribute('aria-hidden', 'false'); }
        } catch (_) {}
      }, 600);
      return;
    }
    const submitBtn = document.getElementById('invite-confirm-submit');
    const statusEl = document.getElementById('invite-confirm-status');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Присоединяемся…'; }
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'add-film-status'; }
    acceptInviteToken(token, info);
  }

  function acceptInviteToken(token, previewInfo) {
    return api('/api/site/invite/accept', { method: 'POST', body: JSON.stringify({ invite_token: token }) }).then((data) => {
      if (!data || !data.success) {
        const statusEl = document.getElementById('invite-confirm-status');
        const submitBtn = document.getElementById('invite-confirm-submit');
        if (statusEl) { statusEl.textContent = (data && data.error) || 'Не удалось присоединиться'; statusEl.className = 'add-film-status error'; }
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Присоединиться'; }
        return;
      }
      const sessions = getSessions();
      const existing = sessions.find((s) => String(s.chat_id) === String(data.chat_id));
      if (existing) {
        existing.token = data.token;
        existing.name = data.name;
      } else {
        sessions.push({ chat_id: String(data.chat_id), token: data.token, name: data.name, is_personal: false, has_data: true });
      }
      setSessions(sessions);
      setActiveChatId(data.chat_id);
      try { localStorage.removeItem('mp_pending_invite_token'); } catch (_) {}
      closeInviteConfirmModal();
      showInviteSuccessModal({
        name: data.name || (previewInfo && previewInfo.name) || 'Группа',
        emoji: (previewInfo && previewInfo.emoji) || '🎉',
        already_member: !!data.already_member,
      });
    });
  }

  function showInviteSuccessModal(info) {
    const modal = document.getElementById('invite-success-modal');
    if (!modal) {
      // Fallback — просто переходим в кабинет
      loadMeAndShowCabinet();
      return;
    }
    const emojiEl = document.getElementById('invite-success-emoji');
    const titleEl = document.getElementById('invite-success-title');
    const hintEl = document.getElementById('invite-success-hint');
    const gotoBtn = document.getElementById('invite-success-goto');
    if (emojiEl) emojiEl.textContent = info.emoji || '🎉';
    if (titleEl) titleEl.textContent = info.already_member
      ? 'Вы уже в «' + info.name + '»'
      : 'Готово! Вы в «' + info.name + '»';
    if (hintEl) hintEl.textContent = info.already_member
      ? 'Продолжайте пользоваться общей базой фильмов и планов.'
      : 'Теперь вам доступны общие планы и фильмы этой группы. Переключайтесь между профилями через меню в правом верхнем углу.';
    if (gotoBtn) {
      gotoBtn.onclick = () => {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        loadMeAndShowCabinet();
      };
    }
    if (!modal._bound) {
      modal._bound = true;
      modal.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-action') === 'close-invite-success-modal') {
          modal.classList.add('hidden');
          modal.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
          loadMeAndShowCabinet();
        }
      });
    }
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function init() {
    bindLogin();
    bindFaq();
    initCarousels();
    initLightbox();

    function handleHash() {
      const parsed = parsePublicStatsHash();
      if (parsed) {
        showPublicStatsView(parsed);
        return true;
      }
      const header = document.getElementById('site-header');
      if (header) header.classList.remove('hidden');
      return false;
    }

    window.addEventListener('hashchange', () => {
      if (handleHash()) return;
      showScreen('landing');
      if (getToken()) loadMeAndShowCabinet();
    });

    const isPublicStats = handleHash();
    const userWrap = document.getElementById('header-user-wrap');

    bindAddFilmModal();
    bindProfileSwitcher();
    bindCreateRoomModal();
    bindHeaderSearch();
    bindPlansGotoOnce();
    bindHomeSectionNavOnce();
    bindHomeLayoutModalOnce();
    bindHomeShazamOnce();
    bindHomeQuickActionsOnce();
    const filmBack = document.getElementById('film-page-back');
    if (filmBack) {
      filmBack.addEventListener('click', (e) => {
        e.preventDefault();
        closeFilmPage();
      });
    }
    const filmShare = document.getElementById('film-page-share');
    if (filmShare) {
      filmShare.addEventListener('click', (e) => {
        e.preventDefault();
        const u = String(window.location.href || '').split('#')[0];
        copyToClipboard(u)
          .then(() => { showToast('Ссылка скопирована'); })
          .catch(() => { showToast('Не удалось скопировать', { type: 'error' }); });
      });
    }
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest('[data-action="close-film-page"]');
      if (b) {
        e.preventDefault();
        closeFilmPage();
      }
    });
    handleInviteTokenFromUrl();

    // P4.3: History API — кабинет, /film/:id, разделы
    window.addEventListener('popstate', () => {
      if (handleHash()) return;
      if (!getToken()) return;
      const pathF = filmIdFromPathname(window.location.pathname);
      if (pathF) {
        try { openFilmPage(pathF, { skipHistory: true, replace: true }); } catch (e) {}
        return;
      }
      try { restoreDocumentTitle(); } catch (e) {}
      const sec = sectionFromPath(window.location.pathname);
      if (sec) {
        showSection(sec, { skipPush: true });
        if (sec === 'home') { try { scheduleHomeDashboardRefresh(); } catch (_) {} }
        if (sec === 'tv' && typeof renderTvSection === 'function') renderTvSection();
        if (sec === 'premieres' && typeof renderPremieresSection === 'function') renderPremieresSection();
        if (sec === 'groups' && typeof renderGroupsSection === 'function') renderGroupsSection();
        if (sec === 'whattowatch' && typeof renderWhattowatchSection === 'function') renderWhattowatchSection();
        if (sec === 'settings' && typeof renderSettingsSection === 'function') renderSettingsSection();
        if (sec === 'stats') {
          initStatsSelectors();
          const now = new Date();
          (function () { const g = window._getStatsMonthYear ? window._getStatsMonthYear() : (function () { const y = document.getElementById('stats-year'); const p = document.getElementById('stats-month-pills'); const a = p && p.querySelector('.month-pill.active'); const m = a ? parseInt(a.getAttribute('data-month'), 10) : now.getMonth() + 1; return { m, y: y ? parseInt(y.value, 10) : now.getFullYear() }; })(); loadStats(g.m, g.y); })();
        }
      }
    });

    document.querySelectorAll('.cabinet-nav [data-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sectionId = btn.getAttribute('data-section');
        showSection(sectionId);
        if (sectionId === 'tv') {
          renderTvSection();
        }
        if (sectionId === 'premieres') {
          renderPremieresSection();
        }
        if (sectionId === 'groups') {
          renderGroupsSection();
        }
        if (sectionId === 'whattowatch' && typeof renderWhattowatchSection === 'function') {
          renderWhattowatchSection();
        }
        if (sectionId === 'settings' && typeof renderSettingsSection === 'function') {
          renderSettingsSection();
        }
        if (sectionId === 'stats') {
          initStatsSelectors();
          const monthEl = document.getElementById('stats-month');
          const yearEl = document.getElementById('stats-year');
          const now = new Date();
          (function () { const g = window._getStatsMonthYear ? window._getStatsMonthYear() : (function () { const y = document.getElementById('stats-year'); const p = document.getElementById('stats-month-pills'); const a = p && p.querySelector('.month-pill.active'); const m = a ? parseInt(a.getAttribute('data-month'), 10) : now.getMonth() + 1; return { m, y: y ? parseInt(y.value, 10) : now.getFullYear() }; })(); loadStats(g.m, g.y); })();
        }
        if (sectionId === 'home') {
          try { scheduleHomeDashboardRefresh(); } catch (_) {}
        }
      });
    });

    const settingsHeaderBtn = document.getElementById('header-settings-btn');
    if (settingsHeaderBtn) {
      settingsHeaderBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const dd = document.getElementById('header-settings-dropdown');
        if (dd && dd.classList.contains('hidden')) openAccountDropdown();
        else closeAccountDropdown();
      });
    }
    document.addEventListener('click', (e) => {
      if (userWrap && !userWrap.contains(e.target)) closeAccountDropdown();
    });

    window.addEventListener('mp:logout', () => {
      renderHeader(null);
      showScreen('landing');
    });

    if (!isPublicStats) {
    // Миграция: старый одиночный токен -> одна сессия в списке
    const oldToken = localStorage.getItem('mp_site_token');
    if (!getToken() && oldToken) {
      const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + oldToken };
      fetch(API_BASE + '/api/site/me', { headers })
        .then((r) => r.json().catch(() => ({})))
        .then((me) => {
          if (me.success && me.chat_id != null) {
            const session = {
              chat_id: String(me.chat_id),
              token: oldToken,
              name: me.name,
              has_data: !!me.has_data,
              is_personal: !!me.is_personal
            };
            setSessions([session]);
            setActiveChatId(session.chat_id);
            localStorage.removeItem('mp_site_token');
            loadMeAndShowCabinet();
          } else {
            localStorage.removeItem('mp_site_token');
            showScreen('landing');
            renderHeader(null);
          }
        })
        .catch(() => {
          localStorage.removeItem('mp_site_token');
          showScreen('landing');
          renderHeader(null);
        });
      return;
    }

    if (getToken()) {
      loadMeAndShowCabinet();
    } else {
      showScreen('landing');
      renderHeader(null);
    }
    }

    const footerYearEl = document.getElementById('footer-year');
    if (footerYearEl) footerYearEl.textContent = new Date().getFullYear();

    // Parallax background emojis
    const parallaxBg = document.getElementById('parallaxBg');
    if (parallaxBg) {
      const emojis = ['🍿', '🎬', '🎞️', '🎥', '🎫', '⭐', '🎭'];
      for (let i = 0; i < 30; i++) {
        const el = document.createElement('div');
        el.className = 'parallax-emoji';
        el.textContent = emojis[i % emojis.length];
        const size = 18 + Math.random() * 27;
        const left = Math.random() * 100;
        const top = Math.random() * 200;
        const speed = 0.02 + Math.random() * 0.06;
        const opacity = 0.06 + Math.random() * 0.09;
        el.style.cssText = 'font-size:' + size + 'px; left:' + left + '%; top:' + top + '%; opacity:' + opacity + ';';
        parallaxBg.appendChild(el);
        el._parallaxSpeed = speed;
        el._parallaxBaseTop = top;
      }
      const items = parallaxBg.querySelectorAll('.parallax-emoji');
      window.addEventListener('scroll', function () {
        const y = window.scrollY;
        items.forEach(function (item) {
          const s = item._parallaxSpeed || 0.04;
          item.style.transform = 'translateY(' + (-y * s) + 'px)';
        });
      }, { passive: true });
    }

    // Opera: показывать «Установить расширение Opera» вместо Chrome
    const isOpera = /opr|opera/i.test(navigator.userAgent);
    document.querySelectorAll('.ext-btn-text').forEach(function (el) {
      el.textContent = isOpera ? 'Установить расширение Opera' : 'Установить расширение Chrome';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
