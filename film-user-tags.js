/**
 * Пользовательские теги фильмов — веб-кабинет.
 */
(function (global) {
  "use strict";

  var TAG_EMOJIS = ["🏷️", "🎬", "🍿", "💖", "🔥", "⭐", "🌙", "🎭", "🚀", "🎃", "🧛", "🐉"];
  var TAG_EMOJI_MORE = [
    "😀", "😎", "🥳", "😍", "🤩", "😭", "🤯", "🥶", "🤠", "👻",
    "💀", "👽", "🤖", "🎉", "🎊", "🎁", "🎄", "☃️", "🌈", "⚡",
    "💎", "🍺", "🍷", "☕", "🍕", "🍣", "🌮", "🍩", "🧁", "🍫",
    "📺", "🎮", "🎧", "📚", "✈️", "🏖️", "🏔️", "🌃", "🛸", "🦄",
    "🐱", "🐶", "🦊", "🐼", "🦁", "🐸", "🦉", "🐙", "🌸", "🌺",
    "💜", "💙", "💚", "💛", "🧡", "❤️", "🖤", "🤍", "💔", "💯",
    "👍", "👎", "✨", "💫", "🌟", "🔮", "🎯", "🏆", "🥇", "🎖️",
  ];

  function defaultDeps() {
    return {
      apiGet: function (path) {
        return global.api(path);
      },
      apiPost: function (path, body) {
        return global.api(path, { method: "POST", body: JSON.stringify(body || {}) });
      },
      lockViewportScroll: function () {
        var prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return function () {
          document.body.style.overflow = prev || "";
        };
      },
      unlockViewportScroll: function () {},
      escapeHtml: global.escapeHtml || function (s) { return String(s || ""); },
      toast: global.toast || function (m) { try { alert(m); } catch (_) {} },
      apiPrefix: "/api/site/film-user-tags",
      onNeedAuth: function () {
        if (global.MpPublicFilmLogin) {
          global.MpPublicFilmLogin.open("tag");
          return;
        }
        if (typeof global.showLoginModalOverlay === "function") {
          global.showLoginModalOverlay();
        }
      },
    };
  }

  function closeOverlay(ov) {
    if (!ov) return;
    try {
      if (ov._unlock) ov._unlock();
    } catch (_) {}
    ov.remove();
  }

  function setTagButtonEmoji(btn, tag) {
    if (!btn || !tag) return;
    var emoji = tag.emoji || "🏷️";
    btn.innerHTML = '<span class="film-tag-btn-emoji" data-tag-emoji>' + emoji + "</span>";
    btn.title = tag.name || "Тег";
    btn.classList.add("film-icon-btn--tagged");
  }

  function bindEmojiPicker(ov, getSelected, setSelected) {
    function paintActive() {
      var cur = getSelected();
      ov.querySelectorAll("[data-emoji]").forEach(function (b) {
        b.classList.toggle("active", (b.getAttribute("data-emoji") || "") === cur);
      });
    }
    ov.querySelectorAll("[data-emoji]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setSelected(btn.getAttribute("data-emoji") || "🏷️");
        paintActive();
      });
    });
    var plusBtn = ov.querySelector("[data-emoji-more-toggle]");
    var morePanel = ov.querySelector(".film-tag-emoji-more");
    if (plusBtn && morePanel) {
      plusBtn.addEventListener("click", function () {
        morePanel.classList.toggle("hidden");
        plusBtn.classList.toggle("active", !morePanel.classList.contains("hidden"));
      });
    }
    var nativeInput = ov.querySelector(".film-tag-emoji-native");
    if (nativeInput) {
      nativeInput.addEventListener("input", function () {
        var val = (nativeInput.value || "").trim();
        if (!val) return;
        var ch = Array.from(val).pop();
        if (!ch) return;
        setSelected(ch);
        paintActive();
        nativeInput.value = "";
      });
      var customBtn = ov.querySelector("[data-emoji-custom]");
      if (customBtn) {
        customBtn.addEventListener("click", function () {
          nativeInput.focus();
          try { nativeInput.click(); } catch (_) {}
        });
      }
    }
    paintActive();
  }

  function emojiRowHtml(selectedEmoji) {
    var base = TAG_EMOJIS.map(function (e) {
      return '<button type="button" class="film-tag-emoji-btn' + (e === selectedEmoji ? " active" : "") + '" data-emoji="' + e + '">' + e + "</button>";
    }).join("");
    var more = TAG_EMOJI_MORE.map(function (e) {
      return '<button type="button" class="film-tag-emoji-btn film-tag-emoji-btn--mini" data-emoji="' + e + '">' + e + "</button>";
    }).join("");
    return (
      base +
      '<button type="button" class="film-tag-emoji-btn film-tag-emoji-plus" data-emoji-more-toggle aria-label="Ещё эмодзи">+</button>' +
      '<button type="button" class="film-tag-emoji-btn film-tag-emoji-custom" data-emoji-custom aria-label="Свой эмодзи">…</button>' +
      '<div class="film-tag-emoji-more hidden">' + more + "</div>" +
      '<input type="text" class="film-tag-emoji-native" maxlength="8" aria-hidden="true" tabindex="-1" />'
    );
  }

  function openCreateTagForm(deps, filmId, onAssigned) {
    var d = deps || defaultDeps();
    var selectedEmoji = "🏷️";
    var ov = document.createElement("div");
    ov.className = "mp-dialog-overlay film-tag-dialog-overlay";
    ov.innerHTML =
      '<div class="mp-dialog-card film-tag-dialog-card">' +
        '<button type="button" class="mp-dialog-close" data-close="1" aria-label="Закрыть">×</button>' +
        '<h3 class="mp-dialog-title">Новый тег</h3>' +
        '<div class="film-tag-emoji-row">' + emojiRowHtml(selectedEmoji) + "</div>" +
        '<label class="film-tag-name-field">' +
          '<span class="film-tag-name-label">Название</span>' +
          '<input type="text" id="film-tag-name" class="film-tag-name-input" placeholder="Например, на выходные" maxlength="80" autocomplete="off" />' +
        "</label>" +
        '<div class="film-tag-dialog-actions">' +
          '<button type="button" class="film-tag-btn-create" id="film-tag-create-save">Создать</button>' +
        "</div>" +
      "</div>";
    ov._unlock = d.lockViewportScroll();
    document.body.appendChild(ov);
    bindEmojiPicker(ov, function () { return selectedEmoji; }, function (e) { selectedEmoji = e; });
    ov.querySelector("[data-close]").addEventListener("click", function () { closeOverlay(ov); });
    ov.addEventListener("click", function (e) {
      if (e.target === ov) closeOverlay(ov);
    });
    ov.querySelector("#film-tag-create-save").addEventListener("click", function () {
      var nameEl = ov.querySelector("#film-tag-name");
      var name = (nameEl && nameEl.value && nameEl.value.trim()) || "";
      if (!name) {
        d.toast("Введите название");
        return;
      }
      var saveBtn = ov.querySelector("#film-tag-create-save");
      saveBtn.disabled = true;
      d.apiPost(d.apiPrefix, { name: name, emoji: selectedEmoji }).then(function (res) {
        if (!res || !res.success || !res.tag) {
          d.toast("Не удалось создать тег");
          saveBtn.disabled = false;
          return;
        }
        return d.apiPost(d.apiPrefix + "/assign", { tag_id: res.tag.id, film_id: filmId }).then(function (assignRes) {
          if (!assignRes || !assignRes.success) {
            d.toast("Тег создан, но не привязан к фильму");
            saveBtn.disabled = false;
            return;
          }
          closeOverlay(ov);
          if (onAssigned) onAssigned(assignRes.tag || res.tag);
        });
      }).catch(function (e) {
        d.toast((e && e.message) || "Ошибка");
        saveBtn.disabled = false;
      });
    });
  }

  function openFilmTagPicker(filmId, opts) {
    var d = Object.assign({}, defaultDeps(), opts || {});
    if (!filmId) return;
    if (!global.getToken || !global.getToken()) {
      if (d.onNeedAuth) d.onNeedAuth();
      return;
    }
    d.apiGet(d.apiPrefix).then(function (data) {
      var tags = (data && data.success && data.tags) ? data.tags : [];
      var ov = document.createElement("div");
      ov.className = "mp-dialog-overlay film-tag-dialog-overlay";
      var listHtml = tags.length
        ? tags.map(function (t) {
            return (
              '<button type="button" class="film-tag-pick-item" data-tag-id="' + t.id + '">' +
                '<span class="film-tag-pick-emoji">' + d.escapeHtml(t.emoji || "🏷️") + "</span>" +
                '<span class="film-tag-pick-text">' +
                  '<span class="film-tag-pick-title">' + d.escapeHtml(t.name) + "</span>" +
                  '<span class="film-tag-pick-hint">' + (t.films_count || 0) + " фильмов</span>" +
                "</span>" +
              "</button>"
            );
          }).join("")
        : '<div class="film-tag-pick-empty">Пока нет тегов</div>';

      ov.innerHTML =
        '<div class="mp-dialog-card film-tag-dialog-card">' +
          '<button type="button" class="mp-dialog-close" data-close="1" aria-label="Закрыть">×</button>' +
          '<h3 class="mp-dialog-title">Тег для фильма</h3>' +
          '<div class="film-tag-pick-list">' + listHtml + "</div>" +
          '<div class="film-tag-dialog-actions">' +
            '<button type="button" class="film-tag-btn-create film-tag-btn-create--ghost" id="film-tag-create-btn">Создать тег</button>' +
          "</div>" +
        "</div>";

      ov._unlock = d.lockViewportScroll();
      document.body.appendChild(ov);
      ov.querySelector("[data-close]").addEventListener("click", function () { closeOverlay(ov); });
      ov.addEventListener("click", function (e) {
        if (e.target === ov) closeOverlay(ov);
      });
      ov.querySelector("#film-tag-create-btn").addEventListener("click", function () {
        closeOverlay(ov);
        openCreateTagForm(d, filmId, opts && opts.onAssigned);
      });
      ov.querySelectorAll("[data-tag-id]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var tagId = parseInt(btn.getAttribute("data-tag-id"), 10);
          if (!tagId) return;
          btn.disabled = true;
          d.apiPost(d.apiPrefix + "/assign", { tag_id: tagId, film_id: filmId }).then(function (res) {
            if (!res || !res.success) {
              d.toast("Не удалось привязать тег");
              btn.disabled = false;
              return;
            }
            closeOverlay(ov);
            if (opts && opts.onAssigned) opts.onAssigned(res.tag);
          }).catch(function (e) {
            d.toast((e && e.message) || "Ошибка");
            btn.disabled = false;
          });
        });
      });
    }).catch(function () {
      d.toast("Не удалось загрузить теги");
    });
  }

  function bindFilmTagButton(btn, filmId, opts) {
    if (!btn || !filmId) return;
    var d = Object.assign({}, defaultDeps(), opts || {});
    if (global.getToken && global.getToken()) {
      global.api(d.apiPrefix + "/for-film/" + filmId).then(function (res) {
        if (res && res.success && res.tag) setTagButtonEmoji(btn, res.tag);
      }).catch(function () {});
    }
    btn.addEventListener("click", function () {
      if (!global.getToken || !global.getToken()) {
        if (d.onNeedAuth) d.onNeedAuth();
        return;
      }
      openFilmTagPicker(filmId, {
        onAssigned: function (tag) {
          if (tag) setTagButtonEmoji(btn, tag);
          refreshBaseTagPills();
          if (opts && opts.onAssigned) opts.onAssigned(tag);
        },
      });
    });
  }

  function renderTagPillHtml(tag, deps) {
    var d = deps || defaultDeps();
    var name = d.escapeHtml(tag.name || "Тег");
    var emoji = d.escapeHtml(tag.emoji || "🏷️");
    return (
      '<button type="button" class="base-user-tag-pill" data-film-tag-id="' + tag.id + '" title="' + name + '">' +
        '<span class="base-user-tag-emoji">' + emoji + "</span>" +
        '<span class="base-user-tag-name">' + name + "</span>" +
      "</button>"
    );
  }

  function renderTagFilmsGridHtml(films, deps) {
    var d = deps || defaultDeps();
    var posterUrl = (global.posterUrl && typeof global.posterUrl === "function")
      ? global.posterUrl
      : function (kpId) {
          if (!kpId) return "";
          return "https://st.kp.yandex.net/images/film_big/" + String(kpId).replace(/\D/g, "") + ".jpg";
        };
    if (!films || !films.length) {
      return '<p class="empty-hint">Пока нет фильмов с этим тегом</p>';
    }
    return films.map(function (f) {
      var poster = d.escapeHtml(f.poster || posterUrl(f.kp_id) || "");
      var title = d.escapeHtml(f.title || "—");
      var year = f.year ? d.escapeHtml(String(f.year)) : "";
      var series = f.is_series ? " · сериал" : "";
      var kp = f.kp_id ? String(f.kp_id) : "";
      var fid = f.id ? String(f.id) : "";
      return (
        '<button type="button" class="movie-poster film-tag-view-poster" data-kp-id="' + d.escapeHtml(kp) + '" data-film-id="' + d.escapeHtml(fid) + '">' +
          '<div class="search-poster-media">' +
            (poster
              ? '<img class="movie-poster-img" src="' + poster + '" alt="" loading="lazy" onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">'
              : '<div class="movie-poster-img"></div>') +
          "</div>" +
          '<div class="movie-poster-body">' +
            '<div class="movie-poster-title">' + title + "</div>" +
            (year || series ? '<div class="movie-poster-meta">' + year + series + "</div>" : "") +
          "</div>" +
        "</button>"
      );
    }).join("");
  }

  function bindTagViewPosters(root, hooks) {
    if (!root) return;
    root.querySelectorAll(".film-tag-view-poster").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var kp = btn.getAttribute("data-kp-id") || "";
        var fid = btn.getAttribute("data-film-id") || "";
        if (hooks && typeof hooks.onFilmClick === "function") {
          hooks.onFilmClick(kp, fid);
          return;
        }
        if (kp && global.openFilmPageByKp) {
          global.openFilmPageByKp(kp);
        } else if (fid && global.openFilmPageFromLegacyPath) {
          global.openFilmPageFromLegacyPath(fid);
        }
      });
    });
  }

  function mountTagView(tagId, hooks) {
    var d = Object.assign({}, defaultDeps(), (hooks && hooks.deps) || {});
    var titleEl = document.getElementById("film-tag-view-title");
    var metaEl = document.getElementById("film-tag-view-meta");
    var gridEl = document.getElementById("film-tag-view-grid");
    if (!gridEl) return Promise.resolve(false);
    gridEl.innerHTML = '<p class="empty-hint">Загрузка…</p>';
    if (metaEl) metaEl.textContent = "";
    return d.apiGet(d.apiPrefix + "/" + tagId).then(function (data) {
      if (!data || !data.success) {
        if (gridEl) gridEl.innerHTML = '<p class="empty-hint">Тег не найден</p>';
        return false;
      }
      var tag = data.tag || {};
      var films = data.films || [];
      if (titleEl) {
        var titleText = titleEl.querySelector(".section-title-text") || titleEl;
        titleText.textContent = (tag.emoji || "🏷️") + " " + (tag.name || "Тег");
      }
      if (metaEl) metaEl.textContent = (tag.films_count || films.length || 0) + " фильмов";
      gridEl.innerHTML = renderTagFilmsGridHtml(films, d);
      bindTagViewPosters(gridEl, hooks);
      try {
        if (hooks && typeof hooks.onTitle === "function") {
          hooks.onTitle((tag.name || "Тег") + " · Movie Planner");
        }
      } catch (_) {}
      return true;
    }).catch(function () {
      if (gridEl) gridEl.innerHTML = '<p class="empty-hint">Не удалось загрузить тег</p>';
      return false;
    });
  }

  var _baseTagPillsBound = false;
  function bindBaseTagPillsOnce(openTagViewFn) {
    if (_baseTagPillsBound) return;
    _baseTagPillsBound = true;
    document.addEventListener("click", function (e) {
      var pill = e.target.closest("[data-film-tag-id]");
      if (!pill || !pill.classList.contains("base-user-tag-pill")) return;
      e.preventDefault();
      var tagId = parseInt(pill.getAttribute("data-film-tag-id"), 10);
      if (!tagId) return;
      if (typeof openTagViewFn === "function") {
        openTagViewFn(tagId);
      } else if (global.MpFilmUserTags && typeof global.MpFilmUserTags.openView === "function") {
        global.MpFilmUserTags.openView(tagId);
      }
    });
  }

  function refreshBaseTagPills() {
    var d = defaultDeps();
    var rows = document.querySelectorAll(".base-user-tags-row[data-base-tags]");
    if (!rows.length) return Promise.resolve();
    if (!global.getToken || !global.getToken()) {
      rows.forEach(function (row) { row.innerHTML = ""; });
      return Promise.resolve();
    }
    return d.apiGet(d.apiPrefix).then(function (data) {
      var tags = (data && data.success && data.tags) ? data.tags : [];
      var html = tags.length
        ? tags.map(function (t) { return renderTagPillHtml(t, d); }).join("")
        : "";
      rows.forEach(function (row) { row.innerHTML = html; });
    }).catch(function () {
      rows.forEach(function (row) { row.innerHTML = ""; });
    });
  }

  global.MpFilmUserTags = {
    openPicker: openFilmTagPicker,
    bindButton: bindFilmTagButton,
    refreshBasePills: refreshBaseTagPills,
    bindBasePillsOnce: bindBaseTagPillsOnce,
    mountView: mountTagView,
    TAG_EMOJIS: TAG_EMOJIS,
  };
})(typeof window !== "undefined" ? window : globalThis);
