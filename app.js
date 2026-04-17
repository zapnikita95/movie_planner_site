/**
 * Movie Planner — личный кабинет на сайте
 * API: https://web-production-3921c.up.railway.app
 */
(function () {
  'use strict';

  const API_BASE = 'https://web-production-3921c.up.railway.app';
  const BOT_LINK = 'https://t.me/movie_planner_bot';
  const BOT_START_LINK = 'https://t.me/movie_planner_bot?start=start';
  const BOT_CODE_LINK = 'https://t.me/movie_planner_bot?start=code';
  const BOT_SEARCH_LINK = BOT_LINK + '?start=search';
  const BOT_PREMIERES_LINK = BOT_LINK + '?start=premieres';
  const BOT_RANDOM_LINK = BOT_LINK + '?start=random';
  let cabinetHasData = false;
  let cabinetUserId = null; // user_id текущей сессии (для подсветки «моей» оценки в группах)
  // Состояние TV-подключения (tv_type и токен агента), подгружается после входа.
  let tvSettings = { tv_type: null, agent_token_exists: false, agent_online: false };

  function posterUrl(kpId) {
    if (!kpId) return '';
    return 'https://st.kp.yandex.net/images/film_big/' + String(kpId).replace(/\D/g, '') + '.jpg';
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
    const dd = document.getElementById('header-account-dropdown');
    if (dd) { dd.classList.add('hidden'); dd.classList.remove('open'); }
  }

  function openAccountDropdown() {
    const dd = document.getElementById('header-account-dropdown');
    if (!dd) return;
    const sessions = getSessions();
    const activeId = getActiveChatId();
    const personalCount = sessions.filter((s) => s.is_personal).length;
    const groupCount = sessions.filter((s) => !s.is_personal).length;
    const canAddPersonal = personalCount < MAX_PERSONAL;
    const canAddGroup = groupCount < MAX_GROUP;
    const canAdd = sessions.length < MAX_PERSONAL + MAX_GROUP && (canAddPersonal || canAddGroup);

    let html = '';
    if (sessions.length) {
      html += '<div class="header-dropdown-title">Текущие входы</div>';
      sessions.forEach((s) => {
        const isActive = String(s.chat_id) === String(activeId);
        const typeLabel = s.is_personal ? 'личный' : 'группа';
        const name = escapeHtml(s.name || 'Кабинет');
        html += '<div class="header-dropdown-account' + (isActive ? ' is-active' : '') + '" data-chat-id="' + escapeHtml(String(s.chat_id)) + '">';
        html += '<span class="header-dropdown-account-name">' + name + '<span class="header-dropdown-account-type">(' + typeLabel + ')</span></span>';
        html += '<button type="button" class="header-dropdown-account-remove" data-chat-id="' + escapeHtml(String(s.chat_id)) + '" aria-label="Выйти">×</button>';
        html += '</div>';
      });
      html += '<div class="header-dropdown-divider"></div>';
    }
    html += '<button type="button" class="header-dropdown-add' + (canAdd ? '' : ' disabled') + '" data-action="add-account"' + (canAdd ? '' : ' disabled') + '>+ Добавить вход</button>';
    if (sessions.length) {
      html += '<div class="header-dropdown-divider"></div>';
      html += '<button type="button" class="header-dropdown-logout" data-action="logout-all">Выйти из всех</button>';
    }
    dd.innerHTML = html;

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
    const cabinetBtn = document.getElementById('header-cabinet-name');
    if (me && me.name) {
      if (loginBtn) loginBtn.classList.add('hidden');
      if (userWrap) userWrap.classList.remove('hidden');
      if (cabinetBtn) {
        const session = getActiveSession();
        const isPersonal = me.is_personal !== undefined ? me.is_personal : (session ? session.is_personal : true);
        const badge = isPersonal ? 'личный' : 'группа';
        const badgeClass = isPersonal ? 'personal' : 'group';
        cabinetBtn.innerHTML = '<span class="account-name">' + escapeHtml(me.name) + '</span><span class="account-badge ' + badgeClass + '">' + badge + '</span><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style="margin-left:4px"><path d="M2 4l4 4 4-4"/></svg>';
      }
    } else {
      if (loginBtn) loginBtn.classList.remove('hidden');
      if (userWrap) userWrap.classList.add('hidden');
      if (cabinetBtn) cabinetBtn.innerHTML = '';
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

  function showSection(sectionId) {
    const readonly = document.getElementById('cabinet-readonly');
    const onboarding = document.getElementById('cabinet-onboarding');
    if (readonly && !readonly.classList.contains('hidden')) {
      readonly.querySelectorAll('.cabinet-section').forEach((el) => el.classList.add('hidden'));
      const t = readonly.querySelector('#section-' + sectionId);
      if (t) t.classList.remove('hidden');
      readonly.querySelectorAll('.cabinet-nav button').forEach((b) => {
        b.classList.remove('active');
        if (b.getAttribute('data-section') === sectionId) b.classList.add('active');
      });
      return;
    }
    if (onboarding && !onboarding.classList.contains('hidden')) {
      onboarding.querySelectorAll('.cabinet-section').forEach((el) => el.classList.add('hidden'));
      const t = onboarding.querySelector('#section-' + sectionId);
      if (t) t.classList.remove('hidden');
      onboarding.querySelectorAll('.cabinet-nav button').forEach((b) => {
        b.classList.remove('active');
        if (b.getAttribute('data-section') === sectionId) b.classList.add('active');
      });
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
          acceptInviteToken(pending);
        }
      } catch (_) {}
      if (me.has_data) {
        showScreen('cabinet-readonly');
        loadPlans();
        loadUnwatched();
        loadSeries();
        loadRatings();
        // Если открыта вкладка статистики — перезагрузить её
        const statsSection = document.getElementById('section-stats');
        if (statsSection && !statsSection.classList.contains('hidden')) {
          initStatsSelectors();
          const monthEl = document.getElementById('stats-month');
          const yearEl = document.getElementById('stats-year');
          const now = new Date();
          (function () { const g = window._getStatsMonthYear ? window._getStatsMonthYear() : (function () { const y = document.getElementById('stats-year'); const p = document.getElementById('stats-month-pills'); const a = p && p.querySelector('.month-pill.active'); const m = a ? parseInt(a.getAttribute('data-month'), 10) : now.getMonth() + 1; return { m, y: y ? parseInt(y.value, 10) : now.getFullYear() }; })(); loadStats(g.m, g.y); })();
        }
      } else {
        showScreen('cabinet-onboarding');
      }
    });
  }

  function loadExtensionConfig() {
    fetch(API_BASE + '/api/site/config').then((r) => r.json()).then((data) => {
      if (!data.success || !data.chromeExtensionUrl) return;
      const ua = navigator.userAgent || '';
      const isOpera = /opr|opera/i.test(ua) || (navigator.browser && navigator.browser.opera);
      const url = isOpera ? (data.operaExtensionUrl || data.chromeExtensionUrl) : data.chromeExtensionUrl;
      document.querySelectorAll('#cabinet-extension-link, #cabinet-extension-link-onboard, #cabinet-footer-extension-link, #cabinet-topbar-extension').forEach((a) => {
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

  // ——— Загрузка данных кабинета ———
  function loadPlans() {
    api('/api/site/plans').then((data) => {
      if (!data.success) return;
      const homeEl = document.getElementById('plans-home-list');
      const cinemaEl = document.getElementById('plans-cinema-list');
      const plansTodayEl = document.getElementById('plans-today');
      const renderPlan = (p) => {
        const dt = p.plan_datetime ? new Date(p.plan_datetime) : null;
        const dateLine = dt ? dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';
        const timeLine = dt ? dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
        const typeLabel = p.plan_type === 'cinema' ? '🎥 В кино' : '🏠 Дома';
        const link = filmDeepLink(p.film_id, p.kp_id, p.is_series);
        const poster = posterUrl(p.kp_id);
        const titleSafe = escapeHtml(p.title || '');
        return `
          <a href="${link}" target="_blank" rel="noopener" class="card plan-card" data-film-id="${p.film_id || ''}" data-kp-id="${p.kp_id || ''}">
            <div class="card-poster-wrap">
              ${poster ? '<img src="' + poster + '" alt="" class="card-poster" width="80" height="120" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : ''}
              <div class="film-poster-placeholder" style="${poster ? 'display:none' : ''}">🎬</div>
            </div>
            <div class="plan-info">
              <div class="plan-meta">
                <span class="plan-date-line">📅 ${escapeHtml(dateLine)}</span>
                <span class="plan-time-line">${escapeHtml(timeLine)}</span>
                <span class="plan-type">${typeLabel}</span>
              </div>
              <div class="plan-title">🎬 ${titleSafe}</div>
            </div>
            <div class="plan-card-buttons">
              <span class="btn btn-small btn-primary">В Telegram</span>
              ${buildFilmExtraButtons({ kp_id: p.kp_id, title: p.title, year: p.year, plan_type: p.plan_type })}
            </div>
          </a>`;
      };
      const homeEmpty = !data.home || !data.home.length;
      const cinemaEmpty = !data.cinema || !data.cinema.length;
      if (homeEl) {
        if (homeEmpty) {
          let html = '<p class="empty-hint">Нет планов просмотра дома.</p><div class="plans-empty-actions">';
          html += '<a href="' + BOT_SEARCH_LINK + '" target="_blank" rel="noopener" class="btn btn-small btn-primary">🔍 Найти фильмы</a>';
          if (cabinetHasData) html += ' <a href="' + BOT_RANDOM_LINK + '" target="_blank" rel="noopener" class="btn btn-small btn-secondary">🎲 Случайный фильм</a>';
          html += '</div>';
          homeEl.innerHTML = html;
        } else {
          homeEl.innerHTML = data.home.map(renderPlan).join('');
        }
      }
      if (cinemaEl) {
        if (cinemaEmpty) {
          cinemaEl.innerHTML = '<p class="empty-hint">Нет планов в кино.</p><div class="plans-empty-actions"><a href="' + BOT_PREMIERES_LINK + '" target="_blank" rel="noopener" class="btn btn-small btn-primary">📆 Найти премьеры</a></div>';
        } else {
          cinemaEl.innerHTML = data.cinema.map(renderPlan).join('');
        }
      }
      const all = [...(data.home || []), ...(data.cinema || [])].slice(0, 3);
      const todayWrap = document.getElementById('plans-today-wrap');
      if (todayWrap) todayWrap.classList.toggle('hidden', !all.length);
      if (plansTodayEl) plansTodayEl.innerHTML = all.length ? all.map(renderPlan).join('') : '';
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
    const progressHtml = progressStatus ? '<div class="film-status">' + progressStatus + '</div>' : '';
    return `
      <div class="card film-card" data-film-id="${m.film_id || ''}" data-kp-id="${m.kp_id || ''}">
        <a href="${link}" target="_blank" rel="noopener" class="film-card-main">
          <div class="card-poster-wrap">
            ${poster ? '<img src="' + poster + '" alt="" class="card-poster" width="96" height="144" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : ''}
            <div class="film-poster-placeholder" style="${poster ? 'display:none' : ''}">${m.is_series ? '📺' : '🎬'}</div>
          </div>
          <div class="film-info">
            <div class="film-title">${escapeHtml(m.title)}${year}${ratingStr}</div>
            ${descHtml}
            ${progressHtml}
          </div>
        </a>
        <div class="film-buttons">
          <a href="${link}" target="_blank" rel="noopener" class="btn btn-small btn-primary">В Telegram</a>
          ${buildFilmExtraButtons({ kp_id: m.kp_id, title: m.title, year: m.year })}
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
    }).catch(() => {
      unwatchedItems = [];
      renderUnwatchedList();
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
      <div class="card series-card" data-film-id="${s.film_id || ''}" data-kp-id="${s.kp_id || ''}">
        <a href="${link}" target="_blank" rel="noopener" class="film-card-main">
          <div class="card-poster-wrap">
            ${poster ? '<img src="' + poster + '" alt="" class="card-poster" width="96" height="144" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : ''}
            <div class="film-poster-placeholder" style="${poster ? 'display:none' : ''}">📺</div>
          </div>
          <div class="film-info">
            <div class="film-title">${escapeHtml(s.title)}</div>
            <div class="film-status">${progress}</div>
          </div>
        </a>
        <div class="film-buttons">
          <a href="${link}" target="_blank" rel="noopener" class="btn btn-small btn-primary">В Telegram</a>
          ${buildFilmExtraButtons({ kp_id: s.kp_id, title: s.title, is_series: true })}
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
      <div class="card film-card" data-film-id="${r.film_id || ''}" data-kp-id="${r.kp_id || ''}">
        <a href="${link}" target="_blank" rel="noopener" class="film-card-main">
          <div class="card-poster-wrap">
            ${poster ? '<img src="' + poster + '" alt="" class="card-poster" width="96" height="144" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : ''}
            <div class="film-poster-placeholder" style="${poster ? 'display:none' : ''}">⭐</div>
          </div>
          <div class="film-info">
            <div class="film-title">${escapeHtml(r.title)}${year}${ratingKpStr}</div>
            ${descHtml}
            <div class="film-status">⭐ ${r.rating}${raterStr}</div>
            ${ratedDateHtml}
          </div>
        </a>
        <div class="film-buttons">
          <a href="${link}" target="_blank" rel="noopener" class="btn btn-small btn-primary">В Telegram</a>
          ${buildFilmExtraButtons({ kp_id: r.kp_id, title: r.title, year: r.year })}
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
        if (u && navigator.clipboard) navigator.clipboard.writeText(u).then(() => { this.textContent = 'Скопировано!'; setTimeout(() => { this.textContent = 'Копировать'; }, 2000); });
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
        if (u && navigator.clipboard) navigator.clipboard.writeText(u).then(() => { this.textContent = 'Скопировано!'; setTimeout(() => { this.textContent = 'Копировать'; }, 2000); });
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

  function buildFilmExtraButtons(item) {
    if (!item || !item.kp_id) return '';
    const kp = String(item.kp_id);
    const title = (item.title || '').replace(/"/g, '&quot;');
    const year = item.year || '';
    const parts = [];
    if (tvSettings && tvSettings.tv_type) {
      parts.push(
        `<button type="button" class="film-tv-btn" data-tv-launch="1" data-kp="${kp}" data-title="${escapeHtml(item.title || '')}" onclick="event.preventDefault();event.stopPropagation();">📺 На ТВ</button>`
      );
    }
    parts.push(
      `<button type="button" class="btn btn-small btn-secondary film-streaming-btn" data-streaming="1" data-kp="${kp}" onclick="event.preventDefault();event.stopPropagation();">🎞 Онлайн-кинотеатр ▾</button>`
    );
    if (item.plan_type === 'cinema') {
      parts.push(
        `<button type="button" class="tickets-btn" data-tickets="1" data-kp="${kp}" data-title="${escapeHtml(item.title || '')}" data-year="${escapeHtml(String(year))}" onclick="event.preventDefault();event.stopPropagation();">🎫 Купить билет ▾</button>`
      );
    }
    return parts.join(' ');
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
    const tvBtn = e.target.closest('[data-tv-launch="1"]');
    if (tvBtn) {
      e.preventDefault();
      e.stopPropagation();
      const kp = tvBtn.getAttribute('data-kp');
      const title = tvBtn.getAttribute('data-title') || '';
      if (kp) showTvLaunchModal(kp, title);
      return;
    }
    const streamingBtn = e.target.closest('[data-streaming="1"]');
    if (streamingBtn) {
      e.preventDefault();
      e.stopPropagation();
      const kp = streamingBtn.getAttribute('data-kp');
      if (kp) buildStreamingPopover(streamingBtn, kp);
      return;
    }
    const ticketsBtn = e.target.closest('[data-tickets="1"]');
    if (ticketsBtn) {
      e.preventDefault();
      e.stopPropagation();
      const title = ticketsBtn.getAttribute('data-title') || '';
      const year = ticketsBtn.getAttribute('data-year') || '';
      buildTicketsPopover(ticketsBtn, title, year);
      return;
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
      const actionBtn = e.target.closest('.btn-primary, .film-tv-btn, .film-streaming-btn, .tickets-btn, a[href^="http"].btn, [data-action]');
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

  function openFilmModal(filmId) {
    const modal = document.getElementById('film-modal');
    const content = document.getElementById('film-modal-content');
    if (!modal || !content) return;
    _filmModalCurrentId = filmId;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    const cached = _filmModalCache[filmId];
    if (cached) {
      renderFilmModal(cached.film, cached.ratings, cached.similar);
    } else {
      content.className = 'film-modal-content loading';
      content.innerHTML = 'Загрузка…';
    }

    Promise.all([
      api('/api/site/film/' + filmId),
      api('/api/site/film/' + filmId + '/similar').catch(() => ({ success: true, items: [] })),
    ]).then(([detail, sim]) => {
      if (!detail || !detail.success) {
        content.className = 'film-modal-content loading';
        content.innerHTML = 'Не удалось загрузить фильм: ' + escapeHtml((detail && detail.error) || 'ошибка');
        return;
      }
      if (_filmModalCurrentId !== filmId) return; // пользователь уже закрыл/сменил
      const data = {
        film: detail.film,
        ratings: detail.ratings || [],
        me: detail.me || { user_id: cabinetUserId },
        similar: (sim && sim.items) || [],
      };
      _filmModalCache[filmId] = { film: data.film, ratings: data.ratings, similar: data.similar, me: data.me };
      renderFilmModal(data.film, data.ratings, data.similar, data.me);
    });
  }

  function closeFilmModal() {
    const modal = document.getElementById('film-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    _filmModalCurrentId = null;
    _filmModalPreviewRating = 0;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _filmModalCurrentId != null) closeFilmModal();
  });

  function renderFilmModal(film, ratings, similar, me) {
    const content = document.getElementById('film-modal-content');
    if (!content) return;
    content.className = 'film-modal-content';
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

    bindFilmModalInteractions(film);
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

  function bindFilmModalInteractions(film) {
    const content = document.getElementById('film-modal-content');
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
        const url = 'https://t.me/MovieList_Planner_Bot?start=addfilm_' + encodeURIComponent(kp);
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
        renderFilmModal(cache.film, cache.ratings, cache.similar, cache.me);
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
        renderFilmModal(cache.film, cache.ratings, cache.similar, cache.me);
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
        renderFilmModal(cache.film, cache.ratings, cache.similar, cache.me);
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
      if (v.length >= 2 && dd && dd.innerHTML) dd.classList.remove('hidden');
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
  }

  // ————————————————————————————————————————————————————
  // Phase 3: Profile switcher (cabinet-topbar)
  // ————————————————————————————————————————————————————

  function updateProfileSwitcherUI(me) {
    const nameEl = document.getElementById('cabinet-profile-name');
    const emojiEl = document.getElementById('cabinet-profile-emoji');
    if (!nameEl || !me) return;
    nameEl.textContent = me.name || 'Профиль';
    if (emojiEl) emojiEl.textContent = me.is_personal ? '👤' : '👥';
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
        const emoji = p.is_personal ? '👤' : '👥';
        const typeLabel = p.is_personal ? 'личный' : 'группа';
        const active = p.is_active || String(p.chat_id) === String(activeChatId);
        return `<div class="profile-menu-item ${active ? 'active' : ''}" data-chat-id="${escapeHtml(String(p.chat_id))}">
          <div class="profile-menu-item-main">
            <span class="profile-menu-item-emoji">${emoji}</span>
            <div class="profile-menu-item-info">
              <div class="profile-menu-item-name">${escapeHtml(p.name || 'Профиль')}</div>
              <div class="profile-menu-item-meta">${typeLabel} · ${p.movies_count || 0} фильмов · ${p.ratings_count || 0} оценок</div>
            </div>
          </div>
          ${active ? '<span class="profile-menu-item-active-tag">активен</span>' : ''}
        </div>`;
      }).join('') + '<div class="profile-menu-hint">Создавайте новые профили через <code>/invite</code> в Telegram-группе.</div>';

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
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
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
  // Phase 3: Groups section
  // ————————————————————————————————————————————————————

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
        let emoji, type;
        if (p.is_personal) { emoji = '👤'; type = 'Личный'; }
        else if (p.is_virtual) { emoji = '🧩'; type = 'Виртуальная комната'; }
        else { emoji = '👥'; type = 'Telegram-группа'; }
        const active = p.is_active;
        const shareBtn = (!p.is_personal)
          ? `<button type="button" data-action="share-profile" data-chat-id="${escapeHtml(String(p.chat_id))}" data-is-virtual="${p.is_virtual ? 1 : 0}">🔗 Пригласить</button>`
          : '';
        return `<div class="group-card ${active ? 'active' : ''}${p.is_virtual ? ' group-card-virtual' : ''}">
          <div class="group-card-head">
            <span class="group-card-emoji">${emoji}</span>
            <span class="group-card-name">${escapeHtml(p.name || 'Профиль')}</span>
          </div>
          <div class="group-card-type">${type}</div>
          <div class="group-card-meta"><span>🎬 ${p.movies_count || 0}</span><span>⭐ ${p.ratings_count || 0}</span></div>
          <div class="group-card-actions">
            ${active
              ? '<button type="button" disabled>Активен</button>'
              : `<button type="button" class="primary" data-action="switch-profile" data-chat-id="${escapeHtml(String(p.chat_id))}">Открыть</button>`}
            ${shareBtn}
          </div>
        </div>`;
      }).join('');
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
        alert((data && data.error) || 'Не удалось создать приглашение');
        return;
      }
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
        try {
          navigator.clipboard.writeText(url).then(() => {
            copyBtn.textContent = '✅ Скопировано';
            setTimeout(() => { copyBtn.textContent = '📋 Скопировать'; }, 1500);
          });
        } catch (_) {
          copyBtn.textContent = '✅ Скопировано';
        }
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

  let _premieresData = [];
  let _premieresPeriod = 'current_month';
  let _premieresSort = 'date';

  function renderPremieresSection(forceReload) {
    const periodSel = document.getElementById('premieres-period');
    const sortSel = document.getElementById('premieres-sort');
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
  // Phase 3: invite token handling (?invite_token=...)
  // ————————————————————————————————————————————————————

  function handleInviteTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('invite_token');
    if (!t) return;
    params.delete('invite_token');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
    if (!getToken()) {
      // Нет активной сессии — сначала логин, потом пригласим
      try { localStorage.setItem('mp_pending_invite_token', t); } catch (_) {}
      return;
    }
    acceptInviteToken(t);
  }

  function acceptInviteToken(token) {
    api('/api/site/invite/accept', { method: 'POST', body: JSON.stringify({ invite_token: token }) }).then((data) => {
      if (!data || !data.success) return;
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
      loadMeAndShowCabinet();
    });
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

    bindAddFilmModal();
    bindProfileSwitcher();
    bindCreateRoomModal();
    bindHeaderSearch();
    handleInviteTokenFromUrl();

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
        if (sectionId === 'stats') {
          initStatsSelectors();
          const monthEl = document.getElementById('stats-month');
          const yearEl = document.getElementById('stats-year');
          const now = new Date();
          (function () { const g = window._getStatsMonthYear ? window._getStatsMonthYear() : (function () { const y = document.getElementById('stats-year'); const p = document.getElementById('stats-month-pills'); const a = p && p.querySelector('.month-pill.active'); const m = a ? parseInt(a.getAttribute('data-month'), 10) : now.getMonth() + 1; return { m, y: y ? parseInt(y.value, 10) : now.getFullYear() }; })(); loadStats(g.m, g.y); })();
        }
      });
    });

    const cabinetName = document.getElementById('header-cabinet-name');
    const userWrap = document.getElementById('header-user-wrap');
    if (cabinetName) {
      cabinetName.addEventListener('click', (e) => {
        e.preventDefault();
        const dd = document.getElementById('header-account-dropdown');
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
