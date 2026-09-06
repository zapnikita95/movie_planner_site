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
    composePollDuration: '',
    composePollMultiple: false,
    composePollAllowChange: false,
    composePollAnonymous: false,
    composePollOptions: [{ text: '', card: null }, { text: '', card: null }],
    composeImages: [],
    composeImagesPos: 'below',
    composeEmbeds: [],
    commentsOpen: {},
    commentDrafts: {},
    composeEditId: null,
    composeUploadBusy: false,
    deleteConfirmId: null,
    deleteBusy: false,
    carousel: {},
    lightbox: null,
    pollSearch: null,
    pollEdits: {} ,
    comments: {},
    planPicker: null
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

  function emptyPollOpt() {
    return { text: '', card: null };
  }

  function normalizePollOpt(o) {
    if (typeof o === 'string') return { text: String(o || ''), card: null };
    if (o && typeof o === 'object') {
      return {
        text: String(o.text != null ? o.text : ''),
        card: o.card && typeof o.card === 'object' ? o.card : null
      };
    }
    return emptyPollOpt();
  }

  function pollOptLabel(o) {
    var n = normalizePollOpt(o);
    if (n.text) return n.text;
    if (n.card && n.card.title) return String(n.card.title);
    return '';
  }

  function cardFromSearchItem(it, kind) {
    if (!it) return null;
    if (kind === 'person') {
      var pid = String(it.kp_person_id || it.id || '').trim();
      var title = String(it.display_name || it.name_ru || it.name_en || '').trim();
      if (!title) return null;
      var url = String(it.person_url || (pid ? '/s/' + pid : '') || '').trim();
      return {
        kind: 'person',
        id: pid || undefined,
        title: title,
        poster: String(it.photo || it.poster || '').trim() || undefined,
        url: url || undefined,
        subtitle: String(it.professions || it.secondary_name || '').trim() || undefined,
        description: String(it.description || it.bio || '').trim() || undefined
      };
    }
    var kid = String(it.kp_id || it.id || '').trim();
    var t = String(it.title || it.name || '').trim();
    if (!t) return null;
    var k = String(it.type || 'film').toLowerCase();
    if (k === 'movie') k = 'film';
    if (k !== 'series') k = 'film';
    var year = it.year != null && it.year !== '' ? String(it.year) : '';
    return {
      kind: k,
      id: kid || undefined,
      title: t,
      poster: String(it.poster || '').trim() || undefined,
      url: kid ? '/f/' + kid : undefined,
      subtitle: String(it.subtitle || ((it.actors || it.cast) ? [year, it.actors || it.cast].filter(Boolean).join(' · ') : year)).trim() || undefined,
      description: String(it.description || it.short_description || it.plot || '').trim() || undefined
    };
  }

  function pollCardHtml(card, label) {
    if (!card) return '';
    var title = esc(label || card.title || '');
    var meta = esc(card.subtitle || (card.kind === 'person' ? 'человек' : card.kind === 'series' ? 'сериал' : 'фильм'));
    var img = card.poster
      ? '<img src="' + esc(card.poster) + '" alt="" loading="lazy">'
      : '<span class="club-poll-film-ph" aria-hidden="true"></span>';
    var inner =
      '<div class="club-poll-film">' +
      img +
      '<div><b>' +
      title +
      '</b><div class="club-poll-meta">' +
      meta +
      '</div></div></div>';
    if (card.url) {
      return (
        '<a class="club-poll-film-link" data-club-poll-film-link href="' +
        esc(card.url) +
        '" target="_blank" rel="noopener noreferrer">' +
        inner +
        '</a>'
      );
    }
    return inner;
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

  function embedCardHtml(card) { if (!card) return ""; var inner = "<div class=\"club-post-embed\">" + (card.poster ? "<img src=\"" + esc(card.poster) + "\" alt=\"\" loading=\"lazy\">" : "<span class=\"club-post-embed-ph\"></span>") + "<div class=\"club-post-embed-copy\"><b>" + esc(card.title || "") + "</b>" + (card.subtitle ? "<span>" + esc(card.subtitle) + "</span>" : "") + (card.description ? "<p>" + esc(card.description) + "</p>" : "") + "</div></div>"; return card.url ? "<a class=\"club-post-embed-link\" href=\"" + esc(card.url) + "\">" + inner + "</a>" : inner; }
  function pollVoteHtml(p) { var poll = p && p.poll; if (!poll || !poll.options || !poll.options.length) return ""; var multiple = !!poll.allow_multiple, mine = p.my_votes || [], voted = mine.length > 0, editing = !!(state.pollEdits && state.pollEdits[String(p.id)]), counts = p.counts || {}, voters = p.voters || {}; var choices = poll.options.map(function(o, i) { var n = normalizePollOpt(o), label = pollOptLabel(n), checked = mine.indexOf(i) >= 0; if (voted && !editing) { var list = Array.isArray(voters[String(i)]) ? voters[String(i)] : [], avatars = (!poll.anonymous ? list.map(function(v) { return "<img class=\"club-poll-voter-avatar\" src=\"" + esc(v.avatar_url || "/api/avatar/" + encodeURIComponent(String(v.user_id || "")) + ".jpg") + "\" alt=\"" + esc(v.name || "") + "\" title=\"" + esc(v.name || "") + "\" loading=\"lazy\">"; }).join("") : ""); return "<div class=\"club-poll-result-row\">" + (n.card ? pollCardHtml(n.card, label) : "<span class=\"club-poll-choice-text\">" + esc(label) + "</span>") + "<strong class=\"club-poll-result-count\">" + Number(counts[String(i)] || 0) + "</strong>" + (avatars ? "<span class=\"club-poll-voters\">" + avatars + "</span>" : "") + "</div>"; } return "<div class=\"club-poll-choice\" data-club-poll-choice=\"" + i + "\"><input type=\"" + (multiple ? "checkbox" : "radio") + "\" name=\"club-poll-" + esc(p.id) + "\" value=\"" + i + "\"" + (checked ? " checked" : "") + ">" + (n.card ? pollCardHtml(n.card, label) : "<span class=\"club-poll-choice-text\">" + esc(label) + "</span>") + "</div>"; }).join(""); return "<div class=\"club-poll\"><div class=\"club-poll-q\">" + esc(poll.question) + "</div><div class=\"club-poll-vote" + (multiple ? " is-multiple" : "") + "\" data-club-poll-vote=\"" + esc(p.id) + "\" data-multiple=\"" + (multiple ? "1" : "0") + "\"><div class=\"club-poll-choices" + (voted && !editing ? " club-poll-results-mode" : "") + "\">" + choices + "</div></div></div>"; }
  function pollBlock(poll) {
    if (!poll || !poll.question || !poll.options || !poll.options.length) return '';
    return (
      '<div class="club-poll"><div class="club-poll-q">' +
      esc(poll.question) +
      '</div><ul class="club-poll-opts">' +
      poll.options
        .map(function (o) {
          var n = normalizePollOpt(o);
          var label = pollOptLabel(n);
          if (n.card) {
            return (
              '<li class="club-poll-opt club-poll-opt--card">' +
              pollCardHtml(n.card, label) +
              '</li>'
            );
          }
          return '<li class="club-poll-opt">' + esc(label) + '</li>';
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

  function commentState(postId) {
    var key = String(postId);
    if (!state.comments[key]) state.comments[key] = { loaded: false, busy: false, error: '', items: [] };
    return state.comments[key];
  }

  function commentCanDelete(c) {
    if (state.admin) return true;
    var mine = ids();
    return c && c.author_user_id != null && mine.indexOf(String(c.author_user_id)) >= 0;
  }

  function reactionItems(p) { var raw = p && (p.reactions || p.reaction_counts) || [], out = []; if (Array.isArray(raw)) { raw.forEach(function(r) { if (r && r.emoji && Number(r.count || 0) > 0) out.push({ emoji: String(r.emoji), count: Number(r.count || 0) }); }); } else { Object.keys(raw).forEach(function(e) { if (Number(raw[e] || 0) > 0) out.push({ emoji: e, count: Number(raw[e] || 0) }); }); } return out; }
  function reactionHtml(p) { var pid = String(p.id), items = reactionItems(p), mine = p.my_reactions || [], choices = ["\u2764\ufe0f", "\ud83d\ude80", "\u2b50", "\ud83d\udca9", "\ud83d\ude02", "\ud83d\udd25", "\ud83d\udc4f", "\ud83d\ude22", "\ud83d\ude0d"]; return "<div class=\"club-reactions\" data-club-reactions=\"" + esc(pid) + "\"><div class=\"club-reaction-list\">" + items.map(function(r) { var active = mine.indexOf(r.emoji) >= 0; return "<button type=\"button\" class=\"club-reaction-pill\" data-club-reaction=\"" + esc(pid) + "\" data-emoji=\"" + esc(r.emoji) + "\" aria-pressed=\"" + (active ? "true" : "false") + "\"><span>" + esc(r.emoji) + "</span><b>" + r.count + "</b></button>"; }).join("") + "</div><div class=\"club-reaction-add\"><button type=\"button\" class=\"club-reaction-plus\" data-club-reaction-menu=\"" + esc(pid) + "\" aria-label=\"Добавить реакцию\">+</button><div class=\"club-reaction-flyout\" role=\"menu\">" + choices.map(function(e) { return "<button type=\"button\" data-club-reaction-add=\"" + esc(pid) + "\" data-emoji=\"" + esc(e) + "\" role=\"menuitem\">" + esc(e) + "</button>"; }).join("") + "</div></div></div>"; }
  function commentsToggleHtml(p) { var key = String(p.id), count = Number(p.comments_count || 0), open = !!commentState(key).open; return "<button type=\"button\" class=\"club-comments-toggle\" data-club-comments-toggle=\"" + esc(key) + "\" aria-expanded=\"" + (open ? "true" : "false") + "\" aria-label=\"Комментарии\"><span class=\"club-comments-icon\">" + icon("chat", { size: "sm" }) + "</span>" + (count ? "<span class=\"club-comments-count\">" + count + "</span>" : "") + "</button>"; }
  function commentsPanelHtml(p) { var key = String(p.id), cs = commentState(key); if (!cs.open) return ""; var out = "<div class=\"club-comments club-comments-panel\">"; if (cs.busy) out += "<div class=\"club-comments-status\">Загружаем комментарии…</div>"; else if (cs.error) out += "<div class=\"club-comments-status\">" + esc(cs.error) + "</div>"; else if (!cs.items.length) out += "<div class=\"club-comments-status\">Пока нет комментариев</div>"; else out += "<div class=\"club-comments-list\">" + cs.items.map(function(c) { var who = String(c.author_name || "Участник"), av = c.author_avatar_url || "/api/avatar/" + encodeURIComponent(String(c.author_user_id || "")) + ".jpg"; return "<div class=\"club-comment\"><img class=\"club-comment-av\" src=\"" + esc(av) + "\" alt=\"\" loading=\"lazy\"><div class=\"club-comment-main\"><div class=\"club-comment-head\"><b>" + esc(who) + "</b><span>" + esc(relativeWhen(c.created_at)) + "</span>" + (commentCanDelete(c) ? "<button type=\"button\" class=\"club-comment-del\" data-club-comment-delete=\"" + esc(c.id) + "\" data-club-comment-post=\"" + esc(key) + "\">Удалить</button>" : "") + "</div><div class=\"club-comment-body\">" + linkify(c.body) + "</div></div></div>"; }).join("") + "</div>"; if (state.member) { var draft = state.commentDrafts[key] || ""; out += "<form class=\"club-comment-compose\" data-club-comment-form=\"" + esc(key) + "\"><textarea maxlength=\"2000\" rows=\"2\" placeholder=\"Написать комментарий…\">" + esc(draft) + "</textarea><button type=\"submit\" class=\"club-mini-btn\"" + (cs.sending ? " disabled" : "") + ">" + (cs.sending ? "Отправляем…" : "Отправить") + "</button></form>"; } else out += "<div class=\"club-comments-login\">Войдите и вступите в клуб, чтобы комментировать. <button type=\"button\" data-club-comments-login>Войти</button></div>"; return out + "</div>"; }
  function pollActionHtml(p) { var poll = p && p.poll, mine = p && p.my_votes || [], editing = !!(state.pollEdits && state.pollEdits[String(p.id)]); if (!poll || !poll.options) return ""; if (mine.length && !editing) return poll.allow_change_vote ? "<button type=\"button\" class=\"club-poll-vote-btn club-poll-edit-btn\" data-club-poll-edit=\"" + esc(p.id) + "\">Изменить голос</button>" : ""; var label = mine.length ? "Сохранить голос" : "Проголосовать"; return "<button type=\"button\" class=\"club-poll-vote-btn\" data-club-poll-vote-submit=\"" + esc(p.id) + "\"" + (!mine.length && hasToken() ? " disabled" : "") + ">" + label + "</button>"; }
  function postActionsHtml(p) { return "<div class=\"club-post-action-row\">" + reactionHtml(p) + commentsToggleHtml(p) + pollActionHtml(p) + "</div>"; }

  function toggleComments(postId) {
    var cs = commentState(postId);
    cs.open = !cs.open;
    render();
    if (cs.open && !cs.loaded) loadComments(postId);
  }

  function loadComments(postId) {
    var cs = commentState(postId);
    cs.busy = true;
    cs.error = '';
    render();
    return req('/api/site/rooms/' + encodeURIComponent(state.id) + '/posts/' + encodeURIComponent(postId) + '/comments?limit=100')
      .then(function (d) {
        cs.items = arr(d, ['comments', 'items']);
        cs.loaded = true;
        cs.busy = false;
        render();
      })
      .catch(function (e) {
        cs.busy = false;
        cs.error = (e && e.message) || 'Не удалось загрузить комментарии';
        render();
      });
  }

  function submitComment(postId, form) {
    var cs = commentState(postId);
    if (cs.sending) return;
    if (!hasToken()) { login(); return; }
    var ta = form && form.querySelector('textarea');
    var body = String((ta && ta.value) || '').trim();
    if (!body) { toast('Напишите комментарий', { type: 'error' }); return; }
    state.commentDrafts[String(postId)] = body;
    cs.sending = true;
    render();
    req('/api/site/rooms/' + encodeURIComponent(state.id) + '/posts/' + encodeURIComponent(postId) + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: body })
    }).then(function (d) {
      if (d && d.comment) cs.items.push(d.comment);
      cs.loaded = true;
      cs.sending = false;
      state.commentDrafts[String(postId)] = '';
      var p = (state.posts || []).find(function (item) { return String(item.id) === String(postId); });
      if (p) p.comments_count = Number(p.comments_count || 0) + 1;
      render();
    }).catch(function (e) {
      cs.sending = false;
      render();
      toast((e && e.message) || 'Не удалось отправить комментарий', { type: 'error' });
    });
  }

  function deleteComment(postId, commentId) {
    var cs = commentState(postId);
    if (cs.deleting) return;
    if (!hasToken()) { login(); return; }
    cs.deleting = true;
    req('/api/site/rooms/' + encodeURIComponent(state.id) + '/posts/' + encodeURIComponent(postId) + '/comments/' + encodeURIComponent(commentId), { method: 'DELETE' })
      .then(function () {
        cs.items = cs.items.filter(function (c) { return String(c.id) !== String(commentId); });
        cs.deleting = false;
        var p = (state.posts || []).find(function (item) { return String(item.id) === String(postId); });
        if (p) p.comments_count = Math.max(0, Number(p.comments_count || 0) - 1);
        render();
      })
      .catch(function (e) {
        cs.deleting = false;
        toast((e && e.message) || 'Не удалось удалить комментарий', { type: 'error' });
        render();
      });
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
          var embeds = (p.embeds || []).map(embedCardHtml).join('');
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
            pollVoteHtml(p) +
            embeds +
            postActionsHtml(p) +
            commentsPanelHtml(p) +
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
    var opts = (state.composePollOptions || [emptyPollOpt(), emptyPollOpt()])
      .map(function (o, i) {
        var n = normalizePollOpt(o);
        var cardChip = n.card
          ? '<div class="club-poll-opt-card-chip">' +
            (n.card.poster
              ? '<img src="' + esc(n.card.poster) + '" alt="">'
              : '') +
            '<span>' +
            esc(n.card.title || '') +
            '</span>' +
            '<button type="button" class="club-compose-x" data-club-poll-card-clear="' +
            i +
            '" aria-label="Убрать карточку">' +
            icon('x', { size: 'sm' }) +
            '</button></div>'
          : '';
        return (
          '<div class="club-poll-option-block">' +
          '<div class="club-poll-option-row">' +
          '<input type="text" class="club-poll-option-input" data-club-poll-opt="' +
          i +
          '" maxlength="80" value="' +
          esc(n.text) +
          '" placeholder="Вариант ' +
          (i + 1) +
          '">' +
          '<button type="button" class="club-poll-opt-plus" data-club-poll-opt-search="' +
          i +
          '" title="Прикрепить из поиска" aria-label="Прикрепить из поиска">+</button>' +
          (state.composePollOptions.length > 2
            ? '<button type="button" class="club-compose-x" data-club-poll-opt-remove="' +
              i +
              '" aria-label="Убрать">' +
              icon('x', { size: 'sm' }) +
              '</button>'
            : '') +
          '</div>' +
          cardChip +
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
      '<div class="club-poll-settings"><label>Срок <select id="club-compose-poll-duration"><option value="">Без ограничений</option><option value="1">1 час</option><option value="24">24 часа</option><option value="72">3 дня</option><option value="168">7 дней</option></select></label><label class="club-poll-multiple"><input type="checkbox" id="club-compose-poll-multiple"' + (state.composePollMultiple ? ' checked' : '') + '> Несколько вариантов</label><label class="club-poll-multiple"><input type="checkbox" id="club-compose-poll-change"' + (state.composePollAllowChange ? ' checked' : '') + '> Можно изменить голос</label><label class="club-poll-multiple"><input type="checkbox" id="club-compose-poll-anonymous"' + (state.composePollAnonymous ? ' checked' : '') + '> Анонимный опрос</label></div>' +
      '<div class="club-field"><span>Варианты <em>(текст и/или карточка из поиска)</em></span>' +
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

  function embedsComposeHtml() { var cards = state.composeEmbeds || []; if (!cards.length) return ""; return "<div class=\"club-compose-embeds\">" + cards.map(function(card, i) { return "<div class=\"club-embed-chip\">" + (card.poster ? "<img src=\"" + esc(card.poster) + "\" alt=\"\">" : "") + "<span>" + esc(card.title || "") + "</span><button type=\"button\" class=\"club-compose-x\" data-club-embed-remove=\"" + i + "\" aria-label=\"Убрать карточку\">" + icon("x", {size:"sm"}) + "</button></div>"; }).join("") + "</div>"; }
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
      '<div class="club-compose-attach-row"><button type="button" class="club-embed-plus" data-club-embed-open aria-label="Прикрепить фильм или человека">+</button><span>Прикрепить фильм или человека</span></div>' +
      embedsComposeHtml() +
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
    if (!state.admin) return '';
    if (state.tab === 'schedule') return '<button type="button" class="club-fab" data-club-plan-open aria-label="Запланировать просмотр"><span aria-hidden="true">+</span></button>';
    if (state.tab !== 'feed') return '';
    return (
      '<button type="button" class="club-fab" data-club-compose-open aria-label="Написать пост">' +
      icon('pencil', { size: 'md' }) +
      '</button>'
    );
  }



  function updatePollSearchResults() { var host = overlayHost || document; var results = host.querySelector(".club-poll-search-results"); if (!results || !state.pollSearch) return; var tmp = document.createElement("div"); tmp.innerHTML = pollSearchHtml(); var next = tmp.querySelector(".club-poll-search-results"); if (next) results.innerHTML = next.innerHTML; bindPollControls(host); }
  function pollSearchHtml() {
    var ps = state.pollSearch;
    if (!ps) return '';
    var rows = '';
    if (ps.busy) {
      rows = '<div class="club-poll-search-status">Ищем…</div>';
    } else if (ps.err) {
      rows = '<div class="club-poll-search-status">' + esc(ps.err) + '</div>';
    } else if (!(ps.items || []).length && String(ps.q || '').trim().length >= 2) {
      rows = '<div class="club-poll-search-status">Ничего не нашлось</div>';
    } else {
      rows = (ps.items || [])
        .map(function (it, idx) {
          var poster = it.poster || '';
          var title = esc(it.title || '');
          var meta = esc(it.subtitle || '');
          return (
            '<button type="button" class="club-poll-search-row" data-club-poll-search-pick="' +
            idx +
            '">' +
            (poster
              ? '<img src="' + esc(poster) + '" alt="">'
              : '<span class="club-poll-film-ph"></span>') +
            '<span class="club-poll-search-meta"><b>' +
            title +
            '</b><em>' +
            meta +
            '</em></span></button>'
          );
        })
        .join('');
    }
    return (
      '<div class="club-poll-search-backdrop" data-club-poll-search-close>' +
      '<div class="club-poll-search" role="dialog" aria-modal="true" aria-label="Поиск для варианта" data-club-poll-search-sheet>' +
      '<div class="club-compose-top"><h3>' + (ps.target === "club-plan" ? "Выберите фильм для плана" : "Прикрепить из поиска") + '</h3>' +
      '<button type="button" class="club-compose-x" data-club-poll-search-close aria-label="Закрыть">' +
      icon('x', { size: 'sm' }) +
      '</button></div>' +
      '<label class="club-field"><span>Фильм, сериал или человек</span>' +
      '<input type="search" id="club-poll-search-q" maxlength="120" value="' +
      esc(ps.q || '') +
      '" placeholder="Начните вводить…" autocomplete="off"></label>' +
      '<div class="club-poll-search-results">' +
      rows +
      '</div></div></div>'
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
    host.innerHTML = fabHtml() + composeHtml() + deleteConfirmHtml() + lightboxHtml() + pollSearchHtml();
    // bind overlay-only controls (fab/compose/delete) — full bind also runs on root
    var fab = host.querySelector('[data-club-compose-open]');
    if (fab) fab.onclick = openCompose;
    var planFab = host.querySelector("[data-club-plan-open]");
    if (planFab) planFab.onclick = openClubPlanSearch;
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
          state.composePollOptions = [emptyPollOpt(), emptyPollOpt()];
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
        if (!isNaN(i)) {
          var opt = normalizePollOpt(state.composePollOptions[i]);
          opt.text = inp.value;
          state.composePollOptions[i] = opt;
        }
      };
    });
    var pollMultiple = host.querySelector("#club-compose-poll-multiple"); if (pollMultiple) pollMultiple.onchange = function() { state.composePollMultiple = pollMultiple.checked; }; var pollChange = host.querySelector("#club-compose-poll-change"); if (pollChange) pollChange.onchange = function() { state.composePollAllowChange = pollChange.checked; }; var pollAnonymous = host.querySelector("#club-compose-poll-anonymous"); if (pollAnonymous) pollAnonymous.onchange = function() { state.composePollAnonymous = pollAnonymous.checked; };
    var pollDuration = host.querySelector("#club-compose-poll-duration"); if (pollDuration) pollDuration.onchange = function() { state.composePollDuration = pollDuration.value; };
    var addOpt = host.querySelector('[data-club-poll-add-opt]');
    if (addOpt) {
      addOpt.onclick = function () {
        if ((state.composePollOptions || []).length >= 6) return;
        state.composePollOptions = (state.composePollOptions || []).map(normalizePollOpt).concat([emptyPollOpt()]);
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

    bindPollControls(host);
    bindEmbedControls(host);
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
    state.composeEmbeds = [];
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
    state.composeEmbeds = [];
    state.composeBody = '';
    state.composeTitle = '';
    state.composePollOn = false;
    state.composePollQuestion = '';
    state.composePollDuration = '';
    state.composePollMultiple = false;
    state.composePollAllowChange = false;
    state.composePollAnonymous = false;
    state.composePollOptions = [emptyPollOpt(), emptyPollOpt()];
    state.pollSearch = null;
    state.composeImages = [];
    state.composeImagesPos = 'below';
    state.composeEmbeds = [];
  }

  function readComposePoll() {
    if (!state.composePollOn) return null;
    var host = document.getElementById('club-page-overlays') || root;
    var qEl = host.querySelector('#club-compose-poll-q');
    var q = String((qEl && qEl.value) || state.composePollQuestion || '').trim();
    var opts = [];
    host.querySelectorAll('.club-poll-option-input').forEach(function (inp) {
      var i = parseInt(inp.getAttribute('data-club-poll-opt'), 10);
      var n = normalizePollOpt(!isNaN(i) ? state.composePollOptions[i] : null);
      n.text = String(inp.value || '').trim();
      if (n.text || n.card) {
        var out = { text: n.text };
        if (n.card) out.card = n.card;
        opts.push(out);
      }
    });
    if (!opts.length) {
      (state.composePollOptions || []).forEach(function (o) {
        var n = normalizePollOpt(o);
        n.text = String(n.text || '').trim();
        if (n.text || n.card) {
          var out = { text: n.text };
          if (n.card) out.card = n.card;
          opts.push(out);
        }
      });
    }
    var durationEl = host.querySelector("#club-compose-poll-duration");
    var multipleEl = host.querySelector("#club-compose-poll-multiple");
    var changeEl = host.querySelector("#club-compose-poll-change");
    var anonymousEl = host.querySelector("#club-compose-poll-anonymous");
    if (!q || opts.length < 2) return { error: "Опрос: вопрос и минимум 2 варианта" };
    var result = { question: q, options: opts.slice(0, 6), allow_multiple: !!(multipleEl && multipleEl.checked), allow_change_vote: !!(changeEl && changeEl.checked), anonymous: !!(anonymousEl && anonymousEl.checked) }; if (durationEl && durationEl.value) result.duration_hours = parseInt(durationEl.value, 10); return result;
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
    state.composeEmbeds = (post.embeds || []).slice();
    if (post.poll && post.poll.question) {
      state.composePollDuration = post.poll.duration_hours ? String(post.poll.duration_hours) : '';
      state.composePollMultiple = !!post.poll.allow_multiple;
      state.composePollAllowChange = !!post.poll.allow_change_vote;
      state.composePollAnonymous = !!post.poll.anonymous;
      state.composePollOn = true;
      state.composePollQuestion = post.poll.question || '';
      state.composePollOptions = (post.poll.options || []).map(normalizePollOpt);
      while (state.composePollOptions.length < 2) state.composePollOptions.push(emptyPollOpt());
    } else {
      state.composePollOn = false;
      state.composePollQuestion = '';
    state.composePollDuration = '';
    state.composePollMultiple = false;
    state.composePollAllowChange = false;
    state.composePollAnonymous = false;
      state.composePollOptions = [emptyPollOpt(), emptyPollOpt()];
    }
    state.pollSearch = null;
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
    var embeds = (state.composeEmbeds || []).slice();
    if (!body && !poll && !images.length && !embeds.length) {
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
      embeds: embeds,
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
          state.composePollOptions = [emptyPollOpt(), emptyPollOpt()];
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
          var opt = normalizePollOpt(state.composePollOptions[i]);
          opt.text = inp.value;
          state.composePollOptions[i] = opt;
        }
      };
    });
    var pollMultipleRoot = root.querySelector("#club-compose-poll-multiple"); if (pollMultipleRoot) pollMultipleRoot.onchange = function() { state.composePollMultiple = pollMultipleRoot.checked; }; var pollChangeRoot = root.querySelector("#club-compose-poll-change"); if (pollChangeRoot) pollChangeRoot.onchange = function() { state.composePollAllowChange = pollChangeRoot.checked; }; var pollAnonymousRoot = root.querySelector("#club-compose-poll-anonymous"); if (pollAnonymousRoot) pollAnonymousRoot.onchange = function() { state.composePollAnonymous = pollAnonymousRoot.checked; };
    var pollDurationRoot = root.querySelector("#club-compose-poll-duration"); if (pollDurationRoot) pollDurationRoot.onchange = function() { state.composePollDuration = pollDurationRoot.value; };
    var addOpt = root.querySelector('[data-club-poll-add-opt]');
    if (addOpt) {
      addOpt.onclick = function () {
        if ((state.composePollOptions || []).length >= 6) return;
        state.composePollOptions = (state.composePollOptions || []).map(normalizePollOpt).concat([emptyPollOpt()]);
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
    root.querySelectorAll('[data-club-comments-toggle]').forEach(function (b) {
      b.onclick = function () { toggleComments(b.getAttribute('data-club-comments-toggle')); };
    });
    root.querySelectorAll('[data-club-comment-form]').forEach(function (form) {
      form.onsubmit = function (e) {
        e.preventDefault();
        submitComment(form.getAttribute('data-club-comment-form'), form);
      };
      var ta = form.querySelector('textarea');
      if (ta) ta.oninput = function () { state.commentDrafts[form.getAttribute('data-club-comment-form')] = ta.value; };
    });
    root.querySelectorAll('[data-club-comment-delete]').forEach(function (b) {
      b.onclick = function () { deleteComment(b.getAttribute('data-club-comment-post'), b.getAttribute('data-club-comment-delete')); };
    });
    root.querySelectorAll('[data-club-comments-login]').forEach(function (b) { b.onclick = login; });
    root.querySelectorAll("[data-club-reaction]").forEach(function(b) { b.onclick = function() { toggleReaction(b.getAttribute("data-club-reaction"), b.getAttribute("data-emoji"), b.getAttribute("aria-pressed") === "true"); }; });
    root.querySelectorAll("[data-club-reaction-add]").forEach(function(b) { b.onclick = function() { toggleReaction(b.getAttribute("data-club-reaction-add"), b.getAttribute("data-emoji"), false); }; });
    root.querySelectorAll("[data-club-poll-film-link]").forEach(function(a) { a.onclick = function(e) { e.stopPropagation(); }; });
    root.querySelectorAll("[data-club-poll-choice]").forEach(function(row) { row.onclick = function(e) { if (e.target.closest && e.target.closest("a")) return; var input = row.querySelector("input"); if (!input) return; if (!hasToken()) { login(); return; } if (e.target !== input) input.click(); var article = row.closest(".club-post"), box = article && article.querySelector("[data-club-poll-vote]"), btn = article && article.querySelector("[data-club-poll-vote-submit]"); if (btn) btn.disabled = !box.querySelector("input:checked"); }; });
    root.querySelectorAll("[data-club-poll-vote] input").forEach(function(input) { input.onchange = function() { var article = input.closest(".club-post"), box = article && article.querySelector("[data-club-poll-vote]"), btn = article && article.querySelector("[data-club-poll-vote-submit]"); if (btn) btn.disabled = !box.querySelector("input:checked"); }; });
    root.querySelectorAll("[data-club-poll-edit]").forEach(function(b) { b.onclick = function() { state.pollEdits[String(b.getAttribute("data-club-poll-edit"))] = true; render(); }; });
    bindPollControls(root);
    bindEmbedControls(root);
    root.querySelectorAll("[data-club-poll-vote-submit]").forEach(function(b) { b.onclick = function() { var article = b.closest(".club-post"), box = article && article.querySelector("[data-club-poll-vote]"); if (box) submitPollVote(b.getAttribute("data-club-poll-vote-submit"), box); }; });
  }


  function closePollSearch() {
    var ps = state.pollSearch;
    if (ps && ps.timer) clearTimeout(ps.timer);
    state.pollSearch = null;
    render();
  }

  function openPollSearch(index) {
    var opts = state.composePollOptions || [];
    if (index < 0 || index >= opts.length) return;
    state.composePollOptions = opts.map(normalizePollOpt);
    state.pollSearch = { target: "poll", index: index, q: '', items: [], busy: false, err: '', timer: null, seq: 0 };
    render();
    setTimeout(function () {
      var input = (overlayHost || document).querySelector('#club-poll-search-q');
      if (input) input.focus();
    }, 20);
  }

  function openClubPlanSearch() {
    if (!state.admin) return;
    state.pollSearch = { target: 'club-plan', index: null, q: '', items: [], busy: false, err: '', timer: null, seq: 0 };
    render();
    setTimeout(function () {
      var input = (overlayHost || document).querySelector('#club-poll-search-q');
      if (input) input.focus();
    }, 20);
  }

  function schedulePollSearch(q) {
    var ps = state.pollSearch;
    if (!ps) return;
    ps.q = String(q || '');
    if (ps.timer) clearTimeout(ps.timer);
    ps.timer = setTimeout(function () {
      var active = state.pollSearch;
      if (!active || active !== ps) return;
      var query = String(ps.q || '').trim();
      if (query.length < 2) {
        ps.busy = false;
        ps.err = '';
        ps.items = [];
        updatePollSearchResults();
        return;
      }
      var seq = ++ps.seq;
      ps.busy = true;
      ps.err = '';
      updatePollSearchResults();
      req('/api/public/search?q=' + encodeURIComponent(query.slice(0, 120)) + '&limit=8&person_limit=6')
        .then(function (d) {
          if (state.pollSearch !== ps || ps.seq !== seq) return;
          var cards = [];
          arr(d, ['items', 'films', 'results']).forEach(function (it) {
            var card = cardFromSearchItem(it, 'film');
            if (card) cards.push(card);
          });
          arr(d, ['persons', 'people']).forEach(function (it) {
            var card = cardFromSearchItem(it, 'person');
            if (card) cards.push(card);
          });
          ps.items = cards;
          ps.busy = false;
          updatePollSearchResults();
        })
        .catch(function (e) {
          if (state.pollSearch !== ps || ps.seq !== seq) return;
          ps.busy = false;
          ps.err = e && e.name === 'AbortError' ? '' : 'Не удалось найти';
          updatePollSearchResults();
        });
    }, 280);
  }

  function openEmbedSearch() { state.pollSearch = {target: "embed", index: null, q: "", items: [], busy: false, err: "", timer: null, seq: 0}; render(); setTimeout(function() { var input = (overlayHost || document).querySelector("#club-poll-search-q"); if (input) input.focus(); }, 20); }
  function enrichEmbedCard(card) { if (!card || card.kind === "person" || !card.id || card.description) return; req("/api/public/film/" + encodeURIComponent(card.id)).then(function(d) { var f = d && (d.film || d.item || d.data || d); if (!f) return; card.description = String(f.description || f.short_description || f.plot || "").trim() || undefined; if (!card.subtitle) { var actors = f.actors || f.cast || f.actors_names; var year = f.year || f.release_year; card.subtitle = String([year, actors].filter(Boolean).join(" · ")).trim() || undefined; } render(); }).catch(function() {}); }
  function pickPollSearch(index) {
    var ps = state.pollSearch;
    if (!ps || !ps.items || !ps.items[index]) return;
    if (ps.target === 'club-plan') {
      var planFilm = ps.items[index];
      closePollSearch();
      openClubPlanModal(planFilm);
      return;
    }
    if (ps.target === "embed") { var picked = ps.items[index]; state.composeEmbeds = (state.composeEmbeds || []).concat([picked]); closePollSearch(); enrichEmbedCard(picked); return; }
    var optIndex = parseInt(ps.index, 10);

    if (isNaN(optIndex)) return;
    var opt = normalizePollOpt((state.composePollOptions || [])[optIndex]);
    opt.card = ps.items[index];
    if (!String(opt.text || '').trim()) opt.text = String(opt.card.title || '');
    state.composePollOptions[optIndex] = opt;
    closePollSearch();
  }
  function openClubPlanModal(card) {
    if (!card || !card.id || !global.MpPlanModal || typeof global.MpPlanModal.open !== 'function') { toast('Форма плана недоступна', { type: 'error' }); return; }
    var base = (global.MP_API_BASE || global.API_BASE || '') || '';
    var tok = typeof global.getToken === 'function' ? global.getToken() : '';
    global.MpPlanModal.open({
      apiBase: base,
      getAuthHeaders: function () { var h = { 'Content-Type': 'application/json' }; if (tok) h.Authorization = 'Bearer ' + tok; return h; },
      onToast: function (m) { toast(m, { type: /не|ошиб/i.test(String(m || '')) ? 'error' : 'info' }); },
      film: { kp_id: card.id, title: card.title || 'Фильм', year: card.subtitle || '', poster: card.poster || '' },
      mode: 'home',
      libraryChatId: state.id,
      onSuccess: function (res) {
        var created = res && res.plan;
        if (created) { state.club.plans = (state.club.plans || []).filter(function (p) { return String(p.id || '') !== String(created.id || ''); }); state.club.plans.push(created); }
        state.tab = 'schedule';
        render();
      }
    });
  }

  function submitPollVote(pid, box) { var selected = Array.prototype.slice.call(box.querySelectorAll("input:checked")).map(function(i) { return parseInt(i.value, 10); }); if (!selected.length) return; if (!hasToken()) { login(); return; } var btn = box.querySelector("[data-club-poll-vote-submit]"); if (btn) btn.disabled = true; global.api("/api/site/rooms/" + encodeURIComponent(state.id) + "/posts/" + encodeURIComponent(pid) + "/vote", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({option_indexes:selected})}).then(function(d) { var post = (state.posts || []).find(function(p) { return String(p.id) === String(pid); }); if (post) { post.my_votes = d.my_votes || selected; post.counts = d.counts || post.counts; post.total = d.total || post.total; if (d.voters) post.voters = d.voters; } delete state.pollEdits[String(pid)]; toast("Голос учтён"); render(); }).catch(function(e) { if (btn) btn.disabled = false; toast((e && e.message) || "Не удалось проголосовать", {type:"error"}); }); }
  function toggleReaction(pid, emoji, active) { if (!hasToken()) { login(); return; } if (!state.member) { toast("Вступите в клуб, чтобы реагировать", { type: "error" }); return; } var method = active ? "DELETE" : "POST"; global.api("/api/site/rooms/" + encodeURIComponent(state.id) + "/posts/" + encodeURIComponent(pid) + "/reactions", { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji: emoji }) }).then(function(d) { var post = (state.posts || []).find(function(p) { return String(p.id) === String(pid); }); if (post) { post.reactions = d.reactions || []; post.reaction_counts = d.reaction_counts || {}; post.my_reactions = d.my_reactions || []; } render(); }).catch(function(e) { toast((e && e.message) || "Не удалось поставить реакцию", { type: "error" }); }); }
  function bindEmbedControls(host) { if (!host) return; host.querySelectorAll("[data-club-embed-open]").forEach(function(b) { b.onclick = openEmbedSearch; }); host.querySelectorAll("[data-club-embed-remove]").forEach(function(b) { b.onclick = function() { var i = parseInt(b.getAttribute("data-club-embed-remove"), 10); if (!isNaN(i)) { state.composeEmbeds = (state.composeEmbeds || []).filter(function(_, idx) { return idx !== i; }); render(); } }; }); }
  function bindPollControls(host) {
    if (!host) return;
    host.querySelectorAll('[data-club-poll-opt-search]').forEach(function (b) {
      b.onclick = function () {
        var i = parseInt(b.getAttribute('data-club-poll-opt-search'), 10);
        if (!isNaN(i)) openPollSearch(i);
      };
    });
    host.querySelectorAll('[data-club-poll-card-clear]').forEach(function (b) {
      b.onclick = function () {
        var i = parseInt(b.getAttribute('data-club-poll-card-clear'), 10);
        if (isNaN(i)) return;
        var opt = normalizePollOpt((state.composePollOptions || [])[i]);
        opt.card = null;
        state.composePollOptions[i] = opt;
        render();
      };
    });
    host.querySelectorAll('[data-club-poll-search-close]').forEach(function (b) {
      b.onclick = function (e) {
        if (b.classList.contains('club-poll-search-backdrop') && e.target !== b) return;
        closePollSearch();
      };
    });
    var sheet = host.querySelector('[data-club-poll-search-sheet]');
    if (sheet) sheet.onclick = function (e) { e.stopPropagation(); };
    var searchInput = host.querySelector('#club-poll-search-q');
    if (searchInput) {
      searchInput.oninput = function () { schedulePollSearch(searchInput.value); };
      searchInput.onkeydown = function (e) { if (e.key === 'Escape') closePollSearch(); };
    }
    host.querySelectorAll('[data-club-poll-search-pick]').forEach(function (b) {
      b.onclick = function () {
        var i = parseInt(b.getAttribute('data-club-poll-search-pick'), 10);
        if (!isNaN(i)) pickPollSearch(i);
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
    state.comments = {};
    state.commentDrafts = {};
    state.members = [];
    state.member = false;
    state.admin = false;
    state.pollEdits = {};
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
