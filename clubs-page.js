/**
 * Киноклубы — каталог в «Смотреть» (/whattowatch/clubs, alias /clubs).
 *
 * Поля description / frequency / next_plan / recent_watched могут отсутствовать,
 * пока не приземлится PR бота. Карточка деградирует: показывает то, что есть.
 *
 * TODO later: per-user «что я оценил в этом клубе» и полная статистика клуба.
 */
(function (global) {
  "use strict";

  var SEO = {
    title: "Киноклубы — Movie Planner",
    description: "Открытые киноклубы Movie Planner: общая база, планы просмотра и заявки на вступление. Найдите клуб или создайте свой.",
    path: "/whattowatch/clubs",
    canonical: "https://movie-planner.ru/whattowatch/clubs",
  };

  var ARTICLE_HREF = "/articles/kinokluby-movie-planner.html";
  var DESC_MAX = 200;
  var FREQ_LABELS = {
    few_days: "раз в несколько дней",
    weekly: "раз в неделю",
    biweekly: "раз в две недели",
    monthly: "раз в месяц",
    rare: "редко",
    unknown: "пока мало данных",
  };
  var FREQ_CANON = [
    "раз в несколько дней",
    "раз в неделю",
    "раз в две недели",
    "раз в месяц",
    "редко",
    "пока мало данных",
  ];

  var _state = { q: "", loading: false, reqId: 0 };
  var _myClubs = [];
  var _paintGen = 0;

  function esc(s) {
    if (global.escapeHtml) return global.escapeHtml(s);
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function iconHtml(key, opts) {
    try {
      if (global.MPIcons && typeof global.MPIcons.html === "function") {
        return global.MPIcons.html(key, opts || { size: "md" });
      }
    } catch (_) {}
    return "";
  }

  function hydrateIcons(root) {
    try {
      if (global.MPIcons && typeof global.MPIcons.hydrate === "function") {
        global.MPIcons.hydrate(root);
      }
    } catch (_) {}
  }

  function toast(msg, opts) {
    if (global.showToast) global.showToast(msg, opts);
  }

  function hasSiteAuth() {
    if (typeof global.getToken === "function" && global.getToken()) return true;
    try {
      var active = localStorage.getItem("mp_site_active_chat_id");
      var sessions = JSON.parse(localStorage.getItem("mp_site_sessions") || "[]");
      if (Array.isArray(sessions)) {
        for (var i = 0; i < sessions.length; i++) {
          if (String(sessions[i].chat_id) === String(active) && sessions[i].token) return true;
        }
      }
      return !!localStorage.getItem("mp_site_token");
    } catch (_) {
      return false;
    }
  }

  function applyClubsSeo() {
    try {
      document.title = SEO.title;
      var meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute("content", SEO.description);
      var canon = document.querySelector('link[rel="canonical"]');
      if (canon) canon.setAttribute("href", SEO.canonical);
    } catch (_) {}
  }

  function apiGet(path) {
    if (typeof global.api === "function" && hasSiteAuth()) return global.api(path);
    return apiPublicGet(path);
  }

  function apiPublicGet(path) {
    var base = global.API_BASE || global.SITE_ORIGIN || "https://movie-planner.ru";
    function directFetch() {
      return fetch(base + path, { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (!r.ok && data && !data.error) data.error = "HTTP " + r.status;
            if (!r.ok && data && data.success !== false) data.success = false;
            return data;
          });
        });
    }
    if (typeof global.apiPublic === "function") {
      return global.apiPublic(path).then(function (data) {
        if (data && (data.success === true || Array.isArray(data.groups) || Array.isArray(data.items))) {
          return data;
        }
        return directFetch();
      }).catch(function () {
        return directFetch();
      });
    }
    return directFetch();
  }

  function clubsFromPayload(data) {
    if (!data || typeof data !== "object") return null;
    if (data.success === false && !Array.isArray(data.groups) && !Array.isArray(data.items)) return null;
    var raw = data.groups || data.items || data.clubs || [];
    if (!Array.isArray(raw)) return null;
    return raw.filter(function (g) {
      if (!g) return false;
      var kind = String(g.group_kind || g.kind || "cinema_club");
      return kind === "cinema_club" || kind === "club";
    });
  }

  function fetchDiscover(q) {
    var params = ["kind=cinema_club", "group_kind=cinema_club"];
    if (q) params.push("q=" + encodeURIComponent(q));
    var qs = "?" + params.join("&");
    var paths = [
      "/api/public/groups/discover" + qs,
      "/api/site/groups/discover" + qs,
      "/api/site/groups/discover" + (q ? "?q=" + encodeURIComponent(q) : ""),
    ];
    function tryPath(i) {
      if (i >= paths.length) {
        return Promise.resolve({ success: true, groups: [], unauthorized: true });
      }
      var path = paths[i];
      var req = path.indexOf("/api/site/") === 0 ? apiGet(path) : apiPublicGet(path);
      return req.then(function (data) {
        var list = clubsFromPayload(data);
        if (list) return { success: true, groups: list, raw: data };
        var err = String((data && (data.error || data.detail)) || "");
        if (/unauthor|auth|401/i.test(err) || (data && data.success === false && i < paths.length - 1)) {
          return tryPath(i + 1);
        }
        if (i < paths.length - 1) return tryPath(i + 1);
        return { success: true, groups: [], unauthorized: /unauthor|auth|401/i.test(err) };
      }).catch(function () {
        return tryPath(i + 1);
      });
    }
    return tryPath(0);
  }

  function normalizeFreqLabel(raw) {
    if (raw == null) return "";
    var s = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
    if (!s) return "";
    if (FREQ_LABELS[s]) return FREQ_LABELS[s];
    for (var i = 0; i < FREQ_CANON.length; i++) {
      if (s === FREQ_CANON[i] || s.indexOf(FREQ_CANON[i]) !== -1) return FREQ_CANON[i];
    }
    if (s === "few_days" || s.indexOf("нескольк") !== -1 || s.indexOf("каждые 2") !== -1 || s.indexOf("каждые 3") !== -1) {
      return FREQ_LABELS.few_days;
    }
    if (s === "weekly" || s === "week" || s.indexOf("недел") !== -1) {
      if (s.indexOf("две") !== -1 || s.indexOf("2 ") !== -1) return FREQ_LABELS.biweekly;
      return FREQ_LABELS.weekly;
    }
    if (s === "biweekly" || s === "fortnight") return FREQ_LABELS.biweekly;
    if (s === "monthly" || s === "month" || s.indexOf("месяц") !== -1) return FREQ_LABELS.monthly;
    if (s === "rare" || s === "rarely" || s.indexOf("редко") !== -1) return FREQ_LABELS.rare;
    if (s.indexOf("мало") !== -1 || s === "unknown" || s === "none") return FREQ_LABELS.unknown;
    return "";
  }

  function freqFromDays(days) {
    var n = Number(days);
    if (!isFinite(n) || n <= 0) return "";
    if (n < 5) return FREQ_LABELS.few_days;
    if (n <= 10) return FREQ_LABELS.weekly;
    if (n <= 21) return FREQ_LABELS.biweekly;
    if (n <= 40) return FREQ_LABELS.monthly;
    return FREQ_LABELS.rare;
  }

  function parseWhenMs(value) {
    if (value == null || value === "") return 0;
    if (typeof value === "number" && isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    var t = Date.parse(String(value));
    return isFinite(t) ? t : 0;
  }

  function freqFromRecent(items) {
    var dates = (items || []).map(function (x) {
      return parseWhenMs(x && (x.watched_at || x.when || x.date || x.watched_on || x.created_at));
    }).filter(Boolean).sort(function (a, b) { return b - a; });
    if (dates.length < 2) return "";
    var gaps = [];
    for (var i = 0; i < dates.length - 1 && i < 5; i++) {
      gaps.push((dates[i] - dates[i + 1]) / 86400000);
    }
    var avg = gaps.reduce(function (s, n) { return s + n; }, 0) / gaps.length;
    return freqFromDays(avg);
  }

  function watchFrequencyLabel(club) {
    if (!club) return FREQ_LABELS.unknown;
    var direct = normalizeFreqLabel(
      club.watch_frequency_label
      || club.frequency_label
      || club.watch_cadence
      || club.cadence_label
      || club.watch_frequency
      || club.frequency
    );
    if (direct) return direct;
    var days = club.avg_days_between_watches || club.watch_interval_days || club.days_between || club.avg_interval_days;
    var fromDays = freqFromDays(days);
    if (fromDays) return fromDays;
    var fromRecent = freqFromRecent(club.recent_watched || club.last_watched || club.recent_films);
    if (fromRecent) return fromRecent;
    var last30 = Number(club.watches_last_30d || club.watched_last_30 || 0);
    var last90 = Number(club.watches_last_90d || 0);
    if (last30 >= 8) return FREQ_LABELS.few_days;
    if (last30 >= 3) return FREQ_LABELS.weekly;
    if (last30 >= 2) return FREQ_LABELS.biweekly;
    if (last30 >= 1 || last90 >= 2) return FREQ_LABELS.monthly;
    if (last90 >= 1) return FREQ_LABELS.rare;
    return FREQ_LABELS.unknown;
  }

  function shortDescription(club) {
    var raw = String((club && (club.description || club.short_description || club.about)) || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    if (raw.length <= DESC_MAX) return raw;
    return raw.slice(0, DESC_MAX).replace(/\s+\S*$/, "") + "…";
  }

  function formatWhen(value) {
    var ms = parseWhenMs(value);
    if (!ms) {
      var s = String(value || "").trim();
      return s && !/^\d+$/.test(s) ? s : "";
    }
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        timeZone: "Europe/Moscow",
      }).format(new Date(ms));
    } catch (_) {
      return "";
    }
  }

  function membersCount(club) {
    var n = Number(club && (club.members_count || club.member_count || club.members));
    return isFinite(n) && n > 0 ? n : 0;
  }

  function membersLabel(n) {
    var abs = Math.abs(n) % 100;
    var last = abs % 10;
    var word = "участников";
    if (abs > 10 && abs < 20) word = "участников";
    else if (last === 1) word = "участник";
    else if (last >= 2 && last <= 4) word = "участника";
    if (!n) return "пока без участников";
    return n + " " + word;
  }

  function coverUrl(club) {
    var u = club && (club.cover_url || club.cover || club.photo_url);
    if (!u) return "";
    var s = String(u).trim();
    if (!s || s.indexOf("placeholder") !== -1) return "";
    if (/^https?:\/\//i.test(s) || s.charAt(0) === "/") return s;
    return "";
  }

  function clubEmoji(club) {
    var e = club && (club.emoji || club.group_emoji || club.room_emoji);
    if (e && !/^https?:/i.test(String(e)) && String(e).indexOf("/api/") !== 0) {
      return String(e).trim().slice(0, 4) || "🎬";
    }
    return "🎬";
  }

  function nextPlan(club) {
    var p = club && (club.next_plan || club.upcoming_plan || club.next_watch || club.next);
    if (!p || typeof p !== "object") return null;
    var title = String(p.title || p.film_title || p.name || "").trim();
    if (!title) return null;
    return {
      title: title,
      when: formatWhen(p.when || p.date || p.planned_at || p.starts_at || p.watch_at),
      poster: p.poster || p.poster_url || "",
    };
  }

  function recentWatched(club) {
    var raw = (club && (club.recent_watched || club.last_watched || club.recent_films)) || [];
    if (!Array.isArray(raw)) raw = raw ? [raw] : [];
    return raw.slice(0, 4).map(function (f) {
      return {
        title: String((f && (f.title || f.film_title || f.name)) || "").trim(),
        when: formatWhen(f && (f.watched_at || f.when || f.date || f.watched_on)),
        poster: (f && (f.poster || f.poster_url)) || "",
        kpId: f && (f.kp_id || f.id),
      };
    }).filter(function (f) { return f.title || f.poster; });
  }

  function posterSrc(url, kpId) {
    var p = String(url || "").trim();
    if (p && p.indexOf("film-poster-placeholder") === -1) return p;
    var kp = String(kpId || "").replace(/\D/g, "");
    if (kp) return "/api/public/poster/kp/st/images/film_iphone/iphone360_" + kp + ".jpg";
    return "";
  }

  function isMember(club) {
    if (!club) return false;
    if (club.is_member || club.i_am_member || club.member === true) return true;
    var st = String(club.membership || club.my_membership || club.join_status || club.status || "").toLowerCase();
    if (st === "member" || st === "joined" || st === "approved") return true;
    var cid = String(club.chat_id || club.id || "");
    return _myClubs.some(function (p) { return String(p.chat_id) === cid; });
  }

  function isJoinPending(club) {
    var st = String((club && (club.join_status || club.membership || club.my_join_status)) || "").toLowerCase();
    return st === "pending" || st === "requested" || club && club.join_pending;
  }

  function joinIsOpen(club) {
    var mode = String((club && (club.join_approval_mode || club.join_mode || club.approval_mode)) || "").toLowerCase();
    return mode === "no_approval" || mode === "open" || mode === "instant";
  }

  function ctaKind(club) {
    if (isMember(club)) return "open";
    if (isJoinPending(club)) return "pending";
    if (joinIsOpen(club)) return "join";
    return "apply";
  }

  function ctaLabel(kind) {
    if (kind === "open") return "Открыть";
    if (kind === "pending") return "Заявка отправлена";
    if (kind === "join") return "Вступить";
    return "Подать заявку";
  }

  function requireLogin(hint) {
    try { sessionStorage.setItem("mp_post_login_path", "/whattowatch/clubs"); } catch (_) {}
    if (typeof global.requireAuthForAction === "function") {
      return global.requireAuthForAction(hint || "Войдите, чтобы продолжить");
    }
    if (typeof global.showLoginModalOverlay === "function") global.showLoginModalOverlay();
    return false;
  }

  function openCreateClub() {
    try { sessionStorage.setItem("mp_open_create_club", "1"); } catch (_) {}
    if (!hasSiteAuth()) {
      requireLogin("Войдите, чтобы создать киноклуб");
      return;
    }
    if (typeof global.__mpOpenCreateCinemaClub === "function") {
      global.__mpOpenCreateCinemaClub();
      return;
    }
    if (typeof global.openCreateRoomModal === "function") {
      global.openCreateRoomModal({ kind: "cinema_club" });
    }
  }

  function openClub(chatId) {
    if (!chatId) return;
    if (!hasSiteAuth()) {
      requireLogin("Войдите, чтобы открыть киноклуб");
      return;
    }
    if (typeof global.switchProfileTo === "function") {
      global.switchProfileTo(chatId);
      return;
    }
    if (typeof global.api === "function") {
      global.api("/api/site/profiles/switch", {
        method: "POST",
        body: JSON.stringify({ target_chat_id: Number(chatId) }),
      }).then(function (data) {
        if (data && data.success) window.location.href = "/home";
        else toast((data && data.error) || "Не удалось открыть клуб", { type: "error" });
      });
    }
  }

  function sendJoin(chatId, btn) {
    if (!chatId) return;
    if (!hasSiteAuth()) {
      requireLogin("Войдите, чтобы вступить в киноклуб");
      return;
    }
    if (typeof global.api !== "function") return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Отправляем…";
    }
    global.api("/api/site/rooms/" + encodeURIComponent(chatId) + "/join-request", {
      method: "POST",
      body: "{}",
    }).then(function (rr) {
      var approved = rr && (rr.status === "approved" || rr.joined === true);
      toast(approved ? "Вы вступили в киноклуб" : "Заявка отправлена");
      if (approved) {
        if (btn) { btn.textContent = "Открыть"; btn.disabled = false; btn.setAttribute("data-clubs-cta", "open"); }
        return;
      }
      if (btn) { btn.textContent = "Заявка отправлена"; btn.disabled = true; }
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = ctaLabel(btn.getAttribute("data-clubs-cta") || "apply"); }
      toast((e && e.message) || "Не удалось отправить заявку", { type: "error" });
    });
  }

  function skeletonHtml() {
    return '<div class="clubs-skel" aria-hidden="true">'
      + [0, 1, 2].map(function () {
        return '<div class="clubs-skel-card"><span class="clubs-skel-bar"></span><span class="clubs-skel-bar clubs-skel-bar--short"></span></div>';
      }).join("")
      + "</div>";
  }

  function emptyHtml() {
    return '<div class="clubs-empty">'
      + '<div class="clubs-empty-mark" aria-hidden="true">' + iconHtml("popcorn", { size: "lg" }) + "</div>"
      + '<p class="clubs-empty-title">Пока нет открытых киноклубов</p>'
      + '<p class="clubs-empty-text">Каталог только начинается. Создайте клуб для своих или откройте статью, как это устроено.</p>'
      + '<div class="clubs-empty-actions">'
      + '<button type="button" class="btn btn-primary" data-clubs-action="create">Создать киноклуб</button>'
      + '<a class="btn btn-secondary" href="' + ARTICLE_HREF + '">Как устроен киноклуб</a>'
      + "</div></div>";
  }

  function myClubsHtml() {
    if (!_myClubs.length) return "";
    return '<div class="clubs-mine">'
      + '<div class="clubs-mine-head">Ваши киноклубы</div>'
      + '<div class="clubs-mine-row">'
      + _myClubs.map(function (p) {
        var name = p.display_name || p.name || "Киноклуб";
        var emoji = clubEmoji(p);
        return '<button type="button" class="clubs-mine-chip" data-clubs-action="open" data-chat-id="'
          + esc(String(p.chat_id)) + '">'
          + '<span class="clubs-mine-emoji">' + esc(emoji) + "</span>"
          + '<span class="clubs-mine-name">' + esc(name) + "</span>"
          + "</button>";
      }).join("")
      + "</div></div>";
  }

  function recentHtml(items) {
    if (!items || !items.length) return "";
    return '<div class="clubs-card-recent">'
      + items.map(function (f) {
        var src = posterSrc(f.poster, f.kpId);
        return '<span class="clubs-recent-item">'
          + (src
            ? '<img class="clubs-recent-poster" src="' + esc(src) + '" alt="" loading="lazy" width="36" height="54">'
            : '<span class="clubs-recent-ph" aria-hidden="true"></span>')
          + '<span class="clubs-recent-meta">'
          + (f.title ? '<span class="clubs-recent-title">' + esc(f.title) + "</span>" : "")
          + (f.when ? '<span class="clubs-recent-when">' + esc(f.when) + "</span>" : "")
          + "</span></span>";
      }).join("")
      + "</div>";
  }

  function cardHtml(club) {
    var name = club.name || club.display_name || "Киноклуб";
    var cover = coverUrl(club);
    var emoji = clubEmoji(club);
    var members = membersCount(club);
    var freq = watchFrequencyLabel(club);
    var desc = shortDescription(club);
    var plan = nextPlan(club);
    var recent = recentWatched(club);
    var kind = ctaKind(club);
    var cid = club.chat_id || club.id || "";
    var coverInner = cover
      ? '<img class="clubs-card-cover-img" src="' + esc(cover) + '" alt="" loading="lazy">'
      : '<span class="clubs-card-emoji">' + esc(emoji) + "</span>";
    return '<article class="clubs-card" data-chat-id="' + esc(String(cid)) + '">'
      + '<div class="clubs-card-cover">' + coverInner + "</div>"
      + '<div class="clubs-card-body">'
      + '<div class="clubs-card-topline">'
      + '<h3 class="clubs-card-name">' + esc(name) + "</h3>"
      + '<span class="clubs-card-badge">Киноклуб</span>'
      + "</div>"
      + '<div class="clubs-card-meta">'
      + '<span>' + esc(membersLabel(members)) + "</span>"
      + '<span class="clubs-card-dot" aria-hidden="true">·</span>'
      + '<span>' + esc(freq) + "</span>"
      + "</div>"
      + (desc ? '<p class="clubs-card-desc">' + esc(desc) + "</p>" : "")
      + (plan
        ? '<p class="clubs-card-plan">Дальше: ' + esc(plan.title)
          + (plan.when ? " · " + esc(plan.when) : "")
          + "</p>"
        : "")
      + recentHtml(recent)
      + '<div class="clubs-card-actions">'
      + '<button type="button" class="btn ' + (kind === "open" ? "btn-secondary" : "btn-primary") + " clubs-card-cta"
      + (kind === "pending" ? " is-disabled" : "") + '"'
      + (kind === "pending" ? " disabled" : "")
      + ' data-clubs-cta="' + kind + '" data-chat-id="' + esc(String(cid)) + '">'
      + esc(ctaLabel(kind)) + "</button>"
      + "</div></div></article>";
  }

  function bindCatalog(root) {
    if (!root || root._clubsBound) return;
    root._clubsBound = true;
    root.addEventListener("click", function (e) {
      var createBtn = e.target.closest("[data-clubs-action='create']");
      if (createBtn && root.contains(createBtn)) {
        e.preventDefault();
        openCreateClub();
        return;
      }
      var openBtn = e.target.closest("[data-clubs-action='open']");
      if (openBtn && root.contains(openBtn)) {
        e.preventDefault();
        openClub(openBtn.getAttribute("data-chat-id"));
        return;
      }
      var cta = e.target.closest("[data-clubs-cta]");
      if (!cta || !root.contains(cta) || cta.disabled) return;
      e.preventDefault();
      var kind = cta.getAttribute("data-clubs-cta");
      var chatId = cta.getAttribute("data-chat-id");
      if (kind === "open") openClub(chatId);
      else sendJoin(chatId, cta);
    });
  }

  function loadMyClubs() {
    _myClubs = [];
    if (!hasSiteAuth() || typeof global.api !== "function") return Promise.resolve([]);
    return global.api("/api/site/profiles?lite=1").then(function (data) {
      var profiles = (data && data.profiles) || [];
      _myClubs = profiles.filter(function (p) {
        return p && !p.is_personal && String(p.group_kind || "") === "cinema_club";
      });
      return _myClubs;
    }).catch(function () {
      _myClubs = [];
      return [];
    });
  }

  function paintList(root, groups) {
    var mineHost = root.querySelector("#wtw-clubs-mine");
    var listEl = root.querySelector("#wtw-clubs-list");
    if (mineHost) mineHost.innerHTML = myClubsHtml();
    if (!listEl) return;
    if (!groups.length) {
      listEl.className = "clubs-list-host";
      listEl.innerHTML = emptyHtml();
      return;
    }
    listEl.className = "clubs-grid";
    listEl.innerHTML = groups.map(cardHtml).join("");
  }

  function loadCatalog(root) {
    var listEl = root.querySelector("#wtw-clubs-list");
    if (!listEl) return;
    _state.loading = true;
    var reqId = ++_state.reqId;
    listEl.className = "clubs-list-host";
    listEl.innerHTML = skeletonHtml() + '<p class="clubs-loading-label">Загружаем киноклубы…</p>';
    fetchDiscover(_state.q).then(function (data) {
      if (reqId !== _state.reqId) return;
      _state.loading = false;
      if (!listEl.isConnected) return;
      paintList(root, (data && data.groups) || []);
    }).catch(function () {
      if (reqId !== _state.reqId) return;
      _state.loading = false;
      if (!listEl.isConnected) return;
      listEl.className = "clubs-list-host";
      listEl.innerHTML = '<p class="cabinet-hint">Не удалось загрузить каталог. Обновите страницу.</p>';
    });
  }

  function consumeCreateFlag() {
    try {
      if (sessionStorage.getItem("mp_open_create_club") === "1") {
        sessionStorage.removeItem("mp_open_create_club");
        setTimeout(function () { openCreateClub(); }, 80);
      }
    } catch (_) {}
  }

  function renderCatalog(root) {
    if (!root) return;
    var paintId = ++_paintGen;
    applyClubsSeo();
    _state.q = "";
    _state.loading = false;
    root.innerHTML =
      '<div class="clubs-page">'
      + '<p class="cabinet-hint clubs-intro">Открытые киноклубы Movie Planner. Откройте карточку, вступите или создайте свой.</p>'
      + '<div class="clubs-toolbar">'
      + '<label class="clubs-search-label" for="wtw-clubs-search">'
      + '<span class="visually-hidden">Найти киноклуб</span>'
      + '<input type="search" id="wtw-clubs-search" class="collections-search-input clubs-search-input" '
      + 'placeholder="Название клуба" autocomplete="off" enterkeyhint="search">'
      + "</label>"
      + '<button type="button" class="btn btn-primary clubs-create-btn" data-clubs-action="create">Создать киноклуб</button>'
      + "</div>"
      + '<div id="wtw-clubs-mine"></div>'
      + '<div class="clubs-list-host" id="wtw-clubs-list">' + skeletonHtml() + "</div>"
      + '<p class="clubs-article-link">Как это работает: <a href="' + ARTICLE_HREF + '">киноклуб в Movie Planner</a></p>'
      + "</div>";
    bindCatalog(root);
    hydrateIcons(root);
    var searchInput = root.querySelector("#wtw-clubs-search");
    var searchTimer = null;
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        var val = String(searchInput.value || "").trim();
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          _state.q = val;
          loadCatalog(root);
        }, 280);
      });
      searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (searchTimer) clearTimeout(searchTimer);
          _state.q = String(searchInput.value || "").trim();
          loadCatalog(root);
        }
      });
    }
    loadMyClubs().then(function () {
      if (paintId !== _paintGen) return;
      loadCatalog(root);
    });
    consumeCreateFlag();
  }

  global.MpClubsPage = {
    renderCatalog: renderCatalog,
    openCreate: openCreateClub,
    watchFrequencyLabel: watchFrequencyLabel,
    SEO: SEO,
    ARTICLE_HREF: ARTICLE_HREF,
  };

  try {
    if (typeof global.__mpRepaintWtwClubsPanel === "function") {
      global.__mpRepaintWtwClubsPanel();
    }
  } catch (_) {}
})(typeof window !== "undefined" ? window : globalThis);
