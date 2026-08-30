/**
 * Коллекции и подборки — веб-кабинет (/features/collections).
 */
(function (global) {
  "use strict";

  var SEO = {
    title: "Коллекции фильмов — Movie Planner",
    description: "Личные коллекции, теги и редакционные подборки в Movie Planner: группируйте фильмы и сериалы по рубрикам, открывайте списки одним кликом.",
    path: "/features/collections",
    canonical: "https://movie-planner.ru/features/collections",
  };

  var _view = "hub";
  var _viewId = null;

  function esc(s) {
    if (global.escapeHtml) return global.escapeHtml(s);
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stripHtml(s) {
    if (s == null) return "";
    var str = String(s).trim();
    if (!str || str.indexOf("<") === -1) return str;
    try {
      var tmp = document.createElement("div");
      tmp.innerHTML = str;
      var text = (tmp.textContent || tmp.innerText || "").trim();
      if (text) return text;
    } catch (_) {}
    return str.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  function cleanTitle(s) {
    return esc(stripHtml(s));
  }

  function iconHtml(key, opts) {
    try {
      if (global.MPIcons && typeof global.MPIcons.html === "function") {
        return global.MPIcons.html(key, opts || { size: "md", className: "mp-list-icon" });
      }
    } catch (_) {}
    return "";
  }

  function apiGet(path) {
    return global.api(path);
  }

  function apiPost(path, body) {
    return global.api(path, { method: "POST", body: JSON.stringify(body || {}) });
  }

  function apiDelete(path) {
    return global.api(path, { method: "DELETE" });
  }

  function toast(msg, opts) {
    if (global.showToast) global.showToast(msg, opts);
    else if (global.toast) global.toast(msg);
  }

  function posterUrl(kpId) {
    if (!kpId) return "/images/film-poster-placeholder.png";
    var s = String(kpId);
    if (/^(movie|tv)-\d+$/i.test(s) || !/^\d+$/.test(s)) {
      return "/images/film-poster-placeholder.png";
    }
    // Same KP CDN as /f/ — 302→avatars when art exists. Never invent popcorn first.
    return "https://st.kp.yandex.net/images/film_iphone/iphone360_" + s + ".jpg";
  }

  function pickPoster(f) {
    var p = (f && f.poster) ? String(f.poster).trim() : "";
    if (p && p.indexOf("film-poster-placeholder") === -1) {
      return p;
    }
    return posterUrl(f && (f.kp_id || f.id));
  }

  function imgOnErrorAttr() {
    if (typeof global.mpPosterOnError === "function") {
      return " onerror=\"mpPosterOnError(this)\"";
    }
    return " onerror=\"this.src='/images/film-poster-placeholder.png'\"";
  }

  function filterPosterUrls(posters) {
    return (posters || []).filter(function (u) {
      if (!u) return false;
      var s = String(u);
      return s.indexOf("film-poster-placeholder") === -1;
    });
  }

  function cyclePosterUrls(urls, count) {
    if (!urls || !urls.length || count <= 0) return [];
    var out = [];
    for (var i = 0; i < count; i++) out.push(urls[i % urls.length]);
    return out;
  }

  function heroMosaicLayout(filmCount, titleText) {
    var n = Math.max(1, Number(filmCount) || 0);
    var titleLen = String(titleText || "").length;
    if (n <= 5) return { mode: "spotlight", count: n };
    var rows = 2;
    if (n >= 12) rows = 3;
    if (n >= 25) rows = 4;
    if (n >= 45) rows = 5;
    if (n >= 70) rows = 6;
    if (titleLen > 32) rows += 1;
    if (titleLen > 52) rows += 1;
    if (titleLen > 72) rows += 1;
    rows = Math.min(rows, 7);
    var cols = n >= 50 ? 12 : n >= 25 ? 10 : 8;
    
    try {
      if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 640px)").matches) {
        cols = n >= 25 ? 6 : 5;
        rows = Math.min(Math.max(rows, 4), 7);
      }
    } catch (e) {}
    return { mode: "wall", cols: cols, rows: rows, cellCount: cols * rows };
  }

  function posterCellStyle(url) {
    var safe = String(url).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return "background-image:url('" + safe + "')";
  }

  function posterSpotlightHtml(urls) {
    var list = (urls || []).slice(0, 5);
    if (!list.length) {
      return '<div class="collections-poster-spotlight collections-poster-spotlight--empty" aria-hidden="true"></div>';
    }
    return (
      '<div class="collections-poster-spotlight collections-poster-spotlight--'
      + list.length + '" aria-hidden="true">'
      + list.map(function (u, i) {
        return '<div class="collections-poster-spotlight__cell" data-spot="' + i
          + '" style="' + posterCellStyle(u) + '"></div>';
      }).join("")
      + "</div>"
    );
  }

  function discoveryMosaicGrid(n) {
    if (n <= 1) return { cols: 1, rows: 1 };
    if (n === 2) return { cols: 2, rows: 1 };
    if (n === 3) return { cols: 3, rows: 1 };
    if (n === 4) return { cols: 2, rows: 2 };
    if (n === 5) return { cols: 5, rows: 1 };
    if (n === 6) return { cols: 3, rows: 2 };
    if (n === 7) return { cols: 7, rows: 1 };
    return { cols: 4, rows: 2 };
  }

  function discoveryCardMosaicHtml(posters) {
    var urls = filterPosterUrls(posters).slice(0, 8);
    var cls = "collections-poster-mosaic collections-poster-mosaic--card";
    if (!urls.length) {
      return '<div class="' + cls + ' collections-poster-mosaic--empty" aria-hidden="true"></div>';
    }
    var n = urls.length;
    var grid = discoveryMosaicGrid(n);
    return (
      '<div class="' + cls + ' collections-poster-mosaic--n' + n + '" aria-hidden="true" style="--mosaic-cols:'
      + grid.cols + ";--mosaic-rows:" + grid.rows + '">'
      + urls.map(function (u) {
        return '<div class="collections-poster-mosaic__cell" style="' + posterCellStyle(u) + '"></div>';
      }).join("")
      + "</div>"
    );
  }

  function posterMosaicHtml(posters, extraClass, opts) {
    var o = opts || {};
    var urls = filterPosterUrls(posters);
    var cls = "collections-poster-mosaic" + (extraClass ? " " + extraClass : "");
    if (!urls.length) {
      return '<div class="' + cls + ' collections-poster-mosaic--empty" aria-hidden="true"></div>';
    }
    if (o.mode === "spotlight") {
      return posterSpotlightHtml(urls);
    }
    var cols = o.cols || 4;
    var rows = o.rows || 2;
    var cellCount = o.cellCount || cols * rows;
    var filled = urls.slice(0, Math.min(urls.length, cellCount));
    if (filled.length < cellCount) {
      if (filled.length <= 3) {
        cols = Math.max(1, filled.length);
        rows = 1;
      } else if (filled.length <= 4) {
        cols = 2;
        rows = 2;
      } else {
        rows = Math.ceil(filled.length / cols);
      }
    }
    return (
      '<div class="' + cls + '" aria-hidden="true" style="--mosaic-cols:' + cols + ";--mosaic-rows:" + rows + '">'
      + filled.map(function (u) {
        return '<div class="collections-poster-mosaic__cell" style="' + posterCellStyle(u) + '"></div>';
      }).join("")
      + "</div>"
    );
  }

  function discoveryCardHtml(c) {
    var posters = c.preview_posters || [];
    var count = Number(c.films_count || 0);
    return (
      '<button type="button" class="collections-discovery-card" data-coll-action="wtw-public-open" data-coll-id="'
      + esc(c.short_code || "") + '">'
      + discoveryCardMosaicHtml(posters)
      + '<div class="collections-discovery-card__overlay">'
      + '<span class="collections-discovery-card__title">' + cleanTitle(c.name || "") + "</span>"
      + '<span class="collections-discovery-card__meta">' + esc(String(count)) + " в подборке</span>"
      + "</div></button>"
    );
  }

  function detailHeroHtml(coll, films, hintText) {
    var filmList = films || [];
    var posters = filterPosterUrls(filmList.map(function (f) { return pickPoster(f); }));
    var name = stripHtml(coll.name || "Подборка");
    var filmCount = coll.films_count || filmList.length || 0;
    var hint = hintText || (filmCount + " фильмов");
    var layout = heroMosaicLayout(filmCount, name);
    var mosaic;
    if (layout.mode === "spotlight") {
      mosaic = posterMosaicHtml(posters, "collections-poster-mosaic--hero", { mode: "spotlight" });
    } else {
      mosaic = posterMosaicHtml(posters, "collections-poster-mosaic--hero", layout);
    }
    var heroRows = layout.mode === "wall" ? layout.rows : 2;
    return (
      '<div class="collections-detail-hero collections-detail-hero--'
      + layout.mode + '" style="--hero-mosaic-rows:' + heroRows + '">'
      + '<div class="collections-detail-hero__mosaic-wrap">'
      + mosaic
      + '<div class="collections-detail-hero__fade-l" aria-hidden="true"></div>'
      + '<div class="collections-detail-hero__fade-r" aria-hidden="true"></div>'
      + "</div>"
      + '<div class="collections-detail-hero__shade"></div>'
      + '<div class="collections-detail-hero__inner">'
      + '<h1 class="collections-detail-hero__title">' + esc(name) + "</h1>"
      + '<div class="collections-detail-hero__meta">'
      + '<button type="button" class="collections-detail-hero__back" data-coll-action="wtw-back">← Коллекции</button>'
      + '<p class="collections-detail-hero__hint">' + esc(hint) + "</p>"
      + "</div></div></div>"
    );
  }

  function lockScroll() {
    var prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return function () {
      document.body.style.overflow = prev || "";
    };
  }

  function setMeta(name, content) {
    if (!content) return;
    var el = document.querySelector('meta[name="' + name + '"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", name);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }

  function setOg(prop, content) {
    if (!content) return;
    var el = document.querySelector('meta[property="' + prop + '"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("property", prop);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }

  function applyCollectionsSeo(active) {
    if (active) {
      try { document.title = SEO.title; } catch (_) {}
      setMeta("description", SEO.description);
      setOg("og:title", SEO.title);
      setOg("og:description", SEO.description);
      setOg("og:url", SEO.canonical);
      var canon = document.querySelector('link[rel="canonical"]');
      if (!canon) {
        canon = document.createElement("link");
        canon.rel = "canonical";
        document.head.appendChild(canon);
      }
      canon.href = SEO.canonical;
    } else if (typeof global.restoreDocumentTitle === "function") {
      global.restoreDocumentTitle();
    }
  }

  function hydrateIcons(root) {
    try {
      if (global.MPIcons && typeof global.MPIcons.hydrate === 'function') {
        global.MPIcons.hydrate(root || document);
      }
    } catch (_) {}
  }

  function emptyStateHtml(opts) {
    var o = opts || {};
    var hint = o.hint || "Пока пусто";
    var action = o.action || "";
    var actionLabel = o.actionLabel || "";
    if (!action) {
      return '<p class="empty-hint collections-empty-hint">' + esc(hint) + "</p>";
    }
    return (
      '<p class="empty-hint collections-empty-hint">' + esc(hint) + "</p>"
      + '<button type="button" class="collections-action-btn" data-coll-action="' + esc(action) + '">'
      + iconHtml("plus", { size: "sm", className: "collections-action-btn-icon" })
      + "<span>" + esc(actionLabel) + "</span></button>"
    );
  }

  function listLeadHtml(o) {
    if (o.emoji) {
      return '<span class="mp-list-emoji">' + esc(o.emoji) + "</span>";
    }
    if (o.icon) {
      var cls = "mp-list-icon" + (o.iconClass || "");
      return iconHtml(o.icon, { size: "md", className: cls });
    }
    return iconHtml("folder", { size: "md", className: "mp-list-icon" });
  }

  function listItemHtml(opts) {
    var o = opts || {};
    return (
      '<button type="button" class="mp-list-item collections-list-item" data-coll-action="' + esc(o.action) + '"'
      + (o.id != null ? ' data-coll-id="' + esc(String(o.id)) + '"' : "")
      + ">"
      + listLeadHtml(o)
      + '<span class="mp-list-text"><span class="mp-list-title">' + cleanTitle(o.title || "") + "</span>"
      + (o.hint ? '<span class="mp-list-hint">' + esc(o.hint) + "</span>" : "")
      + '</span><span class="mp-list-arrow" aria-hidden="true">›</span></button>'
    );
  }

  function fillListEl(el, items, mapFn, emptyHtml) {
    if (!el) return;
    if (items && items.length) {
      el.className = "mp-list collections-list";
      el.innerHTML = items.map(mapFn).join("");
    } else {
      el.className = "collections-empty-wrap";
      el.innerHTML = emptyHtml || '<p class="empty-hint collections-empty-hint">Пока пусто</p>';
    }
    hydrateIcons(el);
  }

  function filmsGridHtml(films, opts) {
    var o = opts || {};
    if (!films || !films.length) {
      return '<p class="cabinet-hint collections-empty">Пока пусто</p>';
    }
    var sparseCls = films.length <= 8 ? " collections-films-grid--sparse" : "";
    var tinyCls = films.length <= 4 ? " collections-films-grid--tiny collections-films-grid--n" + films.length : "";
    return (
      '<div class="movies-grid collections-films-grid' + (o.ranked ? " collections-films-grid--ranked" : "")
      + sparseCls + tinyCls + '">'
      + films.map(function (f) {
        var kp = f.kp_id != null ? String(f.kp_id) : "";
        var fid = f.id || f.already_in_base_film_id || f.film_id || "";
        var poster = pickPoster(f);
        var path = f.film_path || (kp ? ("/f/" + kp) : "");
        var rank = f.rank || f.nyt_rank;
        var rankBadge = rank ? ('<span class="collections-film-rank" aria-label="Место ' + esc(String(rank)) + '">#' + esc(String(rank)) + "</span>") : "";
        return (
          '<a href="' + esc(path || "#") + '" class="movie-poster collections-film-card" data-film-id="' + esc(String(fid || "")) + '" data-kp-id="' + esc(kp) + '"'
          + (path ? ' data-film-path="' + esc(path) + '"' : "")
          + '>'
          + rankBadge
          + '<div class="search-poster-media"><img class="movie-poster-img" src="' + esc(poster) + '" alt="' + esc(f.title || "") + '" loading="lazy"' + imgOnErrorAttr() + "></div>"
          + '<div class="movie-poster-body"><div class="movie-poster-title">' + esc(f.title || "—") + "</div>"
          + '<div class="movie-poster-meta">' + esc(f.year ? String(f.year) : "") + (f.is_series ? " · сериал" : "") + "</div></div>"
          + "</a>"
        );
      }).join("")
      + "</div>"
    );
  }

  function nytVotersRailHtml(voters) {
    if (!voters || !voters.length) return "";
    return (
      '<section class="nyt-voters-block" aria-label="Голосующие NY Times">'
      + '<h2 class="nyt-voters-title">Кто голосовал</h2>'
      + '<p class="cabinet-hint nyt-voters-lead">Режиссёры и актёры из опроса NY Times — откройте бюллетень с их топом фильмов.</p>'
      + '<label class="nyt-voters-search-label" for="nyt-voters-search"><span class="visually-hidden">Поиск по имени</span>'
      + '<input type="search" id="nyt-voters-search" class="collections-search-input nyt-voters-search" placeholder="Найти голосующего…" autocomplete="off"></label>'
      + '<div class="nyt-voters-rail" id="nyt-voters-rail">'
      + voters.map(function (v) {
        var url = v.ballot_url || ("/articles/nyt-ballot-" + esc(v.slug) + ".html");
        var top = (v.top_picks || []).slice(0, 2).join(", ");
        var photo = v.photo || "/images/person-avatar-placeholder.png";
        var displayName = v.display_name || v.name_ru || v.name || "";
        var searchName = [displayName, v.name_ru, v.name, v.name_en].filter(Boolean).join(" ").toLowerCase();
        return (
          '<a class="nyt-voter-card" href="' + esc(url) + '" data-voter-name="' + esc(searchName) + '">'
          + '<span class="nyt-voter-photo-wrap">'
          + '<img class="nyt-voter-photo" src="' + esc(photo) + '" alt="" loading="lazy" decoding="async" onerror="this.src=\'/images/person-avatar-placeholder.png\'">'
          + "</span>"
          + '<span class="nyt-voter-name">' + esc(displayName) + "</span>"
          + '<span class="nyt-voter-meta">' + esc(String(v.ballot_count || "")) + " фильмов</span>"
          + (top ? ('<span class="nyt-voter-top">' + esc(top) + "</span>") : "")
          + "</a>"
        );
      }).join("")
      + "</div></section>"
    );
  }

  function bindNytVotersSearch(root) {
    var input = root && root.querySelector("#nyt-voters-search");
    var rail = root && root.querySelector("#nyt-voters-rail");
    if (!input || !rail) return;
    input.addEventListener("input", function () {
      var q = String(input.value || "").trim().toLowerCase();
      rail.querySelectorAll(".nyt-voter-card").forEach(function (card) {
        var name = card.getAttribute("data-voter-name") || "";
        card.style.display = !q || name.indexOf(q) !== -1 ? "block" : "none";
      });
    });
  }

  function loadNytVotersRail(root) {
    return apiPublicGet("/api/public/nyt-century/voters?limit=120").then(function (data) {
      if (!data || !data.success || !data.voters || !data.voters.length) return "";
      var block = root.querySelector("#nyt-voters-host");
      if (!block) return "";
      block.innerHTML = nytVotersRailHtml(data.voters);
      bindNytVotersSearch(block);
      return data.voters;
    }).catch(function () {
      return "";
    });
  }

  function guestWhatIsHtml() {
    try {
      if (global.MpPublicPromo && typeof global.MpPublicPromo.buildHtml === "function") {
        return global.MpPublicPromo.buildHtml();
      }
    } catch (_) {}
    return (
      '<section class="mp-public-promo" aria-label="О Movie Planner">'
      + '<div class="what-is-v2 what-is-v2--public-page">'
      + '<div class="what-is-v2-label">Что такое Movie Planner</div>'
      + '<div class="what-is-v2-title">Трекер фильмов и сериалов<br>с <span class="gradient-text">планированием просмотров</span></div>'
      + '<div class="what-is-v2-text">Собирайте личную базу, отмечайте просмотренное и планируйте кино с друзьями.</div>'
      + '<div class="what-is-v2-cta">'
      + '<button type="button" class="header-login-btn what-is-v2-register-btn" data-mp-register-cta="1">Зарегистрироваться</button>'
      + "</div></div></section>"
    );
  }

  function openGuestRegister() {
    try {
      sessionStorage.setItem("mp_oauth_return", (window.location.pathname || "/") + (window.location.search || ""));
    } catch (_) {}
    try {
      if (global.MpPublicFilmLogin && typeof global.MpPublicFilmLogin.open === "function") {
        global.MpPublicFilmLogin.open("");
      } else if (typeof global.showLoginModalOverlay === "function") {
        global.showLoginModalOverlay("register");
      }
      document.querySelectorAll('[data-login-tab="register"]').forEach(function (btn) {
        btn.click();
      });
    } catch (_) {}
  }

  function applyDetailSeo(coll) {
    if (!coll) return;
    var name = stripHtml(coll.name || "Подборка");
    var count = Number(coll.films_count || 0);
    var code = coll.short_code || "";
    var title = name + " — коллекция фильмов | Movie Planner";
    var desc = "Подборка «" + name + "»: " + count + " фильмов. Откройте список в Movie Planner и добавьте в свою базу.";
    if (code === "venice-2026") {
      title = "Венецианский кинофестиваль 2026 — программа и фильмы конкурса | Movie Planner";
      desc = "Подборка фильмов 83-го Венецианского кинофестиваля (2–12 сентября 2026): основной конкурс, фильм открытия и закрытия.";
    }
    try { document.title = title; } catch (_) {}
    setMeta("description", desc);
    setOg("og:title", title);
    setOg("og:description", desc);
    var canonUrl = "https://movie-planner.ru/features/collections/" + encodeURIComponent(code);
    setOg("og:url", canonUrl);
    var canon = document.querySelector('link[rel="canonical"]');
    if (!canon) {
      canon = document.createElement("link");
      canon.rel = "canonical";
      document.head.appendChild(canon);
    }
    canon.href = canonUrl;
  }

  function hubSkeleton() {
    return (
      '<div class="collections-page">'
      + '<p class="collections-intro cabinet-hint">Теги — метки на карточках фильмов. Коллекции — списки, которые вы собираете сами. Подборки — готовые списки от Movie Planner.</p>'
      + '<section class="collections-block"><div class="collections-block-head"><h3 class="collections-block-title">Мои теги</h3></div><div class="collections-list-host" id="collections-tags-list"><div class="settings-loading">Загружаем…</div></div></section>'
      + '<section class="collections-block"><div class="collections-block-head"><h3 class="collections-block-title">Мои коллекции</h3><button type="button" class="collections-link-btn" data-coll-action="new">' + iconHtml("plus", { size: "sm", className: "collections-link-btn-icon" }) + '<span>Новая</span></button></div><div class="collections-list-host" id="collections-mine-list"><div class="settings-loading">Загружаем…</div></div></section>'
      + '<section class="collections-block"><div class="collections-block-head"><h3 class="collections-block-title">Общие подборки</h3></div><div class="collections-list-host" id="collections-public-list"><div class="settings-loading">Загружаем…</div></div></section>'
      + "</div>"
    );
  }

  function detailSkeleton(title, emoji, hint) {
    return (
      '<div class="collections-page collections-page--detail">'
      + '<button type="button" class="mp-sub-back" data-coll-action="back">← Коллекции</button>'
      + '<div class="collections-detail-head">'
      + '<h3 class="collections-detail-title">' + esc(emoji || "") + " " + esc(title || "") + "</h3>"
      + (hint ? '<p class="collections-detail-hint">' + esc(hint) + "</p>" : "")
      + "</div>"
      + '<div id="collections-detail-body"><div class="settings-loading">Загружаем…</div></div>'
      + "</div>"
    );
  }

  function bindRoot(root) {
    if (!root || root._collBound) return;
    root._collBound = true;
    root.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-coll-action]");
      if (!btn || !root.contains(btn)) return;
      e.preventDefault();
      var action = btn.getAttribute("data-coll-action");
      var id = btn.getAttribute("data-coll-id");
      if (action === "back") {
        _view = "hub";
        _viewId = null;
        renderCollectionsSection();
        return;
      }
      if (action === "new") {
        openCreateCollectionDialog(function () {
          _view = "hub";
          renderCollectionsSection();
        });
        return;
      }
      if (action === "mine" && id) {
        _view = "mine";
        _viewId = parseInt(id, 10);
        renderCollectionsSection();
        return;
      }
      if (action === "public" && id) {
        _view = "public";
        _viewId = parseInt(id, 10);
        renderCollectionsSection();
        return;
      }
      if (action === "user-public" && id) {
        _view = "user-public";
        _viewId = parseInt(id, 10);
        renderCollectionsSection();
        return;
      }
      if (action === "tag" && id) {
        var tagId = parseInt(id, 10);
        if (typeof global.__mpOpenFilmTagFromCollections === "function") {
          global.__mpOpenFilmTagFromCollections(tagId);
        } else if (typeof global.openFilmTagView === "function") {
          global.openFilmTagView(tagId, { returnSection: "whattowatch" });
        }
        return;
      }
      if (action === "import-public" && id) {
        importPublicCollection(parseInt(id, 10), btn);
      }
      if (action === "delete-mine" && id) {
        deleteMineCollection(parseInt(id, 10));
      }
    });
  }

  function openCreateCollectionDialog(onDone) {
    var unlock = lockScroll();
    var ov = document.createElement("div");
    ov.className = "mp-dialog-overlay collections-dialog-overlay";
    ov.innerHTML =
      '<div class="mp-dialog-card collections-dialog-card">'
      + '<button type="button" class="mp-dialog-close" data-close="1" aria-label="Закрыть">×</button>'
      + '<h3 class="mp-dialog-title">Новая коллекция</h3>'
      + '<div id="coll-new-author-wrap"></div>'
      + '<input type="text" id="coll-new-name" class="input-primary" placeholder="Название" maxlength="80" style="width:100%;margin-top:12px" />'
      + '<input type="text" id="coll-new-emoji" class="input-primary" placeholder="📁" maxlength="8" style="width:100%;margin-top:10px" />'
      + '<label class="settings-row" style="margin-top:12px;display:flex;align-items:center;gap:10px">'
      + '<input type="checkbox" id="coll-new-public" />'
      + '<span>Публичная — видна в каталоге (до 5 в месяц)</span></label>'
      + '<p class="cabinet-hint" style="margin-top:8px">Без галочки — только по прямой ссылке.</p>'
      + '<button type="button" class="btn-primary btn-full" id="coll-new-save" style="margin-top:14px">Создать</button>'
      + "</div>";
    function close() {
      unlock();
      ov.remove();
    }
    apiGet("/api/site/profiles?lite=1").then(function (pdata) {
      var wrap = ov.querySelector("#coll-new-author-wrap");
      var profiles = (pdata && pdata.profiles) || [];
      var adminGroups = profiles.filter(function (p) {
        return p && !p.is_personal && (p.is_group || (p.is_virtual && p.can_share_to_group !== false));
      });
      if (wrap && adminGroups.length) {
        wrap.innerHTML =
          '<label class="cabinet-hint">От лица</label>'
          + '<select id="coll-new-author" class="input-primary" style="width:100%;margin-top:6px">'
          + '<option value="personal">👤 Личное</option>'
          + adminGroups.map(function (p) {
            var prefix = p.is_group ? "💬 " : (p.group_emoji ? String(p.group_emoji).trim() + " " : "👥 ");
            return '<option value="' + esc(String(p.chat_id)) + '">' + esc(prefix + (p.display_name || p.name || "Группа")) + "</option>";
          }).join("")
          + "</select>";
      } else if (wrap) {
        wrap.innerHTML = '<div class="collections-personal-pill" style="margin-top:8px">👤 Личное</div>';
      }
    }).catch(function () {});
    ov.querySelector("[data-close]").addEventListener("click", close);
    ov.addEventListener("click", function (ev) {
      if (ev.target === ov) close();
    });
    ov.querySelector("#coll-new-save").addEventListener("click", function () {
      var nameEl = ov.querySelector("#coll-new-name");
      var emojiEl = ov.querySelector("#coll-new-emoji");
      var pubEl = ov.querySelector("#coll-new-public");
      var authorEl = ov.querySelector("#coll-new-author");
      var name = (nameEl && nameEl.value && nameEl.value.trim()) || "";
      if (!name) {
        toast("Введите название", { type: "error" });
        return;
      }
      var body = {
        name: name,
        emoji: (emojiEl && emojiEl.value && emojiEl.value.trim()) || undefined,
        is_public: !!(pubEl && pubEl.checked),
      };
      if (authorEl && authorEl.value && authorEl.value !== "personal") {
        body.author_chat_id = Number(authorEl.value);
      }
      var saveBtn = ov.querySelector("#coll-new-save");
      saveBtn.disabled = true;
      apiPost("/api/miniapp/collections", body).then(function (res) {
        if (!res || !res.success || !res.collection) {
          toast((res && res.message) || "Не удалось создать", { type: "error" });
          saveBtn.disabled = false;
          return;
        }
        close();
        if (onDone) onDone(res.collection);
      }).catch(function () {
        toast("Ошибка сети", { type: "error" });
        saveBtn.disabled = false;
      });
    });
    document.body.appendChild(ov);
    var focusEl = ov.querySelector("#coll-new-name");
    if (focusEl) focusEl.focus();
  }

  function importPublicCollection(tagId, btn) {
    if (!tagId) return;
    if (btn) btn.disabled = true;
    apiPost("/api/miniapp/collections/public/" + tagId + "/import", { mode: "all" }).then(function (res) {
      if (!res || !res.success) {
        toast("Не удалось добавить", { type: "error" });
        if (btn) btn.disabled = false;
        return;
      }
      var added = Number(res.added || 0);
      var linked = Number(res.linked_existing || 0);
      toast("Добавлено: " + (added + linked), { type: "success" });
      if (btn) btn.disabled = false;
      _view = "public";
      _viewId = tagId;
      renderCollectionsSection();
    }).catch(function () {
      toast("Ошибка сети", { type: "error" });
      if (btn) btn.disabled = false;
    });
  }

  function deleteMineCollection(cid) {
    if (!cid) return;
    if (!window.confirm("Удалить коллекцию? Фильмы в базе останутся.")) return;
    apiDelete("/api/miniapp/collections/mine/" + cid).then(function () {
      toast("Коллекция удалена", { type: "success" });
      _view = "hub";
      _viewId = null;
      renderCollectionsSection();
    }).catch(function () {
      toast("Не удалось удалить", { type: "error" });
    });
  }

  function renderHub(root) {
    root.innerHTML = hubSkeleton();
    bindRoot(root);
    hydrateIcons(root);
    Promise.all([
      apiGet("/api/miniapp/collections?kind=all"),
      apiGet("/api/site/film-user-tags"),
    ]).then(function (pair) {
      var data = pair[0];
      var tagsData = pair[1];
      if (!data || !data.success) {
        root.innerHTML = '<p class="cabinet-hint">Не удалось загрузить. Попробуйте обновить страницу.</p>';
        return;
      }
      var mine = data.mine || [];
      var pub = data.public || [];
      var tags = (tagsData && tagsData.success && tagsData.tags) || [];
      var tagsEl = root.querySelector("#collections-tags-list");
      var mineEl = root.querySelector("#collections-mine-list");
      var pubEl = root.querySelector("#collections-public-list");
      if (tagsEl) {
        fillListEl(tagsEl, tags, function (t) {
          return listItemHtml({
            action: "tag",
            id: t.id,
            emoji: t.emoji || null,
            icon: t.emoji ? null : "tag",
            title: t.name,
            hint: (t.films_count || 0) + " фильмов",
          });
        }, emptyStateHtml({ hint: "Назначьте тег на карточке фильма в базе" }));
      }
      if (mineEl) {
        fillListEl(mineEl, mine, function (c) {
          return listItemHtml({
            action: "mine",
            id: c.id,
            emoji: c.emoji || null,
            icon: c.emoji ? null : "folder",
            title: c.name,
            hint: (c.films_count || 0) + " фильмов",
          });
        }, emptyStateHtml({
          hint: "Соберите свой список фильмов",
          action: "new",
          actionLabel: "Создать коллекцию",
        }));
      }
      if (pubEl) {
        fillListEl(pubEl, pub, function (c) {
          var isUser = c.source === "user";
          return listItemHtml({
            action: isUser ? "user-public" : "public",
            id: c.id,
            icon: isUser ? null : "globe",
            emoji: isUser ? (c.author_emoji || c.emoji || "📁") : null,
            iconClass: isUser ? "" : " mp-list-icon--public",
            title: c.name,
            hint: (c.films_count || 0) + " в подборке"
              + (c.in_user_library_count != null ? " · у вас " + (c.in_user_library_count || 0) : "")
              + (c.author_name ? " · " + c.author_name : ""),
          });
        }, '<p class="empty-hint collections-empty-hint">Скоро появятся новые подборки</p>');
      }
      hydrateIcons(root);
    }).catch(function () {
      root.innerHTML = '<p class="cabinet-hint">Не удалось загрузить. Попробуйте обновить страницу.</p>';
    });
  }

  function renderMineDetail(root, cid) {
    root.innerHTML = detailSkeleton("Коллекция", "📁", "");
    bindRoot(root);
    apiGet("/api/miniapp/collections/mine/" + cid).then(function (data) {
      if (!data || !data.success || !data.collection) {
        root.innerHTML = '<p class="cabinet-hint">Коллекция не найдена</p><button type="button" class="mp-sub-back" data-coll-action="back">← Коллекции</button>';
        bindRoot(root);
        return;
      }
      var c = data.collection;
      var films = data.films || [];
      var titleEl = root.querySelector(".collections-detail-title");
      var hintEl = root.querySelector(".collections-detail-hint");
      if (titleEl) titleEl.textContent = ((c.emoji || "📁") + " " + stripHtml(c.name || "")).trim();
      if (hintEl) hintEl.textContent = (c.films_count || films.length || 0) + " фильмов";
      var body = root.querySelector("#collections-detail-body");
      if (body) {
        body.innerHTML = filmsGridHtml(films)
          + '<button type="button" class="btn btn-ghost btn-full collections-delete-btn" data-coll-action="delete-mine" data-coll-id="' + esc(String(cid)) + '">Удалить коллекцию</button>';
      }
    }).catch(function () {
      root.innerHTML = '<p class="cabinet-hint">Не удалось загрузить</p>';
    });
  }

  function renderPublicDetail(root, tid) {
    root.innerHTML = detailSkeleton("Подборка", "🌐", "");
    bindRoot(root);
    apiGet("/api/miniapp/collections/public/" + tid).then(function (data) {
      if (!data || !data.success || !data.collection) {
        root.innerHTML = '<p class="cabinet-hint">Подборка не найдена</p>';
        return;
      }
      var c = data.collection;
      var films = data.films || [];
      var titleEl = root.querySelector(".collections-detail-title");
      var hintEl = root.querySelector(".collections-detail-hint");
      if (titleEl) titleEl.textContent = stripHtml(c.name || "");
      if (hintEl) hintEl.textContent = (c.films_count || films.length || 0) + " фильмов";
      var body = root.querySelector("#collections-detail-body");
      if (body) {
        body.innerHTML = filmsGridHtml(films)
          + '<button type="button" class="btn btn-primary btn-full" data-coll-action="import-public" data-coll-id="' + esc(String(tid)) + '">Добавить все в базу</button>';
      }
    }).catch(function () {
      root.innerHTML = '<p class="cabinet-hint">Не удалось загрузить</p>';
    });
  }

  function renderUserPublicDetail(root, cid) {
    root.innerHTML = detailSkeleton("Коллекция", "📁", "");
    bindRoot(root);
    apiGet("/api/miniapp/collections/user-public/" + cid).then(function (data) {
      if (!data || !data.success || !data.collection) {
        root.innerHTML = '<p class="cabinet-hint">Коллекция не найдена</p>';
        return;
      }
      var c = data.collection;
      var films = data.films || [];
      var titleEl = root.querySelector(".collections-detail-title");
      var hintEl = root.querySelector(".collections-detail-hint");
      if (titleEl) titleEl.textContent = (c.emoji || "📁") + " " + stripHtml(c.name || "");
      if (hintEl) {
        hintEl.textContent = (c.films_count || films.length || 0) + " фильмов"
          + (c.author_name ? " · " + c.author_name : "");
      }
      var body = root.querySelector("#collections-detail-body");
      if (body) body.innerHTML = filmsGridHtml(films);
    }).catch(function () {
      root.innerHTML = '<p class="cabinet-hint">Не удалось загрузить</p>';
    });
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

  function renderCollectionsSection(opts) {
    var o = opts || {};
    if (o.resetView) {
      _view = "hub";
      _viewId = null;
    }
    var root = document.getElementById("collections-content");
    if (!root) return;
    applyCollectionsSeo(true);
    if (!hasSiteAuth()) {
      root.innerHTML =
        '<div class="collections-guest">'
        + '<p class="cabinet-hint collections-intro">Теги, личные списки и готовые подборки Movie Planner — в одном месте.</p>'
        + '<button type="button" class="collections-action-btn collections-guest-login" id="collections-guest-login">'
        + iconHtml("profile", { size: "sm", className: "collections-action-btn-icon" })
        + "<span>Войти в кабинет</span></button>"
        + "</div>";
      hydrateIcons(root);
      var loginBtn = document.getElementById("collections-guest-login");
      if (loginBtn) {
        loginBtn.addEventListener("click", function () {
          if (typeof global.showLoginModalOverlay === "function") global.showLoginModalOverlay();
        });
      }
      return;
    }
    if (_view === "mine" && _viewId) renderMineDetail(root, _viewId);
    else if (_view === "public" && _viewId) renderPublicDetail(root, _viewId);
    else if (_view === "user-public" && _viewId) renderUserPublicDetail(root, _viewId);
    else renderHub(root);
  }

  function showGuestCollectionsPromo() {
    var landing = document.getElementById("landing");
    if (!landing || hasSiteAuth()) return;
    var path = (window.location.pathname || "").replace(/\/$/, "") || "/";
    if (path !== SEO.path) return;
    applyCollectionsSeo(true);
    var existing = document.getElementById("landing-collections-promo");
    if (existing) {
      existing.classList.remove("hidden");
      return;
    }
    var block = document.createElement("section");
    block.id = "landing-collections-promo";
    block.className = "landing-feature-promo collections-landing-promo";
    block.innerHTML =
      '<div class="landing-feature-promo-inner">'
      + '<h1 class="landing-feature-promo-title">Коллекции и подборки</h1>'
      + '<p class="landing-feature-promo-text">Группируйте фильмы по рубрикам, собирайте личные списки и открывайте готовые подборки Movie Planner — в приложении и веб-кабинете.</p>'
      + '<p class="landing-feature-promo-text landing-feature-promo-text--muted"><a href="/articles/kollekcii-filmov-movie-planner.html">Подробный гайд по коллекциям</a></p>'
      + '<div class="landing-feature-promo-actions">'
      + '<button type="button" class="btn-primary" id="landing-collections-login">Войти в кабинет</button>'
      + '<a href="/download" class="btn-secondary">Скачать приложение</a>'
      + "</div></div>";
    var hero = landing.querySelector("section");
    if (hero && hero.nextSibling) landing.insertBefore(block, hero.nextSibling);
    else landing.insertBefore(block, landing.firstChild);
    var btn = document.getElementById("landing-collections-login");
    if (btn) {
      btn.addEventListener("click", function () {
        if (typeof global.showLoginModalOverlay === "function") global.showLoginModalOverlay();
      });
    }
  }

  function hideGuestCollectionsPromo() {
    var block = document.getElementById("landing-collections-promo");
    if (block) block.classList.add("hidden");
  }

  function collectionsPayloadOk(data) {
    if (!data || typeof data !== "object") return false;
    if (data.success === true) return true;
    if (Array.isArray(data.collections)) return true;
    if (data.collection && typeof data.collection === "object") return true;
    return false;
  }

  function apiPublicGet(path) {
    var base = global.API_BASE || global.SITE_ORIGIN || "https://movie-planner.ru";
    function directFetch() {
      return fetch(base + path, { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (!r.ok && data && !data.error) data.error = "HTTP " + r.status;
            return data;
          });
        });
    }
    if (typeof global.apiPublic === "function") {
      return global.apiPublic(path).then(function (data) {
        if (collectionsPayloadOk(data)) return data;
        return directFetch();
      }).catch(function () {
        return directFetch();
      });
    }
    return directFetch();
  }

  function collectionCodeFromPath(pathname) {
    var p = (pathname || (typeof window !== "undefined" ? window.location.pathname : "") || "").replace(/\/$/, "");
    var code = null;
    if (p.indexOf("/whattowatch/collections/") === 0) {
      code = p.split("/whattowatch/collections/")[1].split("/")[0];
    } else if (p.indexOf("/features/collections/") === 0) {
      code = p.split("/features/collections/")[1].split("/")[0];
    }
    if (!code || code === "collections") return null;
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(code)) return null;
    return code;
  }

  function bindWtwCollectionsPanel(root) {
    if (!root || root._wtwCollBound) return;
    root._wtwCollBound = true;
    root.addEventListener("click", function (e) {
      var reg = e.target.closest("[data-mp-register-cta], [data-coll-action='guest-import'], [data-coll-action='guest-login']");
      if (reg && root.contains(reg)) {
        e.preventDefault();
        openGuestRegister();
        return;
      }
      var btn = e.target.closest("[data-coll-action]");
      if (!btn || !root.contains(btn)) return;
      e.preventDefault();
      var action = btn.getAttribute("data-coll-action");
      if (action === "wtw-back") {
        if (typeof global.__mpWtwCollectionsBack === "function") global.__mpWtwCollectionsBack();
        return;
      }
      if (action === "wtw-page") {
        var pageRaw = parseInt(btn.getAttribute("data-page") || "0", 10);
        if (!pageRaw || pageRaw < 1 || btn.disabled) return;
        _discoveryState.page = pageRaw;
        loadDiscoveryList(root);
        try { root.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (_) {}
        return;
      }
      if (action === "wtw-public-open") {
        var code = btn.getAttribute("data-coll-id");
        if (code && typeof global.__mpWtwOpenCollectionCode === "function") {
          global.__mpWtwOpenCollectionCode(code);
        }
      }
      if (action === "import-public") {
        if (!hasSiteAuth()) {
          openGuestRegister();
          return;
        }
        var tid = btn.getAttribute("data-coll-id");
        if (tid) importPublicCollection(parseInt(tid, 10), btn);
      }
    });
  }

  var _discoveryState = { q: "", page: 1, pageSize: 24, total: 0, loading: false, reqId: 0 };

  function discoveryQueryString() {
    var params = ["limit=" + _discoveryState.pageSize, "offset=" + ((_discoveryState.page - 1) * _discoveryState.pageSize)];
    if (_discoveryState.q) params.push("q=" + encodeURIComponent(_discoveryState.q));
    return params.join("&");
  }

  function discoveryPagerHtml() {
    var total = _discoveryState.total || 0;
    var pages = Math.max(1, Math.ceil(total / _discoveryState.pageSize));
    var page = Math.min(Math.max(1, _discoveryState.page), pages);
    _discoveryState.page = page;
    if (total <= _discoveryState.pageSize) {
      return total
        ? '<p class="collections-pager-meta">' + total + " подборок</p>"
        : "";
    }
    return (
      '<div class="collections-pager" role="navigation" aria-label="Страницы подборок">'
      + '<button type="button" class="btn btn-secondary collections-pager-btn" data-coll-action="wtw-page" data-page="'
      + (page - 1) + '"' + (page <= 1 ? " disabled" : "") + ">Назад</button>"
      + '<span class="collections-pager-meta">Стр. ' + page + " из " + pages + " · " + total + "</span>"
      + '<button type="button" class="btn btn-secondary collections-pager-btn" data-coll-action="wtw-page" data-page="'
      + (page + 1) + '"' + (page >= pages ? " disabled" : "") + ">Далее</button>"
      + "</div>"
    );
  }

  function loadDiscoveryList(root) {
    var listEl = root && root.querySelector("#wtw-collections-discovery-list");
    var pagerEl = root && root.querySelector("#wtw-collections-discovery-pager");
    if (!listEl) return;
    if (_discoveryState.loading) return;
    _discoveryState.loading = true;
    var reqId = ++_discoveryState.reqId;
    listEl.className = "collections-list-host";
    listEl.innerHTML = '<div class="settings-loading">Загружаем…</div>';
    if (pagerEl) pagerEl.innerHTML = "";
    apiPublicGet("/api/public/collections?" + discoveryQueryString()).then(function (data) {
      if (reqId !== _discoveryState.reqId) return;
      _discoveryState.loading = false;
      if (!listEl.isConnected) return;
      if (!collectionsPayloadOk(data)) {
        listEl.className = "collections-empty-wrap";
        listEl.innerHTML = '<p class="cabinet-hint">Не удалось загрузить подборки.</p>';
        return;
      }
      _discoveryState.total = Number(data.total || 0) || 0;
      var items = data.collections || [];
      if (!items.length) {
        listEl.className = "collections-empty-wrap";
        listEl.innerHTML = _discoveryState.q
          ? '<p class="empty-hint collections-empty-hint">Ничего не найдено — попробуйте другое название</p>'
          : '<p class="empty-hint collections-empty-hint">Скоро появятся новые подборки</p>';
      } else {
        listEl.className = "collections-discovery-grid";
        listEl.innerHTML = items.map(discoveryCardHtml).join("");
      }
      if (pagerEl) pagerEl.innerHTML = discoveryPagerHtml();
    }).catch(function () {
      if (reqId !== _discoveryState.reqId) return;
      _discoveryState.loading = false;
      if (!listEl.isConnected) return;
      listEl.className = "collections-empty-wrap";
      listEl.innerHTML = '<p class="cabinet-hint">Не удалось загрузить подборки.</p>';
    });
  }

  function renderDiscoveryHub(root) {
    if (!root) return;
    _discoveryState.q = "";
    _discoveryState.page = 1;
    _discoveryState.total = 0;
    _discoveryState.loading = false;
    root.innerHTML =
      '<div class="collections-page collections-page--discovery">'
      + '<p class="cabinet-hint collections-intro">Готовые подборки Movie Planner — откройте список и добавьте понравившиеся в базу.</p>'
      + '<label class="collections-search-label" for="wtw-collections-search">'
      + '<span class="visually-hidden">Поиск по коллекциям</span>'
      + '<input type="search" id="wtw-collections-search" class="collections-search-input" '
      + 'placeholder="Оскар, Канны, актёр или фильм" autocomplete="off" enterkeyhint="search">'
      + "</label>"
      + '<div class="collections-list-host" id="wtw-collections-discovery-list"><div class="settings-loading">Загружаем…</div></div>'
      + '<div id="wtw-collections-discovery-pager" class="collections-pager-host"></div>'
      + (hasSiteAuth() ? "" : guestWhatIsHtml())
      + "</div>";
    bindWtwCollectionsPanel(root);
    var searchInput = root.querySelector("#wtw-collections-search");
    var searchTimer = null;
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        var val = String(searchInput.value || "").trim();
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          _discoveryState.q = val;
          _discoveryState.page = 1;
          loadDiscoveryList(root);
        }, 280);
      });
      searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (searchTimer) clearTimeout(searchTimer);
          _discoveryState.q = String(searchInput.value || "").trim();
          _discoveryState.page = 1;
          loadDiscoveryList(root);
        }
      });
    }
    try {
      if (global.MpPublicPromo && typeof global.MpPublicPromo.bindRegister === "function") {
        global.MpPublicPromo.bindRegister(root);
      }
    } catch (_) {}
    hydrateIcons(root);
    loadDiscoveryList(root);
  }

  function markWtwCollectionDetailOpen() {
    try {
      var sec = document.getElementById("section-whattowatch");
      if (sec) sec.classList.add("whattowatch--collection-detail");
    } catch (_) {}
  }

  function renderPublicByCode(root, shortCode) {
    if (!root || !shortCode) return;
    root.innerHTML =
      '<div class="collections-page collections-page--detail collections-page--cinematic">'
      + '<div id="collections-detail-hero-host"></div>'
      + '<div class="collections-detail-stage"><div id="collections-detail-body"><div class="settings-loading">Загружаем…</div></div></div>'
      + "</div>";
    markWtwCollectionDetailOpen();
    bindWtwCollectionsPanel(root);
    apiPublicGet("/api/public/collections/" + encodeURIComponent(shortCode)).then(function (data) {
      if (!collectionsPayloadOk(data) || !data.collection) {
        root.innerHTML =
          '<p class="cabinet-hint">Подборка не найдена</p>'
          + '<button type="button" class="mp-sub-back" data-coll-action="wtw-back">← Коллекции</button>';
        bindWtwCollectionsPanel(root);
        return;
      }
      var c = data.collection;
      var films = data.films || [];
      applyDetailSeo(c);
      var hint = (c.films_count || films.length || 0) + " фильмов";
      if (shortCode === "venice-2026") {
        hint = "83-й Венецианский кинофестиваль · 2–12 сентября 2026 · " + hint;
      } else if (shortCode === "italian-stories-2026") {
        hint = "Фестиваль «Итальянские истории» · 28–30 августа 2026 · Архангельское · " + hint;
      } else if (shortCode === "nyt-top100-21c") {
        hint = "The New York Times · 500+ голосов · " + hint;
      }
      var heroHost = root.querySelector("#collections-detail-hero-host");
      if (heroHost) heroHost.innerHTML = detailHeroHtml(c, films, hint);
      var body = root.querySelector("#collections-detail-body");
      if (body) {
        var cta;
        if (hasSiteAuth()) {
          cta = '<button type="button" class="btn btn-primary btn-full" data-coll-action="import-public" data-coll-id="'
            + esc(String(c.id || "")) + '">Добавить все в базу</button>';
        } else {
          cta = '<button type="button" class="btn btn-primary btn-full" data-coll-action="guest-import">'
            + "Добавить все в базу</button>";
        }
        var intro = "";
        if (shortCode === "nyt-top100-21c") {
          intro = '<p class="nyt-collection-intro">Список The New York Times по итогам опроса более 500 режиссёров, актёров и других авторитетов кино. '
            + '<a href="https://www.nytimes.com/interactive/2025/movies/best-movies-21st-century.html" rel="noopener noreferrer">Оригинал NY Times</a></p>'
            + '<div id="nyt-voters-host"></div>';
        }
        var ranked = shortCode === "nyt-top100-21c";
        body.innerHTML = intro + filmsGridHtml(films, { ranked: ranked }) + cta + (hasSiteAuth() ? "" : guestWhatIsHtml());
        if (shortCode === "nyt-top100-21c") {
          loadNytVotersRail(root);
        }
        try {
          if (global.MpPublicPromo && typeof global.MpPublicPromo.bindRegister === "function") {
            global.MpPublicPromo.bindRegister(body);
          }
        } catch (_) {}
        hydrateIcons(body);
      }
    }).catch(function () {
      root.innerHTML = '<p class="cabinet-hint">Не удалось загрузить</p>';
    });
  }

  global.MpCollectionsPage = {
    render: renderCollectionsSection,
    applySeo: applyCollectionsSeo,
    showGuestPromo: showGuestCollectionsPromo,
    hideGuestPromo: hideGuestCollectionsPromo,
    resetView: function () {
      _view = "hub";
      _viewId = null;
    },
    renderDiscoveryHub: renderDiscoveryHub,
    renderPublicByCode: renderPublicByCode,
    collectionCodeFromPath: collectionCodeFromPath,
    SEO: SEO,
  };

  try {
    if (typeof global.__mpRepaintWtwCollectionsPanel === "function") {
      global.__mpRepaintWtwCollectionsPanel();
    }
  } catch (_) {}
})(typeof window !== "undefined" ? window : globalThis);
