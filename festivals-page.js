/**
 * Фестивали — индекс и страница фестиваля внутри «Смотреть».
 * Маршруты: /whattowatch/festivals , /whattowatch/festivals/:slug
 * Данные: MpFestivalsMock (пока нет public API).
 */
(function (global) {
  "use strict";

  var SEO = {
    title: "Фестивали — Movie Planner",
    description: "Кинофестивали в Movie Planner: что идёт и что скоро, программа, подписка и фильмы в базе.",
    path: "/whattowatch/festivals",
    canonical: "https://movie-planner.ru/whattowatch/festivals",
  };

  var SUBS_KEY = "mp_festival_subs_v1";
  var REMIND_KEY = "mp_festival_remind_v1";
  var FROM_PREMIERES_KEY = "mp_fest_from_premieres";

  function esc(s) {
    if (global.escapeHtml) return global.escapeHtml(s);
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function mock() {
    return global.MpFestivalsMock || null;
  }

  function toast(msg, opts) {
    if (global.showToast) global.showToast(msg, opts);
  }

  function hasSiteAuth() {
    try {
      if (typeof global.getToken === "function" && global.getToken()) return true;
      var active = localStorage.getItem("mp_site_active_chat_id");
      var sessions = JSON.parse(localStorage.getItem("mp_site_sessions") || "[]");
      if (Array.isArray(sessions)) {
        for (var i = 0; i < sessions.length; i++) {
          if (sessions[i] && sessions[i].token && (!active || String(sessions[i].chat_id) === String(active))) {
            return true;
          }
        }
        for (var j = 0; j < sessions.length; j++) {
          if (sessions[j] && sessions[j].token) return true;
        }
      }
      return !!localStorage.getItem("mp_site_token");
    } catch (_) {
      return false;
    }
  }

  function applyIndexSeo() {
    try {
      document.title = SEO.title;
      var meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute("content", SEO.description);
      var canon = document.querySelector('link[rel="canonical"]');
      if (canon) canon.setAttribute("href", SEO.canonical);
    } catch (_) {}
  }

  function applyDetailSeo(fest) {
    try {
      var name = fest && fest.title ? fest.title : "Фестиваль";
      document.title = name + " — Фестивали · Movie Planner";
      var canon = document.querySelector('link[rel="canonical"]');
      if (canon && fest && fest.slug) {
        canon.setAttribute("href", "https://movie-planner.ru/whattowatch/festivals/" + encodeURIComponent(fest.slug));
      }
    } catch (_) {}
  }

  function readSubs() {
    try {
      var raw = localStorage.getItem(SUBS_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function writeSubs(list) {
    try {
      localStorage.setItem(SUBS_KEY, JSON.stringify(list || []));
    } catch (_) {}
  }

  function isSubscribed(slug) {
    var key = String(slug || "");
    return readSubs().indexOf(key) >= 0;
  }

  function toggleSubscribe(slug) {
    var key = String(slug || "");
    if (!key) return false;
    var list = readSubs();
    var i = list.indexOf(key);
    if (i >= 0) list.splice(i, 1);
    else list.push(key);
    writeSubs(list);
    return list.indexOf(key) >= 0;
  }

  function readReminds() {
    try {
      var raw = localStorage.getItem(REMIND_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function writeReminds(list) {
    try {
      localStorage.setItem(REMIND_KEY, JSON.stringify(list || []));
    } catch (_) {}
  }

  function toggleRemind(key) {
    var id = String(key || "");
    if (!id) return false;
    var list = readReminds();
    var i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    writeReminds(list);
    return list.indexOf(id) >= 0;
  }

  function markFromPremieres() {
    try { sessionStorage.setItem(FROM_PREMIERES_KEY, "1"); } catch (_) {}
  }

  function consumeFromPremieres() {
    try {
      var on = sessionStorage.getItem(FROM_PREMIERES_KEY) === "1";
      sessionStorage.removeItem(FROM_PREMIERES_KEY);
      return on;
    } catch (_) {
      return false;
    }
  }

  function openFestival(slug) {
    var onPremieres = false;
    try {
      var path = (window.location.pathname || "").replace(/\/$/, "") || "/";
      onPremieres = path === "/premieres";
    } catch (_) {}
    if (onPremieres) markFromPremieres();
    if (typeof global.__mpWtwOpenFestivalSlug === "function") {
      global.__mpWtwOpenFestivalSlug(slug);
      return;
    }
    window.location.href = "/whattowatch/festivals/" + encodeURIComponent(slug);
  }

  function backToIndex() {
    if (consumeFromPremieres()) {
      if (typeof global.__mpPremieresOpenHub === "function") {
        global.__mpPremieresOpenHub("festivals");
        return;
      }
      window.location.href = "/premieres#festivals";
      return;
    }
    if (typeof global.__mpWtwFestivalsBack === "function") {
      global.__mpWtwFestivalsBack();
      return;
    }
    window.location.href = "/whattowatch/festivals";
  }

  function filmHref(kp) {
    if (!kp) return "";
    return "/f/" + encodeURIComponent(String(kp));
  }

  function newsStripHtml(news, heading) {
    if (!news || !news.length) return "";
    var cards = news.map(function (n) {
      var cover = n.cover
        ? '<img class="fest-news-cover" src="' + esc(n.cover) + '" alt="" loading="lazy">'
        : '<span class="fest-news-cover fest-news-cover--empty" aria-hidden="true"></span>';
      var open = n.festival_slug
        ? ' data-fest-open="' + esc(n.festival_slug) + '"'
        : "";
      return '<button type="button" class="fest-news-card"' + open + ">"
        + cover
        + '<span class="fest-news-copy"><span class="fest-news-title">' + esc(n.title) + "</span>"
        + (n.festival_title ? '<span class="fest-news-meta">' + esc(n.festival_title) + "</span>" : "")
        + "</span></button>";
    }).join("");
    return '<section class="fest-news" aria-label="' + esc(heading || "Новости фестивалей") + '">'
      + '<h2 class="fest-block-title">' + esc(heading || "Новости") + "</h2>"
      + '<div class="fest-news-rail fest-detail-news-rail">' + cards + "</div></section>";
  }

  function scheduleRowHtml(f, muted) {
    return '<button type="button" class="fest-sched-row' + (muted ? " is-past" : "") + '" data-fest-open="' + esc(f.slug) + '">'
      + (f.cover ? '<img class="fest-sched-cover" src="' + esc(f.cover) + '" alt="" loading="lazy">' : '<span class="fest-sched-cover fest-sched-cover--empty" aria-hidden="true"></span>')
      + '<span class="fest-sched-copy">'
      + '<span class="fest-sched-title">' + esc(f.title) + "</span>"
      + '<span class="fest-sched-meta">' + esc([f.dates_label, f.place_label].filter(Boolean).join(" · ")) + "</span>"
      + "</span>"
      + '<span class="fest-status fest-status--' + esc(f.status) + '">' + esc(f.status_label) + "</span>"
      + "</button>";
  }

  function scheduleHtml(groups) {
    var upcoming = (groups && groups.upcoming) || [];
    var past = (groups && groups.past) || [];
    var body = "";
    if (upcoming.length) {
      body += '<h3 class="fest-sched-head">Ближайшие</h3>'
        + '<div class="fest-sched-list">' + upcoming.map(function (f) { return scheduleRowHtml(f, false); }).join("") + "</div>";
    }
    if (past.length) {
      body += '<h3 class="fest-sched-head">Прошедшие</h3>'
        + '<div class="fest-sched-list fest-sched-list--past">' + past.map(function (f) { return scheduleRowHtml(f, true); }).join("") + "</div>";
    }
    if (!body) body = '<p class="cabinet-hint">Пока нет фестивалей в афише.</p>';
    return '<section class="fest-schedule" aria-label="График фестивалей">'
      + '<h2 class="fest-block-title">График</h2>' + body + "</section>";
  }

  function subsHtml() {
    var subs = readSubs();
    if (!subs.length) return "";
    var data = mock();
    var rows = subs.map(function (slug) {
      var f = data && data.getFestival ? data.getFestival(slug) : null;
      if (!f) return "";
      return scheduleRowHtml(f, f.status === "past");
    }).filter(Boolean).join("");
    if (!rows) return "";
    return '<section class="fest-subs" aria-label="Подписки">'
      + '<h2 class="fest-block-title">Подписки</h2>'
      + '<div class="fest-sched-list">' + rows + "</div></section>";
  }

  function bindOpen(root) {
    if (!root) return;
    root.querySelectorAll("[data-fest-open]").forEach(function (el) {
      el.addEventListener("click", function () {
        var slug = el.getAttribute("data-fest-open");
        if (slug) openFestival(slug);
      });
    });
  }

  function renderIndex(root, opts) {
    if (!root) return;
    var options = opts || {};
    var data = mock();
    if (!data) {
      root.innerHTML = '<div class="festivals-page"><p class="cabinet-hint">Не удалось загрузить афишу фестивалей.</p></div>';
      return;
    }
    if (!options.skipSeo) applyIndexSeo();
    var news = data.newsFeed();
    var groups = data.scheduleGroups();
    root.innerHTML = '<div class="festivals-page festivals-page--index">'
      + newsStripHtml(news, "Новости")
      + subsHtml()
      + scheduleHtml(groups)
      + "</div>";
    bindOpen(root);
  }

  function screeningLabel(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (!t) return "";
    var d = new Date(t);
    var day = d.getDate();
    var months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    var hh = d.getHours();
    var mm = d.getMinutes();
    var hhS = (hh < 10 ? "0" : "") + hh;
    var mmS = (mm < 10 ? "0" : "") + mm;
    return day + " " + months[d.getMonth()] + ", " + hhS + ":" + mmS;
  }

  function remindKey(fest, it) {
    return String(fest.slug || "") + ":" + String((it && (it.kp_id || it.title)) || "");
  }

  function programItemHtml(fest, it) {
    var kp = it && it.kp_id ? String(it.kp_id).trim() : "";
    var href = filmHref(kp);
    var title = esc((it && it.title) || "Без названия");
    var metaBits = [];
    if (it && it.director) metaBits.push("Режиссёр " + it.director);
    if (it && it.venue) metaBits.push(it.venue);
    if (it && it.year) metaBits.push(String(it.year));
    var when = screeningLabel(it && it.screening_at);
    if (when) metaBits.push(when);
    var meta = metaBits.length ? '<span class="fest-prog-meta">' + esc(metaBits.join(" · ")) + "</span>" : "";
    var titleHtml = href
      ? '<a class="fest-prog-title" href="' + esc(href) + '">' + title + "</a>"
      : '<span class="fest-prog-title">' + title + "</span>";
    var poster = (it && it.poster)
      ? '<img class="fest-prog-poster" src="' + esc(it.poster) + '" alt="" loading="lazy">'
      : "";
    var rk = remindKey(fest, it);
    var reminded = readReminds().indexOf(rk) >= 0;
    var actions = "";
    if (kp) {
      actions += '<button type="button" class="btn btn-primary btn-small" data-fest-add="' + esc(kp) + '">В базу</button>';
    }
    actions += '<button type="button" class="btn btn-secondary btn-small" data-fest-remind="' + esc(rk) + '">'
      + (reminded ? "Напомню" : "Напомнить") + "</button>";
    return '<article class="fest-prog-item">'
      + poster
      + '<div class="fest-prog-copy">' + titleHtml + meta + "</div>"
      + '<div class="fest-prog-actions">' + actions + "</div>"
      + "</article>";
  }

  function programHtml(fest) {
    var sections = (fest && fest.program) || [];
    if (!sections.length) return "";
    var blocks = sections.map(function (sec) {
      var items = (sec.items || []).map(function (it) { return programItemHtml(fest, it); }).join("");
      return '<section class="fest-prog-section">'
        + (sec.section ? '<h3 class="fest-prog-section-title">' + esc(sec.section) + "</h3>" : "")
        + '<div class="fest-prog-list">' + items + "</div></section>";
    }).join("");
    var kpCount = 0;
    sections.forEach(function (sec) {
      (sec.items || []).forEach(function (it) { if (it && it.kp_id) kpCount += 1; });
    });
    var bulk = kpCount
      ? '<div class="fest-bulk-actions"><button type="button" class="btn btn-primary" data-fest-add-all="1">В базу</button></div>'
      : "";
    return '<section class="fest-program" aria-label="Программа">'
      + '<h2 class="fest-block-title">Программа</h2>' + bulk + blocks + "</section>";
  }

  function coversHtml(fest) {
    var shots = (fest.covers && fest.covers.length) ? fest.covers : (fest.cover ? [fest.cover] : []);
    if (!shots.length) return "";
    return '<section class="fest-covers" aria-label="Обложки">'
      + '<h2 class="fest-block-title">Обложки</h2>'
      + '<div class="fest-covers-rail">'
      + shots.map(function (src) {
        return '<img class="fest-cover-shot" src="' + esc(src) + '" alt="" loading="lazy">';
      }).join("")
      + "</div></section>";
  }

  function peopleHtml(fest) {
    var rows = fest.participants || [];
    if (!rows.length) return "";
    return '<section class="fest-people" aria-label="Участники">'
      + '<h2 class="fest-block-title">Участники</h2>'
      + '<div class="fest-people-list">'
      + rows.map(function (p) {
        return '<div class="fest-people-row"><span class="fest-people-name">' + esc(p.name || "")
          + '</span><span class="fest-people-role">' + esc(p.role || "") + "</span></div>";
      }).join("")
      + "</div></section>";
  }

  function infoHtml(fest) {
    var site = fest.official_url
      ? '<a href="' + esc(fest.official_url) + '" target="_blank" rel="noopener noreferrer">Сайт</a>'
      : "";
    return '<section class="fest-about">'
      + '<h2 class="fest-block-title">О фестивале</h2>'
      + '<dl class="fest-info-list">'
      + (fest.dates_label ? "<div><dt>Даты</dt><dd>" + esc(fest.dates_label) + "</dd></div>" : "")
      + (fest.place_label ? "<div><dt>Город</dt><dd>" + esc(fest.place_label) + "</dd></div>" : "")
      + (site ? "<div><dt>Ссылка</dt><dd>" + site + "</dd></div>" : "")
      + "</dl>"
      + (fest.description ? '<p class="fest-about-text">' + esc(fest.description) + "</p>" : "")
      + "</section>";
  }

  function heroHtml(fest, subscribed) {
    var cover = fest.cover
      ? '<img class="fest-hero-cover" src="' + esc(fest.cover) + '" alt="">'
      : '<div class="fest-hero-cover fest-hero-cover--empty" aria-hidden="true"></div>';
    var bits = [fest.dates_label, fest.place_label].filter(Boolean);
    var subLabel = subscribed ? "Вы подписаны" : "Подписаться";
    var subClass = subscribed ? "btn btn-secondary" : "btn btn-primary";
    var share = '<button type="button" class="btn btn-secondary" data-fest-share="1">Ссылка</button>';
    var official = fest.official_url
      ? '<a class="btn btn-secondary" href="' + esc(fest.official_url) + '" target="_blank" rel="noopener noreferrer">Сайт</a>'
      : "";
    var coll = fest.collection_code
      ? '<a class="btn btn-secondary" href="/whattowatch/collections/' + encodeURIComponent(fest.collection_code) + '">Коллекция</a>'
      : "";
    return '<header class="fest-hero">'
      + cover
      + '<div class="fest-hero-body">'
      + '<button type="button" class="fest-back" data-fest-back="1">← Фестивали</button>'
      + '<p class="fest-hero-kicker"><span class="fest-status fest-status--' + esc(fest.status) + '">' + esc(fest.status_label) + "</span></p>"
      + '<h1 class="fest-hero-title">' + esc(fest.title) + "</h1>"
      + (bits.length ? '<p class="fest-hero-meta">' + esc(bits.join(" · ")) + "</p>" : "")
      + '<div class="fest-hero-actions">'
      + '<button type="button" class="' + subClass + '" data-fest-subscribe="' + esc(fest.slug) + '">' + esc(subLabel) + "</button>"
      + share + official + coll
      + "</div></div></header>";
  }

  function addFilmToBase(kp, btn) {
    if (!hasSiteAuth()) {
      if (typeof global.requireAuthForAction === "function") {
        global.requireAuthForAction("Войдите, чтобы добавить фильм в базу");
      } else {
        toast("Фильм в базе на этом устройстве появится после входа.");
      }
      return;
    }
    if (typeof global.api !== "function") {
      toast("Фильм отмечен. API базы подключим отдельно.");
      if (btn) {
        btn.textContent = "В базе";
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-secondary");
      }
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Добавляем…";
    }
    global.api("/api/site/add-film", { method: "POST", body: JSON.stringify({ kp_id: kp }) })
      .then(function (r) {
        if (r && r.success) {
          toast("Фильм в базе");
          if (btn) {
            btn.textContent = "В базе";
            btn.classList.remove("btn-primary");
            btn.classList.add("btn-secondary");
          }
        } else {
          toast((r && (r.error || r.message)) || "Не удалось добавить фильм.", { type: "error" });
          if (btn) {
            btn.disabled = false;
            btn.textContent = "В базу";
          }
        }
      })
      .catch(function () {
        toast("Ошибка сети. Не удалось добавить фильм.", { type: "error" });
        if (btn) {
          btn.disabled = false;
          btn.textContent = "В базу";
        }
      });
  }

  function shareFestival(fest) {
    var url = "https://movie-planner.ru/whattowatch/festivals/" + encodeURIComponent(fest.slug);
    var title = fest.title || "Фестиваль";
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () {});
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          toast("Ссылка скопирована");
        }).catch(function () {
          toast(url);
        });
        return;
      }
    } catch (_) {}
    toast(url);
  }

  function bindDetail(root, fest) {
    if (!root || !fest) return;
    var back = root.querySelector("[data-fest-back]");
    if (back) back.addEventListener("click", backToIndex);
    var subBtn = root.querySelector("[data-fest-subscribe]");
    if (subBtn) {
      subBtn.addEventListener("click", function () {
        var on = toggleSubscribe(fest.slug);
        subBtn.textContent = on ? "Вы подписаны" : "Подписаться";
        subBtn.className = on ? "btn btn-secondary" : "btn btn-primary";
        toast(on ? "Подписка на этом устройстве" : "Подписка снята");
      });
    }
    var shareBtn = root.querySelector("[data-fest-share]");
    if (shareBtn) shareBtn.addEventListener("click", function () { shareFestival(fest); });
    root.querySelectorAll("[data-fest-add]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        addFilmToBase(btn.getAttribute("data-fest-add"), btn);
      });
    });
    var addAll = root.querySelector("[data-fest-add-all]");
    if (addAll) {
      addAll.addEventListener("click", function () {
        var buttons = root.querySelectorAll("[data-fest-add]");
        if (!buttons.length) return;
        buttons.forEach(function (btn) { addFilmToBase(btn.getAttribute("data-fest-add"), btn); });
      });
    }
    root.querySelectorAll("[data-fest-remind]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var on = toggleRemind(btn.getAttribute("data-fest-remind"));
        btn.textContent = on ? "Напомню" : "Напомнить";
        toast(on ? "Напоминание на этом устройстве" : "Напоминание снято");
      });
    });
  }

  function renderDetail(root, slug) {
    if (!root) return;
    var data = mock();
    var fest = data && data.getFestival ? data.getFestival(slug) : null;
    if (!fest) {
      applyIndexSeo();
      root.innerHTML = '<div class="festivals-page"><p class="cabinet-hint">Фестиваль не найден.</p>'
        + '<button type="button" class="btn btn-secondary" data-fest-back="1">К афише</button></div>';
      var miss = root.querySelector("[data-fest-back]");
      if (miss) miss.addEventListener("click", backToIndex);
      return;
    }
    applyDetailSeo(fest);
    var news = data.newsForFestival ? data.newsForFestival(fest.slug) : [];
    root.innerHTML = '<div class="festivals-page festivals-page--detail">'
      + heroHtml(fest, isSubscribed(fest.slug))
      + newsStripHtml(news, "Новости")
      + coversHtml(fest)
      + infoHtml(fest)
      + programHtml(fest)
      + peopleHtml(fest)
      + "</div>";
    bindDetail(root, fest);
  }

  global.MpFestivalsPage = {
    renderIndex: renderIndex,
    renderDetail: renderDetail,
    isSubscribed: isSubscribed,
    toggleSubscribe: toggleSubscribe,
    readSubs: readSubs,
    SEO: SEO,
    SUBS_KEY: SUBS_KEY,
  };

  try {
    if (typeof global.__mpRepaintWtwFestivalsPanel === "function") {
      global.__mpRepaintWtwFestivalsPanel();
    }
  } catch (_) {}
})(typeof window !== "undefined" ? window : globalThis);
