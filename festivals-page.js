/**
 * Фестивали — индекс и страница фестиваля.
 * Прямые URL: /whattowatch/festivals , /whattowatch/festivals/:slug
 * Смотреть: чипа «Фестивали» нет. На Премьерах — короткий тизер списка.
 */
(function (global) {
  "use strict";

  var SEO = {
    title: "Фестивали — Movie Planner",
    description: "Кинофестивали в Movie Planner: что идёт и что скоро, программа по дням, подписка.",
    canonical: "https://movie-planner.ru/whattowatch/festivals",
  };

  var SUBS_KEY = "mp_festival_subs_v1";
  var REMIND_KEY = "mp_festival_remind_v1";

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

  function readJsonList(key) {
    try {
      var parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function writeJsonList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list || [])); } catch (_) {}
  }

  function isSubscribed(slug) {
    return readJsonList(SUBS_KEY).indexOf(String(slug || "")) >= 0;
  }

  function toggleSubscribe(slug) {
    var key = String(slug || "");
    if (!key) return false;
    var list = readJsonList(SUBS_KEY);
    var i = list.indexOf(key);
    if (i >= 0) list.splice(i, 1);
    else list.push(key);
    writeJsonList(SUBS_KEY, list);
    return list.indexOf(key) >= 0;
  }

  function toggleRemind(id) {
    var key = String(id || "");
    if (!key) return false;
    var list = readJsonList(REMIND_KEY);
    var i = list.indexOf(key);
    if (i >= 0) list.splice(i, 1);
    else list.push(key);
    writeJsonList(REMIND_KEY, list);
    return list.indexOf(key) >= 0;
  }

  function openFestival(slug) {
    if (typeof global.__mpWtwOpenFestivalSlug === "function") {
      global.__mpWtwOpenFestivalSlug(slug);
      return;
    }
    window.location.href = "/whattowatch/festivals/" + encodeURIComponent(slug);
  }

  function backToIndex() {
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

  function newsStripHtml(news) {
    if (!news || !news.length) return "";
    var cards = news.slice(0, 6).map(function (n) {
      var cover = n.cover
        ? '<img class="fest-news-cover" src="' + esc(n.cover) + '" alt="" loading="lazy">'
        : '<span class="fest-news-cover fest-news-cover--empty" aria-hidden="true"></span>';
      return '<button type="button" class="fest-news-card" data-fest-open="' + esc(n.festival_slug) + '">'
        + cover
        + '<span class="fest-news-copy"><span class="fest-news-title">' + esc(n.title) + "</span></span></button>";
    }).join("");
    return '<section class="fest-news" aria-label="Новости">'
      + '<h2 class="fest-block-title">Новости</h2>'
      + '<div class="fest-news-rail">' + cards + "</div></section>";
  }

  function carouselHtml(items) {
    if (!items || !items.length) return '<p class="cabinet-hint">Пока нет фестивалей в афише.</p>';
    var cards = items.map(function (f) {
      var cover = f.cover
        ? '<img class="fest-carousel-cover" src="' + esc(f.cover) + '" alt="" loading="lazy">'
        : '<span class="fest-carousel-cover fest-news-cover--empty" aria-hidden="true"></span>';
      return '<button type="button" class="fest-carousel-card" data-fest-open="' + esc(f.slug) + '">'
        + cover
        + '<span class="fest-carousel-name">' + esc(f.title) + "</span>"
        + '<span class="fest-carousel-meta">' + esc([f.dates_label, f.place_label].filter(Boolean).join(" · ")) + "</span>"
        + '<span class="fest-status fest-status--' + esc(f.status) + '">' + esc(f.status_label) + "</span>"
        + "</button>";
    }).join("");
    return '<section class="fest-schedule" aria-label="График фестивалей">'
      + '<h2 class="fest-block-title">График</h2>'
      + '<div class="fest-carousel">' + cards + "</div></section>";
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

  function renderIndex(root) {
    if (!root) return;
    var data = mock();
    if (!data) {
      root.innerHTML = '<div class="festivals-page"><p class="cabinet-hint">Не удалось загрузить афишу фестивалей.</p></div>';
      return;
    }
    applyIndexSeo();
    var news = data.newsFeed ? data.newsFeed() : [];
    var items = data.scheduleCarousel ? data.scheduleCarousel() : [];
    root.innerHTML = '<div class="festivals-page festivals-page--index">'
      + '<h1 class="fest-index-title">Фестивали</h1>'
      + newsStripHtml(news)
      + carouselHtml(items)
      + "</div>";
    bindOpen(root);
  }

  function timeLabel(iso) {
    var m = String(iso || "").match(/T(\d{2}):(\d{2})/);
    return m ? m[1] + ":" + m[2] : "";
  }

  function remindKey(fest, it) {
    return String(fest.slug || "") + ":" + String((it && (it.kp_id || it.title)) || "");
  }

  function programRowHtml(fest, it) {
    var kp = it && it.kp_id ? String(it.kp_id).trim() : "";
    var href = filmHref(kp);
    var title = esc((it && it.title) || "Без названия");
    var bits = [];
    if (it && it.director) bits.push("Режиссёр " + it.director);
    if (it && it.venue) bits.push(it.venue);
    if (it && it.year) bits.push(String(it.year));
    var tm = timeLabel(it && it.screening_at);
    if (tm) bits.push(tm);
    var meta = bits.length ? '<span class="fest-prog-meta">' + esc(bits.join(" · ")) + "</span>" : "";
    var titleHtml = href
      ? '<a class="fest-prog-title" href="' + esc(href) + '">' + title + "</a>"
      : '<span class="fest-prog-title">' + title + "</span>";
    var poster = (it && it.poster)
      ? '<img class="fest-prog-poster" src="' + esc(it.poster) + '" alt="" loading="lazy">'
      : "";
    var rk = remindKey(fest, it);
    var reminded = readJsonList(REMIND_KEY).indexOf(rk) >= 0;
    var actions = "";
    if (kp) actions += '<button type="button" class="btn btn-primary btn-small" data-fest-add="' + esc(kp) + '">В базу</button>';
    actions += '<button type="button" class="btn btn-secondary btn-small" data-fest-remind="' + esc(rk) + '">'
      + (reminded ? "Напомню" : "Напомнить") + "</button>";
    return '<article class="fest-prog-item">'
      + poster
      + '<div class="fest-prog-copy">' + titleHtml + meta + "</div>"
      + '<div class="fest-prog-actions">' + actions + "</div>"
      + "</article>";
  }

  function calendarHtml(fest) {
    var data = mock();
    var days = data && data.programDays ? data.programDays(fest) : [];
    if (!days.length) return "";
    var tabs = days.map(function (d, i) {
      return '<button type="button" class="fest-day-tab' + (i === 0 ? " is-active" : "") + '" data-fest-day="' + esc(d.day || "none") + '">'
        + esc(d.label) + "</button>";
    }).join("");
    var panels = days.map(function (d, i) {
      var rows = (d.items || []).map(function (it) { return programRowHtml(fest, it); }).join("");
      return '<div class="fest-day-panel" data-fest-day-panel="' + esc(d.day || "none") + '"' + (i === 0 ? "" : " hidden") + ">"
        + rows + "</div>";
    }).join("");
    return '<section class="fest-program" aria-label="Программа">'
      + '<h2 class="fest-block-title">Программа</h2>'
      + '<div class="fest-day-tabs" role="tablist" aria-label="Дни">' + tabs + "</div>"
      + panels
      + "</section>";
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
    var official = fest.official_url
      ? '<a class="btn btn-secondary" href="' + esc(fest.official_url) + '" target="_blank" rel="noopener noreferrer">Сайт</a>'
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
      + official
      + "</div></div></header>";
  }

  function addFilmToBase(kp, btn) {
    if (typeof global.requireAuthForAction === "function" && typeof global.getToken === "function" && !global.getToken()) {
      global.requireAuthForAction("Войдите, чтобы добавить фильм в базу");
      return;
    }
    if (typeof global.api !== "function") {
      toast("Фильм отмечен на этом устройстве.");
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
          if (btn) { btn.disabled = false; btn.textContent = "В базу"; }
        }
      })
      .catch(function () {
        toast("Ошибка сети. Не удалось добавить фильм.", { type: "error" });
        if (btn) { btn.disabled = false; btn.textContent = "В базу"; }
      });
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
    root.querySelectorAll("[data-fest-day]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var day = tab.getAttribute("data-fest-day");
        root.querySelectorAll("[data-fest-day]").forEach(function (t) {
          t.classList.toggle("is-active", t === tab);
        });
        root.querySelectorAll("[data-fest-day-panel]").forEach(function (p) {
          p.hidden = p.getAttribute("data-fest-day-panel") !== day;
        });
      });
    });
    root.querySelectorAll("[data-fest-add]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        addFilmToBase(btn.getAttribute("data-fest-add"), btn);
      });
    });
    root.querySelectorAll("[data-fest-remind]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var on = toggleRemind(btn.getAttribute("data-fest-remind"));
        btn.textContent = on ? "Напомню" : "Напомнить";
        toast(on ? "Напоминание на этом устройстве" : "Напоминание снято");
      });
    });
  }

  function teaserItems() {
    var data = mock();
    if (!data) return [];
    if (typeof data.teaserList === "function") return data.teaserList();
    return (data.scheduleCarousel ? data.scheduleCarousel() : []).filter(function (f) {
      return f.status === "live" || f.status === "upcoming";
    }).slice(0, 6);
  }

  function teaserRowHtml(f) {
    var href = "/whattowatch/festivals/" + encodeURIComponent(f.slug || "");
    var cover = f.cover
      ? '<img class="premieres-fest-cover" src="' + esc(f.cover) + '" alt="" loading="lazy">'
      : '<span class="premieres-fest-cover" aria-hidden="true"></span>';
    var meta = [f.dates_label, f.place_label].filter(Boolean).join(" · ");
    return '<a class="premieres-fest-row" href="' + esc(href) + '">'
      + cover
      + '<span class="premieres-fest-copy">'
      + '<span class="premieres-fest-name">' + esc(f.title) + "</span>"
      + (meta ? '<span class="premieres-fest-meta">' + esc(meta) + "</span>" : "")
      + "</span>"
      + '<span class="fest-status fest-status--' + esc(f.status) + '">' + esc(f.status_label) + "</span>"
      + "</a>";
  }

  function renderPremieresTeaser(host, list) {
    var root = host || document.getElementById("premieres-festivals");
    var rail = list || (root && root.querySelector("#premieres-festivals-list"));
    if (!root || !rail) return;
    var items = teaserItems();
    if (!items.length) {
      root.hidden = true;
      rail.innerHTML = "";
      return;
    }
    root.hidden = false;
    if (!root.getAttribute("data-fest-ready")) {
      root.removeAttribute("open");
      root.setAttribute("data-fest-ready", "1");
    }
    rail.innerHTML = items.map(teaserRowHtml).join("");
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
    root.innerHTML = '<div class="festivals-page festivals-page--detail">'
      + heroHtml(fest, isSubscribed(fest.slug))
      + infoHtml(fest)
      + calendarHtml(fest)
      + "</div>";
    bindDetail(root, fest);
  }

  global.MpFestivalsPage = {
    renderIndex: renderIndex,
    renderDetail: renderDetail,
    renderPremieresTeaser: renderPremieresTeaser,
    isSubscribed: isSubscribed,
    toggleSubscribe: toggleSubscribe,
    SEO: SEO,
    SUBS_KEY: SUBS_KEY,
  };

  try {
    if (typeof global.__mpRepaintWtwFestivalsPanel === "function") {
      global.__mpRepaintWtwFestivalsPanel();
    }
  } catch (_) {}
  try { renderPremieresTeaser(); } catch (_) {}
})(typeof window !== "undefined" ? window : globalThis);
