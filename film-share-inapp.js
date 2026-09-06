/**
 * In-app film share sheet for standalone /f/ pages (friends + groups).
 * Mirrors mobile: tabs Личные / Группы, search, select, Отправить.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mediaUrl(u, origin) {
    var s = String(u || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s.replace(/^https?:\/\/api\.movie-planner\.ru/i, origin || 'https://movie-planner.ru');
    if (s.charAt(0) === '/') return (origin || '') + s;
    return s;
  }

  function toast(msg, opts) {
    if (typeof global.showPublicToast === 'function') {
      global.showPublicToast(msg);
      return;
    }
    if (global.MpFilmPage && typeof global.MpFilmPage.showToast === 'function') {
      global.MpFilmPage.showToast(msg, opts);
      return;
    }
    try { console.log('[share]', msg); } catch (_e) {}
  }

  function closeOverlay(overlay) {
    try { overlay.remove(); } catch (_e) {}
    try { document.body.style.overflow = ''; } catch (_e2) {}
  }

  function avatarHtml(name, photo, origin) {
    var nm = String(name || '?').trim() || '?';
    var letter = esc(nm.charAt(0).toUpperCase());
    var src = mediaUrl(photo, origin);
    if (src) {
      return (
        '<span class="mp-share-avatar">' +
          '<img class="mp-share-avatar-img" src="' + esc(src) + '" alt="" loading="lazy" decoding="async" ' +
          'onerror="this.style.display=\'none\';var n=this.nextElementSibling;if(n)n.style.display=\'grid\'">' +
          '<span class="mp-share-avatar-letter" style="display:none">' + letter + '</span>' +
        '</span>'
      );
    }
    return '<span class="mp-share-avatar"><span class="mp-share-avatar-letter">' + letter + '</span></span>';
  }

  function groupEmoji(p) {
    return (p && (p.emoji || (p.is_virtual ? '👥' : '💬'))) || '💬';
  }

  async function open(film, opts) {
    opts = opts || {};
    var apiBase = String(opts.apiBase || global.MP_API_BASE || '').replace(/\/$/, '');
    var headers = opts.authHeaders || { 'Content-Type': 'application/json' };
    var origin = String(opts.siteOrigin || global.location.origin || 'https://movie-planner.ru').replace(/\/$/, '');
    var loginNow = opts.loginNow;
    var kp = film && (film.kp_id || film.kpId);
    if (!kp) {
      toast('Не удалось открыть шеринг');
      return;
    }
    if (!opts.token && typeof opts.hasAuth === 'function' && !opts.hasAuth()) {
      if (typeof loginNow === 'function') loginNow('share_inapp');
      else toast('Войдите, чтобы поделиться с друзьями');
      return;
    }

    function api(path, init) {
      init = init || {};
      var h = Object.assign({}, headers, init.headers || {});
      return fetch(apiBase + path, {
        method: init.method || 'GET',
        mode: 'cors',
        headers: h,
        body: init.body,
      }).then(function (r) {
        return r.json().catch(function () { return { success: false, error: 'bad_json' }; }).then(function (j) {
          j = j || {};
          j._http = r.status;
          return j;
        });
      });
    }

    var friends = [];
    var shareable = [];
    try {
      var frData = await api('/api/friends').catch(function () { return { friends: [] }; });
      var grData = await api('/api/site/profiles?lite=1').catch(function () { return { profiles: [] }; });
      if (frData && frData._http === 401) {
        if (typeof loginNow === 'function') loginNow('share_inapp');
        else toast('Войдите, чтобы поделиться');
        return;
      }
      friends = ((frData && frData.friends) || []).filter(function (f) { return f && f.user_id; });
      shareable = ((grData && grData.profiles) || []).filter(function (p) {
        return p && !p.is_personal && p.can_share_to_group !== false;
      });
    } catch (_e) {
      toast('Не удалось загрузить список');
      return;
    }
    if (!friends.length && !shareable.length) {
      toast('Добавьте друзей или создайте группу');
      return;
    }

    var tab = friends.length ? 'friends' : 'groups';
    var tabsHtml =
      (friends.length && shareable.length)
        ? '<div class="share-film-tabs mp-share-tabs" role="tablist">' +
            '<button type="button" class="share-film-tab' + (tab === 'friends' ? ' active' : '') + '" data-share-tab="friends" role="tab">Личные</button>' +
            '<button type="button" class="share-film-tab' + (tab === 'groups' ? ' active' : '') + '" data-share-tab="groups" role="tab">Группы</button>' +
          '</div>'
        : (friends.length
            ? '<div class="share-film-tabs mp-share-tabs"><button type="button" class="share-film-tab active" data-share-tab="friends" role="tab">Личные</button></div>'
            : '<div class="share-film-tabs mp-share-tabs"><button type="button" class="share-film-tab active" data-share-tab="groups" role="tab">Группы</button></div>');

    var friendsPanel = friends.length
      ? '<div id="share-panel-friends" class="' + (tab === 'friends' ? '' : 'hidden') + '">' +
          '<input type="search" class="mp-share-search input-primary" id="share-fr-search" placeholder="Найти" autocomplete="off" aria-label="Найти">' +
          '<div class="mp-share-list" id="share-fr-list" role="listbox">' +
          friends.map(function (f, i) {
            var nm = String(f.name || 'Друг').trim() || 'Друг';
            return (
              '<label class="mp-share-row" data-share-name="' + esc(nm.toLowerCase()) + '">' +
                '<input type="radio" name="share-fr" value="' + esc(String(f.user_id)) + '"' + (i === 0 ? ' checked' : '') + '>' +
                avatarHtml(nm, f.photo_url, origin) +
                '<span class="mp-share-name">' + esc(nm) + '</span>' +
              '</label>'
            );
          }).join('') +
          '</div></div>'
      : '';

    var groupsPanel = shareable.length
      ? '<div id="share-panel-groups" class="' + (tab === 'groups' ? '' : 'hidden') + '">' +
          '<input type="search" class="mp-share-search input-primary" id="share-grp-search" placeholder="Найти" autocomplete="off" aria-label="Найти">' +
          '<div class="mp-share-list" id="share-grp-list" role="listbox">' +
          shareable.map(function (p, i) {
            var nm = String((p.display_name != null && p.display_name !== '' ? p.display_name : null) || p.name || 'Группа').trim() || 'Группа';
            return (
              '<label class="mp-share-row" data-share-name="' + esc(nm.toLowerCase()) + '">' +
                '<input type="radio" name="share-grp" value="' + esc(String(p.chat_id)) + '"' + (i === 0 ? ' checked' : '') + '>' +
                '<span class="mp-share-avatar mp-share-avatar--emoji">' + esc(groupEmoji(p)) + '</span>' +
                '<span class="mp-share-name">' + esc(nm) + '</span>' +
              '</label>'
            );
          }).join('') +
          '</div></div>'
      : '';

    var existing = document.getElementById('mp-share-inapp-overlay');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'mp-share-inapp-overlay';
    overlay.className = 'modal-overlay mp-share-inapp-overlay';
    overlay.innerHTML =
      '<div class="modal-sheet mp-share-inapp-sheet" role="dialog" aria-modal="true" aria-label="Поделиться">' +
        '<div class="mp-share-sheet-head">' +
          '<div class="mp-share-sheet-title">Поделиться</div>' +
          '<button type="button" class="mp-share-sheet-close" id="share-inapp-close" aria-label="Закрыть">×</button>' +
        '</div>' +
        (film.title ? ('<div class="mp-share-sheet-film muted small">' + esc(film.title) + '</div>') : '') +
        tabsHtml +
        friendsPanel +
        groupsPanel +
        '<button type="button" class="mp-share-send-btn" id="share-grp-send">' +
          '<span>Отправить</span><span class="mp-share-send-arrow" aria-hidden="true">→</span>' +
        '</button>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    function close() { closeOverlay(overlay); }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    var closeBtn = overlay.querySelector('#share-inapp-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    overlay.querySelectorAll('[data-share-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        tab = btn.getAttribute('data-share-tab') || 'groups';
        overlay.querySelectorAll('.share-film-tab').forEach(function (t) {
          t.classList.toggle('active', t.getAttribute('data-share-tab') === tab);
        });
        var fr = overlay.querySelector('#share-panel-friends');
        var gr = overlay.querySelector('#share-panel-groups');
        if (fr) fr.classList.toggle('hidden', tab !== 'friends');
        if (gr) gr.classList.toggle('hidden', tab !== 'groups');
      });
    });

    function wireSearch(inputId, listId) {
      var inp = overlay.querySelector('#' + inputId);
      var list = overlay.querySelector('#' + listId);
      if (!inp || !list) return;
      inp.addEventListener('input', function () {
        var q = String(inp.value || '').trim().toLowerCase();
        list.querySelectorAll('.mp-share-row').forEach(function (row) {
          var name = row.getAttribute('data-share-name') || '';
          row.classList.toggle('hidden', !!(q && name.indexOf(q) < 0));
        });
      });
    }
    wireSearch('share-fr-search', 'share-fr-list');
    wireSearch('share-grp-search', 'share-grp-list');

    var sendBtn = overlay.querySelector('#share-grp-send');
    if (sendBtn) {
      sendBtn.addEventListener('click', async function () {
        sendBtn.disabled = true;
        var label = sendBtn.querySelector('span');
        var prev = label ? label.textContent : 'Отправить';
        if (label) label.textContent = 'Отправка…';
        try {
          if (tab === 'friends') {
            var fr = overlay.querySelector('input[name="share-fr"]:checked');
            var toUser = Number((fr && fr.value) || 0);
            if (!toUser) {
              toast('Выберите друга');
              return;
            }
            var res = await api('/api/friends/recommend', {
              method: 'POST',
              body: JSON.stringify({ to_user_id: toUser, kp_id: String(kp), message: '' }),
            });
            if (res && res.success) {
              close();
              toast('Фильм отправлен другу');
            } else {
              toast((res && (res.message || res.error)) || 'Не удалось отправить');
            }
            return;
          }
          var rad = overlay.querySelector('input[name="share-grp"]:checked');
          var chatId = Number((rad && rad.value) || 0);
          if (!chatId) {
            toast('Выберите группу');
            return;
          }
          var gres = await api('/api/site/groups/' + encodeURIComponent(String(chatId)) + '/share-film', {
            method: 'POST',
            body: JSON.stringify({
              kp_id: String(kp),
              film_id: film.film_id || null,
              message: '',
            }),
          });
          if (gres && gres.success !== false) {
            close();
            toast('Фильм отправлен в группу');
          } else {
            toast((gres && (gres.message || gres.error)) || 'Не удалось отправить');
          }
        } catch (_err) {
          toast('Ошибка отправки');
        } finally {
          sendBtn.disabled = false;
          if (label) label.textContent = prev;
        }
      });
    }
  }

  global.MpFilmShareInApp = { open: open };
})(typeof window !== 'undefined' ? window : this);
