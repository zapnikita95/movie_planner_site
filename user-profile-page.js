/**
 * Страница пользователя в веб-кабинете (паритет с native /friends/:userId).
 */
(function (global) {
  'use strict';

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function mpIcon(key, opts) {
    try {
      if (global.MPIcons && typeof global.MPIcons.html === 'function') {
        opts = opts || {};
        return global.MPIcons.html(key, {
          className: opts.className || 'mp-list-icon',
          size: opts.size || 'md',
        });
      }
    } catch (_e) {}
    return '';
  }

  function statusLabel(status) {
    return ({
      accepted: 'Друзья',
      friends: 'Друзья',
      pending_outgoing: 'Запрос отправлен',
      pending_incoming: 'Хочет дружить',
      declined: 'Не в друзьях',
    })[status] || '';
  }

  function achName(a) {
    const id = String((a && (a.id || a.achievement_id)) || '').trim();
    const raw = (a && a.name) || '';
    return raw && raw !== id ? raw : 'Ачивка';
  }

  function achTip(a) {
    const name = achName(a);
    const desc = (a && a.description) || '';
    return desc ? name + ' — ' + desc : name;
  }

  function presetAvatarUrlForUser(userId) {
    const n = Math.abs(Number(userId) || 0);
    const id = String((n % 7) + 1).padStart(2, '0');
    var base = (typeof global !== 'undefined' && global.API_BASE) || '';
    return base + '/api/avatar/defaults/' + id + '.jpg';
  }

  function setAvatarEl(el, photoUrl, initial, userId) {
    if (!el) return;
    var preset = presetAvatarUrlForUser(userId);
    var src = photoUrl || preset;
    if (src && src.indexOf('/api/') === 0 && src.indexOf('http') !== 0) {
      var base = (typeof global !== 'undefined' && global.API_BASE) || '';
      src = base + src;
    }
    if (src) {
      el.innerHTML = '<img src="' + escapeHtml(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
      var img = el.querySelector('img');
      if (img) {
        img.addEventListener('error', function () {
          if (img.dataset.mpAvatarFallback === '1') {
            el.textContent = initial;
            return;
          }
          img.dataset.mpAvatarFallback = '1';
          img.src = preset;
        }, { once: false });
      }
    } else {
      el.textContent = initial;
    }
  }

  function achCircleHtml(a) {
    const id = String((a && (a.id || a.achievement_id)) || '').trim();
    const tip = achTip(a);
    const name = achName(a);
    const desc = (a && a.description) || '';
    const icon = (a && a.icon) || '🏅';
    return (
      '<button type="button" class="user-profile-ach" data-ach-id="' + escapeHtml(id) + '" aria-label="' + escapeHtml(tip) + '">' +
        '<span class="user-profile-ach-icon" aria-hidden="true">' + escapeHtml(icon) + '</span>' +
        '<span class="user-profile-ach-tip" role="tooltip">' +
          '<span class="user-profile-ach-tip-name">' + escapeHtml(name) + '</span>' +
          (desc ? '<span class="user-profile-ach-tip-desc">' + escapeHtml(desc) + '</span>' : '') +
        '</span>' +
      '</button>'
    );
  }

  function achCardHtml(a) {
    const tip = achTip(a);
    const name = achName(a);
    const desc = (a && a.description) || '';
    const icon = (a && a.icon) || '🏅';
    return (
      '<div class="ach-panel-card earned user-profile-ach-card" tabindex="0" role="button" aria-label="' + escapeHtml(tip) + '">' +
        '<div class="ach-panel-icon">' + escapeHtml(icon) + '</div>' +
        '<div class="ach-panel-info">' +
          '<div class="ach-panel-name">' + escapeHtml(name) + '</div>' +
          (desc ? '<div class="ach-panel-desc">' + escapeHtml(desc) + '</div>' : '') +
        '</div>' +
      '</div>'
    );
  }

  function posterForFilm(hooks, kp) {
    if (hooks && typeof hooks.resolvePosterUrl === 'function') {
      return hooks.resolvePosterUrl(kp) || '';
    }
    return '';
  }

  function filmPosterCardHtml(item, hooks, opts) {
    opts = opts || {};
    const kp = item && item.kp_id;
    if (!kp) return '';
    const poster = posterForFilm(hooks, kp);
    const title = escapeHtml(item.film_title || item.title || 'Фильм');
    const badge = opts.rating != null
      ? '<span class="profile-film-card-badge">' + escapeHtml(String(opts.rating)) + '/10</span>'
      : (opts.planType
        ? '<span class="profile-film-card-badge profile-film-card-badge--plan">' + escapeHtml(opts.planType === 'cinema' ? 'Кино' : 'Дом') + '</span>'
        : '');
    return (
      '<button type="button" class="profile-film-card" data-kp="' + escapeHtml(String(kp)) + '" title="' + title + '">' +
        '<span class="profile-film-card-poster">' +
          (poster
            ? '<img src="' + escapeHtml(poster) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
            : '<span class="profile-film-card-ph">🎬</span>') +
          badge +
        '</span>' +
        '<span class="profile-film-card-title">' + title + '</span>' +
      '</button>'
    );
  }

  function filmPreviewBlockHtml(title, films, hooks, opts) {
    opts = opts || {};
    const list = (films || []).slice(0, opts.limit || 8);
    if (!list.length) return '';
    const action = opts.action
      ? '<button type="button" class="link-inline home-dash-more profile-film-block-more" data-action="' + escapeHtml(opts.action) + '">Весь список →</button>'
      : '';
    return (
      '<section class="profile-film-block">' +
        '<div class="profile-film-block-head">' +
          '<h3 class="profile-film-block-title">' + escapeHtml(title) + '</h3>' +
          action +
        '</div>' +
        '<div class="profile-film-rail">' +
          list.map(function (f) {
            return filmPosterCardHtml(f, hooks, {
              rating: opts.ratingField ? f[opts.ratingField] : null,
              planType: opts.planField ? f[opts.planField] : null,
            });
          }).join('') +
        '</div>' +
      '</section>'
    );
  }

  function activityEventLabel(item) {
    const et = item && item.event_type;
    if (et === 'rating') {
      const title = item.film_title || 'фильм';
      const score = item.value != null ? String(item.value) : '—';
      return 'Оценил «' + title + '» — ' + score + '/10';
    }
    if (et === 'plan_home') return 'Запланировал дома «' + (item.film_title || 'фильм') + '»';
    if (et === 'plan_cinema') return 'Запланировал в кино «' + (item.film_title || 'фильм') + '»';
    if (et === 'achievement') {
      const ach = item.achievement || {};
      return 'Получил «' + (ach.name || item.extra || 'ачивку') + '»';
    }
    return '';
  }

  function activityEventIcon(item) {
    const et = item && item.event_type;
    if (et === 'rating') return '⭐';
    if (et === 'plan_cinema') return '🎟';
    if (et === 'plan_home') return '📅';
    if (et === 'achievement') return (item.achievement && item.achievement.icon) || '🏅';
    return '•';
  }

  function formatActivityWhen(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const now = new Date();
      const diffMs = now - d;
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffDays <= 0) return 'сегодня';
      if (diffDays === 1) return 'вчера';
      if (diffDays < 7) return diffDays + ' дн. назад';
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch (_e) {
      return '';
    }
  }

  function activityPreviewBlockHtml(items, hooks) {
    const list = (items || []).slice(0, 8);
    if (!list.length) return '';
    return (
      '<section class="profile-activity-block">' +
        '<div class="profile-film-block-head">' +
          '<h3 class="profile-film-block-title">Недавняя активность</h3>' +
        '</div>' +
        '<div class="profile-activity-list">' +
          list.map(function (item) {
            const kp = item && item.kp_id;
            const label = activityEventLabel(item);
            const when = formatActivityWhen(item.happened_at);
            return (
              '<button type="button" class="profile-activity-row"' +
                (kp ? ' data-kp="' + escapeHtml(String(kp)) + '"' : '') +
                '>' +
                '<span class="profile-activity-row-icon" aria-hidden="true">' + escapeHtml(activityEventIcon(item)) + '</span>' +
                '<span class="profile-activity-row-text">' + escapeHtml(label) + '</span>' +
                (when ? '<span class="profile-activity-row-meta">' + escapeHtml(when) + '</span>' : '') +
              '</button>'
            );
          }).join('') +
        '</div>' +
      '</section>'
    );
  }

  function bindActivityRows(root, hooks) {
    root.querySelectorAll('.profile-activity-row[data-kp]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const kp = btn.getAttribute('data-kp');
        if (kp && hooks.onFilmKp) hooks.onFilmKp(kp);
      });
    });
  }

  function bindFilmCards(root, hooks) {
    root.querySelectorAll('.profile-film-card[data-kp]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const kp = btn.getAttribute('data-kp');
        if (kp && hooks.onFilmKp) hooks.onFilmKp(kp);
      });
    });
  }

  function openAchievementsModal(achievements, achTotal) {
    const items = Array.isArray(achievements) ? achievements : [];
    if (!items.length) return;
    const overlay = document.createElement('div');
    overlay.className = 'mp-dialog-overlay';
    overlay.innerHTML =
      '<div class="mp-dialog-card profile-ach-dialog" role="dialog" aria-modal="true">' +
        '<div class="profile-ach-dialog-head">' +
          '<h3 class="profile-sub-title">Достижения</h3>' +
          '<button type="button" class="ach-panel-close profile-ach-dialog-close" aria-label="Закрыть">✕</button>' +
        '</div>' +
        '<p class="cabinet-hint user-profile-ach-sub-count">' +
          escapeHtml(String(items.length)) + ' из ' + escapeHtml(String(achTotal || items.length)) +
        '</p>' +
        '<div class="profile-ach-dialog-grid">' + items.map(achCardHtml).join('') + '</div>' +
      '</div>';
    document.body.style.overflow = 'hidden';
    document.body.appendChild(overlay);
    function close() {
      document.body.style.overflow = '';
      overlay.remove();
    }
    overlay.querySelector('.profile-ach-dialog-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
  }

  function achPreviewHtml(allAchievements, achTotal) {
    const items = (allAchievements || []).slice(0, 6);
    if (!items.length && !achTotal) return '';
    return (
      '<div class="profile-ach-preview">' +
        '<div class="profile-ach-preview-head">' +
          '<span class="profile-ach-preview-label">Достижения</span>' +
          (achTotal > 0
            ? '<button type="button" class="link-inline home-dash-more" data-action="ach-all">Все достижения →</button>'
            : '') +
        '</div>' +
        '<div class="user-profile-ach-row">' +
          items.map(achCircleHtml).join('') +
        '</div>' +
      '</div>'
    );
  }

  function ratingRowHtml(r, hooks) {
    const kp = r && r.kp_id;
    const title = escapeHtml(r.film_title || 'Фильм');
    const score = r.rating != null ? String(r.rating) : '—';
    return (
      '<button type="button" class="user-profile-rating-row" data-kp="' + escapeHtml(String(kp || '')) + '">' +
        '<span class="user-profile-rating-title">' + title + '</span>' +
        '<span class="user-profile-rating-score">' + escapeHtml(score) +
          '<span class="user-profile-rating-denom">/10</span></span>' +
      '</button>'
    );
  }

  function bindRatingRows(root, hooks) {
    root.querySelectorAll('.user-profile-rating-row[data-kp]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const kp = btn.getAttribute('data-kp');
        if (kp && hooks.onFilmKp) hooks.onFilmKp(kp);
      });
    });
  }

  function renderMainView(root, data, hooks) {
    const uid = Number(data.user_id);
    const st = data.friendship_status;
    const isFriend = st === 'accepted' || st === 'friends';
    const isSelf = hooks.viewerUserId != null && Number(hooks.viewerUserId) === uid;
    const photo = hooks.resolvePhotoUrl ? hooks.resolvePhotoUrl(data.photo_url, data) : (data.photo_url || '');
    const initial = String(data.name || '?').trim().charAt(0).toUpperCase() || '?';

    const metaParts = [];
    if (statusLabel(st) && !isSelf) metaParts.push(statusLabel(st));
    if (data.coins != null && (isFriend || isSelf)) metaParts.push('🪙 ' + String(data.coins));
    if (data.streak_days > 0 && (isFriend || isSelf)) metaParts.push('🔥 ' + String(data.streak_days) + ' дн.');
    const metaHtml = metaParts.length
      ? '<div class="profile-hub-meta">' + escapeHtml(metaParts.join(' · ')) + '</div>'
      : '';

    const unwatched = data.unwatched_count != null ? data.unwatched_count : 0;
    const watched = data.watched_count != null ? data.watched_count : null;
    const statsHtml =
      '<div class="profile-hub-highlights">' +
        '<button type="button" class="profile-hub-stat" data-action="ratings-all">' +
          '<b>' + escapeHtml(String(data.ratings_count || 0)) + '</b><span>оценок</span></button>' +
        (isFriend || isSelf
          ? '<button type="button" class="profile-hub-stat" data-action="unwatched-all">' +
              '<b>' + escapeHtml(String(unwatched)) + '</b><span>ждут</span></button>'
          : '') +
        (watched != null && (isFriend || isSelf)
          ? '<button type="button" class="profile-hub-stat" data-action="watched-all">' +
              '<b>' + escapeHtml(String(watched)) + '</b><span>смотрел</span></button>'
          : '') +
        '<button type="button" class="profile-hub-stat" data-action="ach-open">' +
          '<b>' + escapeHtml(String(data.achievements_count || (data.achievements || []).length || 0)) + '</b><span>ачивок</span></button>' +
      '</div>';

    const allAchievements = data.achievements || [];
    const achTotal = Number(data.achievements_count || allAchievements.length || 0);

    let leftActionsHtml = '';
    if (!isSelf) {
      if (isFriend) {
        leftActionsHtml =
          '<button type="button" class="btn btn-secondary btn-full profile-hub-mutual" data-action="mutual">' +
            mpIcon('film', { className: 'mp-action-icon', size: 'sm' }) + '<span>Смотрим вместе</span></button>';
      } else if (st === 'pending_incoming') {
        leftActionsHtml =
          '<div class="user-profile-actions">' +
            '<p class="cabinet-hint user-profile-hint">Хочет добавить вас в друзья</p>' +
            '<div class="user-profile-actions--row">' +
              '<button type="button" class="btn btn-primary user-profile-action-main" data-action="accept">Принять</button>' +
              '<button type="button" class="btn btn-ghost user-profile-action-side" data-action="decline">✕</button>' +
            '</div></div>';
      } else if (st === 'pending_outgoing') {
        leftActionsHtml = '<p class="cabinet-hint user-profile-hint">Запрос отправлен — ждём ответа</p>';
      } else if (hooks.isInviteLanding && !isSelf) {
        leftActionsHtml =
          '<div class="user-profile-actions">' +
            '<p class="cabinet-hint user-profile-hint">Приглашает вас в друзья</p>' +
            '<button type="button" class="btn btn-primary user-profile-action-main" data-action="accept-invite">Принять приглашение</button>' +
          '</div>';
      } else {
        leftActionsHtml =
          '<button type="button" class="btn btn-primary btn-full" data-action="add">Добавить в друзья</button>';
      }
    }

    const tasteHtml = data.taste_match != null && !isSelf
      ? '<button type="button" class="mp-list-item user-profile-taste-row" data-action="taste">' +
          mpIcon('stats', { className: 'mp-list-icon' }) +
          '<span class="mp-list-text"><span class="mp-list-title">' + escapeHtml(String(data.taste_match)) + '% совпадение вкусов</span>' +
          (data.taste_common
            ? '<span class="mp-list-hint">' + escapeHtml(String(data.taste_common)) + ' общих оценок</span>'
            : '') +
          '</span><span class="mp-list-arrow">›</span></button>'
      : '';

    const rightHtml =
      tasteHtml +
      filmPreviewBlockHtml('Последние оценки', data.recent_ratings, hooks, {
        action: 'ratings-all',
        limit: 8,
        ratingField: 'rating',
      }) +
      filmPreviewBlockHtml('Недавно просмотренные', data.recent_watched, hooks, {
        action: 'watched-all',
        limit: 8,
      }) +
      activityPreviewBlockHtml(data.recent_activity, hooks) +
      filmPreviewBlockHtml('Сериалы в очереди', data.series_waiting, hooks, {
        action: 'unwatched-all',
        limit: 8,
      }) +
      filmPreviewBlockHtml('Планы', data.upcoming_plans, hooks, {
        action: 'plans-all',
        limit: 8,
        planField: 'plan_type',
      }) +
      filmPreviewBlockHtml('Премьеры', data.premiere_subscriptions, hooks, {
        limit: 8,
      });

    const unfriendBtn = isFriend && !isSelf
      ? '<button type="button" class="btn btn-logout btn-full" data-action="unfriend">Удалить из друзей</button>'
      : '';

    root.innerHTML =
      '<div class="profile-hub profile-hub--friend">' +
        '<div class="profile-hub-left">' +
          '<div class="profile-hub-header">' +
            '<div class="profile-hub-header-top">' +
              '<div class="profile-hub-avatar" id="user-friend-avatar"></div>' +
              '<div class="profile-hub-info">' +
                '<div class="profile-hub-name">' + escapeHtml(data.name || '') + '</div>' +
                metaHtml +
              '</div>' +
            '</div>' +
            statsHtml +
          '</div>' +
          achPreviewHtml(allAchievements, achTotal) +
          leftActionsHtml +
        '</div>' +
        '<div class="profile-hub-right">' + rightHtml + '</div>' +
        unfriendBtn +
      '</div>';

    setAvatarEl(document.getElementById('user-friend-avatar'), photo, initial, uid);
    bindFilmCards(root, hooks);
    bindActivityRows(root, hooks);
    bindRatingRows(root, hooks);

    root.querySelector('[data-action="taste"]')?.addEventListener('click', function () {
      if (hooks.onTaste) hooks.onTaste(uid);
    });
    root.querySelector('[data-action="mutual"]')?.addEventListener('click', function () {
      if (hooks.onMutual) hooks.onMutual(uid);
    });
    root.querySelector('[data-action="add"]')?.addEventListener('click', function () {
      hooks.api('/api/friends/request', { method: 'POST', body: JSON.stringify({ to_user_id: uid }) })
        .then(function (r) {
          if (!r || r.success === false) throw new Error((r && r.error) || 'Ошибка');
          if (hooks.toast) hooks.toast('Запрос отправлен');
          return hooks.reload();
        })
        .catch(function (e) { if (hooks.toast) hooks.toast((e && e.message) || 'Ошибка', 'error'); });
    });
    root.querySelector('[data-action="accept"]')?.addEventListener('click', function () {
      hooks.api('/api/friends/accept', { method: 'POST', body: JSON.stringify({ from_user_id: uid }) })
        .then(function (r) {
          if (!r || r.success === false) throw new Error((r && r.error) || 'Ошибка');
          if (hooks.toast) hooks.toast('Теперь вы друзья');
          return hooks.reload();
        })
        .catch(function (e) { if (hooks.toast) hooks.toast((e && e.message) || 'Ошибка', 'error'); });
    });
    root.querySelector('[data-action="accept-invite"]')?.addEventListener('click', function () {
      hooks.api('/api/friends/invite/accept', { method: 'POST', body: JSON.stringify({ inviter_user_id: uid }) })
        .then(function (r) {
          if (!r || r.success === false) throw new Error((r && r.error) || 'Ошибка');
          if (hooks.toast) hooks.toast('Теперь вы друзья');
          return hooks.reload();
        })
        .catch(function (e) { if (hooks.toast) hooks.toast((e && e.message) || 'Ошибка', 'error'); });
    });
    root.querySelector('[data-action="decline"]')?.addEventListener('click', function () {
      hooks.api('/api/friends/decline', { method: 'POST', body: JSON.stringify({ from_user_id: uid }) })
        .then(function () {
          if (hooks.onBack) hooks.onBack();
        })
        .catch(function (e) { if (hooks.toast) hooks.toast((e && e.message) || 'Ошибка', 'error'); });
    });
    root.querySelector('[data-action="unfriend"]')?.addEventListener('click', function () {
      if (!global.confirm('Удалить из друзей?')) return;
      hooks.api('/api/friends/' + encodeURIComponent(String(uid)), { method: 'DELETE' })
        .then(function () {
          if (hooks.toast) hooks.toast('Удалён из друзей');
          if (hooks.onBack) hooks.onBack();
        })
        .catch(function (e) { if (hooks.toast) hooks.toast((e && e.message) || 'Ошибка', 'error'); });
    });
    root.querySelectorAll('[data-action="ratings-all"]').forEach(function (btn) {
      btn.addEventListener('click', function () { loadRatingsList(root, uid, hooks); });
    });
    root.querySelectorAll('[data-action="unwatched-all"]').forEach(function (btn) {
      btn.addEventListener('click', function () { loadUnwatchedList(root, uid, hooks); });
    });
    root.querySelectorAll('[data-action="watched-all"]').forEach(function (btn) {
      btn.addEventListener('click', function () { loadWatchedList(root, uid, hooks, data.recent_watched); });
    });
    root.querySelectorAll('[data-action="plans-all"]').forEach(function (btn) {
      btn.addEventListener('click', function () { loadPlansList(root, uid, hooks, data.upcoming_plans); });
    });
    root.querySelectorAll('[data-action="ach-all"], [data-action="ach-open"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openAchievementsModal(allAchievements, achTotal);
      });
    });
    scheduleTastePoll(root, uid, hooks, data);
  }

  function patchTasteRow(root, uid, tasteMatch, tasteCommon, hooks) {
    if (tasteMatch == null) return;
    var right = root.querySelector('.profile-hub-right');
    if (!right) return;
    var existing = right.querySelector('[data-action="taste"]');
    if (existing) {
      var titleEl = existing.querySelector('.mp-list-title');
      var hintEl = existing.querySelector('.mp-list-hint');
      if (titleEl) titleEl.textContent = String(tasteMatch) + '% совпадение вкусов';
      if (tasteCommon && hintEl) hintEl.textContent = String(tasteCommon) + ' общих оценок';
      return;
    }
    right.insertAdjacentHTML('afterbegin',
      '<button type="button" class="mp-list-item user-profile-taste-row" data-action="taste">' +
        mpIcon('stats', { className: 'mp-list-icon' }) +
        '<span class="mp-list-text"><span class="mp-list-title">' + escapeHtml(String(tasteMatch)) + '% совпадение вкусов</span>' +
        (tasteCommon
          ? '<span class="mp-list-hint">' + escapeHtml(String(tasteCommon)) + ' общих оценок</span>'
          : '') +
        '</span><span class="mp-list-arrow">›</span></button>'
    );
    var btn = right.querySelector('[data-action="taste"]');
    if (btn && hooks.onTaste) {
      btn.addEventListener('click', function () { hooks.onTaste(uid); });
    }
  }

  function scheduleTastePoll(root, uid, hooks, data) {
    var st = data.friendship_status;
    var isFriend = st === 'accepted' || st === 'friends';
    var isSelf = hooks.viewerUserId != null && Number(hooks.viewerUserId) === uid;
    if (!isFriend || isSelf || data.taste_match != null) return;
    hooks.api('/api/friends/' + encodeURIComponent(String(uid)) + '/taste-summary', { timeoutMs: 8000 })
      .then(function (r) {
        if (!r || r.success === false || r.taste_match == null) return;
        patchTasteRow(root, uid, r.taste_match, r.taste_common, hooks);
      })
      .catch(function () {});
  }

  function loadWatchedList(root, uid, hooks, cached) {
    if (cached && cached.length) {
      root.innerHTML =
        '<div class="profile-hub user-friend-profile user-profile-sub">' +
          '<button type="button" class="mp-sub-back" data-action="back-main">← Профиль</button>' +
          '<h3 class="profile-sub-title">Недавно просмотренные</h3>' +
          '<div class="profile-film-rail profile-film-rail--grid">' +
            cached.map(function (f) { return filmPosterCardHtml(f, hooks, {}); }).join('') +
          '</div></div>';
      bindFilmCards(root, hooks);
      root.querySelector('[data-action="back-main"]')?.addEventListener('click', function () { hooks.reload(); });
      return;
    }
    root.innerHTML = '<p class="cabinet-hint">Пока нет просмотренных</p>';
  }

  function loadPlansList(root, uid, hooks, cached) {
    if (cached && cached.length) {
      root.innerHTML =
        '<div class="profile-hub user-friend-profile user-profile-sub">' +
          '<button type="button" class="mp-sub-back" data-action="back-main">← Профиль</button>' +
          '<h3 class="profile-sub-title">Планы</h3>' +
          '<div class="profile-film-rail profile-film-rail--grid">' +
            cached.map(function (f) {
              return filmPosterCardHtml(f, hooks, { planType: f.plan_type });
            }).join('') +
          '</div></div>';
      bindFilmCards(root, hooks);
      root.querySelector('[data-action="back-main"]')?.addEventListener('click', function () { hooks.reload(); });
      return;
    }
    root.innerHTML = '<p class="cabinet-hint">Пока нет планов</p>';
  }

  function loadRatingsList(root, uid, hooks) {
    root.innerHTML = pageLoadingHtml();
    hooks.api('/api/friends/' + encodeURIComponent(String(uid)) + '/ratings?limit=100')
      .then(function (data) {
        var items = (data && data.ratings) || [];
        root.innerHTML =
          '<div class="profile-hub user-friend-profile user-profile-sub">' +
            '<button type="button" class="mp-sub-back" data-action="back-main">← Профиль</button>' +
            '<h3 class="profile-sub-title">Оценки</h3>' +
            (items.length
              ? '<div class="user-profile-rating-list">' + items.map(function (r) { return ratingRowHtml(r, hooks); }).join('') + '</div>'
              : '<p class="cabinet-hint">Нет оценок</p>') +
          '</div>';
        bindRatingRows(root, hooks);
        root.querySelector('[data-action="back-main"]')?.addEventListener('click', function () { hooks.reload(); });
      })
      .catch(function () {
        root.innerHTML = '<p class="cabinet-hint">Не удалось загрузить</p>';
      });
  }

  function loadUnwatchedList(root, uid, hooks) {
    root.innerHTML = pageLoadingHtml();
    hooks.api('/api/friends/' + encodeURIComponent(String(uid)) + '/unwatched?limit=100')
      .then(function (data) {
        var films = (data && data.films) || [];
        root.innerHTML =
          '<div class="profile-hub user-friend-profile user-profile-sub">' +
            '<button type="button" class="mp-sub-back" data-action="back-main">← Профиль</button>' +
            '<h3 class="profile-sub-title">Непросмотренные</h3>' +
            (films.length
              ? '<div class="profile-film-rail profile-film-rail--grid">' +
                  films.map(function (f) { return filmPosterCardHtml(f, hooks, {}); }).join('') +
                '</div>'
              : '<p class="cabinet-hint">Всё просмотрено</p>') +
          '</div>';
        bindFilmCards(root, hooks);
        root.querySelector('[data-action="back-main"]')?.addEventListener('click', function () { hooks.reload(); });
      })
      .catch(function () {
        root.innerHTML = '<p class="cabinet-hint">Не удалось загрузить</p>';
      });
  }

  function pageLoadingHtml() {
    if (global.MpPageLoading && typeof MpPageLoading.html === 'function') {
      return MpPageLoading.html();
    }
    return '<div class="mp-page-loading" role="status" aria-live="polite" aria-busy="true" aria-label="Загрузка">'
      + '<div class="mp-page-loading-spinner" aria-hidden="true"></div></div>';
  }

  function mount(root, userId, hooks) {
    if (!root) return Promise.resolve();
    hooks = hooks || {};
    var uid = Number(userId);
    if (!uid) {
      root.innerHTML = '<p class="cabinet-hint">Неверный профиль</p>';
      return Promise.resolve();
    }
    root.innerHTML = pageLoadingHtml();
    var reload = function () {
      return mount(root, uid, hooks);
    };
    return hooks.api('/api/friends/' + encodeURIComponent(String(uid)) + '/profile')
      .then(function (data) {
        if (!data || data.success === false) {
          root.innerHTML = '<p class="cabinet-hint">' + escapeHtml((data && data.error) || 'Не удалось открыть профиль') + '</p>';
          return;
        }
        var enriched = Object.assign({}, hooks, { reload: reload });
        renderMainView(root, data, enriched);
        try {
          if (global.MPIcons && typeof global.MPIcons.hydrate === 'function') global.MPIcons.hydrate(root);
        } catch (_e) {}
        try {
          if (hooks.onTitle) hooks.onTitle(data.name || 'Профиль');
        } catch (_e2) {}
      })
      .catch(function () {
        root.innerHTML = '<p class="cabinet-hint">Не удалось загрузить профиль</p>';
      });
  }

  global.MpUserProfile = {
    mount: mount,
  };
})(typeof window !== 'undefined' ? window : this);
