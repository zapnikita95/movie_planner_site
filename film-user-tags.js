/**
 * Пользовательские теги фильмов — веб-кабинет.
 */
(function (global) {
  "use strict";

  var TAG_EMOJIS = ["🏷️", "🎬", "🍿", "💖", "🔥", "⭐", "🌙", "🎭", "🚀", "🎃", "🧛", "🐉"];

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

  function openCreateTagForm(deps, filmId, onAssigned) {
    var d = deps || defaultDeps();
    var selectedEmoji = "🏷️";
    var ov = document.createElement("div");
    ov.className = "mp-dialog-overlay film-tag-dialog-overlay";
    ov.innerHTML =
      '<div class="mp-dialog-card film-tag-dialog-card">' +
        '<button type="button" class="mp-dialog-close" data-close="1" aria-label="Закрыть">×</button>' +
        '<h3 class="mp-dialog-title">Новый тег</h3>' +
        '<div class="film-tag-emoji-row">' +
          TAG_EMOJIS.map(function (e) {
            return '<button type="button" class="film-tag-emoji-btn' + (e === selectedEmoji ? " active" : "") + '" data-emoji="' + e + '">' + e + "</button>";
          }).join("") +
        "</div>" +
        '<input type="text" id="film-tag-name" class="input-primary" placeholder="Название" maxlength="80" style="width:100%;margin-top:12px" />' +
        '<button type="button" class="btn-primary btn-full" id="film-tag-create-save" style="margin-top:14px">Создать</button>' +
      "</div>";
    ov._unlock = d.lockViewportScroll();
    document.body.appendChild(ov);
    ov.querySelector("[data-close]").addEventListener("click", function () { closeOverlay(ov); });
    ov.addEventListener("click", function (e) {
      if (e.target === ov) closeOverlay(ov);
    });
    ov.querySelectorAll("[data-emoji]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedEmoji = btn.getAttribute("data-emoji") || "🏷️";
        ov.querySelectorAll("[data-emoji]").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
      });
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
          closeOverlay(ov);
          if (assignRes && assignRes.success && onAssigned) {
            onAssigned(assignRes.tag || res.tag);
          }
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
              '<button type="button" class="list-item film-tag-pick-item" data-tag-id="' + t.id + '">' +
                '<span class="list-emoji">' + d.escapeHtml(t.emoji || "🏷️") + "</span>" +
                '<span class="list-text"><span class="list-title">' + d.escapeHtml(t.name) + "</span>" +
                '<span class="list-hint">' + (t.films_count || 0) + " фильмов</span></span>" +
              "</button>"
            );
          }).join("")
        : '<div class="empty small"><div class="empty-text">Нет тегов</div></div>';

      ov.innerHTML =
        '<div class="mp-dialog-card film-tag-dialog-card">' +
          '<button type="button" class="mp-dialog-close" data-close="1" aria-label="Закрыть">×</button>' +
          '<h3 class="mp-dialog-title">Тег для фильма</h3>' +
          '<div class="list film-tag-pick-list">' + listHtml + "</div>" +
          '<button type="button" class="btn-secondary btn-full" id="film-tag-create-btn" style="margin-top:12px">Создать тег</button>' +
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
            closeOverlay(ov);
            if (res && res.success && opts && opts.onAssigned) {
              opts.onAssigned(res.tag);
            }
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
    var iconEl = btn.querySelector("[data-tag-emoji]") || btn.querySelector(".mp-icon");
    if (global.getToken && global.getToken()) {
      global.api(d.apiPrefix + "/for-film/" + filmId).then(function (res) {
        if (res && res.success && res.tag) {
          btn.innerHTML = '<span data-tag-emoji>' + (res.tag.emoji || "🏷️") + "</span>";
        }
      }).catch(function () {});
    }
    btn.addEventListener("click", function () {
      if (!global.getToken || !global.getToken()) {
        if (d.onNeedAuth) d.onNeedAuth();
        return;
      }
      openFilmTagPicker(filmId, {
        onAssigned: function (tag) {
          if (tag) {
            btn.innerHTML = '<span data-tag-emoji>' + (tag.emoji || "🏷️") + "</span>";
          }
          if (opts && opts.onAssigned) opts.onAssigned(tag);
        },
      });
    });
  }

  global.MpFilmUserTags = {
    openPicker: openFilmTagPicker,
    bindButton: bindFilmTagButton,
    TAG_EMOJIS: TAG_EMOJIS,
  };
})(typeof window !== "undefined" ? window : globalThis);
