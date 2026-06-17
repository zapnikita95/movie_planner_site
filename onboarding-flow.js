/**
 * Extended onboarding after intro carousel — interest survey, import, genre picker, plan.
 * Loaded before app.js; invoked via window.__mpMountExtendedOnboarding(deps, onComplete).
 */
(function (global) {
  "use strict";

  function siteT(key, fallback) {
    try {
      if (global.siteT) return global.siteT(key, fallback);
      if (global.SiteI18n && global.SiteI18n.t) return global.SiteI18n.t(key, fallback);
      if (global.MP_I18N && global.MP_I18N.t) return global.MP_I18N.t(key, fallback);
    } catch (_) {}
    return fallback != null ? fallback : key;
  }

  const STATE_KEY = "mp_onboard_v2_state";
  const MAX_SIMILAR_LOADS = 15;
  const MAX_TILES = 100;

  function coinsExplain() { return siteT("site.onboard.coinsExplain", "Монетки — внутренняя валюта Movie Planner. Их можно тратить на билеты к сеансам, Shazam и прокачанные рекомендации. Получайте монетки за активность: импорт, оценки, планы и стрики."); }

  function readState() {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_e) {
      return {};
    }
  }

  function writeState(st) {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(st || {}));
    } catch (_e) {}
  }

  function clearState() {
    try {
      sessionStorage.removeItem(STATE_KEY);
    } catch (_e) {}
  }

  function overlayClass(deps, base) {
    let c = base || "mp-dialog-overlay mp-onboard-dialog-overlay";
    if (deps && deps.isDesktop) c += " mp-onboard--desktop";
    return c;
  }

  function showCenterDialog(deps, html, opts) {
    const o = opts || {};
    return new Promise(function (resolve) {
      const ov = document.createElement("div");
      ov.className = overlayClass(deps, "mp-dialog-overlay mp-onboard-dialog-overlay");
      ov.setAttribute("role", "dialog");
      ov.setAttribute("aria-modal", "true");
      ov.innerHTML =
        '<div class="mp-dialog-card mp-onboard-dialog-card">' +
        (o.dismissX
          ? '<button type="button" class="mp-onboard-dismiss" data-ob-x aria-label="' + siteT('common.close', 'Закрыть') + '">✕</button>'
          : "") +
        html +
        "</div>";
      deps.lockViewportScroll();
      const close = function (val) {
        deps.unlockViewportScroll();
        try {
          ov.remove();
        } catch (_e2) {}
        resolve(val);
      };
      ov.addEventListener("click", function (ev) {
        if (ev.target === ov && o.backdropClose) close(null);
      });
      ov.querySelector("[data-ob-x]")?.addEventListener("click", function () {
        close(o.dismissVal != null ? o.dismissVal : null);
      });
      document.body.appendChild(ov);
      ov.querySelectorAll("[data-ob-close]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          close(btn.getAttribute("data-ob-close"));
        });
      });
      if (typeof o.bind === "function") o.bind(ov, close);
    });
  }

  function optionRow(id, label, checked, name) {
    return (
      '<label class="mp-onboard-opt">' +
      '<input type="radio" name="' +
      name +
      '" value="' +
      id +
      '"' +
      (checked ? " checked" : "") +
      ">" +
      '<span class="mp-onboard-opt-label">' +
      label +
      "</span></label>"
    );
  }

  function embeddedField(id, placeholder, visible) {
    return (
      '<div class="mp-onboard-field-wrap' +
      (visible ? "" : " hidden") +
      '" id="' +
      id +
      '-wrap">' +
      '<input type="text" class="input-primary mp-onboard-field" id="' +
      id +
      '" placeholder="' +
      placeholder +
      '" autocomplete="off">' +
      "</div>"
    );
  }

  async function stepInterest(deps) {
    const html =
      '<div class="mp-onboard-title">' + siteT('site.onboard.interestTitle', t('site.onboard.interestTitle', 'Что вам интересно больше?')) + '</div>' +
      '<div class="mp-onboard-opts">' +
      optionRow("movies", siteT("site.onboard.movies", "Фильмы"), true, "ob-interest") +
      optionRow("series", siteT("site.onboard.seriesLabel", "Сериалы"), false, "ob-interest") +
      optionRow("premieres", siteT("site.onboard.premieresLabel", "Премьеры"), false, "ob-interest") +
      optionRow("other", siteT("site.onboard.otherSpecify", "Другое (укажите)"), false, "ob-interest") +
      "</div>" +
      embeddedField("ob-other-text", siteT("site.onboard.otherPlaceholder", t("site.onboard.otherPlaceholder", "Напишите, что вас интересует")), false) +
      '<button type="button" class="btn-primary btn-full" data-ob-continue style="margin-top:16px">' + siteT('site.onboard.continue', 'Продолжить') + '</button>';
    const res = await showCenterDialog(deps, html, {
      dismissX: true,
      bind: function (ov, close) {
        const otherWrap = ov.querySelector("#ob-other-text-wrap");
        const otherInp = ov.querySelector("#ob-other-text");
        ov.querySelectorAll('input[name="ob-interest"]').forEach(function (inp) {
          inp.addEventListener("change", function () {
            const isOther = inp.value === "other" && inp.checked;
            if (otherWrap) otherWrap.classList.toggle("hidden", !isOther);
            if (isOther && otherInp) otherInp.focus();
          });
        });
        ov.querySelector("[data-ob-continue]")?.addEventListener("click", function () {
          const sel = ov.querySelector('input[name="ob-interest"]:checked');
          const interest = sel ? sel.value : "movies";
          const otherText = otherInp ? otherInp.value.trim() : "";
          if (interest === "other" && !otherText) {
            deps.toast(siteT("site.onboard.specifyInterest", t("site.onboard.specifyInterest", "Укажите, что вас интересует")));
            return;
          }
          close({ interest: interest, otherText: otherText });
        });
      },
    });
    return res;
  }

  async function stepDbSource(deps, mediaLabel) {
    const html =
      '<div class="mp-onboard-title">' + siteT('site.onboard.dbSourceTitle', t('site.onboard.dbSourceTitle', 'Где вы ведёте базу просмотренного?')) + '</div>' +
      '<div class="mp-onboard-opts">' +
      optionRow("kp", siteT("site.onboard.dbKp", t("site.onboard.dbKp", "Кинопоиск / MyShows / IMDb")), true, "ob-db") +
      optionRow("other", siteT("site.onboard.dbOther", "Другой сервис"), false, "ob-db") +
      optionRow("none", siteT("site.onboard.dbNone", "Нет базы"), false, "ob-db") +
      "</div>" +
      embeddedField("ob-db-other", siteT("site.onboard.dbOtherPlaceholder", "Какой сервис?"), false) +
      '<button type="button" class="btn-primary btn-full" data-ob-continue style="margin-top:16px">' + siteT('site.onboard.continue', 'Продолжить') + '</button>';
    return showCenterDialog(deps, html, {
      dismissX: true,
      bind: function (ov, close) {
        const otherWrap = ov.querySelector("#ob-db-other-wrap");
        const otherInp = ov.querySelector("#ob-db-other");
        ov.querySelectorAll('input[name="ob-db"]').forEach(function (inp) {
          inp.addEventListener("change", function () {
            const isOther = inp.value === "other" && inp.checked;
            if (otherWrap) otherWrap.classList.toggle("hidden", !isOther);
            if (isOther && otherInp) otherInp.focus();
          });
        });
        ov.querySelector("[data-ob-continue]")?.addEventListener("click", function () {
          const sel = ov.querySelector('input[name="ob-db"]:checked');
          const db = sel ? sel.value : "none";
          const dbOther = otherInp ? otherInp.value.trim() : "";
          if (db === "other" && !dbOther) {
            deps.toast(siteT("site.onboard.specifyService", "Укажите сервис"));
            return;
          }
          close({ dbSource: db, dbOther: dbOther });
        });
      },
    });
  }

  async function stepImportChoice(deps) {
    const html =
      '<div class="mp-onboard-title">' + siteT('site.onboard.importTitle', 'Импорт оценок') + '</div>' +
      '<p class="mp-onboard-text">Перенесите просмотренное — получите <strong>2000 монеток</strong>.</p>' +
      '<div class="list" style="margin-top:10px">' +
      '<button type="button" class="list-item" data-ob-import="kp">' +
      '<span class="list-emoji">🎬</span>' +
      '<span class="list-text"><span class="list-title">Кинопоиск</span></span>' +
      '<span class="list-arrow">›</span></button>' +
      '<button type="button" class="list-item" data-ob-import="ext">' +
      '<span class="list-emoji">🌐</span>' +
      '<span class="list-text"><span class="list-title">MyShows / IMDb</span></span>' +
      '<span class="list-arrow">›</span></button>' +
      "</div>" +
      '<button type="button" class="btn-ghost btn-full" data-ob-skip-import style="margin-top:12px">' + siteT('site.onboard.skipImport', 'Пропустить') + '</button>';
    return showCenterDialog(deps, html, {
      dismissX: true,
      bind: function (ov, close) {
        ov.querySelector("[data-ob-import=\"kp\"]")?.addEventListener("click", function () {
          close({ path: "/import-kinopoisk" });
        });
        ov.querySelector("[data-ob-import=\"ext\"]")?.addEventListener("click", function () {
          close({ path: "/import-external" });
        });
        ov.querySelector("[data-ob-skip-import]")?.addEventListener("click", function () {
          close({ skip: true });
        });
      },
    });
  }

  async function showCoinsModal(deps, extraHtml) {
    const html =
      '<div class="mp-onboard-title">🪙 ' + siteT('site.onboard.coinsTitle', 'Монетки') + '</div>' +
      '<p class="mp-onboard-text">' +
      deps.escapeHtml(coinsExplain()) +
      "</p>" +
      (extraHtml || "") +
      '<button type="button" class="btn-primary btn-full" data-ob-close="ok" style="margin-top:14px">' + siteT('site.onboard.gotIt', 'Понятно') + '</button>';
    await showCenterDialog(deps, html, {});
  }

  async function stepGenres(deps, genres) {
    const chips = genres
      .map(function (g) {
        return (
          '<button type="button" class="chip" data-ob-gen="' +
          deps.escapeHtml(g) +
          '">' +
          deps.escapeHtml(g) +
          "</button>"
        );
      })
      .join("");
    const html =
      '<div class="mp-onboard-title">' + siteT('site.onboard.genresTitle', 'Выберите жанры') + '</div>' +
      '<p class="mp-onboard-text muted small">' + siteT('site.onboard.genresHint', 'Можно несколько') + '</p>' +
      '<div class="chips-wrap mp-onboard-genres">' +
      chips +
      "</div>" +
      '<button type="button" class="btn-primary btn-full" data-ob-continue style="margin-top:16px">' + siteT('site.onboard.continue', 'Продолжить') + '</button>';
    return showCenterDialog(deps, html, {
      dismissX: true,
      bind: function (ov, close) {
        const picked = [];
        ov.querySelectorAll("[data-ob-gen]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const g = btn.getAttribute("data-ob-gen") || "";
            const i = picked.indexOf(g);
            if (i >= 0) {
              picked.splice(i, 1);
              btn.classList.remove("chip-on");
            } else {
              picked.push(g);
              btn.classList.add("chip-on");
            }
          });
        });
        ov.querySelector("[data-ob-continue]")?.addEventListener("click", function () {
          close({ genres: picked.slice() });
        });
      },
    });
  }

  function renderPickerTile(deps, it, mode, selectedSet, selClass) {
    const kp = String(it.kp_id);
    const on = selectedSet.has(kp);
    const poster = it.poster || deps.posterUrl(it.kp_id, "small");
    return (
      '<button type="button" class="movie-poster mp-onboard-pick-tile' +
      (on ? " mp-onboard-pick-tile--" + selClass : "") +
      '" data-ob-kp="' +
      deps.escapeHtml(kp) +
      '" data-ob-series="' +
      (it.is_series ? "1" : "0") +
      '">' +
      '<div class="search-poster-media">' +
      '<img class="movie-poster-img" src="' +
      deps.escapeHtml(poster) +
      '" alt="" loading="lazy">' +
      "</div>" +
      '<div class="movie-poster-body">' +
      '<div class="movie-poster-title">' +
      deps.escapeHtml(it.title || "—") +
      "</div>" +
      '<div class="movie-poster-meta">' +
      (it.year ? deps.escapeHtml(String(it.year)) : "") +
      (it.is_series ? " • " + siteT("site.onboard.seriesBadge", "сериал") : "") +
      "</div></div></button>"
    );
  }

  async function mountFilmPicker(deps, opts) {
    let mode = opts.mode || "watched";
    const mediaType = opts.mediaType || "film";
    const isImportWant = mode === "import-want";
    const pickMode = isImportWant ? "want" : mode;
    const titleQ = isImportWant
      ? 'Что из похожего вы <em class="mp-onboard-em">хотели бы посмотреть</em>?'
      : mode === "watched"
        ? t("site.onboard.markWatchedHtml", "Отметьте, что вы смотрели")
        : mediaType === "series"
          ? 'Какие сериалы вы <em class="mp-onboard-em">хотели бы посмотреть</em>?'
          : 'Какие фильмы вы <em class="mp-onboard-em">хотели бы посмотреть</em>?';

    let items = (opts.initialItems || []).slice();
    const seenKp = new Set(items.map(function (x) {
      return String(x.kp_id);
    }));
    let similarLoads = 0;
    let loadingSimilar = 0;
    const similarLoadedFor = new Set();
    const recommendedKps = new Set();
    const selected = new Set();

    return new Promise(function (resolve) {
      const ov = document.createElement("div");
      ov.className = "mp-onboard-picker-overlay" + (deps.isDesktop ? " mp-onboard--desktop" : "");
      ov.setAttribute("role", "dialog");
      ov.setAttribute("aria-modal", "true");

      function atLimit() {
        return items.length >= MAX_TILES || similarLoads >= MAX_SIMILAR_LOADS;
      }

      function paintGrid(scrollTop, recEnter) {
        const grid = ov.querySelector("#ob-pick-grid");
        const confirm = ov.querySelector("#ob-pick-confirm");
        const dim = ov.querySelector("#ob-pick-grid-wrap");
        const selClassNow = pickMode === "watched" ? "watched" : "want";
        if (!grid) return;
        grid.innerHTML = items
          .map(function (it) {
            const sk = String(it.kp_id);
            const recCls =
              recEnter && recommendedKps.has(sk) && mode === "want" ? " mp-onboard-pick-tile--rec-enter" : "";
            return renderPickerTile(deps, it, mode, selected, selClassNow).replace(
              'class="movie-poster mp-onboard-pick-tile',
              'class="movie-poster mp-onboard-pick-tile' + recCls,
            );
          })
          .join("");
        const hasSel = selected.size > 0;
        if (confirm) {
          confirm.disabled = mode === "watched" ? !hasSel : !hasSel;
          confirm.classList.toggle("btn-disabled", confirm.disabled);
        }
        if (dim) dim.classList.toggle("mp-onboard-grid-dimmed", atLimit());
        if (scrollTop != null) {
          const sc = ov.querySelector("#ob-pick-scroll");
          if (sc) sc.scrollTop = scrollTop;
        }
      }

      function bindGrid() {
        ov.querySelectorAll("[data-ob-kp]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const kp = btn.getAttribute("data-ob-kp") || "";
            if (!kp) return;
            deps.hapticImpact("light");
            const wasOn = selected.has(kp);
            if (wasOn) selected.delete(kp);
            else selected.add(kp);
            btn.classList.toggle("mp-onboard-pick-tile--" + (mode === "watched" ? "watched" : "want"), selected.has(kp));
            const confirm = ov.querySelector("#ob-pick-confirm");
            const hasSel = selected.size > 0;
            if (confirm) {
              confirm.disabled = mode === "watched" ? !hasSel : !hasSel;
              confirm.classList.toggle("btn-disabled", confirm.disabled);
            }
            if (wasOn || atLimit() || loadingSimilar > 0) return;
            void loadSimilar(kp);
          });
        });
      }

      async function loadSimilar(kp) {
        if (atLimit() || loadingSimilar >= 3 || similarLoadedFor.has(kp)) return;
        similarLoadedFor.add(kp);
        loadingSimilar += 1;
        similarLoads += 1;
        try {
          const ex = Array.from(seenKp).join(",");
          const simType = mediaType === "any" ? "any" : mediaType;
          const data = await deps.apiGet(
            "/api/miniapp/onboarding/similar?kp_id=" +
              encodeURIComponent(kp) +
              "&type=" +
              encodeURIComponent(simType) +
              "&exclude=" +
              encodeURIComponent(ex),
            { bypassCache: true },
          );
          const batch = (data && data.items) || [];
          batch.forEach(function (it) {
            const sk = String(it.kp_id);
            if (seenKp.has(sk) || items.length >= MAX_TILES) return;
            seenKp.add(sk);
            recommendedKps.add(sk);
            items.push(it);
          });
          paintGrid();
          bindGrid();
        } catch (_e) {
          /* ignore */
        } finally {
          loadingSimilar -= 1;
        }
      }

      function sortRecommendedFirst() {
        const rec = [];
        const rest = [];
        items.forEach(function (it) {
          if (recommendedKps.has(String(it.kp_id))) rec.push(it);
          else rest.push(it);
        });
        items = rec.concat(rest);
      }

      ov.innerHTML =
        '<button type="button" class="mp-onboard-dismiss mp-onboard-picker-x" data-ob-x aria-label="' + siteT('common.close', 'Закрыть') + '">✕</button>' +
        '<div class="mp-onboard-picker-inner">' +
        '<div class="mp-onboard-picker-title">' +
        titleQ +
        "</div>" +
        '<div id="ob-pick-grid-wrap" class="mp-onboard-grid-wrap">' +
        '<div id="ob-pick-scroll" class="mp-onboard-grid-scroll">' +
        '<div id="ob-pick-grid" class="movies-grid mp-onboard-pick-grid"></div>' +
        "</div></div>" +
        '<button type="button" class="btn-primary btn-full mp-onboard-picker-confirm" id="ob-pick-confirm" disabled>' + siteT('site.onboard.confirm', 'Подтвердить') + '</button>' +
        "</div>";

      deps.lockViewportScroll();
      document.body.appendChild(ov);
      paintGrid(0);
      bindGrid();

      ov.querySelector("[data-ob-x]")?.addEventListener("click", function () {
        deps.unlockViewportScroll();
        ov.remove();
        resolve(null);
      });

      ov.querySelector("#ob-pick-confirm")?.addEventListener("click", async function () {
        const btn = ov.querySelector("#ob-pick-confirm");
        if (btn && btn.disabled) return;
        if (mode === "watched" && !isImportWant) {
          const watchedItems = items.filter(function (it) {
            return selected.has(String(it.kp_id));
          });
          btn.disabled = true;
          btn.textContent = siteT("site.onboard.loadingSimilar", t("site.onboard.loadingSimilar", "Загружаем похожие…"));
          await Promise.all(
            Array.from(selected).map(function (kp) {
              return loadSimilar(kp);
            }),
          );
          selected.forEach(function (kp) {
            const el = ov.querySelector('[data-ob-kp="' + kp + '"]');
            if (el) el.classList.add("mp-onboard-pick-tile--exit");
          });
          await new Promise(function (r) {
            setTimeout(r, 380);
          });
          items = items.filter(function (it) {
            return !watchedItems.some(function (w) {
              return String(w.kp_id) === String(it.kp_id);
            });
          });
          selected.clear();
          mode = "want";
          similarLoads = 0;
          sortRecommendedFirst();
          const titleEl = ov.querySelector(".mp-onboard-picker-title");
          if (titleEl) {
            titleEl.innerHTML =
              mediaType === "series"
                ? 'Какие сериалы вы <em class="mp-onboard-em">хотели бы посмотреть</em>?'
                : 'Какие фильмы вы <em class="mp-onboard-em">хотели бы посмотреть</em>?';
          }
          btn.textContent = "Подтвердить";
          paintGrid(0, true);
          bindGrid();
          const sc = ov.querySelector("#ob-pick-scroll");
          if (sc) sc.scrollTo({ top: 0, behavior: "smooth" });
          btn.disabled = true;
          btn.classList.add("btn-disabled");
          ov._obWatchedItems = watchedItems;
          return;
        }
        const picked = items.filter(function (it) {
          return selected.has(String(it.kp_id));
        });
        deps.unlockViewportScroll();
        ov.remove();
        resolve({
          phase: "done",
          wantItems: picked,
          watchedItems: ov._obWatchedItems || opts.watchedItems || [],
        });
      });
    });
  }

  async function stepWeekendCarousel(deps, items, mediaType) {
    if (!items || !items.length) return null;
    const cards = items
      .map(function (it, i) {
        const poster = it.poster || deps.posterUrl(it.kp_id, "big");
        return (
          '<button type="button" class="mp-onboard-weekend-card" data-ob-wk="' +
          i +
          '">' +
          '<div class="mp-onboard-weekend-poster" style="background-image:url(\'' +
          deps.escapeHtml(poster) +
          "')\"></div>" +
          '<div class="mp-onboard-weekend-title">' +
          deps.escapeHtml(it.title || "—") +
          "</div></button>"
        );
      })
      .join("");
    const html =
      '<div class="mp-onboard-title">Что посмотреть на выходных?</div>' +
      '<p class="mp-onboard-text">Выберите из того, что хотите посмотреть — создайте первый план</p>' +
      '<div class="mp-onboard-weekend-rail">' +
      cards +
      "</div>" +
      '<button type="button" class="btn-primary btn-full" data-ob-continue disabled style="margin-top:16px">Продолжить</button>';
    let pickedIdx = -1;
    return showCenterDialog(deps, html, {
      bind: function (ov, close) {
        const cont = ov.querySelector("[data-ob-continue]");
        ov.querySelectorAll("[data-ob-wk]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            ov.querySelectorAll(".mp-onboard-weekend-card").forEach(function (c) {
              c.classList.remove("mp-onboard-weekend-card--on");
            });
            btn.classList.add("mp-onboard-weekend-card--on");
            pickedIdx = parseInt(btn.getAttribute("data-ob-wk") || "-1", 10);
            if (cont) {
              cont.disabled = pickedIdx < 0;
              cont.classList.toggle("btn-disabled", pickedIdx < 0);
            }
            deps.hapticImpact("light");
          });
        });
        cont?.addEventListener("click", function () {
          if (pickedIdx < 0) return;
          close(items[pickedIdx]);
        });
      },
    });
  }

  async function saveInterest(deps, payload) {
    try {
      await deps.apiPost("/api/miniapp/onboarding/interest", payload);
    } catch (_e) {}
  }

  function postBulkLibrary(deps, st) {
    const p = deps
      .apiPost("/api/miniapp/onboarding/bulk-library", {
        watched: st.watchedItems || [],
        unwatched: st.wantItems || [],
      })
      .then(function () {
        try {
          sessionStorage.setItem("mp_onboard_fresh_dash", "1");
        } catch (_e) {}
        if (deps.invalidateCache) deps.invalidateCache("/api/miniapp/dashboard");
      })
      .catch(function () {});
    try {
      global.__mpOnboardBulkPromise = p;
    } catch (_e) {}
    return p;
  }

  async function runFlow(deps, onComplete) {
    let st = readState();
    if (!st.interest) {
      const s1 = await stepInterest(deps);
      if (!s1) {
        await deps.markFirstOnboardingDoneAsync();
        clearState();
        if (onComplete) onComplete();
        return;
      }
      st.interest = s1.interest;
      st.otherText = s1.otherText || "";
      writeState(st);
    }

    const isMedia = st.interest === "movies" || st.interest === "series";
    const mediaType = st.interest === "series" ? "series" : "film";

    if (!isMedia) {
      if (st.interest === "premieres" && !st.premHint) {
        await showCenterDialog(
          deps,
          '<div class="mp-onboard-title">Премьеры</div>' +
            '<p class="mp-onboard-text">На главной — блок «Премьеры» и список ожидания ⏳, чтобы не пропустить релиз.</p>' +
            '<button type="button" class="btn-primary btn-full" data-ob-close="ok">Понятно</button>',
          {},
        );
        st.premHint = true;
        writeState(st);
      }
      await saveInterest(deps, {
        interest: st.interest,
        other_text: st.otherText || "",
        db_source: "",
        db_other: "",
        genres: [],
      });
      if (!st.coinsExplained) {
        await showCoinsModal(deps);
        st.coinsExplained = true;
      }
      await deps.markFirstOnboardingDoneAsync();
      clearState();
      if (onComplete) onComplete();
      return;
    }

    if (isMedia && st.dbSource == null) {
      const s2 = await stepDbSource(deps);
      if (!s2) {
        if (onComplete) onComplete();
        return;
      }
      st.dbSource = s2.dbSource;
      st.dbOther = s2.dbOther || "";
      writeState(st);
    }

    if (isMedia && st.dbSource && st.dbSource !== "none" && !st.importDone && !st.importSkipped) {
      if (!st.importPrompted) {
        st.importPrompted = true;
        writeState(st);
        const imp = await stepImportChoice(deps);
        if (imp && imp.path) {
          st.awaitImportReturn = true;
          writeState(st);
          if (onComplete) onComplete();
          deps.navigate(imp.path);
          return;
        }
        st.importSkipped = true;
        writeState(st);
      }
    }

    if (st.awaitImportReturn) {
      st.awaitImportReturn = false;
      st.importSkipped = true;
      writeState(st);
    }

    const needsManualPicker = isMedia && (st.dbSource === "none" || st.importSkipped);

    if (isMedia && st.importDone && !st.pickerDone) {
      let seed = [];
      try {
        const sd = await deps.apiGet("/api/miniapp/onboarding/import-want-seed", { bypassCache: true });
        seed = (sd && sd.items) || [];
      } catch (_e) {}
      if (seed.length) {
        const pick = await mountFilmPicker(deps, {
          mode: "import-want",
          mediaType: "any",
          initialItems: seed,
        });
        if (pick && pick.phase === "done") {
          st.wantItems = pick.wantItems || [];
          void postBulkLibrary(deps, { watched: [], unwatched: st.wantItems });
        }
      }
      st.pickerDone = true;
      writeState(st);
    }

    if (needsManualPicker && !st.genresDone) {
      const genres = deps.WTW_GENRES_FALLBACK || [];
      const sg = await stepGenres(deps, genres);
      if (!sg) {
        if (onComplete) onComplete();
        return;
      }
      st.genres = sg.genres || [];
      st.genresDone = true;
      writeState(st);
    }

    if (needsManualPicker && st.genresDone && !st.pickerDone) {
      let seed = [];
      try {
        const sd = await deps.apiGet(
          "/api/miniapp/onboarding/seed?type=" + encodeURIComponent(mediaType),
          { bypassCache: true },
        );
        seed = (sd && sd.items) || [];
      } catch (_e) {}
      const pick = await mountFilmPicker(deps, {
        mode: "watched",
        mediaType: mediaType,
        initialItems: seed,
      });
      if (!pick || pick.phase !== "done") {
        if (onComplete) onComplete();
        return;
      }
      st.wantItems = pick.wantItems || [];
      st.watchedItems = pick.watchedItems || [];
      void postBulkLibrary(deps, st);
      st.pickerDone = true;
      writeState(st);
    }

    if (isMedia && st.pickerDone && !st.planFilm) {
      await saveInterest(deps, {
        interest: st.interest,
        other_text: st.otherText || "",
        db_source: st.dbSource || "",
        db_other: st.dbOther || "",
        genres: st.genres || [],
      });
      const pool = (st.wantItems && st.wantItems.length ? st.wantItems : st.watchedItems) || [];
      if (!pool.length) {
        if (!st.coinsExplained) {
          await showCoinsModal(deps);
          st.coinsExplained = true;
        }
        await deps.markFirstOnboardingDoneAsync();
        clearState();
        if (onComplete) onComplete();
        return;
      }
      const film = await stepWeekendCarousel(deps, pool.slice(0, 12), mediaType);
      if (film) {
        st.planFilm = film;
        writeState(st);
        await deps.markFirstOnboardingDoneAsync();
        clearState();
        if (onComplete) onComplete();
        const q =
          "?onboard=1" +
          (film.kp_id ? "&kp=" + encodeURIComponent(String(film.kp_id)) : "") +
          (film.title ? "&title=" + encodeURIComponent(film.title) : "");
        deps.navigate("/plan/home" + q);
        return;
      }
    }

    await saveInterest(deps, {
      interest: st.interest,
      other_text: st.otherText || "",
      db_source: st.dbSource || "",
      db_other: st.dbOther || "",
      genres: st.genres || [],
    });

    if (!st.coinsExplained) {
      await showCoinsModal(deps);
      st.coinsExplained = true;
    }

    if (!st.recsHint) {
      await showCenterDialog(
        deps,
        '<div class="mp-onboard-title">Раздел «Посмотреть»</div>' +
          '<p class="mp-onboard-text">Если не знаете, что включить — загляните в рекомендации. К высоко оценённым фильмам показываем похожие.</p>' +
          '<button type="button" class="btn-primary btn-full" data-ob-close="ok">Понятно</button>',
        {},
      );
      st.recsHint = true;
    }

    await deps.markFirstOnboardingDoneAsync();
    clearState();
    if (onComplete) onComplete();
  }

  global.__mpMountExtendedOnboarding = function (deps, onComplete) {
    void runFlow(deps, onComplete);
  };

  global.__mpOnboardingImportFinished = async function (deps, imported) {
    const st = readState();
    if (!st.importPrompted) return;
    st.importDone = !!imported;
    st.importSkipped = !imported;
    st.awaitImportReturn = false;
    writeState(st);
    if (imported) {
      await showCoinsModal(
        deps,
        '<p class="mp-onboard-text" style="margin-top:8px"><strong>+2000 монеток</strong> за импорт!</p>',
      );
    } else {
      await showCoinsModal(deps);
    }
    void runFlow(deps, function () {});
  };

  global.__mpShowOnboardingCoinsAfterPlan = async function (deps, amount, onDone) {
    await showCoinsModal(
      deps,
      '<p class="mp-onboard-text" style="margin-top:8px"><strong>+' +
        String(amount || 20) +
        " монеток</strong> за план!</p>",
    );
    await showCenterDialog(
      deps,
      '<div class="mp-onboard-title">Раздел «Посмотреть»</div>' +
        '<p class="mp-onboard-text">Если не знаете, что включить — загляните в рекомендации. К высоко оценённым фильмам показываем похожие.</p>' +
        '<button type="button" class="btn-primary btn-full" data-ob-close="ok">Понятно</button>',
      {},
    );
    if (typeof onDone === "function") onDone();
  };
})(window);
