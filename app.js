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
  const TELEGRAM_BOT_ID = '8554485843';
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

  /** In-flight / результат «добавить в базу» по kp_id (поиск → карточка). */
  const kpAddSync = (function () {
    const pending = new Map();
    const done = new Map();
    const TTL = 600000;
    function prune() {
      const now = Date.now();
      done.forEach(function (v, k) {
        if (now - v.at > TTL) done.delete(k);
      });
    }
    function register(kpId, promise) {
      const kp = String(kpId);
      const tracked = promise
        .then(function (res) {
          if (res && res.success && res.film_id) {
            done.set(kp, { film_id: res.film_id, at: Date.now() });
          }
          pending.delete(kp);
          return res;
        })
        .catch(function (err) {
          pending.delete(kp);
          throw err;
        });
      pending.set(kp, tracked);
      return tracked;
    }
    function getFilmId(kpId) {
      prune();
      const d = done.get(String(kpId));
      return d ? d.film_id : null;
    }
    function waitFor(kpId) {
      const fid = getFilmId(kpId);
      if (fid) return Promise.resolve(fid);
      const p = pending.get(String(kpId));
      if (!p) return Promise.resolve(null);
      return p
        .then(function (res) {
          if (res && res.success && res.film_id) return res.film_id;
          return getFilmId(kpId);
        })
        .catch(function () {
          return getFilmId(kpId);
        });
    }
    return { register: register, getFilmId: getFilmId, waitFor: waitFor };
  })();

  function posterUrl(kpId) {
    if (!kpId) return '';
    return 'https://st.kp.yandex.net/images/film_big/' + String(kpId).replace(/\D/g, '') + '.jpg';
  }

  const FILM_SHARE_SITE = 'https://movie-planner.ru';
  function buildFilmShareUrl(kpId) {
    const k = String(kpId || '').replace(/\D/g, '');
    return k ? FILM_SHARE_SITE + '/f/' + k : '';
  }

  function cleanPosterUrl(src) {
    const s = String(src || '');
    if (!s || /\/no-poster(?:\.|\/|$)/i.test(s) || /no-poster/i.test(s)) return '';
    return s;
  }

  function showLoginModalOverlay() {
    try {
      document.body.classList.add('login-only-overlay');
      const landing = document.getElementById('landing');
      if (landing) landing.classList.add('hidden');
      const modal = document.getElementById('login-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
      }
    } catch (_) {}
  }

  function tryOpenLoginOnlyOverlay() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('open_login') !== '1' || getToken()) return;
      showLoginModalOverlay();
    } catch (_) {}
  }

  function hasAuthEntryDeepLink() {
    try {
      const params = new URLSearchParams(window.location.search);
      const kp = params.get('kp_open');
      if (params.get('open_login') === '1' || !!(kp && /^\d+$/.test(kp))) return true;
      const pathKp = kpIdFromPathname(window.location.pathname);
      const pathStaff = staffIdFromPathname(window.location.pathname);
      return !!(pathKp && /^\d+$/.test(pathKp)) || !!(pathStaff && /^\d+$/.test(pathStaff));
    } catch (_) {
      return false;
    }
  }

  /** GitHub Pages: /f/<kp> — standalone film-page.js (гость и авторизованный). */
  function goToStandaloneFilmPage(kpId, opts) {
    const o = opts || {};
    const kp = String(kpId || '').replace(/\D/g, '');
    if (!kp) return false;
    if (o.action) {
      try { sessionStorage.setItem('mp_public_film_action', String(o.action) + ':' + kp); } catch (_) {}
    }
    window.location.assign('/f/' + kp);
    return true;
  }

  /** GitHub Pages: /f/<kp> живёт в 404.html; index с /f/ — туда же. При logout — сброс сессии. */
  function redirectToPublicFilmPage(kpId) {
    const kp = String(kpId || kpIdFromPathname(window.location.pathname) || '').replace(/\D/g, '');
    if (!kp) return false;
    clearStaleSiteSession();
    try { sessionStorage.setItem('mp_public_film_force', kp); } catch (_) {}
    window.location.replace('/f/' + kp);
    return true;
  }

  function clearStaleSiteSession() {
    try {
      const tok = getToken();
      if (tok) removeSessionByToken(tok);
      localStorage.removeItem('mp_site_token');
    } catch (_) {}
  }

  function consumeFilmPathDeepLink() {
    try {
      const pathKp = kpIdFromPathname(window.location.pathname);
      if (!pathKp || !/^\d+$/.test(pathKp) || !getToken()) return false;
      if (document.getElementById('landing')) {
        goToStandaloneFilmPage(pathKp);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  function consumeStaffPathDeepLink() {
    try {
      const pathStaff = staffIdFromPathname(window.location.pathname);
      if (!pathStaff || !/^\d+$/.test(pathStaff) || !getToken()) return false;
      openStaffPage(pathStaff, { replace: true });
      return true;
    } catch (_) {
      return false;
    }
  }

  function handleAuthEntryDeepLinks() {
    if (consumeFilmPathDeepLink()) return;
    if (consumeStaffPathDeepLink()) return;
    consumeKpOpenDeepLink();
    tryOpenLoginOnlyOverlay();
  }

  function consumeKpOpenDeepLink() {
    try {
      const params = new URLSearchParams(window.location.search);
      const kp = params.get('kp_open');
      if (!kp || !/^\d+$/.test(kp)) return;
      const action = (params.get('action') || '').trim();
      params.delete('kp_open');
      params.delete('action');
      params.delete('open_login');
      const rest = params.toString();
      const clean = filmCanonicalPath(null, kp) + (rest ? '?' + rest : '') + window.location.hash;
      history.replaceState({}, '', clean);
      if (!getToken()) {
        sessionStorage.setItem('mp_pending_kp_open', kp);
        if (action) sessionStorage.setItem('mp_pending_kp_action', action);
        showLoginModalOverlay();
        return;
      }
      goToStandaloneFilmPage(kp, { action: action });
    } catch (_) {}
  }

  function filmKpFromLocation() {
    try {
      const pathKp = kpIdFromPathname(window.location.pathname);
      if (pathKp && /^\d+$/.test(pathKp)) return pathKp;
      const kp = new URLSearchParams(window.location.search).get('kp_open');
      if (kp && /^\d+$/.test(kp)) return kp;
    } catch (_) {}
    return null;
  }

  function cachedSessionMeStub() {
    try {
      const sessions = getSessions();
      const active = getActiveChatId();
      const session = sessions.find((s) => String(s.chat_id) === String(active));
      if (!session) return null;
      return { success: true, name: session.name || 'Профиль' };
    } catch (_) {
      return null;
    }
  }

  /** /f/:kp и kp_open — standalone 404/film-page, не кабинет. */
  function bootAuthenticatedFilmDeepLink() {
    try {
      if (!getToken() || !hasAuthEntryDeepLink()) return false;
      const pathKp = kpIdFromPathname(window.location.pathname);
      if (pathKp && /^\d+$/.test(pathKp)) {
        goToStandaloneFilmPage(pathKp);
        return true;
      }
      const params = new URLSearchParams(window.location.search);
      const kpOpen = params.get('kp_open');
      if (kpOpen && /^\d+$/.test(kpOpen)) {
        const action = (params.get('action') || '').trim();
        goToStandaloneFilmPage(kpOpen, { action: action });
        return true;
      }
      if (consumeStaffPathDeepLink()) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  function renderPublicFilmInCabinet(kpId, publicFilm, opts) {
    const o = opts || {};
    const kp = String(kpId || '').replace(/\D/g, '');
    const pageRoot = document.getElementById('film-page-content');
    if (!pageRoot || !kp) return Promise.resolve();
    const f = publicFilm || {};
    const poster = cleanPosterUrl(f.poster_url) || posterUrl(kp);
    const titleText = (f.title || 'Фильм') + (f.year ? ' (' + f.year + ')' : '');
    const filmStub = {
      kp_id: kp,
      title: f.title || 'Фильм',
      year: f.year,
      country: f.country,
      genres: f.genres,
      description: f.description,
      is_series: f.is_series,
    };
    const crew = '<div class="film-hero-crew" id="film-hero-cast-root"><span class="muted small">Загрузка команды…</span></div>';
    const toolbarHtml = buildFilmPageToolbar(filmStub, { inBase: false, authenticated: !!getToken() });
    pageRoot.className = 'movie-page';
    pageRoot.innerHTML =
      '<section class="hero" style="--film-backdrop:url(\'' + escapeHtml(poster || '') + '\')">' +
        '<div class="poster-wrap">' +
          (poster ? '<img class="poster" src="' + escapeHtml(poster) + '" alt="" loading="lazy" onerror="this.style.opacity=.22">' : '<div class="poster poster-empty">🎬</div>') +
        '</div>' +
        '<div class="hero-content">' +
          '<h1>' + escapeHtml(titleText) + '</h1>' +
          '<div class="eyebrow">' + buildFilmGenreChipsHtml(filmStub) + '</div>' +
          crew +
          (f.description ? '<p class="description">' + escapeHtml(f.description) + '</p>' : '') +
          toolbarHtml +
        '</div>' +
      '</section>';
    try { document.title = titleText + ' · Movie Planner'; } catch (_) {}
    bindFilmPageToolbar(pageRoot.querySelector('.film-page-toolbar'), filmStub, { inBase: false, authenticated: !!getToken(), kpId: kp, pendingAction: o.action || '' });
    loadFilmCastSection(kp, pageRoot.querySelector('#film-hero-cast-root'), filmStub);
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (_) {}
    return Promise.resolve();
  }

  function openFilmPageByKp(kpId, opts) {
    const o = opts || {};
    const kp = String(kpId || '').replace(/\D/g, '');
    if (!kp) return Promise.resolve();
    if (!getToken()) {
      sessionStorage.setItem('mp_pending_kp_open', kp);
      if (o.action) sessionStorage.setItem('mp_pending_kp_action', o.action);
      goToStandaloneFilmPage(kp, { action: o.action || '' });
      return Promise.resolve();
    }
    goToStandaloneFilmPage(kp, { action: o.action || '' });
    return Promise.resolve();
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

  function showCoinsInfoToast(coins) {
    const bal = coins && coins.is_infinite ? '∞' : (coins && coins.balance != null ? coins.balance : '—');
    const streak = coins && Number(coins.streak_days) > 0 ? ' · стрик ' + Number(coins.streak_days) + ' дн.' : '';
    showToast('🪙 Монетки: ' + bal + streak + '. +5 за фильм, +40 за оценку. Списания: подборы, билеты, премьеры и сериалы. PRO — без списаний.', { duration: 5200 });
  }

  let _headerCoinsPrevNum = null;

  function _coinAnchorRect(anchorOrRect) {
    if (!anchorOrRect) return null;
    if (typeof anchorOrRect.left === 'number' && typeof anchorOrRect.top === 'number') {
      return anchorOrRect;
    }
    try {
      if (typeof anchorOrRect.getBoundingClientRect === 'function') {
        const r = anchorOrRect.getBoundingClientRect();
        if (r && (r.width || r.height)) return r;
      }
    } catch (_) {}
    return null;
  }

  function showCoinActionPopAt(anchorOrRect, delta) {
    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) return;
    const rect = _coinAnchorRect(anchorOrRect);
    if (!rect) return;
    const pop = document.createElement('div');
    pop.className = 'coin-action-pop ' + (d > 0 ? 'coin-action-pop--up' : 'coin-action-pop--down');
    pop.innerHTML =
      '<span class="coin-action-pop-sprite"></span>' +
      '<span class="coin-action-pop-value">' + (d > 0 ? '+' : '') + String(d) + '</span>';
    pop.style.left = Math.round(rect.left + rect.width / 2) + 'px';
    pop.style.top = Math.round(rect.top + rect.height / 2) + 'px';
    document.body.appendChild(pop);
    setTimeout(function () {
      try { pop.remove(); } catch (_) {}
    }, 1100);
  }

  function flashHeaderCoins(delta) {
    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) return;
    const btn = document.getElementById('header-coins-btn');
    if (!btn) return;
    btn.classList.remove('coins-flash-up', 'coins-flash-down');
    btn.classList.add(d > 0 ? 'coins-flash-up' : 'coins-flash-down');
    const badge = document.getElementById('header-coins-delta');
    if (badge) {
      badge.textContent = (d > 0 ? '+' : '') + String(d);
      badge.classList.remove('hidden', 'coins-flash-up', 'coins-flash-down');
      badge.classList.add(d > 0 ? 'coins-flash-up' : 'coins-flash-down');
      setTimeout(function () {
        badge.classList.add('hidden');
        badge.textContent = '';
      }, 1100);
    }
    setTimeout(function () {
      btn.classList.remove('coins-flash-up', 'coins-flash-down');
    }, 1000);
  }

  function applyCoinsFeedback(anchorOrRect, coinsAddedHint) {
    const hint = Number(coinsAddedHint);
    const rect = _coinAnchorRect(anchorOrRect);
    const headerBtn = document.getElementById('header-coins-btn');
    if (Number.isFinite(hint) && hint > 0) {
      showCoinActionPopAt(rect || anchorOrRect, hint);
      flashHeaderCoins(hint);
    }
    return api('/api/miniapp/coins').then(function (data) {
      if (!data || !data.success) return;
      const val = document.getElementById('header-coins-val');
      const btn = document.getElementById('header-coins-btn');
      if (!val) return;
      const nextText = data.is_infinite ? '∞' : String(data.balance != null ? data.balance : '—');
      const nextNum = data.is_infinite ? null : Number(nextText);
      if (!(Number.isFinite(hint) && hint > 0) && _headerCoinsPrevNum != null && nextNum != null && nextNum !== _headerCoinsPrevNum) {
        const d = nextNum - _headerCoinsPrevNum;
        if (d !== 0) {
          showCoinActionPopAt(rect || headerBtn, d);
          flashHeaderCoins(d);
        }
      }
      val.textContent = nextText;
      if (btn) btn.classList.remove('hidden');
      if (nextNum != null) _headerCoinsPrevNum = nextNum;
    }).catch(function () {});
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
  const STORAGE_PLAN_TARGET = 'mp_plan_target_chat_id';
  let _headerPlanTargetReady = false;
  const MAX_PERSONAL = 2;
  const MAX_GROUP = 2;

  const UI_TOUR_KEYS = {
    onboarding: 'onboarding_completed_v1',
    home: 'mp_home_onboarding_v2',
    neural: 'mp_neural_onboarding_v1',
    wtw: 'mp_wtw_onboarding_v1',
  };
  const UI_TOUR_ALL = Object.values(UI_TOUR_KEYS);
  let _uiTourServerDone = null;
  let _uiTourHydratePromise = null;

  function uiTourScope() {
    const active = getActiveChatId();
    return active ? String(active) : '';
  }

  function uiTourScopedKey(key) {
    const scope = uiTourScope();
    return scope ? key + '::' + scope : key;
  }

  function uiToursResetCache() {
    _uiTourServerDone = null;
    _uiTourHydratePromise = null;
  }

  function uiTourIsDone(key) {
    const scoped = uiTourScopedKey(key);
    try {
      if (localStorage.getItem(scoped) === '1') return true;
      if (localStorage.getItem(key) === '1') return true;
    } catch (_) {}
    return !!(_uiTourServerDone && _uiTourServerDone[key]);
  }

  function uiTourMarkDoneLocal(key) {
    const scoped = uiTourScopedKey(key);
    try {
      localStorage.setItem(scoped, '1');
      localStorage.setItem(key, '1');
    } catch (_) {}
    if (_uiTourServerDone) _uiTourServerDone[key] = true;
  }

  function uiTourApplyServerDone(done) {
    _uiTourServerDone = Object.assign({}, _uiTourServerDone || {}, done || {});
    UI_TOUR_ALL.forEach(function (k) {
      if (done && done[k]) {
        try {
          localStorage.setItem(uiTourScopedKey(k), '1');
          localStorage.setItem(k, '1');
        } catch (_) {}
      }
    });
  }

  function uiToursEnsureHydrated(force) {
    if (!force && _uiTourHydratePromise) return _uiTourHydratePromise;
    const token = getToken();
    if (!token) {
      _uiTourHydratePromise = Promise.resolve();
      return _uiTourHydratePromise;
    }
    _uiTourHydratePromise = fetch(API_BASE + '/api/miniapp/ui-tours', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (res) {
        uiTourApplyServerDone((res && res.done) || {});
        const toSync = UI_TOUR_ALL.filter(function (k) { return uiTourIsDone(k) && !((_uiTourServerDone || {})[k]); });
        if (!toSync.length) return;
        return fetch(API_BASE + '/api/miniapp/ui-tours', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ mark_done: toSync }),
        }).then(function () {
          toSync.forEach(function (k) { uiTourMarkDoneLocal(k); });
        }).catch(function () {});
      })
      .catch(function () {
        _uiTourHydratePromise = null;
      });
    return _uiTourHydratePromise;
  }

  function uiTourMarkDone(key) {
    uiTourMarkDoneLocal(key);
    const token = getToken();
    if (!token) return Promise.resolve();
    return fetch(API_BASE + '/api/miniapp/ui-tours', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_done: key }),
    }).catch(function () {});
  }

  function showCabinetAfterLogin(me) {
    return uiToursEnsureHydrated(true).then(function () {
      const skipOnboarding = uiTourIsDone(UI_TOUR_KEYS.onboarding);
      if (me.has_data || skipOnboarding) {
        showScreen('cabinet-readonly');
        let pathFid = null;
        const params = new URLSearchParams(window.location.search);
        const pathKp = kpIdFromPathname(window.location.pathname);
        const queryKp = params.get('kp_open');
        let pendingKp = null;
        let pendingAction = '';
        try {
          pendingKp = sessionStorage.getItem('mp_pending_kp_open');
          pendingAction = sessionStorage.getItem('mp_pending_kp_action') || '';
          if (pendingKp && /^\d+$/.test(pendingKp)) {
            sessionStorage.removeItem('mp_pending_kp_open');
            sessionStorage.removeItem('mp_pending_kp_action');
          } else {
            pendingKp = null;
          }
        } catch (_) {}
        const filmKp = (pathKp && /^\d+$/.test(pathKp) ? pathKp : null)
          || (queryKp && /^\d+$/.test(queryKp) ? queryKp : null)
          || pendingKp;
        const pathStaff = staffIdFromPathname(window.location.pathname);
        if (pathStaff) {
          openStaffPage(pathStaff, { replace: true });
          loadPlans();
          loadUnwatched();
          loadSeries();
          loadRatings();
        } else if (filmKp) {
          if (!isFilmPageOpen()) {
            openFilmPageByKp(filmKp, { replace: true, action: pendingAction });
          }
          loadPlans();
          loadUnwatched();
          loadSeries();
          loadRatings();
        } else {
          loadPlans();
          loadUnwatched();
          loadSeries();
          loadRatings();
          handleAuthEntryDeepLinks();
          const pathStaff2 = staffIdFromPathname(window.location.pathname);
          if (pathStaff2) {
            openStaffPage(pathStaff2, { skipHistory: true, replace: true });
          } else {
            pathFid = filmIdFromPathname(window.location.pathname);
            if (pathFid) {
              openFilmPageFromLegacyPath(pathFid, { skipHistory: true, replace: true });
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
          }
        }
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
        if (!uiTourIsDone(UI_TOUR_KEYS.onboarding)) {
          uiTourMarkDone(UI_TOUR_KEYS.onboarding);
        }
        let deepSection = sectionFromPath(window.location.pathname);
        if (deepSection === 'home') deepSection = 'onboard-main';
        if (deepSection === 'shazam') {
          try { window.history.replaceState({}, '', '/'); } catch (_) {}
          deepSection = 'onboard-main';
        }
        if (deepSection) showSection(deepSection, { replace: true });
        else showSection('onboard-main', { replace: true });
        try { bindHomeSectionNavOnce(); bindPlansGotoOnce(); bindOnboardingActionsOnce(); } catch (_) {}
        const onboardParams = new URLSearchParams(window.location.search);
        const onboardQueryKp = onboardParams.get('kp_open');
        let onboardPendingKp = null;
        let onboardPendingAction = '';
        try {
          onboardPendingKp = sessionStorage.getItem('mp_pending_kp_open');
          onboardPendingAction = sessionStorage.getItem('mp_pending_kp_action') || '';
          if (onboardPendingKp && /^\d+$/.test(onboardPendingKp)) {
            sessionStorage.removeItem('mp_pending_kp_open');
            sessionStorage.removeItem('mp_pending_kp_action');
          } else {
            onboardPendingKp = null;
          }
        } catch (_) {}
        const onboardPathKp = kpIdFromPathname(window.location.pathname);
        const onboardFilmKp = (onboardPathKp && /^\d+$/.test(onboardPathKp) ? onboardPathKp : null)
          || (onboardQueryKp && /^\d+$/.test(onboardQueryKp) ? onboardQueryKp : null)
          || onboardPendingKp;
        if (onboardFilmKp && !isFilmPageOpen()) {
          openFilmPageByKp(onboardFilmKp, { replace: true, action: onboardPendingAction });
        }
      }
    });
  }

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

  function getPersonalSessionName() {
    const sessions = getSessions();
    const personal = sessions.find((s) => s && s.is_personal !== false && s.name);
    const active = getActiveSession();
    return (personal && personal.name) || (active && active.is_personal !== false && active.name) || 'Пользователь';
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

  function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 32000);
    return fetch(url, Object.assign({}, options, { signal: controller.signal })).finally(() => clearTimeout(timer));
  }

  /** Общее сохранение сессии после кода / OAuth / Telegram Login Widget */
  function applySiteSessionLogin(data, modalEl, statusEl) {
    const sessions = getSessions();
    const isPersonal = data.is_personal !== undefined ? !!data.is_personal : true;
    const chatId = String(data.chat_id);
    const existing = sessions.find((s) => String(s.chat_id) === chatId);
    if (existing) {
      existing.token = data.token;
      existing.name = data.name || existing.name;
      if (data.has_data !== undefined) existing.has_data = !!data.has_data;
      existing.is_personal = isPersonal;
      setSessions(sessions);
    } else {
      const personalCount = sessions.filter((s) => s.is_personal).length;
      const groupCount = sessions.filter((s) => !s.is_personal).length;
      if (isPersonal && personalCount >= MAX_PERSONAL) {
        if (statusEl) { statusEl.textContent = 'Максимум 2 личных кабинета'; statusEl.className = 'login-status error'; }
        return { ok: false, error: 'max_personal' };
      }
      if (!isPersonal && groupCount >= MAX_GROUP) {
        if (statusEl) { statusEl.textContent = 'Максимум 2 групповых кабинета'; statusEl.className = 'login-status error'; }
        return { ok: false, error: 'max_group' };
      }
      sessions.push({
        chat_id: chatId,
        token: data.token,
        name: data.name || 'Профиль',
        has_data: !!data.has_data,
        is_personal: isPersonal,
      });
      setSessions(sessions);
    }
    setActiveChatId(chatId);
    if (modalEl) modalEl.classList.add('hidden');
    loadMeAndShowCabinet();
    try {
      const pendingInvite = localStorage.getItem('mp_pending_accept_friend_invite');
      if (pendingInvite && /^\d+$/.test(pendingInvite)) {
        localStorage.removeItem('mp_pending_accept_friend_invite');
        setTimeout(() => acceptFriendInviteFromLink(Number(pendingInvite), null), 250);
      }
    } catch (_) {}
    return { ok: true };
  }

  function tryReturnToPublicFilmAfterAuth() {
    try {
      const dest = sessionStorage.getItem('mp_oauth_return');
      if (!dest || !/^\/f\/\d+/.test(dest.split('?')[0])) return false;
      sessionStorage.removeItem('mp_oauth_return');
      window.location.replace(dest);
      return true;
    } catch (_) {
      return false;
    }
  }

  function tryReturnToPublicFilmOnLoginDismiss() {
    try {
      const pendingKp = sessionStorage.getItem('mp_pending_kp_open');
      if (pendingKp && /^\d+$/.test(pendingKp) && !getToken()) {
        window.location.href = '/f/' + pendingKp;
        return true;
      }
    } catch (_) {}
    return false;
  }

  /** Редирект после Google/Яндекс OAuth: /#token=…&chat_id=…&name=… */
  function consumeOAuthReturnFromHash() {
    try {
      const raw = (location.hash || '').replace(/^#/, '');
      if (!raw || raw.indexOf('token=') < 0) return false;
      if (raw.charAt(0) === '/') return false;
      const params = new URLSearchParams(raw);
      let tok = params.get('token');
      if (!tok) return false;
      try { tok = decodeURIComponent(tok); } catch (_) {}
      const chatId = params.get('chat_id');
      if (chatId == null || chatId === '') return false;
      let name = params.get('name') || 'Профиль';
      try { name = decodeURIComponent(name); } catch (_) {}
      const data = {
        token: tok,
        chat_id: chatId,
        name: name,
        has_data: false,
        is_personal: true,
      };
      const modal = document.getElementById('login-modal');
      const r = applySiteSessionLogin(data, modal, null);
      if (!r.ok) {
        try { showToast('Слишком много сохранённых профилей — удалите один в настройках.', { type: 'error' }); } catch (_) {}
        history.replaceState(null, '', location.pathname + location.search);
        return false;
      }
      history.replaceState(null, '', location.pathname + location.search);
      if (tryReturnToPublicFilmAfterAuth()) return true;
      return true;
    } catch (_) {
      return false;
    }
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

  function getPlanTargetChatId() {
    try {
      const v = sessionStorage.getItem(STORAGE_PLAN_TARGET);
      if (!v || v === 'personal') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    } catch (_) {
      return null;
    }
  }

  function getPlanLibraryHeaders() {
    const target = getPlanTargetChatId();
    if (target == null) return null;
    const active = getActiveChatId();
    if (active && String(target) === String(active)) return null;
    return { 'X-Movie-Planner-Library-Chat': String(target) };
  }

  function filterAdminPlanProfiles(profiles) {
    return (profiles || []).filter(
      (p) =>
        p &&
        !p.is_personal &&
        p.is_virtual &&
        p.can_share_to_group !== false,
    );
  }

  function syncHeaderPlanTargetVisibility(sectionId) {
    const sel = document.getElementById('header-plan-target');
    if (!sel || !_headerPlanTargetReady) return;
    const show = sectionId === 'plans';
    sel.classList.toggle('hidden', !show);
    const row = document.getElementById('header-util-row');
    if (row) row.classList.toggle('has-plan-target', show);
  }

  function initHeaderPlanTarget() {
    const sel = document.getElementById('header-plan-target');
    if (!sel) return Promise.resolve();
    return api('/api/site/profiles?lite=1')
      .then((data) => {
        const profiles = (data && data.profiles) || [];
        const adminGroups = filterAdminPlanProfiles(profiles);
        if (!adminGroups.length) {
          sel.classList.add('hidden');
          sel.innerHTML = '';
          _headerPlanTargetReady = false;
          return;
        }
        sel.innerHTML =
          '<option value="personal">👤 Личный</option>' +
          adminGroups
            .map((p) => {
              const label =
                (p.emoji ? String(p.emoji).trim() + ' ' : '👥 ') +
                (p.display_name || p.name || 'Группа');
              return (
                '<option value="' +
                escapeHtml(String(p.chat_id)) +
                '">' +
                escapeHtml(label) +
                '</option>'
              );
            })
            .join('');
        let initial = 'personal';
        try {
          const stored = sessionStorage.getItem(STORAGE_PLAN_TARGET);
          if (stored === 'personal') initial = 'personal';
          else if (stored && adminGroups.some((g) => String(g.chat_id) === stored)) {
            initial = stored;
          }
        } catch (_) {}
        sel.value = initial;
        sel.onchange = function () {
          try {
            sessionStorage.setItem(STORAGE_PLAN_TARGET, sel.value);
          } catch (_) {}
        };
        _headerPlanTargetReady = true;
        const sec =
          document.querySelector('.cabinet-section:not(.hidden)')?.id?.replace('section-', '') ||
          'home';
        syncHeaderPlanTargetVisibility(sec);
      })
      .catch(() => {
        sel.classList.add('hidden');
        _headerPlanTargetReady = false;
      });
  }

  function api(url, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (options.planLibrary) {
      const planH = getPlanLibraryHeaders();
      if (planH) Object.assign(headers, planH);
    }
    return fetchWithTimeout(API_BASE + url, { ...options, headers }, options.timeoutMs).then((r) => {
      if (r.status === 401 && token) {
        removeSessionByToken(token);
        const failKp = filmKpFromLocation();
        if (failKp) {
          redirectToPublicFilmPage(failKp);
          return r.json().catch(() => ({}));
        }
        if (!getActiveChatId()) window.dispatchEvent(new CustomEvent('mp:logout'));
      }
      return r.json().catch(() => ({}));
    });
  }

  function apiText(url, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetchWithTimeout(API_BASE + url, { ...options, headers }, options.timeoutMs).then(async (r) => {
      const text = await r.text().catch(() => '');
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_) {
        data = { success: false, error: text ? text.slice(0, 240) : r.statusText };
      }
      if (!r.ok && data && data.success !== false) data.success = false;
      if (!r.ok && data && !data.error) data.error = r.statusText || ('HTTP ' + r.status);
      return data;
    });
  }

  function apiPublic(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    return fetchWithTimeout(API_BASE + url, { ...options, headers }, options.timeoutMs).then((r) => r.json().catch(() => ({})));
  }

  function groupKindLabel(profile) {
    if (!profile || profile.is_personal) return 'Личный';
    if (!profile.is_virtual) return 'Telegram-группа';
    const kind = String(profile.group_kind || 'friends');
    if (kind === 'cinema_club') return 'Киноклуб';
    if (kind === 'blogger') return 'Медиа';
    return 'Группа друзей';
  }

  const MODAL_SHEET_HANDLE_HTML =
    '<' + 'div class="modal-sheet-handle" aria-hidden="true"><span class="modal-sheet-handle-bar"></span></' + 'div>';

  function attachBottomSheetSwipeDismiss(overlay, close) {
    const sheet = overlay && overlay.querySelector('.modal-sheet');
    if (!sheet) return;
    const handle = sheet.querySelector('.modal-sheet-handle');
    if (!handle) return;
    let startY = 0;
    let dragging = false;
    let lastDy = 0;
    function applyDrag(dy) {
      const y = Math.max(0, dy);
      lastDy = y;
      sheet.style.transform = 'translateY(' + y + 'px)';
      overlay.style.background = 'rgba(0,0,0,' + Math.max(0, 0.6 * (1 - y / 320)) + ')';
    }
    function finishDrag() {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = 'transform 0.22s ease-out';
      overlay.style.transition = 'background 0.22s ease-out';
      if (lastDy > 72) {
        sheet.style.transform = 'translateY(110%)';
        overlay.style.background = 'rgba(0,0,0,0)';
        setTimeout(close, 220);
      } else {
        sheet.style.transform = '';
        overlay.style.background = '';
        setTimeout(function () {
          sheet.style.transition = '';
          overlay.style.transition = '';
        }, 240);
      }
    }
    function onStart(clientY) {
      startY = clientY;
      lastDy = 0;
      dragging = true;
      sheet.style.transition = 'none';
      overlay.style.transition = 'none';
    }
    handle.addEventListener(
      'touchstart',
      function (e) {
        if (e.touches && e.touches[0]) onStart(e.touches[0].clientY);
      },
      { passive: true },
    );
    handle.addEventListener(
      'touchmove',
      function (e) {
        if (dragging && e.touches && e.touches[0]) applyDrag(e.touches[0].clientY - startY);
      },
      { passive: true },
    );
    handle.addEventListener('touchend', finishDrag);
    handle.addEventListener('touchcancel', finishDrag);
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      onStart(e.clientY);
      function onMove(ev) {
        applyDrag(ev.clientY - startY);
      }
      function onUp() {
        finishDrag();
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  function _shareGroupEmoji(p) {
    return (p && (p.emoji || (p.is_virtual ? '👥' : '💬'))) || '💬';
  }

  async function openShareInAppModal(film, opts) {
    opts = opts || {};
    const mode = opts.mode === 'rating' ? 'rating' : 'film';
    const ratingVal = opts.ratingVal;
    const filmId = opts.filmId != null ? opts.filmId : (film && film.film_id) || null;
    if (!film || !film.kp_id) {
      showToast('Не удалось открыть шеринг', { type: 'error' });
      return;
    }
    if (mode === 'rating' && (filmId == null || ratingVal == null)) {
      showToast('Нет данных оценки', { type: 'error' });
      return;
    }
    let friends = [];
    let profiles = [];
    try {
      const frData = await api('/api/friends').catch(function () {
        return { friends: [] };
      });
      const grData = await api('/api/site/profiles?lite=1');
      friends = ((frData && frData.friends) || []).filter(function (f) {
        return f && f.user_id;
      });
      profiles = ((grData && grData.profiles) || []).filter(function (p) {
        return !p.is_personal;
      });
    } catch (e) {
      showToast('Не удалось загрузить список', { type: 'error' });
      return;
    }
    const shareable = profiles.filter(function (p) {
      return p.can_share_to_group !== false;
    });
    if (!friends.length && !shareable.length) {
      showToast('Добавьте друзей или создайте группу в разделе «Друзья и группы».', { type: 'error' });
      return;
    }
    let tab = friends.length ? 'friends' : 'groups';
    const tabsHtml =
      friends.length && shareable.length
        ? '<div class="share-film-tabs" role="tablist">' +
          '<button type="button" class="chip share-film-tab ' +
          (tab === 'friends' ? 'active' : '') +
          '" data-share-tab="friends" role="tab">Друзья</button>' +
          '<button type="button" class="chip share-film-tab ' +
          (tab === 'groups' ? 'active' : '') +
          '" data-share-tab="groups" role="tab">Группы</button>' +
          '</div>'
        : '';
    const friendsPanelHtml = friends.length
      ? '<div id="share-panel-friends" class="' +
        (tab === 'friends' ? '' : 'hidden') +
        '"><div class="list-title-section">Друг</div><div class="list" id="share-fr-list">' +
        friends
          .map(function (f, i) {
            return (
              '<label class="list-item" style="cursor:pointer">' +
              '<input type="radio" name="share-fr" value="' +
              f.user_id +
              '" ' +
              (i === 0 ? 'checked' : '') +
              ' style="margin-right:10px">' +
              '<span class="list-emoji">' +
              escapeHtml((f.name || '?')[0].toUpperCase()) +
              '</span>' +
              '<span class="list-text"><span class="list-title">' +
              escapeHtml(f.name || 'Друг') +
              '</span></span></label>'
            );
          })
          .join('') +
        '</div></div>'
      : '';
    const groupsPanelHtml = shareable.length
      ? '<div id="share-panel-groups" class="' +
        (tab === 'groups' ? '' : 'hidden') +
        '"><div class="list-title-section">Группа</div><div class="list" id="share-grp-list">' +
        shareable
          .map(function (p, i) {
            const nm =
              p.display_name != null && p.display_name !== '' ? p.display_name : p.name || 'Группа';
            return (
              '<label class="list-item" style="cursor:pointer">' +
              '<input type="radio" name="share-grp" value="' +
              p.chat_id +
              '" ' +
              (i === 0 ? 'checked' : '') +
              ' style="margin-right:10px">' +
              '<span class="list-emoji">' +
              escapeHtml(_shareGroupEmoji(p)) +
              '</span>' +
              '<span class="list-text"><span class="list-title">' +
              escapeHtml(nm) +
              '</span></span></label>'
            );
          })
          .join('') +
        '</div></div>'
      : '';
    const existing = document.getElementById('mp-share-inapp-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'mp-share-inapp-overlay';
    overlay.className = 'modal-overlay mp-share-inapp-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;z-index:1200';
    overlay.innerHTML =
      '<div class="modal-sheet mp-share-inapp-sheet" style="width:100%;background:var(--bg-elevated,#1a1a22);border-radius:20px 20px 0 0;padding:18px;max-height:80vh;overflow:auto">' +
      MODAL_SHEET_HANDLE_HTML +
      '<div style="font-size:18px;font-weight:700;margin-bottom:6px">Поделиться</div>' +
      '<div class="muted small" style="margin-bottom:14px">' +
      escapeHtml(film.title || '') +
      '</div>' +
      tabsHtml +
      friendsPanelHtml +
      groupsPanelHtml +
      '<div class="list-title-section" style="margin-top:14px">Сообщение (необязательно)</div>' +
      '<textarea id="share-grp-msg" class="input-primary share-film-textarea" placeholder="Например: «Посмотрим завтра в 21:00?»" rows="3" style="resize:vertical;width:100%"></textarea>' +
      '<div style="display:flex;gap:10px;margin-top:16px">' +
      '<button class="btn btn-secondary" style="flex:1" id="share-grp-cancel" type="button">Отмена</button>' +
      '<button class="btn btn-primary" style="flex:1" id="share-grp-send" type="button">Отправить</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    const close = function () {
      try {
        overlay.remove();
      } catch (_e) {}
      document.body.style.overflow = '';
    };
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    overlay.querySelector('#share-grp-cancel').addEventListener('click', close);
    attachBottomSheetSwipeDismiss(overlay, close);
    overlay.querySelectorAll('[data-share-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        tab = btn.getAttribute('data-share-tab') || 'groups';
        overlay.querySelectorAll('.share-film-tab').forEach(function (t) {
          t.classList.toggle('active', t.getAttribute('data-share-tab') === tab);
        });
        const frPanel = overlay.querySelector('#share-panel-friends');
        const grPanel = overlay.querySelector('#share-panel-groups');
        if (frPanel) frPanel.classList.toggle('hidden', tab !== 'friends');
        if (grPanel) grPanel.classList.toggle('hidden', tab !== 'groups');
      });
    });
    overlay.querySelector('#share-grp-send').addEventListener('click', async function () {
      const msgEl = overlay.querySelector('#share-grp-msg');
      const msg = ((msgEl && msgEl.value) || '').trim();
      const sendBtn = overlay.querySelector('#share-grp-send');
      if (tab === 'friends') {
        const fr = overlay.querySelector('input[name="share-fr"]:checked');
        const toUser = Number((fr && fr.value) || 0);
        if (!toUser) {
          showToast('Выберите друга', { type: 'error' });
          return;
        }
        try {
          if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Отправка…';
          }
          const res = await api('/api/friends/recommend', {
            method: 'POST',
            body: JSON.stringify({ to_user_id: toUser, kp_id: String(film.kp_id), message: msg }),
          });
          if (res && res.success) {
            close();
            showToast('Фильм отправлен другу');
          } else {
            showToast((res && (res.message || res.error)) || 'Не удалось отправить', { type: 'error' });
          }
        } catch (e) {
          showToast('Ошибка отправки', { type: 'error' });
        } finally {
          if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Отправить';
          }
        }
        return;
      }
      const rad = overlay.querySelector('input[name="share-grp"]:checked');
      const chatId = Number((rad && rad.value) || 0);
      if (!chatId) {
        showToast('Выберите группу', { type: 'error' });
        return;
      }
      if (mode === 'rating') {
        try {
          if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Отправка…';
          }
          const res = await api('/api/site/film/' + filmId + '/rating/broadcast-to-group', {
            method: 'POST',
            body: JSON.stringify({ chat_id: chatId }),
          });
          if (res && res.success !== false) {
            close();
            showToast('Оценка ' + ratingVal + '/10 сохранена в группе');
          } else {
            showToast((res && (res.message || res.error)) || 'Не удалось отправить', { type: 'error' });
          }
        } catch (e) {
          showToast('Ошибка отправки', { type: 'error' });
        } finally {
          if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Отправить';
          }
        }
        return;
      }
      try {
        if (sendBtn) {
          sendBtn.disabled = true;
          sendBtn.textContent = 'Отправка…';
        }
        const res = await api('/api/site/groups/' + encodeURIComponent(chatId) + '/share-film', {
          method: 'POST',
          body: JSON.stringify({
            kp_id: String(film.kp_id),
            film_id: filmId || null,
            film_title: film.title || '',
            message: msg,
          }),
        });
        if (res && res.success) {
          close();
          showToast('Отправлено в группу');
        } else {
          showToast((res && (res.message || res.error)) || 'Не удалось отправить', { type: 'error' });
        }
      } catch (e) {
        showToast('Ошибка сети', { type: 'error' });
      } finally {
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.textContent = 'Отправить';
        }
      }
    });
  }

  function openShareFilmModal(film) {
    openShareInAppModal(film, { mode: 'film', filmId: film && film.film_id });
  }

  function openShareRatingModal(film, ratingVal) {
    openShareInAppModal(film, {
      mode: 'rating',
      filmId: film && film.film_id,
      ratingVal: ratingVal,
    });
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

  function avatarInitial(name) {
    return String(name || 'П').trim().charAt(0).toUpperCase() || 'П';
  }

  function resolveMediaUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    if (raw.startsWith('/api/')) return API_BASE + raw;
    return raw;
  }

  function setAvatarEl(el, url, name) {
    if (!el) return;
    const initial = escapeHtml(avatarInitial(name));
    const src = resolveMediaUrl(url);
    if (src) {
      el.innerHTML = '<img src="' + escapeHtml(src) + '" alt="" loading="lazy">';
      const img = el.querySelector('img');
      if (img) img.addEventListener('error', () => { el.textContent = initial; }, { once: true });
    } else {
      el.textContent = initial;
    }
  }

  function greetingByHour() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Доброе утро';
    if (h >= 12 && h < 18) return 'Добрый день';
    if (h >= 18 && h < 23) return 'Добрый вечер';
    return 'Доброй ночи';
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
    topNav += '<button type="button" class="header-settings-nav-item" data-settings-go="settings">👤 Профиль</button>';
    topNav += '<button type="button" class="header-settings-nav-item" data-settings-go="groups">👥 Друзья и группы</button>';
    topNav += '<button type="button" class="header-settings-nav-item" data-settings-go="stats">📊 Статистика</button>';
    topNav += '<button type="button" class="header-settings-nav-item" data-settings-go="shazam">🔮 Подбор по описанию</button>';
    topNav += '<button type="button" class="header-settings-nav-item" data-settings-go="integrations">🔌 Интеграции</button>';
    topNav += '<a class="header-settings-nav-item header-settings-nav-item--external" id="header-settings-ext-link" href="' + escapeHtml(extUrl) + '" target="_blank" rel="noopener">💻 Расширение для Chrome</a>';
    topNav += '<button type="button" class="header-settings-nav-item" data-settings-go="about">ℹ️ О проекте</button>';
    topNav += '<div class="header-dropdown-divider"></div>';
    const sessions = getSessions();
    const personalCount = sessions.filter((s) => s.is_personal).length;
    const groupCount = sessions.filter((s) => !s.is_personal).length;
    const canAddPersonal = personalCount < MAX_PERSONAL;
    const canAddGroup = groupCount < MAX_GROUP;
    const canAdd = sessions.length < MAX_PERSONAL + MAX_GROUP && (canAddPersonal || canAddGroup);

    let html = topNav;
    html += '<button type="button" class="header-dropdown-add' + (canAdd ? '' : ' disabled') + '" data-action="add-account"' + (canAdd ? '' : ' disabled') + '>+ Добавить вход</button>';
    if (sessions.length) {
      html += '<div class="header-dropdown-divider"></div>';
      html += '<button type="button" class="header-dropdown-logout" data-action="logout-all">Выйти</button>';
    }
    dd.innerHTML = html;

    dd.querySelectorAll('[data-settings-go]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const go = btn.getAttribute('data-settings-go');
        closeAccountDropdown();
        if (go === 'tv') { showSection('tv'); if (typeof renderTvSection === 'function') renderTvSection(); return; }
        if (go === 'groups') { showSection('groups'); if (typeof renderGroupsSection === 'function') renderGroupsSection(); return; }
        if (go === 'stats') { showSection('stats'); return; }
        if (go === 'shazam') { showSection('shazam'); return; }
        if (go === 'about') { showSection('about'); return; }
        if (go === 'developer') { showSection('developer'); return; }
        if (go === 'integrations') { showSection('integrations'); return; }
        if (go === 'settings') { showSection('settings'); if (typeof renderSettingsSection === 'function') renderSettingsSection(); }
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
      const profilePill = document.getElementById('header-profile-pill');
      const profileName = document.getElementById('header-profile-name');
      const profileAvatar = document.getElementById('header-profile-avatar');
      if (profilePill) profilePill.classList.remove('hidden');
      if (profileName) profileName.textContent = me.name || 'Профиль';
      setAvatarEl(profileAvatar, me.photo_url || me.avatar_url || (me.chat_id ? (API_BASE + '/api/avatar/' + encodeURIComponent(String(me.chat_id)) + '.jpg') : ''), me.name);
      // Показать монетки
      const coinsBtn = document.getElementById('header-coins-btn');
      const coinsVal = document.getElementById('header-coins-val');
      if (coinsBtn && me.coins) {
        coinsVal.textContent = me.coins.is_infinite ? '∞' : (me.coins.balance != null ? me.coins.balance : '—');
        const n = me.coins.is_infinite ? null : Number(me.coins.balance);
        if (Number.isFinite(n)) _headerCoinsPrevNum = n;
        coinsBtn.classList.remove('hidden');
        try { initHeaderPlanTarget(); } catch (_) {}
        coinsBtn.onclick = function() { showCoinsInfoToast(me.coins); };
      }
    } else {
      if (loginBtn) loginBtn.classList.remove('hidden');
      if (userWrap) userWrap.classList.add('hidden');
    }
    closeAccountDropdown();
  }

  function showScreen(screenId) {
    ['landing', 'site-search-root', 'cabinet-readonly', 'cabinet-onboarding', 'public-stats'].forEach((id) => {
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
    document.body.classList.toggle('in-search-page', isSearchLocation());
    const hs = document.getElementById('header-search');
    if (hs) hs.classList.toggle('hidden', !(screenId === 'landing' || screenId === 'cabinet-readonly' || screenId === 'cabinet-onboarding'));
  }

  function getSiteSearchRoot() {
    let root = document.getElementById('site-search-root');
    if (root) return root;
    root = document.createElement('main');
    root.id = 'site-search-root';
    root.className = 'hidden';
    const landing = document.getElementById('landing');
    if (landing && landing.parentNode) landing.parentNode.insertBefore(root, landing.nextSibling);
    else document.body.appendChild(root);
    return root;
  }

  function showSiteSearchScreen() {
    ['landing', 'cabinet-readonly', 'cabinet-onboarding', 'public-stats'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    const root = getSiteSearchRoot();
    root.classList.remove('hidden');
    const header = document.getElementById('site-header');
    if (header) header.classList.remove('hidden');
    document.body.classList.remove('in-cabinet', 'in-public-stats');
    document.body.classList.add('in-search-page');
    const hs = document.getElementById('header-search');
    if (hs) hs.classList.remove('hidden');
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
    integrations: '/integrations',
    tv: '/tv',
    about: '/about',
    settings: '/settings',
    developer: '/my-api',
    inbox: '/inbox',
  };
  const PATH_TO_SECTION = Object.fromEntries(Object.entries(SECTION_TO_PATH).map(([k, v]) => [v, k]));

  function sectionFromPath(pathname) {
    if (!pathname) return null;
    const normalized = pathname.replace(/\/$/, '') || '/';
    if (normalized === '/') return 'home';
    return PATH_TO_SECTION[normalized] || null;
  }

  const _filmPathRe = /^\/film\/(\d+)(?:\/?)?$/;
  const _filmKpPathRe = /^\/f\/(\d+)(?:\/?)?$/;
  const _searchPathRe = /^\/search(?:\/?)?$/;
  const DEFAULT_DOC_TITLE = typeof document !== 'undefined' && document.title ? document.title : 'Movie Planner';
  function kpIdFromPathname(pathname) {
    if (!pathname) return null;
    const p = (pathname || '').split('?')[0].replace(/\/$/, '') || '/';
    const m = p.match(_filmKpPathRe);
    return m ? m[1] : null;
  }
  function filmCanonicalPath(filmId, kpId) {
    const kp = String(kpId || '').replace(/\D/g, '');
    if (kp) return '/f/' + kp;
    return '/';
  }

  /** Legacy /film/:internalId — resolve kp and open via canonical /f/:kp. */
  function openFilmPageFromLegacyPath(filmId, opts) {
    const o = opts || {};
    const fid = Number(filmId);
    if (!fid) return Promise.resolve();
    const cached = _filmModalCache[fid];
    if (cached && cached.film && cached.film.kp_id) {
      return openFilmPageByKp(String(cached.film.kp_id), { replace: true, skipHistory: o.skipHistory, action: o.action || '' });
    }
    return api('/api/site/film/' + fid).then(function (detail) {
      if (detail && detail.success && detail.film && detail.film.kp_id) {
        return openFilmPageByKp(String(detail.film.kp_id), { replace: true, skipHistory: o.skipHistory, action: o.action || '' });
      }
      return openFilmPage(fid, { skipHistory: true, replace: true, action: o.action || '' });
    }).catch(function () {
      return openFilmPage(fid, { skipHistory: true, replace: true, action: o.action || '' });
    });
  }
  function filmIdFromPathname(pathname) {
    if (!pathname) return null;
    const p = (pathname || '').split('?')[0].replace(/\/$/, '') || '/';
    const m = p.match(_filmPathRe);
    return m ? parseInt(m[1], 10) : null;
  }
  const _staffPathRe = /^\/s\/(\d+)(?:\/?)?$/;
  let _staffPageKpId = null;

  function staffIdFromPathname(pathname) {
    if (!pathname) return null;
    const p = (pathname || '').split('?')[0].replace(/\/$/, '') || '/';
    const m = p.match(_staffPathRe);
    return m ? m[1] : null;
  }

  function filterPersonFilmsSite(films, state) {
    const st = state || {};
    const genreL = String(st.genre || '').trim().toLowerCase();
    const yearExact = st.year != null && st.year !== '' ? parseInt(st.year, 10) : null;
    return (films || []).filter(function (f) {
      if (!f || !f.kp_id) return false;
      const yr = f.year != null ? parseInt(f.year, 10) : null;
      if (yearExact != null && yr !== yearExact) return false;
      if (genreL) {
        const gblob = (f.genres || []).join(' ').toLowerCase();
        if (!gblob.includes(genreL)) return false;
      }
      if (st.mainRolesOnly) {
        const cr = f.cast_rank;
        if (cr == null || parseInt(cr, 10) > 3) return false;
      }
      if (st.friendsRatedOnly) {
        if (!f.friend_rated_high) return false;
        if (f.watched || f.has_rating) return false;
      }
      return true;
    });
  }

  const FILM_CAST_ACTORS_COLLAPSED = 5;

  function bindStaffCastLinks(root, opts) {
    if (!root) return;
    opts = opts || {};
    let hoverEl = document.getElementById('staff-hover-preview');
    if (!hoverEl) {
      hoverEl = document.createElement('div');
      hoverEl.id = 'staff-hover-preview';
      hoverEl.className = 'staff-hover-preview hidden';
      hoverEl.innerHTML = '<img alt="" class="staff-hover-photo"><div class="staff-hover-name"></div>';
      document.body.appendChild(hoverEl);
    }
    let hoverTimer = null;
    let hoverKp = null;

    function hidePreview() {
      hoverEl.classList.add('hidden');
      hoverKp = null;
    }

    function showPreviewPhoto(kp, img) {
      if (!kp) return;
      img.src = 'https://st.kp.yandex.net/images/actor_iphone/iphone360_' + kp + '.jpg';
      img.style.display = 'block';
      img.onerror = function () { img.style.display = 'none'; };
    }

    root.querySelectorAll('.staff-cast-link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        if (opts.allowNativeNav) return;
        e.preventDefault();
        const kp = link.getAttribute('data-staff-kp');
        if (kp) openStaffPage(kp, { replace: false });
      });
      link.addEventListener('mouseenter', function (e) {
        if (window.matchMedia && !window.matchMedia('(hover: hover)').matches) return;
        const kp = link.getAttribute('data-staff-kp');
        const nm = link.getAttribute('data-staff-name') || link.textContent || '';
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(function () {
          hoverKp = kp;
          hoverEl.querySelector('.staff-hover-name').textContent = nm;
          const img = hoverEl.querySelector('.staff-hover-photo');
          img.style.display = 'none';
          img.removeAttribute('src');
          hoverEl.classList.remove('hidden');
          hoverEl.style.left = Math.min(window.innerWidth - 220, e.clientX + 14) + 'px';
          hoverEl.style.top = Math.min(window.innerHeight - 120, e.clientY + 14) + 'px';
          showPreviewPhoto(kp, img);
        }, 180);
      });
      link.addEventListener('mouseleave', function () {
        clearTimeout(hoverTimer);
        hidePreview();
      });
    });
  }

  function staffCastLink(entry) {
    if (!entry || entry.kp_person_id == null) return '';
    const nm = escapeHtml(entry.name_ru || entry.name_en || '');
    const kp = String(entry.kp_person_id);
    return '<a href="/s/' + encodeURIComponent(kp) + '" class="staff-cast-link" data-staff-kp="' + escapeHtml(kp) + '" data-staff-name="' + nm + '">' + nm + '</a>';
  }

  function buildFilmCastHtml(director, actors, country) {
    const parts = [];
    const ctry = String(country || '').trim();
    if (ctry) {
      parts.push(
        '<div class="film-cast-row"><span class="film-cast-label">Страна:</span> ' + escapeHtml(ctry) + '</div>'
      );
    }
    if (director) {
      parts.push(
        '<div class="film-cast-row"><span class="film-cast-label">Режиссёр:</span> ' + staffCastLink(director) + '</div>'
      );
    }
    const actorLinks = (actors || []).map(staffCastLink).filter(Boolean);
    if (actorLinks.length) {
      const collapsed = actorLinks.slice(0, FILM_CAST_ACTORS_COLLAPSED);
      const hasMore = actorLinks.length > FILM_CAST_ACTORS_COLLAPSED;
      let row =
        '<div class="film-cast-row film-cast-actors"><span class="film-cast-label">Актёры:</span> ';
      if (hasMore) {
        row +=
          '<span class="film-actors-short">' + collapsed.join('<span class="film-cast-sep">, </span>') + '</span>' +
          '<span class="film-actors-full hidden"><span class="film-cast-sep">, </span>' +
          actorLinks.slice(FILM_CAST_ACTORS_COLLAPSED).join('<span class="film-cast-sep">, </span>') + '</span>' +
          ' <button type="button" class="film-actors-more-btn" aria-expanded="false">ещё</button>';
      } else {
        row += actorLinks.join('<span class="film-cast-sep">, </span>');
      }
      row += '</div>';
      parts.push(row);
    }
    return parts.join('');
  }

  function renderStaffPageContent(data, root) {
    const person = data.person || {};
    const roles = data.films_by_role || [];
    const meta = data.filters || { years: [], genres: [] };
    const filterState = { year: '', genre: '', mainRolesOnly: false, friendsRatedOnly: false };

    function yearOpts() {
      return ['<option value="">Любой</option>'].concat((meta.years || []).map(function (y) {
        return '<option value="' + y + '">' + y + '</option>';
      })).join('');
    }
    function genreOpts() {
      return ['<option value="">Любой</option>'].concat((meta.genres || []).map(function (g) {
        return '<option value="' + escapeHtml(g) + '">' + escapeHtml(g) + '</option>';
      })).join('');
    }
    function gridHtml(films) {
      const chunk = (films || []).slice(0, 60);
      if (!chunk.length) return '<p class="muted small">Нет фильмов по фильтрам</p>';
      return '<div class="staff-film-grid">' + chunk.map(function (f) {
        const fid = f.already_in_base_film_id || f.film_id;
        const clickAttr = fid
          ? 'data-film-id="' + fid + '"'
          : 'data-similar-kp="' + escapeHtml(String(f.kp_id)) + '"';
        return (
          '<button type="button" class="staff-film-card" ' + clickAttr + '>' +
            (f.poster ? '<img src="' + escapeHtml(f.poster) + '" alt="" loading="lazy">' : '<div class="staff-film-ph">🎬</div>') +
            '<div class="staff-film-title">' + escapeHtml(f.title || '—') + '</div>' +
            (f.year ? '<div class="staff-film-year">' + escapeHtml(String(f.year)) + '</div>' : '') +
          '</button>'
        );
      }).join('') + '</div>';
    }
    function paintRoles() {
      root.querySelectorAll('.staff-role-block').forEach(function (sec, idx) {
        const block = roles[idx];
        if (!block) return;
        const filtered = filterPersonFilmsSite(block.films || [], filterState);
        const importable = filtered.filter(function (f) { return f.importable; }).map(function (f) { return String(f.kp_id); });
        const grid = sec.querySelector('.staff-role-grid');
        if (grid) grid.innerHTML = gridHtml(filtered);
        const btn = sec.querySelector('.staff-import-btn');
        if (btn) {
          btn.disabled = !importable.length;
          btn.textContent = importable.length ? 'В базу → (' + importable.length + ')' : 'В базу →';
          btn.setAttribute('data-role-key', block.role_key || '');
          btn._importIds = importable;
        }
      });
      root.querySelector('#staff-toggle-main')?.classList.toggle('chip-on', !!filterState.mainRolesOnly);
      root.querySelector('#staff-toggle-friends')?.classList.toggle('chip-on', !!filterState.friendsRatedOnly);
    }

    const photo = person.photo
      ? '<img class="staff-hero-photo" src="' + escapeHtml(person.photo) + '" alt="" referrerpolicy="no-referrer">'
      : '<div class="staff-hero-photo staff-hero-ph">👤</div>';
    root.innerHTML =
      '<div class="staff-hero">' + photo +
        '<div><h2 class="staff-hero-name">' + escapeHtml(person.name_ru || person.name_en || '—') + '</h2>' +
        (person.name_en && person.name_ru && person.name_en !== person.name_ru
          ? '<div class="staff-hero-sub">' + escapeHtml(person.name_en) + '</div>' : '') +
        '</div></div>' +
      '<div class="staff-filters">' +
        '<label class="staff-filter"><span>Год</span><select id="staff-filter-year">' + yearOpts() + '</select></label>' +
        '<label class="staff-filter"><span>Жанр</span><select id="staff-filter-genre">' + genreOpts() + '</select></label>' +
        '<div class="staff-filter-toggles">' +
          '<button type="button" class="chip" id="staff-toggle-main">Главные роли</button>' +
          '<button type="button" class="chip" id="staff-toggle-friends">Друзья хорошо оценили</button>' +
        '</div></div>' +
      roles.map(function (block, idx) {
        const filtered = filterPersonFilmsSite(block.films || [], filterState);
        const importable = filtered.filter(function (f) { return f.importable; });
        return (
          '<section class="staff-role-block" data-idx="' + idx + '">' +
            '<div class="staff-role-head">' +
              '<h3>' + escapeHtml(block.role_name || block.role_key || '') + '</h3>' +
              '<button type="button" class="link-inline staff-import-btn" data-role-key="' + escapeHtml(block.role_key || '') + '"' +
                (importable.length ? '' : ' disabled') + '>В базу →' + (importable.length ? ' (' + importable.length + ')' : '') + '</button>' +
            '</div>' +
            '<div class="staff-role-grid">' + gridHtml(filtered) + '</div>' +
          '</section>'
        );
      }).join('');

    root.querySelector('#staff-filter-year')?.addEventListener('change', function (e) {
      filterState.year = e.target.value || '';
      paintRoles();
    });
    root.querySelector('#staff-filter-genre')?.addEventListener('change', function (e) {
      filterState.genre = e.target.value || '';
      paintRoles();
    });
    root.querySelector('#staff-toggle-main')?.addEventListener('click', function (e) {
      filterState.mainRolesOnly = !filterState.mainRolesOnly;
      e.currentTarget.classList.toggle('chip-on', filterState.mainRolesOnly);
      paintRoles();
    });
    root.querySelector('#staff-toggle-friends')?.addEventListener('click', function (e) {
      filterState.friendsRatedOnly = !filterState.friendsRatedOnly;
      e.currentTarget.classList.toggle('chip-on', filterState.friendsRatedOnly);
      paintRoles();
    });
    root.querySelectorAll('.staff-import-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const rk = btn.getAttribute('data-role-key') || '';
        const ids = btn._importIds || [];
        if (!rk || !ids.length) {
          showToast('Нет фильмов для добавления');
          return;
        }
        if (!window.confirm('Добавить ' + ids.length + ' фильмов в базу?')) return;
        btn.disabled = true;
        api('/api/site/persons/' + person.kp_person_id + '/import', {
          method: 'POST',
          body: JSON.stringify({ role_key: rk, film_kp_ids: ids }),
        }).then(function (res) {
          if (res && res.success) {
            showToast('Добавлено: ' + (res.added || 0));
            openStaffPage(person.kp_person_id, { replace: true, skipHistory: true });
          } else {
            showToast((res && res.error) || 'Импорт не удался', { type: 'error' });
          }
        }).catch(function () {
          showToast('Ошибка сети', { type: 'error' });
        }).finally(function () { btn.disabled = false; });
      });
    });
    root.querySelectorAll('.staff-film-card').forEach(function (card) {
      card.addEventListener('click', function () {
        const kp = card.getAttribute('data-similar-kp') || card.getAttribute('data-kp-id');
        const fid = card.getAttribute('data-film-id');
        openFilmNav(kp, fid);
      });
    });
  }

  function openStaffPage(kpId, opts) {
    const o = opts || {};
    const kp = String(kpId || '').replace(/\D/g, '');
    if (!kp) return Promise.resolve();
    const pageRoot = document.getElementById('film-page-content');
    if (!pageRoot) {
      showToast('Страница недоступна');
      return Promise.resolve();
    }
    _staffPageKpId = kp;
    _filmModalCurrentId = null;
    showScreen('cabinet-readonly');
    showFilmPageLayout();
    pageRoot.className = 'container film-page-container staff-page-content loading';
    pageRoot.innerHTML = 'Загрузка…';
    if (!o.skipHistory) {
      try {
        const path = '/s/' + kp;
        (o.replace ? history.replaceState : history.pushState).call(history, { view: 'staff', kpId: kp }, '', path);
      } catch (_) {}
    }
    const authed = !!getToken();
    const detailPromise = authed
      ? api('/api/site/persons/' + kp)
      : fetch(getPublicApiBase() + '/api/public/person/' + encodeURIComponent(kp), { method: 'GET', mode: 'cors' }).then(function (r) { return r.json(); });
    return detailPromise.then(function (detail) {
      if (_staffPageKpId !== kp) return;
      if (!detail || !detail.success) {
        pageRoot.className = 'container film-page-container staff-page-content';
        pageRoot.innerHTML = '<p class="film-page-error-hint">Не удалось загрузить</p>';
        return;
      }
      pageRoot.className = 'container film-page-container staff-page-content';
      try {
        document.title = ((detail.person && detail.person.name_ru) || 'Персона') + ' · Movie Planner';
      } catch (_) {}
      renderStaffPageContent(detail, pageRoot);
      try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (_) { try { window.scrollTo(0, 0); } catch (__) {} }
    }).catch(function () {
      showToast('Ошибка сети', { type: 'error' });
    });
  }

  function closeStaffPage() {
    _staffPageKpId = null;
    closeFilmPage();
  }
  function isFilmPageOpen() {
    const s = document.getElementById('section-film');
    return s && !s.classList.contains('hidden');
  }
  function isSearchPath(pathname) {
    return _searchPathRe.test((pathname || '').replace(/\/$/, '') || '/');
  }
  function searchQueryFromLocation() {
    try {
      const params = new URLSearchParams(window.location.search);
      const spa = params.get('__spa') || '';
      if (spa) {
        const spaUrl = new URL(decodeURIComponent(spa), window.location.origin);
        if (isSearchPath(spaUrl.pathname)) return new URLSearchParams(spaUrl.search).get('q') || '';
      }
      return params.get('q') || '';
    } catch (_) {
      return '';
    }
  }
  function isSearchLocation() {
    if (isSearchPath(window.location.pathname)) return true;
    try {
      const spa = new URLSearchParams(window.location.search).get('__spa') || '';
      if (!spa) return false;
      const spaUrl = new URL(decodeURIComponent(spa), window.location.origin);
      return isSearchPath(spaUrl.pathname);
    } catch (_) {
      return false;
    }
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
    ro.classList.add('film-page-mode');
    ro.querySelectorAll('.cabinet-section').forEach((el) => {
      el.classList.toggle('hidden', el.id !== 'section-film');
    });
    ro.querySelectorAll('.cabinet-nav .cabinet-nav-btn').forEach((b) => b.classList.remove('active'));
  }
  function setFilmPageToolbar(_film) {
    /* sticky film toolbar removed — title lives in hero h1 */
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
      const activeNavSection = (sectionId === 'series' || sectionId === 'ratings') ? 'unwatched' : sectionId;
      readonly.querySelectorAll('.cabinet-nav button').forEach((b) => {
        b.classList.remove('active');
        if (b.getAttribute('data-section') === activeNavSection) b.classList.add('active');
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
      if (readonly) readonly.classList.remove('film-page-mode');
      try { restoreDocumentTitle(); } catch (e) {}
    }
    if (rendered && !options.skipPush && SECTION_TO_PATH[sectionId]) {
      pushSectionUrl(sectionId, !!options.replace);
    }
    if (rendered && sectionId === 'home') {
      try { scheduleHomeDashboardRefresh(); } catch (_) {}
      try {
        if (_cabinetMeCache) refreshGroupSuggestions(_cabinetMeCache);
      } catch (_) {}
    }
    if (rendered) {
      try { updateGroupContextFab(); } catch (_) {}
      try { syncHeaderPlanTargetVisibility(sectionId); } catch (_) {}
    }
    if (rendered && sectionId === 'shazam') {
      try {
        const ta = document.getElementById('home-shazam-query');
        if (ta) setTimeout(function () { ta.focus(); }, 0);
      } catch (_) {}
    }
    if (rendered && sectionId === 'developer') {
      try {
        if (typeof renderDeveloperSection === 'function') renderDeveloperSection();
      } catch (_) {}
    }
    if (rendered && sectionId === 'integrations') {
      try {
        document.querySelectorAll('#section-integrations [data-int-go]').forEach((btn) => {
          btn.onclick = () => {
            const go = btn.getAttribute('data-int-go');
            if (go === 'developer') { showSection('developer'); return; }
            if (go === 'tv') { showSection('tv'); if (typeof renderTvSection === 'function') renderTvSection(); }
          };
        });
      } catch (_) {}
    }
    if (rendered && sectionId === 'inbox') {
      try {
        if (typeof renderInboxSection === 'function') renderInboxSection();
      } catch (_) {}
    }
  }

  function siteInboxTab() {
    try {
      const stored = localStorage.getItem('mp_inbox_tab');
      if (stored === 'activity' || stored === 'incoming') return stored;
    } catch (_) {}
    return 'incoming';
  }
  function siteSetInboxTab(tab) {
    try { localStorage.setItem('mp_inbox_tab', tab); } catch (_) {}
  }

  function siteFriendsActivityDateKey(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function siteFriendsActivityDateLabel(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const sod = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const ds = sod(d);
    const today = sod(new Date());
    if (ds === today) return 'Сегодня';
    if (ds === today - 86400000) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }
  function siteFriendsActivityGroupedHtml(items) {
    const groups = [];
    const idx = {};
    (items || []).forEach((it) => {
      const key = siteFriendsActivityDateKey(it.happened_at) || 'unknown';
      if (!idx[key]) {
        idx[key] = { label: siteFriendsActivityDateLabel(it.happened_at) || 'Раньше', items: [] };
        groups.push(idx[key]);
      }
      idx[key].items.push(it);
    });
    return groups.map((g) => {
      const rows = g.items.map((it) => {
        const letter = (it.name || '?')[0].toUpperCase();
        const ach = it.achievement || {};
        let desc = '';
        if (it.event_type === 'rating') {
          const title = escapeHtml(it.film_title || 'фильм');
          const kp = it.kp_id != null ? String(it.kp_id) : '';
          desc = 'оценил' + (it.value != null ? ' ' + it.value + '/10' : '') + ' — '
            + (kp ? '<button type="button" class="link-inline site-inbox-act-film" data-kp-id="' + escapeHtml(kp) + '">' + title + '</button>' : title);
        } else if (it.event_type === 'achievement') {
          desc = 'получил достижение «' + escapeHtml((ach.icon || '🏅') + ' ' + (ach.name || it.extra || 'Ачивка')) + '»';
        } else if (it.event_type === 'plan_home' || it.event_type === 'plan_cinema') {
          const title = escapeHtml(it.film_title || 'фильм');
          const kp = it.kp_id != null ? String(it.kp_id) : '';
          const verb = it.event_type === 'plan_home' ? 'запланировал дома' : 'запланировал в кино';
          desc = verb + ' — ' + (kp ? '<button type="button" class="link-inline site-inbox-act-film" data-kp-id="' + escapeHtml(kp) + '">' + title + '</button>' : title);
        } else {
          desc = escapeHtml(it.event_type || '');
        }
        const ts = it.happened_at ? new Date(it.happened_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : '';
        return '<div class="soc-activity-row site-inbox-act-row">'
          + '<div class="soc-friend-avatar" style="width:32px;height:32px;font-size:13px;flex-shrink:0">' + escapeHtml(letter) + '</div>'
          + '<div style="flex:1;font-size:13px;line-height:1.45"><strong>' + escapeHtml(it.name) + '</strong> ' + desc
          + (ts ? ' <span style="color:var(--hint,#888)"> · ' + escapeHtml(ts) + '</span>' : '') + '</div></div>';
      }).join('');
      return '<div class="site-inbox-act-day"><div class="site-inbox-act-day-title">' + escapeHtml(g.label) + '</div>' + rows + '</div>';
    }).join('');
  }

  function siteBindInboxActivityFilmLinks(panel) {
    if (!panel) return;
    panel.querySelectorAll('.site-inbox-act-film').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const kpid = btn.getAttribute('data-kp-id');
        if (kpid) window.open('https://www.kinopoisk.ru/film/' + encodeURIComponent(kpid) + '/', '_blank', 'noopener');
      });
    });
  }

  function siteInboxTabsHtml(active) {
    return '<div class="inbox-tabs" role="tablist">'
      + '<button type="button" class="btn btn-small inbox-tab-btn' + (active === 'incoming' ? ' btn-primary' : ' btn-secondary') + '" data-inbox-tab="incoming" role="tab">Входящие</button>'
      + '<button type="button" class="btn btn-small inbox-tab-btn' + (active === 'activity' ? ' btn-primary' : ' btn-secondary') + '" data-inbox-tab="activity" role="tab">Активность</button>'
      + '</div>';
  }

  function renderInboxIncomingCards(root, items) {
    const kindLabel = (k) => ({
      group_share: 'Группа',
      plan_reminder: 'Планы',
      premiere_release: 'Премьера',
      rate_reminder: 'Оценка',
      group_join: 'Группа',
      group_invite_accepted: 'Группа',
      friend_request: 'Друзья',
      friend_request_accepted: 'Друзья',
    }[k] || k || 'Сообщение');
    const parsePayload = (p) => {
      try {
        return typeof p === 'string' ? JSON.parse(p) : (p || {});
      } catch (_) {
        return {};
      }
    };
    if (!items.length) {
      root.innerHTML = '<p class="cabinet-hint">Пока пусто.</p>';
      return;
    }
    root.innerHTML = items.map((it) => {
      const pl = parsePayload(it.payload);
      const fid = pl.film_id != null ? String(pl.film_id) : '';
      const kp = pl.kp_id != null ? String(pl.kp_id) : '';
      const summary = it.kind === 'rate_reminder'
        ? ('⭐ Пора оценить: ' + ((pl.film_title && String(pl.film_title)) || it.title || 'фильм'))
        : ((it.title || '').trim() || kindLabel(it.kind));
      let actions = '';
      if (it.kind === 'rate_reminder' && (kp || fid)) {
        actions = '<button type="button" class="btn btn-small btn-primary site-inbox-open-film"'
          + (kp ? ' data-kp-id="' + escapeHtml(kp) + '"' : '')
          + (fid ? ' data-film-id="' + escapeHtml(fid) + '"' : '')
          + '>Открыть фильм</button>';
      } else if (kp && String(kp).trim() !== '') {
        actions = '<button type="button" class="btn btn-small btn-secondary site-inbox-open-kp" data-kp-id="' + escapeHtml(kp) + '">Кинопоиск</button>';
      }
      return '<div class="site-inbox-card">'
        + '<div class="site-inbox-kind">' + escapeHtml(kindLabel(it.kind)) + '</div>'
        + '<div class="site-inbox-title">' + escapeHtml(summary) + '</div>'
        + (it.body ? '<div class="site-inbox-body muted">' + escapeHtml(it.body) + '</div>' : '')
        + (actions ? '<div class="site-inbox-actions">' + actions + '</div>' : '')
        + '<div class="site-inbox-time muted small">' + escapeHtml(it.created_at || '') + '</div>'
        + '</div>';
    }).join('');
    root.querySelectorAll('.site-inbox-open-film').forEach((btn) => {
      btn.addEventListener('click', () => {
        openFilmNav(btn.getAttribute('data-kp-id'), btn.getAttribute('data-film-id'));
      });
    });
    root.querySelectorAll('.site-inbox-open-kp').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kpid = btn.getAttribute('data-kp-id');
        if (kpid) window.open('https://www.kinopoisk.ru/film/' + encodeURIComponent(kpid) + '/', '_blank', 'noopener');
      });
    });
  }

  function loadSiteInboxActivityPanel(panel) {
    if (!panel) return;
    panel.innerHTML = '<p class="cabinet-hint">Загружаем…</p>';
    api('/api/friends/activity?limit=40').then((data) => {
      const actItems = (data && data.items) || [];
      panel.innerHTML = actItems.length
        ? '<div class="site-inbox-act-list">' + siteFriendsActivityGroupedHtml(actItems) + '</div>'
        : '<p class="cabinet-hint">Нет активности — добавьте друзей в разделе «Друзья».</p>';
      siteBindInboxActivityFilmLinks(panel);
    }).catch(() => {
      panel.innerHTML = '<p class="cabinet-hint">Не удалось загрузить активность.</p>';
    });
  }

  function renderInboxSection() {
    const root = document.getElementById('site-inbox-root');
    if (!root) return;
    const tab = siteInboxTab();
    root.innerHTML = siteInboxTabsHtml(tab)
      + '<div id="site-inbox-panel-incoming" class="site-inbox-panel' + (tab === 'incoming' ? '' : ' hidden') + '"><p class="cabinet-hint">Загружаем…</p></div>'
      + '<div id="site-inbox-panel-activity" class="site-inbox-panel' + (tab === 'activity' ? '' : ' hidden') + '"></div>';

    const incomingPanel = document.getElementById('site-inbox-panel-incoming');
    const activityPanel = document.getElementById('site-inbox-panel-activity');

    root.querySelectorAll('[data-inbox-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.getAttribute('data-inbox-tab');
        if (!next || next === siteInboxTab()) return;
        siteSetInboxTab(next);
        root.querySelectorAll('[data-inbox-tab]').forEach((b) => {
          const on = b.getAttribute('data-inbox-tab') === next;
          b.classList.toggle('btn-primary', on);
          b.classList.toggle('btn-secondary', !on);
        });
        if (incomingPanel) incomingPanel.classList.toggle('hidden', next !== 'incoming');
        if (activityPanel) activityPanel.classList.toggle('hidden', next !== 'activity');
        if (next === 'activity') loadSiteInboxActivityPanel(activityPanel);
      });
    });

    api('/api/site/inbox').then((data) => {
      if (!data || !data.success) {
        if (incomingPanel) incomingPanel.innerHTML = '<p class="cabinet-hint">' + escapeHtml((data && data.error) || 'Не удалось загрузить') + '</p>';
        return;
      }
      const items = data.items || [];
      const unreadIds = items.filter((x) => !x.is_read && x.id != null).map((x) => x.id);
      if (unreadIds.length) {
        api('/api/site/inbox', { method: 'POST', body: JSON.stringify({ ids: unreadIds }) }).catch(() => {});
      }
      if (incomingPanel) {
        renderInboxIncomingCards(incomingPanel, items);
      }
    }).catch(() => {
      if (incomingPanel) incomingPanel.innerHTML = '<p class="cabinet-hint">Ошибка сети</p>';
    });

    if (tab === 'activity' && activityPanel) loadSiteInboxActivityPanel(activityPanel);
  }

  // ——— Вход через Telegram-бота (mobileauth deep link) ———
  let _siteBotAuthPoll = null;
  let _siteBotAuthDeepLink = null;

  function stopSiteBotAuthPoll() {
    if (_siteBotAuthPoll) {
      clearInterval(_siteBotAuthPoll);
      _siteBotAuthPoll = null;
    }
  }

  async function pollSiteBotAuthOnce(code, modalEl, statusEl) {
    const checkResp = await fetch(API_BASE + '/api/auth/telegram-mobile/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const checkData = await checkResp.json().catch(() => ({}));
    if (checkData.success && checkData.verified === false) return false;
    if (!checkData.success || !checkData.access) {
      if (checkData.error === 'expired') {
        stopSiteBotAuthPoll();
        if (statusEl) { statusEl.textContent = 'Время истекло — нажмите 🤖 ещё раз'; statusEl.className = 'login-status error'; }
      }
      return false;
    }
    stopSiteBotAuthPoll();
    const exchangeResp = await fetch(API_BASE + '/api/site/session/from-jwt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: checkData.access }),
    });
    const exchangeData = await exchangeResp.json().catch(() => ({}));
    if (!exchangeData.success || !exchangeData.token) {
      if (statusEl) { statusEl.textContent = exchangeData.error || 'Не удалось создать сессию'; statusEl.className = 'login-status error'; }
      return true;
    }
    applySiteSessionLogin(
      {
        token: exchangeData.token,
        chat_id: exchangeData.chat_id,
        name: exchangeData.name,
        has_data: exchangeData.has_data,
        is_personal: exchangeData.is_personal !== undefined ? !!exchangeData.is_personal : true,
      },
      modalEl,
      statusEl,
    );
    if (statusEl) { statusEl.textContent = 'Готово'; statusEl.className = 'login-status success'; }
    return true;
  }

  async function startSiteBotAuth(modalEl, statusEl, botPanel) {
    stopSiteBotAuthPoll();
    _siteBotAuthDeepLink = null;
    if (botPanel) botPanel.classList.remove('hidden');
    if (statusEl) { statusEl.textContent = 'Открываем Telegram…'; statusEl.className = 'login-status'; }
    try {
      const startResp = await fetch(API_BASE + '/api/auth/telegram-mobile/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const startData = await startResp.json().catch(() => ({}));
      if (!startData.success || !startData.code) {
        if (statusEl) { statusEl.textContent = 'Не удалось начать вход через бота'; statusEl.className = 'login-status error'; }
        return;
      }
      const code = String(startData.code);
      _siteBotAuthDeepLink = startData.deep_link
        || ('https://t.me/movie_planner_bot?start=mobileauth_' + encodeURIComponent(code));
      try { window.open(_siteBotAuthDeepLink, '_blank', 'noopener'); } catch (_) {}
      if (statusEl) { statusEl.textContent = 'Нажмите Start в боте — войдём автоматически'; statusEl.className = 'login-status'; }
      _siteBotAuthPoll = setInterval(function () {
        pollSiteBotAuthOnce(code, modalEl, statusEl).catch(function () {});
      }, 2500);
      void pollSiteBotAuthOnce(code, modalEl, statusEl);
    } catch (_) {
      if (statusEl) { statusEl.textContent = 'Ошибка сети'; statusEl.className = 'login-status error'; }
    }
  }

  // ——— Вход по коду ———
  function bindLogin() {
    const modal = document.getElementById('login-modal');
    const openBtn = document.querySelector('[data-action="login"]');
    const closeElements = document.querySelectorAll('[data-action="close-login"]');
    const status = document.getElementById('login-status');

    function setLoginTab(tabName) {
      const tab = tabName === 'register' ? 'register' : 'login';
      document.querySelectorAll('[data-login-tab]').forEach((btn) => {
        const active = btn.getAttribute('data-login-tab') === tab;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.querySelectorAll('[data-login-pane]').forEach((pane) => {
        pane.classList.toggle('hidden', pane.getAttribute('data-login-pane') !== tab);
      });
    }

    document.querySelectorAll('[data-login-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setLoginTab(btn.getAttribute('data-login-tab')));
    });
    document.querySelectorAll('[data-login-tab-jump]').forEach((btn) => {
      btn.addEventListener('click', () => setLoginTab(btn.getAttribute('data-login-tab-jump')));
    });

    let telegramLoginScriptPromise = null;
    /** Telegram Login JS preloading. The click handler below opens the popup synchronously. */
    function loadTelegramLoginScript() {
      if (window.Telegram && window.Telegram.Login && typeof window.Telegram.Login.auth === 'function') {
        return Promise.resolve();
      }
      if (telegramLoginScriptPromise) return telegramLoginScriptPromise;
      const wrap = document.getElementById('login-tg-widget-mount');
      telegramLoginScriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.async = true;
        s.src = 'https://telegram.org/js/telegram-widget.js?22';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('telegram_script_failed'));
        (wrap || document.head || document.body).appendChild(s);
      });
      return telegramLoginScriptPromise;
    }

    function mountTelegramLoginWidget() {
      void loadTelegramLoginScript().catch(() => {});
    }

    function startTelegramOfficialLogin() {
      const width = 550;
      const height = 470;
      const left = Math.max(0, (window.screen.width - width) / 2) + (window.screen.availLeft || 0);
      const top = Math.max(0, (window.screen.height - height) / 2) + (window.screen.availTop || 0);
      const origin = window.location.origin || (window.location.protocol + '//' + window.location.hostname);
      const popupUrl = 'https://oauth.telegram.org/auth?bot_id=' + encodeURIComponent(TELEGRAM_BOT_ID)
        + '&origin=' + encodeURIComponent(origin)
        + '&request_access=write'
        + '&return_to=' + encodeURIComponent(window.location.href);
      let popup = null;
      const onMessage = (event) => {
        if (!popup || event.source !== popup) return;
        let data = {};
        try { data = JSON.parse(event.data); } catch (_) {}
        if (data && data.event === 'auth_result' && data.result) {
          window.removeEventListener('message', onMessage);
          try { popup.close(); } catch (_) {}
          window.mpTelegramLogin(data.result);
        }
      };
      window.addEventListener('message', onMessage);
      popup = window.open(
        popupUrl,
        'telegram_oauth_bot' + TELEGRAM_BOT_ID,
        'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + ',status=0,location=0,menubar=0,toolbar=0',
      );
      if (popup) {
        popup.focus();
        return;
      }
      window.removeEventListener('message', onMessage);
      try { showToast('Браузер заблокировал окно Telegram. Разрешите всплывающие окна для сайта.', { type: 'error', duration: 4200 }); } catch (_) {}
    }

    window.mpTelegramLogin = function (user) {
      const priv = document.getElementById('login-oauth-privacy');
      if (!priv || !priv.checked) {
        try { showToast('Нужна галочка про политику', { type: 'error', duration: 3200 }); } catch (_) { alert('Отметьте согласие с политикой.'); }
        return;
      }
      const modalEl = document.getElementById('login-modal');
      fetch(API_BASE + '/api/site/auth/telegram-widget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, user, { accept_privacy: true, acceptPrivacy: true })),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.token) {
            applySiteSessionLogin(
              {
                token: data.token,
                chat_id: data.chat_id,
                name: data.name || 'Профиль',
                has_data: !!data.has_data,
                is_personal: data.is_personal !== undefined ? !!data.is_personal : true,
              },
              modalEl,
              null,
            );
          } else {
            alert((data && data.message) || data.error || 'Не удалось войти через Telegram');
          }
        })
        .catch(() => alert('Ошибка сети'));
    };

    const oauthPriv = document.getElementById('login-oauth-privacy');
    const oauthG = document.getElementById('login-oauth-google');
    const oauthY = document.getElementById('login-oauth-yandex');
    const tgWrap = document.getElementById('login-tg-widget-wrap');
    const privacyHint = document.getElementById('login-privacy-hint');
    function nudgeOAuthPrivacy() {
      if (oauthPriv) {
        oauthPriv.closest('.login-oauth-privacy')?.classList.add('needs-attention');
        oauthPriv.focus({ preventScroll: true });
        setTimeout(() => oauthPriv.closest('.login-oauth-privacy')?.classList.remove('needs-attention'), 1600);
      }
      if (privacyHint) privacyHint.classList.add('is-visible');
      try { showToast('Сначала отметьте согласие с политикой', { type: 'error', duration: 2600 }); } catch (_) {}
    }
    function syncOauthPrivButtons() {
      const ok = oauthPriv && oauthPriv.checked;
      [oauthG, oauthY].forEach((btn) => {
        if (!btn) return;
        btn.classList.toggle('is-locked', !ok);
        btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
      });
      if (tgWrap) tgWrap.classList.toggle('login-tg-widget-wrap--locked', !ok);
      if (privacyHint) privacyHint.classList.toggle('is-visible', !ok);
    }
    if (oauthPriv) oauthPriv.addEventListener('change', syncOauthPrivButtons);
    syncOauthPrivButtons();
    if (oauthG) {
      oauthG.addEventListener('click', () => {
        if (!oauthPriv || !oauthPriv.checked) { nudgeOAuthPrivacy(); return; }
        window.location.href = API_BASE + '/api/site/oauth/google/start?accept=1';
      });
    }
    if (oauthY) {
      oauthY.addEventListener('click', () => {
        if (!oauthPriv || !oauthPriv.checked) { nudgeOAuthPrivacy(); return; }
        window.location.href = API_BASE + '/api/site/oauth/yandex/start?accept=1';
      });
    }
    if (tgWrap) {
      tgWrap.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!oauthPriv || !oauthPriv.checked) {
          nudgeOAuthPrivacy();
          return;
        }
        startTelegramOfficialLogin();
      });
    }

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        setLoginTab('login');
        if (modal) modal.classList.remove('hidden');
        mountTelegramLoginWidget();
      });
    }
    closeElements.forEach((el) => el.addEventListener('click', () => {
      stopSiteBotAuthPoll();
      if (modal) modal.classList.add('hidden');
      document.body.classList.remove('login-only-overlay');
      if (tryReturnToPublicFilmOnLoginDismiss()) return;
      const landing = document.getElementById('landing');
      if (landing && !getToken()) landing.classList.remove('hidden');
      const bp = document.getElementById('login-bot-panel');
      if (bp) bp.classList.add('hidden');
    }));

    const botToggle = document.getElementById('login-bot-toggle');
    const botPanel = document.getElementById('login-bot-panel');
    const botReopen = document.getElementById('login-bot-reopen');
    if (botToggle) {
      botToggle.addEventListener('click', () => {
        startSiteBotAuth(modal, status, botPanel);
      });
    }
    if (botReopen) {
      botReopen.addEventListener('click', () => {
        if (_siteBotAuthDeepLink) {
          try { window.open(_siteBotAuthDeepLink, '_blank', 'noopener'); } catch (_) {}
        } else {
          startSiteBotAuth(modal, status, botPanel);
        }
      });
    }

    bindEmailLogin();
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
    const reqBtn = document.getElementById('login-email-request-btn');
    const backBtn = document.getElementById('login-email-back-btn');
    const regForm = document.getElementById('login-register-form');
    const regCodeForm = document.getElementById('login-register-code-form');
    const regName = document.getElementById('login-register-name');
    const regEmail = document.getElementById('login-register-email');
    const regCode = document.getElementById('login-register-code');
    const regStatus = document.getElementById('login-register-status');
    const regBtn = document.getElementById('login-register-request-btn');
    const regBack = document.getElementById('login-register-back-btn');
    const regPrivacy = document.getElementById('login-register-privacy');

    function setStatus(text, kind) {
      if (!statusEl) return;
      statusEl.textContent = text || '';
      statusEl.className = 'login-status' + (kind ? ' ' + kind : '');
    }
    function setRegStatus(text, kind) {
      if (!regStatus) return;
      regStatus.textContent = text || '';
      regStatus.className = 'login-status' + (kind ? ' ' + kind : '');
    }
    function registrationName() {
      return ((regName && regName.value) || '').trim().slice(0, 80);
    }
    async function applyDisplayNameIfNeeded(token, name) {
      const n = (name || '').trim();
      if (!token || !n) return;
      try {
        await fetch(API_BASE + '/api/miniapp/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ display_name: n }),
        });
      } catch (_) {}
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
            body: JSON.stringify({ email, accept_privacy: true }),
          });
          const data = await resp.json().catch(() => ({}));
          if (reqBtn) { reqBtn.disabled = false; reqBtn.textContent = 'Отправить код'; }
          if (!data.success) {
            setStatus(data.error === 'rate_limit' ? 'Слишком часто. Попробуйте через минуту.' : 'Не удалось отправить код. Проверьте email и повторите.', 'error');
            return;
          }
          setStatus('Код отправлен', 'success');
          reqForm.classList.add('hidden');
          if (codeForm) codeForm.classList.remove('hidden');
          if (codeInput) setTimeout(() => codeInput.focus(), 100);
        } catch (_) {
          if (reqBtn) { reqBtn.disabled = false; reqBtn.textContent = 'Отправить код'; }
          setStatus('Ошибка сети. Попробуйте ещё раз.', 'error');
        }
      });
    }

    if (regForm) {
      regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = (regEmail && regEmail.value || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          setRegStatus('Укажите корректный email', 'error');
          return;
        }
        const name = registrationName();
        if (!name) {
          setRegStatus('Укажите имя', 'error');
          return;
        }
        if (!regPrivacy || !regPrivacy.checked) {
          try { regPrivacy.closest('.login-oauth-privacy')?.classList.add('needs-attention'); } catch (_) {}
          setRegStatus('Нужно согласие с политикой', 'error');
          return;
        }
        if (regBtn) { regBtn.disabled = true; regBtn.textContent = 'Отправляем…'; }
        setRegStatus('');
        try {
          const resp = await fetch(API_BASE + '/api/auth/email/request-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, accept_privacy: true, acceptPrivacy: true }),
          });
          const data = await resp.json().catch(() => ({}));
          if (regBtn) { regBtn.disabled = false; regBtn.textContent = 'Код'; }
          if (!data.success) {
            setRegStatus(data.error === 'rate_limit' ? 'Слишком часто. Попробуйте через минуту.' : 'Не удалось отправить код', 'error');
            return;
          }
          setRegStatus('Код отправлен', 'success');
          regForm.classList.add('hidden');
          if (regCodeForm) regCodeForm.classList.remove('hidden');
          if (regCode) setTimeout(() => regCode.focus(), 80);
        } catch (_) {
          if (regBtn) { regBtn.disabled = false; regBtn.textContent = 'Код'; }
          setRegStatus('Ошибка сети. Попробуйте ещё раз.', 'error');
        }
      });
    }

    if (regBack) {
      regBack.addEventListener('click', () => {
        if (regCodeForm) regCodeForm.classList.add('hidden');
        if (regForm) regForm.classList.remove('hidden');
        if (regCode) regCode.value = '';
        setRegStatus('');
      });
    }

    if (regCodeForm) {
      regCodeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = (regEmail && regEmail.value || '').trim().toLowerCase();
        const code = (regCode && regCode.value || '').trim();
        if (!/^\d{4,8}$/.test(code)) {
          setRegStatus('Введите код из письма', 'error');
          return;
        }
        setRegStatus('Проверка…');
        try {
          const verifyResp = await fetch(API_BASE + '/api/auth/email/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code }),
          });
          const verifyData = await verifyResp.json().catch(() => ({}));
          if (!verifyData.success || !verifyData.access) {
            setRegStatus(verifyData.message || verifyData.error || 'Неверный код', 'error');
            return;
          }
          const exchangeResp = await fetch(API_BASE + '/api/site/session/from-jwt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access: verifyData.access }),
          });
          const exchangeData = await exchangeResp.json().catch(() => ({}));
          if (!exchangeData.success || !exchangeData.token) {
            setRegStatus(exchangeData.error || 'Не удалось создать сессию', 'error');
            return;
          }
          await applyDisplayNameIfNeeded(exchangeData.token, registrationName());
          applySiteSessionLogin({ ...exchangeData, name: registrationName() || exchangeData.name, is_personal: true }, modal, regStatus);
          setRegStatus('Готово', 'success');
        } catch (_) {
          setRegStatus('Ошибка сети. Попробуйте ещё раз.', 'error');
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
        if (getToken() || hasAuthEntryDeepLink()) clearStaleSiteSession();
        const failKp = filmKpFromLocation();
        if (failKp) {
          redirectToPublicFilmPage(failKp);
          return;
        }
        showScreen('landing');
        renderHeader(null);
        handleAuthEntryDeepLinks();
        return;
      }
      cabinetHasData = !!me.has_data;
      cabinetUserId = me.user_id || null;
      _cabinetMeCache = me;
      renderHeader(me);
      updateProfileSwitcherUI(me);
      refreshGroupSuggestions(me);
      updateGroupContextFab();
      loadExtensionConfig();
      loadTvSettings();
      try {
        const pending = localStorage.getItem('mp_pending_invite_token');
        if (pending) {
          localStorage.removeItem('mp_pending_invite_token');
          // showInviteConfirmModal(pending);
        }
      } catch (_) {}
      try {
        const pendingFriend = localStorage.getItem('mp_pending_add_friend');
        if (pendingFriend && /^\d+$/.test(pendingFriend)) {
          localStorage.removeItem('mp_pending_add_friend');
          const uid = Number(pendingFriend);
          const token = getToken();
          fetch(API_BASE + '/api/friends/' + uid + '/public', { headers: { 'Authorization': 'Bearer ' + token } })
            .then((r) => r.json().catch(() => ({})))
            .then((d) => { if (d.success) _openAddFriendModal(uid, d, true); })
            .catch(() => {});
        }
      } catch (_) {}
      showCabinetAfterLogin(me);
    }).catch(function () {
      if (getToken() || hasAuthEntryDeepLink()) clearStaleSiteSession();
      const failKp = filmKpFromLocation();
      if (failKp) {
        redirectToPublicFilmPage(failKp);
        return;
      }
      showScreen('landing');
      renderHeader(null);
      handleAuthEntryDeepLinks();
    });
  }

  function bindOnboardingActionsOnce() {
    if (window._mpOnboardingActionsBound) return;
    window._mpOnboardingActionsBound = true;
    document.addEventListener('click', (e) => {
      const skip = e.target.closest('[data-onboard-skip]');
      if (!skip) return;
      e.preventDefault();
      uiTourMarkDone(UI_TOUR_KEYS.onboarding).then(function () {
        if (_cabinetMeCache) showCabinetAfterLogin(_cabinetMeCache);
        else loadMeAndShowCabinet();
      });
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

  let _cabinetMeCache = null;

  function filterGroupFilmSuggestions(actions, myUserId) {
    const seen = new Set();
    const out = [];
    for (const a of actions || []) {
      if (!a || a.action_type !== 'share_film' || !a.kp_id) continue;
      if (myUserId != null && Number(a.author_user_id) === Number(myUserId)) continue;
      const kp = String(a.kp_id);
      if (seen.has(kp)) continue;
      seen.add(kp);
      out.push(a);
    }
    return out;
  }

  function renderGroupSuggestionsHomeHtml(items) {
    const rows = items.length
      ? items.slice(0, 8).map((s) => {
          const kp = escapeHtml(String(s.kp_id));
          return '<div class="home-dash-row home-suggestion-row film-card-v2" data-kp-id="' + kp + '" tabindex="0" role="button">'
            + '<div class="home-dash-row-text"><div class="home-dash-row-main">'
            + '<div class="home-dash-row-title">' + escapeHtml(s.film_title || 'Фильм') + '</div>'
            + '<div class="home-dash-row-meta">' + escapeHtml(s.author_name || 'Участник') + '</div>'
            + '</div></div><span class="list-arrow" style="margin-left:8px">›</span></div>';
        }).join('')
      : '<p class="empty-hint">Пока никто не предложил фильм — поделитесь первым из карточки фильма.</p>';
    return '<section class="home-dash-block home-group-suggestions-block">'
      + '<div class="home-dash-head"><h3 class="home-dash-h">Предложения</h3></div>'
      + '<div class="home-dash-rows">' + rows + '</div></section>';
  }

  function refreshGroupSuggestions(me) {
    const box = document.getElementById('home-group-suggestions');
    if (!box) return;
    if (!me || !me.is_group_profile) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    const chatId = me.chat_id || getActiveChatId();
    if (!chatId) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = '<p class="cabinet-hint">Загружаем предложения…</p>';
    api('/api/site/groups/' + encodeURIComponent(String(chatId)) + '/actions').then((data) => {
      const items = filterGroupFilmSuggestions((data && data.actions) || [], cabinetUserId);
      box.innerHTML = renderGroupSuggestionsHomeHtml(items);
      box.querySelectorAll('.home-suggestion-row').forEach((row) => {
        row.addEventListener('click', () => {
          const kp = row.getAttribute('data-kp-id');
          if (!kp) return;
          pickAddFilm(kp, row);
        });
      });
    }).catch(() => {
      box.innerHTML = renderGroupSuggestionsHomeHtml([]);
    });
  }

  function updateGroupContextFab() {
    const fab = document.getElementById('group-context-fab');
    const readonly = document.getElementById('cabinet-readonly');
    if (!fab) return;
    if (!readonly || readonly.classList.contains('hidden') || !getToken()) {
      fab.classList.add('hidden');
      return;
    }
    api('/api/site/profiles').then((data) => {
      if (!data || !data.success) {
        fab.classList.add('hidden');
        return;
      }
      const profiles = data.profiles || [];
      const active = profiles.find((p) => p.is_active)
        || profiles.find((p) => String(p.chat_id) === String(data.active_chat_id));
      const personal = profiles.find((p) => p.is_personal);
      if (active && !active.is_personal && personal) {
        fab.classList.remove('hidden');
        fab.onclick = () => switchProfileTo(personal.chat_id);
      } else {
        fab.classList.add('hidden');
        fab.onclick = null;
      }
    }).catch(() => {
      fab.classList.add('hidden');
    });
  }

  function shortPremiereDescription(text, limit = 128) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (s.length <= limit) return s;
    return s.slice(0, limit).replace(/\s+\S*$/, '') + '…';
  }

  function homeDashNavAttrs(item) {
    const fid = item && (item.film_id || item.already_in_base_film_id);
    const kp = item && item.kp_id;
    let attrs = '';
    if (fid) attrs += ' data-film-id="' + escapeHtml(String(fid)) + '"';
    if (kp) attrs += ' data-kp-id="' + escapeHtml(String(kp)) + '"';
    return attrs;
  }

  function renderHomeHoverPreview(opts) {
    const o = opts || {};
    const title = o.title || '';
    const poster = o.poster || '';
    const metaHtml = o.metaHtml || '';
    const desc = shortPremiereDescription(o.description || '', 118);
    if (!title && !metaHtml && !desc) return '';
    const emoji = o.emoji || '🎬';
    return '<div class="home-film-preview" aria-hidden="true">'
      + '<div class="home-film-preview-poster">' + (poster ? ('<img src="' + escapeHtml(poster) + '" alt="" loading="lazy">') : ('<span>' + emoji + '</span>')) + '</div>'
      + '<div class="home-film-preview-body">'
      + '<div class="home-film-preview-title">' + escapeHtml(title) + '</div>'
      + (metaHtml ? '<div class="home-film-preview-meta">' + metaHtml + '</div>' : '')
      + (desc ? '<div class="home-film-preview-desc">' + escapeHtml(desc) + '</div>' : '')
      + '</div></div>';
  }

  function openFilmFromCard(card) {
    if (!card) return;
    const kpId = String(card.getAttribute('data-kp-id') || card.getAttribute('data-kp') || '').trim();
    const filmId = String(card.getAttribute('data-film-id') || '').trim();
    if (kpId) {
      openFilmPageByKp(kpId);
      return;
    }
    if (filmId && filmId !== 'null') {
      openFilmPageFromLegacyPath(Number(filmId));
    }
  }

  /** Открыть фильм в кабинете по kp_id (канонический /f/:kp). */
  function openFilmNav(kpId, filmId) {
    const kp = String(kpId || '').replace(/\D/g, '');
    if (kp) {
      openFilmPageByKp(kp);
      return;
    }
    const fid = Number(filmId);
    if (fid) openFilmPageFromLegacyPath(fid);
  }

  function renderPremiereNotifyButton(it, extraClass) {
    const kp = escapeHtml(String(it.kp_id || ''));
    const date = escapeHtml(String(it.premiere_date || ''));
    const active = !!it.reminder_set;
    const cls = ['premiere-bell-btn', extraClass || '', active ? 'active' : ''].filter(Boolean).join(' ');
    const action = active ? 'premiere-notify-off' : 'premiere-notify-on';
    const label = active ? 'Отслеживается' : 'Отслеживать премьеру';
    const icon = active ? '🔕' : '🔔';
    return '<button type="button" class="' + cls + '" data-action="' + action + '" data-kp="' + kp + '" data-date="' + date + '" title="' + label + '" aria-label="' + label + '">' + icon + '</button>';
  }

  function renderShareFilmIconButton(it, extraClass) {
    const cls = ['film-share-icon-btn', extraClass || ''].filter(Boolean).join(' ');
    return '<button type="button" class="' + cls + '" data-action="share-film-modal"'
      + ' data-kp="' + escapeHtml(String(it.kp_id || '')) + '"'
      + ' data-film-id="' + escapeHtml(String(it.already_in_base_film_id || it.film_id || '')) + '"'
      + ' data-title="' + escapeHtml(it.title || '') + '"'
      + ' data-poster="' + escapeHtml(it.poster || '') + '"'
      + ' data-year="' + escapeHtml(String(it.year || '')) + '"'
      + ' data-genres="' + escapeHtml(String(it.genres || '')) + '"'
      + ' title="Поделиться" aria-label="Поделиться">↗</button>';
  }

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
        const metaLine = escapeHtml((dateLine + ' ' + timeLine).trim()) + ' · ' + escapeHtml(_planTypeLabel(p));
        const preview = renderHomeHoverPreview({
          title: p.title || '',
          poster: poster,
          metaHtml: metaLine,
          description: p.description || '',
          emoji: '🎬',
        });
        return '<div class="home-dash-row film-card-v2"' + homeDashNavAttrs(p) + '><div class="home-dash-row-text">'
          + '<div class="home-dash-row-poster">' + (poster ? ('<img src="' + escapeHtml(poster) + '" alt="" loading="lazy">') : '<span>🎬</span>') + '</div>'
          + '<div class="home-dash-row-main">'
          + '<div class="home-dash-row-title">' + escapeHtml(p.title || '') + '</div>'
          + '<div class="home-dash-row-meta">' + metaLine + '</div>'
          + '</div></div>' + preview + '</div>';
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
      const rows = items.map((m) => {
        const poster = m.kp_id ? posterUrl(m.kp_id) : '';
        const metaParts = [m.year, m.genres].filter(Boolean).map(String);
        const preview = renderHomeHoverPreview({
          title: m.title || '',
          poster: poster,
          metaHtml: metaParts.length ? escapeHtml(metaParts.join(' · ')) : '',
          description: m.description || '',
          emoji: m.is_series ? '📺' : '🎬',
        });
        return '<div class="home-dash-row film-card-v2"' + homeDashNavAttrs(m) + '><div class="home-dash-row-text">'
          + '<div class="home-dash-row-poster">' + (poster ? ('<img src="' + escapeHtml(poster) + '" alt="" loading="lazy">') : '<span>🎬</span>') + '</div>'
          + '<div class="home-dash-row-main">'
          + '<div class="home-dash-row-title">' + escapeHtml(m.title || '') + '</div>'
          + '<div class="home-dash-row-meta">' + (m.year ? escapeHtml(String(m.year)) : '') + '</div>'
          + '</div></div>' + preview + '</div>';
      }).join('');
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
      const rows = items.map((s) => {
        const poster = s.kp_id ? posterUrl(s.kp_id) : '';
        const metaParts = [s.progress || 'Сериал', s.year, s.genres].filter(Boolean).map(String);
        const preview = renderHomeHoverPreview({
          title: s.title || '',
          poster: poster,
          metaHtml: escapeHtml(metaParts.slice(0, 2).join(' · ')),
          description: s.description || s.actors || '',
          emoji: '📺',
        });
        return '<div class="home-dash-row film-card-v2"' + homeDashNavAttrs(s) + '><div class="home-dash-row-text">'
          + '<div class="home-dash-row-poster">' + (poster ? ('<img src="' + escapeHtml(poster) + '" alt="" loading="lazy">') : '<span>📺</span>') + '</div>'
          + '<div class="home-dash-row-main">'
          + '<div class="home-dash-row-title">' + escapeHtml(s.title || '') + '</div>'
          + '<div class="home-dash-row-meta">' + escapeHtml(s.progress || 'Сериал') + '</div>'
          + '</div></div>' + preview + '</div>';
      }).join('');
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
        const poster = it.poster || posterUrl(it.kp_id);
        const dateLabel = typeof formatPremiereDate === 'function' ? formatPremiereDate(it.premiere_date) : (it.premiere_date || '');
        const meta = [it.genres || '', it.year || ''].filter(Boolean).join(' · ');
        const desc = shortPremiereDescription(it.description || '', 118);
        const metaHtml = '<span class="home-premiere-date-pill">' + escapeHtml(dateLabel) + '</span>'
          + (meta ? '<span class="home-premiere-inline-meta">' + escapeHtml(meta) + '</span>' : '');
        const preview = renderHomeHoverPreview({
          title: it.title || '',
          poster: poster,
          metaHtml: metaHtml,
          description: it.description || '',
          emoji: '🎭',
        });
        const rowCls = 'home-dash-row home-dash-row--premiere film-card-v2';
        return '<div class="' + rowCls + '"' + homeDashNavAttrs(it) + '><div class="home-dash-row-text">'
          + '<div class="home-dash-row-poster">' + (poster ? ('<img src="' + escapeHtml(poster) + '" alt="" loading="lazy">') : '<span>🎭</span>') + '</div>'
          + '<div class="home-dash-row-main">'
          + '<div class="home-dash-row-title">' + escapeHtml(it.title || '') + '</div>'
          + '<div class="home-dash-row-meta">' + metaHtml + '</div>'
          + (desc ? '<div class="home-premiere-desc">' + escapeHtml(desc) + '</div>' : '')
          + '</div></div>'
          + '<div class="home-premiere-actions" data-stop-card-click="1">'
          + renderShareFilmIconButton(it, 'home-premiere-share')
          + renderPremiereNotifyButton(it, 'home-premiere-bell')
          + '</div>'
          + preview + '</div>';
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
      const card = e.target.closest('[data-film-id],[data-kp-id],[data-kp]');
      if (card && card.closest('#home-dashboard-root') && !e.target.closest('button,a,input,select,textarea,[data-stop-card-click]')) {
        const filmId = String(card.getAttribute('data-film-id') || '').trim();
        const kpId = String(card.getAttribute('data-kp-id') || card.getAttribute('data-kp') || '').trim();
        if (filmId || kpId) {
          e.preventDefault();
          e.stopPropagation();
          openFilmFromCard(card);
          return;
        }
      }
      const inboxFab = e.target.closest('#inbox-fab');
      if (inboxFab) {
        e.preventDefault();
        showSection('inbox');
        if (typeof loadSiteInbox === 'function') loadSiteInbox();
        return;
      }
      const baseTab = e.target.closest('[data-base-section]');
      if (baseTab) {
        e.preventDefault();
        const sec = baseTab.getAttribute('data-base-section');
        if (sec) showSection(sec);
        return;
      }
      const premiereBtn = e.target.closest('[data-action="premiere-notify-on"],[data-action="premiere-notify-off"]');
      if (premiereBtn && premiereBtn.closest('.home-dashboard-root')) {
        e.preventDefault();
        e.stopPropagation();
        handlePremiereNotifyButton(premiereBtn, () => {
          renderHomeDashboardFromCache();
        });
        return;
      }
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
              ${buildFilmActionBar({ kp_id: p.kp_id, title: p.title, year: p.year, plan_type: p.plan_type, online_link: p.online_link || p.streaming_url })}
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

  function filterByTitle(items, query, titleKey, extraKeys) {
    if (!query) return items.slice();
    const key = titleKey || 'title';
    const keys = [key].concat(Array.isArray(extraKeys) ? extraKeys : []);
    const filtered = items.filter((item) => {
      const blob = keys.map((k) => String(item[k] || '')).join(' ').toLowerCase();
      return blob.includes(query);
    });
    return filtered.sort((a, b) => {
      const ta = (a[key] || '').toLowerCase();
      const tb = (b[key] || '').toLowerCase();
      const ia = ta.indexOf(query);
      const ib = tb.indexOf(query);
      return ia - ib;
    });
  }

  function sectionFilterState(section) {
    const typeEl = document.getElementById('section-filter-' + section + '-type');
    const yearFromEl = document.getElementById('section-filter-' + section + '-year-from');
    const yearToEl = document.getElementById('section-filter-' + section + '-year-to');
    const genreEl = document.getElementById('section-filter-' + section + '-genre');
    const yearFrom = parseInt((yearFromEl && yearFromEl.value) || '', 10);
    const yearTo = parseInt((yearToEl && yearToEl.value) || '', 10);
    return {
      type: (typeEl && typeEl.value) || 'any',
      yearFrom: Number.isNaN(yearFrom) ? null : yearFrom,
      yearTo: Number.isNaN(yearTo) ? null : yearTo,
      genre: ((genreEl && genreEl.value) || '').trim().toLowerCase(),
    };
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
          ${buildFilmActionBar({ kp_id: m.kp_id, title: m.title, year: m.year, online_link: m.online_link })}
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
    const fs = sectionFilterState('unwatched');
    let list = filterByTitle(unwatchedItems, query, 'title', ['actors', 'director', 'genres', 'year']);
    list = list.filter((m) => {
      if (fs.type === 'film' && m.is_series) return false;
      if (fs.type === 'series' && !m.is_series) return false;
      const y = parseInt(String(m.year || ''), 10);
      if (fs.yearFrom != null && (Number.isNaN(y) || y < fs.yearFrom)) return false;
      if (fs.yearTo != null && (Number.isNaN(y) || y > fs.yearTo)) return false;
      if (fs.genre && String(m.genres || '').toLowerCase().indexOf(fs.genre) === -1) return false;
      return true;
    });
    list.sort((a, b) => Number(Boolean(b.has_upcoming_plan)) - Number(Boolean(a.has_upcoming_plan)));
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
      ['type', 'year-from', 'year-to', 'genre'].forEach((suffix) => {
        const el = document.getElementById('section-filter-unwatched-' + suffix);
        if (el && !el.dataset.bound) {
          el.dataset.bound = '1';
          el.addEventListener('input', renderUnwatchedList);
          el.addEventListener('change', renderUnwatchedList);
        }
      });
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
    const subActive = !!s.has_subscription;
    const subToggleBtn = s.film_id
      ? `<button type="button" class="btn btn-small ${subActive ? 'btn-primary' : 'btn-secondary'} series-sub-toggle" data-series-sub-toggle="${escapeHtml(String(s.film_id))}" data-subscribed="${subActive ? '1' : '0'}" onclick="event.stopPropagation()">${subActive ? '🚫⏰' : '⏰'}</button>`
      : '';
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
          <div style="margin:8px 0 6px">${subToggleBtn}</div>
          ${buildFilmActionBar({ kp_id: s.kp_id, title: s.title, is_series: true, online_link: s.online_link })}
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
    const fs = sectionFilterState('series');
    const list = filterByTitle(seriesItems, sectionSearchQuery('series'), 'title', ['actors', 'genres', 'year']).filter((s) => {
      if (fs.type === 'awaiting') return !!s.has_subscription;
      if (fs.type === 'watching') return Number(s.watched_count || 0) > 0;
      const y = parseInt(String(s.year || ''), 10);
      if (fs.yearFrom != null && (Number.isNaN(y) || y < fs.yearFrom)) return false;
      if (fs.yearTo != null && (Number.isNaN(y) || y > fs.yearTo)) return false;
      if (fs.genre && String(s.genres || '').toLowerCase().indexOf(fs.genre) === -1) return false;
      return true;
    });
    el.innerHTML = list.length ? list.map(renderSeriesCard).join('') : '<p class="empty-hint">Ничего не найдено</p>';
    el.querySelectorAll('[data-series-sub-toggle]').forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const filmId = btn.getAttribute('data-series-sub-toggle');
        if (!filmId) return;
        const wasSubscribed = btn.getAttribute('data-subscribed') === '1';
        btn.disabled = true;
        api('/api/site/film/' + encodeURIComponent(filmId) + '/series-episode-subscription', {
          method: 'POST',
          body: JSON.stringify({ subscribed: !wasSubscribed }),
        }).then((data) => {
          if (!data || data.success !== true) throw new Error((data && (data.message || data.error)) || 'save_failed');
          seriesItems = seriesItems.map((it) => (String(it.film_id) === String(filmId) ? ({ ...it, has_subscription: !!data.subscribed }) : it));
          showToast(data.subscribed ? 'Добавлено в ⏰ Ожидаю' : 'Убрано из ⏰ Ожидаю');
          renderSeriesList();
          try { scheduleHomeDashboardRefresh(); } catch (_) {}
        }).catch((e) => {
          showToast((e && e.message) || 'Не удалось сохранить');
          btn.disabled = false;
        });
      });
    });
  }

  function loadSeries() {
    api('/api/site/series').then((data) => {
      if (!data.success) return;
      seriesItems = Array.isArray(data.items) ? data.items : [];
      bindSectionSearchOnce('series', renderSeriesList);
      ['year-from', 'year-to', 'genre'].forEach((suffix) => {
        const el = document.getElementById('section-filter-series-' + suffix);
        if (el && !el.dataset.bound) {
          el.dataset.bound = '1';
          el.addEventListener('input', renderSeriesList);
          el.addEventListener('change', renderSeriesList);
        }
      });
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
          ${buildFilmActionBar({ kp_id: r.kp_id, title: r.title, year: r.year, online_link: r.online_link })}
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

  function buildFilmPlanDropdown(item) {
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
    if (item.online_link) {
      watchItems.push(
        `<a class="action-dropdown-item" href="${escapeHtml(item.online_link)}" target="_blank" rel="noopener">🎞 Онлайн-кинотеатр</a>`
      );
    }
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
    const menuItems = planItems + (watchItems.length ? watchItems.join('') : '');
    return (
      `<div class="action-dropdown" data-dropdown-root="plan">` +
        `<button type="button" class="action-dropdown-btn film-toolbar-plan" data-dropdown-toggle="1">` +
          `<span class="action-dropdown-btn-label">📅 Запланировать просмотр</span>` +
          `<span class="action-dropdown-caret">▾</span>` +
        `</button>` +
        `<div class="action-dropdown-menu">${menuItems}</div>` +
      `</div>`
    );
  }

  function buildFilmPageToolbar(item, opts) {
    opts = opts || {};
    const inBase = !!opts.inBase;
    const watched = !!opts.watched;
    const myRating = Number(opts.myRating) || 0;
    const canRate = opts.canRate !== false;
    const ratingLocked = !!opts.ratingLocked;
    const authenticated = !!opts.authenticated;
    const usePublicRatingGrid = !inBase || !authenticated;
    let ratingInner = '';
    if (ratingLocked) {
      ratingInner = '<p class="film-rating-locked-hint">В группе оценку ставят только администраторы и создатель.</p>';
    } else if (usePublicRatingGrid) {
      ratingInner = '<div class="film-toolbar-rating-grid rating-grid" id="rate-grid">' +
        [1,2,3,4,5,6,7,8,9,10].map((n) => `<button type="button" class="rate-btn" data-rate="${n}">${n}</button>`).join('') +
        '</div>';
    } else {
      ratingInner = '<div class="film-toolbar-rating-grid"><div class="rating-stars" data-rating-stars="1">' +
        buildRatingStars(myRating) + '</div></div>' +
        (myRating ? '<div class="film-rating-share-row"><button type="button" class="rating-remove-btn" data-action="remove-rating">Убрать оценку</button>' + (!isVirtualRoom ? '<button type="button" class="film-share-mini-btn" data-action="share-rating-modal" title="Поделиться оценкой" aria-label="Поделиться оценкой">↗</button>' : '') + '</div>' : '');
    }
    const planBlock = (authenticated && inBase)
      ? '<div class="film-toolbar-plan-wrap">' + buildFilmPlanDropdown(item) + '</div>'
      : '<button type="button" class="film-toolbar-plan" id="plan-watch-btn"><span class="film-icon-ico" aria-hidden="true">📅</span><span>Запланировать просмотр</span></button>';
    let dbActionRow = '';
    if (inBase) {
      dbActionRow =
        '<button type="button" class="film-watch-btn' + (watched ? ' on' : '') + '" data-action="toggle-watched" aria-label="' + (watched ? 'Просмотрен' : 'Отметить просмотренным') + '">' +
          '<span class="film-watch-mark" aria-hidden="true">' + (watched ? '✓' : '') + '</span>' +
          '<span class="film-watch-label">' + (watched ? 'Просмотрен' : 'Отметить просмотренным') + '</span>' +
        '</button>';
    } else {
      dbActionRow =
        '<button type="button" class="film-add-base-btn" id="add-btn" aria-label="Добавить в базу">' +
          '<span class="film-add-base-plus" aria-hidden="true">+</span>' +
          '<span>Добавить в базу</span>' +
        '</button>';
    }
    const rateBtn = canRate && !ratingLocked
      ? '<button type="button" class="film-icon-btn" id="rate-toggle-btn" data-rate-toggle="1" aria-label="Оценить" title="Оценить"><span class="film-icon-ico">★</span><span class="film-icon-label">Оценить</span></button>'
      : '';
    return (
      '<div class="film-page-toolbar">' +
        planBlock +
        dbActionRow +
        '<div class="film-toolbar-icons">' +
          rateBtn +
          '<button type="button" class="film-icon-btn" id="facts-toggle-btn" data-facts-toggle="1" data-kp="' + escapeHtml(String(item.kp_id || '')) + '" aria-label="Интересные факты" title="Интересные факты"><span class="film-icon-ico">🤔</span><span class="film-icon-label">Факты</span></button>' +
          '<button type="button" class="film-icon-btn" id="share-film-btn" data-share-film="1" data-kp="' + escapeHtml(String(item.kp_id || '')) + '" aria-label="Поделиться" title="Поделиться"><span class="film-icon-ico">↗</span><span class="film-icon-label">Поделиться</span></button>' +
        '</div>' +
        '<div class="film-toolbar-expand hidden" id="rating-expand-panel">' +
          '<div class="public-rating-title">Ваша оценка</div>' + ratingInner +
        '</div>' +
        '<div class="film-toolbar-expand hidden" id="facts-expand-panel"><ul class="film-toolbar-facts-list" id="facts-list"></ul></div>' +
      '</div>'
    );
  }

  function bindFilmPageToolbar(root, film, opts) {
    if (!root) return;
    opts = opts || {};
    const rateToggle = root.querySelector('[data-rate-toggle]');
    const factsToggle = root.querySelector('[data-facts-toggle]');
    const shareBtn = root.querySelector('[data-share-film]');
    const ratingPanel = root.querySelector('#rating-expand-panel');
    const factsPanel = root.querySelector('#facts-expand-panel');
    const factsList = root.querySelector('#facts-list');
    function togglePanel(btn, panel) {
      if (!btn || !panel) return;
      const open = !panel.classList.contains('hidden');
      if (ratingPanel && panel !== ratingPanel) ratingPanel.classList.add('hidden');
      if (factsPanel && panel !== factsPanel) factsPanel.classList.add('hidden');
      root.querySelectorAll('[data-rate-toggle],[data-facts-toggle]').forEach((b) => b.classList.remove('is-active'));
      if (open) {
        panel.classList.add('hidden');
        btn.classList.remove('is-active');
        return;
      }
      panel.classList.remove('hidden');
      btn.classList.add('is-active');
    }
    if (rateToggle) {
      rateToggle.addEventListener('click', () => togglePanel(rateToggle, ratingPanel));
    }
    if (factsToggle) {
      let factsLoaded = false;
      factsToggle.addEventListener('click', () => {
        const willOpen = factsPanel && factsPanel.classList.contains('hidden');
        togglePanel(factsToggle, factsPanel);
        if (!willOpen || factsLoaded || !factsList) return;
        factsLoaded = true;
        factsList.innerHTML = '<li>Загружаем…</li>';
        const kp = factsToggle.getAttribute('data-kp') || (film && film.kp_id);
        fetch(getPublicApiBase() + '/api/public/film/' + encodeURIComponent(String(kp)) + '/facts', { method: 'GET', mode: 'cors' })
          .then((r) => r.json())
          .then((d) => {
            const arr = (d && d.facts && d.facts.length) ? d.facts.slice(0, 6) : ((d && d.bloopers) || []).slice(0, 6);
            factsList.innerHTML = arr.length
              ? arr.map((x) => '<li>' + escapeHtml(String(x)) + '</li>').join('')
              : '<li>Пока нет фактов для этого фильма.</li>';
          })
          .catch(() => { factsList.innerHTML = '<li>Не удалось загрузить факты.</li>'; });
      });
    }
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        openShareFilmModal({ kp_id: film.kp_id, film_id: film.film_id, title: film.title, poster: film.poster || film.poster_url, year: film.year, genres: film.genres });
      });
    }
    const kpNorm = String((film && film.kp_id) || opts.kpId || '').replace(/\D/g, '');
    const addBtn = root.querySelector('#add-btn');
    if (addBtn && !opts.inBase) {
      addBtn.addEventListener('click', function () {
        if (!getToken()) { showLoginModalOverlay(); return; }
        addBtn.disabled = true;
        api('/api/site/add-film', { method: 'POST', body: JSON.stringify({ kp_id: Number(kpNorm) }) })
          .then(function (res) {
            if (res && res.success && res.film_id) {
              showToast('Фильм добавлен');
              return openFilmPage(Number(res.film_id), { skipHistory: true, replace: true, kpId: kpNorm });
            }
            showToast((res && res.error) || 'Не удалось добавить', { type: 'error' });
          })
          .catch(function () { showToast('Ошибка сети', { type: 'error' }); })
          .finally(function () { addBtn.disabled = false; });
      });
    }
    const planBtn = root.querySelector('#plan-watch-btn');
    if (planBtn && !opts.inBase) {
      planBtn.addEventListener('click', function () {
        if (!getToken()) { showLoginModalOverlay(); return; }
        api('/api/site/add-film', { method: 'POST', body: JSON.stringify({ kp_id: Number(kpNorm) }) })
          .then(function (res) {
            if (res && res.success && res.film_id) {
              return openFilmPage(Number(res.film_id), { skipHistory: true, replace: true, kpId: kpNorm, pendingAction: 'plan' });
            }
            showToast((res && res.error) || 'Не удалось подготовить фильм', { type: 'error' });
          })
          .catch(function () { showToast('Ошибка сети', { type: 'error' }); });
      });
    }
    const rateGrid = root.querySelector('#rate-grid');
    if (rateGrid && !opts.inBase) {
      rateGrid.querySelectorAll('[data-rate]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const v = Number(btn.getAttribute('data-rate'));
          if (!(v >= 1 && v <= 10)) return;
          if (!getToken()) { showLoginModalOverlay(); return; }
          api('/api/site/add-film', { method: 'POST', body: JSON.stringify({ kp_id: Number(kpNorm) }) })
            .then(function (addRes) {
              if (!addRes || !addRes.success || !addRes.film_id) throw new Error((addRes && addRes.error) || 'Не удалось подготовить фильм');
              const fid = Number(addRes.film_id);
              return api('/api/site/film/' + fid + '/rating', { method: 'POST', body: JSON.stringify({ rating: v }) })
                .then(function (rateRes) { return { rateRes: rateRes, fid: fid }; });
            })
            .then(function (pair) {
              const res = pair && pair.rateRes;
              const fid = pair && pair.fid;
              if (res && res.success) {
                showToast('Оценка ' + v + '/10 сохранена');
                applyCoinsFeedback(btn, Number(res.coins_added) || 0);
                return openFilmPage(fid, { skipHistory: true, replace: true, kpId: kpNorm });
              }
              showToast((res && res.error) || 'Не удалось поставить оценку', { type: 'error' });
            })
            .catch(function (e) { showToast((e && e.message) || 'Ошибка оценки', { type: 'error' }); });
        });
      });
    }
  }

  // Единая панель действий: планирование всегда доступно; «Смотреть» показываем только когда есть источник.
  // item: { kp_id, title, year, is_series?, plan_type? ('cinema'|'home'), in_cinema? }
  function buildFilmActionBar(item) {
    if (!item || !item.kp_id) return '';
    const kp = String(item.kp_id).replace(/\D/g, '');
    if (!kp) return '';
    const titleAttr = escapeHtml(item.title || '');
    const yearAttr = escapeHtml(String(item.year || ''));
    return `<div class="film-action-bar">${buildFilmPlanDropdown(item)}</div>`;
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
        showToast((res && (res.message || res.error)) || 'Не удалось сохранить оценку', { type: 'error' });
        return;
      }
      applyCoinsFeedback(starBtn, Number(res.coins_added) || 0);
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
      refreshFilmDetailFromApi(filmId);
    }).catch(() => {
      showToast('Сервер не отвечает. Попробуйте позже.', { type: 'error' });
    });
  }

  function submitQuickRatingDelete(filmId, context, starBtn) {
    api('/api/site/film/' + filmId + '/rating', { method: 'DELETE' }).then((res) => {
      if (!res || !res.success) {
        showToast((res && (res.message || res.error)) || 'Не удалось удалить оценку', { type: 'error' });
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
      refreshFilmDetailFromApi(filmId);
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
      const disconnectWrap = document.getElementById('tv-disconnect-wrap');
      const disconnectBtn = document.getElementById('tv-disconnect-btn');
      if (disconnectWrap) disconnectWrap.classList.toggle('hidden', !tvSettings.tv_type);
      if (disconnectBtn && !disconnectBtn._bound) {
        disconnectBtn._bound = true;
        disconnectBtn.addEventListener('click', () => {
          if (!window.confirm('Отключить телевизор? Кнопка «На ТВ» исчезнет с карточек фильмов.')) return;
          api('/api/site/tv/settings', {
            method: 'POST',
            body: JSON.stringify({ tv_type: null }),
          }).then((data) => {
            if (data && data.success) {
              tvSettings.tv_type = null;
              renderTvSection();
              if (typeof loadUnwatched === 'function') loadUnwatched();
              loadPlans();
              loadSeries();
              loadRatings();
            }
          });
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
      const kp = openBtn.getAttribute('data-kp');
      const fid = openBtn.getAttribute('data-film-id');
      if (kp || fid) {
        closeAddFilmModal();
        openFilmNav(kp, fid);
      }
      return;
    }

    // Клик по карточке фильма → открыть страницу фильма
    const card = e.target.closest('[data-film-id],[data-kp-id],[data-kp]');
    if (card) {
      // Не перехватываем клик, если клик был по кнопке действия внутри карточки
      // (tel-btn, streaming-btn, tickets-btn, "В Telegram").
      const actionBtn = e.target.closest('.btn-primary, .film-tv-btn, .film-streaming-btn, .tickets-btn, a[href^="http"].btn, [data-action], .film-card-tg-triangle, .action-dropdown, .action-dropdown-btn, .action-dropdown-item, [data-dropdown-toggle], [data-rate-star], .rate-popover');
      // "В Telegram" теперь должна нормально открываться — её не блокируем.
      if (actionBtn && actionBtn !== card && !actionBtn.classList.contains('film-card-main')) {
        return;
      }
      const filmId = String(card.getAttribute('data-film-id') || '').trim();
      const kpId = String(card.getAttribute('data-kp-id') || card.getAttribute('data-kp') || '').trim();
      if (!filmId && !kpId) return;
      // Пропускаем спец-модификаторы (средний клик, ctrl/cmd-клик — пусть открывают Telegram)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      e.stopPropagation();
      openFilmFromCard(card);
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

  const HIGH_RATING_SIMILAR_MIN = 9;

  function filmMyRating(ratings, me) {
    const myUserId = (me && me.user_id) || cabinetUserId;
    const myRatingObj = (ratings || []).find(function (r) {
      return r.user_id && myUserId && String(r.user_id) === String(myUserId);
    });
    return myRatingObj ? Number(myRatingObj.rating) : 0;
  }

  function buildSimilarRailHtml(similar) {
    if (!similar || !similar.length) return '';
    return (
      '<div class="film-modal-section film-similar-under-poster">' +
        '<div class="film-similar-rail-label">Похожие фильмы</div>' +
        '<div class="similar-rail" role="list">' +
        similar.map(function (s) {
          const p = s.poster || posterUrl(s.kp_id) || '';
          const img = p
            ? '<img src="' + escapeHtml(p) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
            : '';
          const inBase = s.in_base_film_id ? '<span class="similar-in-base">✓</span>' : '';
          const clickAttr = 'data-similar-kp="' + escapeHtml(String(s.kp_id)) + '"';
          const em = s.is_series ? '📺 ' : '🎬 ';
          return (
            '<button type="button" class="similar-rail-card" ' + clickAttr +
            ' title="' + escapeHtml(s.title || '') + '" role="listitem">' +
              '<div class="similar-rail-poster">' + img + inBase + '</div>' +
              '<div class="similar-rail-title">' + em + escapeHtml(s.title || '') + '</div>' +
            '</button>'
          );
        }).join('') +
        '</div></div>'
    );
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
        const kpHint = o.kpId || (_filmModalCache[filmId] && _filmModalCache[filmId].film && _filmModalCache[filmId].film.kp_id);
        const path = filmCanonicalPath(filmId, kpHint);
        if (path && path !== '/') {
          (o.replace ? history.replaceState : history.pushState).call(history, { view: 'film', filmId, kpId: kpHint || null }, '', path);
        }
      } catch (e) {}
    }

    const runLoad = (cached) => {
      if (cached) {
        setFilmPageToolbar(cached.film);
        try {
          document.title = (cached.film && cached.film.title ? cached.film.title + ' · Movie Planner' : DEFAULT_DOC_TITLE);
        } catch (e) {}
        if (!o.skipHistory && cached.film && cached.film.kp_id) {
          try {
            history.replaceState({ view: 'film', filmId, kpId: cached.film.kp_id }, '', filmCanonicalPath(filmId, cached.film.kp_id));
          } catch (_) {}
        }
        renderFilmDetail(cached.film, cached.ratings, cached.similar, cached.me, pageRoot);
      } else {
        pageRoot.className = 'movie-page loading';
        pageRoot.innerHTML = 'Загрузка…';
      }
    };
    if (_filmModalCache[filmId]) {
      runLoad(_filmModalCache[filmId]);
    } else {
      runLoad(null);
    }
    return api('/api/site/film/' + filmId).then(function (detail) {
      if (!detail || !detail.success) {
        pageRoot.className = 'movie-page';
        pageRoot.innerHTML = '<p class="film-page-error-hint">Не удалось загрузить: ' + escapeHtml((detail && detail.error) || 'ошибка') + '</p>';
        return;
      }
      if (_filmModalCurrentId !== filmId) return;
      const myRating = filmMyRating(detail.ratings || [], detail.me);
      const simPromise = myRating >= HIGH_RATING_SIMILAR_MIN
        ? api('/api/site/film/' + filmId + '/similar').catch(function () { return { success: true, items: [] }; })
        : Promise.resolve({ success: true, items: [] });
      return simPromise.then(function (sim) {
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
        if (!o.skipHistory && data.film && data.film.kp_id) {
          try {
            history.replaceState({ view: 'film', filmId, kpId: data.film.kp_id }, '', filmCanonicalPath(filmId, data.film.kp_id));
          } catch (_) {}
        }
        renderFilmDetail(data.film, data.ratings, data.similar, data.me, pageRoot);
        setFilmPageToolbar(data.film);
        try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) { try { window.scrollTo(0, 0); } catch (_) {} }
      });
    });
  }

  function closeFilmPage() {
    _staffPageKpId = null;
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

  function refreshFilmDetailFromApi(filmId) {
    return api('/api/site/film/' + filmId).then(function (detail) {
      if (!detail || !detail.success) return;
      const cache = _filmModalCache[filmId];
      if (!cache) return;
      cache.film = detail.film;
      cache.ratings = detail.ratings || [];
      if (detail.me) cache.me = detail.me;
      const myRating = filmMyRating(cache.ratings, cache.me);
      const finish = function () {
        const root = getFilmRenderRoot();
        if (root && _filmModalCurrentId === filmId) {
          renderFilmDetail(cache.film, cache.ratings, cache.similar, cache.me, root);
        }
      };
      if (myRating >= HIGH_RATING_SIMILAR_MIN) {
        return api('/api/site/film/' + filmId + '/similar').then(function (sim) {
          cache.similar = (sim && sim.items) || [];
          finish();
        }).catch(function () {
          cache.similar = [];
          finish();
        });
      }
      cache.similar = [];
      finish();
    });
  }

  function buildFilmGenreChipsHtml(film) {
    const parts = String((film && film.genres) || '')
      .split(/[,;/|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) parts.push(film && film.is_series ? 'сериал' : 'фильм');
    return parts.slice(0, 8).map((label) => '<span class="chip">' + escapeHtml(label) + '</span>').join('');
  }

  function renderFilmDetailHero(film, ratings, similar, me, content) {
    const myUserId = (me && me.user_id) || cabinetUserId;
    const myRatingObj = (ratings || []).find((r) => r.user_id && myUserId && String(r.user_id) === String(myUserId));
    const myRating = myRatingObj ? Number(myRatingObj.rating) : 0;
    const isVirtualRoom = !!film.is_virtual_room;
    const canRateInGroup = film.can_rate_in_group !== false;
    const poster = posterUrl(film.kp_id);
    const titleText = (film.title || 'Фильм') + (film.year ? ' (' + film.year + ')' : '');
    const crew = '<div class="film-hero-crew" id="film-hero-cast-root"><span class="muted small">Загрузка команды…</span></div>';
    const toolbarHtml = buildFilmPageToolbar({
      kp_id: film.kp_id,
      title: film.title,
      year: film.year,
      plan_type: film.plan_type,
      online_link: film.online_link,
      in_cinema: film.in_cinema,
    }, {
      inBase: true,
      watched: !!film.watched,
      authenticated: true,
      myRating,
      canRate: !(isVirtualRoom && !canRateInGroup),
      ratingLocked: isVirtualRoom && !canRateInGroup,
    });
    const similarHtml = (myRating >= HIGH_RATING_SIMILAR_MIN && similar && similar.length)
      ? '<div class="film-hero-panel film-hero-similar">' + buildSimilarRailHtml(similar) + '</div>'
      : '';

    content.className = 'movie-page';
    content.innerHTML =
      '<section class="hero" style="--film-backdrop:url(\'' + escapeHtml(poster || '') + '\')">' +
        '<div class="poster-wrap">' +
          (poster
            ? '<img class="poster" src="' + escapeHtml(poster) + '" alt="" loading="lazy" onerror="this.style.opacity=.22">'
            : '<div class="poster poster-empty">🎬</div>') +
        '</div>' +
        '<div class="hero-content">' +
          '<h1>' + escapeHtml(titleText) + '</h1>' +
          '<div class="eyebrow">' + buildFilmGenreChipsHtml(film) + '</div>' +
          crew +
          (film.description ? '<p class="description">' + escapeHtml(film.description) + '</p>' : '') +
          toolbarHtml +
        '</div>' +
      '</section>' +
      similarHtml +
      '<div id="film-friends-social-block"></div>';

    bindFilmModalInteractions(film, content);
    bindFilmPageToolbar(content.querySelector('.film-page-toolbar'), film, { inBase: true, authenticated: true });
    loadFilmFriendsSocial(film);
    loadFilmCastSection(film.kp_id, content.querySelector('#film-hero-cast-root'), film);
  }

  function loadFilmCastSection(kpId, root, filmFallback) {
    if (!root) return;
    const kp = String(kpId || '').replace(/\D/g, '');
    if (!kp) {
      root.innerHTML = buildFilmCrewFallback(filmFallback);
      return;
    }
    fetch(getPublicApiBase() + '/api/public/film/' + encodeURIComponent(kp) + '/cast', { method: 'GET', mode: 'cors' })
      .then(function (r) { return r.json(); })
      .then(function (cast) {
        const director = cast && cast.director;
        const actors = (cast && cast.actors) || [];
        const html = buildFilmCastHtml(director, actors, filmFallback && filmFallback.country);
        if (!html) {
          root.innerHTML = buildFilmCrewFallback(filmFallback);
          return;
        }
        root.innerHTML = html;
        bindStaffCastLinks(root, { guestPreview: true });
      }).catch(function () {
        root.innerHTML = buildFilmCrewFallback(filmFallback);
      });
  }

  function buildFilmCrewFallback(film) {
    if (!film) return '';
    const parts = [];
  const ctry = String((film && film.country) || '').trim();
  if (ctry) {
    parts.push('<div class="film-cast-row"><span class="film-cast-label">Страна:</span> ' + escapeHtml(ctry) + '</div>');
  }
    if (film.director && film.director !== 'Не указан') {
      parts.push('<div class="film-cast-row"><span class="film-cast-label">Режиссёр:</span> ' + escapeHtml(film.director) + '</div>');
    }
    if (film.actors) {
      parts.push('<div class="film-cast-row film-cast-actors"><span class="film-cast-label">Актёры:</span> ' + escapeHtml(String(film.actors || '')) + '</div>');
    }
    return parts.length ? parts.join('') : '';
  }

  function loadFilmFriendsSocial(film) {
    if (!film || !film.kp_id) return;
    const kpNorm = String(film.kp_id).replace(/\D/g, '');
    if (!kpNorm) return;
    api(`/api/friends/film/${encodeURIComponent(kpNorm)}/social`).then((social) => {
      const el = document.getElementById('film-friends-social-block');
      if (!el) return;
      const watchers = (social && social.watchers) || [];
      if (!watchers.length) return;
      el.innerHTML = `
        <div class="film-modal-section">
          <h3>👥 Оценки друзей (${watchers.length})</h3>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${watchers.map((w) => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px;background:rgba(255,255,255,.06);border-radius:8px">
                <div class="soc-friend-avatar" style="width:30px;height:30px;font-size:12px">${escapeHtml((w.name || '?')[0].toUpperCase())}</div>
                <span style="flex:1;font-weight:600;font-size:13px">${escapeHtml(w.name)}</span>
                ${w.rating != null ? `<span style="font-weight:700;color:var(--accent,#ff2d7b)">${w.rating}/10</span>` : '<span style="color:#aaa;font-size:12px">смотрел</span>'}
              </div>`).join('')}
          </div>
        </div>`;
    }).catch(() => {});
  }

  function renderFilmDetail(film, ratings, similar, me, content) {
    if (!content) return;
    const isPage = content.getAttribute && content.getAttribute('data-film-page-root');
    if (isPage) {
      renderFilmDetailHero(film, ratings || [], similar || [], me, content);
      return;
    }
    content.className = isPage
      ? 'container film-page-container film-modal-content'
      : 'film-modal-content';
    const myUserId = (me && me.user_id) || cabinetUserId;
    const myRatingObj = ratings.find((r) => r.user_id && myUserId && String(r.user_id) === String(myUserId));
    const myRating = myRatingObj ? Number(myRatingObj.rating) : 0;
    const isVirtualRoom = !!film.is_virtual_room;
    const canRateInGroup = film.can_rate_in_group !== false;

    const poster = posterUrl(film.kp_id);
    const year = film.year ? `(${film.year})` : '';
    const genresHtml = film.genres ? `<span>${escapeHtml(film.genres)}</span>` : '';
    const kpRating = film.rating_kp != null ? `<span class="film-modal-rkp">★ КП ${Number(film.rating_kp).toFixed(1)}</span>` : '';
    const imdbRating = film.rating_imdb != null ? `<span class="film-modal-rkp" style="background:rgba(200,200,200,0.12);color:#e0e0e0">IMDb ${Number(film.rating_imdb).toFixed(1)}</span>` : '';
    const progress = film.progress ? `<span>📺 ${escapeHtml(film.progress)}</span>` : '';
    const desc = film.description ? `<div class="film-modal-desc">${escapeHtml(film.description)}</div>` : '';
    const crew = '<div class="film-modal-crew" id="film-modal-cast-root"><span class="muted small">Загрузка команды…</span></div>';

    const tgLink = filmDeepLink(film.film_id, film.kp_id, film.is_series);

    // Оценки админов (виртуальная группа) — раскрываемый список
    let adminBreakdownHtml = '';
    if (isVirtualRoom) {
      const rows = film.admin_rating_breakdown || [];
      const rowHtml = rows.length
        ? rows.map(function (row) {
          const nm = escapeHtml(row.display_name || ('user ' + row.user_id));
          const rl = escapeHtml(row.role_label || '');
          const sc = Number(row.rating);
          return (
            '<div class="film-admin-rating-row">' +
              '<div class="film-admin-rating-who">' +
                '<span class="film-admin-rating-name">' + nm + '</span>' +
                (rl ? '<span class="film-admin-rating-role">' + rl + '</span>' : '') +
              '</div>' +
              '<span class="film-admin-rating-score">' + sc + '<span class="film-admin-rating-denom">/10</span></span>' +
            '</div>'
          );
        }).join('')
        : '<p class="film-admin-ratings-empty">Пока ни один админ не поставил оценку.</p>';
      const badge = rows.length ? '<span class="film-admin-ratings-badge">' + rows.length + '</span>' : '';
      adminBreakdownHtml =
        '<details class="film-modal-section film-admin-ratings-details" open>' +
          '<summary class="film-admin-ratings-summary">Оценки админов ' + badge + '</summary>' +
          '<div class="film-admin-ratings-body">' + rowHtml + '</div>' +
        '</details>';
    }

    // Rating stars — в виртуальной группе участник без прав не ставит оценку
    let ratingBlock = '';
    if (isVirtualRoom && !canRateInGroup) {
      ratingBlock =
        '<div class="film-modal-section film-rating-locked">' +
          '<h3>Ваша оценка</h3>' +
          '<p class="film-rating-locked-hint">В группе оценку ставят только администраторы и создатель — от своего профиля. Разбор по админам — в блоке выше.</p>' +
        '</div>';
    } else {
      const starsHtml = buildRatingStars(myRating);
      ratingBlock =
        '<div class="film-modal-section">' +
          '<h3>Ваша оценка</h3>' +
          '<div class="rating-stars" data-rating-stars="1">' + starsHtml + '</div>' +
          (myRating ? '<button type="button" class="rating-remove-btn" data-action="remove-rating">Убрать оценку</button>' : '') +
        '</div>';
    }

    // Group ratings — для виртуальной комнаты общий список заменён блоком «Оценки админов»
    const groupRatings = ratings.filter((r) => !myUserId || String(r.user_id) !== String(myUserId));
    const groupHtml = !isVirtualRoom && groupRatings.length
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
      online_link: film.online_link,
    });
    const actions = `
      <div class="film-modal-actions">
        ${watchedHtml}
        <a class="btn btn-small btn-secondary" href="${tgLink}" target="_blank" rel="noopener">💬 В Telegram</a>
        ${extra}
      </div>`;

    const similarHtml = (myRating >= HIGH_RATING_SIMILAR_MIN && similar && similar.length)
      ? buildSimilarRailHtml(similar)
      : '';

    content.innerHTML = `
      <div class="film-modal-poster-wrap">
        ${poster ? `<img src="${escapeHtml(poster)}" alt="" loading="lazy">` : '<div style="color:#665;">🎬</div>'}
      </div>
      ${similarHtml}
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
        ${ratingBlock}
        ${actions}
        ${adminBreakdownHtml}
        ${groupHtml}
        <div id="film-friends-social-block"></div>
      </div>`;

    bindFilmModalInteractions(film, content);

    loadFilmCastSection(film.kp_id, content.querySelector('#film-modal-cast-root'), film);
    loadFilmFriendsSocial(film);
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
    const actorsMoreBtn = content.querySelector('.film-actors-more-btn');
    if (actorsMoreBtn) {
      actorsMoreBtn.addEventListener('click', () => {
        const castRoot = actorsMoreBtn.closest('.film-hero-crew, .film-modal-crew');
        const shortEl = castRoot ? castRoot.querySelector('.film-actors-short') : content.querySelector('.film-actors-short');
        const fullEl = castRoot ? castRoot.querySelector('.film-actors-full') : content.querySelector('.film-actors-full');
        if (!shortEl || !fullEl) return;
        const collapsed = fullEl.classList.contains('hidden');
        fullEl.classList.toggle('hidden', !collapsed);
        shortEl.classList.toggle('hidden', collapsed);
        actorsMoreBtn.textContent = collapsed ? 'свернуть' : 'ещё';
        actorsMoreBtn.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
      });
    }

    // Rating stars: click/hover (нет блока — только read-only для участника в группе)
    const starsWrap = content.querySelector('[data-rating-stars="1"]');
    if (starsWrap && !(film.is_virtual_room && film.can_rate_in_group === false)) {
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
          setRating(film.film_id, v, btn);
        });
      });
    }

    const shareRatingBtn = content.querySelector('[data-action="share-rating-modal"]');
    if (shareRatingBtn) {
      shareRatingBtn.addEventListener('click', function (e) {
        e.preventDefault();
        const cache = _filmModalCache[film.film_id];
        const myUserId = (cache && cache.me && cache.me.user_id) || cabinetUserId;
        const mine = cache && cache.ratings && cache.ratings.find(function (r) {
          return myUserId && String(r.user_id) === String(myUserId);
        });
        const rv = mine ? Number(mine.rating) : 0;
        if (!rv) return;
        openShareRatingModal(film, rv);
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

    content.querySelectorAll('.similar-rail-card[data-similar-kp]').forEach(function (card) {
      card.addEventListener('click', function () {
        const kp = card.getAttribute('data-similar-kp');
        if (kp) openFilmPageByKp(kp);
      });
    });

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

  function setRating(filmId, rating, anchorBtn) {
    const cache = _filmModalCache[filmId];
    if (cache && cache.film && cache.film.is_virtual_room && cache.film.can_rate_in_group === false) {
      showToast('В группе оценки ставят только админы и создатель.', { type: 'error' });
      return;
    }
    api('/api/site/film/' + filmId + '/rating', {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }).then(function (res) {
      if (!res || !res.success) {
        showToast((res && (res.message || res.error)) || 'Не удалось сохранить оценку', { type: 'error' });
        return;
      }
      applyCoinsFeedback(anchorBtn, Number(res.coins_added) || 0);
      applyRatingToLists(filmId, rating);
      if (rating >= HIGH_RATING_SIMILAR_MIN && res.similar && _filmModalCache[filmId]) {
        _filmModalCache[filmId].similar = res.similar;
      }
      refreshFilmDetailFromApi(filmId).then(function () {
        try {
          const c = _filmModalCache[filmId];
          if (c) c.film.watched = true;
        } catch (e) {}
      });
    }).catch(function () {
      showToast('Сервер не отвечает', { type: 'error' });
    });
  }

  function deleteRating(filmId) {
    api('/api/site/film/' + filmId + '/rating', { method: 'DELETE' }).then((res) => {
      if (!res || !res.success) {
        showToast((res && (res.message || res.error)) || 'Не удалось удалить оценку', { type: 'error' });
        return;
      }
      removeRatingFromLists(filmId);
      refreshFilmDetailFromApi(filmId);
    }).catch(() => {
      showToast('Сервер не отвечает', { type: 'error' });
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

  function renderAddSearchMovieCard(it) {
    const poster = it.poster || '';
    const meta = [it.type === 'series' ? 'Сериал' : 'Фильм', it.year].filter(Boolean).join(' · ');
    const inBase = it.already_in_base_film_id;
    const addBtn = inBase
      ? `<button type="button" class="add-search-poster-action is-open" data-action="open-film-modal" data-kp="${escapeHtml(String(it.kp_id || ''))}" data-film-id="${escapeHtml(String(inBase))}" title="Открыть" aria-label="Открыть">✓</button>`
      : `<button type="button" class="add-search-poster-action" data-action="add-film-pick" data-kp="${escapeHtml(String(it.kp_id))}" title="Добавить" aria-label="Добавить">＋</button>`;
    return `<div class="add-search-result">
      <div class="add-search-result-poster-wrap" data-action="open-add-search-card" data-kp="${escapeHtml(String(it.kp_id || ''))}" role="button" tabindex="0">
        ${poster ? `<img class="add-search-result-poster" src="${escapeHtml(poster)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<div class="add-search-result-poster"></div>'}
        ${addBtn}
        <button type="button" class="add-search-share-action" data-action="share-film-modal" data-kp="${escapeHtml(String(it.kp_id || ''))}" data-film-id="${escapeHtml(String(inBase || ''))}" data-title="${escapeHtml(it.title || '')}" data-poster="${escapeHtml(poster)}" data-year="${escapeHtml(String(it.year || ''))}" data-genres="${escapeHtml(String(it.genres || ''))}" title="Поделиться" aria-label="Поделиться">↗</button>
      </div>
      <div class="add-search-result-info">
        <div class="add-search-result-title">${escapeHtml(it.title || '')}</div>
        <div class="add-search-result-meta">${escapeHtml(meta)}${inBase ? ' · в базе' : ''}</div>
      </div>
    </div>`;
  }

  function renderAddFilmPeopleBlock(users) {
    if (!users || !users.length) return '';
    return `<section class="add-search-section add-search-section-people">
      <div class="add-search-section-title">Люди</div>
      <div class="add-search-people-list">${users.map((u) => {
        const letter = (u.name || '?')[0].toUpperCase();
        const status = u.friendship_status;
        const action = status === 'friends' || status === 'accepted'
          ? '<span class="add-search-person-status">Друзья</span>'
          : status === 'pending'
            ? '<span class="add-search-person-status">Запрос отправлен</span>'
            : `<button type="button" class="add-search-person-add" data-uid="${Number(u.user_id)}">Добавить</button>`;
        return `<div class="add-search-person-row">
          <div class="soc-friend-avatar">${escapeHtml(letter)}</div>
          <div class="add-search-person-name">${escapeHtml(u.name || 'Пользователь')}</div>
          ${action}
        </div>`;
      }).join('')}</div>
    </section>`;
  }

  function renderAddFilmSearchResults(items, people) {
    const inBase = items.filter((it) => it.already_in_base_film_id);
    const fresh = items.filter((it) => !it.already_in_base_film_id);
    let html = '';
    if (inBase.length) {
      html += `<section class="add-search-section">
        <div class="add-search-section-title">Уже в базе</div>
        <div class="add-film-results">${inBase.map(renderAddSearchMovieCard).join('')}</div>
      </section>`;
    }
    html += renderAddFilmPeopleBlock(people);
    if (fresh.length) {
      html += `<section class="add-search-section">
        <div class="add-search-section-title">Общий поиск</div>
        <div class="add-film-results">${fresh.map(renderAddSearchMovieCard).join('')}</div>
      </section>`;
    }
    return html || '<div class="cabinet-hint">Ничего не нашлось.</div>';
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
    Promise.all([
      api('/api/site/search?q=' + encodeURIComponent(query) + '&type=' + encodeURIComponent(_addFilmType)),
      api('/api/friends/search?q=' + encodeURIComponent(query)).catch(() => ({ success: false, users: [] })),
    ])
      .then(([data, peopleData]) => {
        if (seq !== _addFilmSearchSeq) return;
        if (!data || !data.success) {
          if (status) { status.textContent = (data && data.error) || 'Ошибка поиска.'; status.className = 'add-film-status error'; }
          if (results) results.innerHTML = '';
          return;
        }
        const items = data.items || [];
        const people = (peopleData && peopleData.success && Array.isArray(peopleData.users)) ? peopleData.users : [];
        if (!items.length && !people.length) {
          if (status) { status.textContent = 'Ничего не нашлось.'; status.className = 'add-film-status'; }
          if (results) results.innerHTML = '';
          return;
        }
        if (status) { status.textContent = 'Найдено: ' + (items.length + people.length); status.className = 'add-film-status'; }
        if (results) {
          results.innerHTML = renderAddFilmSearchResults(items, people);
          results.querySelectorAll('.add-search-person-add').forEach((btn) => {
            btn.addEventListener('click', () => {
              const uid = Number(btn.getAttribute('data-uid'));
              if (!uid) return;
              btn.disabled = true;
              btn.textContent = '…';
              api('/api/friends/request', { method: 'POST', body: JSON.stringify({ to_user_id: uid }) }).then((r) => {
                if (!r || r.success === false) {
                  btn.disabled = false;
                  btn.textContent = 'Добавить';
                  showToast((r && r.error) || 'Не удалось отправить запрос', { type: 'error' });
                  return;
                }
                btn.textContent = 'Запрос отправлен';
              }).catch(() => {
                btn.disabled = false;
                btn.textContent = 'Добавить';
                showToast('Ошибка сети', { type: 'error' });
              });
            });
          });
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
    const compactBtn = btn && btn.classList && btn.classList.contains('add-search-poster-action');
    if (btn) { btn.disabled = true; btn.textContent = compactBtn ? '…' : 'Добавляем…'; }
    const addPromise = api('/api/site/add-film', { method: 'POST', body: JSON.stringify({ kp_id: kpId }) });
    kpAddSync.register(kpId, addPromise);
    addPromise
      .then((data) => {
        if (!data || !data.success) {
          if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
          const status = document.getElementById('add-film-status');
          if (status) { status.textContent = (data && data.error) || 'Не удалось добавить фильм.'; status.className = 'add-film-status error'; }
          return;
        }
        if (btn) {
          btn.textContent = compactBtn ? '✓' : (data.already_existed ? 'Уже в базе' : '✓ Добавлен');
          btn.disabled = true;
          if (compactBtn && data.film_id) {
            btn.classList.add('is-open');
            btn.setAttribute('data-action', 'open-film-modal');
            btn.setAttribute('data-film-id', String(data.film_id));
            btn.removeAttribute('data-kp');
          }
        }
        applyCoinsFeedback(btn, Number(data.coins_added) || 0);
        if (!data.already_existed && typeof loadUnwatched === 'function') loadUnwatched();
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
      const openCard = e.target.closest('[data-action="open-add-search-card"]');
      if (openCard && !e.target.closest('[data-action="add-film-pick"],[data-action="share-film-modal"],[data-action="open-film-modal"]')) {
        e.preventDefault();
        const kp = openCard.getAttribute('data-kp');
        if (kp) openFilmPageByKp(kp);
        return;
      }
      const share = e.target.closest('[data-action="share-film-modal"]');
      if (share) {
        e.preventDefault();
        e.stopPropagation();
        openShareFilmModal({
          kp_id: share.getAttribute('data-kp'),
          film_id: share.getAttribute('data-film-id') || null,
          title: share.getAttribute('data-title') || '',
          poster: share.getAttribute('data-poster') || '',
          year: share.getAttribute('data-year') || '',
          genres: share.getAttribute('data-genres') || '',
        });
      }
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
        const kpAttr = f.kp_id ? (' data-hs-row-kp="' + escapeHtml(String(f.kp_id)) + '"') : '';
        h += '<div class="hs-result" role="option" tabindex="0"' + kpAttr + '>'
        + (f.kp_id ? ('<img class="hs-result-poster" src="' + escapeHtml(posterUrl(f.kp_id)) + '" alt="">' ) : '<div class="hs-result-poster"></div>')
        + '<div class="hs-result-info"><div class="hs-result-title">' + escapeHtml(f.title) + '</div></div></div>';
      });
    }
    dd.innerHTML = h;
    dd.classList.remove('hidden');
  }

  function openHeaderSearchResult(kp) {
    const k = String(kp || '').replace(/\D/g, '');
    if (!k) return;
    const dd = document.getElementById('header-search-dropdown');
    const input = document.getElementById('header-search-input');
    const clearBtn = document.getElementById('header-search-clear');
    if (dd) dd.classList.add('hidden');
    if (input) input.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    if (!getToken()) {
      window.location.href = buildFilmShareUrl(k);
      return;
    }
    openFilmPageByKp(k);
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
      const poster = cleanPosterUrl(it.poster);
      const typeLabel = it.type === 'series' ? 'Сериал' : 'Фильм';
      const year = it.year && String(it.year) !== 'null' ? String(it.year) : '';
      const inBase = it.already_in_base_film_id;
      const isPublicSearch = !getToken();
      const actionBtn = isPublicSearch
        ? `<a class="hs-result-btn hs-btn-open" href="${buildFilmShareUrl(it.kp_id)}" data-stop-hs-row="1">Открыть</a>`
        : inBase
        ? `<button type="button" class="hs-result-btn hs-btn-open">Открыть</button>`
        : `<button type="button" class="hs-result-btn hs-btn-add" data-hs-add-kp="${escapeHtml(String(it.kp_id))}" data-stop-hs-row="1">＋ Добавить</button>`;
      return `<div class="hs-result" role="option" tabindex="0" data-hs-row-kp="${escapeHtml(String(it.kp_id || ''))}">
        ${poster ? `<img class="hs-result-poster" src="${escapeHtml(poster)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'hs-result-poster',textContent:'🎬'}))">` : '<span class="hs-result-poster">🎬</span>'}
        <div class="hs-result-info">
          <div class="hs-result-title">${escapeHtml(it.title || '')}</div>
          <div class="hs-result-meta"><span>${escapeHtml(typeLabel)}</span>${year ? '<span>·</span><span>' + escapeHtml(year) + '</span>' : ''}${inBase ? '<span>·</span><span class="hs-in-base">в базе</span>' : ''}</div>
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
    const searchPromise = getToken()
      ? api('/api/site/search?q=' + encodeURIComponent(query) + '&type=any')
      : fetch(API_BASE + '/api/public/search?q=' + encodeURIComponent(query.slice(0, 60)) + '&limit=6', { method: 'GET', mode: 'cors' }).then((r) => r.json());
    searchPromise
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

  let _siteSearchSeq = 0;
  function openSiteSearchPage(query, opts) {
    const q = String(query || '').trim();
    if (!q) return;
    try {
      const url = '/search?q=' + encodeURIComponent(q);
      if (!(opts && opts.skipHistory)) history.pushState({ view: 'search', q }, '', url);
    } catch (_) {}
    renderSiteSearchPage({ q });
  }

  function renderSiteSearchPage(initial) {
    const root = getSiteSearchRoot();
    if (!root) return;
    showSiteSearchScreen();
    try { document.title = 'Поиск · Movie Planner'; } catch (_) {}
    const q = String((initial && initial.q) || '').trim();
    root.innerHTML = `
      <section class="site-search-page" id="site-search-page">
        <div class="site-search-hero">
          <h1 class="site-search-title">Поиск</h1>
          <form class="site-search-controls" id="site-search-form">
            <input class="site-search-input" id="site-search-input" type="search" value="${escapeHtml(q)}" placeholder="Название фильма, сериала, имя…" autocomplete="off">
            <button class="site-search-submit" type="submit">Найти</button>
          </form>
          <div class="site-search-filters" id="site-search-filters">
            <button type="button" class="site-search-filter active" data-search-type="any">Все</button>
            <button type="button" class="site-search-filter" data-search-type="film">Фильмы</button>
            <button type="button" class="site-search-filter" data-search-type="series">Сериалы</button>
            <input class="site-search-year" id="site-search-year-from" inputmode="numeric" placeholder="Год от">
            <input class="site-search-year" id="site-search-year-to" inputmode="numeric" placeholder="Год до">
            <input class="site-search-genre" id="site-search-genre" placeholder="Жанр">
          </div>
          <div class="site-search-status" id="site-search-status"></div>
        </div>
        <div class="site-search-results" id="site-search-results"></div>
      </section>`;
    bindSiteSearchPage();
    if (q.length >= 2) runSiteSearchPage();
    const input = document.getElementById('site-search-input');
    if (input) setTimeout(() => input.focus(), 50);
  }

  function bindSiteSearchPage() {
    const form = document.getElementById('site-search-form');
    const filters = document.getElementById('site-search-filters');
    const input = document.getElementById('site-search-input');
    let timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(runSiteSearchPage, 260);
    }
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        runSiteSearchPage();
      });
    }
    if (filters) {
      filters.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-search-type]');
        if (!btn) return;
        filters.querySelectorAll('[data-search-type]').forEach((b) => b.classList.toggle('active', b === btn));
        runSiteSearchPage();
      });
      filters.querySelectorAll('input').forEach((el) => el.addEventListener('input', schedule));
    }
    if (input) input.addEventListener('input', schedule);
  }

  function runSiteSearchPage() {
    const input = document.getElementById('site-search-input');
    const results = document.getElementById('site-search-results');
    const status = document.getElementById('site-search-status');
    const filters = document.getElementById('site-search-filters');
    if (!input || !results) return;
    const q = input.value.trim();
    if (q.length < 2) {
      results.innerHTML = '';
      if (status) status.textContent = 'Введите не менее 2 символов';
      return;
    }
    const typeBtn = filters && filters.querySelector('[data-search-type].active');
    const type = typeBtn ? typeBtn.getAttribute('data-search-type') : 'any';
    const yearFrom = (document.getElementById('site-search-year-from') || {}).value || '';
    const yearTo = (document.getElementById('site-search-year-to') || {}).value || '';
    const genre = (document.getElementById('site-search-genre') || {}).value || '';
    const seq = ++_siteSearchSeq;
    if (status) status.textContent = 'Ищем…';
    try {
      history.replaceState({ view: 'search', q }, '', '/search?q=' + encodeURIComponent(q));
    } catch (_) {}
    const params = new URLSearchParams({ q: q.slice(0, 80), limit: '36' });
    if (type && type !== 'any') params.set('type', type);
    if (yearFrom) params.set('year_from', yearFrom);
    if (yearTo) params.set('year_to', yearTo);
    if (genre) params.set('genre', genre);
    fetch(getPublicApiBase() + '/api/public/search?' + params.toString(), { method: 'GET', mode: 'cors' })
      .then((r) => r.json())
      .then((data) => {
        if (seq !== _siteSearchSeq) return;
        const items = (data && data.items) || [];
        if (status) status.textContent = items.length ? 'Найдено: ' + items.length : 'Ничего не нашлось';
        results.innerHTML = items.map((it) => {
          const poster = cleanPosterUrl(it.poster);
          const typeLabel = it.type === 'series' ? 'Сериал' : 'Фильм';
          const year = it.year && String(it.year) !== 'null' ? String(it.year) : '';
          const kpAttr = escapeHtml(String(it.kp_id || ''));
          if (getToken()) {
            return `<button type="button" class="site-search-card" data-site-search-kp="${kpAttr}">
            ${poster ? `<img class="site-search-poster" src="${escapeHtml(poster)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'site-search-poster',textContent:'🎬'}))">` : '<span class="site-search-poster">🎬</span>'}
            <span>
              <span class="site-search-card-title">${escapeHtml(it.title || '')}</span>
              <span class="site-search-card-meta"><span>${escapeHtml(typeLabel)}</span>${year ? '<span>·</span><span>' + escapeHtml(year) + '</span>' : ''}</span>
            </span>
          </button>`;
          }
          return `<a class="site-search-card" href="${buildFilmShareUrl(it.kp_id)}">
            ${poster ? `<img class="site-search-poster" src="${escapeHtml(poster)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'site-search-poster',textContent:'🎬'}))">` : '<span class="site-search-poster">🎬</span>'}
            <span>
              <span class="site-search-card-title">${escapeHtml(it.title || '')}</span>
              <span class="site-search-card-meta"><span>${escapeHtml(typeLabel)}</span>${year ? '<span>·</span><span>' + escapeHtml(year) + '</span>' : ''}</span>
            </span>
          </a>`;
        }).join('');
        results.querySelectorAll('[data-site-search-kp]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const kp = btn.getAttribute('data-site-search-kp');
            if (kp) openFilmPageByKp(kp);
          });
        });
      })
      .catch(() => {
        if (seq !== _siteSearchSeq) return;
        if (status) status.textContent = 'Ошибка поиска';
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
          openSiteSearchPage(v);
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
          e.stopPropagation();
          const kp = addBtn.getAttribute('data-hs-add-kp');
          addBtn.disabled = true;
          const prev = addBtn.textContent;
          addBtn.textContent = '…';
          const addPromise = api('/api/site/add-film', { method: 'POST', body: JSON.stringify({ kp_id: kp }) });
          kpAddSync.register(kp, addPromise);
          addPromise
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
        const row = e.target.closest('.hs-result[data-hs-row-kp]');
        if (row && !e.target.closest('[data-hs-add-kp]')) {
          e.preventDefault();
          openHeaderSearchResult(row.getAttribute('data-hs-row-kp'));
          return;
        }
        const openFilm = e.target.closest('[data-hs-open-film]');
        if (openFilm) {
          e.preventDefault();
          e.stopPropagation();
          const rowKp = openFilm.closest('[data-hs-row-kp]');
          if (dd) dd.classList.add('hidden');
          input.value = '';
          if (clearBtn) clearBtn.classList.add('hidden');
          if (rowKp && rowKp.getAttribute('data-hs-row-kp')) {
            openHeaderSearchResult(rowKp.getAttribute('data-hs-row-kp'));
          } else {
            openFilmPageFromLegacyPath(Number(openFilm.getAttribute('data-hs-open-film')));
          }
          return;
        }
        const showAll = e.target.closest('[data-hs-show-all]');
        if (showAll) {
          e.preventDefault();
          const v = input.value.trim();
          if (dd) dd.classList.add('hidden');
          openSiteSearchPage(v);
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
    const kickerEl = document.querySelector('.cabinet-user-kicker');
    const emojiEl = document.getElementById('cabinet-profile-emoji');
    const heroName = document.getElementById('cabinet-user-name');
    const heroAvatar = document.getElementById('cabinet-user-avatar');
    if (!nameEl || !me) return;
    nameEl.textContent = me.name || 'Профиль';
    if (kickerEl) kickerEl.textContent = greetingByHour();
    if (heroName) heroName.textContent = (me.name || 'Профиль') + '!';
    let heroAvatarUrl = me.photo_url || me.avatar_url || '';
    if (!heroAvatarUrl && me.is_group_profile && me.room_emoji && (/^https?:\/\//i.test(me.room_emoji) || String(me.room_emoji).startsWith('/api/'))) {
      heroAvatarUrl = me.room_emoji;
    }
    if (!heroAvatarUrl && me.is_personal !== false && me.chat_id) {
      heroAvatarUrl = API_BASE + '/api/avatar/' + encodeURIComponent(String(me.chat_id)) + '.jpg';
    }
    setAvatarEl(heroAvatar, heroAvatarUrl, me.name);
    if (emojiEl) {
      const em = (me.room_emoji != null && String(me.room_emoji).trim() !== '') ? me.room_emoji : '';
      emojiEl.textContent = em;
    }
    _cabinetMeCache = me;
    refreshGroupSuggestions(me);
    updateGroupContextFab();
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
        const typeLabel = groupKindLabel(p).toLowerCase();
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
      }).join('');

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
          if (o) o.addEventListener('click', () => openFilmNav(f.kp_id, f.film_id));
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
        ? '<button type="button" class="btn btn-small btn-primary" data-wtw-open-kp="' + escapeHtml(String(f.kp_id || '')) + '" data-wtw-open-film="' + escapeHtml(filmId) + '">Открыть</button>'
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
        root.querySelectorAll('[data-wtw-open-film],[data-wtw-open-kp]').forEach((btn) => {
          btn.addEventListener('click', () => {
            openFilmNav(btn.getAttribute('data-wtw-open-kp'), btn.getAttribute('data-wtw-open-film'));
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

  /** Копирование Bearer после проверки на сервере (GET /api/site/api-access-token). */
  function wireApiAccessCopy(copyBtn, hintEl, baseEl) {
    if (!copyBtn) return;
    const tok = getToken();
    if (!tok) {
      copyBtn.disabled = true;
      if (hintEl) hintEl.textContent = 'Войдите в кабинет — токен доступен после входа.';
      return;
    }
    copyBtn.disabled = false;
    if (baseEl) baseEl.textContent = getPublicApiBase();
    copyBtn.addEventListener('click', () => {
      fetch(API_BASE + '/api/site/api-access-token', {
        headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' },
      })
        .then((r) => r.json().catch(() => ({})))
        .then((j) => {
          if (!j || !j.success || !j.token) {
            if (hintEl) hintEl.textContent = (j && j.error) ? String(j.error) : 'Не удалось получить токен. Обновите страницу.';
            return;
          }
          if (baseEl && j.api_base_url) baseEl.textContent = j.api_base_url;
          return copyToClipboard(j.token)
            .then(() => { showToast('Токен скопирован'); })
            .catch(() => { alert('Не удалось скопировать'); });
        })
        .catch(() => { alert('Ошибка сети'); });
    });
  }

  function renderDeveloperSection() {
    const root = document.getElementById('developer-content');
    if (!root) return;
    root.innerHTML = `
      <div class="settings-block" id="developer-api-token-block">
        <div class="header-dropdown-title" style="margin-top:0">Ваш API-ключ</div>
        <p class="cabinet-hint" style="margin-bottom:10px;line-height:1.45">
          Это секрет доступа к вашему аккаунту в Movie Planner. В Zapier, Cursor, curl или MCP укажите заголовок
          <code style="font-size:12px">Authorization: Bearer …</code>
          и базовый URL ниже (часто совпадает с адресом API в настройках ИИ).
        </p>
        <p class="muted small" style="margin-bottom:8px">Базовый URL API: <code id="developer-api-base" style="font-size:12px"></code></p>
        <div class="settings-block settings-list" style="margin-top:0;padding-top:0;border:none">
          <button type="button" class="settings-row" id="developer-copy-api-token">🔑 Скопировать API-ключ</button>
          <a href="${API_BASE}/developer" class="settings-row" rel="noopener">Документация, OpenAPI и OAuth</a>
          <a href="${API_BASE}/integration" class="settings-row" rel="noopener">Запасная страница токена</a>
        </div>
        <p class="muted small" id="developer-api-token-hint" style="margin-top:8px"></p>
      </div>
      <div class="settings-block">
        <div class="header-dropdown-title" style="margin-top:0">Проверка</div>
        <p class="muted small" style="margin-bottom:0">
          Без ключа: <code style="font-size:11px">GET …/v1/capabilities</code> → 200.
          С ключом: <code style="font-size:11px">GET …/v1/me</code>.
        </p>
      </div>`;
    wireApiAccessCopy(
      document.getElementById('developer-copy-api-token'),
      document.getElementById('developer-api-token-hint'),
      document.getElementById('developer-api-base'),
    );
  }

  function renderSettingsSection() {
    const root = document.getElementById('settings-content');
    if (!root) return;
    root.innerHTML = '<div class="cabinet-hint">Загружаем…</div>';
    api('/api/miniapp/profile').then((d) => {
      const u = d && d.user;
      const sub = d && d.subscription;
      const name = (u && (u.first_name || u.username)) ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.username : 'Профиль';
      const sessions = getSessions();
      const activeId = getActiveChatId();
      const sessionsHtml = sessions.length ? sessions.map((s) => {
        const isActive = String(s.chat_id) === String(activeId);
        const typeLabel = s.is_personal ? 'личный' : 'группа';
        return `<div class="settings-account-row ${isActive ? 'is-active' : ''}" data-settings-account="${escapeHtml(String(s.chat_id))}">
          <div>
            <b>${escapeHtml(s.name || 'Кабинет')}</b>
            <span>${escapeHtml(typeLabel)}${isActive ? ' · активен' : ''}</span>
          </div>
          <button type="button" class="settings-account-remove" data-settings-remove-account="${escapeHtml(String(s.chat_id))}" aria-label="Убрать вход">×</button>
        </div>`;
      }).join('') : '<p class="cabinet-hint">Активных входов нет.</p>';
      const avatarUrl = u && u.photo_url ? u.photo_url : '';
      root.innerHTML = `
        <div class="settings-block profile-settings-card">
        <div class="profile-settings-head">
          <div class="profile-settings-avatar" id="settings-profile-avatar"></div>
          <div>
            <div class="header-dropdown-title" style="margin-top:0">Настройки профиля</div>
            <p class="profile-settings-name-preview"><b>${escapeHtml(name || 'Профиль')}</b>${u && u.email ? ' · ' + escapeHtml(u.email) : ''}</p>
            ${sub ? '<p class="muted small">💎 Подписка активна</p>' : '<p class="muted small">Бесплатный режим</p>'}
          </div>
        </div>
        <form class="profile-settings-form" id="profile-settings-form">
          <label>Имя в кабинете<input type="text" id="profile-settings-name" value="${escapeHtml(name || '')}" maxlength="80" autocomplete="name"></label>
          <button type="submit" class="btn btn-primary">Сохранить имя</button>
        </form>
        <form class="profile-settings-avatar-form" id="profile-settings-avatar-form">
          <label class="profile-settings-file">Фото профиля<input type="file" id="profile-settings-photo" accept="image/png,image/jpeg"></label>
          <button type="submit" class="btn btn-secondary">Сохранить фото</button>
          ${avatarUrl ? '<button type="button" class="btn btn-secondary" id="profile-settings-avatar-delete">Удалить фото</button>' : ''}
        </form>
        <label class="profile-searchable-toggle">
          <input type="checkbox" id="profile-settings-searchable" ${!u || u.profile_searchable !== false ? 'checked' : ''}>
          <span>
            <b>Профиль можно найти в поиске по людям</b>
            <small>Если выключить, вас не найдут по имени, почте или Telegram.</small>
          </span>
        </label>
        <p class="profile-settings-status" id="profile-settings-status"></p>
        </div>
        <div class="settings-block">
        <div class="header-dropdown-title" style="margin-top:0">Аккаунты и вход</div>
        <div class="settings-connectors">
          <button type="button" class="settings-row" data-profile-link="google">🔗 Привязать Google</button>
          <button type="button" class="settings-row" data-profile-link="yandex">🔗 Привязать Яндекс</button>
          <button type="button" class="settings-row" id="profile-settings-add-login">+ Добавить вход</button>
        </div>
        <div class="settings-accounts-list">${sessionsHtml}</div>
        </div>
        <div class="settings-block profile-import-card">
        <div class="header-dropdown-title" style="margin-top:0">Импорт оценок</div>
        <p class="cabinet-hint">За перенос оценок с Кинопоиска начислим 2000 монеток. Монетки тратятся на подборы, Shazam-поиск, билеты и отслеживание премьер.</p>
        <form class="profile-import-form" id="profile-import-form">
          <input type="text" id="profile-import-kp" placeholder="Ссылка на профиль Кинопоиска или ID" autocomplete="off">
          <button type="submit" class="btn btn-primary">Импортировать оценки</button>
        </form>
        <div id="profile-import-progress" class="profile-import-progress hidden"></div>
        <p class="profile-settings-status" id="profile-import-status"></p>
        </div>
        <div class="settings-block settings-list">
        <button type="button" class="settings-row" data-sets-go="home-layout">🏠 Настроить главную</button>
        <button type="button" class="settings-row" data-sets-go="integrations">🔌 Интеграции</button>
        <button type="button" class="settings-row" data-sets-go="groups">Друзья и группы</button>
        <a href="#" class="settings-row" id="settings-app-apk" target="_blank" rel="noopener">Скачать Android-приложение (APK)</a>
        </div>
        <div class="settings-block" id="settings-toggles">Загрузка уведомлений…</div>`;
      setAvatarEl(document.getElementById('settings-profile-avatar'), avatarUrl, name);
      bindProfileSettingsControls(root);
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
          if (g === 'integrations') { showSection('integrations'); }
          if (g === 'tv') { showSection('tv'); if (renderTvSection) renderTvSection(); }
          if (g === 'groups') { showSection('groups'); if (renderGroupsSection) renderGroupsSection(); }
        });
      });
      const baseEl = document.getElementById('settings-api-base');
      const copyBtn = document.getElementById('settings-copy-api-token');
      const hintEl = document.getElementById('settings-api-token-hint');
      if (copyBtn && hintEl && baseEl) wireApiAccessCopy(copyBtn, hintEl, baseEl);
    }).catch(() => { root.innerHTML = '<p class="cabinet-hint">Не удалось загрузить настройки. Попробуйте обновить страницу.</p>'; });
  }

  let _profileImportPoll = null;

  function stopProfileImportPoll() {
    if (_profileImportPoll) {
      clearInterval(_profileImportPoll);
      _profileImportPoll = null;
    }
  }

  function kpImportProgressLabel(job) {
    if (!job) return '';
    const imported = Number(job.imported || 0);
    const skipped = Number(job.skipped || 0);
    const processed = Number(job.processed || 0);
    const target = Number(job.target || 0);
    if (job.status === 'running') {
      if (job.phase === 'loading' && processed === 0) return 'Загружаем оценки с Кинопоиска…';
      return 'Обработано ' + processed + ' из ' + target + ' · добавлено ' + imported + ', пропущено ' + skipped;
    }
    if (job.status === 'done') {
      return 'Готово: добавлено ' + imported + (skipped ? ', пропущено ' + skipped + ' (уже в профиле)' : '');
    }
    if (job.status === 'error') return job.error || 'Не удалось завершить импорт';
    return '';
  }

  function renderProfileImportProgress(root, job) {
    const host = root.querySelector('#profile-import-progress');
    const importStatus = root.querySelector('#profile-import-status');
    const btn = root.querySelector('#profile-import-form button[type="submit"]');
    const input = root.querySelector('#profile-import-kp');
    const running = job && job.status === 'running';
    if (btn) {
      btn.disabled = !!running;
      btn.textContent = running ? 'Импорт…' : 'Импортировать оценки';
    }
    if (input) input.disabled = !!running;
    if (!host) return;
    if (!job || !job.status) {
      host.classList.add('hidden');
      host.innerHTML = '';
      if (importStatus && !importStatus.textContent) importStatus.className = 'profile-settings-status';
      return;
    }
    const target = Math.max(1, Number(job.target || 1));
    const processed = Number(job.processed || 0);
    const pct = job.status === 'running' ? Math.min(100, Math.round((processed / target) * 100)) : 100;
    const indeterminate = job.status === 'running' && processed === 0;
    const label = kpImportProgressLabel(job);
    host.classList.remove('hidden');
    host.innerHTML =
      '<div class="profile-import-progress-track">' +
      '<div class="profile-import-progress-fill' + (indeterminate ? ' indeterminate' : '') + '" style="width:' + (indeterminate ? '35' : pct) + '%"></div>' +
      '</div>' +
      (label ? '<p class="profile-import-progress-label' + (job.status === 'error' ? ' error' : job.status === 'done' ? ' success' : '') + '">' + escapeHtml(label) + '</p>' : '');
    if (importStatus) {
      importStatus.textContent = '';
      importStatus.className = 'profile-settings-status';
    }
  }

  function pollProfileImportProgress(root) {
    api('/api/miniapp/ratings/import-status').then((s) => {
      if (!s || !s.success) return;
      const job = s.job || null;
      renderProfileImportProgress(root, job);
      if (job && job.status === 'running') return;
      stopProfileImportPoll();
    }).catch(() => {});
  }

  function startProfileImportPoll(root) {
    stopProfileImportPoll();
    pollProfileImportProgress(root);
    _profileImportPoll = setInterval(() => pollProfileImportProgress(root), 1200);
  }

  function resumeProfileImportPollIfNeeded(root) {
    api('/api/miniapp/ratings/import-status').then((s) => {
      if (!s || !s.success || !s.job || s.job.status !== 'running') return;
      renderProfileImportProgress(root, s.job);
      startProfileImportPoll(root);
    }).catch(() => {});
  }

  function bindProfileSettingsControls(root) {
    const status = root.querySelector('#profile-settings-status');
    const setStatus = (msg, ok) => {
      if (!status) return;
      status.textContent = msg || '';
      status.className = 'profile-settings-status ' + (ok ? 'success' : 'error');
    };
    const form = root.querySelector('#profile-settings-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = root.querySelector('#profile-settings-name');
        const value = input ? input.value.trim() : '';
        api('/api/miniapp/profile', { method: 'POST', body: JSON.stringify({ display_name: value }) })
          .then((r) => {
            if (!r || !r.success) { setStatus('Не удалось сохранить имя', false); return; }
            setStatus('Имя сохранено', true);
            loadMeAndShowCabinet();
          })
          .catch(() => setStatus('Ошибка сети', false));
      });
    }
    const avatarForm = root.querySelector('#profile-settings-avatar-form');
    if (avatarForm) {
      avatarForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const fileInput = root.querySelector('#profile-settings-photo');
        const file = fileInput && fileInput.files ? fileInput.files[0] : null;
        if (!file) { setStatus('Выберите фото', false); return; }
        const fd = new FormData();
        fd.append('photo', file);
        fetch(API_BASE + '/api/miniapp/avatar/upload', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + getToken() },
          body: fd,
        })
          .then((r) => r.json().catch(() => ({})))
          .then((r) => {
            if (!r || !r.success) { setStatus('Не удалось сохранить фото', false); return; }
            setStatus('Фото сохранено', true);
            loadMeAndShowCabinet();
          })
          .catch(() => setStatus('Ошибка сети', false));
      });
    }
    const deleteAvatar = root.querySelector('#profile-settings-avatar-delete');
    if (deleteAvatar) {
      deleteAvatar.addEventListener('click', () => {
        fetch(API_BASE + '/api/miniapp/avatar', {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + getToken() },
        })
          .then((r) => r.json().catch(() => ({})))
          .then((r) => {
            if (!r || !r.success) { setStatus('Не удалось удалить фото', false); return; }
            setStatus('Фото удалено', true);
            loadMeAndShowCabinet();
          })
          .catch(() => setStatus('Ошибка сети', false));
      });
    }
    const searchable = root.querySelector('#profile-settings-searchable');
    if (searchable) {
      searchable.addEventListener('change', () => {
        api('/api/miniapp/profile', {
          method: 'POST',
          body: JSON.stringify({ profile_searchable: !!searchable.checked }),
        })
          .then((r) => {
            if (!r || !r.success) { setStatus('Не удалось сохранить настройку поиска', false); return; }
            setStatus(searchable.checked ? 'Профиль виден в поиске' : 'Профиль скрыт из поиска', true);
          })
          .catch(() => setStatus('Ошибка сети', false));
      });
    }
    root.querySelectorAll('[data-profile-link]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const provider = btn.getAttribute('data-profile-link');
        const t = getToken();
        if (!t || !provider) return;
        window.location.href = API_BASE + '/api/site/oauth/' + provider + '/start?accept=1&link_token=' + encodeURIComponent(t);
      });
    });
    const addLogin = root.querySelector('#profile-settings-add-login');
    if (addLogin) {
      addLogin.addEventListener('click', () => {
        document.getElementById('login-modal')?.classList.remove('hidden');
      });
    }
    root.querySelectorAll('[data-settings-account]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-settings-remove-account]')) return;
        const chatId = el.getAttribute('data-settings-account');
        if (!chatId) return;
        setActiveChatId(chatId);
        loadMeAndShowCabinet();
      });
    });
    root.querySelectorAll('[data-settings-remove-account]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chatId = btn.getAttribute('data-settings-remove-account');
        const next = getSessions().filter((s) => String(s.chat_id) !== String(chatId));
        const wasActive = String(getActiveChatId()) === String(chatId);
        setSessions(next);
        if (!next.length) {
          setActiveChatId(null);
          renderHeader(null);
          showScreen('landing');
          return;
        }
        if (wasActive) setActiveChatId(next[0].chat_id);
        loadMeAndShowCabinet();
      });
    });
    const importForm = root.querySelector('#profile-import-form');
    resumeProfileImportPollIfNeeded(root);
    if (importForm) {
      importForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = root.querySelector('#profile-import-kp');
        const importStatus = root.querySelector('#profile-import-status');
        const raw = input ? input.value.trim() : '';
        if (!raw) {
          if (importStatus) {
            importStatus.textContent = 'Вставьте ссылку или ID профиля.';
            importStatus.className = 'profile-settings-status error';
          }
          return;
        }
        renderProfileImportProgress(root, {
          status: 'running',
          target: 1500,
          processed: 0,
          imported: 0,
          skipped: 0,
          phase: 'starting',
        });
        api('/api/miniapp/ratings/import-kinopoisk', {
          method: 'POST',
          body: JSON.stringify({ kp_input: raw, max_count: 1500 }),
        }).then((r) => {
          if (!r || !r.success) {
            renderProfileImportProgress(root, null);
            const btn = importForm.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = false; btn.textContent = 'Импортировать оценки'; }
            if (importStatus) {
              importStatus.textContent = (r && (r.message || r.error)) || 'Не удалось запустить импорт';
              importStatus.className = 'profile-settings-status error';
            }
            return;
          }
          startProfileImportPoll(root);
        }).catch(() => {
          renderProfileImportProgress(root, null);
          const btn = importForm.querySelector('button[type="submit"]');
          if (btn) { btn.disabled = false; btn.textContent = 'Импортировать оценки'; }
          if (importStatus) {
            importStatus.textContent = 'Ошибка сети';
            importStatus.className = 'profile-settings-status error';
          }
        });
      });
    }
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

  function openRoomAccessModal(chatId) {
    const modal = document.getElementById('room-access-modal');
    const body = document.getElementById('room-access-body');
    if (!modal || !body) return;
    body.innerHTML = '<div class="cabinet-hint">Загружаем…</div>';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (!modal._mpRaCloseBound) {
      modal._mpRaCloseBound = true;
      modal.querySelectorAll('[data-action="close-room-access-modal"]').forEach((c) => {
        c.addEventListener('click', (ev) => {
          ev.preventDefault();
          modal.classList.add('hidden');
          modal.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        });
      });
    }

    const mid = encodeURIComponent(chatId);
    Promise.all([
      api('/api/site/rooms/' + mid + '/members'),
      api('/api/site/rooms/' + mid + '/join-requests').catch(() => ({ success: false, items: [] })),
    ]).then(([d, jr]) => {
      if (!d || !d.success) {
        body.innerHTML = '<p class="cabinet-hint">' + escapeHtml((d && d.error) || 'Нет доступа') + '</p>';
        return;
      }
      const room = d.room || {};
      const gk = room.group_kind || 'friends';
      const isVirt = d.is_virtual;
      const canManage = d.can_manage_members;
      const iAmOwner = d.i_am_owner;
      if (!isVirt) {
        body.innerHTML = '<p class="cabinet-hint">Для Telegram-группы доступ и приглашения задаются в Telegram.</p>';
        return;
      }
      if (!canManage) {
        body.innerHTML = '<p class="cabinet-hint">Настройки доступны владельцу и администраторам.</p>';
        return;
      }
      if (gk === 'friends') {
        body.innerHTML = '<p class="cabinet-hint">Для группы друзей поиск и отдельные заявки здесь не настраиваются.</p>';
        return;
      }

      const members = d.members || [];
      const modes = [
        ['any_admin', 'Любой админ'],
        ['majority_admins', 'Большинство'],
        ['specific_admins', 'Конкретные админы'],
        ['creator_only', 'Создатель'],
        ['no_approval', 'Без согласования'],
      ];
      const curMode = room.join_approval_mode || 'any_admin';
      const discover = !!room.is_discoverable;
      const approverIds = (room.join_approver_user_ids || []).map(Number);

      const pending = (jr && jr.success && jr.items)
        ? jr.items.filter((x) => x && x.status === 'pending')
        : [];

      let approverHtml = '';
      if (curMode === 'specific_admins') {
        if (iAmOwner) {
          const admins = members.filter((m) => m.role === 'admin' && !m.is_owner && m.user_id);
          if (!admins.length) {
            approverHtml = '<p class="cabinet-hint" style="margin-top:10px">Нет других админов — назначьте их в «Участники», затем отметьте одобряющих.</p>';
          } else {
            approverHtml = admins.map((m) => {
              const uid = Number(m.user_id);
              const checked = approverIds.indexOf(uid) >= 0;
              return `<label class="room-member-row" style="cursor:pointer;align-items:center">
                <input type="checkbox" class="room-access-approver-cb" data-uid="${uid}" ${checked ? 'checked' : ''} style="margin-right:10px">
                <span class="room-member-name">${escapeHtml(m.name || '')}<span class="muted small"> · админ</span></span>
              </label>`;
            }).join('');
          }
        } else {
          approverHtml = '<p class="cabinet-hint" style="margin-top:10px">Список одобряющих настраивает создатель.</p>';
        }
      }

      const requestsHtml = pending.length
        ? (`<div class="create-room-label" style="margin-top:16px">Заявки (${pending.length})</div>` + pending.map((r) => `
          <div class="room-member-row" style="flex-direction:column;align-items:flex-start">
            <span class="room-member-name">Пользователь #${Number(r.applicant_user_id)}</span>
            ${r.message ? `<span class="muted small">${escapeHtml(r.message)}</span>` : ''}
            <div style="display:flex;gap:8px;margin-top:8px">
              <button type="button" class="btn btn-small btn-primary" data-jrid="${Number(r.id)}" data-jdec="approve">Одобрить</button>
              <button type="button" class="btn btn-small btn-secondary" data-jrid="${Number(r.id)}" data-jdec="reject">Отклонить</button>
            </div>
          </div>`).join(''))
        : '<p class="cabinet-hint" style="margin-top:14px">Нет активных заявок.</p>';

      body.innerHTML = `
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin-top:4px;font-size:14px">
          <input type="checkbox" id="room-access-discover" ${discover ? 'checked' : ''} style="margin-top:3px">
          <span>Показывать группу в поиске</span>
        </label>
        <div class="create-room-label" style="margin-top:14px">Режим заявок</div>
        <div class="create-room-approval-row" id="room-access-mode-row">
          ${modes.map(([id, label]) => `<button type="button" class="create-room-approval-btn ${curMode === id ? 'active' : ''}" data-rmode="${id}">${escapeHtml(label)}</button>`).join('')}
        </div>
        ${curMode === 'specific_admins' ? (`<div class="create-room-label" style="margin-top:12px">Кто одобряет</div>${approverHtml}`) : ''}
        ${requestsHtml}
      `;

      const disEl = document.getElementById('room-access-discover');
      if (disEl) {
        disEl.addEventListener('change', () => {
          api('/api/site/rooms/' + mid + '/settings', {
            method: 'PATCH',
            body: JSON.stringify({ is_discoverable: !!disEl.checked }),
          }).then((r) => {
            if (r && r.success) showToast('Сохранено');
            else { disEl.checked = !disEl.checked; alert((r && r.error) || 'Ошибка'); }
          });
        });
      }

      body.querySelectorAll('[data-rmode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-rmode');
          if (!mode) return;
          api('/api/site/rooms/' + mid + '/settings', {
            method: 'PATCH',
            body: JSON.stringify({ join_approval_mode: mode }),
          }).then((r) => {
            if (r && r.success) { showToast('Сохранено'); openRoomAccessModal(chatId); }
            else alert((r && r.error) || 'Ошибка');
          });
        });
      });

      body.querySelectorAll('.room-access-approver-cb').forEach((cb) => {
        cb.addEventListener('change', () => {
          const picks = [...body.querySelectorAll('.room-access-approver-cb:checked')].map((x) => Number(x.getAttribute('data-uid')));
          api('/api/site/rooms/' + mid + '/settings', {
            method: 'PATCH',
            body: JSON.stringify({ join_approver_user_ids: picks }),
          }).then((r) => {
            if (r && r.success) showToast('Сохранено');
            else { cb.checked = !cb.checked; alert((r && r.error) || 'Ошибка'); }
          });
        });
      });

      body.querySelectorAll('[data-jrid]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rid = btn.getAttribute('data-jrid');
          const dec = btn.getAttribute('data-jdec');
          api('/api/site/rooms/' + mid + '/join-requests/' + rid + '/decision', {
            method: 'POST',
            body: JSON.stringify({ decision: dec }),
          }).then((r) => {
            if (r && r.success) {
              showToast(dec === 'approve' ? 'Заявка обработана' : 'Отклонено');
              openRoomAccessModal(chatId);
            } else alert((r && r.error) || 'Ошибка');
          });
        });
      });
    });
  }

  // ── Friends JS ─────────────────────────────────────────────────────────────

  function _renderFriendCard(f) {
    const letter = (f.name || '?')[0].toUpperCase();
    return `<button type="button" class="soc-friend-card" data-friend-profile="${Number(f.user_id)}">
      <div class="soc-friend-avatar">${letter}</div>
      <div style="flex:1">
        <div class="soc-friend-name">${escapeHtml(f.name)}</div>
        <div class="soc-friend-meta">${f.ratings_count || 0} оценок · ${f.coins || 0} монет · ${f.achievements_count || 0} ачивок</div>
      </div>
    </button>`;
  }

  function _renderRequestRow(r, onAccept, onDecline) {
    const letter = (r.name || '?')[0].toUpperCase();
    const row = document.createElement('div');
    row.className = 'soc-request-row';
    row.innerHTML = `
      <div class="soc-friend-avatar">${escapeHtml(letter)}</div>
      <div style="flex:1"><strong>${escapeHtml(r.name)}</strong></div>
      <button type="button" class="btn btn-primary" style="padding:7px 12px;font-size:13px">Принять</button>
      <button type="button" class="btn btn-ghost" style="padding:7px 10px;font-size:13px">✕</button>
    `;
    row.querySelectorAll('.btn-primary')[0].addEventListener('click', () => onAccept(r.user_id));
    row.querySelectorAll('.btn-ghost')[0].addEventListener('click', () => onDecline(r.user_id));
    return row;
  }

  async function _loadFriendsPane() {
    let friends = [], requests = { incoming: [], outgoing: [] };
    try {
      const [fr, rq] = await Promise.all([
        api('/api/friends'),
        api('/api/friends/requests'),
      ]);
      friends = (fr && fr.friends) || [];
      requests = rq || { incoming: [], outgoing: [] };
    } catch (e) { /* graceful */ }

    const pending = (requests.incoming || []);
    const badgeEl = document.getElementById('soc-tab-badge-count');
    if (badgeEl) {
      badgeEl.textContent = pending.length;
      badgeEl.classList.toggle('hidden', pending.length === 0);
    }

    // Requests
    const reqWrap = document.getElementById('soc-friend-requests');
    const reqList = document.getElementById('soc-friend-requests-list');
    if (reqWrap && reqList) {
      if (pending.length) {
        reqWrap.classList.remove('hidden');
        reqList.innerHTML = '';
        pending.forEach((r) => {
          reqList.appendChild(_renderRequestRow(r,
            async (uid) => {
              try { await api('/api/friends/accept', { method: 'POST', body: JSON.stringify({ from_user_id: uid }) }); _loadFriendsPane(); }
              catch (e) { alert((e && e.message) || 'Ошибка'); }
            },
            async (uid) => {
              try { await api('/api/friends/decline', { method: 'POST', body: JSON.stringify({ from_user_id: uid }) }); _loadFriendsPane(); }
              catch (e) { alert((e && e.message) || 'Ошибка'); }
            }
          ));
        });
      } else {
        reqWrap.classList.add('hidden');
      }
    }

    // Friends list
    const friendsListEl = document.getElementById('soc-friends-list');
    const friendsLabelEl = document.getElementById('soc-friends-label');
    const friendsEmptyEl = document.getElementById('soc-friends-empty');
    if (friendsListEl) {
      if (friends.length) {
        friendsListEl.innerHTML = friends.map(_renderFriendCard).join('');
        friendsListEl.querySelectorAll('[data-friend-profile]').forEach((btn) => {
          btn.addEventListener('click', () => _openFriendProfile(Number(btn.getAttribute('data-friend-profile'))));
        });
        if (friendsLabelEl) friendsLabelEl.style.display = '';
        if (friendsEmptyEl) friendsEmptyEl.classList.add('hidden');
      } else {
        friendsListEl.innerHTML = '';
        if (friendsLabelEl) friendsLabelEl.style.display = 'none';
        if (friendsEmptyEl) friendsEmptyEl.classList.remove('hidden');
      }
    }

    // Action buttons
    const actionsEl = document.getElementById('soc-friends-actions');
    if (actionsEl && friends.length > 0) {
      actionsEl.innerHTML = `
        <button type="button" class="btn btn-secondary" id="soc-activity-btn">Лента активности</button>
        <button type="button" class="btn btn-secondary" id="soc-lb-btn">🏆 Рейтинг друзей</button>
      `;
      actionsEl.querySelector('#soc-activity-btn')?.addEventListener('click', _openFriendsActivity);
      actionsEl.querySelector('#soc-lb-btn')?.addEventListener('click', _openFriendsLeaderboard);
    }
  }

  async function _runFriendSearch() {
    const q = (document.getElementById('soc-search-input')?.value || '').trim();
    const out = document.getElementById('soc-search-results');
    if (!q || q.length < 2 || !out) return;
    out.classList.remove('hidden');
    out.innerHTML = '<div class="soc-search-state">Ищем…</div>';
    try {
      const data = await apiText(`/api/friends/search?q=${encodeURIComponent(q)}`);
      if (!data || data.success === false) {
        out.innerHTML = '<div class="soc-search-state error">' + escapeHtml((data && data.error) || 'Не удалось выполнить поиск') + '</div>';
        return;
      }
      const users = (data && data.users) || [];
      if (!users.length) {
        out.innerHTML = '<div class="soc-search-state">Никого не найдено</div>';
        return;
      }
      out.innerHTML = users.map((u) => `
        <div class="soc-search-user-row" data-uid="${Number(u.user_id)}">
          <div class="soc-friend-avatar">${escapeHtml((u.name || '?')[0].toUpperCase())}</div>
          <div class="soc-search-user-main"><strong>${escapeHtml(u.name)}</strong></div>
          ${u.friendship_status === 'accepted' || u.friendship_status === 'friends'
            ? '<span class="soc-search-status">Друзья</span>'
            : u.friendship_status === 'pending'
            ? '<span class="soc-search-status">Запрос отправлен</span>'
            : `<button type="button" class="soc-search-add-btn soc-add-friend-btn" data-uid="${Number(u.user_id)}">Добавить</button>`
          }
        </div>`).join('');
      out.querySelectorAll('.soc-add-friend-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const uid = Number(btn.getAttribute('data-uid'));
          try {
            await api('/api/friends/request', { method: 'POST', body: JSON.stringify({ to_user_id: uid }) });
            btn.textContent = 'Запрос отправлен';
            btn.disabled = true;
          } catch (e) { showToast((e && e.message) || 'Ошибка', { type: 'error' }); }
        });
      });
    } catch (e) {
      out.innerHTML = '<div class="soc-search-state error">' + escapeHtml((e && e.message) || 'Ошибка сети') + '</div>';
    }
  }

  function _friendModal(html) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `<div class="friend-modal-panel" style="background:var(--surface,#fff);border-radius:14px;padding:24px;max-width:640px;width:100%;max-height:80vh;overflow:auto">
      ${html}
      <button type="button" style="margin-top:16px;width:100%;padding:12px;border-radius:8px;border:1px solid #ddd;background:none;cursor:pointer">Закрыть</button>
    </div>`;
    modal.querySelector('button').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    return modal;
  }

  async function _openFriendTaste(userId) {
    const data = await api('/api/friends/' + encodeURIComponent(userId) + '/taste');
    const items = (data && data.items) || [];
    _friendModal(`
      <div style="font-size:17px;font-weight:700;margin-bottom:12px">Совпадение вкусов${data && data.taste_match != null ? ' · ' + data.taste_match + '%' : ''}</div>
      ${items.length ? items.map((it) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:10px;border:1px solid #eee;border-radius:10px;margin-bottom:6px">
          <span>${escapeHtml(it.film_title || 'Фильм')}</span>
          <strong style="color:var(--accent,#ff2d7b)">${it.my_rating}/10 · ${it.friend_rating}/10</strong>
        </div>`).join('') : '<div class="cabinet-hint">Пока нет фильмов, которые вы оба оценили</div>'}
    `);
  }

  function _wtPosterUrl(kp) {
    return 'https://st.kp.yandex.net/images/film_iphone/iphone360_' + encodeURIComponent(String(kp)) + '.jpg';
  }

  function _wtFilmTileHtml(f, mode) {
    const kp = f && f.kp_id;
    if (!kp) return '';
    const title = escapeHtml(f.title || 'Фильм');
    const year = f.year ? '<div style="font-size:11px;color:#888">' + escapeHtml(String(f.year)) + '</div>' : '';
    let posterAction = '';
    if (mode === 'add' && !f.in_my_library) {
      posterAction = '<button type="button" data-wt-add="' + kp + '" style="position:absolute;right:6px;bottom:6px;width:28px;height:28px;border-radius:50%;border:0;background:var(--accent,#ff2d7b);color:#fff;font-weight:800;cursor:pointer">+</button>';
    } else if (mode === 'add' && f.in_my_library) {
      posterAction = '<span style="position:absolute;right:6px;bottom:6px;width:28px;height:28px;border-radius:50%;background:#22c55e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px">✓</span>';
    }
    const suggestBelow = mode === 'suggest'
      ? '<button type="button" data-wt-suggest="' + kp + '" style="display:block;width:100%;margin-top:6px;padding:7px 8px;border:1px solid #ddd;border-radius:10px;background:#fafafa;font-size:11px;font-weight:700;cursor:pointer">Предложить</button>'
      : '';
    return '<div style="flex:0 0 108px;width:108px">' +
      '<button type="button" data-wt-open="' + kp + '" style="width:100%;border:0;background:none;padding:0;cursor:pointer;text-align:left">' +
      '<div style="position:relative;width:108px;height:162px;border-radius:10px;overflow:hidden;background:#eee">' +
      '<img src="' + escapeHtml(_wtPosterUrl(kp)) + '" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy">' +
      posterAction +
      '</div>' +
      '<div style="font-size:12px;font-weight:700;line-height:1.25;color:inherit;margin-top:6px">' + title + '</div>' +
      year +
      '</button>' +
      suggestBelow +
      '</div>';
  }
  function _wtPosterRail(films, mode) {
    if (!films || !films.length) return '';
    return '<div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;margin-bottom:4px">' +
      films.map((f) => _wtFilmTileHtml(f, mode)).join('') +
      '</div>';
  }

  async function _openMutualWatchlist(userId) {
    let data;
    try {
      data = await api('/api/friends/watch-together?with_user_id=' + encodeURIComponent(userId));
    } catch (e) {
      showToast('Не удалось загрузить подборку', { type: 'error' });
      return;
    }
    if (!data || data.success === false) {
      showToast(data && data.error === 'not_friends' ? 'Сначала добавьте в друзья' : 'Не удалось загрузить подборку', { type: 'error' });
      return;
    }
    const friendName = escapeHtml((data.friend_name || 'друга').trim());
    const mutual = data.mutual_films || [];
    const fromFriend = data.from_friend_library || [];
    const fromMe = data.from_my_library || [];
    const fillActions = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">' +
      '<button type="button" class="btn btn-secondary" data-wt-go-search>🔍 Поиск</button>' +
      '<button type="button" class="btn btn-secondary" data-wt-go-premieres>🎟 Премьеры</button>' +
      '</div>';
    const modal = _friendModal(`
      <div style="font-size:17px;font-weight:700;margin-bottom:14px">Смотрим вместе</div>
      <div style="font-weight:700;margin-bottom:8px">Вместе в базе</div>
      ${mutual.length ? _wtPosterRail(mutual, 'open') : fillActions}
      <div style="font-weight:700;margin:16px 0 8px">Из базы ${friendName}</div>
      ${fromFriend.length ? _wtPosterRail(fromFriend, 'add') : ''}
      <div style="font-weight:700;margin:16px 0 8px">Предложить из вашей базы</div>
      ${fromMe.length ? _wtPosterRail(fromMe, 'suggest') : ''}
    `);
    const box = modal.querySelector('.friend-modal-panel');
    if (!box) return;
    box.querySelectorAll('[data-wt-open]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (e.target.closest('[data-wt-add],[data-wt-suggest]')) return;
        const kp = btn.getAttribute('data-wt-open');
        if (kp) openFilmPageByKp(kp);
      });
    });
    box.querySelectorAll('[data-wt-add]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const kp = Number(btn.getAttribute('data-wt-add'));
        if (!kp) return;
        btn.disabled = true;
        try {
          await api('/api/site/add-film', { method: 'POST', body: JSON.stringify({ kp_id: kp }) });
          btn.textContent = '✓';
          btn.style.background = '#22c55e';
          showToast('Фильм добавлен', { type: 'success' });
        } catch (err) {
          btn.disabled = false;
          showToast('Не удалось добавить', { type: 'error' });
        }
      });
    });
    box.querySelectorAll('[data-wt-suggest]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const kp = Number(btn.getAttribute('data-wt-suggest'));
        if (!kp || btn.disabled) return;
        btn.disabled = true;
        try {
          await api('/api/friends/recommend', { method: 'POST', body: JSON.stringify({ to_user_id: userId, kp_id: kp }) });
          btn.textContent = '✓';
          showToast('Приглашение отправлено', { type: 'success' });
        } catch (err) {
          btn.disabled = false;
          showToast('Не удалось отправить', { type: 'error' });
        }
      });
    });
  }

  function _friendAchDisplayName(a) {
    const id = String((a && (a.id || a.achievement_id)) || '').trim();
    const raw = (a && a.name) || '';
    return raw && raw !== id ? raw : 'Ачивка';
  }
  function _friendAchCircleHtml(a) {
    const name = _friendAchDisplayName(a);
    const icon = (a && a.icon) || '🏅';
    const cap = (name || '').split(' ')[0] || '…';
    return `<button type="button" title="${escapeHtml(name)}" style="width:52px;height:52px;border-radius:50%;border:2px solid var(--accent,#ff2d7b);background:#fafafa;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;margin:0 6px 8px 0;cursor:default;font-size:22px;line-height:1;vertical-align:top">
      <span aria-hidden="true">${escapeHtml(icon)}</span>
      <span style="font-size:9px;color:#888;margin-top:2px;max-width:48px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(cap)}</span>
    </button>`;
  }

  async function _openFriendProfile(userId) {
    if (!userId) return;
    const data = await api('/api/friends/' + encodeURIComponent(userId) + '/profile');
    if (!data || data.success === false) {
      showToast((data && data.error) || 'Не удалось открыть профиль', { type: 'error' });
      return;
    }
    const ratings = (data.recent_ratings || []).slice(0, 8);
    const achievements = (data.achievements || []).slice(0, 8);
    const modal = _friendModal(`
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div class="soc-friend-avatar">${escapeHtml((data.name || '?')[0].toUpperCase())}</div>
        <div>
          <div style="font-size:18px;font-weight:800">${escapeHtml(data.name || '')}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
        <button type="button" data-friend-ratings style="border:1px solid #eee;border-radius:12px;padding:10px 6px;background:#fafafa;cursor:pointer;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--accent,#ff2d7b)">${data.ratings_count || 0}</div><div style="font-size:11px;color:#888;text-transform:uppercase">оценок</div>
        </button>
        <button type="button" data-friend-unwatched style="border:1px solid #eee;border-radius:12px;padding:10px 6px;background:#fafafa;cursor:pointer;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--accent,#ff2d7b)">${data.unwatched_count != null ? data.unwatched_count : 0}</div><div style="font-size:11px;color:#888;text-transform:uppercase">непросмотр.</div>
        </button>
        <button type="button" data-friend-ach style="border:1px solid #eee;border-radius:12px;padding:10px 6px;background:#fafafa;cursor:pointer;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--accent,#ff2d7b)">${data.achievements_count || 0}</div><div style="font-size:11px;color:#888;text-transform:uppercase">ачивок</div>
        </button>
      </div>
      ${data.taste_match != null ? `<button type="button" class="btn btn-secondary" data-friend-taste style="width:100%;margin-bottom:8px">${data.taste_match}% совпадение вкусов</button>` : ''}
      <button type="button" class="btn btn-secondary" data-friend-mutual style="width:100%;margin-bottom:14px">🎬 Смотрим вместе</button>
      ${ratings.length ? '<div style="font-weight:700;margin-bottom:8px">Последние оценки</div>' + ratings.map((r) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:9px;border:1px solid #eee;border-radius:10px;margin-bottom:6px">
          <span>${escapeHtml(r.film_title || 'Фильм')}</span><strong style="color:var(--accent,#ff2d7b)">${r.rating}/10</strong>
        </div>`).join('') : ''}
      ${achievements.length ? '<div style="font-weight:700;margin:14px 0 8px">Достижения</div><div style="display:flex;flex-wrap:wrap;align-items:flex-start">' + achievements.map((a) => _friendAchCircleHtml(a)).join('') + '</div>' : ''}
    `);
    modal.querySelector('[data-friend-taste]')?.addEventListener('click', () => _openFriendTaste(userId));
    modal.querySelector('[data-friend-mutual]')?.addEventListener('click', () => _openMutualWatchlist(userId));
    modal.querySelector('[data-friend-ratings]')?.addEventListener('click', async () => {
      const rd = await api('/api/friends/' + encodeURIComponent(userId) + '/ratings?limit=100');
      const items = (rd && rd.ratings) || [];
      _friendModal(`
        <div style="font-size:17px;font-weight:700;margin-bottom:12px">Оценки друга</div>
        ${items.length ? items.map((r) => `
          <div style="display:flex;justify-content:space-between;gap:12px;padding:10px;border:1px solid #eee;border-radius:10px;margin-bottom:6px">
            <span>${escapeHtml(r.film_title || 'Фильм')}</span>
            <strong style="color:var(--accent,#ff2d7b)">${r.rating}/10</strong>
          </div>`).join('') : '<div class="cabinet-hint">Нет оценок</div>'}
      `);
    });
    modal.querySelector('[data-friend-unwatched]')?.addEventListener('click', async () => {
      const uw = await api('/api/friends/' + encodeURIComponent(userId) + '/unwatched?limit=100');
      const films = (uw && uw.films) || [];
      _friendModal(`
        <div style="font-size:17px;font-weight:700;margin-bottom:12px">Непросмотренные</div>
        ${films.length ? films.map((f) => `
          <div style="display:flex;justify-content:space-between;gap:12px;padding:10px;border:1px solid #eee;border-radius:10px;margin-bottom:6px">
            <span>${escapeHtml(f.title || 'Фильм')}</span>
            <span style="color:#888">${escapeHtml(f.year || '')}</span>
          </div>`).join('') : '<div class="cabinet-hint">Всё просмотрено</div>'}
      `);
    });
    modal.querySelector('[data-friend-ach]')?.addEventListener('click', () => {
      if (!achievements.length) return;
      _friendModal(`
        <div style="font-size:17px;font-weight:700;margin-bottom:12px">Достижения</div>
        <div style="display:flex;flex-wrap:wrap;align-items:flex-start">${achievements.map((a) => _friendAchCircleHtml(a)).join('')}</div>
      `);
    });
  }

  async function _openFriendsActivity() {
    const data = await api('/api/friends/activity?limit=20');
    const items = (data && data.items) || [];
    const html = items.length
      ? items.map((it) => {
          const letter = (it.name || '?')[0].toUpperCase();
          const ts = it.happened_at ? new Date(it.happened_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : '';
          const ach = it.achievement || {};
          const desc = it.event_type === 'rating'
            ? `оценил${it.value != null ? ' ' + it.value + '/10' : ''} — ${escapeHtml(it.film_title || 'фильм')}`
            : it.event_type === 'achievement'
            ? `получил достижение «${escapeHtml((ach.icon || '🏅') + ' ' + (ach.name || it.extra || 'Ачивка'))}»`
            : escapeHtml(it.event_type || '');
          return `<div class="soc-activity-row">
            <div class="soc-friend-avatar" style="width:32px;height:32px;font-size:13px;flex-shrink:0">${escapeHtml(letter)}</div>
            <div style="flex:1;font-size:13px"><strong>${escapeHtml(it.name)}</strong> ${desc}${ts ? ` <span style="color:#aaa"> · ${ts}</span>` : ''}</div>
          </div>`;
        }).join('')
      : '<div class="cabinet-hint">Нет активности</div>';
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `<div style="background:var(--surface,#fff);border-radius:14px;padding:24px;max-width:480px;width:100%;max-height:80vh;overflow:auto">
      <div style="font-size:17px;font-weight:700;margin-bottom:16px">Лента активности друзей</div>
      ${html}
      <button type="button" style="margin-top:16px;width:100%;padding:12px;border-radius:8px;border:1px solid #ddd;background:none;cursor:pointer">Закрыть</button>
    </div>`;
    modal.querySelector('button').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  async function _openFriendsLeaderboard() {
    const data = await api('/api/friends/leaderboard');
    const items = (data && data.leaderboard) || [];
    const noms = (data && data.nominations && data.nominations.length) ? data.nominations : [
      { id: 'ratings_week', label: 'За неделю', emoji: '⭐', field: 'ratings_week', unit: 'оценок' },
      { id: 'streak', label: 'Стрик', emoji: '🔥', field: 'streak_days', unit: 'дней' },
      { id: 'activity_week', label: 'Активность', emoji: '⚡', field: 'activity_week', unit: 'событий' },
      { id: 'coins', label: 'Монеты', emoji: '🪙', field: 'coins', unit: 'монет' },
      { id: 'ratings_all', label: 'Все оценки', emoji: '📊', field: 'ratings_count', unit: 'оценок' },
      { id: 'achievements', label: 'Ачивки', emoji: '🏅', field: 'achievements_count', unit: 'ачивок' },
    ];
    let activeId = noms[0].id;
    const medals = ['🥇', '🥈', '🥉'];

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `<div class="soc-lb-modal-card" style="background:var(--surface,#fff);border-radius:14px;padding:24px;max-width:480px;width:100%;max-height:80vh;overflow:auto">
      <div style="font-size:17px;font-weight:700;margin-bottom:12px">🏆 Рейтинг друзей</div>
      <div id="soc-lb-tabs" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;-webkit-overflow-scrolling:touch"></div>
      <div id="soc-lb-list"></div>
      <button type="button" class="soc-lb-close" style="margin-top:16px;width:100%;padding:12px;border-radius:8px;border:1px solid #ddd;background:none;cursor:pointer">Закрыть</button>
    </div>`;
    const tabsEl = modal.querySelector('#soc-lb-tabs');
    const listEl = modal.querySelector('#soc-lb-list');

    function renderList() {
      const nom = noms.find((n) => n.id === activeId) || noms[0];
      const sorted = items.slice().sort((a, b) => (Number(b[nom.field]) || 0) - (Number(a[nom.field]) || 0));
      if (!sorted.length) {
        listEl.innerHTML = '<div class="cabinet-hint">Нет данных — добавьте друзей</div>';
        return;
      }
      listEl.innerHTML = sorted.map((it, i) => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px;border:1px solid #eee;border-radius:10px;margin-bottom:6px${it.is_me ? ';background:rgba(255,45,123,0.05);border-color:rgba(255,45,123,0.3)' : ''}">
          <span style="font-size:18px;width:28px;text-align:center;flex-shrink:0">${medals[i] || (i + 1) + '.'}</span>
          <div class="soc-friend-avatar" style="width:34px;height:34px;font-size:14px;flex-shrink:0">${escapeHtml((it.name || '?')[0].toUpperCase())}</div>
          <div style="flex:1;min-width:0"><div style="font-weight:700">${escapeHtml(it.name)}${it.is_me ? ' <span style="color:#aaa;font-weight:400">(вы)</span>' : ''}</div></div>
          <div style="text-align:right;flex-shrink:0"><div style="font-size:16px;font-weight:800;color:var(--accent,#ff2d7b)">${Number(it[nom.field]) || 0}</div><div style="font-size:11px;color:#888">${escapeHtml(nom.unit)}</div></div>
        </div>`).join('');
    }

    function renderTabs() {
      tabsEl.innerHTML = noms.map((n) => `
        <button type="button" data-lb-nom="${escapeHtml(n.id)}" style="flex-shrink:0;padding:8px 14px;border-radius:999px;border:1px solid ${n.id === activeId ? 'var(--accent,#ff2d7b)' : '#ddd'};background:${n.id === activeId ? 'rgba(255,45,123,0.1)' : '#fafafa'};font-weight:600;font-size:13px;cursor:pointer;color:${n.id === activeId ? 'var(--accent,#ff2d7b)' : '#444'}">${escapeHtml(n.emoji)} ${escapeHtml(n.label)}</button>
      `).join('');
      tabsEl.querySelectorAll('[data-lb-nom]').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeId = btn.getAttribute('data-lb-nom');
          renderTabs();
          renderList();
        });
      });
    }

    renderTabs();
    renderList();
    modal.querySelector('.soc-lb-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  function _initSocTabRow() {
    const tabRow = document.getElementById('soc-tab-row');
    if (!tabRow || tabRow._socBound) return;
    tabRow._socBound = true;
    tabRow.querySelectorAll('.soc-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        tabRow.querySelectorAll('.soc-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const pane = tab.getAttribute('data-soc-tab');
        document.getElementById('soc-pane-friends').style.display = pane === 'friends' ? '' : 'none';
        document.getElementById('soc-pane-groups').style.display = pane === 'groups' ? '' : 'none';
      });
    });
    const searchInput = document.getElementById('soc-search-input');
    const searchBtn = document.getElementById('soc-search-btn');
    if (searchBtn) searchBtn.addEventListener('click', () => void _runFriendSearch());
    if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') void _runFriendSearch(); });
    const grpSearchInput = document.getElementById('grp-search-input');
    const grpSearchBtn = document.getElementById('grp-search-btn');
    if (grpSearchBtn) grpSearchBtn.addEventListener('click', () => void _runGroupDiscover());
    if (grpSearchInput) grpSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') void _runGroupDiscover(); });
    void _loadFriendsPane();
  }

  async function _runGroupDiscover() {
    const q = (document.getElementById('grp-search-input')?.value || '').trim();
    const out = document.getElementById('grp-search-results');
    if (!out) return;
    out.classList.remove('hidden');
    out.innerHTML = '<div class="soc-search-state">Ищем…</div>';
    try {
      const qs = q ? ('?q=' + encodeURIComponent(q)) : '';
      const data = await api('/api/site/groups/discover' + qs);
      if (!data || data.success === false) {
        out.innerHTML = '<div class="soc-search-state error">' + escapeHtml((data && data.error) || 'Не удалось выполнить поиск') + '</div>';
        return;
      }
      const items = (data && data.groups) || [];
      if (!items.length) {
        out.innerHTML = '<div class="soc-search-state">Ничего не найдено</div>';
        return;
      }
      const badge = (gk) =>
        gk === 'cinema_club'
          ? '<span class="grp-discover-pill grp-discover-pill--club">Киноклуб</span>'
          : '<span class="grp-discover-pill grp-discover-pill--media">Медиа</span>';
      out.innerHTML = items.map((g) => `
        <div class="soc-search-user-row grp-discover-search-row">
          <span class="group-card-emoji" style="font-size:22px;flex-shrink:0">${escapeHtml(g.emoji || '🎬')}</span>
          <div class="soc-search-user-main">
            <strong>${escapeHtml(g.name || 'Группа')}</strong> ${badge(g.group_kind)}
            <div style="font-size:12px;color:rgba(255,255,255,0.55);margin-top:2px">${escapeHtml(String(g.members_count || 0))} уч.</div>
          </div>
          <button type="button" class="soc-search-add-btn grp-discover-join-btn" data-chat-id="${Number(g.chat_id)}">Вступить</button>
        </div>`).join('');
      out.querySelectorAll('.grp-discover-join-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const chatId = Number(btn.getAttribute('data-chat-id'));
          if (!chatId) return;
          try {
            const rr = await api('/api/site/rooms/' + chatId + '/join-request', { method: 'POST', body: '{}' });
            showToast(rr && rr.status === 'approved' ? 'Вы вступили в группу' : 'Заявка отправлена');
            btn.textContent = rr && rr.status === 'approved' ? 'В группе' : 'Отправлено';
            btn.disabled = true;
            renderGroupsSection();
          } catch (e) {
            showToast((e && e.message) || 'Не удалось отправить заявку', { type: 'error' });
          }
        });
      });
    } catch (e) {
      out.innerHTML = '<div class="soc-search-state error">' + escapeHtml((e && e.message) || 'Ошибка сети') + '</div>';
    }
  }

  // ── /Friends JS ─────────────────────────────────────────────────────────────

  function renderGroupsSection() {
    const list = document.getElementById('groups-list');
    if (!list) return;
    // Init social tab row
    _initSocTabRow();
    list.innerHTML = '<div class="cabinet-hint">Загружаем профили…</div>';
    api('/api/site/profiles').then((data) => {
      if (!data || !data.success) {
        list.innerHTML = '<div class="cabinet-hint">' + escapeHtml((data && data.error) || 'Не удалось загрузить профили') + '</div>';
        return;
      }
      const profiles = data.profiles || [];
      if (!profiles.length) {
        list.innerHTML = '<div class="cabinet-hint">Пока только этот профиль.</div>';
        return;
      }
      list.innerHTML = profiles.map((p) => {
        const emoji = groupCardEmoji(p);
        const type = groupKindLabel(p);
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
            <span class="group-card-type">${escapeHtml(type)}</span>
          </div>
          <div class="group-card-meta"><span>🎬 ${p.movies_count || 0}</span><span>⭐ ${p.ratings_count || 0}</span></div>
          <div class="group-card-actions">
            ${active
        ? '<button type="button" disabled>Активен</button>'
        : '<button type="button" class="primary" data-action="switch-profile" data-chat-id="' + escapeHtml(String(p.chat_id)) + '">Открыть</button>'}
            ${shareBtn}
            ${showManage ? '<button type="button" class="group-card-manage" data-action="group-manage" data-cid="' + escapeHtml(String(p.chat_id)) + '">Участники</button>' : ''}
            ${showManage ? '<button type="button" class="group-card-manage" data-action="group-access" data-cid="' + escapeHtml(String(p.chat_id)) + '">Заявки и доступ</button>' : ''}
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
      list.querySelectorAll('[data-action="group-access"]').forEach((b) => {
        b.addEventListener('click', () => openRoomAccessModal(b.getAttribute('data-cid')));
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

  let _createRoomDiscover = false;
  let _createRoomApproval = 'any_admin';

  function renderCreateRoomKindExtra() {
    const box = document.getElementById('create-room-kind-extra');
    const row = document.getElementById('create-room-kind-row');
    if (!box || !row) return;
    const active = row.querySelector('.create-room-kind-btn.active');
    const kind = (active && active.getAttribute('data-kind')) || 'friends';
    if (kind === 'friends') {
      box.innerHTML = '';
      return;
    }
    const modes = [
      ['any_admin', 'Любой админ'],
      ['majority_admins', 'Большинство'],
      ['specific_admins', 'Конкретные админы'],
      ['creator_only', 'Создатель'],
      ['no_approval', 'Без согласования'],
    ];
    box.innerHTML = `
      <label class="create-room-discover" style="display:flex;align-items:flex-start;gap:10px;margin-top:8px;cursor:pointer;font-size:14px;color:var(--text-body,#eee)">
        <input type="checkbox" id="create-room-discoverable" style="margin-top:3px" ${_createRoomDiscover ? 'checked' : ''}>
        <span>Показывать в поиске групп</span>
      </label>
      <div class="create-room-label" style="margin-top:12px">Заявки на вступление</div>
      <div class="create-room-approval-row" id="create-room-approval-row">
        ${modes.map(([id, label]) => `<button type="button" class="create-room-approval-btn ${_createRoomApproval === id ? 'active' : ''}" data-approval="${id}">${escapeHtml(label)}</button>`).join('')}
      </div>
    `;
    const dis = document.getElementById('create-room-discoverable');
    if (dis) {
      dis.addEventListener('change', () => {
        _createRoomDiscover = !!dis.checked;
      });
    }
    box.querySelectorAll('.create-room-approval-btn').forEach((b) => {
      b.addEventListener('click', () => {
        _createRoomApproval = b.getAttribute('data-approval') || 'any_admin';
        renderCreateRoomKindExtra();
      });
    });
  }

  function openCreateRoomModal() {
    const modal = document.getElementById('create-room-modal');
    if (!modal) return;
    const input = document.getElementById('create-room-name');
    const statusEl = document.getElementById('create-room-status');
    const kindRow = document.getElementById('create-room-kind-row');
    if (kindRow) {
      kindRow.querySelectorAll('.create-room-kind-btn').forEach((b) => b.classList.remove('active'));
      const f = kindRow.querySelector('.create-room-kind-btn[data-kind="friends"]');
      if (f) f.classList.add('active');
    }
    _createRoomDiscover = false;
    _createRoomApproval = 'any_admin';
    renderCreateRoomKindExtra();
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
    const kindRow = document.getElementById('create-room-kind-row');
    if (kindRow && !kindRow._mpBound) {
      kindRow._mpBound = true;
      kindRow.addEventListener('click', (e) => {
        const btn = e.target.closest('.create-room-kind-btn');
        if (!btn) return;
        kindRow.querySelectorAll('.create-room-kind-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const kind = btn.getAttribute('data-kind') || 'friends';
        if (kind === 'friends') {
          _createRoomDiscover = false;
          _createRoomApproval = 'any_admin';
        } else if (kind === 'cinema_club') {
          _createRoomDiscover = true;
        } else {
          _createRoomDiscover = false;
        }
        renderCreateRoomKindExtra();
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
    if (!name) { if (statusEl) { statusEl.textContent = 'Введите название группы'; statusEl.className = 'add-film-status error'; } return; }
    const kindBtn = document.querySelector('#create-room-kind-row .create-room-kind-btn.active');
    const groupKind = (kindBtn && kindBtn.getAttribute('data-kind')) || 'friends';
    const body = { name, emoji, group_kind: groupKind };
    if (groupKind === 'friends') {
      body.is_discoverable = false;
      body.join_approval_mode = 'any_admin';
    } else {
      body.is_discoverable = !!_createRoomDiscover;
      body.join_approval_mode = _createRoomApproval;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Создаём…'; }
    api('/api/site/rooms', { method: 'POST', body: JSON.stringify(body) }).then((data) => {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Создать группу'; }
      if (!data || !data.success) {
        if (statusEl) { statusEl.textContent = (data && data.error) || 'Не удалось создать группу'; statusEl.className = 'add-film-status error'; }
        return;
      }
      closeCreateRoomModal();
      // Сразу переключаемся в комнату
      try { localStorage.setItem('mp_site_token', data.token); } catch (_) {}
      // Показываем ссылку-приглашение
      showShareInvite({
        chat_id: data.chat_id,
        url: data.invite_url,
        name: data.name || 'Группа',
        is_virtual: true,
        inviter_name: getPersonalSessionName(),
      });
      // После закрытия share-modal — обновим кабинет
    }).catch(() => {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Создать группу'; }
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
        inviter_name: getPersonalSessionName(),
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
    const groupName = (info.name || 'группу').trim();
    const inviterName = (info.inviter_name || getPersonalSessionName()).trim();
    if (titleEl) titleEl.textContent = `Пригласить в «${groupName}»`;
    if (hintEl) hintEl.textContent = `${inviterName} приглашает Вас в «${groupName}» в Movie Planner.`;
    if (metaEl) {
      const parts = ['Ссылка действует 7 дней', 'до 10 приглашений'];
      metaEl.textContent = parts.join(' · ');
    }
    const text = `${inviterName} приглашает Вас в «${groupName}» в Movie Planner. Вступить?`;
    if (tgLink) tgLink.href = `https://t.me/share/url?url=${encodeURIComponent(info.url || '')}&text=${encodeURIComponent(text)}`;
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

  function updatePremiereReminderState(kp, data, reminderSet) {
    [_premieresData, _homePremierePreview].forEach((arr) => {
      (arr || []).forEach((it) => {
        if (String(it.kp_id) !== String(kp)) return;
        it.reminder_set = !!reminderSet;
        if (data && data.film_id) it.already_in_base_film_id = it.already_in_base_film_id || data.film_id;
      });
    });
  }

  function handlePremiereNotifyButton(button, onDone) {
    if (!button || button.disabled) return;
    const action = button.getAttribute('data-action');
    const kp = button.getAttribute('data-kp');
    const date = button.getAttribute('data-date');
    if (!kp || !action) return;
    const isOn = action === 'premiere-notify-on';
    const oldHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '…';
    const options = isOn
      ? { method: 'POST', body: JSON.stringify({ premiere_date: date }) }
      : { method: 'DELETE' };
    api('/api/site/premieres/' + encodeURIComponent(kp) + '/notify', options).then((data) => {
      if (!data || !data.success) {
        const msg = data && (data.message || data.error);
        showToast(msg || 'Не удалось изменить напоминание', { type: 'error' });
        button.disabled = false;
        button.innerHTML = oldHtml;
        return;
      }
      updatePremiereReminderState(kp, data, isOn);
      if (typeof onDone === 'function') onDone(kp, data);
      else renderPremieresList();
      showToast(isOn ? 'Премьера отслеживается' : 'Напоминание отключено');
    }).catch(() => {
      showToast('Ошибка сети', { type: 'error' });
      button.disabled = false;
      button.innerHTML = oldHtml;
    });
  }

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
      const poster = it.poster || posterUrl(it.kp_id);
      const year = it.year ? escapeHtml(String(it.year)) : '';
      const datePill = formatPremiereDateDdMm(it.premiere_date);
      const bell = renderPremiereNotifyButton(it, 'premiere-poster-bell');
      const metaParts = [datePill, year, it.genres || ''].filter(Boolean);
      const preview = renderHomeHoverPreview({
        title: it.title || '',
        poster: poster,
        metaHtml: metaParts.length ? escapeHtml(metaParts.slice(0, 2).join(' · ')) : '',
        description: it.description || '',
        emoji: '🎭',
      });
      const navAttrs = homeDashNavAttrs(it);
      return `<div class="premiere-poster-tile"${navAttrs} data-kp="${escapeHtml(String(it.kp_id || ''))}">
        <div class="premiere-poster-media">
          ${poster ? `<img class="premiere-poster-tile-img" src="${escapeHtml(poster)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<div class="premiere-poster-tile-img premiere-poster-tile-img--ph"></div>'}
          ${datePill ? `<span class="premiere-poster-date-pill">${escapeHtml(datePill)}</span>` : ''}
          <span data-stop-card-click="1">${bell.replace('class="premiere-bell-btn premiere-poster-bell"', 'class="premiere-bell-btn premiere-poster-bell premiere-poster-bell--overlay"')}</span>
        </div>
        <div class="premiere-poster-tile-body">
          <div class="premiere-poster-tile-title">${escapeHtml(it.title || '')}</div>
          ${year ? `<div class="premiere-poster-tile-meta">${year}</div>` : ''}
        </div>
        ${preview}
      </div>`;
    }).join('');

    grid.querySelectorAll('[data-action="premiere-notify-on"]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        handlePremiereNotifyButton(b, () => renderPremieresList());
      });
    });
    grid.querySelectorAll('[data-action="premiere-notify-off"]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        handlePremiereNotifyButton(b, () => renderPremieresList());
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
    grid.querySelectorAll('.premiere-poster-tile, .premiere-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-stop-card-click]')) return;
        e.preventDefault();
        e.stopPropagation();
        openFilmFromCard(card);
      });
    });
  }

  function formatPremiereDateDdMm(s) {
    if (!s) return '';
    const m1 = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m1) return m1[3] + '.' + m1[2];
    const m2 = String(s).match(/^(\d{1,2})\.(\d{1,2})\./);
    if (m2) return String(parseInt(m2[1], 10)).padStart(2, '0') + '.' + String(parseInt(m2[2], 10)).padStart(2, '0');
    return '';
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
          const inviterName = info.inviter_name || 'Пользователь';
          hintEl.textContent = inviterName + ' приглашает Вас в «' + (info.name || 'Группа') + '» в Movie Planner.';
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

  // ── Add-friend landing (/add?u=<id> or /?add=<id>) ──────────────────────────

  function _openAddFriendModal(userId, profile, isLoggedIn) {
    const existing = document.getElementById('mp-add-friend-overlay');
    if (existing) existing.remove();

    const name = (profile && profile.name) || 'Пользователь';
    const initials = name[0].toUpperCase();
    const photoUrl = resolveMediaUrl(profile && profile.photo_url);
    const avatarHtml = photoUrl
      ? `<img src="${escapeHtml(photoUrl)}" alt="" data-initial="${escapeHtml(initials)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none';this.parentNode.textContent=this.getAttribute('data-initial')||'?'">`
      : escapeHtml(initials);
    const ratings = (profile && profile.ratings_count) || 0;
    const coins = (profile && profile.coins) || 0;
    const fs = profile && profile.friendship_status;
    const appLink = 'movieplanner://friends/' + encodeURIComponent(String(userId)) + '?invite=1';

    let actionHtml;
    if (fs === 'accepted') {
      actionHtml = '<p style="text-align:center;color:#aaa;margin:0">Вы уже друзья ✓</p>';
    } else if (isLoggedIn) {
      actionHtml = '<button id="mp-aff-accept-invite" style="width:100%;padding:14px;background:#ff2d7b;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer">Принять приглашение</button>';
    } else {
      actionHtml = '<button id="mp-aff-login" style="width:100%;padding:14px;background:#ff2d7b;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer">Войти и принять</button>';
    }

    const ov = document.createElement('div');
    ov.id = 'mp-add-friend-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99000;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box';
    ov.innerHTML = `
      <div style="background:#1c1c28;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px 24px;max-width:360px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,0.7);text-align:center">
        <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#ff2d7b,#7b2fff);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;margin:0 auto 16px;overflow:hidden">${avatarHtml}</div>
        <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:6px">${name}</div>
        <div style="font-size:13px;color:#888;margin-bottom:4px">хочет добавить Вас в друзья в Movie Planner 🎬</div>
        <div style="display:flex;gap:16px;justify-content:center;margin:12px 0 20px;font-size:13px;color:#aaa">
          <span>🎬 ${ratings} оценок</span>
          <span>🪙 ${coins} монет</span>
        </div>
        <a href="${appLink}" id="mp-aff-open-app" style="display:block;width:100%;padding:13px;background:#2a2a38;color:#fff;border:1px solid rgba(255,255,255,0.12);border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;box-sizing:border-box;margin-bottom:10px">Открыть в приложении</a>
        ${actionHtml}
        <button id="mp-aff-close" style="width:100%;margin-top:10px;padding:12px;background:transparent;color:#888;border:1px solid rgba(255,255,255,0.1);border-radius:12px;font-size:14px;cursor:pointer">Закрыть</button>
      </div>`;
    document.body.appendChild(ov);

    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    document.getElementById('mp-aff-close').addEventListener('click', () => ov.remove());

    const acceptInviteBtn = document.getElementById('mp-aff-accept-invite');
    if (acceptInviteBtn) {
      acceptInviteBtn.addEventListener('click', () => acceptFriendInviteFromLink(userId, acceptInviteBtn, ov));
    }

    const loginBtn = document.getElementById('mp-aff-login');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        try { localStorage.setItem('mp_pending_accept_friend_invite', String(userId)); } catch (_) {}
        ov.remove();
        const hdr = document.getElementById('header-login-btn') || document.querySelector('[data-action="login"]');
        if (hdr) hdr.click();
      });
    }
  }

  async function acceptFriendInviteFromLink(userId, buttonEl, overlayEl) {
    if (!userId) return;
    const btn = buttonEl || document.getElementById('mp-aff-accept-invite');
    if (btn) { btn.disabled = true; btn.textContent = 'Принимаем…'; }
    try {
      const r = await fetch(API_BASE + '/api/friends/invite/accept', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviter_user_id: userId }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.success || r.ok) {
        showToast('Теперь вы друзья! 🎉');
        if (overlayEl) overlayEl.remove();
        try { loadMeAndShowCabinet(); } catch (_) {}
      } else {
        showToast(d.error || 'Ошибка', { type: 'error' });
        if (btn) { btn.disabled = false; btn.textContent = 'Принять приглашение'; }
      }
    } catch (_) {
      showToast('Сетевая ошибка', { type: 'error' });
      if (btn) { btn.disabled = false; btn.textContent = 'Принять приглашение'; }
    }
  }

  async function handleAddFriendFromUrl() {
    const params = new URLSearchParams(window.location.search);
    let addUserId = params.get('add') || params.get('u');
    if (!addUserId) {
      const spa = params.get('__spa') || '';
      try {
        const spaUrl = new URL(decodeURIComponent(spa), window.location.origin);
        const m = spaUrl.pathname.match(/^\/u\/(\d+)\/?$/);
        if (m) addUserId = m[1];
      } catch (_) {
        const m = String(spa).match(/^\/u\/(\d+)\/?$/);
        if (m) addUserId = m[1];
      }
    }
    if (!addUserId || !/^\d+$/.test(addUserId)) return;
    const uid = Number(addUserId);
    const token = getToken();
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    try {
      const r = await fetch(API_BASE + '/api/friends/' + uid + '/public', { headers });
      const data = await r.json().catch(() => ({}));
      if (data.success) _openAddFriendModal(uid, data, !!token);
    } catch (_) {}
  }

  function init() {
    consumeOAuthReturnFromHash();
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
    void handleAddFriendFromUrl();

    // P4.3: History API — кабинет, /film/:id, разделы
    window.addEventListener('popstate', () => {
      if (handleHash()) return;
      if (isSearchLocation()) {
        const q = searchQueryFromLocation();
        renderSiteSearchPage({ q });
        return;
      }
      const pathStaff = staffIdFromPathname(window.location.pathname);
      if (pathStaff) {
        try { openStaffPage(pathStaff, { skipHistory: true, replace: true }); } catch (e) {}
        return;
      }
      const pathKp = kpIdFromPathname(window.location.pathname);
      if (pathKp) {
        goToStandaloneFilmPage(pathKp);
        return;
      }
      const pathF = filmIdFromPathname(window.location.pathname);
      if (pathF) {
        try { openFilmPageFromLegacyPath(pathF, { skipHistory: true, replace: true }); } catch (e) {}
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
        if (sec === 'inbox' && typeof renderInboxSection === 'function') renderInboxSection();
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
        if (sectionId === 'inbox' && typeof renderInboxSection === 'function') {
          renderInboxSection();
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
      uiToursResetCache();
      renderHeader(null);
      const pathKpLogout = kpIdFromPathname(window.location.pathname);
      if (pathKpLogout && /^\d+$/.test(pathKpLogout)) {
        redirectToPublicFilmPage(pathKpLogout);
        return;
      }
      showScreen('landing');
    });

    if (!isPublicStats) {
    const pathKpBoot = kpIdFromPathname(window.location.pathname);
    if (pathKpBoot && document.getElementById('landing')) {
      window.location.replace('/f/' + pathKpBoot);
      return;
    }
    try {
      const spaBoot = new URLSearchParams(window.location.search).get('__spa') || '';
      const spaKp = spaBoot.match(/^\/f\/(\d+)\/?/);
      if (spaKp && document.getElementById('landing')) {
        window.location.replace('/f/' + spaKp[1]);
        return;
      }
    } catch (_) {}
    if (isSearchLocation()) {
      const q = searchQueryFromLocation();
      renderHeader(null);
      renderSiteSearchPage({ q });
      return;
    }
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
            handleAuthEntryDeepLinks();
          }
        })
        .catch(() => {
          localStorage.removeItem('mp_site_token');
          showScreen('landing');
          renderHeader(null);
          handleAuthEntryDeepLinks();
        });
      return;
    }

    if (getToken()) {
      bootAuthenticatedFilmDeepLink();
      loadMeAndShowCabinet();
    } else {
      const pathStaffGuest = staffIdFromPathname(window.location.pathname);
      if (pathStaffGuest) {
        showScreen('cabinet-readonly');
        renderHeader(null);
        openStaffPage(pathStaffGuest, { replace: true });
      } else {
        showScreen('landing');
        renderHeader(null);
        handleAuthEntryDeepLinks();
      }
    }
    }

    const footerYearEl = document.getElementById('footer-year');
    if (footerYearEl) footerYearEl.textContent = new Date().getFullYear();

    // Parallax background emojis
    const parallaxBg = document.getElementById('parallaxBg');
    if (parallaxBg) {
      const emojis = ['🍿', '🎬', '🎞️', '🎥', '🎫', '⭐', '🎭'];
      for (let i = 0; i < 38; i++) {
        const el = document.createElement('div');
        el.className = 'parallax-emoji';
        el.textContent = emojis[i % emojis.length];
        const size = 28 + Math.random() * 42;
        const left = Math.random() * 100;
        const top = Math.random() * 200;
        const speed = 0.02 + Math.random() * 0.06;
        const opacity = 0.1 + Math.random() * 0.14;
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
