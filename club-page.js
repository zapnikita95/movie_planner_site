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
    composeTitle: '',
    composePollOn: false,
    composePollQuestion: '',
    composePollOptions: ['', ''],
    composeImages: [],
    composeImagesPos: 'below',
    composeEditId: null,
    composeUploadBusy: false,
    deleteConfirmId: null,
    deleteBusy: false,
    carousel: {},
    lightbox: null
  };
  var root;
  var overlayHost;

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

  function linkify(text) {
    var raw = String(text == null ? '' : text);
    var escText = esc(raw);
    escText = escText.replace(/(https?:\/\/[^\s<&]+)/g, function (url) {
      var clean = url.replace(/[.,);:!?\]]+$/, '');
      var tail = url.slice(clean.length);
      return (
        '<a class="club-post-link" href="' +
        clean +
        '" target="_blank" rel="noopener noreferrer">' +
        clean +
        '</a>' +
        tail
      );
    });
    return escText.replace(/\n/g, '<br>');
  }

  function pollBlock(poll) {
    if (!poll || !poll.question || !poll.options || !poll.options.length) return '';
    return (
      '<div class="club-poll"><div class="club-poll-q">' +
      esc(poll.question) +
      '</div><ul class="club-poll-opts">' +
      poll.options
        .map(function (o) {
          return '<li><span class="club-poll-opt">' + esc(o) + '</span></li>';
        })
        .join('') +
      '</ul></div>'
    );
  }

  function carouselBlock(post) {
    var imgs = (post && post.images) || [];
    if (!imgs.length) return '';
    var pid = String(post.id);
    var idx = state.carousel[pid] || 0;
    if (idx < 0) idx = 0;
    if (idx >= imgs.length) idx = imgs.length - 1;
    state.carousel[pid] = idx;
    var dots =
      imgs.length > 1
        ? '<div class="club-carousel-dots">' +
          imgs
            .map(function (_, i) {
              return (
                '<button type="button" class="club-carousel-dot' +
                (i === idx ? ' is-active' : '') +
                '" data-club-carousel-dot="' +
                esc(pid) +
                '" data-idx="' +
                i +
                '" aria-label="Слайд ' +
                (i + 1) +
                '"></button>'
              );
            })
            .join('') +
          '</div>'
        : '';
    var nav =
      imgs.length > 1
        ? '<button type="button" class="club-carousel-nav club-carousel-prev" data-club-carousel-prev="' +
          esc(pid) +
          '" aria-label="Назад"><i class="ph ph-caret-left" aria-hidden="true"></i></button>' +
          '<button type="button" class="club-carousel-nav club-carousel-next" data-club-carousel-next="' +
          esc(pid) +
          '" aria-label="Вперёд"><i class="ph ph-caret-right" aria-hidden="true"></i></button>'
        : '';
    return (
      '<div class="club-carousel" data-club-carousel="' +
      esc(pid) +
      '"><div class="club-carousel-stage">' +
      '<button type="button" class="club-carousel-img-btn" data-club-lightbox="' +
      esc(pid) +
      '" data-idx="' +
      idx +
      '" aria-label="Открыть фото">' +
      '<img src="' +
      esc(imgs[idx]) +
      '" alt="" loading="lazy"></button>' +
      nav +
      '</div>' +
      dots +
      '</div>'
    );
  }

  function authorDisplayName(p) {
    var who = (p && (p.author_name || p.author_display_name)) || '';
    who = String(who || '').trim();
    if (!who) {
      var uid = p && p.author_user_id;
      var m = (state.members || []).find(function (x) {
        return String(x.user_id || x.id) === String(uid);
      });
      if (m) who = m.name || m.display_name || m.username || '';
    }
    if (who.indexOf('@') > 0) who = who.split('@')[0];
    return who || 'Участник';
  }

  function authorAvatar(p) {
    var url = (p && (p.author_avatar_url || p.avatar_url || p.photo_url)) || '';
    if (!url && p && p.author_user_id != null) {
      var m = (state.members || []).find(function (x) {
        return String(x.user_id || x.id) === String(p.author_user_id);
      });
      if (m) url = m.photo_url || m.avatar_url || '';
    }
    if (!url && p && p.author_user_id != null) {
      url = '/api/avatar/' + encodeURIComponent(String(p.author_user_id)) + '.jpg';
    }
    return url;
  }

  function postKindLabel(p) {
    if (p && p.poll) return 'голосование';
    if (p && p.images && p.images.length) return 'пост';
    return 'пост';
  }

  function relativeWhen(v) {
    if (!v) return '';
    try {
      var d = new Date(v);
      if (isNaN(d.getTime())) return fmt(v);
      var now = Date.now();
      var diff = Math.max(0, now - d.getTime());
      var mins = Math.floor(diff / 60000);
      if (mins < 1) return 'только что';
      if (mins < 60) return mins + ' мин назад';
      var hours = Math.floor(mins / 60);
      if (hours < 24) return hours + ' ч назад';
      var days = Math.floor(hours / 24);
      if (days === 1) return 'вчера';
      if (days < 7) return days + ' дн назад';
      return fmt(v);
    } catch (_) {
      return fmt(v);
    }
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
          var who = authorDisplayName(p);
          var av = authorAvatar(p);
          var when = relativeWhen(p.created_at);
          // Show Админ · Name when author is club admin/owner if we know; else just name
          var isAuthorAdmin = false;
          (state.members || []).forEach(function (m) {
            if (String(m.user_id || m.id) !== String(p.author_user_id)) return;
            var r = String(m.role || m.member_role || '').toLowerCase();
            if (m.is_owner || m.i_am_owner || ['admin', 'owner', 'creator', 'administrator'].indexOf(r) >= 0) {
              isAuthorAdmin = true;
            }
          });
          if (!isAuthorAdmin && state.admin) {
            // current user admin posting as self
            var ci = ids();
            if (p.author_user_id != null && ci.indexOf(String(p.author_user_id)) >= 0) isAuthorAdmin = true;
          }
          var nameLine = isAuthorAdmin ? 'Админ · ' + who : who;
          var subLine = (when ? when : '') + (when ? ' · ' : '') + postKindLabel(p);
          var title = p.title ? '<h3 class="club-post-title">' + esc(p.title) + '</h3>' : '';
          var actions = '';
          if (state.admin) {
            actions =
              '<div class="club-post-actions">' +
              '<button type="button" class="club-post-edit" data-club-post-edit="' +
              esc(p.id) +
              '" aria-label="Редактировать пост">' +
              icon('pencil', { size: 'sm' }) +
              '</button>' +
              '<button type="button" class="club-post-del" data-club-post-delete="' +
              esc(p.id) +
              '" aria-label="Удалить пост">' +
              icon('x', { size: 'sm' }) +
              '</button></div>';
          }
          var avHtml = av
            ? '<img class="club-post-av" src="' + esc(av) + '" alt="" loading="lazy">'
            : '<div class="club-post-av club-post-av-fallback">' + esc(who.slice(0, 1).toUpperCase()) + '</div>';
          var body = p.body
            ? '<div class="club-post-body">' + linkify(p.body) + '</div>'
            : '';
          var media = carouselBlock(p);
          var pos = String((p && p.images_position) || 'below').toLowerCase();
          var mediaFirst = pos === 'above' || pos === 'top';
          return (
            '<article class="club-post">' +
            '<header class="club-post-head">' +
            avHtml +
            '<div class="club-post-meta"><b>' +
            esc(nameLine) +
            '</b><span>' +
            esc(subLine) +
            '</span></div>' +
            actions +
            '</header>' +
            title +
            (mediaFirst ? media : '') +
            body +
            (mediaFirst ? '' : media) +
            pollBlock(p.poll) +
            '</article>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function pollComposeHtml() {
    if (!state.composePollOn) {
      return (
        '<button type="button" class="club-compose-attach" data-club-poll-toggle>' +
        '<i class="ph ph-chart-bar" aria-hidden="true"></i> Прикрепить опрос</button>'
      );
    }
    var opts = (state.composePollOptions || ['', ''])
      .map(function (o, i) {
        return (
          '<div class="club-poll-option-row">' +
          '<input type="text" class="club-poll-option-input" data-club-poll-opt="' +
          i +
          '" maxlength="80" value="' +
          esc(o) +
          '" placeholder="Вариант ' +
          (i + 1) +
          '">' +
          (state.composePollOptions.length > 2
            ? '<button type="button" class="club-compose-x" data-club-poll-opt-remove="' +
              i +
              '" aria-label="Убрать">' +
              icon('x', { size: 'sm' }) +
              '</button>'
            : '') +
          '</div>'
        );
      })
      .join('');
    return (
      '<div class="club-compose-poll">' +
      '<div class="club-compose-poll-top"><strong>Опрос</strong>' +
      '<button type="button" class="club-btn club-btn-ghost club-btn-tiny" data-club-poll-toggle>Убрать</button></div>' +
      '<label class="club-field"><span>Вопрос</span>' +
      '<input type="text" id="club-compose-poll-q" maxlength="200" value="' +
      esc(state.composePollQuestion) +
      '" placeholder="О чём голосуем?"></label>' +
      '<div class="club-field"><span>Варианты</span>' +
      opts +
      (state.composePollOptions.length < 6
        ? '<button type="button" class="club-compose-attach" data-club-poll-add-opt>+ Ещё вариант</button>'
        : '') +
      '</div></div>'
    );
  }

  function imagesComposeHtml() {
    var previews = (state.composeImages || [])
      .map(function (url, i) {
        return (
          '<div class="club-compose-thumb"><img src="' +
          esc(url) +
          '" alt="">' +
          '<button type="button" class="club-compose-thumb-x" data-club-image-remove="' +
          i +
          '" aria-label="Убрать">' +
          icon('x', { size: 'sm' }) +
          '</button></div>'
        );
      })
      .join('');
    var canAdd = (state.composeImages || []).length < 8;
    return (
      '<div class="club-compose-images">' +
      (previews ? '<div class="club-compose-thumbs">' + previews + '</div>' : '') +
      (canAdd
        ? '<label class="club-compose-attach club-compose-attach-file">' +
          '<i class="ph ph-image" aria-hidden="true"></i> ' +
          (state.composeUploadBusy ? 'Загрузка…' : 'Прикрепить картинку') +
          '<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden data-club-image-input' +
          (state.composeUploadBusy || state.composeBusy ? ' disabled' : '') +
          '></label>'
        : '') +
      ((state.composeImages || []).length
        ? '<div class="club-compose-pos" role="group" aria-label="Где показать картинки">' +
          '<span>Картинки:</span>' +
          '<button type="button" class="club-chip' +
          (state.composeImagesPos === 'above' ? ' is-on' : '') +
          '" data-club-images-pos="above">сверху</button>' +
          '<button type="button" class="club-chip' +
          (state.composeImagesPos !== 'above' ? ' is-on' : '') +
          '" data-club-images-pos="below">снизу</button></div>'
        : '') +
      '</div>'
    );
  }

  function composeHtml() {
    if (!state.composeOpen) return '';
    return (
      '<div class="club-compose-backdrop" data-club-compose-close>' +
      '<div class="club-compose" role="dialog" aria-modal="true" aria-label="Новый пост" data-club-compose-sheet>' +
      '<div class="club-compose-top"><h3>' +
      (state.composeEditId ? 'Редактировать пост' : 'Новый пост') +
      '</h3>' +
      '<button type="button" class="club-compose-x" data-club-compose-close aria-label="Закрыть">' +
      icon('x', { size: 'sm' }) +
      '</button></div>' +
      '<label class="club-field"><span>Заголовок <em>(необязательно)</em></span>' +
      '<input type="text" id="club-compose-title" maxlength="120" value="' +
      esc(state.composeTitle) +
      '" placeholder="О чём пост"></label>' +
      '<label class="club-field"><span>Текст</span>' +
      '<textarea id="club-compose-body" rows="5" maxlength="4000" placeholder="Напишите пост… Ссылки станут кликабельными.">' +
      esc(state.composeBody) +
      '</textarea></label>' +
      imagesComposeHtml() +
      pollComposeHtml() +
      '<div class="club-compose-actions">' +
      '<button type="button" class="club-btn club-btn-ghost" data-club-compose-close>Отмена</button>' +
      '<button type="button" class="club-btn club-btn-primary" data-club-compose-publish' +
      (state.composeBusy || state.composeUploadBusy ? ' disabled' : '') +
      '>' +
      (state.composeBusy ? 'Сохраняем…' : state.composeEditId ? 'Сохранить' : 'Опубликовать') +
      '</button></div></div></div>'
    );
  }


  function lightboxHtml() {
    if (!state.lightbox || !state.lightbox.urls || !state.lightbox.urls.length) return '';
    var urls = state.lightbox.urls;
    var idx = state.lightbox.idx || 0;
    if (idx < 0) idx = 0;
    if (idx >= urls.length) idx = urls.length - 1;
    state.lightbox.idx = idx;
    var nav =
      urls.length > 1
        ? '<button type="button" class="club-lightbox-nav club-lightbox-prev" data-club-lightbox-prev aria-label="Назад"><i class="ph ph-caret-left" aria-hidden="true"></i></button>' +
          '<button type="button" class="club-lightbox-nav club-lightbox-next" data-club-lightbox-next aria-label="Вперёд"><i class="ph ph-caret-right" aria-hidden="true"></i></button>'
        : '';
    return (
      '<div class="club-lightbox-backdrop" data-club-lightbox-close>' +
      '<button type="button" class="club-lightbox-x" data-club-lightbox-close aria-label="Закрыть">' +
      icon('x', { size: 'sm' }) +
      '</button>' +
      '<div class="club-lightbox-stage" data-club-lightbox-stage>' +
      '<img src="' +
      esc(urls[idx]) +
      '" alt="">' +
      nav +
      '</div>' +
      (urls.length > 1
        ? '<div class="club-lightbox-count">' + (idx + 1) + ' / ' + urls.length + '</div>'
        : '') +
      '</div>'
    );
  }

  function deleteConfirmHtml() {
    if (state.deleteConfirmId == null) return '';
    return (
      '<div class="club-confirm-backdrop" data-club-delete-cancel>' +
      '<div class="club-confirm" role="dialog" aria-modal="true" aria-label="Удалить пост" data-club-confirm-sheet>' +
      '<div class="club-compose-top"><h3>Удалить пост?</h3>' +
      '<button type="button" class="club-compose-x" data-club-delete-cancel aria-label="Закрыть">' +
      icon('x', { size: 'sm' }) +
      '</button></div>' +
      '<p class="club-confirm-text">Вы действительно хотите удалить этот пост? Действие нельзя отменить.</p>' +
      '<div class="club-confirm-actions">' +
      '<button type="button" class="club-btn club-btn-neutral" data-club-delete-cancel>Нет</button>' +
      '<button type="button" class="club-btn club-btn-neutral" data-club-delete-yes' +
      (state.deleteBusy ? ' disabled' : '') +
      '>' +
      (state.deleteBusy ? 'Удаляем…' : 'Да') +
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


  function ensureOverlayHost() {
    if (overlayHost && document.body.contains(overlayHost)) return overlayHost;
    overlayHost = document.getElementById('club-page-overlays');
    if (!overlayHost) {
      overlayHost = document.createElement('div');
      overlayHost.id = 'club-page-overlays';
      document.body.appendChild(overlayHost);
    }
    return overlayHost;
  }

  function syncClubOverlays() {
    var host = ensureOverlayHost();
    host.innerHTML = fabHtml() + composeHtml() + deleteConfirmHtml() + lightboxHtml();
    // bind overlay-only controls (fab/compose/delete) — full bind also runs on root
    var fab = host.querySelector('[data-club-compose-open]');
    if (fab) fab.onclick = openCompose;
    host.querySelectorAll('[data-club-compose-close]').forEach(function (b) {
      b.onclick = function (e) {
        if (b.classList.contains('club-compose-backdrop') && e.target !== b) return;
        closeCompose();
      };
    });
    var sheet = host.querySelector('[data-club-compose-sheet]');
    if (sheet) {
      sheet.onclick = function (e) {
        e.stopPropagation();
      };
    }
    var pub = host.querySelector('[data-club-compose-publish]');
    if (pub) pub.onclick = publishPost;
    var titleIn = host.querySelector('#club-compose-title');
    var bodyIn = host.querySelector('#club-compose-body');
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
    host.querySelectorAll('[data-club-poll-toggle]').forEach(function (b) {
      b.onclick = function () {
        state.composePollOn = !state.composePollOn;
        if (state.composePollOn && (!state.composePollOptions || state.composePollOptions.length < 2)) {
          state.composePollOptions = ['', ''];
        }
        render();
      };
    });
    var pq = host.querySelector('#club-compose-poll-q');
    if (pq) {
      pq.oninput = function () {
        state.composePollQuestion = pq.value;
      };
    }
    host.querySelectorAll('.club-poll-option-input').forEach(function (inp) {
      inp.oninput = function () {
        var i = parseInt(inp.getAttribute('data-club-poll-opt'), 10);
        if (!isNaN(i)) state.composePollOptions[i] = inp.value;
      };
    });
    var addOpt = host.querySelector('[data-club-poll-add-opt]');
    if (addOpt) {
      addOpt.onclick = function () {
        if ((state.composePollOptions || []).length >= 6) return;
        state.composePollOptions = (state.composePollOptions || []).concat(['']);
        render();
      };
    }
    host.querySelectorAll('[data-club-poll-opt-remove]').forEach(function (b) {
      b.onclick = function () {
        var i = parseInt(b.getAttribute('data-club-poll-opt-remove'), 10);
        if (isNaN(i) || (state.composePollOptions || []).length <= 2) return;
        state.composePollOptions = state.composePollOptions.filter(function (_, idx) {
          return idx !== i;
        });
        render();
      };
    });
    var imgInput = host.querySelector('[data-club-image-input]');
    if (imgInput) {
      imgInput.onchange = function () {
        uploadImages(imgInput.files);
        imgInput.value = '';
      };
    }
    host.querySelectorAll('[data-club-image-remove]').forEach(function (b) {
      b.onclick = function () {
        var i = parseInt(b.getAttribute('data-club-image-remove'), 10);
        if (isNaN(i)) return;
        state.composeImages = (state.composeImages || []).filter(function (_, idx) {
          return idx !== i;
        });
        render();
      };
    });
    host.querySelectorAll('[data-club-delete-cancel]').forEach(function (b) {
      b.onclick = function (e) {
        if (b.classList.contains('club-confirm-backdrop') && e.target !== b) return;
        cancelDelete();
      };
    });
    var csheet = host.querySelector('[data-club-confirm-sheet]');
    if (csheet) {
      csheet.onclick = function (e) {
        e.stopPropagation();
      };
    }
    var yes = host.querySelector('[data-club-delete-yes]');
    if (yes) yes.onclick = confirmDelete;
    host.querySelectorAll('[data-club-images-pos]').forEach(function (b) {
      b.onclick = function () {
        state.composeImagesPos = b.getAttribute('data-club-images-pos') === 'above' ? 'above' : 'below';
        render();
      };
    });
    host.querySelectorAll('[data-club-lightbox-close]').forEach(function (b) {
      b.onclick = function (e) {
        if (b.classList.contains('club-lightbox-backdrop') && e.target !== b) return;
        closeLightbox();
      };
    });
    var lbStage = host.querySelector('[data-club-lightbox-stage]');
    if (lbStage) {
      lbStage.onclick = function (e) {
        e.stopPropagation();
      };
    }
    var lbPrev = host.querySelector('[data-club-lightbox-prev]');
    if (lbPrev) {
      lbPrev.onclick = function (e) {
        e.stopPropagation();
        if (!state.lightbox) return;
        var n = state.lightbox.urls.length;
        state.lightbox.idx = (state.lightbox.idx - 1 + n) % n;
        render();
      };
    }
    var lbNext = host.querySelector('[data-club-lightbox-next]');
    if (lbNext) {
      lbNext.onclick = function (e) {
        e.stopPropagation();
        if (!state.lightbox) return;
        var n = state.lightbox.urls.length;
        state.lightbox.idx = (state.lightbox.idx + 1) % n;
        render();
      };
    }

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
      '</main></div></div>';
    bind();
    syncClubOverlays();
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
    state.composeEditId = null;
    state.composeOpen = true;
    state.composeBusy = false;
    state.composeUploadBusy = false;
    render();
    setTimeout(function () {
      var ta = root.querySelector('#club-compose-body');
      if (ta) ta.focus();
    }, 30);
  }

  function closeCompose() {
    if (state.composeBusy || state.composeUploadBusy) return;
    state.composeOpen = false;
    render();
  }

  function resetCompose() {
    state.composeBusy = false;
    state.composeUploadBusy = false;
    state.composeOpen = false;
    state.composeEditId = null;
    state.composeBody = '';
    state.composeTitle = '';
    state.composePollOn = false;
    state.composePollQuestion = '';
    state.composePollOptions = ['', ''];
    state.composeImages = [];
    state.composeImagesPos = 'below';
  }

  function readComposePoll() {
    if (!state.composePollOn) return null;
    var host = document.getElementById('club-page-overlays') || root;
    var qEl = host.querySelector('#club-compose-poll-q');
    var q = String((qEl && qEl.value) || state.composePollQuestion || '').trim();
    var opts = [];
    host.querySelectorAll('.club-poll-option-input').forEach(function (inp) {
      var v = String(inp.value || '').trim();
      if (v) opts.push(v);
    });
    if (!opts.length) {
      (state.composePollOptions || []).forEach(function (o) {
        var v = String(o || '').trim();
        if (v) opts.push(v);
      });
    }
    if (!q || opts.length < 2) return { error: 'Опрос: вопрос и минимум 2 варианта' };
    return { question: q, options: opts.slice(0, 6) };
  }


  function openEditPost(id) {
    if (!state.admin) return;
    if (!hasToken()) {
      login();
      return;
    }
    var post = (state.posts || []).find(function (p) {
      return String(p.id) === String(id);
    });
    if (!post) return;
    state.composeEditId = post.id;
    state.composeTitle = post.title || '';
    state.composeBody = post.body || '';
    state.composeImages = (post.images || []).slice();
    state.composeImagesPos = post.images_position === 'above' ? 'above' : 'below';
    if (post.poll && post.poll.question) {
      state.composePollOn = true;
      state.composePollQuestion = post.poll.question || '';
      state.composePollOptions = (post.poll.options || ['', '']).slice();
      while (state.composePollOptions.length < 2) state.composePollOptions.push('');
    } else {
      state.composePollOn = false;
      state.composePollQuestion = '';
      state.composePollOptions = ['', ''];
    }
    state.composeOpen = true;
    state.composeBusy = false;
    state.composeUploadBusy = false;
    render();
  }

  function openLightbox(pid, idx) {
    var post = (state.posts || []).find(function (p) {
      return String(p.id) === String(pid);
    });
    if (!post || !post.images || !post.images.length) return;
    state.lightbox = { urls: post.images.slice(), idx: idx || 0 };
    render();
  }

  function closeLightbox() {
    state.lightbox = null;
    render();
  }

  function publishPost() {
    if (!state.admin || state.composeBusy || state.composeUploadBusy) return;
    if (!hasToken()) {
      login();
      return;
    }
    var host = document.getElementById('club-page-overlays') || root;
    var titleEl = host.querySelector('#club-compose-title');
    var bodyEl = host.querySelector('#club-compose-body');
    var title = String((titleEl && titleEl.value) || '').trim();
    var body = String((bodyEl && bodyEl.value) || '').trim();
    var pollRes = readComposePoll();
    if (pollRes && pollRes.error) {
      toast(pollRes.error, { type: 'error' });
      return;
    }
    var poll = pollRes && !pollRes.error ? pollRes : null;
    if (!state.composePollOn) poll = null;
    var images = (state.composeImages || []).slice();
    if (!body && !poll && !images.length) {
      toast('Напишите текст, добавьте опрос или картинку', { type: 'error' });
      return;
    }
    state.composeTitle = title;
    state.composeBody = body;
    state.composeBusy = true;
    render();
    var payload = {
      title: title || null,
      body: body || '',
      images: images,
      images_position: state.composeImagesPos === 'above' ? 'above' : 'below',
      poll: poll
    };
    var editId = state.composeEditId;
    var path = '/api/site/rooms/' + encodeURIComponent(state.id) + '/posts';
    var method = 'POST';
    if (editId != null) {
      path += '/' + encodeURIComponent(editId);
      method = 'PATCH';
    }
    global
      .api(path, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(function (d) {
        var post = d && (d.post || d.item);
        if (post) {
          if (editId != null) {
            state.posts = (state.posts || []).map(function (p) {
              return String(p.id) === String(editId) ? post : p;
            });
          } else {
            state.posts = [post].concat(state.posts || []);
          }
        }
        resetCompose();
        toast(editId != null ? 'Пост сохранён' : 'Пост опубликован');
        render();
      })
      .catch(function (e) {
        state.composeBusy = false;
        render();
        toast((e && e.message) || 'Не удалось сохранить', { type: 'error' });
      });
  }

  function uploadImages(fileList) {
    if (!fileList || !fileList.length || !state.id) return;
    var left = 8 - (state.composeImages || []).length;
    if (left <= 0) {
      toast('Максимум 8 картинок', { type: 'error' });
      return;
    }
    var files = Array.prototype.slice.call(fileList, 0, left);
    state.composeUploadBusy = true;
    render();
    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        var fd = new FormData();
        fd.append('file', file);
        var token = typeof global.getToken === 'function' ? global.getToken() : localStorage.getItem('mp_site_token');
        var base = (global.MP_API_BASE || global.API_BASE || '') || '';
        return fetch(base + '/api/site/rooms/' + encodeURIComponent(state.id) + '/posts/media', {
          method: 'POST',
          headers: token ? { Authorization: 'Bearer ' + token } : {},
          body: fd,
          credentials: 'omit'
        }).then(function (r) {
          return r.json().then(function (d) {
            if (!r.ok) throw new Error((d && (d.message || d.error)) || 'upload_failed');
            if (d && d.url) state.composeImages = (state.composeImages || []).concat([d.url]);
          });
        });
      });
    });
    chain
      .then(function () {
        state.composeUploadBusy = false;
        render();
      })
      .catch(function (e) {
        state.composeUploadBusy = false;
        render();
        toast((e && e.message) || 'Не удалось загрузить картинку', { type: 'error' });
      });
  }

  function askDeletePost(id) {
    if (!state.admin) return;
    state.deleteConfirmId = id;
    state.deleteBusy = false;
    render();
  }

  function cancelDelete() {
    if (state.deleteBusy) return;
    state.deleteConfirmId = null;
    render();
  }

  function confirmDelete() {
    if (!state.admin || state.deleteBusy || state.deleteConfirmId == null) return;
    if (!hasToken()) {
      login();
      return;
    }
    var pid = state.deleteConfirmId;
    state.deleteBusy = true;
    render();
    global
      .api('/api/site/rooms/' + encodeURIComponent(state.id) + '/posts/' + encodeURIComponent(pid), {
        method: 'DELETE'
      })
      .then(function () {
        state.posts = (state.posts || []).filter(function (p) {
          return String(p.id) !== String(pid);
        });
        state.deleteBusy = false;
        state.deleteConfirmId = null;
        toast('Пост удалён');
        render();
      })
      .catch(function (e) {
        state.deleteBusy = false;
        render();
        toast((e && e.message) || 'Не удалось удалить', { type: 'error' });
      });
  }

  function shiftCarousel(pid, delta) {
    var post = (state.posts || []).find(function (p) {
      return String(p.id) === String(pid);
    });
    if (!post || !post.images || post.images.length < 2) return;
    var cur = state.carousel[String(pid)] || 0;
    var next = (cur + delta + post.images.length) % post.images.length;
    state.carousel[String(pid)] = next;
    render();
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
    root.querySelectorAll('[data-club-poll-toggle]').forEach(function (b) {
      b.onclick = function () {
        state.composePollOn = !state.composePollOn;
        if (state.composePollOn && (!state.composePollOptions || state.composePollOptions.length < 2)) {
          state.composePollOptions = ['', ''];
        }
        render();
      };
    });
    var pq = root.querySelector('#club-compose-poll-q');
    if (pq) {
      pq.oninput = function () {
        state.composePollQuestion = pq.value;
      };
    }
    root.querySelectorAll('.club-poll-option-input').forEach(function (inp) {
      inp.oninput = function () {
        var i = parseInt(inp.getAttribute('data-club-poll-opt'), 10);
        if (!isNaN(i)) {
          state.composePollOptions[i] = inp.value;
        }
      };
    });
    var addOpt = root.querySelector('[data-club-poll-add-opt]');
    if (addOpt) {
      addOpt.onclick = function () {
        if ((state.composePollOptions || []).length >= 6) return;
        state.composePollOptions = (state.composePollOptions || []).concat(['']);
        render();
      };
    }
    root.querySelectorAll('[data-club-poll-opt-remove]').forEach(function (b) {
      b.onclick = function () {
        var i = parseInt(b.getAttribute('data-club-poll-opt-remove'), 10);
        if (isNaN(i) || (state.composePollOptions || []).length <= 2) return;
        state.composePollOptions = state.composePollOptions.filter(function (_, idx) {
          return idx !== i;
        });
        render();
      };
    });
    var imgInput = root.querySelector('[data-club-image-input]');
    if (imgInput) {
      imgInput.onchange = function () {
        uploadImages(imgInput.files);
        imgInput.value = '';
      };
    }
    root.querySelectorAll('[data-club-image-remove]').forEach(function (b) {
      b.onclick = function () {
        var i = parseInt(b.getAttribute('data-club-image-remove'), 10);
        if (isNaN(i)) return;
        state.composeImages = (state.composeImages || []).filter(function (_, idx) {
          return idx !== i;
        });
        render();
      };
    });
    root.querySelectorAll('[data-club-post-delete]').forEach(function (b) {
      b.onclick = function () {
        askDeletePost(b.getAttribute('data-club-post-delete'));
      };
    });
    root.querySelectorAll('[data-club-post-edit]').forEach(function (b) {
      b.onclick = function () {
        openEditPost(b.getAttribute('data-club-post-edit'));
      };
    });
    root.querySelectorAll('[data-club-lightbox]').forEach(function (b) {
      b.onclick = function () {
        openLightbox(b.getAttribute('data-club-lightbox'), parseInt(b.getAttribute('data-idx'), 10) || 0);
      };
    });
    root.querySelectorAll('[data-club-delete-cancel]').forEach(function (b) {
      b.onclick = function (e) {
        if (b.classList.contains('club-confirm-backdrop') && e.target !== b) return;
        cancelDelete();
      };
    });
    var csheet = root.querySelector('[data-club-confirm-sheet]');
    if (csheet) {
      csheet.onclick = function (e) {
        e.stopPropagation();
      };
    }
    var yes = root.querySelector('[data-club-delete-yes]');
    if (yes) yes.onclick = confirmDelete;
    root.querySelectorAll('[data-club-carousel-prev]').forEach(function (b) {
      b.onclick = function () {
        shiftCarousel(b.getAttribute('data-club-carousel-prev'), -1);
      };
    });
    root.querySelectorAll('[data-club-carousel-next]').forEach(function (b) {
      b.onclick = function () {
        shiftCarousel(b.getAttribute('data-club-carousel-next'), 1);
      };
    });
    root.querySelectorAll('[data-club-carousel-dot]').forEach(function (b) {
      b.onclick = function () {
        var pid = b.getAttribute('data-club-carousel-dot');
        var i = parseInt(b.getAttribute('data-idx'), 10);
        if (!pid || isNaN(i)) return;
        state.carousel[String(pid)] = i;
        render();
      };
    });
  }


  function findInList(d, key) {
    return arr(d, ['groups', 'items', 'clubs']).find(function (x) {
      return matchClub(x, key);
    });
  }

  function load(key) {
    state.id = String(key);
    state.slug = SLUG_RE.test(String(key)) ? String(key).toLowerCase() : '';
    state.posts = [];
    state.members = [];
    state.member = false;
    state.admin = false;
    root.innerHTML = '<div class="club-loading" role="status">Загружаем киноклуб…</div>';
    syncClubOverlays();

    var byKey = req('/api/public/cinema-clubs/' + encodeURIComponent(String(key))).catch(function () {
      return null;
    });

    return byKey
      .then(function (oneWrap) {
        var one = oneWrap && (oneWrap.group || oneWrap.club || oneWrap.item || (oneWrap.success && oneWrap));
        if (one && (one.chat_id != null || one.id != null || one.name)) return one;
        // fallback catalog only if single key miss
        return req('/api/public/cinema-clubs?limit=100&offset=0').then(function (d) {
          return findInList(d, key);
        });
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

        var membersPromise =
          hasToken() && typeof global.api === 'function'
            ? global.api('/api/site/rooms/' + encodeURIComponent(state.id) + '/members').catch(function () {
                return {};
              })
            : Promise.resolve({});
        var postsPromise = loadPosts();
        return Promise.all([membersPromise, postsPromise]).then(function (pair) {
          var m = pair[0] || {};
          state.members = arr(m, ['members', 'items', 'users']);
          detect(m || {});
          // one paint with club + members + posts
          render();
        });
      })
      .catch(function (e) {
        root.innerHTML = empty(
          'Не удалось открыть клуб',
          e && e.message === 'Киноклуб не найден'
            ? 'Проверьте ссылку или вернитесь в каталог киноклубов.'
            : 'Попробуйте обновить страницу позже.'
        );
        syncClubOverlays();
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
