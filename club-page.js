/* Club detail page — guests + members. Supports /club/{id} and /club/{slug}. */
(function (global) {
  'use strict';

  var CLUB_PATH_RE = /^\/club\/(-?\d+|[a-z0-9][a-z0-9-]{1,63})\/?$/i;
  var SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
  var state = {
    id: '',
    slug: '',
    club: null,
    members: [],
    posts: [],
    member: false,
    admin: false,
    tab: 'feed',
    slugDraft: '',
    slugBusy: false,
    composeOpen: false,
    composeBusy: false,
    composeBody: '',
    composeTitle: ''
  };
  var root;

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function hasToken() {
    try {
      return !!(typeof global.getToken === 'function' ? global.getToken() : localStorage.getItem('mp_site_token'));
    } catch (_) {
      return false;
    }
  }

  function toast(m, o) {
    try {
      if (global.showToast) global.showToast(m, o);
    } catch (_) {}
  }

  function req(path, opts) {
    if (hasToken() && typeof global.api === 'function') return global.api(path, opts || {});
    var base = (global.MP_API_BASE || global.API_BASE || '') || '';
    return fetch(base + path, Object.assign({ credentials: 'omit' }, opts || {})).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error((d && (d.message || d.error)) || ('HTTP ' + r.status));
        return d;
      });
    });
  }

  function arr(d, keys) {
    if (!d) return [];
    if (Array.isArray(d)) return d;
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(d[keys[i]])) return d[keys[i]];
    }
    return [];
  }

  function ids() {
    var out = [];
    try {
      var active = localStorage.getItem('mp_site_active_chat_id');
      if (active) out.push(String(active));
      var sessions = JSON.parse(localStorage.getItem('mp_site_sessions') || '[]');
      if (Array.isArray(sessions)) {
        sessions.forEach(function (s) {
          if (s && s.chat_id != null) out.push(String(s.chat_id));
          if (s && s.user_id != null) out.push(String(s.user_id));
        });
      }
    } catch (_) {}
    return out;
  }

  function poster(x) {
    return (x && (x.poster || x.poster_url || x.posterUrl || x.cover || x.image)) || '';
  }

  function title(x) {
    return (x && (x.title || x.name || x.nameRu || x.name_en)) || 'Фильм';
  }

  function link(x) {
    var kp = x && (x.kp_id || x.kinopoisk_id || x.kpId);
    return kp ? '/f/' + encodeURIComponent(String(kp)) : '';
  }

  function fmt(v) {
    if (!v) return '';
    try {
      var d = new Date(v);
      if (isNaN(d.getTime())) return String(v);
      return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return String(v);
    }
  }

  function matchClub(x, key) {
    if (!x || key == null) return false;
    var k = String(key);
    if (String(x.chat_id) === k || String(x.id) === k) return true;
    var slug = String(x.public_slug || x.slug || '').toLowerCase();
    return !!slug && slug === k.toLowerCase();
  }

  function publicPath(club) {
    var slug = club && (club.public_slug || club.slug || state.slug);
    if (slug && SLUG_RE.test(String(slug))) return '/club/' + String(slug).toLowerCase();
    var id = (club && (club.chat_id || club.id)) || state.id;
    return '/club/' + encodeURIComponent(String(id));
  }

  function shareUrl(club) {
    return 'https://movie-planner.ru' + publicPath(club) + '?invite=1';
  }

  function maybeCanonicalize(club) {
    try {
      var slug = club && (club.public_slug || club.slug);
      if (!slug || !SLUG_RE.test(String(slug))) return;
      var want = '/club/' + String(slug).toLowerCase();
      var cur = (location.pathname || '').replace(/\/$/, '') || '/';
      if (cur.toLowerCase() === want) {
        state.slug = String(slug).toLowerCase();
        return;
      }
      if (/^\/club\/-?\d+$/i.test(cur)) {
        history.replaceState(history.state, '', want + location.search + location.hash);
        state.slug = String(slug).toLowerCase();
      }
    } catch (_) {}
  }

  function norm(raw) {
    raw = raw || {};
    var plans = arr(raw, ['plans', 'schedule', 'upcoming_plans']);
    var recent = arr(raw, ['recent_watched', 'recent', 'watched', 'films']);
    if (raw.next_plan && !plans.length) plans = [raw.next_plan];
    return {
      raw: raw,
      chat_id: raw.chat_id != null ? raw.chat_id : raw.id,
      public_slug: raw.public_slug || raw.slug || '',
      name: raw.name || 'Киноклуб',
      emoji: raw.emoji || '🎬',
      cover: raw.cover_url || raw.cover || raw.avatar_url || '',
      description: raw.description || '',
      frequency: raw.watch_frequency_label || raw.frequency || '',
      members: raw.members_count != null ? raw.members_count : (raw.members || ''),
      films: raw.films_count != null ? raw.films_count : (recent.length || ''),
      plans: plans,
      recent: recent
    };
  }

  function isMeMember(m) {
    if (!m) return false;
    if (m.is_me || m.is_current || m.current || m.me) return true;
    var ci = ids();
    return [m.user_id, m.chat_id, m.id].some(function (i) {
      return i != null && ci.indexOf(String(i)) >= 0;
    });
  }

  function detect(meta) {
    meta = meta || {};
    var ci = ids();
    var raw = (state.club && state.club.raw) || {};
    var st = String(raw.membership || raw.my_membership || raw.join_status || raw.status || '').toLowerCase();
    var ownerId = raw.owner_user_id != null ? raw.owner_user_id
      : raw.owner_id != null ? raw.owner_id
      : raw.created_by_user_id != null ? raw.created_by_user_id
      : (meta.room && (meta.room.owner_id != null ? meta.room.owner_id : meta.room.owner_user_id));
    state.member = !!(
      raw.is_member ||
      raw.i_am_member ||
      meta.i_am_owner ||
      ['member', 'joined', 'approved'].indexOf(st) >= 0 ||
      state.members.some(isMeMember)
    );
    state.admin = !!(
      raw.is_admin ||
      raw.is_owner ||
      raw.owner === true ||
      meta.i_am_owner === true ||
      ['admin', 'administrator', 'owner', 'creator'].indexOf(st) >= 0 ||
      ['owner', 'admin', 'administrator', 'creator'].indexOf(String(meta.my_role || '').toLowerCase()) >= 0
    );
    if (!state.admin && ownerId != null && ci.indexOf(String(ownerId)) >= 0) {
      state.admin = true;
      state.member = true;
    }
    state.members.forEach(function (m) {
      var r = String(m.role || m.member_role || m.status || '').toLowerCase();
      if (!isMeMember(m)) return;
      state.member = true;
      if (m.is_owner || ['admin', 'administrator', 'owner', 'creator'].indexOf(r) >= 0) {
        state.admin = true;
      }
    });
  }

  function empty(h, p) {
    return (
      '<div class="club-empty"><div class="club-empty-icon">✦</div><h3>' +
      esc(h) +
      '</h3><p>' +
      esc(p) +
      '</p></div>'
    );
  }


  function icon(key, opts) {
    try {
      if (global.MPIcons && typeof global.MPIcons.html === 'function') {
        return global.MPIcons.html(key, opts || {});
      }
    } catch (_) {}
    return '';
  }

  function feedHtml() {
    var posts = state.posts || [];
    if (!posts.length) {
      return empty('Пока нет постов', 'Лента клуба появится, когда появятся посты и обсуждения.');
    }
    return (
      '<div class="club-feed">' +
      posts
        .map(function (p) {
          var who = p.author_name || 'Участник';
          var when = fmt(p.created_at);
          var title = p.title ? '<h3 class="club-post-title">' + esc(p.title) + '</h3>' : '';
          return (
            '<article class="club-post">' +
            '<header class="club-post-head"><b>' +
            esc(who) +
            '</b>' +
            (when ? '<time>' + esc(when) + '</time>' : '') +
            '</header>' +
            title +
            '<div class="club-post-body">' +
            esc(p.body || '').replace(/\n/g, '<br>') +
            '</div></article>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function composeHtml() {
    if (!state.composeOpen) return '';
    return (
      '<div class="club-compose-backdrop" data-club-compose-close>' +
      '<div class="club-compose" role="dialog" aria-modal="true" aria-label="Новый пост" data-club-compose-sheet>' +
      '<div class="club-compose-top"><h3>Новый пост</h3>' +
      '<button type="button" class="club-compose-x" data-club-compose-close aria-label="Закрыть">' +
      icon('x', { size: 'sm' }) +
      '</button></div>' +
      '<label class="club-field"><span>Заголовок <em>(необязательно)</em></span>' +
      '<input type="text" id="club-compose-title" maxlength="120" value="' +
      esc(state.composeTitle) +
      '" placeholder="О чём пост"></label>' +
      '<label class="club-field"><span>Текст</span>' +
      '<textarea id="club-compose-body" rows="6" maxlength="4000" placeholder="Напишите пост для ленты клуба…">' +
      esc(state.composeBody) +
      '</textarea></label>' +
      '<div class="club-compose-actions">' +
      '<button type="button" class="club-btn club-btn-ghost" data-club-compose-close>Отмена</button>' +
      '<button type="button" class="club-btn club-btn-primary" data-club-compose-publish' +
      (state.composeBusy ? ' disabled' : '') +
      '>' +
      (state.composeBusy ? 'Публикуем…' : 'Опубликовать') +
      '</button></div></div></div>'
    );
  }

  function fabHtml() {
    if (!state.admin || state.tab !== 'feed') return '';
    return (
      '<button type="button" class="club-fab" data-club-compose-open aria-label="Написать пост">' +
      icon('pencil', { size: 'md' }) +
      '</button>'
    );
  }

  function btn(id, label) {
    return (
      '<button type="button" class="club-tab' +
      (state.tab === id ? ' is-active' : '') +
      '" data-club-tab="' +
      id +
      '">' +
      label +
      '</button>'
    );
  }

  function schedule() {
    var rows = state.club.plans
      .map(function (p) {
        var im = poster(p);
        var l = link(p);
        var t = title(p);
        var dt = p.plan_datetime || p.when || p.date || p.planned_at || p.starts_at || p.watch_at;
        return (
          '<article class="club-schedule-item">' +
          (im
            ? '<img src="' + esc(im) + '" alt="" loading="lazy">'
            : '<div class="club-poster-empty">🎬</div>') +
          '<div><div class="club-when">' +
          esc(fmt(dt)) +
          '</div><h3>' +
          (l ? '<a href="' + esc(l) + '">' + esc(t) + '</a>' : esc(t)) +
          '</h3><p>' +
          esc(p.location || p.place || p.format || 'План клуба') +
          '</p>' +
          (state.member && p.zoom_url
            ? '<p><a href="' + esc(p.zoom_url) + '" rel="noopener">Ссылка на обсуждение</a></p>'
            : p.zoom_url
              ? '<p>Ссылка скрыта · вступите в клуб</p>'
              : '') +
          '</div>' +
          (state.member
            ? '<span class="club-status">✓ В плане</span>'
            : '<button type="button" class="club-mini-btn" data-club-join>Вступить</button>') +
          '</article>'
        );
      })
      .join('');
    return (
      '<section class="club-panel' +
      (state.tab === 'schedule' ? ' is-active' : '') +
      '" data-club-panel="schedule">' +
      (rows || empty('Расписание пока пусто', 'Ближайшие планы клуба появятся здесь.')) +
      '</section>'
    );
  }

  function films() {
    var cards = state.club.recent
      .map(function (f) {
        var im = poster(f);
        var l = link(f);
        return (
          '<article class="club-film-card">' +
          (im
            ? '<img src="' + esc(im) + '" alt="" loading="lazy">'
            : '<div class="club-film-empty">🎬</div>') +
          '<div class="club-film-title">' +
          (l ? '<a href="' + esc(l) + '">' + esc(title(f)) + '</a>' : esc(title(f))) +
          '</div><div class="club-film-meta">' +
          esc(fmt(f.watched_at || f.date || f.watched_on) || 'Просмотр клуба') +
          '</div></article>'
        );
      })
      .join('');
    return (
      '<section class="club-panel' +
      (state.tab === 'films' ? ' is-active' : '') +
      '" data-club-panel="films"><p class="club-panel-hint">Только фильмы из данных клуба — без выдуманной сетки.</p>' +
      (cards
        ? '<div class="club-films">' + cards + '</div>'
        : empty('Пока нет фильмов', 'Здесь появятся подтверждённые просмотры клуба.')) +
      '</section>'
    );
  }

  function members() {
    var rows = state.members
      .map(function (m) {
        var n = m.name || m.display_name || m.username || m.first_name || 'Участник';
        var av = m.photo_url || m.avatar_url || '';
        var r = String(m.role || m.member_role || m.status || '').toLowerCase();
        return (
          '<div class="club-member">' +
          (av
            ? '<img src="' + esc(av) + '" alt="">'
            : '<div class="club-avatar">' + esc(n.slice(0, 1)) + '</div>') +
          '<div><b>' +
          esc(n) +
          '</b><span>' +
          esc(
            r === 'owner' || r === 'creator'
              ? 'создатель'
              : r === 'admin' || r === 'administrator'
                ? 'админ'
                : 'участник'
          ) +
          '</span></div></div>'
        );
      })
      .join('');
    return (
      '<section class="club-panel' +
      (state.tab === 'members' ? ' is-active' : '') +
      '" data-club-panel="members">' +
      (rows
        ? '<div class="club-members">' + rows + '</div>'
        : empty(
            'Участники скрыты',
            hasToken() ? 'Список участников пока не загрузился.' : 'Войдите, чтобы увидеть участников клуба.'
          )) +
      '</section>'
    );
  }

  function settingsPanel() {
    if (!state.admin) return '';
    var slug = state.slugDraft != null && state.slugDraft !== '' ? state.slugDraft : state.club.public_slug || '';
    var preview = slug && SLUG_RE.test(String(slug).toLowerCase())
      ? 'movie-planner.ru/club/' + String(slug).toLowerCase()
      : 'movie-planner.ru/club/…';
    return (
      '<section class="club-panel' +
      (state.tab === 'settings' ? ' is-active' : '') +
      '" data-club-panel="settings"><div class="club-settings-card"><h3>Настройки клуба</h3>' +
      '<label class="club-field"><span>Публичный адрес</span>' +
      '<div class="club-slug-row"><span class="club-slug-prefix">movie-planner.ru/club/</span>' +
      '<input type="text" id="club-slug-input" maxlength="64" autocomplete="off" spellcheck="false" value="' +
      esc(slug) +
      '" placeholder="first-club"></div>' +
      '<small>Только латиница, цифры и дефис. Без минуса в id.</small></label>' +
      '<p class="club-slug-preview">Ссылка: <b>' +
      esc(preview) +
      '</b></p>' +
      '<div class="club-settings-actions">' +
      '<button type="button" class="club-mini-btn" data-club-save-slug' +
      (state.slugBusy ? ' disabled' : '') +
      '>' +
      (state.slugBusy ? 'Сохраняем…' : 'Сохранить адрес') +
      '</button>' +
      '<button type="button" class="club-mini-btn" data-club-copy>Скопировать ссылку</button>' +
      '</div>' +
      '' +
      '</div></section>'
    );
  }

  function render() {
    if (!root || !state.club) return;
    var c = state.club;
    var settings = state.admin;
    root.innerHTML =
      '<div class="club-page"><div class="club-layout"><aside class="club-aside"><div class="club-hero">' +
      (c.cover
        ? '<img class="club-cover-img" src="' + esc(c.cover) + '" alt="">'
        : '<div class="club-cover-empty">' + esc(c.emoji) + '</div>') +
      '<h1>' +
      esc(c.name) +
      '</h1><p class="club-sub">Публичный киноклуб' +
      (c.frequency ? ' · ' + esc(c.frequency) : '') +
      '</p><div class="club-stats"><span class="club-stat"><b>' +
      esc(c.members || '—') +
      '</b> участника</span><span class="club-stat"><b>' +
      esc(c.films || '—') +
      '</b> фильмов</span></div><div class="club-actions"><button type="button" class="club-btn club-btn-primary" data-club-join' +
      (state.member ? ' disabled' : '') +
      '>' +
      (state.member ? 'Вы в клубе' : 'Вступить') +
      '</button><button type="button" class="club-btn club-btn-ghost" data-club-share>Поделиться</button>' +
      (settings
        ? '<button type="button" class="club-btn club-btn-ghost" data-club-tab-jump="settings">Настройки</button>'
        : '') +
      '</div></div>' +
      (c.description
        ? '<div class="club-about"><h2>О клубе</h2><p>' + esc(c.description) + '</p></div>'
        : '') +
      '<div class="club-chips">' +
      (c.films ? '<span>🎞 ' + esc(c.films) + ' просмотров клуба</span>' : '') +
      (c.members ? '<span>👥 ' + esc(c.members) + ' участников</span>' : '') +
      (c.frequency ? '<span>◷ ' + esc(c.frequency) + '</span>' : '') +
      '</div></aside><main class="club-main"><nav class="club-tabs" role="tablist">' +
      btn('feed', 'Лента') +
      btn('schedule', 'Расписание') +
      btn('films', 'Фильмы') +
      btn('members', 'Участники') +
      btn('stats', 'Статистика') +
      (settings ? btn('settings', 'Настройки') : '') +
      '</nav><section class="club-panel' +
      (state.tab === 'feed' ? ' is-active' : '') +
      '" data-club-panel="feed">' +
      feedHtml() +
      '</section>' +
      schedule() +
      films() +
      members() +
      '<section class="club-panel' +
      (state.tab === 'stats' ? ' is-active' : '') +
      '" data-club-panel="stats">' +
      (c.films
        ? '<div class="club-highlight"><div><span>Просмотры клуба</span><b>' +
          esc(c.films) +
          '</b></div><div><span>Участники</span><b>' +
          esc(c.members || '—') +
          '</b></div></div>'
        : empty(
            'Статистика появится позже',
            'Нужны подтверждённые просмотры и оценки участников клуба.'
          )) +
      '</section>' +
      settingsPanel() +
      '</main></div>' +
      fabHtml() +
      composeHtml() +
      '</div>';
    bind();
  }

  function login() {
    try {
      sessionStorage.setItem('mp_oauth_return', location.pathname + location.search + location.hash);
    } catch (_) {}
    if (typeof global.requireAuthForAction === 'function') {
      global.requireAuthForAction('Войдите, чтобы вступить в киноклуб');
    } else if (typeof global.showLoginModalOverlay === 'function') {
      global.showLoginModalOverlay();
    }
  }

  function join() {
    if (state.member) return;
    if (!hasToken()) {
      login();
      return;
    }
    var b = root.querySelector('[data-club-join]');
    if (b) {
      b.disabled = true;
      b.textContent = 'Отправляем…';
    }
    global
      .api('/api/site/rooms/' + encodeURIComponent(state.id) + '/join-request', {
        method: 'POST',
        body: '{}'
      })
      .then(function (d) {
        var ok = d && (d.status === 'approved' || d.joined === true || d.is_member === true);
        toast(ok ? 'Вы вступили в киноклуб' : 'Заявка отправлена');
        state.member = ok;
        render();
      })
      .catch(function (e) {
        if (b) {
          b.disabled = false;
          b.textContent = 'Вступить';
        }
        toast((e && e.message) || 'Не удалось отправить заявку', { type: 'error' });
      });
  }

  function copy() {
    var v = shareUrl(state.club);
    var done = function () {
      toast('Ссылка скопирована');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(v).then(done).catch(function () {
        fallback(v, done);
      });
    } else fallback(v, done);
  }

  function fallback(v, done) {
    var i = document.createElement('input');
    i.value = v;
    i.style.position = 'fixed';
    i.style.opacity = '0';
    document.body.appendChild(i);
    i.select();
    try {
      document.execCommand('copy');
    } catch (_) {}
    i.remove();
    done();
  }

  function saveSlug() {
    if (!state.admin || state.slugBusy) return;
    var input = root.querySelector('#club-slug-input');
    var raw = String((input && input.value) || '')
      .trim()
      .toLowerCase();
    if (!SLUG_RE.test(raw)) {
      toast('Адрес: 2–64 символа, латиница, цифры, дефис', { type: 'error' });
      return;
    }
    state.slugBusy = true;
    state.slugDraft = raw;
    render();
    global
      .api('/api/site/rooms/' + encodeURIComponent(state.id) + '/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_slug: raw })
      })
      .then(function (d) {
        var slug = (d && (d.public_slug || (d.room && d.room.public_slug))) || raw;
        state.club.public_slug = slug;
        state.club.raw.public_slug = slug;
        state.slug = slug;
        state.slugDraft = slug;
        state.slugBusy = false;
        maybeCanonicalize(state.club);
        toast('Адрес сохранён');
        render();
      })
      .catch(function (e) {
        state.slugBusy = false;
        render();
        toast((e && e.message) || 'Не удалось сохранить адрес', { type: 'error' });
      });
  }

  function tab(t, replace) {
    var a = ['feed', 'schedule', 'films', 'members', 'stats', 'settings'];
    if (a.indexOf(t) < 0 || (t === 'settings' && !state.admin)) t = 'feed';
    state.tab = t;
    try {
      history[replace ? 'replaceState' : 'pushState'](
        { clubTab: t },
        '',
        location.pathname + location.search + (t === 'feed' ? '' : '#' + t)
      );
    } catch (_) {}
    render();
  }


  function openCompose() {
    if (!state.admin) return;
    if (!hasToken()) {
      login();
      return;
    }
    state.composeOpen = true;
    state.composeBusy = false;
    render();
    setTimeout(function () {
      var ta = root.querySelector('#club-compose-body');
      if (ta) ta.focus();
    }, 30);
  }

  function closeCompose() {
    if (state.composeBusy) return;
    state.composeOpen = false;
    render();
  }

  function publishPost() {
    if (!state.admin || state.composeBusy) return;
    if (!hasToken()) {
      login();
      return;
    }
    var titleEl = root.querySelector('#club-compose-title');
    var bodyEl = root.querySelector('#club-compose-body');
    var title = String((titleEl && titleEl.value) || '').trim();
    var body = String((bodyEl && bodyEl.value) || '').trim();
    if (!body) {
      toast('Напишите текст поста', { type: 'error' });
      return;
    }
    state.composeTitle = title;
    state.composeBody = body;
    state.composeBusy = true;
    render();
    global
      .api('/api/site/rooms/' + encodeURIComponent(state.id) + '/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || null, body: body })
      })
      .then(function (d) {
        var post = d && (d.post || d.item);
        if (post) state.posts = [post].concat(state.posts || []);
        state.composeBusy = false;
        state.composeOpen = false;
        state.composeBody = '';
        state.composeTitle = '';
        toast('Пост опубликован');
        render();
      })
      .catch(function (e) {
        state.composeBusy = false;
        render();
        toast((e && e.message) || 'Не удалось опубликовать', { type: 'error' });
      });
  }

  function loadPosts() {
    if (!state.id) return Promise.resolve();
    return req('/api/site/rooms/' + encodeURIComponent(state.id) + '/posts?limit=50')
      .then(function (d) {
        state.posts = arr(d, ['posts', 'items', 'feed']);
      })
      .catch(function () {
        state.posts = state.posts || [];
      });
  }

  function bind() {
    root.querySelectorAll('[data-club-tab]').forEach(function (b) {
      b.onclick = function () {
        tab(b.getAttribute('data-club-tab'));
      };
    });
    root.querySelectorAll('[data-club-tab-jump]').forEach(function (b) {
      b.onclick = function () {
        tab(b.getAttribute('data-club-tab-jump'));
      };
    });
    root.querySelectorAll('[data-club-join]').forEach(function (b) {
      b.onclick = join;
    });
    root.querySelectorAll('[data-club-share], [data-club-copy]').forEach(function (b) {
      b.onclick = copy;
    });
    var save = root.querySelector('[data-club-save-slug]');
    if (save) save.onclick = saveSlug;
    var input = root.querySelector('#club-slug-input');
    if (input) {
      input.oninput = function () {
        state.slugDraft = input.value;
        var preview = root.querySelector('.club-slug-preview b');
        var v = String(input.value || '')
          .trim()
          .toLowerCase();
        if (preview) {
          preview.textContent = SLUG_RE.test(v)
            ? 'movie-planner.ru/club/' + v
            : 'movie-planner.ru/club/…';
        }
      };
    }
    var fab = root.querySelector('[data-club-compose-open]');
    if (fab) fab.onclick = openCompose;
    root.querySelectorAll('[data-club-compose-close]').forEach(function (b) {
      b.onclick = function (e) {
        if (b.getAttribute('data-club-compose-sheet') != null) return;
        if (b.classList.contains('club-compose-backdrop') && e.target !== b) return;
        closeCompose();
      };
    });
    var sheet = root.querySelector('[data-club-compose-sheet]');
    if (sheet) {
      sheet.onclick = function (e) {
        e.stopPropagation();
      };
    }
    var pub = root.querySelector('[data-club-compose-publish]');
    if (pub) pub.onclick = publishPost;
    var titleIn = root.querySelector('#club-compose-title');
    var bodyIn = root.querySelector('#club-compose-body');
    if (titleIn) {
      titleIn.oninput = function () {
        state.composeTitle = titleIn.value;
      };
    }
    if (bodyIn) {
      bodyIn.oninput = function () {
        state.composeBody = bodyIn.value;
      };
    }
  }

  function findInList(d, key) {
    return arr(d, ['groups', 'items', 'clubs']).find(function (x) {
      return matchClub(x, key);
    });
  }

  function load(key) {
    state.id = String(key);
    state.slug = SLUG_RE.test(String(key)) ? String(key).toLowerCase() : '';
    root.innerHTML = '<div class="club-loading" role="status">Загружаем киноклуб…</div>';

    var byKey = req('/api/public/cinema-clubs/' + encodeURIComponent(String(key))).catch(function () {
      return null;
    });
    var catalog = req('/api/public/cinema-clubs?limit=100&offset=0');
    var mem =
      hasToken() && typeof global.api === 'function'
        ? Promise.resolve(null)
        : Promise.resolve({});

    return Promise.all([byKey, catalog])
      .then(function (pair) {
        var one = pair[0] && (pair[0].group || pair[0].club || pair[0].item || (pair[0].success && pair[0]));
        if (one && (one.chat_id != null || one.id != null || one.name)) {
          return one;
        }
        return findInList(pair[1], key);
      })
      .then(function (club) {
        if (!club && hasToken() && typeof global.api === 'function') {
          return global
            .api('/api/site/groups/discover?kind=cinema_club&discoverable_only=0&limit=100')
            .then(function (d) {
              return findInList(d, key);
            });
        }
        return club;
      })
      .then(function (club) {
        if (!club) throw new Error('Киноклуб не найден');
        state.club = norm(club);
        state.id = String(state.club.chat_id);
        state.slug = state.club.public_slug || state.slug;
        state.slugDraft = state.slug || '';
        maybeCanonicalize(state.club);
        detect({});
        if (state.admin) render();
        var membersPromise =
          hasToken() && typeof global.api === 'function'
            ? global.api('/api/site/rooms/' + encodeURIComponent(state.id) + '/members').catch(function () {
                return {};
              })
            : Promise.resolve({});
        return membersPromise.then(function (m) {
          state.members = arr(m, ['members', 'items', 'users']);
          detect(m || {});
          render();
          return loadPosts().then(function () {
            render();
          });
        });
      })
      .catch(function (e) {
        root.innerHTML = empty(
          'Не удалось открыть клуб',
          e && e.message === 'Киноклуб не найден'
            ? 'Проверьте ссылку или вернитесь в каталог киноклубов.'
            : 'Попробуйте обновить страницу позже.'
        );
      });
  }

  function mount(id) {
    root = document.getElementById('club-page-root');
    if (!root || !id) return;
    var h = String(location.hash || '').replace(/^#\/?/, '');
    state.tab = h || 'feed';
    load(id);
  }

  function boot() {
    var m = String(location.pathname || '').match(CLUB_PATH_RE);
    if (m) mount(m[1]);
  }

  global.MPClubPage = {
    mount: mount,
    reload: function () {
      if (state.id) load(state.slug || state.id);
    }
  };

  window.addEventListener('hashchange', function () {
    if (state.id) tab(String(location.hash || '').replace(/^#\/?/, '') || 'feed', true);
  });
  window.addEventListener('popstate', function () {
    var m = String(location.pathname || '').match(CLUB_PATH_RE);
    if (m) {
      if (m[1] !== state.id && m[1].toLowerCase() !== String(state.slug || '').toLowerCase()) mount(m[1]);
      else tab(String(location.hash || '').replace(/^#\/?/, '') || 'feed', true);
    }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})(window);
