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
  const EXTENSION_LINK = 'https://chromewebstore.google.com/detail/movie-planner-bot/fldeclcfcngcjphhklommcebkpfipdol';

  function posterUrl(kpId) {
    if (!kpId) return '';
    return 'https://st.kp.yandex.net/images/film_big/' + String(kpId).replace(/\D/g, '') + '.jpg';
  }

  const STORAGE_TOKEN = 'mp_site_token';

  function getToken() {
    return localStorage.getItem(STORAGE_TOKEN);
  }

  function setToken(token) {
    if (token) localStorage.setItem(STORAGE_TOKEN, token);
    else localStorage.removeItem(STORAGE_TOKEN);
  }

  function api(url, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + url, { ...options, headers }).then((r) => {
      if (r.status === 401) {
        setToken(null);
        window.dispatchEvent(new CustomEvent('mp:logout'));
      }
      return r.json().catch(() => ({}));
    });
  }

  function filmDeepLink(kpId, isSeries) {
    const type = isSeries ? 'series' : 'film';
    return `${BOT_LINK}?start=view_${type}_${kpId}`;
  }

  function planDeepLink() {
    return BOT_START_LINK;
  }

  // ——— UI: шапка, модалка входа, переключение контента ———
  function renderHeader(me) {
    const header = document.getElementById('site-header');
    if (!header) return;
    const loginBtn = header.querySelector('[data-action="login"]');
    const cabinetBtn = header.querySelector('[data-action="cabinet-name"]');
    const logoutBtn = header.querySelector('[data-action="logout"]');
    if (me && me.name) {
      if (loginBtn) loginBtn.classList.add('hidden');
      if (cabinetBtn) {
        cabinetBtn.textContent = me.name;
        cabinetBtn.classList.remove('hidden');
      }
      if (logoutBtn) logoutBtn.classList.remove('hidden');
    } else {
      if (loginBtn) loginBtn.classList.remove('hidden');
      if (cabinetBtn) cabinetBtn.classList.add('hidden');
      if (logoutBtn) logoutBtn.classList.add('hidden');
    }
  }

  function showScreen(screenId) {
    ['landing', 'cabinet-readonly', 'cabinet-onboarding'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
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
    const closeBtn = document.querySelector('[data-action="close-login"]');
    const form = document.getElementById('login-form');
    const status = document.getElementById('login-status');

    if (openBtn) openBtn.addEventListener('click', () => modal && modal.classList.remove('hidden'));
    if (closeBtn) closeBtn.addEventListener('click', () => modal && modal.classList.add('hidden'));
    modal && modal.querySelector('.modal-backdrop') && modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.add('hidden'));

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
          setToken(data.token);
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
      renderHeader(me);
      if (me.has_data) {
        showScreen('cabinet-readonly');
        loadPlans();
        loadUnwatched();
        loadSeries();
        loadRatings();
      } else {
        showScreen('cabinet-onboarding');
      }
    });
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
        const dateStr = dt ? dt.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        const typeLabel = p.plan_type === 'cinema' ? '🎥 В кино' : '🏠 Дома';
        const link = filmDeepLink(p.kp_id, p.is_series);
        const poster = posterUrl(p.kp_id);
        return `
          <div class="card plan-card">
            <div class="card-poster-wrap">
              ${poster ? '<img src="' + poster + '" alt="" class="card-poster" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : ''}
              <div class="film-poster-placeholder" style="${poster ? 'display:none' : ''}">🎬</div>
            </div>
            <div class="plan-date">📅 ${dateStr}</div>
            <div class="plan-title">🎬 ${escapeHtml(p.title)}</div>
            <div class="plan-type">${typeLabel}</div>
            <a href="${link}" target="_blank" rel="noopener" class="btn btn-small btn-primary">Открыть в Telegram</a>
          </div>`;
      };
      if (homeEl) homeEl.innerHTML = (data.home && data.home.length) ? data.home.map(renderPlan).join('') : '<p class="empty-hint">Нет планов просмотра дома.</p>';
      if (cinemaEl) cinemaEl.innerHTML = (data.cinema && data.cinema.length) ? data.cinema.map(renderPlan).join('') : '<p class="empty-hint">Нет планов в кино.</p>';
      const all = [...(data.home || []), ...(data.cinema || [])].slice(0, 3);
      const todayWrap = document.getElementById('plans-today-wrap');
      if (todayWrap) todayWrap.classList.toggle('hidden', !all.length);
      if (plansTodayEl) plansTodayEl.innerHTML = all.length ? all.map(renderPlan).join('') : '';
    });
  }

  function loadUnwatched() {
    api('/api/site/unwatched').then((data) => {
      if (!data.success) return;
      const el = document.getElementById('unwatched-list');
      if (!el) return;
      el.innerHTML = (data.items && data.items.length)
        ? data.items.map((m) => {
            const link = filmDeepLink(m.kp_id, m.is_series);
            const year = m.year ? ` (${m.year})` : '';
            const poster = posterUrl(m.kp_id);
            return `
              <div class="card film-card">
                <div class="card-poster-wrap">
                  ${poster ? '<img src="' + poster + '" alt="" class="card-poster" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : ''}
                  <div class="film-poster-placeholder" style="${poster ? 'display:none' : ''}">${m.is_series ? '📺' : '🎬'}</div>
                </div>
                <div class="film-info">
                  <div class="film-title">${escapeHtml(m.title)}${year}</div>
                  <div class="film-status">Статус: В базе</div>
                  <a href="${link}" target="_blank" rel="noopener" class="btn btn-small btn-primary">Продолжить в Telegram</a>
                </div>
              </div>`;
          }).join('')
        : '<p class="empty-hint">Нет непросмотренных. Добавьте фильмы в боте.</p>';
    });
  }

  function loadSeries() {
    api('/api/site/series').then((data) => {
      if (!data.success) return;
      const el = document.getElementById('series-list');
      if (!el) return;
      el.innerHTML = (data.items && data.items.length)
        ? data.items.map((s) => {
            const link = filmDeepLink(s.kp_id, true);
            const progress = s.progress ? `Прогресс: ${s.progress}` : 'Не начат';
            const poster = posterUrl(s.kp_id);
            return `
              <div class="card series-card">
                <div class="card-poster-wrap">
                  ${poster ? '<img src="' + poster + '" alt="" class="card-poster" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : ''}
                  <div class="film-poster-placeholder" style="${poster ? 'display:none' : ''}">📺</div>
                </div>
                <div class="film-info">
                  <div class="film-title">${escapeHtml(s.title)}</div>
                  <div class="film-status">${progress}</div>
                  <a href="${link}" target="_blank" rel="noopener" class="btn btn-small btn-primary">Продолжить в Telegram</a>
                </div>
              </div>`;
          }).join('')
        : '<p class="empty-hint">Нет сериалов. Добавьте в боте.</p>';
    });
  }

  function loadRatings() {
    api('/api/site/ratings').then((data) => {
      if (!data.success) return;
      const el = document.getElementById('ratings-list');
      if (!el) return;
      el.innerHTML = (data.items && data.items.length)
        ? data.items.map((r) => {
            const link = filmDeepLink(r.kp_id, false);
            const year = r.year ? ` (${r.year})` : '';
            const poster = posterUrl(r.kp_id);
            return `
              <div class="card film-card">
                <div class="card-poster-wrap">
                  ${poster ? '<img src="' + poster + '" alt="" class="card-poster" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : ''}
                  <div class="film-poster-placeholder" style="${poster ? 'display:none' : ''}">⭐</div>
                </div>
                <div class="film-info">
                  <div class="film-title">${escapeHtml(r.title)}${year}</div>
                  <div class="film-status">⭐ ${r.rating}</div>
                  <a href="${link}" target="_blank" rel="noopener" class="btn btn-small btn-primary">Открыть в боте</a>
                </div>
              </div>`;
          }).join('')
        : '<p class="empty-hint">Нет оценок.</p>';
    });
  }

  function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
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
  function init() {
    bindLogin();
    bindFaq();

    document.querySelectorAll('.cabinet-nav [data-section]').forEach((btn) => {
      btn.addEventListener('click', () => showSection(btn.getAttribute('data-section')));
    });

    document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setToken(null);
        renderHeader(null);
        showScreen('landing');
      });
    });

    window.addEventListener('mp:logout', () => {
      renderHeader(null);
      showScreen('landing');
    });

    if (getToken()) {
      loadMeAndShowCabinet();
    } else {
      showScreen('landing');
      renderHeader(null);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
