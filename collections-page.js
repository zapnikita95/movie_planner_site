/**
 * Коллекции и подборки — веб-кабинет (/features/collections).
 */
(function (global) {
  "use strict";

  var SEO = {
    title: t("site.cabinet.movie_planner_5f429e", "Коллекции фильмов — Movie Planner"),
    description: t("site.cabinet.str_97943a", "Личные коллекции, теги и редакционные подборки в Movie Planner: группируйте фильмы и сериалы по рубрикам, открывайте списки одним кликом."),
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
    if (!kpId) return "/images/film-poster-placeholder.svg";
    return "https://st.kp.yandex.net/images/film_iphone/iphone360_" + kpId + ".jpg";
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

  function filmsGridHtml(films) {
    if (!films || !films.length) {
      return '<p class="cabinet-hint collections-empty">Пока пусто</p>';
    }
    return (
      '<div class="movies-grid collections-films-grid">'
      + films.map(function (f) {
        var kp = f.kp_id != null ? String(f.kp_id) : "";
        var fid = f.id || f.already_in_base_film_id || f.film_id || "";
        var poster = f.poster || posterUrl(kp);
        return (
          '<button type="button" class="movie-poster collections-film-card" data-film-id="' + esc(String(fid || "")) + '" data-kp-id="' + esc(kp) + '">'
          + '<div class="search-poster-media"><img class="movie-poster-img" src="' + esc(poster) + '" alt="" loading="lazy" onerror="this.src=\'/images/film-poster-placeholder.svg\'"></div>'
          + '<div class="movie-poster-body"><div class="movie-poster-title">' + esc(f.title || "—") + "</div>"
          + '<div class="movie-poster-meta">' + esc(f.year ? String(f.year) : "") + (f.is_series ? " · сериал" : "") + "</div></div>"
          + "</button>"
        );
      }).join("")
      + "</div>"
    );
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
      if (action === "tag" && id) {
        var tagId = parseInt(id, 10);
        if (typeof global.__mpOpenFilmTagFromCollections === "function") {
          global.__mpOpenFilmTagFromCollections(tagId);
        } else if (typeof global.openFilmTagView === "function") {
          global.openFilmTagView(tagId, { returnSection: "collections" });
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
      + '<input type="text" id="coll-new-name" class="input-primary" placeholder="Название" maxlength="80" style="width:100%;margin-top:12px" />'
      + '<input type="text" id="coll-new-emoji" class="input-primary" placeholder="📁" maxlength="8" style="width:100%;margin-top:10px" />'
      + '<button type="button" class="btn-primary btn-full" id="coll-new-save" style="margin-top:14px">Создать</button>'
      + "</div>";
    function close() {
      unlock();
      ov.remove();
    }
    ov.querySelector("[data-close]").addEventListener("click", close);
    ov.addEventListener("click", function (ev) {
      if (ev.target === ov) close();
    });
    ov.querySelector("#coll-new-save").addEventListener("click", function () {
      var nameEl = ov.querySelector("#coll-new-name");
      var emojiEl = ov.querySelector("#coll-new-emoji");
      var name = (nameEl && nameEl.value && nameEl.value.trim()) || "";
      if (!name) {
        toast("Введите название", { type: "error" });
        return;
      }
      var saveBtn = ov.querySelector("#coll-new-save");
      saveBtn.disabled = true;
      apiPost("/api/miniapp/collections", {
        name: name,
        emoji: (emojiEl && emojiEl.value && emojiEl.value.trim()) || undefined,
      }).then(function (res) {
        if (!res || !res.success || !res.collection) {
          toast(t("site.cabinet.str_fd771a", "Не удалось создать"), { type: "error" });
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
        toast(t("site.toast.addFailed", "Не удалось добавить"), { type: "error" });
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
    if (!window.confirm(t("site.cabinet.str_e5156b", "Удалить коллекцию? Фильмы в базе останутся."))) return;
    apiDelete("/api/miniapp/collections/mine/" + cid).then(function () {
      toast("Коллекция удалена", { type: "success" });
      _view = "hub";
      _viewId = null;
      renderCollectionsSection();
    }).catch(function () {
      toast(t("site.cabinet.str_65f3fe", "Не удалось удалить"), { type: "error" });
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
        }, emptyStateHtml({ hint: t("site.cabinet.str_043775", "Назначьте тег на карточке фильма в базе") }));
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
          hint: t("site.cabinet.str_8f817a", "Соберите свой список фильмов"),
          action: "new",
          actionLabel: "Создать коллекцию",
        }));
      }
      if (pubEl) {
        fillListEl(pubEl, pub, function (c) {
          return listItemHtml({
            action: "public",
            id: c.id,
            icon: "globe",
            iconClass: " mp-list-icon--public",
            title: c.name,
            hint: (c.films_count || 0) + t("site.cabinet.str_2c76ba", " в подборке · у вас ") + (c.in_user_library_count || 0),
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

  global.MpCollectionsPage = {
    render: renderCollectionsSection,
    applySeo: applyCollectionsSeo,
    showGuestPromo: showGuestCollectionsPromo,
    hideGuestPromo: hideGuestCollectionsPromo,
    resetView: function () {
      _view = "hub";
      _viewId = null;
    },
    SEO: SEO,
  };
})(typeof window !== "undefined" ? window : globalThis);
