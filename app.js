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
      renderHeader(me);
      loadExtensionConfig();
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
          loadStats(monthEl ? parseInt(monthEl.value, 10) : now.getMonth() + 1, yearEl ? parseInt(yearEl.value, 10) : now.getFullYear());
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
      document.querySelectorAll('#cabinet-extension-link, #cabinet-extension-link-onboard').forEach((a) => {
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
          <a href="${link}" target="_blank" rel="noopener" class="card plan-card">
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
            <span class="btn btn-small btn-primary">Продолжить в Telegram</span>
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
      ? '<a href="' + escapeHtml(streamingUrl) + '" target="_blank" rel="noopener" class="btn btn-small btn-secondary film-streaming-btn" onclick="event.stopPropagation()"><span class="streaming-btn-text">Просмотр на стриминге</span><span class="streaming-btn-emoji"> ⏯️</span></a>'
      : '';
    const progressStatus = m.is_series
      ? (m.progress ? 'Прогресс: ' + escapeHtml(m.progress) : 'Не начат')
      : '';
    const progressHtml = progressStatus ? '<div class="film-status">' + progressStatus + '</div>' : '';
    return `
      <div class="card film-card">
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
          <a href="${link}" target="_blank" rel="noopener" class="btn btn-small btn-primary">Продолжить в Telegram</a>${streamingBtn}
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
      ? '<a href="' + escapeHtml(streamingUrl) + '" target="_blank" rel="noopener" class="btn btn-small btn-secondary film-streaming-btn" onclick="event.stopPropagation()"><span class="streaming-btn-text">Просмотр на стриминге</span><span class="streaming-btn-emoji"> ⏯️</span></a>'
      : '';
    return `
      <div class="card series-card">
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
          <a href="${link}" target="_blank" rel="noopener" class="btn btn-small btn-primary">Продолжить в Telegram</a>${streamingBtn}
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
      ? '<a href="' + escapeHtml(streamingUrl) + '" target="_blank" rel="noopener" class="btn btn-small btn-secondary film-streaming-btn" onclick="event.stopPropagation()"><span class="streaming-btn-text">Просмотр на стриминге</span><span class="streaming-btn-emoji"> ⏯️</span></a>'
      : '';
    return `
      <div class="card film-card">
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
          <a href="${link}" target="_blank" rel="noopener" class="btn btn-small btn-primary">Продолжить в Telegram</a>${streamingBtn}
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

  function initStatsSelectors() {
    const monthEl = document.getElementById('stats-month');
    const yearEl = document.getElementById('stats-year');
    if (!monthEl || !yearEl) return;
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();
    monthEl.innerHTML = MONTH_NAMES.map((name, i) => '<option value="' + (i + 1) + '"' + (i + 1 === curMonth ? ' selected' : '') + '>' + name + '</option>').join('');
    const years = [];
    for (let y = curYear; y >= curYear - 3; y--) years.push(y);
    yearEl.innerHTML = years.map((y) => '<option value="' + y + '"' + (y === curYear ? ' selected' : '') + '>' + y + '</option>').join('');
    if (!monthEl._bound) {
      monthEl._bound = yearEl._bound = true;
      monthEl.addEventListener('change', () => loadStats(parseInt(monthEl.value, 10), parseInt(yearEl.value, 10)));
      yearEl.addEventListener('change', () => loadStats(parseInt(monthEl.value, 10), parseInt(yearEl.value, 10)));
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
          if (error) { error.classList.remove('hidden'); error.textContent = data && data.error ? data.error : 'Не удалось загрузить статистику.'; }
          return;
        }
        if (isGroup) {
          renderGroupStats(data);
        } else {
          renderStatsPersonalShare(data.share_url);
          renderStatsSummary(data.summary);
          renderStatsTopFilms(data.top_films || []);
          renderStatsRatingBreakdown(data.rating_breakdown || {});
          renderStatsPlatforms(data.platforms || []);
          renderStatsCinema(data.cinema || []);
          renderStatsWatched(data.watched || []);
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
    const gMatch = pathPart.match(/^\/g\/([a-zA-Z0-9_.-]+)\/stats/);
    if (gMatch) return { type: 'group', slug: gMatch[1], month, year };
    const uMatch = pathPart.match(/^\/u\/([a-zA-Z0-9_.-]+)\/stats/);
    if (uMatch) return { type: 'user', slug: uMatch[1], month, year };
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
          if (error) { error.classList.remove('hidden'); error.textContent = data && data.error ? data.error : 'Не удалось загрузить статистику.'; }
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
    const curMonth = month || now.getMonth() + 1;
    const curYear = year || now.getFullYear();
    monthEl.innerHTML = MONTH_NAMES.map((name, i) => '<option value="' + (i + 1) + '"' + (i + 1 === curMonth ? ' selected' : '') + '>' + name + '</option>').join('');
    const years = [];
    for (let y = curYear; y >= curYear - 3; y--) years.push(y);
    yearEl.innerHTML = years.map((y) => '<option value="' + y + '"' + (y === curYear ? ' selected' : '') + '>' + y + '</option>').join('');
    const base = type === 'user' ? '#/u/' + slug + '/stats' : '#/g/' + slug + '/stats';
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
      yearEl.addEventListener('change', onChange);
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

    apiPublic('/api/site/stats/public/' + encodeURIComponent(slug) + '?month=' + (month || new Date().getMonth() + 1) + '&year=' + (year || new Date().getFullYear()))
      .then((data) => {
        if (loading) loading.classList.add('hidden');
        if (content) content.style.visibility = '';
        if (!data || !data.success) {
          if (error) { error.classList.remove('hidden'); error.textContent = data && data.error ? data.error : 'Не удалось загрузить статистику.'; }
          return;
        }
        const user = data.user || {};
        if (subtitle) subtitle.textContent = 'Статистика: ' + (user.name || slug);
        if (groupWrap) groupWrap.classList.add('hidden');
        if (personalWrap) personalWrap.classList.remove('hidden');
        renderStatsSummary(data.summary, 'public-stats-personal-summary');
        renderStatsTopFilms(data.top_films || [], 'public-stats-personal-top');
        renderStatsRatingBreakdown(data.rating_breakdown || {}, 'public-stats-personal-rating');
        renderStatsPlatforms(data.platforms || [], 'public-stats-personal-platforms');
        renderStatsCinema(data.cinema || [], 'public-stats-personal-cinema');
        renderStatsWatched(data.watched || [], 'public-stats-personal-watched');
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

  function groupAvatar(member, size) {
    if (!member) return '';
    const color = member.avatar_color || '#9b4dff';
    const initial = (member.first_name || member.username || '?')[0].toUpperCase();
    const cls = size ? 'avatar avatar-' + size : 'avatar';
    return '<div class="' + cls + '" style="background:' + escapeHtml(color) + '" title="' + escapeHtml(member.first_name || '') + '">' + escapeHtml(initial) + '</div>';
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
      const slug = group.public_slug;
      const shareUrl = slug ? (window.location.origin + '/#/g/' + slug + '/stats') : '';
      const isCabinet = !ctx || !ctx.lbPrefix || ctx.lbPrefix !== 'public-lb';
      let shareHtml = '';
      if (shareUrl) {
        shareHtml = '<div class="stats-group-share"><span class="stats-group-share-url">' + escapeHtml(shareUrl) + '</span><button type="button" class="stats-group-copy-btn" data-url="' + escapeHtml(shareUrl) + '">Копировать</button></div>';
      } else if (isCabinet) {
        shareHtml = '<div class="stats-group-share"><span class="stats-personal-share-note">Поделиться: </span><button type="button" class="btn btn-small btn-primary stats-enable-share-btn">Включить публичную ссылку</button></div>';
      }
      headerEl.innerHTML = '<div class="stats-group-header-inner"><h3 class="stats-group-title">Статистика: <span class="stats-group-name">' + escapeHtml(group.title || 'Группа') + '</span></h3>' +
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
              loadStats(monthEl ? parseInt(monthEl.value, 10) : now.getMonth() + 1, yearEl ? parseInt(yearEl.value, 10) : now.getFullYear());
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
        { val: summary.group_films ?? 0, label: 'Фильмов на группу', cls: 'stat-card-pink' },
        { val: summary.group_ratings ?? 0, label: 'Оценок поставлено', cls: 'stat-card-purple' },
        { val: summary.group_cinema ?? 0, label: 'Походов в кино', cls: 'stat-card-cyan' },
        { val: (summary.group_series ?? 0) + ' / ' + (summary.group_episodes ?? 0), label: 'Сериалов / серий', cls: 'stat-card-green' },
        { val: summary.active_members ?? 0, label: 'Активных участников', cls: 'stat-card-amber' }
      ];
      summaryEl.innerHTML = cards.map((c) => '<div class="stat-card ' + c.cls + '"><div class="stat-card-icon">' + (c.cls.includes('pink') ? '🎬' : c.cls.includes('purple') ? '⭐' : c.cls.includes('cyan') ? '🎥' : c.cls.includes('green') ? '📺' : '👥') + '</div><div class="stat-card-value">' + escapeHtml(String(c.val)) + '</div><div class="stat-card-label">' + escapeHtml(c.label) + '</div></div>').join('');
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
      return '<div class="rating-bar-row"><div class="rating-bar-label">' + r + '</div><div class="rating-bar-track"><div class="rating-bar-fill" style="width:' + pct + '%;background:hsl(' + ((r - 1) * 12) + ',80%,55%)">' + (c > 0 ? c : '') + '</div></div><div class="rating-bar-count">' + c + '</div></div>';
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
    function lbRows(items, valueKey, maxVal, suffix) {
      return (items || []).map((item, i) => {
        const m = memberById(members, item.user_id);
        const val = item[valueKey];
        const pct = maxVal ? (val / maxVal) * 100 : 0;
        const color = m && m.avatar_color ? m.avatar_color : '#9b4dff';
        return '<div class="stats-lb-row"><div class="stats-lb-rank">' + (i + 1) + '</div>' + groupAvatar(m) + '<div class="stats-lb-info"><div class="stats-lb-name">' + escapeHtml(m ? (m.first_name || m.username || 'Участник') : '') + '</div></div><div class="stats-lb-bar-wrap"><div class="stats-lb-bar" style="width:' + pct + '%;background:' + color + '"></div></div><div class="stats-lb-value">' + val + suffix + '</div></div>';
      }).join('');
    }
    const lbPref = ctx.lbPrefix || 'lb';
    blocks.push('<div class="stats-block"><div class="stats-block-title">🏆 Лидерборд</div><div class="stats-lb-tabs">' +
      '<button type="button" class="stats-lb-tab active" data-lb="watched">Просмотры</button>' +
      '<button type="button" class="stats-lb-tab" data-lb="ratings">Оценки</button>' +
      '<button type="button" class="stats-lb-tab" data-lb="avg_rating">Средняя</button>' +
      '<button type="button" class="stats-lb-tab" data-lb="cinema">Кинотеатр</button></div>' +
      '<div id="' + lbPref + '-watched" class="stats-lb-content">' + lbRows(lb.watched, 'count', maxW, '') + '</div>' +
      '<div id="' + lbPref + '-ratings" class="stats-lb-content hidden">' + lbRows(lb.ratings, 'count', maxR, '') + '</div>' +
      '<div id="' + lbPref + '-avg_rating" class="stats-lb-content hidden">' + lbRows(lb.avg_rating, 'value', maxA, '') + '</div>' +
      '<div id="' + lbPref + '-cinema" class="stats-lb-content hidden">' + lbRows(lb.cinema, 'count', maxC, '') + '</div></div>');

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

    // Watched (всё просмотренное за месяц)
    const watchedList = data.watched || [];
    if (watchedList.length) {
      const watchedHtml = watchedList.map((w) => {
        const poster = posterUrl(w.kp_id);
        const typeLabel = w.type === 'series' ? 'Сериал' : 'Фильм';
        const dateStr = w.date ? new Date(w.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        const m = w.user_id != null ? memberById(members, w.user_id) : null;
        const byWho = m ? ' · ' + (m.first_name || m.username || '') : '';
        return '<div class="watched-row">' +
          (poster ? '<img src="' + poster + '" alt="" class="top-film-poster" loading="lazy">' : '<div class="top-film-poster"></div>') +
          '<div class="top-film-info"><div class="top-film-name">' + escapeHtml(w.title || '') + '</div><div class="top-film-meta">' + escapeHtml(typeLabel + (dateStr ? ' · ' + dateStr : '') + (w.rating != null ? ' · ⭐ ' + w.rating : '') + byWho) + '</div></div></div>';
      }).join('');
      blocks.push('<div class="stats-block stats-block-full"><div class="stats-block-title">📋 Всё просмотренное за месяц</div>' + watchedHtml + '</div>');
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
          return '<div class="stats-genre-bar-line"><div class="stats-genre-bar-user">' + (m ? (m.first_name || '?')[0] : '') + '</div><div class="stats-genre-bar-track"><div class="stats-genre-bar-fill" style="width:' + pct + '%;background:' + (m && m.avatar_color ? m.avatar_color : '#9b4dff') + '">' + (cnt > 0 ? cnt : '') + '</div></div></div>';
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

    // Heatmap
    const heatKeys = Object.keys(heatmap).filter((k) => k !== '...' && !isNaN(parseInt(k, 10)));
    if (heatKeys.length && members.length) {
      const dayCount = parseInt(period.month, 10) ? new Date(period.year, period.month, 0).getDate() : 31;
      let cols = '';
      for (let d = 1; d <= dayCount; d++) {
        const dayData = heatmap[String(d)] || {};
        let cells = '';
        members.forEach((m) => {
          const v = dayData[String(m.user_id)] ?? 0;
          const lvl = v === 0 ? '' : v === 1 ? 'l1' : v === 2 ? 'l2' : v >= 3 ? 'l4' : 'l3';
          cells += '<div class="stats-heatmap-cell ' + lvl + '" title="' + escapeHtml(m.first_name || '') + ': ' + v + ' (день ' + d + ')"></div>';
        });
        cols += '<div class="stats-heatmap-col"><div class="stats-heatmap-day">' + d + '</div>' + cells + '</div>';
      }
      blocks.push('<div class="stats-block stats-block-full"><div class="stats-block-title">📅 Активность по дням</div><div class="stats-heatmap-legend">' + members.map((m) => '<span>' + groupAvatar(m, 'sm') + ' ' + escapeHtml(m.first_name || '') + '</span>').join('') + '</div><div class="stats-heatmap-wrap"><div class="stats-heatmap">' + cols + '</div></div><div class="stats-heatmap-legend-bar">Меньше <span class="stats-heatmap-cell"></span><span class="stats-heatmap-cell l1"></span><span class="stats-heatmap-cell l2"></span><span class="stats-heatmap-cell l3"></span><span class="stats-heatmap-cell l4"></span> Больше</div></div>');
    }

    gridEl.innerHTML = blocks.join('');

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
  }

  function renderStatsPersonalShare(shareUrl) {
    const el = document.getElementById('stats-personal-share');
    if (!el) return;
    if (shareUrl) {
      el.innerHTML = '<div class="stats-group-header-inner"><h3 class="stats-group-title">Статистика</h3>' +
        '<div class="stats-group-share"><span class="stats-group-share-url">' + escapeHtml(shareUrl) + '</span>' +
        '<button type="button" class="stats-group-copy-btn" data-url="' + escapeHtml(shareUrl) + '">Копировать</button></div></div>';
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
              loadStats(monthEl ? parseInt(monthEl.value, 10) : now.getMonth() + 1, yearEl ? parseInt(yearEl.value, 10) : now.getFullYear());
            } else {
              this.disabled = false;
              this.textContent = 'Включить публичную ссылку';
            }
          })
          .catch(() => { this.disabled = false; this.textContent = 'Включить публичную ссылку'; });
      });
    }
  }

  function renderStatsSummary(s, elId) {
    const el = document.getElementById(elId || 'stats-summary');
    if (!el || !s) return;
    el.innerHTML = [
      { val: s.films_watched || 0, label: 'Фильмов' },
      { val: s.series_watched || 0, label: 'Сериалов' },
      { val: s.episodes_watched || 0, label: 'Серий' },
      { val: s.cinema_visits || 0, label: 'Походов в кино' },
      { val: s.total_watched != null ? s.total_watched : (s.films_watched || 0) + (s.series_watched || 0), label: 'Всего просмотров' },
      { val: s.avg_rating != null ? Number(s.avg_rating).toFixed(1) : '—', label: 'Средняя оценка' }
    ].map((x) => '<div class="stat-card"><div class="stat-card-value">' + escapeHtml(String(x.val)) + '</div><div class="stat-card-label">' + escapeHtml(x.label) + '</div></div>').join('');
  }

  function renderStatsTopFilms(list, elId) {
    const el = document.getElementById(elId || 'stats-top-films');
    if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="stats-block-title">🏆 Топ оценок</div><p class="empty-hint">Нет данных за выбранный период.</p>'; return; }
    el.innerHTML = '<div class="stats-block-title">🏆 Топ оценок</div>' + list.slice(0, 10).map((f, i) => {
      const poster = posterUrl(f.kp_id);
      return '<div class="top-film-row"><span class="top-film-rank">' + (i + 1) + '</span>' +
        (poster ? '<img src="' + poster + '" alt="" class="top-film-poster" loading="lazy">' : '<div class="top-film-poster"></div>') +
        '<div class="top-film-info"><div class="top-film-name">' + escapeHtml(f.title || '') + '</div><div class="top-film-meta">' + escapeHtml((f.year ? f.year + ' · ' : '') + (f.genre || '')) + '</div></div>' +
        '<span class="top-film-rating">⭐ ' + (f.rating != null ? f.rating : '—') + '</span></div>';
    }).join('');
  }

  function renderStatsRatingBreakdown(rb, elId) {
    const el = document.getElementById(elId || 'stats-rating-breakdown');
    if (!el) return;
    const max = Math.max(1, ...Object.values(rb).map(Number));
    const rows = [];
    for (let i = 10; i >= 1; i--) {
      const c = rb[i] != null ? Number(rb[i]) : 0;
      const pct = max ? (c / max) * 100 : 0;
      rows.push('<div class="rating-bar-row"><span class="rating-bar-label">' + i + '</span><div class="rating-bar-track"><div class="rating-bar-fill" style="width:' + pct + '%"></div></div><span>' + c + '</span></div>');
    }
    el.innerHTML = '<div class="stats-block-title">📊 Оценки</div>' + (rows.length ? rows.join('') : '<p class="empty-hint">Нет данных.</p>');
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

  function renderStatsWatched(list, elId) {
    const el = document.getElementById(elId || 'stats-watched');
    if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="stats-block-title">📋 Просмотренное</div><p class="empty-hint">Нет данных за выбранный период.</p>'; return; }
    el.innerHTML = '<div class="stats-block-title">📋 Просмотренное</div>' + list.map((w) => {
      const poster = posterUrl(w.kp_id);
      const typeLabel = w.type === 'series' ? 'Сериал' : 'Фильм';
      const dateStr = w.date ? new Date(w.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return '<div class="watched-row">' +
        (poster ? '<img src="' + poster + '" alt="" class="top-film-poster" loading="lazy">' : '<div class="top-film-poster"></div>') +
        '<div class="top-film-info"><div class="top-film-name">' + escapeHtml(w.title || '') + '</div><div class="top-film-meta">' + escapeHtml(typeLabel + (dateStr ? ' · ' + dateStr : '') + (w.rating != null ? ' · ⭐ ' + w.rating : '')) + '</div></div></div>';
    }).join('');
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

    document.querySelectorAll('.cabinet-nav [data-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sectionId = btn.getAttribute('data-section');
        showSection(sectionId);
        if (sectionId === 'stats') {
          initStatsSelectors();
          const monthEl = document.getElementById('stats-month');
          const yearEl = document.getElementById('stats-year');
          const now = new Date();
          loadStats(monthEl ? parseInt(monthEl.value, 10) : now.getMonth() + 1, yearEl ? parseInt(yearEl.value, 10) : now.getFullYear());
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
