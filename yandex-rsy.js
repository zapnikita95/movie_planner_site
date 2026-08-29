/**
 * Yandex RSY — movie-planner.ru
 * RSY_HORIZONTAL_CLIP_V1
 * Tall vertical sidebar in side gutters; width scales down; hidden if no room.
 */
(function (global) {
  'use strict';

  var BUILD = '20260829twosubBig1';
  var HORIZONTAL_SLOT_MAX_PX = 120;
  var VIEWPORT_EDGE_PAD = 12;
  var LAYOUT_ENABLED = true;
  var CONTEXT_SRC = 'https://yandex.ru/ads/system/context.js';
  var DESKTOP_MIN = 1280;
  var CONTENT_FILM_STAFF = 1180;
  var CONTENT_ARTICLE = 800;
  var GUTTER_GAP = 16;
  var RAIL_MIN_W = 160;
  var RAIL_IDEAL_W = 300;

  /**
   * RSY blocks (movie-planner.ru, site 19798904):
   * - filmBannerHorizontal (-1): баннер 1000×120 «MP f после похожих» — mobile top/bottom + inline
   * - filmSidebar (-2): вертикальный сайдбар — ТОЛЬКО desktop ≥1280, НИКОГДА mobile strips
   * - /home: NO ads (rails full-bleed; sidebar overlapped content)
   */
  var BLOCKS = {
    filmBannerHorizontal: 'R-A-19798904-1',
    filmSidebar: 'R-A-19798904-2',
    filmAfterSimilar: 'R-A-19798904-1',
    staffSidebar: 'R-A-19798904-3',
    staffAfterFilmography: 'R-A-19798904-4',
    articleSidebarRight: 'R-A-19798904-5',
    articleSidebarLeft: null,
    articleInline: 'R-A-19798904-5',
    seriesSidebar: 'R-A-19798904-2',
    seriesInline: 'R-A-19798904-1',
    cabinetSidebar: 'R-A-19798904-2',
    cabinetInline: 'R-A-19798904-1',
  };

  function horizontalBannerBlock() {
    return BLOCKS.filmBannerHorizontal || BLOCKS.filmAfterSimilar || null;
  }

  /* /home intentionally omitted — never mount RSY on cabinet home */
  var CABINET_SECTION_KEYS = {
    '/premieres': 'premieres',
    '/whattowatch': 'whattowatch',
    '/buzz': 'buzz',
    '/tournament': 'tournament',
  };

  var rendered = Object.create(null);
  var _observer = null;
  var _denyKpMap = null;
  var _denyPromise = null;

  function allowsAds() {
    try {
      if (global.MpCookieConsent && typeof global.MpCookieConsent.allows === 'function') {
        return !!global.MpCookieConsent.allows('ads');
      }
    } catch (_e) {}
    return false;
  }

  function shouldSkip() {
    try {
      var q = String(global.location && global.location.search || '');
      if (/[?&]e2e=/.test(q)) return true;
      if (sessionStorage.getItem('mp_metrika_skip_e2e') === '1') return true;
    } catch (_e) {}
    var ua = String((global.navigator && global.navigator.userAgent) || '');
    if (/HeadlessChrome|Playwright|Puppeteer/i.test(ua)) return true;
    return false;
  }

  function viewportWidth() {
    return global.innerWidth || document.documentElement.clientWidth || 0;
  }

  function isDesktop() {
    return viewportWidth() >= DESKTOP_MIN;
  }

  function contentMaxForPath(path) {
    return /\/articles\//.test(path) ? CONTENT_ARTICLE : CONTENT_FILM_STAFF;
  }

  /** Ideal width by viewport; actual width may shrink to fit gutter. */
  function railIdealWidth(kind) {
    var vw = viewportWidth();
    if (vw >= 2000) return 360;
    if (vw >= 1760) return 336;
    return RAIL_IDEAL_W;
  }

  function railGeometry(side, kind) {
    var vw = viewportWidth();
    if (vw < DESKTOP_MIN) return null;
    var path = String(global.location && global.location.pathname || '');
    var contentMax = contentMaxForPath(path);
    var half = Math.min(contentMax / 2, vw / 2 - 12);
    var gutter = vw / 2 - half;
    var maxW = gutter - GUTTER_GAP;
    if (maxW < RAIL_MIN_W) return null;
    var w = Math.min(railIdealWidth(kind), maxW);
    if (side === 'left') {
      return { left: Math.max(8, vw / 2 - half - GUTTER_GAP - w), width: w };
    }
    return { left: vw / 2 + half + GUTTER_GAP, width: w };
  }

  function ensureStyles() {
    if (document.querySelector('link[data-mp-rsy-css="1"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/yandex-rsy.css?v=' + BUILD;
    l.setAttribute('data-mp-rsy-css', '1');
    document.head.appendChild(l);
  }

  function loadContext() {
    if (global.__mpRsyContextRequested) return;
    global.__mpRsyContextRequested = true;
    global.yaContextCb = global.yaContextCb || [];
    if (document.querySelector('script[src="' + CONTEXT_SRC + '"]')) return;
    var s = document.createElement('script');
    s.src = CONTEXT_SRC;
    s.async = true;
    (document.head || document.documentElement).appendChild(s);
  }

  function clampHorizontalSlot(slot) {
    if (!slot || slot.getAttribute('data-mp-rsy-format') !== 'horizontal') return;
    var wrap = slot.closest('.mp-rsy-inline');
    function apply() {
      slot.style.overflow = 'hidden';
      slot.style.maxHeight = HORIZONTAL_SLOT_MAX_PX + 'px';
      if (wrap) {
        wrap.style.overflow = 'hidden';
        wrap.style.maxHeight = (HORIZONTAL_SLOT_MAX_PX + 12) + 'px';
      }
      var kids = slot.querySelectorAll('iframe, div, a');
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (!el || el === slot) continue;
        el.style.maxHeight = HORIZONTAL_SLOT_MAX_PX + 'px';
        el.style.overflow = 'hidden';
      }
    }
    apply();
    if (slot._mpRsyClampRo) return;
    if (typeof ResizeObserver === 'undefined') return;
    slot._mpRsyClampRo = new ResizeObserver(apply);
    slot._mpRsyClampRo.observe(slot);
  }

  function renderBlock(blockId, renderToId) {
    if (!blockId || !renderToId) return;
    var node = document.getElementById(renderToId);
    if (!node) return;
    if (rendered[renderToId]) {
      if (node.isConnected) return;
      delete rendered[renderToId];
    }
    rendered[renderToId] = true;
    if (node.getAttribute('data-mp-rsy-format') === 'horizontal') {
      clampHorizontalSlot(node);
    }
    loadContext();
    global.yaContextCb.push(function () {
      try {
        if (!global.Ya || !Ya.Context || !Ya.Context.AdvManager) return;
        Ya.Context.AdvManager.render({ blockId: blockId, renderTo: renderToId });
        if (node.getAttribute('data-mp-rsy-format') === 'horizontal') {
          clampHorizontalSlot(node);
          setTimeout(function () { clampHorizontalSlot(node); }, 400);
          setTimeout(function () { clampHorizontalSlot(node); }, 1500);
        }
      } catch (_e) {}
    });
  }

  function slotId(kind, side) {
    if (side) return 'mp_rsy_' + kind + '_' + side;
    return 'mp_rsy_' + kind;
  }

  function teardownLegacyWrapper() {
    document.querySelectorAll('.mp-page-with-rsy').forEach(function (layout) {
      var anchor = layout.querySelector('.film-page-outer, main.staff-standalone-main, #staff-root');
      if (anchor && layout.parentNode) {
        layout.parentNode.insertBefore(anchor, layout);
        layout.remove();
      }
    });
  }

  function removeOwnedSlots() {
    document.querySelectorAll('.mp-rsy-fixed-rail, .mp-rsy-outer-rail, .mp-rsy-inline').forEach(function (el) {
      el.remove();
    });
    document.querySelectorAll('.film-page-outer.mp-rsy-host').forEach(function (el) {
      el.classList.remove('mp-rsy-host');
    });
    setFilmPageOverflowVisible(false);
    rendered = Object.create(null);
  }

  function teardownRails() {
    teardownLegacyWrapper();
    removeOwnedSlots();
    if (_observer) {
      try { _observer.disconnect(); } catch (_d) {}
      _observer = null;
    }
  }

  function railAnchorTop() {
    var gap = 12;
    var nav = document.querySelector(
      '#cabinet-readonly .cabinet-nav, .film-standalone-nav, .staff-standalone-nav, body.in-cabinet .cabinet-nav'
    );
    if (nav) {
      var nr = nav.getBoundingClientRect();
      if (nr.bottom > 40 && nr.bottom < (global.innerHeight || 800)) {
        return Math.round(nr.bottom + gap);
      }
    }
    var contentTop = document.querySelector(
      '#section-film > div, #film-page-content > section.hero, main.film-page > section.hero, main.subpage-main .article-content, .article-content h1, #section-premieres, #section-buzz, #section-whattowatch, #section-tournament, #section-home'
    );
    if (contentTop) {
      var cr = contentTop.getBoundingClientRect();
      if (cr.top > 20 && cr.top < (global.innerHeight || 800) * 0.55) {
        return Math.round(cr.top);
      }
    }
    var header = document.getElementById('site-header');
    if (header) {
      var hr = header.getBoundingClientRect();
      if (hr.bottom > 20) return Math.round(hr.bottom + gap);
    }
    return 120;
  }

  function applyRailVertical(rail) {
    if (!rail) return;
    var top = railAnchorTop();
    var bottomPad = 16;
    rail.style.top = top + 'px';
    rail.style.height = 'auto';
    rail.style.maxHeight = 'calc(100vh - ' + (top + bottomPad) + 'px)';
    rail.style.overflow = 'hidden';
    var slot = rail.querySelector('.mp-rsy-slot');
    if (slot) {
      slot.style.minHeight = '0';
      slot.style.maxHeight = 'calc(100vh - ' + (top + bottomPad + 8) + 'px)';
      slot.style.overflow = 'hidden';
    }
  }

  function applyRailPosition(rail, geo) {
    if (!rail) return;
    if (!geo) {
      rail.hidden = true;
      return;
    }
    rail.hidden = false;
    rail.style.left = geo.left + 'px';
    rail.style.right = 'auto';
    rail.style.width = geo.width + 'px';
    rail.dataset.mpRsyWidth = String(geo.width);
    applyRailVertical(rail);
  }

  function findFilmPageOuter() {
    var outer = document.querySelector('#section-film .film-page-outer') || document.querySelector('.film-page-outer');
    if (outer) return outer;
    var root = document.getElementById('film-page-content');
    if (root && root.parentElement && root.parentElement.classList.contains('film-page-outer')) {
      return root.parentElement;
    }
    return null;
  }

  function filmOuterGutterWidth(outer) {
    if (!outer) return 0;
    var vw = viewportWidth();
    var or = outer.getBoundingClientRect();
    return vw - or.right - GUTTER_GAP - VIEWPORT_EDGE_PAD;
  }

  function layoutFilmOuterRail(rail, outer) {
    if (!rail || !outer) return null;
    if (viewportWidth() < DESKTOP_MIN) {
      rail.hidden = true;
      return null;
    }
    var rect = outer.getBoundingClientRect();
    var viewLeft = rect.right + GUTTER_GAP;
    var maxW = viewportWidth() - viewLeft - VIEWPORT_EDGE_PAD;
    if (maxW < RAIL_MIN_W) {
      rail.hidden = true;
      return null;
    }
    var w = Math.min(railIdealWidth('film'), maxW);
    var scrollX = global.pageXOffset || document.documentElement.scrollLeft || 0;
    var scrollY = global.pageYOffset || document.documentElement.scrollTop || 0;
    rail.hidden = false;
    rail.style.left = Math.round(viewLeft + scrollX) + 'px';
    rail.style.top = Math.round(rect.top + scrollY) + 'px';
    rail.style.width = Math.round(w) + 'px';
    return rail;
  }

  function setFilmPageOverflowVisible(on) {
    try {
      document.body.classList.toggle('mp-rsy-film-page', !!on);
    } catch (_e) {}
  }

  function ensureFilmOuterRail(blockId) {
    if (!blockId) return null;
    if (viewportWidth() < DESKTOP_MIN) return null;
    var outer = findFilmPageOuter();
    if (!outer) return ensureFixedRail('film', blockId, 'right');
    if (filmOuterGutterWidth(outer) < RAIL_MIN_W) return null;
    outer.classList.add('mp-rsy-host');
    setFilmPageOverflowVisible(true);
    var railId = 'mp_rsy_outer_film_right';
    var rail = document.getElementById(railId);
    if (!rail) {
      rail = document.createElement('aside');
      rail.id = railId;
      rail.className = 'mp-rsy-outer-rail mp-rsy-outer-rail--film';
      rail.setAttribute('aria-label', 'Реклама');
      var slot = document.createElement('div');
      slot.id = slotId('film', 'right');
      slot.className = 'mp-rsy-slot mp-rsy-slot--outer-film';
      rail.appendChild(slot);
      document.body.appendChild(rail);
    }
    layoutFilmOuterRail(rail, outer);
    renderBlock(blockId, slotId('film', 'right'));
    return rail;
  }

  function updateFilmOuterRail() {
    var path = String(global.location && global.location.pathname || '');
    if (!isFilmPath(path)) {
      document.querySelectorAll('.mp-rsy-outer-rail--film').forEach(function (r) { r.hidden = true; });
      setFilmPageOverflowVisible(false);
      return;
    }
    var outer = findFilmPageOuter();
    document.querySelectorAll('.mp-rsy-outer-rail--film').forEach(function (rail) {
      if (!outer) {
        rail.hidden = true;
        return;
      }
      layoutFilmOuterRail(rail, outer);
    });
  }

  function ensureFixedRail(kind, blockId, side) {
    side = side || 'right';
    if (!blockId) return null;
    var geo = railGeometry(side, kind);
    if (!geo) return null;
    var railId = 'mp_rsy_fixed_' + kind + '_' + side;
    var rail = document.getElementById(railId);
    if (!rail) {
      rail = document.createElement('aside');
      rail.id = railId;
      rail.className = 'mp-rsy-fixed-rail mp-rsy-fixed-rail--tall mp-rsy-fixed-rail--' + kind + ' mp-rsy-fixed-rail--' + side;
      rail.setAttribute('aria-label', 'Реклама');
      var slot = document.createElement('div');
      slot.id = slotId(kind, side);
      slot.className = 'mp-rsy-slot mp-rsy-slot--tall mp-rsy-slot--' + kind;
      rail.appendChild(slot);
      document.body.appendChild(rail);
    }
    applyRailPosition(rail, geo);
    renderBlock(blockId, slotId(kind, side));
    return rail;
  }

  function isSeriesHubPath(path) {
    return path === '/series' || path === '/series-hub' || /^\/series(\/|$)/.test(path);
  }

  function isFilmPath(path) {
    return /^\/f\/(\d+|mp-\d+|movie-\d+|tv-\d+)/.test(path);
  }

  function isCabinetSectionPath(path) {
    if (CABINET_SECTION_KEYS[path]) return true;
    if (/^\/whattowatch(\/|$)/.test(path)) return true;
    return false;
  }

  function cabinetSectionKeyFromPath(path) {
    if (CABINET_SECTION_KEYS[path]) return CABINET_SECTION_KEYS[path];
    if (/^\/whattowatch(\/|$)/.test(path)) return 'whattowatch';
    try {
      var attr = document.body && document.body.getAttribute('data-cabinet-section');
      if (attr && document.getElementById('section-' + attr)) return attr;
    } catch (_e) {}
    return null;
  }

  function kpFromFilmPath(path) {
    var m = String(path || '').match(/^\/f\/(\d+)/);
    return m ? m[1] : null;
  }

  function applyRsyaBlocksFromConfig(rsya) {
    if (!rsya || typeof rsya !== 'object') return;
    if (rsya.block_horizontal) {
      BLOCKS.filmBannerHorizontal = String(rsya.block_horizontal);
      BLOCKS.filmAfterSimilar = String(rsya.block_horizontal);
    }
    if (rsya.block_sidebar_film) BLOCKS.filmSidebar = String(rsya.block_sidebar_film);
    if (rsya.block_sidebar_staff) BLOCKS.staffSidebar = String(rsya.block_sidebar_staff);
    if (rsya.block_after_filmography) BLOCKS.staffAfterFilmography = String(rsya.block_after_filmography);
    if (rsya.block_article) {
      BLOCKS.articleInline = String(rsya.block_article);
      if (!BLOCKS.articleSidebarRight) BLOCKS.articleSidebarRight = String(rsya.block_article);
    }
  }

  var _denyGenreSet = null;

  function fetchDenyList() {
    if (_denyKpMap) return Promise.resolve(_denyKpMap);
    if (_denyPromise) return _denyPromise;
    var kpOnPath = kpFromFilmPath(String(global.location && global.location.pathname || ''));
    var cfgUrl = '/api/public/monetization/config' + (kpOnPath ? ('?kp_id=' + encodeURIComponent(kpOnPath)) : '');
    _denyPromise = fetch(cfgUrl, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) {
        _denyKpMap = Object.create(null);
        applyRsyaBlocksFromConfig(d && d.rsya);
        var list = (d && d.film_ads_deny_kp_ids) || [];
        list.forEach(function (id) {
          var kp = String(id || '').replace(/\D/g, '');
          if (kp) _denyKpMap[kp] = true;
        });
        _denyGenreSet = Object.create(null);
        var genres = (d && d.film_ads_deny_genres) || [];
        genres.forEach(function (g) {
          var key = String(g || '').trim().toLowerCase();
          if (key) _denyGenreSet[key] = true;
        });
        if (d && d.film_ads_denied && kpOnPath) _denyKpMap[kpOnPath] = true;
        return _denyKpMap;
      })
      .catch(function () {
        _denyKpMap = Object.create(null);
        return _denyKpMap;
      });
    return _denyPromise;
  }

  function filmAdsBlocked(kp) {
    if (!kp) return false;
    try {
      var el = document.getElementById('mp-route-boot');
      if (el) {
        var boot = JSON.parse(el.textContent || '');
        if (boot && boot.type === 'film' && (boot.media_sensitive || String(boot.genres || '').toLowerCase().indexOf('для взрослых') >= 0)) {
          return true;
        }
      }
    } catch (_boot) {}
    if (_denyKpMap && _denyKpMap[String(kp)]) return true;
    try {
      if (_denyGenreSet) {
        var el2 = document.getElementById('mp-route-boot');
        if (el2) {
          var boot2 = JSON.parse(el2.textContent || '');
          var g2 = String((boot2 && boot2.genres) || '').toLowerCase();
          if (g2) {
            var parts = g2.split(/[,;]+/);
            for (var gi = 0; gi < parts.length; gi++) {
              var tok = String(parts[gi] || '').trim().toLowerCase();
              if (tok && _denyGenreSet[tok]) return true;
            }
          }
        }
      }
    } catch (_g) {}
    return false;
  }

  function pathKindActive(path, kind) {
    if (kind === 'film') return isFilmPath(path);
    if (kind === 'staff') return /^\/s\/\d+/.test(path);
    if (kind === 'article') return /\/articles\//.test(path);
    if (kind === 'series') return isSeriesHubPath(path);
    if (kind === 'cabinet') return isCabinetSectionPath(path);
    return false;
  }

  function updateFixedRailVisibility() {
    if (!allowsAds() || !LAYOUT_ENABLED || shouldSkip()) {
      document.querySelectorAll('.mp-rsy-fixed-rail').forEach(function (r) { r.hidden = true; });
      return;
    }
    var path = String(global.location && global.location.pathname || '');
    document.querySelectorAll('.mp-rsy-fixed-rail').forEach(function (rail) {
      var kind = 'staff';
      if (rail.classList.contains('mp-rsy-fixed-rail--article')) kind = 'article';
      if (rail.classList.contains('mp-rsy-fixed-rail--film')) kind = 'film';
      if (rail.classList.contains('mp-rsy-fixed-rail--series')) kind = 'series';
      if (rail.classList.contains('mp-rsy-fixed-rail--cabinet')) kind = 'cabinet';
      var side = rail.classList.contains('mp-rsy-fixed-rail--left') ? 'left' : 'right';
      if (!pathKindActive(path, kind)) {
        rail.hidden = true;
        return;
      }
      var geo = railGeometry(side, kind);
      applyRailPosition(rail, geo);
      if (geo) applyRailVertical(rail);
    });
  }

  function mountInlineAfter(anchor, kind, blockId) {
    if (!anchor || !blockId) return;
    var wrapId = 'mp_rsy_inline_' + kind;
    var existing = document.getElementById(wrapId);
    if (existing && existing.isConnected) return;
    if (existing) existing.remove();
    var wrap = document.createElement('div');
    wrap.id = wrapId;
    wrap.className = 'mp-rsy-inline mp-rsy-inline--' + kind;
    var sid = slotId('inline_' + kind);
    var slot = document.createElement('div');
    slot.id = sid;
    slot.className = 'mp-rsy-slot mp-rsy-slot--inline-' + kind;
    wrap.appendChild(slot);
    anchor.insertAdjacentElement('afterend', wrap);
    renderBlock(blockId, sid);
  }

  function mountInlineStrip(opts) {
    var o = opts || {};
    if (!o.anchor || !o.blockId || !o.wrapId || !o.kind) return;
    var existing = document.getElementById(o.wrapId);
    if (existing && existing.isConnected) return;
    if (existing) existing.remove();
    var wrap = document.createElement('div');
    wrap.id = o.wrapId;
    wrap.className = 'mp-rsy-inline mp-rsy-inline--' + o.kind + (o.mobileOnly ? ' mp-rsy-inline--mobile' : '');
    var sid = slotId('inline_' + o.kind);
    var slot = document.createElement('div');
    slot.id = sid;
    slot.className = 'mp-rsy-slot mp-rsy-slot--inline-' + o.kind;
    if (o.horizontal) {
      slot.setAttribute('data-mp-rsy-format', 'horizontal');
      clampHorizontalSlot(slot);
    }
    wrap.appendChild(slot);
    if (o.position === 'prepend') {
      o.anchor.insertBefore(wrap, o.anchor.firstChild || null);
    } else if (o.position === 'before') o.anchor.insertAdjacentElement('beforebegin', wrap);
    else if (o.position === 'append') o.anchor.appendChild(wrap);
    else o.anchor.insertAdjacentElement('afterend', wrap);
    renderBlock(o.blockId, sid);
  }

  function filmSectionVisible() {
    var sec = document.getElementById('section-film');
    if (!sec) return true;
    return !sec.classList.contains('hidden') && !sec.hasAttribute('hidden');
  }

  function clearFilmMobileStrips() {
    ['mp_rsy_inline_film_pre_poster', 'mp_rsy_inline_after_similar', 'mp_rsy_inline_film_bottom'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var slot = el.querySelector('.mp-rsy-slot');
      if (slot && slot.id) delete rendered[slot.id];
      el.remove();
    });
  }

  function watchFilmSectionVisibility() {
    if (global._mpRsyFilmSectionWatch) return;
    var sec = document.getElementById('section-film');
    if (!sec || typeof MutationObserver === 'undefined') return;
    global._mpRsyFilmSectionWatch = true;
    var wasHidden = sec.classList.contains('hidden') || sec.hasAttribute('hidden');
    var mo = new MutationObserver(function () {
      if (!allowsAds() || shouldSkip() || isDesktop()) return;
      if (!isFilmPath(String(global.location && global.location.pathname || ''))) return;
      var nowHidden = sec.classList.contains('hidden') || sec.hasAttribute('hidden');
      if (wasHidden && !nowHidden) {
        clearFilmMobileStrips();
        mountFilmPrePoster();
        mountFilmPageBottom();
      }
      wasHidden = nowHidden;
    });
    mo.observe(sec, { attributes: true, attributeFilter: ['class', 'hidden'] });
  }

  function mountFilmPrePoster() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip() || isDesktop()) return;
    var bannerId = horizontalBannerBlock();
    if (!bannerId) return;
    var pageRoot = document.getElementById('film-page-content')
      || document.querySelector('#section-film .movie-page, main.film-page');
    var hero = pageRoot && pageRoot.querySelector(':scope > section.film-hero-with-tag, :scope > section.hero, :scope > section');
    if (hero) {
      mountInlineStrip({
        wrapId: 'mp_rsy_inline_film_pre_poster',
        kind: 'film_pre_poster',
        blockId: bannerId,
        anchor: hero,
        position: 'before',
        mobileOnly: true,
        horizontal: true,
      });
      return;
    }
    var poster = document.getElementById('poster');
    if (!poster) return;
    var anchor = poster.closest('.poster-wrap') || poster.parentElement;
    if (!anchor) return;
    mountInlineStrip({
      wrapId: 'mp_rsy_inline_film_pre_poster',
      kind: 'film_pre_poster',
      blockId: bannerId,
      anchor: anchor,
      position: 'before',
      mobileOnly: true,
      horizontal: true,
    });
  }

  function mountFilmPageBottom() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    var bannerId = horizontalBannerBlock();
    if (!bannerId) return;
    var similar = document.querySelector('.film-page-similar-section');
    var shelf = document.getElementById('mp_product_shelf_mobile');
    var earlyBottom = document.getElementById('mp_rsy_inline_film_bottom');
    var afterSimilar = document.getElementById('mp_rsy_inline_after_similar');
    if (similar || shelf) {
      if (earlyBottom) earlyBottom.remove();
      if (afterSimilar && afterSimilar.isConnected) return;
      if (afterSimilar) afterSimilar.remove();
      mountInlineStrip({
        wrapId: 'mp_rsy_inline_after_similar',
        kind: 'after_similar',
        blockId: bannerId,
        anchor: shelf || similar,
        position: 'after',
        horizontal: true,
      });
      return;
    }
    if (afterSimilar) afterSimilar.remove();
    if (earlyBottom && earlyBottom.isConnected) return;
    if (earlyBottom) earlyBottom.remove();
    var pageRoot = document.getElementById('film-page-content')
      || document.querySelector('#section-film .movie-page, main.film-page');
    if (!pageRoot) return;
    var hero = pageRoot.querySelector(':scope > section.film-hero-with-tag, :scope > section.hero, :scope > section');
    var anchor = hero || pageRoot;
    mountInlineStrip({
      wrapId: 'mp_rsy_inline_film_bottom',
      kind: 'film_bottom',
      blockId: bannerId,
      anchor: anchor,
      position: anchor === pageRoot ? 'append' : 'after',
      horizontal: true,
    });
  }

  function mountFilmMobileStrips() {
    watchFilmSectionVisibility();
    /* Auth cabinet: #section-film is .hidden until route shows it.
       Rendering RSY into a hidden host leaves a blank slot forever. */
    if (!isDesktop() && !filmSectionVisible()) return;
    mountFilmPrePoster();
    mountFilmPageBottom();
  }

  function mountFilmAfterSimilar() {
    mountFilmMobileStrips();
  }

  function mountStaffAfterFilmography() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    var roles = document.getElementById('staff-roles-root');
    if (!roles || !BLOCKS.staffAfterFilmography) return;
    mountInlineAfter(roles, 'after_filmography', BLOCKS.staffAfterFilmography);
  }

  function mountArticleBottom() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    if (!/\/articles\//.test(String(global.location && global.location.pathname || ''))) return;
    var content = document.querySelector('.article-content');
    if (!content || !BLOCKS.articleInline) return;
    mountInlineAfter(content, 'article', BLOCKS.articleInline);
  }

  function hasArticleSideRoom() {
    return !!(railGeometry('right', 'article') || railGeometry('left', 'article'));
  }

  function mountArticlePage() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    var sideOk = hasArticleSideRoom();
    if (sideOk && BLOCKS.articleSidebarRight) {
      ensureFixedRail('article', BLOCKS.articleSidebarRight, 'right');
    }
    if (sideOk && BLOCKS.articleSidebarLeft) {
      ensureFixedRail('article', BLOCKS.articleSidebarLeft, 'left');
    }
    if (BLOCKS.articleInline) {
      mountArticleBottom();
    }
  }

  function mountFilmPage() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    var path = String(global.location && global.location.pathname || '');
    var kp = kpFromFilmPath(path);
    watchFilmSectionVisibility();
    fetchDenyList().then(function () {
      if (filmAdsBlocked(kp)) {
        removeOwnedSlots();
        document.querySelectorAll('.mp-rsy-fixed-rail--film, .mp-rsy-outer-rail--film').forEach(function (r) {
          r.hidden = true;
        });
        return;
      }
      removeOwnedSlots();
      if (BLOCKS.filmSidebar) ensureFilmOuterRail(BLOCKS.filmSidebar);
      mountFilmMobileStrips();
    });
  }

  function mountStaffPage() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    removeOwnedSlots();
    if (BLOCKS.staffSidebar) ensureFixedRail('staff', BLOCKS.staffSidebar, 'right');
    mountStaffAfterFilmography();
  }

  function mountSeriesHubPage() {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    if (!isSeriesHubPath(String(global.location && global.location.pathname || ''))) return;
    if (BLOCKS.seriesSidebar) ensureFixedRail('series', BLOCKS.seriesSidebar, 'right');
    var sec = document.getElementById('section-series-hub') || document.getElementById('section-series');
    if (!sec || !BLOCKS.seriesInline) return;
    var wrapId = 'mp_rsy_inline_series_hub';
    if (document.getElementById(wrapId)) return;
    var wrap = document.createElement('div');
    wrap.id = wrapId;
    wrap.className = 'mp-rsy-inline mp-rsy-inline--series_hub';
    var sid = slotId('inline_series_hub');
    var slot = document.createElement('div');
    slot.id = sid;
    slot.className = 'mp-rsy-slot mp-rsy-slot--inline-series_hub';
    wrap.appendChild(slot);
    sec.appendChild(wrap);
    renderBlock(BLOCKS.seriesInline, sid);
  }

  function mountCabinetSectionPage(path) {
    if (!LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    if (path === '/home' || path === '/') return;
    if (!isCabinetSectionPath(path)) return;
    var key = cabinetSectionKeyFromPath(path);
    if (!key || key === 'home') return;
    var sec = document.getElementById('section-' + key);
    if (!sec || sec.classList.contains('hidden')) return;
    if (isDesktop() && BLOCKS.cabinetSidebar) ensureFixedRail('cabinet', BLOCKS.cabinetSidebar, 'right');
    if (!BLOCKS.cabinetInline) return;
    var wrapId = 'mp_rsy_inline_cabinet_' + key;
    var existingCab = document.getElementById(wrapId);
    if (existingCab && existingCab.isConnected) return;
    if (existingCab) existingCab.remove();
    if (viewportWidth() < 768) {
      mountInlineStrip({
        wrapId: wrapId,
        kind: 'cabinet_' + key,
        blockId: BLOCKS.cabinetInline,
        anchor: sec,
        position: 'prepend',
        horizontal: true,
      });
      return;
    }
    var wrap = document.createElement('div');
    wrap.id = wrapId;
    wrap.className = 'mp-rsy-inline mp-rsy-inline--cabinet mp-rsy-inline--cabinet_' + key;
    var sid = slotId('inline_cabinet_' + key);
    var slot = document.createElement('div');
    slot.id = sid;
    slot.className = 'mp-rsy-slot mp-rsy-slot--inline-cabinet';
    wrap.appendChild(slot);
    sec.appendChild(wrap);
    renderBlock(BLOCKS.cabinetInline, sid);
  }

  function watchLateSections() {
    if (_observer || !LAYOUT_ENABLED || !allowsAds() || shouldSkip()) return;
    if (typeof MutationObserver === 'undefined') return;
    _observer = new MutationObserver(function () {
      var path = String(global.location && global.location.pathname || '');
      if (isFilmPath(path)) {
        mountFilmMobileStrips();
        fetchDenyList().then(function () {
          var kp = kpFromFilmPath(path);
          if (!filmAdsBlocked(kp) && BLOCKS.filmSidebar) {
            ensureFilmOuterRail(BLOCKS.filmSidebar);
          }
        });
      }
      if (/^\/s\//.test(path)) mountStaffAfterFilmography();
      if (isSeriesHubPath(path)) mountSeriesHubPage();
      if (isCabinetSectionPath(path)) mountCabinetSectionPage(path);
      if (/\/articles\//.test(path)) mountArticlePage();
    });
    _observer.observe(document.body, { childList: true, subtree: true });
  }

  function mountForRoute() {
    if (!allowsAds() || shouldSkip()) {
      teardownRails();
      return;
    }
    ensureStyles();
    teardownLegacyWrapper();
    var path = String(global.location && global.location.pathname || '');
    if (isFilmPath(path)) {
      mountFilmPage();
      watchLateSections();
      return;
    }
    if (/^\/s\/\d+/.test(path)) {
      mountStaffPage();
      watchLateSections();
      return;
    }
    if (isSeriesHubPath(path)) {
      removeOwnedSlots();
      mountSeriesHubPage();
      watchLateSections();
      updateFixedRailVisibility();
      return;
    }
    if (isCabinetSectionPath(path)) {
      removeOwnedSlots();
      mountCabinetSectionPage(path);
      watchLateSections();
      updateFixedRailVisibility();
      return;
    }
    if (/\/articles\//.test(path)) {
      removeOwnedSlots();
      mountArticlePage();
      watchLateSections();
      updateFixedRailVisibility();
      return;
    }
    removeOwnedSlots();
    updateFixedRailVisibility();
  }

  function onResize() {
    if (!allowsAds() || shouldSkip()) return;
    updateFixedRailVisibility();
    updateFilmOuterRail();
    var path = String(global.location && global.location.pathname || '');
    if (isFilmPath(path)) {
      fetchDenyList().then(function () {
        var kp = kpFromFilmPath(path);
        if (!filmAdsBlocked(kp)) mountFilmMobileStrips();
      });
    }
    if (!isDesktop()) {
      document.querySelectorAll('.mp-rsy-fixed-rail').forEach(function (rail) {
        rail.hidden = true;
      });
      if (isCabinetSectionPath(path)) mountCabinetSectionPage(path);
      if (/^\/s\/\d+/.test(path)) mountStaffAfterFilmography();
      return;
    }
    mountForRoute();
  }

  function boot() {
    teardownLegacyWrapper();
    if (!LAYOUT_ENABLED || shouldSkip()) return;
    if (!allowsAds()) {
      teardownRails();
      return;
    }
    fetchDenyList().finally(function () {
      mountForRoute();
    });
    if (!global._mpRsyResizeBound) {
      global._mpRsyResizeBound = true;
      var t;
      global.addEventListener('resize', function () {
        clearTimeout(t);
        t = setTimeout(onResize, 120);
      });
    }
  }

  global.mpLoadYandexRsy = function () { boot(); };

  global.MpRsy = {
    BUILD: BUILD,
    BLOCKS: BLOCKS,
    mountFilmPage: mountFilmPage,
    mountFilmAfterSimilar: mountFilmMobileStrips,
    mountFilmPageBottom: mountFilmPageBottom,
    mountFilmPrePoster: mountFilmPrePoster,
    mountFilmMobileStrips: mountFilmMobileStrips,
    mountStaffPage: mountStaffPage,
    mountStaffAfterFilmography: mountStaffAfterFilmography,
    mountSeriesHubPage: mountSeriesHubPage,
    mountCabinetSectionPage: mountCabinetSectionPage,
    mountArticleInline: mountArticlePage,
    remount: mountForRoute,
    teardown: teardownRails,
  };

  document.addEventListener('mp:cookie-consent', function () {
    if (allowsAds()) boot();
    else teardownRails();
  });

  if (allowsAds()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', teardownLegacyWrapper);
  } else {
    teardownLegacyWrapper();
  }
})(typeof window !== 'undefined' ? window : this);
