/**
 * Extended onboarding after intro carousel — interest survey, import, genre picker, plan.
 * Loaded before app.js; invoked via window.__mpMountExtendedOnboarding(deps, onComplete).
 */
(function (global) {
  "use strict";

  function obT(key, fallback) {
    try {
      if (global.MP_I18N && global.MP_I18N.t) return global.MP_I18N.t(key, fallback);
    } catch (_e) {}
    return fallback != null ? String(fallback) : key;
  }

  function resolveOnboardingDeps(deps) {
    if (deps && typeof deps.apiGet === "function") return deps;
    if (typeof global.__mpGetDeps === "function") {
      try {
        return global.__mpGetDeps();
      } catch (_e) {}
    }
    return global.__mpDeps || deps;
  }

  const STATE_KEY = "mp_onboard_v2_state";
  const GUEST_STATE_KEY = "mp_guest_onboard_state";
  const MAX_SIMILAR_LOADS = 15;
  const GUEST_MAX_SIMILAR_LOADS = 5;
  const MAX_TILES = 100;
  const GUEST_INITIAL_SEED_CHUNK = 24;
  const SKIP_WATCHED_RATINGS_MIN = 100;
  const UNWATCHED_RANDOM_MIN = 10;
  const WANT_BOOTSTRAP_MIN = 10;
  const TAIL_PREFETCH_RATIO = 0.65;
  const OB_FLOW_V = "20260716return2";

  let _obKpImportPoll = null;

  function stopOnboardingImportBgPoll() {
    if (_obKpImportPoll) {
      clearInterval(_obKpImportPoll);
      _obKpImportPoll = null;
    }
  }

  function isInternalImportCopy(s) {
    if (!s) return true;
    return /Mac|Railway|VPN|очеред|создател|парсинг|вручную|KP на/i.test(String(s));
  }

  function introSlideKey(slideKey) {
    return slideKey === "invite_friends" ? "invite" : slideKey;
  }

  function friendlyImportStatusText(job, fallback) {
    if (job && job.status === "running") {
      const phase = job.phase || "";
      if (phase === "waiting_local" || phase === "starting" || phase === "scraping") {
        return fallback || obT("onboarding.importStarted", "Импорт с Кинопоиска начат");
      }
      const detail = (job.phase_detail || "").trim();
      if (detail && !isInternalImportCopy(detail)) return detail;
      const hint = (job.user_hint || "").trim();
      if (hint && !isInternalImportCopy(hint)) return hint;
      return fallback || obT("onboarding.importStarted", "Импорт с Кинопоиска начат");
    }
    return fallback || "";
  }

  function beginOnboardingImportBgPoll(deps) {
    stopOnboardingImportBgPoll();
    _obKpImportPoll = setInterval(function () {
      deps
        .apiGet("/api/miniapp/ratings/import-status", { bypassCache: true })
        .then(function (s) {
          const job = s && s.job;
          if (job && job.status === "done") {
            stopOnboardingImportBgPoll();
            const imported = Number(job.imported || 0);
            if (imported > 0 && typeof global.__mpOnboardingImportFinished === "function") {
              void global.__mpOnboardingImportFinished(deps, true);
            }
          }
        })
        .catch(function () {});
    }, 2500);
  }

  async function fetchOnboardingKpImportFlags(deps) {
    try {
      const res = await deps.apiGet("/api/miniapp/onboarding/status", { bypassCache: true });
      return {
        running: !!(res && res.kp_import_running),
        wantReady: !!(res && res.kp_import_want_ready),
        ratingsCount: Number(res && res.ratings_count) || 0,
      };
    } catch (_e) {
      return { running: false, wantReady: false, ratingsCount: 0 };
    }
  }

  async function isOnboardingKpImportInProgress(deps, st) {
    const flags = await fetchOnboardingKpImportFlags(deps);
    if (flags.running) {
      st.importStarted = true;
      st.awaitImportReturn = true;
      st.pendingImportWantPicker = false;
      writeState(st);
      return true;
    }
    if (st.importStarted && !st.importDone) {
      try {
        const s = await deps.apiGet("/api/miniapp/ratings/import-status", {
          bypassCache: true,
        });
        const job = s && s.job;
        if (job && job.status === "running") return true;
        if (job && job.status === "done") {
          st.importDone = Number(job.imported || 0) > 0;
          st.importSkipped = !st.importDone;
          writeState(st);
          return false;
        }
      } catch (_e2) {}
      return true;
    }
    return false;
  }

  async function maybeOfferImportWantPicker(deps, st, meta, seedMediaType) {
    if (st.pickerDone || !meta.hasMedia) return false;
    if (await isOnboardingKpImportInProgress(deps, st)) {
      beginOnboardingImportBgPoll(deps);
      return false;
    }
    const flags = await fetchOnboardingKpImportFlags(deps);
    let ready = flags.wantReady;
    if (!ready && st.importDone && flags.ratingsCount > 0) {
      ready = true;
    }
    if (!ready) return false;

    obClientLog(deps, "flow.import-want.show", {
      title: obT("onboarding.wantTitle", "Что вы хотели бы посмотреть?"),
      ratingsCount: flags.ratingsCount,
    });
    const importSeedUrl = onboardingImportWantUrl(seedMediaType === "any" ? "any" : seedMediaType);
    const seedItems = await prefetchOnboardSeed(deps, importSeedUrl);
    const pick = await mountFilmPicker(deps, {
      mode: "import-want",
      mediaType: seedMediaType === "any" ? "any" : seedMediaType,
      initialItems: seedItems,
      seedUrl: seedItems.length ? null : importSeedUrl,
      tailSeedUrl: onboardingRatedTailUrl(seedMediaType),
      showBack: false,
    });
    try {
      await deps.apiPost("/api/miniapp/onboarding/kp-import-want-dismiss", {});
    } catch (_e2) {}
    if (!pick || pick.phase !== "done") {
      return false;
    }
    st.wantItems = pick.wantItems || [];
    st.watchedItems = [];
    st.importDone = true;
    st.importSkipped = false;
    st.pickerDone = true;
    st.pendingImportWantPicker = false;
    void postBulkLibrary(deps, st);
    writeState(st);
    return true;
  }

  function isPickerItemOk(it) {
    if (!it || it.kp_id == null) return false;
    const t = String(it.title || "").trim();
    if (!t || t === "—") return false;
    if (!it.poster_ok) return false;
    if (t === "1+1") return true;
    return /[а-яА-ЯёЁ]/.test(t);
  }

  function obClientLog(deps, event, details) {
    const payload = Object.assign({ v: OB_FLOW_V, ts: Date.now() }, details || {});
    try {
      console.info("[ONBOARD-CLIENT]", event, payload);
    } catch (_e) {}
    if (deps && deps.apiPost) {
      deps.apiPost("/api/miniapp/onboarding/client-log", {
        event: String(event || ""),
        details: payload,
      }).catch(function () {});
    }
  }

  async function prefetchOnboardSeed(deps, url) {
    obClientLog(deps, "seed.prefetch.start", { url: url || "" });
    if (!url) return [];
    try {
      const sd = await deps.apiGet(url, { bypassCache: true, timeout: 65000 });
      const items = (sd && sd.items) || [];
      obClientLog(deps, "seed.prefetch.ok", {
        url: url,
        count: items.length,
        success: sd && sd.success ? 1 : 0,
      });
      return items.filter(isPickerItemOk);
    } catch (e) {
      obClientLog(deps, "seed.prefetch.fail", {
        url: url,
        err: String((e && e.message) || e),
        status: e && e.status != null ? e.status : "",
      });
      return [];
    }
  }

  async function fetchOnboardingRatingsCount(deps) {
    try {
      const res = await deps.apiGet("/api/miniapp/onboarding/status", { bypassCache: true });
      const n = Number(res && res.ratings_count);
      if (Number.isFinite(n) && n >= 0) return n;
    } catch (_e) {}
    return 0;
  }

  const COINS_EXPLAIN =
    "Монетки — внутренняя валюта Movie Planner. Их можно тратить на билеты к сеансам, Шazam и прокачанные рекомендации. Получайте монетки за активность: импорт, оценки, планы и стрики.";

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

  function dismissAllOnboardingLayers(deps) {
    try {
      document
        .querySelectorAll(
          ".mp-onboard-overlay, .mp-onboard-dialog-overlay, .mp-dialog-overlay.mp-onboard-dialog-overlay, .mp-first-onboard-overlay, .mp-onboard-picker-overlay",
        )
        .forEach(function (el) {
          try {
            el.remove();
          } catch (_e) {}
        });
    } catch (_e2) {}
    if (deps && deps.unlockViewportScroll) deps.unlockViewportScroll();
  }

  function importPathForState(st) {
    const p = st && st.importPath;
    if (p && String(p).indexOf("/import") === 0) return p;
    return "/import-kinopoisk";
  }

  function clearState() {
    try {
      sessionStorage.removeItem(STATE_KEY);
    } catch (_e) {}
  }

  function readGuestState() {
    try {
      const raw = sessionStorage.getItem(GUEST_STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_e) {
      return {};
    }
  }

  function writeGuestState(st) {
    try {
      sessionStorage.setItem(GUEST_STATE_KEY, JSON.stringify(st || {}));
    } catch (_e) {}
  }

  function clearGuestState() {
    try {
      sessionStorage.removeItem(GUEST_STATE_KEY);
    } catch (_e) {}
  }

  function isObBack(val) {
    return !!(val && val.__back === true);
  }

  function overlayClass(deps, base) {
    let c = base || "mp-dialog-overlay mp-onboard-dialog-overlay";
    if (deps && deps.isDesktop) c += " mp-onboard--desktop";
    return c;
  }

  function showCenterDialog(deps, html, opts) {
    const o = opts || {};
    const dismissX = o.dismissX !== false;
    return new Promise(function (resolve) {
      const ov = document.createElement("div");
      ov.className = overlayClass(deps, "mp-dialog-overlay mp-onboard-dialog-overlay");
      ov.setAttribute("role", "dialog");
      ov.setAttribute("aria-modal", "true");
      ov.innerHTML =
        '<div class="mp-dialog-card mp-onboard-dialog-card' +
        (o.showBack ? " mp-onboard-dialog-card--with-back" : "") +
        '">' +
        (o.showBack
          ? '<button type="button" class="mp-onboard-back" data-ob-back aria-label="Назад">‹</button>'
          : "") +
        (dismissX
          ? '<button type="button" class="mp-onboard-dismiss" data-ob-x aria-label="Закрыть">✕</button>'
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
      ov.querySelector("[data-ob-back]")?.addEventListener("click", function () {
        close({ __back: true });
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
      attachOnboardOverlayGuards(ov, ".mp-onboard-dialog-card");
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

  function optionRowMulti(id, label, checked) {
    return (
      '<label class="mp-onboard-opt">' +
      '<input type="checkbox" name="ob-interest" value="' +
      id +
      '"' +
      (checked ? " checked" : "") +
      ">" +
      '<span class="mp-onboard-opt-label">' +
      label +
      "</span></label>"
    );
  }

  function getInterestMeta(st) {
    const interests =
      st.interests && st.interests.length
        ? st.interests.slice()
        : st.interest
          ? [st.interest]
          : [];
    const hasMovies = interests.indexOf("movies") >= 0;
    const hasSeries = interests.indexOf("series") >= 0;
    const hasPremieres = interests.indexOf("premieres") >= 0;
    const hasOther = interests.indexOf("other") >= 0;
    const mixedMedia = hasMovies && hasSeries;
    const hasMedia = hasMovies || hasSeries;
    let mediaType = null;
    if (mixedMedia) mediaType = "any";
    else if (hasSeries) mediaType = "series";
    else if (hasMovies) mediaType = "film";
    return {
      interests: interests,
      hasMovies: hasMovies,
      hasSeries: hasSeries,
      hasPremieres: hasPremieres,
      hasOther: hasOther,
      mixedMedia: mixedMedia,
      hasMedia: hasMedia,
      mediaType: mediaType,
    };
  }

  function buildInterestPayload(st, meta) {
    return {
      interest: (meta.interests || []).join(",") || "movies",
      interests: meta.interests || [],
      other_text: st.otherText || "",
      db_source: st.dbSource || "",
      db_other: st.dbOther || "",
      genres: st.genres || [],
    };
  }

  function buildWeekendPool(st) {
    const pool = [];
    (st.wantItems || []).forEach(function (it) {
      pool.push(it);
    });
    (st.premiereWantItems || []).forEach(function (it) {
      pool.push(it);
    });
    return pool;
  }

  function isReadyForPlanPick(st, meta) {
    if (st.planFilm || st.premHint) return false;
    if (meta.hasPremieres && !meta.hasMedia && st.premDone) return true;
    if (st.pickerDone && (!meta.hasPremieres || st.premDone)) return true;
    if (
      st.importStarted &&
      !st.pickerDone &&
      (st.premiereWantItems || []).length > 0 &&
      (!meta.hasPremieres || st.premDone)
    ) {
      return true;
    }
    return false;
  }

  async function showPlanPageHint(deps) {
    await showCenterDialog(
      deps,
      '<div class="mp-onboard-title">Планы</div>' +
        '<p class="mp-onboard-text">Здесь можно назначить дату дома или в кино — напоминание придёт вовремя.</p>' +
        '<button type="button" class="btn-primary btn-full" data-ob-close="ok" style="margin-top:16px">Понятно</button>',
      {},
    );
  }


  function finishWithOnboardHandoff(deps, onComplete) {
    dismissAllOnboardingLayers(deps);
    clearState();
    if (onComplete) onComplete();
    if (typeof global.__mpCompleteOnboardHandoff === "function") {
      global.__mpCompleteOnboardHandoff({ reason: "onboarding" });
      return;
    }
    try {
      sessionStorage.setItem("mp_force_home_tour", "1");
      sessionStorage.setItem("mp_force_friends_invite", "1");
    } catch (_e2) {}
    deps.navigate("/", { replace: true });
  }

  async function handoffToCabinetAfterImport(deps, st, meta, onComplete) {
    dismissAllOnboardingLayers(deps);
    try {
      await saveInterest(deps, buildInterestPayload(st, meta));
    } catch (_e) {}
    await deps.markFirstOnboardingDoneAsync();
    if (deps.markOnboardingSessionComplete) deps.markOnboardingSessionComplete();
    finishWithOnboardHandoff(deps, onComplete);
  }

  async function dismissPlanPickToHome(deps, st, meta, onComplete) {
    dismissAllOnboardingLayers(deps);
    await saveInterest(deps, buildInterestPayload(st, meta));
    await deps.markFirstOnboardingDoneAsync();
    if (deps.markOnboardingSessionComplete) deps.markOnboardingSessionComplete();
    finishWithOnboardHandoff(deps, onComplete);
  }

  async function finishOnboardingTail(deps, st, meta, onComplete) {
    await saveInterest(deps, buildInterestPayload(st, meta));
    if (!st.planFilm && !st.premHint) {
      await showPlanPageHint(deps);
      st.premHint = true;
      writeState(st);
    }
    if (!st.coinsExplained) {
      await showCoinsModal(deps);
      st.coinsExplained = true;
      writeState(st);
    }
    if (!st.recsHint) {
      await showCenterDialog(
        deps,
        '<div class="mp-onboard-title">Раздел «Посмотреть»</div>' +
          '<p class="mp-onboard-text">Если не знаете, что включить — загляните в рекомендации.</p>' +
          '<button type="button" class="btn-primary btn-full" data-ob-close="ok" style="margin-top:16px">Понятно</button>',
        {},
      );
      st.recsHint = true;
      writeState(st);
    }
    await deps.markFirstOnboardingDoneAsync();
    if (deps.markOnboardingSessionComplete) deps.markOnboardingSessionComplete();
    finishWithOnboardHandoff(deps, onComplete);
  }

  function onboardingSeedUrl(mediaType, genres, extra) {
    let url = "/api/miniapp/onboarding/seed?type=" + encodeURIComponent(mediaType || "film");
    if (genres && genres.length) {
      url += "&genres=" + encodeURIComponent(genres.join(","));
    }
    if (extra && extra.excludeLibrary) {
      url += "&exclude_library=1";
    }
    return url;
  }

  function onboardingRatedTailUrl(mediaType, anchorOffset) {
    let url =
      "/api/miniapp/onboarding/rated-tail?type=" +
      encodeURIComponent(mediaType || "film") +
      "&limit=24";
    if (anchorOffset) {
      url += "&anchor_offset=" + encodeURIComponent(String(anchorOffset));
    }
    return url;
  }

  function onboardingImportWantUrl(mediaType) {
    return (
      "/api/miniapp/onboarding/import-want-seed?type=" + encodeURIComponent(mediaType || "any")
    );
  }

  function guestOnboardingSeedUrl(mediaType, offset, limit) {
    return (
      "/api/public/onboarding/seed?type=" +
      encodeURIComponent(mediaType || "film") +
      "&offset=" +
      encodeURIComponent(String(offset || 0)) +
      "&limit=" +
      encodeURIComponent(String(limit || GUEST_INITIAL_SEED_CHUNK))
    );
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

  const INTRO_SLIDES = [
    {
      key: "welcome",
      emoji: "🍿",
      title: "Добро пожаловать в Movie Planner",
      body: "Храните фильмы и сериалы, планируйте просмотры, ставьте оценки и получайте рекомендации на основе ваших предпочтений.",
    },
    {
      key: "search",
      emoji: "🔎",
      title: "Находите через поиск",
      body: "Нажмите «🔎 Поиск» на главном экране, введите название — и добавьте фильм в библиотеку одним тапом.",
    },
    {
      key: "plan",
      emoji: "🗓️",
      title: "Планируйте просмотр",
      body: "Из карточки фильма выбирайте «🏠 Запланировать дома» или «🎟️ В кино» — получите напоминание в нужное время.",
    },
    {
      key: "random",
      emoji: "🎲",
      title: "Не знаете, что посмотреть?",
      body: "Кнопка «🎲 Случайный фильм» подберёт что-то из вашего непросмотренного.",
    },
    {
      key: "tournament",
      emoji: "🏆",
      title: "Турнирная таблица",
      body: "Соревнуйтесь с другими киноманами каждый месяц — топ-3 получают монетки.",
    },
    {
      key: "link",
      emoji: "🔗",
      title: "Связка с Telegram-ботом",
      body: "Если у вас уже есть аккаунт в @movie_planner_bot — зайдите через Telegram. Фильмы и планы синхронизируются.",
    },
    {
      key: "invite_friends",
      emoji: "👋",
      title: "Отлично!",
      body: "Также вы можете пригласить друзей и получить бонусы за приглашение.",
      kind: "invite",
    },
  ];

  function mountIntroCarousel(deps) {
    return new Promise(function (resolve) {
      let idx = 0;
      let touchStartX = 0;
      let touchStartY = 0;
      const ov = document.createElement("div");
      ov.className = "mp-onboard-overlay mp-intro-carousel-overlay";
      ov.setAttribute("role", "dialog");
      ov.setAttribute("aria-modal", "true");
      ov.innerHTML =
        '<div class="mp-intro-carousel-card">' +
        '<button type="button" class="mp-onboard-dismiss" data-intro-skip aria-label="' + obT("common.close", "Закрыть") + '">✕</button>' +
        '<div class="mp-intro-carousel-body">' +
        '<div class="mp-intro-carousel-emoji" id="intro-emoji"></div>' +
        '<div class="mp-onboard-title" id="intro-title"></div>' +
        '<p class="mp-onboard-text mp-intro-carousel-body-text" id="intro-body"></p>' +
        "</div>" +
        '<div class="mp-intro-carousel-foot">' +
        '<div class="mp-intro-dots" id="intro-dots"></div>' +
        '<button type="button" class="btn-primary btn-full" id="intro-main-btn"></button>' +
        '<button type="button" class="btn-ghost btn-full mp-intro-skip-bottom" id="intro-skip-bottom" hidden>' + obT("onboarding.skip", "Пропустить") + '</button>' +
        "</div></div>";
      deps.lockViewportScroll();

      const card = ov.querySelector(".mp-intro-carousel-card");
      const emojiEl = ov.querySelector("#intro-emoji");
      const titleEl = ov.querySelector("#intro-title");
      const bodyEl = ov.querySelector("#intro-body");
      const dotsEl = ov.querySelector("#intro-dots");
      const mainBtn = ov.querySelector("#intro-main-btn");
      const skipBottomBtn = ov.querySelector("#intro-skip-bottom");

      function onMainAction(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        const action = mainBtn?.getAttribute("data-intro-action") || "next";
        if (action === "invite") {
          if (typeof deps.shareProfileInvite === "function") {
            void deps.shareProfileInvite();
          }
          close();
          return;
        }
        goNext();
      }

      function close() {
        deps.unlockViewportScroll();
        try {
          ov.remove();
        } catch (_e) {}
        resolve(true);
      }

      function goNext() {
        if (idx < INTRO_SLIDES.length - 1) {
          idx += 1;
          paint();
        } else {
          close();
        }
      }

      function goPrev() {
        if (idx > 0) {
          idx -= 1;
          paint();
        }
      }

      function paint() {
        const slide = INTRO_SLIDES[idx];
        const isInvite = slide.kind === "invite";
        if (emojiEl) emojiEl.textContent = slide.emoji || "";
        if (titleEl) {
          titleEl.textContent = obT(
            "onboarding.intro." + introSlideKey(slide.key) + ".title",
            slide.title || "",
          );
        }
        if (bodyEl) {
          bodyEl.textContent = obT(
            "onboarding.intro." + introSlideKey(slide.key) + ".body",
            slide.body || "",
          );
        }
        if (dotsEl) {
          dotsEl.innerHTML = INTRO_SLIDES.map(function (_, i) {
            return (
              '<span class="mp-intro-dot' +
              (i === idx ? " mp-intro-dot--on" : "") +
              '"></span>'
            );
          }).join("");
        }
        if (mainBtn) {
          if (isInvite) {
            mainBtn.textContent = obT("onboarding.inviteFriends", "Пригласить друзей");
            mainBtn.setAttribute("data-intro-action", "invite");
          } else {
            mainBtn.textContent = idx === INTRO_SLIDES.length - 1 ? obT("onboarding.start", "Начать") : obT("onboarding.next", "Далее");
            mainBtn.setAttribute("data-intro-action", "next");
          }
        }
        if (skipBottomBtn) skipBottomBtn.hidden = !isInvite;
      }

      ov.querySelector("[data-intro-skip]")?.addEventListener("click", close);
      skipBottomBtn?.addEventListener("click", close);
      mainBtn?.addEventListener("click", onMainAction);

      if (card) {
        card.addEventListener(
          "touchstart",
          function (ev) {
            const t = ev.changedTouches && ev.changedTouches[0];
            if (!t) return;
            touchStartX = t.clientX;
            touchStartY = t.clientY;
          },
          { passive: true },
        );
        card.addEventListener(
          "touchend",
          function (ev) {
            const t = ev.changedTouches && ev.changedTouches[0];
            if (!t) return;
            const target = ev.target;
            if (
              target &&
              target.closest &&
              (target.closest("#intro-main-btn") ||
                target.closest("#intro-skip-bottom") ||
                target.closest(".mp-onboard-dismiss"))
            ) {
              return;
            }
            const dx = t.clientX - touchStartX;
            const dy = t.clientY - touchStartY;
            if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
            if (dx < 0) goNext();
            else goPrev();
          },
          { passive: true },
        );
        card.addEventListener("keydown", function (ev) {
          if (ev.key === "ArrowRight") goNext();
          if (ev.key === "ArrowLeft") goPrev();
        });
      }

      document.body.appendChild(ov);
      paint();
    });
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

  function dbSourcePickButton(value, emoji, label) {
    return (
      '<button type="button" class="mp-onboard-db-btn" data-ob-db-pick="' +
      value +
      '">' +
      '<span class="mp-onboard-db-emoji">' +
      emoji +
      "</span>" +
      '<span class="mp-onboard-db-label">' +
      label +
      "</span>" +
      '<span class="mp-onboard-db-arrow">›</span>' +
      "</button>"
    );
  }

  function attachOnboardOverlayGuards(ov, scrollSelector) {
    if (!ov || ov._obOverlayGuards) return;
    ov._obOverlayGuards = true;
    ov.addEventListener(
      "touchmove",
      function (ev) {
        const scrollEl = scrollSelector ? ov.querySelector(scrollSelector) : null;
        if (scrollEl && (scrollEl === ev.target || scrollEl.contains(ev.target))) return;
        ev.preventDefault();
      },
      { passive: false, capture: true },
    );
  }

  async function stepInterest(deps) {
    const html =
      '<div class="mp-onboard-title">Расскажите о ваших интересах</div>' +
      '<p class="mp-onboard-text muted small">Можно выбрать несколько вариантов</p>' +
      '<div class="mp-onboard-opts">' +
      optionRowMulti("movies", "Фильмы", true) +
      optionRowMulti("series", "Сериалы", false) +
      optionRowMulti("premieres", "Премьеры", false) +
      optionRowMulti("other", "Другое (укажите)", false) +
      "</div>" +
      embeddedField("ob-other-text", "Напишите, что вас интересует", false) +
      '<button type="button" class="btn-primary btn-full" data-ob-continue style="margin-top:16px">Продолжить</button>';
    const res = await showCenterDialog(deps, html, {
      bind: function (ov, close) {
        const otherWrap = ov.querySelector("#ob-other-text-wrap");
        const otherInp = ov.querySelector("#ob-other-text");
        function syncOtherField() {
          const otherOn = !!ov.querySelector('input[name="ob-interest"][value="other"]:checked');
          if (otherWrap) otherWrap.classList.toggle("hidden", !otherOn);
          if (otherOn && otherInp) otherInp.focus();
        }
        ov.querySelectorAll('input[name="ob-interest"]').forEach(function (inp) {
          inp.addEventListener("change", syncOtherField);
        });
        ov.querySelector("[data-ob-continue]")?.addEventListener("click", function () {
          const picked = [];
          ov.querySelectorAll('input[name="ob-interest"]:checked').forEach(function (inp) {
            picked.push(inp.value);
          });
          if (!picked.length) {
            deps.toast("Выберите хотя бы один вариант");
            return;
          }
          const otherText = otherInp ? otherInp.value.trim() : "";
          if (picked.indexOf("other") >= 0 && !otherText) {
            deps.toast("Укажите, что вас интересует");
            return;
          }
          close({ interests: picked, otherText: otherText });
        });
      },
    });
    return res;
  }

  async function stepDbSource(deps, mediaLabel) {
    const html =
      '<div class="mp-onboard-title">Где вы ведёте базу просмотренного?</div>' +
      '<div class="mp-onboard-db-list">' +
      dbSourcePickButton("none", "—", "Нет базы") +
      dbSourcePickButton("kp", "🎬", "Кинопоиск") +
      dbSourcePickButton("myshows", "📺", "MyShows") +
      dbSourcePickButton("imdb", "🌐", "IMDb") +
      dbSourcePickButton("letterboxd", "🎞️", "Letterboxd") +
      dbSourcePickButton("other", "✏️", "Другой сервис") +
      "</div>" +
      embeddedField("ob-db-other", "Какой сервис?", false) +
      '<button type="button" class="btn-primary btn-full hidden" data-ob-db-other-continue style="margin-top:12px">Продолжить</button>';
    return showCenterDialog(deps, html, {
      showBack: true,
      bind: function (ov, close) {
        const otherWrap = ov.querySelector("#ob-db-other-wrap");
        const otherInp = ov.querySelector("#ob-db-other");
        const otherBtn = ov.querySelector("[data-ob-db-other-continue]");
        function pick(db) {
          if (db === "other") {
            if (otherWrap) otherWrap.classList.remove("hidden");
            if (otherBtn) otherBtn.classList.remove("hidden");
            if (otherInp) otherInp.focus();
            return;
          }
          close({ dbSource: db, dbOther: "" });
        }
        ov.querySelectorAll("[data-ob-db-pick]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            pick(btn.getAttribute("data-ob-db-pick") || "none");
          });
        });
        otherBtn?.addEventListener("click", function () {
          const dbOther = otherInp ? otherInp.value.trim() : "";
          if (!dbOther) {
            deps.toast("Укажите сервис");
            return;
          }
          close({ dbSource: "other", dbOther: dbOther });
        });
      },
    });
  }

  function extImportSourceHelp(source) {
    if (source === "imdb") {
      return "IMDb: в десктоп-версии откройте Your Ratings и нажмите Export, затем вставьте CSV.";
    }
    if (source === "letterboxd") {
      return "Letterboxd: логин или ссылка letterboxd.com/логин (публичный RSS), либо ratings.csv из Export Data.";
    }
    return "MyShows: ссылка myshows.me/<логин> или …/wasted/, либо HTML страницы /wasted/.";
  }

  async function stepImportChoice(deps, opts) {
    opts = opts || {};
    const initialMode = opts.initialMode || "menu";
    const lockExtSource = !!opts.lockExtSource;
    return new Promise(function (resolve) {
      let mode = initialMode;
      let kpInput = "";
      let extSource = opts.extSource || "imdb";
      let extMaxCount = Number(opts.extMaxCount) || 500;
      let extPayload = "";
      let statusText = "";
      let errText = "";
      let busy = false;
      let kpProbe = null;
      let pollTimer = null;
      let importStartedUi = false;
      let coinsAdvance = 0;

      const ov = document.createElement("div");
      ov.className = overlayClass(deps, "mp-dialog-overlay mp-onboard-dialog-overlay");
      ov.setAttribute("role", "dialog");
      ov.setAttribute("aria-modal", "true");

      if (typeof deps.hideLoader === "function") deps.hideLoader();

      function stopPoll() {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }

      function finish(val) {
        stopPoll();
        stopOnboardingImportBgPoll();
        deps.unlockViewportScroll();
        try {
          ov.remove();
        } catch (_e) {}
        resolve(val);
      }

      function finishImportAndContinue() {
        finish({
          importStarted: true,
          continued: true,
          coinsAdvance: coinsAdvance,
        });
      }

      function importStartedPanelHtml() {
        const src =
          mode === "kp"
            ? "Кинопоиска"
            : extSource === "myshows"
              ? "MyShows"
              : extSource === "letterboxd"
                ? "Letterboxd"
                : "IMDb";
        return (
          '<div class="mp-onboard-import-started">' +
          '<p class="mp-onboard-text"><strong>Импорт идёт</strong></p>' +
          '<p class="muted small" style="margin-top:8px;line-height:1.45">Оценки с ' +
          deps.escapeHtml(src) +
          " подтянем в фоне. Можно сразу открыть кабинет — покажем, где база, поиск и «что посмотреть».</p>" +
          (coinsAdvance > 0
            ? '<p class="mp-onboard-text" style="margin-top:10px"><strong>+' +
              coinsAdvance +
              " монеток</strong> уже на балансе.</p>"
            : "") +
          '<button type="button" class="btn-primary btn-full" data-ob-continue-onboard style="margin-top:16px">Продолжить в кабинет</button>' +
          "</div>"
        );
      }

      function kpImportRatingLabel(probe) {
        const n = Number((probe && probe.api_rated_sample) || 0);
        if (!n) return "";
        return " (" + n + " оценок)";
      }

      function kpFriendPanelHtml() {
        if (!kpProbe || kpProbe.status !== "api_only") return "";
        const helper = (kpProbe.helper && typeof kpProbe.helper === "object") ? kpProbe.helper : {};
        const helperUrl = (helper.profile_url || "").trim();
        const helperLabel = (helper.label || "Movie Planner").trim();
        const countLbl = kpImportRatingLabel(kpProbe);
        const linkBlock = helperUrl
          ? '<button type="button" class="btn-secondary btn-full" data-ob-kp-helper-link style="margin-top:10px">' +
            deps.escapeHtml(helperLabel) + " на Кинопоиске</button>"
          : "";
        return (
          '<p class="mp-onboard-text" style="margin-top:12px">Профиль закрыт для гостей</p>' +
          '<p class="muted small" style="margin-top:6px;line-height:1.45">Добавьте наш аккаунт в друзья на Кинопоиске — тогда подтянем полный список с сайта.</p>' +
          linkBlock +
          '<button type="button" class="btn-primary btn-full" data-ob-kp-verify style="margin-top:12px">Я добавил в друзья</button>' +
          '<button type="button" class="btn-ghost btn-full" data-ob-kp-api style="margin-top:8px">Согласиться' +
          countLbl +
          "</button>"
        );
      }

      function paint() {
        let body = "";
        if (mode === "menu") {
          body =
            '<div class="mp-onboard-title">Импорт оценок</div>' +
            '<p class="mp-onboard-text">Перенесите просмотренное — получите <strong>2000 монеток</strong>.</p>' +
            '<div class="mp-onboard-db-list">' +
            dbSourcePickButton("kp", "🎬", "Кинопоиск") +
            dbSourcePickButton("ext", "🌐", "MyShows / IMDb / Letterboxd") +
            "</div>" +
            '<button type="button" class="btn-ghost btn-full" data-ob-skip style="margin-top:10px">Пропустить</button>';
        } else if (mode === "kp") {
          if (importStartedUi) {
            body =
              '<div class="mp-onboard-title">Кинопоиск</div>' + importStartedPanelHtml();
          } else {
            body =
              '<div class="mp-onboard-title">Кинопоиск</div>' +
              '<p class="mp-onboard-text muted small">ID или ссылка на профиль Кинопоиска.</p>' +
              '<input type="text" class="input-like" id="ob-kp-input" placeholder="https://www.kinopoisk.ru/user/1234567/" ' +
              'style="width:100%;box-sizing:border-box;margin:10px 0;padding:12px;border-radius:12px;border:1px solid #333;background:#111;color:#eee" value="' +
              deps.escapeHtml(kpInput) +
              '" />' +
              (statusText
                ? '<p class="muted small" style="margin:8px 0;line-height:1.45">' +
                  deps.escapeHtml(statusText) +
                  "</p>"
                : "") +
              (busy
                ? '<div class="mp-onboard-import-started"><div class="mp-onboard-import-spinner" aria-hidden="true"></div></div>'
                : "") +
              (errText
                ? '<p class="muted small error" style="margin:8px 0">' + deps.escapeHtml(errText) + "</p>"
                : "") +
              (kpProbe && kpProbe.status === "api_only" && !busy
                ? kpFriendPanelHtml()
                : '<button type="button" class="btn-primary btn-full" id="ob-kp-start"' +
                  (busy ? " disabled" : "") +
                  ">" +
                  (busy ? "Импорт…" : "Начать импорт") +
                  "</button>") +
              '<button type="button" class="btn-ghost btn-full" data-ob-skip style="margin-top:10px">Пропустить</button>';
          }
        } else if (importStartedUi) {
          const extTitle = extSource === "myshows" ? "MyShows" : extSource === "letterboxd" ? "Letterboxd" : extSource === "imdb" ? "IMDb" : "Импорт";
          body = '<div class="mp-onboard-title">' + extTitle + "</div>" + importStartedPanelHtml();
        } else {
          const extTitle = extSource === "myshows" ? "MyShows" : extSource === "letterboxd" ? "Letterboxd" : "IMDb";
          const srcChips = lockExtSource
            ? ""
            : '<div class="chips-wrap" style="margin:10px 0">' +
              '<button type="button" class="chip' +
              (extSource === "imdb" ? " chip-on" : "") +
              '" data-ob-ext-src="imdb">IMDb</button>' +
              '<button type="button" class="chip' +
              (extSource === "myshows" ? " chip-on" : "") +
              '" data-ob-ext-src="myshows">MyShows</button>' +
              '<button type="button" class="chip' +
              (extSource === "letterboxd" ? " chip-on" : "") +
              '" data-ob-ext-src="letterboxd">Letterboxd</button>' +
              "</div>";
          const cntChips = [100, 300, 500, 1000, 1500]
            .map(function (n) {
              return (
                '<button type="button" class="chip' +
                (extMaxCount === n ? " chip-on" : "") +
                '" data-ob-ext-cnt="' +
                n +
                '">' +
                n +
                "</button>"
              );
            })
            .join("");
          body =
            '<div class="mp-onboard-title">' +
            extTitle +
            "</div>" +
            srcChips +
            '<p class="muted small" style="margin:6px 0 8px">' +
            deps.escapeHtml(extImportSourceHelp(extSource)) +
            "</p>" +
            '<textarea id="ob-ext-payload" class="input-like" placeholder="' +
            (extSource === "imdb"
              ? "Вставьте CSV из IMDb…"
              : extSource === "letterboxd"
                ? "логин Letterboxd или https://letterboxd.com/логин/"
                : "https://myshows.me/логин/ или …/wasted/") +
            '" style="width:100%;min-height:170px;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid #333;background:#111;color:#eee">' +
            deps.escapeHtml(extPayload) +
            "</textarea>" +
            '<div class="chips-wrap" style="margin:10px 0">' +
            cntChips +
            "</div>" +
            (statusText
              ? '<p class="muted small" style="margin:8px 0;line-height:1.45">' +
                deps.escapeHtml(statusText) +
                "</p>"
              : "") +
            (errText ? '<p class="muted small error" style="margin:8px 0">' + deps.escapeHtml(errText) + "</p>" : "") +
            '<button type="button" class="btn-primary btn-full" id="ob-ext-start"' +
            (busy ? " disabled" : "") +
            ">" +
            (busy ? "Импорт…" : "Начать импорт") +
            "</button>" +
            '<button type="button" class="btn-ghost btn-full" data-ob-skip style="margin-top:10px">Пропустить</button>';
        }

        ov.innerHTML =
          '<div class="mp-dialog-card mp-onboard-dialog-card mp-onboard-dialog-card--with-back">' +
          '<button type="button" class="mp-onboard-back" data-ob-back aria-label="Назад">‹</button>' +
          '<button type="button" class="mp-onboard-dismiss" data-ob-x aria-label="Закрыть">✕</button>' +
          body +
          "</div>";
        bindEvents();
      }

      async function pollUntilDone() {
        return new Promise(function (pollResolve) {
          const tick = async function () {
            try {
              const s = await deps.apiGet("/api/miniapp/ratings/import-status");
              const job = s && s.job;
              if (job && job.status === "running") {
                statusText = friendlyImportStatusText(job, "Импорт с Кинопоиска начат");
                paint();
                return;
              }
              stopPoll();
              const imported = Number((job && job.imported) || 0);
              const showTourn =
                imported > 0 &&
                (Boolean(s.show_tournament_intro) || Boolean(job && job.show_tournament_intro));
              pollResolve({
                inlineDone: true,
                imported: imported,
                show_tournament_intro: showTourn,
                tournament_intro_image_url:
                  (s && s.tournament_intro_image_url) ||
                  (job && job.tournament_intro_image_url) ||
                  "",
              });
            } catch (_e) {
              stopPoll();
              pollResolve({ inlineDone: true, imported: 0 });
            }
          };
          void tick();
          pollTimer = setInterval(function () {
            void tick();
          }, 1200);
        });
      }

      function readKpInputDom() {
        const el = ov.querySelector("#ob-kp-input");
        const v = ((el && el.value) || kpInput || "").trim();
        kpInput = v;
        return v;
      }

      function readExtPayloadDom() {
        const el = ov.querySelector("#ob-ext-payload");
        const v = ((el && el.value) || extPayload || "").trim();
        extPayload = v;
        return v;
      }

      async function onImportQueued(resp) {
        importStartedUi = true;
        busy = false;
        kpProbe = null;
        coinsAdvance = Number((resp && resp.coins_awarded) || 0);
        statusText = "";
        errText = "";
        paint();
        beginOnboardingImportBgPoll(deps);
      }

      async function startKpImport(extraBody, opts) {
        const opt = opts || {};
        const raw = readKpInputDom();
        if (!raw) {
          errText = "Введите ссылку или ID профиля Кинопоиска.";
          paint();
          return;
        }
        if (!opt.background) {
          busy = true;
          errText = "";
          statusText = "Запускаем импорт…";
          paint();
        }
        try {
          const resp = await deps.apiPost(
            "/api/miniapp/ratings/import-kinopoisk",
            Object.assign(
              {
                kp_input: raw,
                import_all: true,
                onboarding: true,
              },
              extraBody || {},
            ),
            null,
            120000,
          );
          if (opt.background) {
            const ca = Number((resp && resp.coins_awarded) || 0);
            if (ca > 0) {
              coinsAdvance = ca;
              if (importStartedUi) paint();
            }
            return;
          }
          await onImportQueued(resp);
        } catch (e) {
          const err = (e && e.data && e.data.error) || "";
          if (err === "import_running") {
            if (opt.background) return;
            await onImportQueued(e.data || {});
            return;
          }
          if (opt.background) return;
          busy = false;
          if (err === "profile_not_open" && e.data && e.data.probe) {
            kpProbe = e.data.probe;
            statusText = "";
            paint();
            return;
          }
          errText = (e && e.data && e.data.message) || e.message || "Не удалось запустить импорт.";
          statusText = "";
          paint();
        }
      }

      async function handleKpStartClick() {
        if (busy) return;
        const raw = readKpInputDom();
        if (!raw) {
          errText = "Введите ссылку или ID профиля Кинопоиска.";
          paint();
          return;
        }
        busy = true;
        errText = "";
        statusText = "Проверяем профиль на Кинопоиске…";
        paint();
        obClientLog(deps, "import.kp.check", { len: raw.length });
        try {
          const chk = await deps.apiPost(
            "/api/miniapp/ratings/kp-profile-check",
            { kp_input: raw },
            null,
            90000,
          );
          const probe = (chk && chk.probe) || null;
          kpProbe = probe;
          obClientLog(deps, "import.kp.probe", {
            status: probe && probe.status,
            profile_total: probe && probe.profile_total,
            api_sample: probe && probe.api_rated_sample,
          });
          if (!probe || probe.status === "open") {
            await startKpImport(
              {
                skip_probe: true,
                probe: probe || { status: "open", kp_user_id: (chk && chk.kp_user_id) || "" },
                friend_confirmed: true,
              },
            );
            return;
          }
          if (probe.status === "api_only") {
            busy = false;
            statusText = "";
            paint();
            return;
          }
          busy = false;
          errText = probe.hint || chk.message || "Не удалось проверить профиль.";
          statusText = "";
          paint();
        } catch (e) {
          busy = false;
          const err = (e && e.data && e.data.error) || "";
          if (err === "profile_not_open" && e.data && e.data.probe) {
            kpProbe = e.data.probe;
            statusText = "";
            paint();
            return;
          }
          if (err === "bad_kp_id") {
            errText =
              (e && e.data && e.data.message) ||
              "Укажите ссылку вида kinopoisk.ru/user/… или числовой ID.";
          } else {
            errText = (e && e.data && e.data.message) || e.message || "Не удалось проверить профиль.";
          }
          statusText = "";
          paint();
        }
      }

      async function handleExtStartClick() {
        if (busy) return;
        const payload = readExtPayloadDom();
        if (!payload) {
          errText = "Вставьте экспорт перед импортом.";
          paint();
          return;
        }
        busy = true;
        errText = "";
        statusText = "Запускаем импорт…";
        paint();
        obClientLog(deps, "import.ext.start", { source: extSource });
        try {
          const resp = await deps.apiPost("/api/miniapp/ratings/import-external", {
            source: extSource,
            payload: payload,
            max_count: extMaxCount,
            onboarding: true,
          });
          await onImportQueued(resp || {});
        } catch (e) {
          busy = false;
          const err = (e && e.data && e.data.error) || "";
          if (err === "import_running") {
            await onImportQueued(e.data || {});
            return;
          }
          errText = (e && e.data && e.data.message) || e.message || "Не удалось запустить импорт.";
          statusText = "";
          paint();
        }
      }

      function bindEvents() {
        const kpInp = ov.querySelector("#ob-kp-input");
        if (kpInp) {
          const syncKp = function () {
            kpInput = kpInp.value || "";
            kpProbe = null;
            errText = "";
          };
          kpInp.addEventListener("input", syncKp);
          kpInp.addEventListener("change", syncKp);
          kpInp.addEventListener("paste", function () {
            setTimeout(syncKp, 0);
          });
        }
        const extTa = ov.querySelector("#ob-ext-payload");
        if (extTa) {
          const syncExt = function () {
            extPayload = extTa.value || "";
            errText = "";
          };
          extTa.addEventListener("input", syncExt);
          extTa.addEventListener("change", syncExt);
          extTa.addEventListener("paste", function () {
            setTimeout(syncExt, 0);
          });
        }
      }

      if (!ov._obImportClickBound) {
        ov._obImportClickBound = true;
        ov.addEventListener("click", function (ev) {
          if (ev.target.closest("[data-ob-continue-onboard]") || ev.target.closest("[data-ob-dismiss-import]")) {
            ev.preventDefault();
            finishImportAndContinue();
            return;
          }
          if (ev.target.closest("[data-ob-x]")) {
            if (importStartedUi) finishImportAndContinue();
            else finish({ skipped: true });
            return;
          }
          if (ev.target.closest("[data-ob-skip]")) {
            if (importStartedUi) return;
            finish({ skipped: true });
            return;
          }
          if (ev.target.closest("[data-ob-back]")) {
            if (initialMode !== "menu") {
              finish({ __back: true });
              return;
            }
            if (mode === "menu") finish({ __back: true });
            else {
              mode = "menu";
              errText = "";
              statusText = "";
              kpProbe = null;
              busy = false;
              paint();
            }
            return;
          }
          if (ev.target.closest('[data-ob-view="kp"]')) {
            mode = "kp";
            errText = "";
            paint();
            return;
          }
          if (ev.target.closest('[data-ob-view="ext"]')) {
            mode = "ext";
            errText = "";
            paint();
            return;
          }
          if (ev.target.closest("#ob-kp-start")) {
            ev.preventDefault();
            if (deps.hapticImpact) deps.hapticImpact("medium");
            void handleKpStartClick();
            return;
          }
          if (ev.target.closest("[data-ob-kp-helper-link]")) {
            ev.preventDefault();
            const helper = (kpProbe && kpProbe.helper) || {};
            const url = (helper.profile_url || "").trim();
            if (url) {
              try {
                window.open(url, "_blank", "noopener");
              } catch (_e) {}
            }
            return;
          }
          if (ev.target.closest("[data-ob-kp-verify]")) {
            ev.preventDefault();
            void startKpImport({ friend_confirmed: true });
            return;
          }
          if (ev.target.closest("[data-ob-kp-api]")) {
            ev.preventDefault();
            void startKpImport({ api_only: true, import_all: true });
            return;
          }
          if (ev.target.closest("[data-ob-ext-src]")) {
            if (busy || lockExtSource) return;
            extSource = ev.target.closest("[data-ob-ext-src]").getAttribute("data-ob-ext-src") || "imdb";
            paint();
            return;
          }
          if (ev.target.closest("[data-ob-ext-cnt]")) {
            if (busy) return;
            extMaxCount = Number(
              ev.target.closest("[data-ob-ext-cnt]").getAttribute("data-ob-ext-cnt") || 500,
            );
            paint();
            return;
          }
          if (ev.target.closest("#ob-ext-start")) {
            ev.preventDefault();
            if (deps.hapticImpact) deps.hapticImpact("medium");
            void handleExtStartClick();
          }
        });
      }

      deps.lockViewportScroll();
      document.body.appendChild(ov);
      paint();
    });
  }

  async function showCoinsModal(deps, extraHtml) {
    const html =
      '<div class="mp-onboard-title">🪙 Монетки</div>' +
      '<p class="mp-onboard-text">' +
      deps.escapeHtml(COINS_EXPLAIN) +
      "</p>" +
      (extraHtml || "") +
      '<button type="button" class="btn-primary btn-full" data-ob-close="ok" style="margin-top:14px">Понятно</button>';
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
      '<div class="mp-onboard-title">Выберите любимые жанры</div>' +
      '<div class="chips-wrap mp-onboard-genres">' +
      chips +
      "</div>" +
      '<button type="button" class="btn-primary btn-full" data-ob-continue style="margin-top:16px">Продолжить</button>';
    return showCenterDialog(deps, html, {
      showBack: true,
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

  function safeRenderPickerTile(deps, it, mode, selectedSet, selClass, recCls) {
    try {
      if (!it || it.kp_id == null) return "";
      return renderPickerTile(deps, it, mode, selectedSet, selClass).replace(
        'class="movie-poster mp-onboard-pick-tile',
        'class="movie-poster mp-onboard-pick-tile' + (recCls || ""),
      );
    } catch (e) {
      obClientLog(deps, "picker.tile.error", {
        kp_id: it && it.kp_id,
        err: String((e && e.message) || e),
      });
      return "";
    }
  }

  function renderPickerTile(deps, it, mode, selectedSet, selClass) {
    const kp = String(it.kp_id);
    const on = selectedSet.has(kp);
    const fb = deps.posterUrl(it.kp_id, "small");
    const poster =
      it.poster_ok && it.poster
        ? it.poster
        : (deps.normalizePosterUrl ? deps.normalizePosterUrl(it.poster, it.kp_id) : it.poster) || fb;
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
      '" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'' +
      deps.escapeHtml(fb) +
      "'\">" +
      "</div>" +
      '<div class="movie-poster-body">' +
      '<div class="movie-poster-title">' +
      deps.escapeHtml(it.title || "—") +
      "</div>" +
      '<div class="movie-poster-meta">' +
      (it.year ? deps.escapeHtml(String(it.year)) : "") +
      (it.is_series ? " • сериал" : "") +
      "</div></div></button>"
    );
  }

  async function mountFilmPicker(deps, opts) {
    let mode = opts.mode || "watched";
    const mediaType = opts.mediaType || "film";
    const isImportWant = mode === "import-want";
    const minSelection = Math.max(1, Number(opts.minSelection) || 1);
    let showBackBtn = opts.showBack !== false && mode === "watched" && !isImportWant;
    const maxSimilarLoads =
      opts.maxSimilarLoads != null ? Number(opts.maxSimilarLoads) : MAX_SIMILAR_LOADS;
    const maxTiles = opts.maxTiles != null ? Number(opts.maxTiles) : MAX_TILES;
    const usePublicApi = !!opts.usePublicApi;

    function selClassNow() {
      return mode === "want" || isImportWant ? "want" : "watched";
    }

    function gridExhausted() {
      return similarLoads >= maxSimilarLoads;
    }
    const titleQ = isImportWant
      ? 'Что из похожего вы <em class="mp-onboard-em">хотели бы посмотреть</em>?'
      : mode === "watched"
        ? mediaType === "any"
          ? "Отметьте фильмы и сериалы, которые вы смотрели"
          : "Отметьте, что вы смотрели"
        : mediaType === "any"
          ? 'Какие фильмы и сериалы вы <em class="mp-onboard-em">хотели бы посмотреть</em>?'
          : mediaType === "series"
            ? 'Какие сериалы вы <em class="mp-onboard-em">хотели бы посмотреть</em>?'
            : 'Какие фильмы вы <em class="mp-onboard-em">хотели бы посмотреть</em>?';

    let items = (opts.initialItems || []).slice().filter(isPickerItemOk);
    let similarLoads = 0;
    let loadingSimilar = 0;
    const similarLoadedFor = new Set();
    const recommendedKps = new Set();
    const watchedKpBlock = new Set(
      (opts.excludeKpIds || []).map(function (x) {
        return String(x);
      }),
    );
    (opts.preloadSimilarFrom || []).forEach(function (it) {
      if (it && it.kp_id) watchedKpBlock.add(String(it.kp_id));
    });
    if (watchedKpBlock.size) {
      items = items.filter(function (it) {
        return !watchedKpBlock.has(String(it.kp_id));
      });
    }
    const seenKp = new Set(items.map(function (x) {
      return String(x.kp_id);
    }));
    watchedKpBlock.forEach(function (kp) {
      seenKp.add(kp);
    });
    const selected = new Set();
    let loadingSeed = false;
    let loadSeedFailed = false;
    let tailLoading = false;
    let tailHasMore = !!opts.tailSeedUrl;
    let tailAnchorOffset = 0;
    let tailScrollBound = false;

    return new Promise(function (resolve) {
      const ov = document.createElement("div");
      ov.className = "mp-onboard-picker-overlay" + (deps.isDesktop ? " mp-onboard--desktop" : "");
      ov.setAttribute("role", "dialog");
      ov.setAttribute("aria-modal", "true");

      function syncNavButtons() {
        const backBtn = ov.querySelector("#ob-pick-back");
        if (backBtn) backBtn.style.display = showBackBtn ? "flex" : "none";
      }

      function atLimit() {
        return items.length >= maxTiles || similarLoads >= maxSimilarLoads;
      }

      function emptyGridHtml() {
        if (loadingSeed) {
          return (
            '<div class="center muted" style="grid-column:1/-1;padding:48px 16px;text-align:center">' +
            '<div class="spinner-inline" style="width:28px;height:28px;border-width:3px;margin:0 auto 14px"></div>' +
            '<div style="font-size:15px;color:var(--text,#fff)">Загружаем фильмы…</div></div>'
          );
        }
        if (loadSeedFailed) {
          return (
            '<div class="center muted" style="grid-column:1/-1;padding:48px 16px;text-align:center">' +
            '<div style="font-size:15px;margin-bottom:12px;color:var(--text,#fff)">Не удалось загрузить подборку</div>' +
            '<button type="button" class="btn-secondary" id="ob-pick-retry">Повторить</button></div>'
          );
        }
        return (
          '<div class="center muted" style="grid-column:1/-1;padding:48px 16px;color:var(--text,#fff)">Подборка пуста</div>'
        );
      }

      function syncConfirmState() {
        const confirm = ov.querySelector("#ob-pick-confirm");
        const hasSel = selected.size > 0;
        if (confirm) {
          confirm.disabled = !hasSel;
          confirm.classList.toggle("btn-disabled", !hasSel);
        }
      }

      function paintGrid(scrollTop, recEnter) {
        const grid = ov.querySelector("#ob-pick-grid");
        const dim = ov.querySelector("#ob-pick-grid-wrap");
        if (!grid) {
          obClientLog(deps, "picker.paint.skip", { reason: "no_grid" });
          return;
        }
        if (!items.length) {
          grid.innerHTML = emptyGridHtml();
          const retry = ov.querySelector("#ob-pick-retry");
          if (retry) {
            retry.addEventListener("click", function () {
              loadSeedFailed = false;
              loadingSeed = true;
              paintGrid(0);
              void runSeedLoad();
            });
          }
          syncConfirmState();
          obClientLog(deps, "picker.paint.skip", { reason: "empty", loadingSeed: loadingSeed ? 1 : 0 });
          return;
        }
        obClientLog(deps, "picker.paint.start", { count: items.length, mode: mode });
        const selClass = selClassNow();
        try {
          grid.innerHTML = items
            .map(function (it) {
              const sk = String(it.kp_id);
              const recCls =
                recEnter && recommendedKps.has(sk) && mode === "want" ? " mp-onboard-pick-tile--rec-enter" : "";
              return safeRenderPickerTile(deps, it, mode, selected, selClass, recCls);
            })
            .filter(Boolean)
            .join("");
          if (dim) dim.classList.toggle("mp-onboard-grid-dimmed", loadingSimilar > 0);
          syncConfirmState();
          if (scrollTop != null) {
            const sc = ov.querySelector("#ob-pick-scroll");
            if (sc) sc.scrollTop = scrollTop;
          }
          obClientLog(deps, "picker.paint.done", {
            count: items.length,
            rendered: grid.querySelectorAll("[data-ob-kp]").length,
            mode: mode,
          });
          bindTiles();
        } catch (e) {
          obClientLog(deps, "picker.paint.error", {
            err: String((e && e.message) || e),
          });
          loadSeedFailed = true;
          loadingSeed = false;
          grid.innerHTML = emptyGridHtml();
        }
      }

      function bindTiles() {
        ov.querySelectorAll("[data-ob-kp]").forEach(function (btn) {
          if (btn._obPickTileBound) return;
          btn._obPickTileBound = true;
          function onTileActivate(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            const kp = btn.getAttribute("data-ob-kp") || "";
            if (!kp) return;
            deps.hapticImpact("light");
            const wasOn = selected.has(kp);
            if (wasOn) selected.delete(kp);
            else selected.add(kp);
            btn.classList.toggle("mp-onboard-pick-tile--" + selClassNow(), selected.has(kp));
            syncConfirmState();
            if (wasOn || atLimit() || loadingSimilar > 0) return;
            void loadSimilar(kp);
          }
          btn.addEventListener("click", onTileActivate);
        });
      }

      function bindPickerChrome() {
        if (ov._obChromeBound) return;
        ov._obChromeBound = true;
        function onBack() {
          obClientLog(deps, "picker.nav.back", { mode: mode });
          deps.unlockViewportScroll();
          ov.remove();
          resolve({ __back: true });
        }
        function onClose() {
          obClientLog(deps, "picker.nav.close", { mode: mode });
          deps.unlockViewportScroll();
          ov.remove();
          resolve(null);
        }
        function wantTitleHtml() {
          return mediaType === "any"
            ? 'Какие фильмы и сериалы вы <em class="mp-onboard-em">хотели бы посмотреть</em>?'
            : mediaType === "series"
              ? 'Какие сериалы вы <em class="mp-onboard-em">хотели бы посмотреть</em>?'
              : 'Какие фильмы вы <em class="mp-onboard-em">хотели бы посмотреть</em>?';
        }
        async function onConfirm() {
          const btn = ov.querySelector("#ob-pick-confirm");
          if (btn && (btn.disabled || btn.classList.contains("btn-disabled"))) return;
          obClientLog(deps, "picker.nav.confirm", { mode: mode, selected: selected.size });
          if (mode === "watched" && !isImportWant) {
            const watchedItems = items.filter(function (it) {
              return selected.has(String(it.kp_id));
            });
            if (!watchedItems.length) return;
            const remainingItems = items.filter(function (it) {
              return !selected.has(String(it.kp_id));
            }).filter(isPickerItemOk);
            obClientLog(deps, "picker.phase.want", {
              remaining: remainingItems.length,
              watched: watchedItems.length,
            });
            deps.unlockViewportScroll();
            ov.remove();
            if (opts.guestAfterWatched) {
              resolve({
                phase: "guest-auth",
                watchedItems: watchedItems,
                remainingItems: remainingItems,
                recommendedKps: Array.from(recommendedKps),
              });
              return;
            }
            resolve({
              phase: "want",
              watchedItems: watchedItems,
              remainingItems: remainingItems,
              recommendedKps: Array.from(recommendedKps),
            });
            return;
          }
          if (selected.size < minSelection) return;
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
        }
        function routePickerTap(ev) {
          const backEl = ev.target && ev.target.closest ? ev.target.closest("#ob-pick-back") : null;
          const closeEl = ev.target && ev.target.closest ? ev.target.closest("#ob-pick-x") : null;
          const confirmEl = ev.target && ev.target.closest ? ev.target.closest("#ob-pick-confirm") : null;
          const retryEl = ev.target && ev.target.closest ? ev.target.closest("#ob-pick-retry") : null;
          if (backEl && backEl.style.display !== "none") {
            ev.preventDefault();
            ev.stopPropagation();
            onBack();
            return;
          }
          if (closeEl) {
            ev.preventDefault();
            ev.stopPropagation();
            onClose();
            return;
          }
          if (confirmEl) {
            ev.preventDefault();
            ev.stopPropagation();
            if (confirmEl.disabled || confirmEl.classList.contains("btn-disabled")) return;
            void onConfirm();
            return;
          }
          if (retryEl) {
            ev.preventDefault();
            ev.stopPropagation();
            loadSeedFailed = false;
            loadingSeed = true;
            paintGrid(0);
            void runSeedLoad();
          }
        }
        ov.addEventListener("click", routePickerTap, true);
        ov.addEventListener("touchend", routePickerTap, { capture: true, passive: false });
      }

      async function loadSimilar(kp) {
        if (atLimit() || loadingSimilar >= 3 || similarLoadedFor.has(kp)) return;
        similarLoadedFor.add(kp);
        loadingSimilar += 1;
        similarLoads += 1;
        try {
          const ex = Array.from(seenKp).concat(Array.from(watchedKpBlock)).join(",");
          const simType = mediaType === "any" ? "any" : mediaType;
          const similarBase = usePublicApi
            ? "/api/public/onboarding/similar"
            : "/api/miniapp/onboarding/similar";
          const data = await deps.apiGet(
            similarBase +
              "?kp_id=" +
              encodeURIComponent(kp) +
              "&type=" +
              encodeURIComponent(simType) +
              "&exclude=" +
              encodeURIComponent(ex),
            { bypassCache: true },
          );
          const batch = (data && data.items) || [];
          batch.forEach(function (it) {
            if (!isPickerItemOk(it)) return;
            const sk = String(it.kp_id);
            if (seenKp.has(sk) || watchedKpBlock.has(sk) || items.length >= maxTiles) return;
            seenKp.add(sk);
            recommendedKps.add(sk);
            items.push(it);
          });
          sortRecommendedFirst();
          paintGrid();
          bindTiles();
        } catch (_e) {
          /* ignore */
        } finally {
          loadingSimilar -= 1;
        }
      }

      function sortRecommendedFirst() {
        // Keep chronological append order: similar cards should appear at the end.
      }

      if (opts.recommendedKps && opts.recommendedKps.length) {
        opts.recommendedKps.forEach(function (kp) {
          recommendedKps.add(String(kp));
        });
        sortRecommendedFirst();
      }

      ov.innerHTML =
        '<div class="mp-onboard-picker-inner mp-onboard-picker-inner--with-head">' +
        '<div class="mp-onboard-picker-head">' +
        '<button type="button" class="mp-onboard-back" id="ob-pick-back" aria-label="Назад">‹</button>' +
        '<button type="button" class="mp-onboard-dismiss" id="ob-pick-x" aria-label="Закрыть">✕</button>' +
        "</div>" +
        '<div class="mp-onboard-picker-title">' +
        titleQ +
        "</div>" +
        (opts.subtitleHtml || "") +
        '<div id="ob-pick-grid-wrap" class="mp-onboard-grid-wrap">' +
        '<div id="ob-pick-scroll" class="mp-onboard-grid-scroll">' +
        '<div id="ob-pick-grid" class="movies-grid mp-onboard-pick-grid">' +
        "</div>" +
        "</div></div>" +
        '<button type="button" class="btn-primary btn-full mp-onboard-picker-confirm" id="ob-pick-confirm" disabled>' +
        deps.escapeHtml(opts.confirmLabel || "Подтвердить") +
        "</button>" +
        "</div>";

      deps.lockViewportScroll();
      if (deps.hideLoader) deps.hideLoader();
      try {
        document
          .querySelectorAll(
            ".mp-onboard-overlay, .mp-onboard-dialog-overlay, .mp-dialog-overlay.mp-onboard-dialog-overlay, .mp-first-onboard-overlay, .mp-onboard-picker-overlay",
          )
          .forEach(function (el) {
            try {
              el.remove();
            } catch (_e) {}
          });
      } catch (_e2) {}
      document.body.appendChild(ov);
      attachOnboardOverlayGuards(ov, "#ob-pick-scroll");
      bindPickerChrome();
      if (items.length) {
        paintGrid(0);
        bindTailScrollPrefetch();
        if (opts.tailSeedUrl) {
          void loadTailPage();
        }
      } else if (opts.seedUrl) {
        loadingSeed = true;
        paintGrid(0);
      }
      obClientLog(deps, "picker.mount", {
        mode: mode,
        initial: items.length,
        hasSeedUrl: opts.seedUrl ? 1 : 0,
        seedUrl: opts.seedUrl || "",
        painted: ov.querySelector("#ob-pick-grid [data-ob-kp]") ? 1 : 0,
      });
      syncNavButtons();

      if (opts.preloadSimilarFrom && opts.preloadSimilarFrom.length) {
        opts.preloadSimilarFrom.slice(0, 4).forEach(function (it) {
          if (it && it.kp_id) void loadSimilar(String(it.kp_id));
        });
      }

      function bindTailScrollPrefetch() {
        if ((!opts.tailSeedUrl && !opts.publicSeedPagination) || tailScrollBound) return;
        const sc = ov.querySelector("#ob-pick-scroll");
        if (!sc) return;
        tailScrollBound = true;
        sc.addEventListener(
          "scroll",
          function () {
            const maxY = Math.max(1, sc.scrollHeight - sc.clientHeight);
            if (maxY > 0 && sc.scrollTop / maxY >= TAIL_PREFETCH_RATIO) {
              void loadTailPage();
            }
          },
          { passive: true },
        );
      }

      async function loadTailPage() {
        if ((!opts.tailSeedUrl && !opts.publicSeedPagination) || tailLoading || !tailHasMore || atLimit()) return;
        tailLoading = true;
        const sc = ov.querySelector("#ob-pick-scroll");
        const scrollTop = sc ? sc.scrollTop : 0;
        const ex = Array.from(seenKp).join(",");
        let fullUrl;
        if (opts.publicSeedPagination) {
          fullUrl =
            guestOnboardingSeedUrl(mediaType, tailAnchorOffset, GUEST_INITIAL_SEED_CHUNK) +
            "&exclude=" +
            encodeURIComponent(ex);
        } else {
          const sep = opts.tailSeedUrl.indexOf("?") >= 0 ? "&" : "?";
          fullUrl =
            opts.tailSeedUrl +
            sep +
            "exclude=" +
            encodeURIComponent(ex) +
            "&anchor_offset=" +
            encodeURIComponent(String(tailAnchorOffset));
        }
        let lastErr = null;
        try {
          for (let attempt = 0; attempt < 3; attempt++) {
            if (atLimit()) break;
            try {
              const sd = await deps.apiGet(fullUrl, { bypassCache: true, timeout: 20000 });
              await appendSeedItems((sd && sd.items) || [], "tail");
              if (opts.publicSeedPagination) {
                if (sd && sd.next_offset != null) {
                  tailAnchorOffset = Number(sd.next_offset) || tailAnchorOffset;
                }
                tailHasMore = !!(sd && sd.has_more);
              } else if (sd && sd.anchor_offset != null) {
                tailAnchorOffset = Number(sd.anchor_offset) || tailAnchorOffset;
                tailHasMore = !!(sd && sd.has_more);
              }
              paintGrid(scrollTop);
              bindTiles();
              bindTailScrollPrefetch();
              return;
            } catch (e) {
              lastErr = e;
              if (attempt < 2) {
                await new Promise(function (r) {
                  setTimeout(r, 1200 * (attempt + 1));
                });
              }
            }
          }
          if (lastErr) tailHasMore = false;
        } finally {
          tailLoading = false;
        }
      }

      async function appendSeedItems(batch, source) {
        let added = 0;
        batch.forEach(function (it) {
          if (!isPickerItemOk(it)) return;
          if (!it || it.kp_id == null) return;
          const sk = String(it.kp_id);
          if (seenKp.has(sk) || items.length >= maxTiles) return;
          seenKp.add(sk);
          items.push(it);
          added += 1;
        });
        if (added) {
          obClientLog(deps, "picker.seed.append", {
            source: source || "",
            added: added,
            total: items.length,
          });
        }
      }

      async function runSeedLoad() {
        obClientLog(deps, "picker.seed.load.start", { url: opts.seedUrl || "" });
        const grid = ov.querySelector("#ob-pick-grid");
        let timedOut = false;
        const timer = setTimeout(function () {
          timedOut = true;
          loadingSeed = false;
          loadSeedFailed = !items.length;
          obClientLog(deps, "picker.seed.timeout", { count: items.length });
          if (grid && !items.length) paintGrid(0);
        }, 70000);
        async function loadSeedUrl(url, source) {
          if (!url || timedOut) return;
          let lastErr = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            if (timedOut) return;
            obClientLog(deps, "picker.seed.request", {
              url: url,
              attempt: attempt + 1,
              source: source || "",
            });
            try {
              const sd = await deps.apiGet(url, { bypassCache: true, timeout: 65000 });
              const batch = (sd && sd.items) || [];
              obClientLog(deps, "picker.seed.response", {
                url: url,
                attempt: attempt + 1,
                batch: batch.length,
                success: sd && sd.success ? 1 : 0,
              });
              await appendSeedItems(batch, source || "seed");
              if (opts.publicSeedPagination && sd) {
                if (sd.next_offset != null) {
                  tailAnchorOffset = Number(sd.next_offset) || tailAnchorOffset;
                }
                tailHasMore = !!sd.has_more;
              } else if (sd && sd.has_more && opts.tailSeedUrl) {
                tailHasMore = true;
              }
              return;
            } catch (e) {
              lastErr = e;
              obClientLog(deps, "picker.seed.error", {
                url: url,
                attempt: attempt + 1,
                err: String((e && e.message) || e),
                status: e && e.status != null ? e.status : "",
              });
              if (attempt < 2) {
                await new Promise(function (r) {
                  setTimeout(r, 1200 * (attempt + 1));
                });
              }
            }
          }
          if (lastErr) throw lastErr;
        }
        try {
          await loadSeedUrl(opts.seedUrl, "primary");
          if (!items.length && opts.fallbackSeedUrl) {
            await loadSeedUrl(opts.fallbackSeedUrl, "fallback");
          }
          loadingSeed = false;
          loadSeedFailed = !items.length;
          obClientLog(deps, "picker.seed.load.done", {
            count: items.length,
            failed: loadSeedFailed ? 1 : 0,
          });
          if (!timedOut) {
            paintGrid(0);
            bindTiles();
            bindTailScrollPrefetch();
          }
          if (opts.tailSeedUrl && !timedOut && items.length) {
            tailAnchorOffset = 0;
            await loadTailPage();
          }
        } catch (_e) {
          loadingSeed = false;
          loadSeedFailed = !items.length;
          obClientLog(deps, "picker.seed.load.fail", { count: items.length });
          if (!timedOut) paintGrid(0);
        } finally {
          clearTimeout(timer);
        }
      }

      if (opts.seedUrl && !items.length) {
        void runSeedLoad();
      } else if (!items.length) {
        loadSeedFailed = true;
        paintGrid(0);
      }
    });
  }

  async function stepWeekendCarousel(deps, items, mediaType, opts) {
    if (!items || !items.length) return null;
    const o = opts || {};
    const premiereOnly = !!o.premiereOnly;
    const title = premiereOnly ? "Запланировать премьеру?" : "Что посмотреть на выходных?";
    const subtitle = premiereOnly
      ? "Выберите из отмеченных — если уже есть билеты, укажите дату сеанса"
      : "Выберите из того, что хотите посмотреть — создайте первый план";
    const cards = items
      .map(function (it, i) {
        const poster =
          (deps.normalizePosterUrl ? deps.normalizePosterUrl(it.poster, it.kp_id) : it.poster) ||
          deps.posterUrl(it.kp_id, "big");
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
      '<div class="mp-onboard-title">' +
      deps.escapeHtml(title) +
      "</div>" +
      '<p class="mp-onboard-text">' +
      deps.escapeHtml(subtitle) +
      "</p>" +
      '<div class="mp-onboard-weekend-rail">' +
      cards +
      "</div>" +
      '<button type="button" class="btn-primary btn-full" data-ob-continue disabled style="margin-top:16px">Продолжить</button>';
    let pickedIdx = -1;
    return showCenterDialog(deps, html, {
      showBack: false,
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

  async function mountPremierePicker(deps, opts) {
    const o = opts || {};
    let items = [];
    try {
      const data = await deps.apiGet("/api/site/premieres?period=upcoming", { bypassCache: true });
      items = ((data && data.items) || []).slice(0, 48);
    } catch (_e) {}
    const selected = new Set();
    items.forEach(function (p) {
      if (p.reminder_set) selected.add(String(p.kp_id));
    });

    function formatPremDate(raw) {
      if (!raw) return "";
      const s = String(raw).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const p = s.slice(0, 10).split("-");
        return p[2] + "." + p[1] + "." + p[0];
      }
      return s;
    }

    function buildWantItems() {
      return items
        .filter(function (p) {
          return selected.has(String(p.kp_id));
        })
        .map(function (p) {
          return {
            kp_id: p.kp_id,
            title: p.title,
            poster: p.poster || (deps.posterUrl ? deps.posterUrl(p.kp_id, "small") : ""),
            is_premiere: true,
          };
        });
    }

    return new Promise(function (resolve) {
      const ov = document.createElement("div");
      ov.className = "mp-onboard-picker-overlay" + (deps.isDesktop ? " mp-onboard--desktop" : "");
      ov.setAttribute("role", "dialog");
      ov.setAttribute("aria-modal", "true");

      function paintGrid() {
        const grid = ov.querySelector("#ob-prem-grid");
        if (!grid) return;
        if (!items.length) {
          grid.innerHTML =
            '<div class="center muted small" style="grid-column:1/-1;padding:24px 0">Пока нет ближайших премьер.</div>';
          return;
        }
        grid.innerHTML = items
          .map(function (p) {
            const kp = String(p.kp_id);
            const on = selected.has(kp);
            const poster = p.poster || (deps.posterUrl ? deps.posterUrl(p.kp_id, "small") : "");
            const fb = deps.posterUrl ? deps.posterUrl(p.kp_id, "small") : "";
            const pdate = formatPremDate(p.premiere_date);
            return (
              '<button type="button" class="movie-poster mp-onboard-pick-tile' +
              (on ? " mp-onboard-pick-tile--want" : "") +
              '" data-ob-prem-kp="' +
              deps.escapeHtml(kp) +
              '">' +
              '<div class="search-poster-media">' +
              '<img class="movie-poster-img" src="' +
              deps.escapeHtml(poster) +
              '" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'' +
              deps.escapeHtml(fb) +
              "'\">" +
              "</div>" +
              '<div class="movie-poster-body">' +
              '<div class="movie-poster-title">' +
              deps.escapeHtml(p.title || "—") +
              "</div>" +
              (pdate ? '<div class="movie-poster-meta">' + deps.escapeHtml(pdate) + "</div>" : "") +
              "</div></button>"
            );
          })
          .join("");
        bindTiles();
      }

      function bindTiles() {
        ov.querySelectorAll("[data-ob-prem-kp]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const kp = btn.getAttribute("data-ob-prem-kp") || "";
            if (!kp) return;
            deps.hapticImpact("light");
            if (selected.has(kp)) selected.delete(kp);
            else selected.add(kp);
            btn.classList.toggle("mp-onboard-pick-tile--want", selected.has(kp));
          });
        });
      }

      ov.innerHTML =
        (o.showBack !== false && !o.noBack
          ? '<button type="button" class="mp-onboard-back mp-onboard-picker-nav" id="ob-prem-back" aria-label="Назад">‹</button>'
          : "") +
        '<button type="button" class="mp-onboard-dismiss mp-onboard-picker-nav" id="ob-prem-x" aria-label="Закрыть">✕</button>' +
        '<div class="mp-onboard-picker-inner">' +
        '<div class="mp-onboard-picker-title">Премьеры</div>' +
        '<p class="mp-onboard-picker-sub muted small" style="text-align:center;margin:-6px 0 12px">Отметьте интересные премьеры.</p>' +
        '<div id="ob-prem-grid-wrap" class="mp-onboard-grid-wrap">' +
        '<div id="ob-prem-scroll" class="mp-onboard-grid-scroll">' +
        '<div id="ob-prem-grid" class="movies-grid mp-onboard-pick-grid mp-onboard-prem-grid--full"></div>' +
        "</div></div>" +
        '<button type="button" class="btn-primary btn-full mp-onboard-picker-confirm" id="ob-prem-continue">Продолжить</button>' +
        "</div>";

      deps.lockViewportScroll();
      document.body.appendChild(ov);
      paintGrid();

      ov.querySelector("#ob-prem-back")?.addEventListener("click", function () {
        deps.unlockViewportScroll();
        ov.remove();
        resolve({ __back: true });
      });
      ov.querySelector("#ob-prem-x")?.addEventListener("click", function () {
        deps.unlockViewportScroll();
        ov.remove();
        resolve(null);
      });
      ov.querySelector("#ob-prem-continue")?.addEventListener("click", async function () {
        const btn = ov.querySelector("#ob-prem-continue");
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Сохраняем…";
        }
        const prevReminded = new Set(
          items.filter(function (p) {
            return p.reminder_set;
          }).map(function (p) {
            return String(p.kp_id);
          }),
        );
        try {
          await Promise.all(
            Array.from(selected).map(function (kp) {
              if (prevReminded.has(kp)) return Promise.resolve();
              const row = items.find(function (p) {
                return String(p.kp_id) === kp;
              });
              return deps
                .apiPost("/api/site/premieres/" + kp + "/notify", {
                  premiere_date: (row && row.premiere_date) || undefined,
                  onboarding_free: true,
                })
                .catch(function () {});
            }),
          );
          await Promise.all(
            Array.from(prevReminded)
              .filter(function (kp) {
                return !selected.has(kp);
              })
              .map(function (kp) {
                return deps.api("/api/site/premieres/" + kp + "/notify", { method: "DELETE" }).catch(function () {});
              }),
          );
        } catch (_e) {}
        deps.unlockViewportScroll();
        ov.remove();
        resolve({ premiereWantItems: buildWantItems() });
      });
    });
  }

  async function stepPremierePicker(deps, opts) {
    const res = await mountPremierePicker(deps, opts);
    if (!res) return null;
    return res;
  }

  async function showEmptyLibraryModal(deps) {
    const html =
      '<div class="mp-onboard-title">К сожалению, сейчас в базе нет фильмов</div>' +
      '<p class="mp-onboard-text">Расскажите о ваших интересах или импортируйте вашу базу, тогда мы сможем формировать рекомендации для вас.</p>' +
      '<button type="button" class="btn-primary btn-full" data-ob-interests style="margin-top:14px">Расскажу об интересах</button>' +
      '<button type="button" class="btn-secondary btn-full" data-ob-import style="margin-top:10px">Импорт с Кинопоиска/IMDb/MyShows</button>';
    return showCenterDialog(deps, html, {
      backdropClose: true,
      bind: function (ov, close) {
        ov.querySelector("[data-ob-interests]")?.addEventListener("click", function () {
          close("interests");
        });
        ov.querySelector("[data-ob-import]")?.addEventListener("click", function () {
          close("import");
        });
      },
    });
  }

  async function saveInterest(deps, payload) {
    try {
      await deps.apiPost("/api/miniapp/onboarding/interest", payload);
    } catch (_e) {}
  }

  async function runFlow(deps, onComplete) {
    let st = readState();
    obClientLog(deps, "flow.start", {
      interests: st.interests ? st.interests.length : 0,
      dbSource: st.dbSource || "",
      pickerDone: st.pickerDone ? 1 : 0,
      genresDone: st.genresDone ? 1 : 0,
    });
    if (!st.interests && !st.interest) {
      const s1 = await stepInterest(deps);
      if (!s1) {
        await deps.markFirstOnboardingDoneAsync();
        clearState();
        if (onComplete) onComplete();
        return;
      }
      st.interests = s1.interests || [];
      st.otherText = s1.otherText || "";
      writeState(st);
    }

    const meta = getInterestMeta(st);
    const seedMediaType = meta.mediaType || "film";

    if (await maybeOfferImportWantPicker(deps, st, meta, seedMediaType)) {
      st = readState();
    }

    const importInProgress = await isOnboardingKpImportInProgress(deps, st);
    if (importInProgress) {
      beginOnboardingImportBgPoll(deps);
      obClientLog(deps, "flow.import-in-progress.skip-pickers", {});
    }

    async function runPickerBothPhases(watchedOpts) {
      const watched = await mountFilmPicker(deps, watchedOpts);
      if (isObBack(watched) || !watched) return watched;
      if (watched.phase === "done") return watched;
      if (watched.phase !== "want") return null;
      obClientLog(deps, "flow.want.open", {
        remaining: (watched.remainingItems || []).length,
        mediaType: watchedOpts.mediaType || "?",
      });
      let wantPick;
      try {
        wantPick = await mountFilmPicker(deps, {
          mode: "want",
          mediaType: watchedOpts.mediaType,
          initialItems: watched.remainingItems || [],
          tailSeedUrl: onboardingRatedTailUrl(watchedOpts.mediaType),
          showBack: false,
          preloadSimilarFrom: watched.watchedItems || [],
          excludeKpIds: (watched.watchedItems || []).map(function (it) {
            return it.kp_id;
          }),
          recommendedKps: watched.recommendedKps || [],
        });
      } catch (err) {
        obClientLog(deps, "flow.want.error", {
          err: String((err && err.message) || err).slice(0, 300),
          stack: String((err && err.stack) || "").slice(0, 500),
        });
        return null;
      }
      if (!wantPick || wantPick.phase !== "done") return null;
      return {
        phase: "done",
        wantItems: wantPick.wantItems || [],
        watchedItems: watched.watchedItems || [],
      };
    }

    if (st.fromProfileWand && meta.hasMedia && !st.pickerDone) {
      st.dbSource = "existing";
      writeState(st);
    }

    if (!importInProgress && meta.hasMedia && st.dbSource === "existing" && !st.pickerDone) {
      const ratingsN = await fetchOnboardingRatingsCount(deps);
      obClientLog(deps, "flow.existing.ratings", { count: ratingsN });
      if (ratingsN > SKIP_WATCHED_RATINGS_MIN) {
        const wantSeedUrl = onboardingImportWantUrl(seedMediaType);
        const seedItems = await prefetchOnboardSeed(deps, wantSeedUrl);
        const pick = await mountFilmPicker(deps, {
          mode: "import-want",
          mediaType: seedMediaType,
          initialItems: seedItems,
          seedUrl: seedItems.length ? null : wantSeedUrl,
          tailSeedUrl: onboardingRatedTailUrl(seedMediaType),
          showBack: false,
        });
        if (isObBack(pick)) {
          if (onComplete) onComplete();
          return;
        }
        if (!pick || pick.phase !== "done") {
          dismissAllOnboardingLayers(deps);
          if (onComplete) onComplete();
          return;
        }
        st.wantItems = pick.wantItems || [];
        st.watchedItems = [];
        void postBulkLibrary(deps, st);
        st.pickerDone = true;
        writeState(st);
      } else {
        const seedUrl = onboardingSeedUrl(seedMediaType, [], { excludeLibrary: true });
        const fallbackSeedUrl = onboardingSeedUrl(seedMediaType, []);
        const seedItems = await prefetchOnboardSeed(deps, seedUrl);
        const pick = await runPickerBothPhases({
          mode: "watched",
          mediaType: seedMediaType,
          initialItems: seedItems,
          seedUrl: seedItems.length ? null : seedUrl,
          fallbackSeedUrl: seedItems.length ? null : fallbackSeedUrl,
          tailSeedUrl: onboardingRatedTailUrl(seedMediaType),
          showBack: false,
        });
        if (isObBack(pick)) {
          if (onComplete) onComplete();
          return;
        }
        if (!pick || pick.phase !== "done") {
          dismissAllOnboardingLayers(deps);
          if (onComplete) onComplete();
          return;
        }
        st.wantItems = pick.wantItems || [];
        st.watchedItems = pick.watchedItems || [];
        void postBulkLibrary(deps, st);
        st.pickerDone = true;
        writeState(st);
      }
    }

    if (!meta.hasMedia && meta.hasPremieres && !st.premDone) {
      const prem = await stepPremierePicker(deps);
      if (isObBack(prem)) {
        delete st.interests;
        delete st.interest;
        delete st.otherText;
        writeState(st);
        return runFlow(deps, onComplete);
      }
      if (!prem) {
        dismissAllOnboardingLayers(deps);
        if (onComplete) onComplete();
        return;
      }
      st.premiereWantItems = (prem && prem.premiereWantItems) || [];
      st.premDone = true;
      writeState(st);
    }

    if (meta.hasMedia && st.dbSource == null) {
      const s2 = await stepDbSource(deps);
      if (!s2) {
        if (onComplete) onComplete();
        return;
      }
      if (isObBack(s2)) {
        delete st.interests;
        delete st.interest;
        delete st.otherText;
        writeState(st);
        return runFlow(deps, onComplete);
      }
      st.dbSource = s2.dbSource;
      st.dbOther = s2.dbOther || "";
      writeState(st);
    }

    if (
      meta.hasMedia &&
      (st.dbSource === "kp" || st.dbSource === "myshows" || st.dbSource === "imdb" || st.dbSource === "letterboxd") &&
      !st.importDone &&
      !st.importSkipped &&
      !st.importStarted
    ) {
      const importOpts =
        st.dbSource === "kp"
          ? { initialMode: "kp" }
          : {
              initialMode: "ext",
              extSource: st.dbSource === "myshows" ? "myshows" : st.dbSource === "letterboxd" ? "letterboxd" : "imdb",
              lockExtSource: true,
            };
      const imp = await stepImportChoice(deps, importOpts);
      if (isObBack(imp)) {
        st.dbSource = null;
        st.dbOther = "";
        writeState(st);
        return runFlow(deps, onComplete);
      }
      st.importPrompted = true;
      if (imp && (imp.importStarted || imp.continued)) {
        st.importStarted = true;
        st.awaitImportReturn = true;
        st.pendingImportWantPicker = false;
        st.importSkipped = false;
        st.coinsAdvance = Number(imp.coinsAdvance || 0);
        if (st.coinsAdvance > 0) st.coinsAdvanceShown = true;
        writeState(st);
        beginOnboardingImportBgPoll(deps);
      } else if (imp && imp.inlineDone) {
        st.importDone = (imp.imported || 0) > 0;
        st.importSkipped = !st.importDone;
        writeState(st);
        if (st.importDone && !st.coinsAdvanceShown) {
          await showCoinsModal(
            deps,
            '<p class="mp-onboard-text" style="margin-top:8px"><strong>+2000 монеток</strong> за импорт!</p>',
          );
        }
      } else if (imp && imp.skipped) {
        st.importSkipped = true;
        writeState(st);
      } else {
        st.importSkipped = true;
        writeState(st);
      }
    }

    const needsManualPicker =
      meta.hasMedia &&
      (st.dbSource === "none" || st.dbSource === "other" || st.importSkipped);

    if (!importInProgress && meta.hasMedia && st.importDone && !st.pickerDone) {
      const importSeedUrl = onboardingImportWantUrl(seedMediaType === "any" ? "any" : seedMediaType);
      const seedItems = await prefetchOnboardSeed(deps, importSeedUrl);
      const pick = await mountFilmPicker(deps, {
        mode: "import-want",
        mediaType: seedMediaType === "any" ? "any" : seedMediaType,
        initialItems: seedItems,
        seedUrl: seedItems.length ? null : importSeedUrl,
        tailSeedUrl: onboardingRatedTailUrl(seedMediaType),
        showBack: false,
      });
      if (!pick || pick.phase !== "done") {
        if (!pick) dismissAllOnboardingLayers(deps);
        if (onComplete) onComplete();
        return;
      }
      st.wantItems = pick.wantItems || [];
      void postBulkLibrary(deps, { watchedItems: [], wantItems: st.wantItems });
      st.pickerDone = true;
      writeState(st);
    }

    if (!importInProgress && needsManualPicker && !st.genresDone) {
      const genres = deps.WTW_GENRES_FALLBACK || [];
      const sg = await stepGenres(deps, genres);
      if (!sg) {
        if (onComplete) onComplete();
        return;
      }
      if (isObBack(sg)) {
        st.dbSource = null;
        st.dbOther = "";
        st.importPrompted = false;
        st.importSkipped = false;
        st.genresDone = false;
        delete st.genres;
        writeState(st);
        return runFlow(deps, onComplete);
      }
      st.genres = sg.genres || [];
      st.genresDone = true;
      writeState(st);
    }

    if (!importInProgress && needsManualPicker && st.genresDone && !st.pickerDone) {
      obClientLog(deps, "flow.picker.manual", {
        genres: (st.genres || []).length,
        mediaType: seedMediaType,
      });
      const seedUrl = onboardingSeedUrl(seedMediaType, st.genres);
      const seedItems = await prefetchOnboardSeed(deps, seedUrl);
      const pick = await runPickerBothPhases({
        mode: "watched",
        mediaType: seedMediaType,
        initialItems: seedItems,
        seedUrl: seedItems.length ? null : seedUrl,
        showBack: true,
      });
      if (isObBack(pick)) {
        st.genresDone = false;
        delete st.genres;
        writeState(st);
        dismissAllOnboardingLayers(deps);
        return runFlow(deps, onComplete);
      }
      if (!pick || pick.phase !== "done") {
        dismissAllOnboardingLayers(deps);
        if (onComplete) onComplete();
        return;
      }
      st.wantItems = pick.wantItems || [];
      st.watchedItems = pick.watchedItems || [];
      void postBulkLibrary(deps, st);
      st.pickerDone = true;
      writeState(st);
    }

    if (meta.hasPremieres && !st.premDone && st.pickerDone) {
      const prem = await stepPremierePicker(deps, { showBack: false });
      if (isObBack(prem)) {
        if (onComplete) onComplete();
        return;
      }
      if (!prem) {
        dismissAllOnboardingLayers(deps);
        if (onComplete) onComplete();
        return;
      }
      st.premiereWantItems = (prem && prem.premiereWantItems) || [];
      st.premDone = true;
      writeState(st);
    }

    if (importInProgress) {
      await handoffToCabinetAfterImport(deps, st, meta, onComplete);
      return;
    }

    if (isReadyForPlanPick(st, meta)) {
      await saveInterest(deps, buildInterestPayload(st, meta));
      const pool = buildWeekendPool(st).slice(0, 10);
      const premiereOnly = meta.hasPremieres && !meta.hasMedia;
      if (!pool.length) {
        await finishOnboardingTail(deps, st, meta, onComplete);
        return;
      }
      const film = await stepWeekendCarousel(deps, pool, seedMediaType, { premiereOnly: premiereOnly });
      if (isObBack(film)) {
        if (meta.hasPremieres && st.premDone) {
          st.premDone = false;
          st.premiereWantItems = [];
          writeState(st);
          return runFlow(deps, onComplete);
        }
        if (onComplete) onComplete();
        return;
      }
      if (film) {
        st.planFilm = film;
        writeState(st);
        await deps.markFirstOnboardingDoneAsync();
        if (deps.markOnboardingSessionComplete) deps.markOnboardingSessionComplete();
        clearState();
        if (onComplete) onComplete();
        const q =
          "?onboard=1" +
          (film.kp_id ? "&kp=" + encodeURIComponent(String(film.kp_id)) : "") +
          (film.title ? "&title=" + encodeURIComponent(film.title) : "");
        const planRoute = film.is_premiere ? "/plan/cinema" : "/plan/home";
        deps.navigate(planRoute + q);
        return;
      }
      await dismissPlanPickToHome(deps, st, meta, onComplete);
      return;
    }

    await finishOnboardingTail(deps, st, meta, onComplete);
  }

  global.__mpMountFullOnboarding = function (deps, onComplete) {
    deps = resolveOnboardingDeps(deps);
    (async function () {
      const st = readState();
      if (!st.bootstrapFromEmpty && !st.skipIntroCarousel) {
        await mountIntroCarousel(deps);
      }
      await runFlow(deps, onComplete);
    })().catch(function (err) {
      obClientLog(deps, "flow.crash", {
        err: String((err && err.message) || err).slice(0, 300),
        stack: String((err && err.stack) || "").slice(0, 500),
      });
    });
  };

  global.__mpMountExtendedOnboarding = function (deps, onComplete) {
    deps = resolveOnboardingDeps(deps);
    Promise.resolve(runFlow(deps, onComplete)).catch(function (err) {
      obClientLog(deps, "flow.crash", { err: String((err && err.message) || err).slice(0, 300) });
    });
  };

  global.__mpStartProfileOnboarding = function (deps, onComplete) {
    deps = resolveOnboardingDeps(deps);
    clearState();
    writeState({ fromProfileWand: true, skipIntroCarousel: true });
    Promise.resolve(runFlow(deps, onComplete || function () {})).catch(function (err) {
      obClientLog(deps, "flow.crash", { err: String((err && err.message) || err).slice(0, 300) });
    });
  };

  global.__mpShowEmptyLibraryBootstrap = async function (deps, onComplete) {
    deps = resolveOnboardingDeps(deps);
    const choice = await showEmptyLibraryModal(deps);
    if (choice === "interests") {
      clearState();
      writeState({ bootstrapFromEmpty: true });
      void runFlow(deps, onComplete || function () {});
      return;
    }
    if (choice === "import") {
      const imp = await stepImportChoice(deps);
      if (imp && imp.inlineDone && imp.imported > 0) {
        await showCoinsModal(
          deps,
          '<p class="mp-onboard-text" style="margin-top:8px"><strong>+2000 монеток</strong> за импорт!</p>',
        );
      }
    }
    if (typeof onComplete === "function") onComplete();
  };

  global.__mpShowLowUnwatchedBootstrap = async function (deps, opts, onComplete) {
    deps = resolveOnboardingDeps(deps);
    opts = opts || {};
    const unwatchedCount = Number(opts.unwatchedCount) || 0;
    const introHtml =
      '<div class="mp-onboard-title">Мало непросмотренных</div>' +
      '<p class="mp-onboard-text">Подбор берёт фильмы из <strong>непросмотренных</strong> в вашей базе — сейчас их ' +
      String(unwatchedCount) +
      ", нужно хотя бы " +
      String(UNWATCHED_RANDOM_MIN) +
      ".</p>" +
      '<p class="mp-onboard-text">Отметьте <strong>не меньше ' +
      String(WANT_BOOTSTRAP_MIN) +
      '</strong> фильмов, которые <em class="mp-onboard-em">хотите посмотреть</em>. Подберём похожие на ваши высокие оценки.</p>' +
      '<button type="button" class="btn-primary btn-full" data-ob-continue style="margin-top:14px">Выбрать фильмы</button>';
    const go = await showCenterDialog(deps, introHtml, {
      backdropClose: true,
      bind: function (ov, close) {
        ov.querySelector("[data-ob-continue]")?.addEventListener("click", function () {
          close(true);
        });
      },
    });
    if (!go) {
      if (typeof onComplete === "function") onComplete(false);
      return;
    }
    const importSeedUrl = onboardingImportWantUrl("any");
    const seedItems = await prefetchOnboardSeed(deps, importSeedUrl);
    if (!seedItems.length) {
      await showCenterDialog(
        deps,
        '<div class="mp-onboard-title">Пока нечего предложить</div>' +
          '<p class="mp-onboard-text">Поставьте оценки нескольким фильмам или импортируйте базу — тогда подберём рекомендации.</p>' +
          '<button type="button" class="btn-primary btn-full" data-ob-close="ok" style="margin-top:14px">Понятно</button>',
        {},
      );
      if (typeof onComplete === "function") onComplete(false);
      return;
    }
    const pick = await mountFilmPicker(deps, {
      mode: "import-want",
      mediaType: "any",
      initialItems: seedItems,
      seedUrl: null,
      tailSeedUrl: onboardingRatedTailUrl("any"),
      showBack: false,
      minSelection: WANT_BOOTSTRAP_MIN,
      subtitleHtml:
        '<p class="mp-onboard-text" style="margin:0 0 10px;text-align:center">Рекомендации по вашим высоким оценкам — отметьте, что хотите посмотреть</p>',
    });
    if (!pick || pick.phase !== "done" || !(pick.wantItems || []).length) {
      if (typeof onComplete === "function") onComplete(false);
      return;
    }
    await postBulkLibrary(deps, { wantItems: pick.wantItems || [], watchedItems: [] });
    if (typeof onComplete === "function") onComplete(true);
  };

  global.__mpStartInterestBootstrap = function (deps, onComplete) {
    deps = resolveOnboardingDeps(deps);
    clearState();
    writeState({ bootstrapFromEmpty: true });
    void runFlow(deps, onComplete || function () {});
  };

  global.__mpOnboardingImportFinished = async function (deps, imported) {
    deps = resolveOnboardingDeps(deps);
    const st = readState();
    if (!st.importPrompted && !st.importStarted) return;
    st.importDone = !!imported;
    st.importSkipped = !imported;
    st.pendingImportWantPicker = !!imported;
    st.awaitImportReturn = false;
    writeState(st);
    if (imported && !st.coinsAdvanceShown) {
      await showCoinsModal(
        deps,
        '<p class="mp-onboard-text" style="margin-top:8px"><strong>+2000 монеток</strong> за импорт!</p>',
      );
      st.coinsAdvanceShown = true;
      writeState(st);
    }
    void runFlow(deps, function () {});
  };

  global.__mpOnboardingImportBgPoll = function (deps) {
    beginOnboardingImportBgPoll(resolveOnboardingDeps(deps));
  };

  global.__mpShowOnboardingCoinsAfterPlan = async function (deps, amount, onDone) {
    deps = resolveOnboardingDeps(deps);
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
        '<button type="button" class="btn-primary btn-full" data-ob-close="ok" style="margin-top:16px">Понятно</button>',
      {},
    );
    if (typeof onDone === "function") onDone();
  };

  async function stepGuestRegisterPrompt(deps) {
    return showCenterDialog(
      deps,
      '<div class="mp-onboard-title">Поздравляем, вы уже начали вести вашу базу!</div>' +
        '<p class="mp-onboard-text">Зарегистрируйтесь, чтобы продолжить</p>' +
        '<button type="button" class="btn-primary btn-full" data-ob-guest-register style="margin-top:14px">Зарегистрироваться</button>',
      {
        backdropClose: false,
        bind: function (ov, close) {
          ov.querySelector("[data-ob-guest-register]")?.addEventListener("click", function () {
            close({ register: true });
          });
        },
      },
    );
  }

  async function stepGuestAuthForImport(deps) {
    return showCenterDialog(
      deps,
      '<div class="mp-onboard-title">Войдите или зарегистрируйтесь</div>' +
        '<p class="mp-onboard-text">Чтобы импортировать базу, нужен личный кабинет</p>' +
        '<button type="button" class="btn-primary btn-full" data-ob-guest-auth-reg style="margin-top:14px">Зарегистрироваться</button>' +
        '<button type="button" class="btn-secondary btn-full" data-ob-guest-auth-login style="margin-top:10px">Войти</button>',
      {
        backdropClose: true,
        bind: function (ov, close) {
          ov.querySelector("[data-ob-guest-auth-reg]")?.addEventListener("click", function () {
            close({ register: true });
          });
          ov.querySelector("[data-ob-guest-auth-login]")?.addEventListener("click", function () {
            close({ login: true });
          });
        },
      },
    );
  }

  async function runGuestOnboardingFlow(deps, onComplete) {
    if (deps.isAuthed && deps.isAuthed()) {
      void runFlow(deps, onComplete);
      return;
    }
    obClientLog(deps, "guest.flow.start", {});
    const s1 = await stepInterest(deps);
    if (!s1) {
      if (onComplete) onComplete();
      return;
    }
    const interests = s1.interests || [];
    const otherText = s1.otherText || "";
    const meta = getInterestMeta({ interests: interests, otherText: otherText });
    const seedMediaType = meta.mediaType || "film";

    if (!meta.hasMedia && meta.hasPremieres) {
      // Только премьеры: регистрация → premiere picker (без принудительных фильмов/сериалов)
      const regPrompt = await stepGuestRegisterPrompt(deps);
      if (!regPrompt || !regPrompt.register) {
        if (onComplete) onComplete();
        return;
      }
      writeGuestState({
        path: "premieres",
        pendingResume: true,
        interests: interests,
        otherText: otherText,
        dbSource: "none",
        dbOther: "",
        mediaType: "film",
      });
      try {
        sessionStorage.setItem("mp_guest_auth_via", "register");
      } catch (_e0) {}
      if (typeof deps.openRegisterModal === "function") {
        deps.openRegisterModal();
      }
      if (onComplete) onComplete();
      return;
    }

    const s2 = await stepDbSource(deps);
    if (!s2 || isObBack(s2)) {
      if (onComplete) onComplete();
      return;
    }
    const dbSource = s2.dbSource;
    const dbOther = s2.dbOther || "";

    if (dbSource === "kp" || dbSource === "myshows" || dbSource === "imdb" || dbSource === "letterboxd") {
      const authChoice = await stepGuestAuthForImport(deps);
      if (!authChoice) {
        if (onComplete) onComplete();
        return;
      }
      writeGuestState({
        path: "import",
        pendingResume: true,
        interests: interests,
        otherText: otherText,
        dbSource: dbSource,
        dbOther: dbOther,
        mediaType: seedMediaType,
        authIntent: authChoice.register ? "register" : "login",
      });
      try {
        sessionStorage.setItem("mp_guest_auth_via", authChoice.register ? "register" : "login");
      } catch (_e) {}
      if (authChoice.register && typeof deps.openRegisterModal === "function") {
        deps.openRegisterModal();
      } else if (typeof deps.openLoginModal === "function") {
        deps.openLoginModal();
      }
      if (onComplete) onComplete();
      return;
    }

    if (dbSource !== "none" && dbSource !== "other") {
      if (onComplete) onComplete();
      return;
    }

    const guestSeedUrl = guestOnboardingSeedUrl(seedMediaType, 0, GUEST_INITIAL_SEED_CHUNK);
    const watchedPick = await mountFilmPicker(deps, {
      mode: "watched",
      mediaType: seedMediaType,
      seedUrl: guestSeedUrl,
      tailSeedUrl: guestSeedUrl,
      publicSeedPagination: true,
      usePublicApi: true,
      maxSimilarLoads: GUEST_MAX_SIMILAR_LOADS,
      maxTiles: MAX_TILES,
      guestAfterWatched: true,
      showBack: true,
      confirmLabel: "Продолжить",
    });
    if (!watchedPick || watchedPick.phase !== "guest-auth" || !(watchedPick.watchedItems || []).length) {
      if (onComplete) onComplete();
      return;
    }

    const regPrompt = await stepGuestRegisterPrompt(deps);
    if (!regPrompt || !regPrompt.register) {
      if (onComplete) onComplete();
      return;
    }

    writeGuestState({
      path: "watched",
      pendingResume: true,
      interests: interests,
      otherText: otherText,
      dbSource: dbSource,
      dbOther: dbOther,
      mediaType: seedMediaType,
      watchedItems: watchedPick.watchedItems || [],
      remainingItems: watchedPick.remainingItems || [],
      recommendedKps: watchedPick.recommendedKps || [],
    });
    try {
      sessionStorage.setItem("mp_guest_auth_via", "register");
    } catch (_e2) {}
    if (typeof deps.openRegisterModal === "function") {
      deps.openRegisterModal();
    }
    if (onComplete) onComplete();
  }

  global.__mpMountGuestOnboarding = function (deps, onComplete) {
    deps = resolveOnboardingDeps(deps);
    Promise.resolve(runGuestOnboardingFlow(deps, onComplete || function () {})).catch(function (err) {
      obClientLog(deps, "guest.flow.crash", {
        err: String((err && err.message) || err).slice(0, 300),
      });
    });
  };

  global.__mpResumeGuestOnboardingAfterAuth = async function (deps, opts) {
    deps = resolveOnboardingDeps(deps);
    opts = opts || {};
    const gst = readGuestState();
    if (!gst || !gst.pendingResume) return false;

    const authVia = opts.authVia || "login";
    const isNewReg = authVia === "register";

    if (gst.path === "premieres") {
      clearGuestState();
      if (!isNewReg) {
        return false;
      }
      clearState();
      writeState({
        interests: gst.interests || [],
        otherText: gst.otherText || "",
        dbSource: "none",
        dbOther: "",
        skipIntroCarousel: true,
      });
      void saveInterest(deps, {
        interests: gst.interests || [],
        other_text: gst.otherText || "",
        db_source: "none",
        db_other: "",
      });
      void runFlow(deps, function () {});
      return true;
    }

    if (gst.path === "import") {
      clearGuestState();
      if (!isNewReg) {
        return false;
      }
      clearState();
      writeState({
        interests: gst.interests || [],
        otherText: gst.otherText || "",
        dbSource: gst.dbSource,
        dbOther: gst.dbOther || "",
        skipIntroCarousel: true,
      });
      void saveInterest(deps, {
        interests: gst.interests || [],
        other_text: gst.otherText || "",
        db_source: gst.dbSource,
        db_other: gst.dbOther || "",
      });
      void runFlow(deps, function () {});
      return true;
    }

    if (gst.path === "watched" && (gst.watchedItems || []).length) {
      const mediaType = gst.mediaType || "film";
      await postBulkLibrary(deps, {
        watchedItems: gst.watchedItems,
        wantItems: [],
      });
      const wantPick = await mountFilmPicker(deps, {
        mode: "want",
        mediaType: mediaType,
        initialItems: gst.remainingItems || [],
        seedUrl: (gst.remainingItems || []).length
          ? null
          : onboardingSeedUrl(mediaType, [], { excludeLibrary: true }),
        fallbackSeedUrl: onboardingSeedUrl(mediaType, []),
        tailSeedUrl: onboardingRatedTailUrl(mediaType),
        showBack: false,
        excludeKpIds: (gst.watchedItems || []).map(function (it) {
          return it.kp_id;
        }),
        preloadSimilarFrom: gst.watchedItems || [],
        recommendedKps: gst.recommendedKps || [],
      });
      if (wantPick && wantPick.phase === "done") {
        await postBulkLibrary(deps, {
          watchedItems: gst.watchedItems,
          wantItems: wantPick.wantItems || [],
        });
      }
      void saveInterest(deps, {
        interests: gst.interests || [],
        other_text: gst.otherText || "",
        db_source: gst.dbSource || "none",
        db_other: gst.dbOther || "",
      });
      await deps.markFirstOnboardingDoneAsync();
      clearGuestState();
      clearState();
      if (typeof global.__mpCompleteOnboardHandoff === "function") {
        global.__mpCompleteOnboardHandoff({ reason: "guest_watched" });
      } else {
        try {
          sessionStorage.setItem("mp_force_home_tour", "1");
          sessionStorage.setItem("mp_force_friends_invite", "1");
        } catch (_eTour) {}
      }
      return true;
    }

    clearGuestState();
    return false;
  };
})(window);
