/**
 * Страница пользователя в веб-кабинете (паритет с miniapp /friends/:userId).
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

  function setAvatarEl(el, photoUrl, initial) {
    if (!el) return;
    if (photoUrl) {
      el.innerHTML = '<img src="' + escapeHtml(photoUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
      var img = el.querySelector('img');
      if (img) {
        img.addEventListener('error', function () {
          el.textContent = initial;
        }, { once: true });
      }
    } else {
      el.textContent = initial;
    }
  }

  function profileSectionHead(iconKey, title, actionHtml) {
    return (
      '<div class="user-profile-block-head">' +
        '<div class="user-profile-section-title">' +
          mpIcon(iconKey, { size: 'sm', className: 'user-profile-section-icon' }) +
          '<h3 class="user-profile-block-title">' + escapeHtml(title) + '</h3>' +
        '</div>' +
        (actionHtml || '') +
      '</div>'
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

    const tasteHtml = data.taste_match != null && !isSelf
      ? '<button type="button" class="mp-list-item user-profile-taste-row" data-action="taste">' +
          mpIcon('stats', { className: 'mp-list-icon' }) +
          '<span class="mp-list-text"><span class="mp-list-title">' + escapeHtml(String(data.taste_match)) + '% совпадение вкусов</span>' +
          (data.taste_common
            ? '<span class="mp-list-hint">' + escapeHtml(String(data.taste_common)) + ' общих оценок</span>'
            : '') +
          '</span><span class="mp-list-arrow">›</span></button>'
      : '';

    let actionsHtml = '';
    if (!isSelf) {
      if (isFriend) {
        actionsHtml =
          '<div class="user-profile-actions user-profile-actions--row">' +
            '<button type="button" class="btn btn-secondary user-profile-action-main" data-action="mutual">' +
              mpIcon('film', { className: 'mp-action-icon', size: 'sm' }) + '<span>Смотрим вместе</span></button>' +
            '<button type="button" class="btn btn-ghost user-profile-action-side" data-action="unfriend">Удалить</button>' +
          '</div>';
      } else if (st === 'pending_incoming') {
        actionsHtml =
          '<div class="user-profile-actions">' +
            '<p class="cabinet-hint user-profile-hint">Хочет добавить вас в друзья</p>' +
            '<div class="user-profile-actions--row">' +
              '<button type="button" class="btn btn-primary user-profile-action-main" data-action="accept">Принять</button>' +
              '<button type="button" class="btn btn-ghost user-profile-action-side" data-action="decline">✕</button>' +
            '</div></div>';
      } else if (st === 'pending_outgoing') {
        actionsHtml = '<p class="cabinet-hint user-profile-hint">Запрос отправлен — ждём ответа</p>';
      } else if (hooks.isInviteLanding && !isSelf) {
        actionsHtml =
          '<div class="user-profile-actions">' +
            '<p class="cabinet-hint user-profile-hint">Приглашает вас в друзья</p>' +
            '<button type="button" class="btn btn-primary user-profile-action-main" data-action="accept-invite">Принять приглашение</button>' +
          '</div>';
      } else {
        actionsHtml =
          '<div class="user-profile-actions">' +
            '<button type="button" class="btn btn-primary user-profile-action-main" data-action="add">Добавить в друзья</button>' +
          '</div>';
      }
    }

    const unwatched = data.unwatched_count != null ? data.unwatched_count : 0;
    const watched = data.watched_count != null ? data.watched_count : null;
    const statsHtml =
      '<div class="profile-hub-stats">' +
        '<button type="button" class="profile-hub-stat" data-action="ratings-all">' +
          '<b>' + escapeHtml(String(data.ratings_count || 0)) + '</b><span>оценок</span></button>' +
        (isFriend || isSelf
          ? '<button type="button" class="profile-hub-stat" data-action="unwatched-all">' +
              '<b>' + escapeHtml(String(unwatched)) + '</b><span>непросмотр.</span></button>'
          : '') +
        (watched != null && (isFriend || isSelf)
          ? '<button type="button" class="profile-hub-stat" data-action="watched-scroll">' +
              '<b>' + escapeHtml(String(watched)) + '</b><span>просмотр.</span></button>'
          : '') +
        '<button type="button" class="profile-hub-stat" data-action="ach-all">' +
          '<b>' + escapeHtml(String(data.achievements_count || (data.achievements || []).length || 0)) + '</b><span>ачивок</span></button>' +
      '</div>';

    const recent = (data.recent_ratings || []).slice(0, 12);
    const recentHtml = recent.length
      ? '<div class="user-profile-block">' +
          profileSectionHead('ratings', 'Последние оценки') +
          '<div class="user-profile-rating-list">' + recent.map(function (r) { return ratingRowHtml(r, hooks); }).join('') + '</div>' +
          (Number(data.ratings_count) > recent.length
            ? '<button type="button" class="btn btn-secondary user-profile-more" data-action="ratings-all">Все оценки →</button>'
            : '') +
        '</div>'
      : '';

    const allAchievements = data.achievements || [];
    const achievements = allAchievements.slice(0, 12);
    const achTotal = Number(data.achievements_count || allAchievements.length || 0);
    const achAllBtn = achTotal > 0
      ? '<button type="button" class="user-profile-ach-all" data-action="ach-all">Все достижения</button>'
      : '';
    const achHtml = achievements.length || achTotal
      ? '<div class="user-profile-block">' +
          profileSectionHead('medal', 'Достижения', achAllBtn) +
          '<div class="ach-panel-category-grid user-profile-ach-grid">' +
            achievements.map(achCardHtml).join('') +
          '</div></div>'
      : '';

    root.innerHTML =
      '<div class="profile-hub user-friend-profile">' +
        '<div class="profile-hub-header">' +
          '<div class="profile-hub-avatar" id="user-friend-avatar"></div>' +
          '<div class="profile-hub-info">' +
            '<div class="profile-hub-name">' + escapeHtml(data.name || '') + '</div>' +
            metaHtml +
          '</div>' +
        '</div>' +
        statsHtml +
        tasteHtml +
        actionsHtml +
        recentHtml +
        achHtml +
      '</div>';

    setAvatarEl(document.getElementById('user-friend-avatar'), photo, initial);
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
      btn.addEventListener('click', function () {
        loadRatingsList(root, uid, hooks);
      });
    });
    root.querySelectorAll('[data-action="unwatched-all"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        loadUnwatchedList(root, uid, hooks);
      });
    });
    root.querySelectorAll('[data-action="ach-all"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        loadAchievementsList(root, uid, allAchievements, achTotal, hooks);
      });
    });
    root.querySelectorAll('[data-action="watched-scroll"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var el = root.querySelector('.user-profile-block');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else if (hooks.toast) hooks.toast('Просмотрено: ' + String(watched != null ? watched : '—'));
      });
    });
  }

  function loadAchievementsList(root, uid, achievements, achTotal, hooks) {
    const items = achievements || [];
    root.innerHTML =
      '<div class="profile-hub user-friend-profile user-profile-sub">' +
        '<button type="button" class="mp-sub-back" data-action="back-main">← Профиль</button>' +
        '<h3 class="profile-sub-title">Достижения</h3>' +
        '<p class="cabinet-hint user-profile-ach-sub-count">' +
          escapeHtml(String(items.length)) + ' из ' + escapeHtml(String(achTotal || items.length)) +
        '</p>' +
        (items.length
          ? '<div class="ach-panel-category-grid user-profile-ach-grid">' + items.map(achCardHtml).join('') + '</div>'
          : '<p class="cabinet-hint">Пока нет достижений</p>') +
      '</div>';
    root.querySelector('[data-action="back-main"]')?.addEventListener('click', function () {
      hooks.reload();
    });
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
        root.querySelector('[data-action="back-main"]')?.addEventListener('click', function () {
          hooks.reload();
        });
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
              ? '<div class="user-profile-rating-list">' + films.map(function (f) {
                  return (
                    '<button type="button" class="user-profile-rating-row" data-kp="' + escapeHtml(String(f.kp_id || '')) + '">' +
                      '<span class="user-profile-rating-title">' + escapeHtml(f.title || 'Фильм') + '</span>' +
                      (f.year ? '<span class="user-profile-rating-year">' + escapeHtml(String(f.year)) + '</span>' : '') +
                    '</button>'
                  );
                }).join('') + '</div>'
              : '<p class="cabinet-hint">Всё просмотрено</p>') +
          '</div>';
        bindRatingRows(root, hooks);
        root.querySelector('[data-action="back-main"]')?.addEventListener('click', function () {
          hooks.reload();
        });
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
