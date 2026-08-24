/**
 * Movie Planner monetization: RSYA, streaming affiliates, niche partners, film alerts.
 * Loaded on /f/ and /s/ thin shell.
 */
(function (global) {
  'use strict';

  var API_BASE = (global.MpApiConfig && global.MpApiConfig.apiBase)
    ? global.MpApiConfig.apiBase()
    : (global.location && global.location.origin) || 'https://movie-planner.ru';

  var _cfg = null;
  var _cfgPromise = null;
  var _rsyaLoaded = false;
  var _adsenseLoaded = false;

  function metrikaGoal(name, params) {
    try {
      if (typeof global.ym === 'function') {
        global.ym(110038199, 'reachGoal', name, params || {});
      }
    } catch (_e) {}
  }

  function isProUser() {
    try {
      if (global.localStorage && global.localStorage.getItem('mp_site_sessions')) return true;
      if (document.body && document.body.classList.contains('mp-authed')) return true;
    } catch (_e) {}
    return false;
  }

  function fetchConfig() {
    if (_cfg) return Promise.resolve(_cfg);
    if (_cfgPromise) return _cfgPromise;
    _cfgPromise = fetch(API_BASE + '/api/public/monetization/config', { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        _cfg = d || {};
        return _cfg;
      })
      .catch(function () {
        _cfg = { segment: 'unknown', rsya: { enabled: false }, adsense: { enabled: false } };
        return _cfg;
      });
    return _cfgPromise;
  }

  function loadRsya(partnerId) {
    if (_rsyaLoaded || !partnerId) return;
    _rsyaLoaded = true;
    var s = document.createElement('script');
    s.src = 'https://yandex.ru/ads/system/context.js';
    s.async = true;
    document.head.appendChild(s);
  }

  function loadAdsense(client) {
    if (_adsenseLoaded || !client) return;
    _adsenseLoaded = true;
    var s = document.createElement('script');
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client);
    s.async = true;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

  function rsyaSlotHtml(blockId) {
    if (!blockId) return '';
    return (
      '<div class="mp-ad-slot mp-ad-slot--rsya" data-mp-ad="rsya">' +
      '<div id="yandex_rtb_' + blockId + '"></div>' +
      '</div>'
    );
  }

  function adsenseSlotHtml(client, slot) {
    if (!client || !slot) return '';
    return (
      '<div class="mp-ad-slot mp-ad-slot--adsense" data-mp-ad="adsense">' +
      '<ins class="adsbygoogle" style="display:block" data-ad-client="' + client + '" data-ad-slot="' + slot + '" data-ad-format="auto" data-full-width-responsive="true"></ins>' +
      '</div>'
    );
  }

  function mountRsyaBlocks(root, cfg) {
    if (!root || !cfg || isProUser()) return;
    var rsya = cfg.rsya || {};
    if (!rsya.enabled) return;
    loadRsya(rsya.partner_id);
    var slots = root.querySelectorAll('[data-mp-ad-slot]');
    for (var i = 0; i < slots.length; i++) {
      var el = slots[i];
      var kind = el.getAttribute('data-mp-ad-slot') || '';
      var blockId = kind === 'infeed' ? rsya.block_infeed : rsya.block_horizontal;
      if (!blockId || el.getAttribute('data-mp-ad-mounted') === '1') continue;
      el.setAttribute('data-mp-ad-mounted', '1');
      el.innerHTML = rsyaSlotHtml(blockId);
      metrikaGoal('ad_slot_view', { network: 'rsya', placement: kind });
      try {
        global.yaContextCb = global.yaContextCb || [];
        global.yaContextCb.push(function () {
          if (global.Ya && global.Ya.Context && global.Ya.Context.AdvManager) {
            global.Ya.Context.AdvManager.render({
              blockId: blockId,
              renderTo: 'yandex_rtb_' + blockId,
            });
          }
        });
      } catch (_y) {}
    }
  }

  function mountAdsenseBlocks(root, cfg) {
    if (!root || !cfg || isProUser()) return;
    var ads = cfg.adsense || {};
    if (!ads.enabled) return;
    loadAdsense(ads.client);
    var nodes = root.querySelectorAll('.mp-ad-slot--adsense ins.adsbygoogle');
    for (var i = 0; i < nodes.length; i++) {
      try {
        (global.adsbygoogle = global.adsbygoogle || []).push({});
      } catch (_a) {}
    }
    if (nodes.length) {
      metrikaGoal('ad_slot_view', { network: 'adsense', placement: 'tier1' });
    }
  }

  function ensureAdSlots(pageRoot) {
    /* RSY placement: MpRsy / yandex-rsy.js only (fixed + after-section). No inflow slots here. */
    if (!pageRoot || isProUser()) return;
    if (global.MpRsy) return;
    fetchConfig().then(function (cfg) {
      if (!cfg.adsense || !cfg.adsense.enabled) return;
      var similar = pageRoot.querySelector('.film-page-similar-section');
      if (!similar || pageRoot.querySelector('[data-mp-ad-slot="horizontal"]')) return;
      var horiz = document.createElement('div');
      horiz.className = 'mp-ad-anchor';
      horiz.setAttribute('data-mp-ad-slot', 'horizontal');
      similar.parentNode.insertBefore(horiz, similar.nextSibling);
      horiz.innerHTML = adsenseSlotHtml(cfg.adsense.client, cfg.adsense.slot);
      mountAdsenseBlocks(pageRoot, cfg);
    });
  }

  function streamingBlockHtml(links, partners) {
    var rows = '';
    var i;
    for (i = 0; i < (links || []).length; i++) {
      var L = links[i];
      if (!L || !L.url) continue;
      rows +=
        '<a class="mp-stream-btn" href="' + L.url + '" target="_blank" rel="noopener sponsored" ' +
        'data-platform="' + (L.platform || '') + '" data-affiliate="' + (L.has_affiliate ? '1' : '0') + '">' +
        '<span class="mp-stream-btn__label">' + (L.label || L.platform || 'Смотреть') + '</span></a>';
    }
    for (i = 0; i < (partners || []).length; i++) {
      var P = partners[i];
      if (!P || !P.url) continue;
      rows +=
        '<a class="mp-stream-btn mp-stream-btn--niche" href="' + P.url + '" target="_blank" rel="noopener sponsored" ' +
        'data-partner="' + (P.id || '') + '" data-affiliate="' + (P.has_affiliate ? '1' : '0') + '">' +
        '<span class="mp-stream-btn__label">' + (P.label || 'Партнёр') + '</span>' +
        (P.hint ? '<span class="mp-stream-btn__hint">' + P.hint + '</span>' : '') +
        '</a>';
    }
    if (!rows) return '';
    return (
      '<section class="mp-watch-block" data-mp-watch="1">' +
      '<h2 class="mp-watch-block__title">Смотреть онлайн</h2>' +
      '<div class="mp-watch-block__grid">' + rows + '</div>' +
      '</section>'
    );
  }

  function bindStreamClicks(root, kpId) {
    if (!root) return;
    var links = root.querySelectorAll('.mp-stream-btn');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function () {
        metrikaGoal('stream_click', {
          platform: this.getAttribute('data-platform') || this.getAttribute('data-partner') || 'other',
          kp_id: String(kpId || ''),
          has_affiliate: this.getAttribute('data-affiliate') === '1' ? '1' : '0',
        });
      });
    }
  }

  function wrapToolbarIconsShell(pageRoot) {
    var icons = pageRoot.querySelector('.film-toolbar-icons');
    if (!icons) return null;
    if (icons.parentNode && icons.parentNode.classList.contains('film-toolbar-icons-shell')) {
      return icons.parentNode;
    }
    var shell = document.createElement('div');
    shell.className = 'film-toolbar-icons-shell';
    icons.parentNode.insertBefore(shell, icons);
    shell.appendChild(icons);
    return shell;
  }

  function partnerFlexLogoUrl() {
    return '/images/partners/flex-logo.png';
  }

  function partnerIviLogoUrl() {
    return '/images/partners/ivi-logo.png';
  }

  function partnerLogoUrl(partner) {
    if (!partner) return '';
    if (partner.logo) return partner.logo;
    if (partner.key === 'ivi') return partnerIviLogoUrl();
    if (partner.key === 'flex') return partnerFlexLogoUrl();
    return '';
  }

  function partnerAlt(partner) {
    if (!partner) return '';
    if (partner.key === 'ivi') return 'ivi';
    if (partner.key === 'flex') return 'FLEX';
    return partner.label || partner.key || '';
  }

  function bindPartnerIconClick(a, partner, kpId) {
    a.addEventListener('click', function () {
      metrikaGoal('stream_click', {
        platform: partner.key || 'other',
        kp_id: String(kpId || ''),
        has_affiliate: partner.has_affiliate ? '1' : '0',
      });
    });
  }

  function buildPartnerIconLink(partner, kpId, size) {
    var logo = partnerLogoUrl(partner);
    if (!logo || !partner.url) return null;
    var a = document.createElement('a');
    a.className = 'film-partner-watch__icon film-partner-watch__icon--' + partner.key;
    a.href = partner.url;
    a.target = '_blank';
    a.rel = 'noopener sponsored';
    a.setAttribute('data-partner', partner.key || 'other');
    a.setAttribute('data-affiliate', partner.has_affiliate ? '1' : '0');
    a.setAttribute('aria-label', partnerAlt(partner));
    var w = size === 'desktop' ? 72 : 56;
    var h = size === 'desktop' ? 22 : 20;
    a.innerHTML =
      '<img class="film-partner-watch__logo" src="' + logo + '" alt="" width="' + w + '" height="' + h + '" decoding="async" />';
    bindPartnerIconClick(a, partner, kpId);
    return a;
  }

  function removePartnerBlocks(scope) {
    if (!scope) return;
    scope.querySelectorAll('.film-partner-watch-block').forEach(function (el) { el.remove(); });
    scope.querySelectorAll('.film-partner-watch-mobile-anchor').forEach(function (el) { el.remove(); });
  }

  function mountPartnerBlock(container, partners, kpId, mode) {
    if (!container || !partners || !partners.length) return null;
    removePartnerBlocks(container);
    var block = document.createElement('div');
    block.className = 'film-partner-watch-block film-partner-watch-block--' + mode;
    var label = document.createElement('div');
    label.className = 'film-partner-watch__label';
    label.textContent = 'Смотреть на';
    var logos = document.createElement('div');
    logos.className = 'film-partner-watch__logos';
    for (var i = 0; i < partners.length; i++) {
      var link = buildPartnerIconLink(partners[i], kpId, mode);
      if (link) logos.appendChild(link);
    }
    if (!logos.children.length) return null;
    block.appendChild(label);
    block.appendChild(logos);
    container.insertBefore(block, container.firstChild);
    metrikaGoal('stream_block_view', { kp_id: String(kpId || ''), count: String(partners.length) });
    return block;
  }

  function mountDesktopPartnerBlock(shell, partners, kpId) {
    if (!shell || !partners.length) return;
    mountPartnerBlock(shell, partners, kpId, 'desktop');
  }

  function mountMobilePartnerBlock(pageRoot, partners, kpId) {
    if (!pageRoot || !partners.length) return;
    var similar = pageRoot.querySelector('.film-page-similar-section');
    if (!similar || !similar.parentNode) return;
    pageRoot.querySelectorAll('.film-partner-watch-mobile-anchor').forEach(function (el) { el.remove(); });
    var anchor = document.createElement('div');
    anchor.className = 'film-partner-watch-mobile-anchor';
    similar.parentNode.insertBefore(anchor, similar);
    mountPartnerBlock(anchor, partners, kpId, 'mobile');
  }

  function mountPartnerWatchPills(pageRoot, kpId) {
    if (!pageRoot || !kpId || isNaN(Number(kpId))) return Promise.resolve();
    var url = API_BASE + '/api/public/film/' + encodeURIComponent(kpId) + '/watch-partners';
    return fetch(url, { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var partners = (data && data.partners) || [];
        var usable = [];
        for (var i = 0; i < partners.length; i++) {
          var p = partners[i];
          if (!p || !p.url) continue;
          if (p.key !== 'flex' && p.key !== 'ivi') continue;
          p.kp_id = kpId;
          usable.push(p);
        }
        if (!usable.length) return;
        var shell = wrapToolbarIconsShell(pageRoot);
        if (shell) mountDesktopPartnerBlock(shell, usable, kpId);
        mountMobilePartnerBlock(pageRoot, usable, kpId);
      })
      .catch(function () {});
  }

  function mountStreamingBlock(pageRoot, kpId, title) {
    return mountPartnerWatchPills(pageRoot, kpId);
  }

  function subscribePromptHtml(opts) {
    opts = opts || {};
    var type = opts.type || 'streaming';
    var copy = opts.copy || 'Сообщите, когда фильм появится онлайн';
    var kpId = opts.kpId || '';
    return (
      '<div class="mp-subscribe-prompt" data-mp-subscribe="' + type + '" data-kp-id="' + kpId + '">' +
      '<p class="mp-subscribe-prompt__text">' + copy + '</p>' +
      '<form class="mp-subscribe-prompt__form">' +
      '<input type="email" name="email" class="mp-subscribe-prompt__input" placeholder="Email" autocomplete="email" required />' +
      '<button type="submit" class="mp-subscribe-prompt__btn">Подписаться</button>' +
      '</form>' +
      '<p class="mp-subscribe-prompt__status" hidden></p>' +
      '</div>'
    );
  }

  function mountSubscribePrompt(pageRoot, opts) {
    if (!pageRoot || isProUser()) return;
    opts = opts || {};
    if (pageRoot.querySelector('.mp-subscribe-prompt')) return;

    var type = opts.type || 'streaming';
    var kpId = opts.kpId || '';
    var placement = opts.placement || 'film';
    metrikaGoal('subscribe_prompt_view', { type: type, kp_id: String(kpId), placement: placement });

    var wrap = document.createElement('div');
    wrap.innerHTML = subscribePromptHtml(opts);
    var block = wrap.firstChild;
    if (!block) return;

    var anchor = pageRoot.querySelector('.mp-watch-anchor') || pageRoot.querySelector('.film-page-toolbar');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(block, anchor.nextSibling);
    } else {
      pageRoot.appendChild(block);
    }

    var form = block.querySelector('form');
    var status = block.querySelector('.mp-subscribe-prompt__status');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (form.querySelector('input[name="email"]') || {}).value || '';
      metrikaGoal('subscribe_submit', { type: type, channel: 'email', kp_id: String(kpId) });
      fetch(API_BASE + '/api/public/film-alert/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, kp_id: Number(kpId), alert_type: type }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (status) {
            status.hidden = false;
            status.textContent = d && d.ok
              ? (d.needs_confirm ? 'Проверьте почту и подтвердите подписку.' : 'Вы уже подписаны.')
              : 'Не удалось подписаться. Проверьте email.';
          }
          if (d && d.ok) metrikaGoal('subscribe_confirm', { type: type });
        })
        .catch(function () {
          if (status) {
            status.hidden = false;
            status.textContent = 'Ошибка сети. Попробуйте позже.';
          }
        });
    });
  }

  function initFilmPageFromRoot(pageRoot, kpIdOverride) {
    var root = pageRoot || document.getElementById('film-page-content') || document.querySelector('main.film-page');
    if (!root) return Promise.resolve();
    var hero = root.querySelector('.film-hero-with-tag[data-kp-id]');
    var kpId = kpIdOverride || (hero && hero.getAttribute('data-kp-id'));
    if (!kpId) return Promise.resolve();
    var isSeries = !!(hero && hero.getAttribute('data-is-series') === '1');
    return initFilmPage({ root: root, kpId: kpId, isSeries: isSeries });
  }

  function initFilmPage(opts) {
    opts = opts || {};
    var pageRoot = opts.root || document.getElementById('film-page-content') || document.querySelector('main.film-page');
    var kpId = opts.kpId || '';
    var title = opts.title || '';
    var isSeries = !!opts.isSeries;
    if (!pageRoot || !kpId) return;

    ensureAdSlots(pageRoot);
    mountPartnerWatchPills(pageRoot, kpId).then(function () {
      var watch = pageRoot.querySelector('.film-partner-watch-block');
      if (!watch) {
        mountSubscribePrompt(pageRoot, {
          type: isSeries ? 'series' : 'streaming',
          kpId: kpId,
          copy: isSeries ? 'Уведомите о новых сериях' : 'Сообщите, когда фильм появится онлайн',
          placement: 'film',
        });
      }
    });
  }

  function initStaffPage(opts) {
    opts = opts || {};
    var pageRoot = opts.root || document.getElementById('staff-page-content') || document.querySelector('main.staff-page');
    var personId = opts.personId || '';
    if (!pageRoot || !personId) return;
    ensureAdSlots(pageRoot);
    fetch(API_BASE + '/api/public/monetization/partners?person_id=' + encodeURIComponent(personId), { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = (d && d.items) || [];
        if (!items.length) return;
        var html = streamingBlockHtml([], items);
        if (!html) return;
        var anchor = document.createElement('div');
        anchor.className = 'mp-watch-anchor mp-watch-anchor--staff';
        anchor.innerHTML = html.replace('Смотреть онлайн', 'Партнёрские курсы');
        var hero = pageRoot.querySelector('.staff-hero') || pageRoot.querySelector('.hero') || pageRoot;
        if (hero && hero.parentNode) {
          hero.parentNode.insertBefore(anchor, hero.nextSibling);
        }
        bindStreamClicks(anchor, personId);
      })
      .catch(function () {});
  }

  global.MpMonetization = {
    initFilmPage: initFilmPage,
    initFilmPageFromRoot: initFilmPageFromRoot,
    initStaffPage: initStaffPage,
    metrikaGoal: metrikaGoal,
    fetchConfig: fetchConfig,
  };
})(typeof window !== 'undefined' ? window : this);
