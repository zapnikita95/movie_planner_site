/**
 * Movie Planner monetization: RSYA, streaming affiliates, niche partners, film alerts.
 * POSTER_2SUB_OVERLAY_V1
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
        var platform = this.getAttribute('data-platform') || this.getAttribute('data-partner') || 'other';
        trackStreamPartnerClick(
          {
            key: platform,
            has_affiliate: this.getAttribute('data-affiliate') === '1',
          },
          kpId,
          'watch_block'
        );
      });
    }
  }

  function ensurePartnersSlot(shell) {
    if (!shell) return null;
    var slot = shell.querySelector('.film-toolbar-partners-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'film-toolbar-partners-slot';
      shell.insertBefore(slot, shell.firstChild);
    }
    return slot;
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

  function partnerTvigleLogoUrl() {
    return '/images/partners/tvigle-logo.svg';
  }

  function partner2subLogoUrl() {
    return '/images/partners/2sub-logo.png';
  }

  function partnerStartLogoUrl() {
    return '/images/partners/start-logo.svg';
  }

  function partnerTicketlandLogoUrl() {
    return '/images/partners/ticketland-logo.svg';
  }

  function partnerLogoUrl(partner) {
    if (!partner) return '';
    if (partner.logo) return partner.logo;
    if (partner.key === 'ivi') return partnerIviLogoUrl();
    if (partner.key === 'tvigle') return partnerTvigleLogoUrl();
    if (partner.key === '2sub') return partner2subLogoUrl();
    if (partner.key === 'flex') return partnerFlexLogoUrl();
    if (partner.key === 'start') return partnerStartLogoUrl();
    if (partner.key === 'ticketland') return partnerTicketlandLogoUrl();
    return '';
  }

  function partnerAlt(partner) {
    if (!partner) return '';
    if (partner.key === 'ivi') return 'ivi';
    if (partner.key === 'tvigle') return 'Tvigle';
    if (partner.key === '2sub') return '2SUB';
    if (partner.key === 'flex') return 'FLEX';
    if (partner.key === 'start') return 'START';
    if (partner.key === 'ticketland') return 'Ticketland';
    return partner.label || partner.key || '';
  }

  function partnerLogoDimensions(partner, size) {
    if (partner && partner.key === 'tvigle') {
      return size === 'desktop' ? { w: 64, h: 20 } : { w: 56, h: 18 };
    }
    if (partner && partner.key === 'ivi') {
      return size === 'desktop' ? { w: 56, h: 22 } : { w: 48, h: 20 };
    }
    return size === 'desktop' ? { w: 72, h: 22 } : { w: 56, h: 20 };
  }

  function trackStreamPartnerClick(partner, kpId, surface) {
    var key = (partner && partner.key) || 'other';
    var params = {
      partner: key,
      platform: key,
      kp_id: String(kpId || ''),
      surface: surface || 'unknown',
      placement: 'film_toolbar',
      has_affiliate: partner && partner.has_affiliate ? '1' : '0',
      commission_model: (partner && partner.commission_model) || 'unknown',
    };
    metrikaGoal('stream_click', params);
    if (key === 'flex' || key === 'ivi' || key === 'tvigle' || key === '2sub' || key === 'start') {
      metrikaGoal('stream_partner_' + key, params);
    }
  }

  function ticketPartnerLogoUrl() {
    return '/images/partners/tbank-afisha-t.svg';
  }

  function isMobileFilmLayout() {
    try {
      return window.matchMedia('(max-width: 860px)').matches;
    } catch (_e) {
      return false;
    }
  }

  function buildTafishaBtnHtml() {
    return (
      '<span class="film-t-afisha-btn__icon" aria-hidden="true">' +
        '<img src="' + ticketPartnerLogoUrl() + '" alt="" width="18" height="22" decoding="async" />' +
      '</span>' +
      '<span class="film-t-afisha-btn__label">Билеты</span>'
    );
  }

  function bindTafishaClick(a, partner, kpId, surface) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      trackStreamPartnerClick(partner, kpId, surface);
      var url = partner && partner.url;
      if (url) {
        try {
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch (_o) {
          window.location.href = url;
        }
      }
      try {
        if (global.MpAppPromoDialog && typeof global.MpAppPromoDialog.showTafishaTicketHint === 'function') {
          global.MpAppPromoDialog.showTafishaTicketHint();
        }
      } catch (_d) {}
    });
  }

  function mountPosterTafishaCta(pageRoot, partner, kpId) {
    if (!pageRoot || !partner || !partner.url) return;
    var wrap = pageRoot.querySelector('.poster-wrap');
    if (!wrap || wrap.querySelector('.film-poster-t-afisha-cta')) return;

    var a = document.createElement('a');
    a.className = 'film-poster-t-afisha-cta';
    a.href = partner.url;
    a.setAttribute('role', 'button');
    a.setAttribute('data-partner', 't_afisha');
    a.setAttribute('data-affiliate', partner.has_affiliate ? '1' : '0');
    a.setAttribute('aria-label', 'Билеты на T-Афише');
    a.innerHTML = buildTafishaBtnHtml();
    bindTafishaClick(a, partner, kpId, 'poster_overlay_tickets');
    wrap.appendChild(a);
    metrikaGoal('stream_block_view', {
      kp_id: String(kpId || ''),
      count: '1',
      surface: 'poster_overlay_tickets',
      partners: 't_afisha',
      placement: 'film_poster',
    });
  }

  function mountToolbarTafishaBtn(planWrap, partner, kpId) {
    if (!planWrap || !partner || !partner.url || planWrap.querySelector('.film-t-afisha-btn')) return;

    var a = document.createElement('a');
    a.className = 'film-t-afisha-btn';
    a.href = partner.url;
    a.setAttribute('role', 'button');
    a.setAttribute('data-partner', 't_afisha');
    a.setAttribute('data-affiliate', partner.has_affiliate ? '1' : '0');
    a.setAttribute('aria-label', 'Билеты на T-Афише');
    a.innerHTML = buildTafishaBtnHtml();
    bindTafishaClick(a, partner, kpId, 'film_toolbar_tickets');
    planWrap.insertBefore(a, planWrap.firstChild);
    metrikaGoal('stream_block_view', {
      kp_id: String(kpId || ''),
      count: '1',
      surface: 'film_toolbar_tickets',
      partners: 't_afisha',
      placement: 'film_toolbar',
    });
  }

  function mountTicketPartnerButton(pageRoot, kpId, opts) {
    if (!pageRoot || !kpId || isNaN(Number(kpId))) return Promise.resolve();
    opts = opts || {};
    if (opts.isSeries) return Promise.resolve();

    var city = (opts.city || 'moscow').toLowerCase();
    var url = API_BASE + '/api/public/film/' + encodeURIComponent(kpId) + '/ticket-partners?city=' + encodeURIComponent(city);
    return fetch(url, { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var partners = (data && data.partners) || [];
        var partner = null;
        for (var i = 0; i < partners.length; i++) {
          if (partners[i] && partners[i].key === 't_afisha' && partners[i].url) {
            partner = partners[i];
            break;
          }
        }
        if (!partner || !partner.url) return;
        if (isMobileFilmLayout()) {
          pageRoot.querySelectorAll('.film-toolbar-plan-wrap .film-t-afisha-btn').forEach(function (el) {
            el.remove();
          });
          mountPosterTafishaCta(pageRoot, partner, kpId);
        } else {
          pageRoot.querySelectorAll('.film-poster-t-afisha-cta').forEach(function (el) {
            el.remove();
          });
          var planWrap = pageRoot.querySelector('.film-toolbar-plan-wrap');
          if (planWrap) mountToolbarTafishaBtn(planWrap, partner, kpId);
        }
      })
      .catch(function () {});
  }

  function bindPartnerIconClick(a, partner, kpId, surface) {
    a.addEventListener('click', function () {
      trackStreamPartnerClick(partner, kpId, surface);
    });
  }

  function buildPartnerIconLink(partner, kpId, size) {
    if (!partner || !partner.url) return null;
    var logo = partnerLogoUrl(partner);
    var a = document.createElement('a');
    a.className = 'film-partner-watch__icon film-partner-watch__icon--' + (partner.key || 'other');
    a.href = partner.url;
    a.target = '_blank';
    a.rel = 'noopener sponsored';
    a.setAttribute('data-partner', partner.key || 'other');
    a.setAttribute('data-affiliate', partner.has_affiliate ? '1' : '0');
    a.setAttribute('aria-label', partnerAlt(partner));
    if (logo) {
      var dims = partnerLogoDimensions(partner, size);
      a.innerHTML =
        '<img class="film-partner-watch__logo" src="' + logo + '" alt="" width="' + dims.w + '" height="' + dims.h + '" decoding="async" />';
    } else {
      a.className += ' film-partner-watch__icon--text';
      a.textContent = partnerAlt(partner);
    }
    bindPartnerIconClick(a, partner, kpId, size);
    return a;
  }

  function removePartnerBlocks(scope) {
    if (!scope) return;
    scope.querySelectorAll('.film-partner-watch-block').forEach(function (el) { el.remove(); });
    scope.querySelectorAll('.film-partner-watch-mobile-anchor').forEach(function (el) { el.remove(); });
    scope.querySelectorAll('.film-toolbar-partners-slot:empty').forEach(function (el) { el.remove(); });
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
    var partnerKeys = [];
    for (var j = 0; j < partners.length; j++) {
      if (partners[j] && partners[j].key) partnerKeys.push(partners[j].key);
    }
    metrikaGoal('stream_block_view', {
      kp_id: String(kpId || ''),
      count: String(partners.length),
      surface: mode,
      partners: partnerKeys.join(','),
      placement: 'film_toolbar',
    });
    return block;
  }

  function mountDesktopPartnerBlock(shell, partners, kpId) {
    if (!shell || !partners.length) return;
    var slot = ensurePartnersSlot(shell);
    if (slot) mountPartnerBlock(slot, partners, kpId, 'desktop');
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

  function removePosterPartnerCtas(scope) {
    if (!scope) return;
    scope.querySelectorAll('.film-poster-2sub-cta').forEach(function (el) { el.remove(); });
    scope.querySelectorAll('.film-poster-t-afisha-cta').forEach(function (el) { el.remove(); });
    scope.querySelectorAll('.film-toolbar-plan-wrap .film-t-afisha-btn').forEach(function (el) { el.remove(); });
  }

  function mountPoster2subCta(pageRoot, partner, kpId) {
    if (!pageRoot || !partner || partner.key !== '2sub' || !partner.url) return;
    var wrap = pageRoot.querySelector('.poster-wrap');
    if (!wrap) return;
    wrap.querySelectorAll('.film-poster-2sub-cta').forEach(function (el) { el.remove(); });
    var a = document.createElement('a');
    a.className = 'film-poster-2sub-cta';
    a.href = partner.url;
    a.target = '_blank';
    a.rel = 'noopener sponsored';
    a.setAttribute('data-partner', '2sub');
    a.setAttribute('data-affiliate', partner.has_affiliate ? '1' : '0');
    a.setAttribute('aria-label', 'Смотреть с субтитрами на 2SUB');
    a.innerHTML =
      '<span class="film-poster-2sub-cta__line">Смотреть с субтитрами</span>' +
      '<span class="film-poster-2sub-cta__line film-poster-2sub-cta__brand">' +
        '<span class="film-poster-2sub-cta__on">на</span>' +
        '<img class="film-partner-watch__logo" src="' + partner2subLogoUrl() + '" alt="" width="56" height="20" decoding="async" />' +
      '</span>';
    bindPartnerIconClick(a, partner, kpId, 'poster_overlay');
    wrap.appendChild(a);
    metrikaGoal('stream_block_view', {
      kp_id: String(kpId || ''),
      count: '1',
      surface: 'poster_overlay',
      partners: '2sub',
      placement: 'film_poster',
    });
  }

  function mountPartnerWatchPills(pageRoot, kpId) {
    if (!pageRoot || !kpId || isNaN(Number(kpId))) return Promise.resolve();
    var url = API_BASE + '/api/public/film/' + encodeURIComponent(kpId) + '/watch-partners';
    return fetch(url, { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var partners = (data && data.partners) || [];
        var primary = [];
        var startPartner = null;
        for (var i = 0; i < partners.length; i++) {
          var p = partners[i];
          if (!p || !p.url) continue;
          if (p.key === 'start') {
            startPartner = p;
            continue;
          }
          if (p.key !== 'flex' && p.key !== 'tvigle' && p.key !== 'ivi' && p.key !== '2sub') continue;
          p.kp_id = kpId;
          primary.push(p);
        }
        var usable = primary.slice(0, WATCH_PARTNER_SLOT_MAX);
        if (usable.length < WATCH_PARTNER_SLOT_MAX && startPartner) {
          startPartner.kp_id = kpId;
          usable.push(startPartner);
        }
        if (!usable.length) return;
        var twosub = null;
        for (var t = 0; t < usable.length; t++) {
          if (usable[t] && usable[t].key === '2sub') {
            twosub = usable[t];
            break;
          }
        }
        if (twosub) mountPoster2subCta(pageRoot, twosub, kpId);
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

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var PRODUCT_SHELF_DESKTOP_MIN = 1100;
  var PRODUCT_SHELF_MIN_W = 168;
  var PRODUCT_SHELF_GUTTER_GAP = 16;
  var PRODUCT_SHELF_EDGE_PAD = 12;
  var WATCH_PARTNER_SLOT_MAX = 3;
  var _productOfferCache = Object.create(null);
  var _courseOfferCache = Object.create(null);
  var _productShelfKp = '';
  var _productShelfBound = false;
  var _adtunePop = null;
  var _adtuneBtn = null;

  function fetchProductOffers(kpId) {
    var key = String(kpId || '').replace(/\D/g, '');
    if (!key) return Promise.resolve([]);
    if (_productOfferCache[key]) return Promise.resolve(_productOfferCache[key]);
    return fetch(API_BASE + '/api/public/film/' + encodeURIComponent(key) + '/product-offers', { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = (d && d.items) || [];
        _productOfferCache[key] = items;
        return items;
      })
      .catch(function () { return []; });
  }

  function fetchCourseOffers(pageRoot, kpId) {
    var key = String(kpId || '').replace(/\D/g, '');
    if (!key) return Promise.resolve([]);
    if (_courseOfferCache[key]) return Promise.resolve(_courseOfferCache[key]);
    var directorId = filmDirectorId(pageRoot);
    var genres = filmGenresParam(pageRoot);
    var qs = '';
    if (directorId) qs += '&director_id=' + encodeURIComponent(directorId);
    if (genres) qs += '&genres=' + encodeURIComponent(genres);
    var url = API_BASE + '/api/public/film/' + encodeURIComponent(key) + '/course-offers' + (qs ? ('?' + qs.replace(/^&/, '')) : '');
    return fetch(url, { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = (d && d.items) || [];
        _courseOfferCache[key] = items;
        return items;
      })
      .catch(function () { return []; });
  }

  function productCardHtml(it) {
    var href = escapeHtml(it.url || '#');
    var title = escapeHtml(it.title || '');
    var plat = escapeHtml(it.platform || '');
    var price = escapeHtml(it.price || '');
    var mp = escapeHtml(it.marketplace || 'Ozon');
    var legal = escapeHtml(it.legal || 'Реклама');
    var image = String(it.image || it.image_url || '');
    if (image.indexOf('https://') !== 0) image = '';
    var platHtml = plat ? '<span class="mp-offer-plat">' + plat + '</span>' : '';
    var cover = image
      ? ('<a class="mp-offer-cover-link" href="' + href + '" target="_blank" rel="noopener sponsored nofollow">' +
          '<img class="mp-offer-cover" src="' + escapeHtml(image) + '" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.add(\'is-broken\')">' +
          platHtml +
        '</a>')
      : ('<div class="mp-offer-cover-link mp-offer-cover-link--empty">' + platHtml + '</div>');
    return (
      '<article class="mp-offer-card">' +
        cover +
        '<div class="mp-offer-adtune-bar">' +
          '<span class="mp-offer-ad-label">Реклама</span>' +
          '<button type="button" class="mp-offer-adtune" aria-label="Сведения о рекламе" aria-expanded="false" data-legal="' + legal + '">' +
            '<svg width="16" height="4" viewBox="0 0 16 4" fill="currentColor" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
              '<circle cx="2" cy="2" r="1.5"></circle>' +
              '<circle cx="8" cy="2" r="1.5"></circle>' +
              '<circle cx="14" cy="2" r="1.5"></circle>' +
            '</svg>' +
          '</button>' +
        '</div>' +
        '<div class="mp-offer-body">' +
          '<a class="mp-offer-title" href="' + href + '" target="_blank" rel="noopener sponsored nofollow">' + title + '</a>' +
          (price ? '<div class="mp-offer-price">' + price + '</div>' : '') +
          '<a class="mp-offer-cta" href="' + href + '" target="_blank" rel="noopener sponsored nofollow">Купить на ' + mp + '</a>' +
        '</div>' +
      '</article>'
    );
  }

  function courseCardHtml(item) {
    /* COURSE_OFFERS_SYNC_V2 — same shelf slot as games; Sync CPC wins on collision */
    var href = escapeHtml(item.url || item.destination_url || '#');
    var title = escapeHtml(item.title || '');
    var lead = escapeHtml(item.lead || '');
    var cta = escapeHtml(item.cta || 'Откройте курс');
    var legal = escapeHtml(item.legal || 'Реклама');
    return (
      '<article class="mp-offer-card mp-offer-card--course" data-course-id="' + escapeHtml(item.id || '') + '">' +
        '<div class="mp-offer-cover-link mp-offer-cover-link--course">' +
          '<span class="mp-offer-plat">Курс</span>' +
        '</div>' +
        '<div class="mp-offer-adtune-bar">' +
          '<span class="mp-offer-ad-label">Реклама</span>' +
          '<button type="button" class="mp-offer-adtune" aria-label="Сведения о рекламе" aria-expanded="false" data-legal="' + legal + '">' +
            '<svg width="16" height="4" viewBox="0 0 16 4" fill="currentColor" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
              '<circle cx="2" cy="2" r="1.5"></circle>' +
              '<circle cx="8" cy="2" r="1.5"></circle>' +
              '<circle cx="14" cy="2" r="1.5"></circle>' +
            '</svg>' +
          '</button>' +
        '</div>' +
        '<div class="mp-offer-body">' +
          '<a class="mp-offer-title" href="' + href + '" target="_blank" rel="noopener sponsored nofollow">' + title + '</a>' +
          (lead ? '<p class="mp-offer-course-lead">' + lead + '</p>' : '') +
          '<a class="mp-offer-cta" href="' + href + '" target="_blank" rel="noopener sponsored nofollow">' + cta + '</a>' +
        '</div>' +
      '</article>'
    );
  }

  function courseListHtml(items) {
    return '<div class="mp-product-list">' + items.map(courseCardHtml).join('') + '</div>';
  }

  function bindCourseClicks(root, kpId) {
    if (!root) return;
    root.querySelectorAll('.mp-offer-card--course a[href]').forEach(function (a) {
      a.addEventListener('click', function () {
        var card = a.closest('.mp-offer-card--course');
        metrikaGoal('course_click', {
          kp_id: String(kpId || ''),
          course: card ? (card.getAttribute('data-course-id') || '') : '',
          placement: 'film_product_shelf',
        });
      });
    });
  }

  function closeOfferAdtune() {
    if (_adtunePop) _adtunePop.hidden = true;
    if (_adtuneBtn) {
      _adtuneBtn.setAttribute('aria-expanded', 'false');
      _adtuneBtn = null;
    }
    document.querySelectorAll('.mp-product-track.is-looping').forEach(function (t) {
      t.classList.remove('is-adtune-open');
    });
  }

  function ensureOfferAdtunePop() {
    if (_adtunePop) return _adtunePop;
    var el = document.createElement('div');
    el.id = 'mp_offer_adtune_pop';
    el.className = 'mp-offer-adtune-pop';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Сведения о рекламе');
    document.body.appendChild(el);
    _adtunePop = el;
    document.addEventListener('click', function (e) {
      if (!_adtunePop || _adtunePop.hidden) return;
      if (_adtunePop.contains(e.target)) return;
      if (_adtuneBtn && _adtuneBtn.contains(e.target)) return;
      closeOfferAdtune();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeOfferAdtune();
    });
    return el;
  }

  function toggleOfferAdtune(btn) {
    var pop = ensureOfferAdtunePop();
    if (_adtuneBtn === btn && !pop.hidden) {
      closeOfferAdtune();
      return;
    }
    _adtuneBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    pop.textContent = btn.getAttribute('data-legal') || 'Реклама';
    pop.hidden = false;
    var r = btn.getBoundingClientRect();
    var w = Math.min(280, Math.max(180, (window.innerWidth || 360) - 16));
    var left = r.right - w;
    if (left < 8) left = 8;
    if (left + w > (window.innerWidth || 0) - 8) left = Math.max(8, (window.innerWidth || 0) - w - 8);
    var top = r.bottom + 6;
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
    pop.style.width = Math.round(w) + 'px';
    var track = btn.closest('.mp-product-track');
    if (track) track.classList.add('is-adtune-open');
  }

  function bindOfferAdtune(root) {
    if (!root) return;
    root.querySelectorAll('.mp-offer-adtune').forEach(function (btn) {
      if (btn.closest('[aria-hidden="true"]')) return;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleOfferAdtune(btn);
      });
    });
  }

  function productListHtml(items) {
    return '<div class="mp-product-list">' + items.map(productCardHtml).join('') + '</div>';
  }

  function bindProductClicks(root, kpId) {
    if (!root) return;
    root.querySelectorAll('a[href*="takprdm.ru"]').forEach(function (a) {
      a.addEventListener('click', function () {
        metrikaGoal('takprodam_click', {
          kp_id: String(kpId || ''),
          placement: root.classList.contains('mp-product-shelf--desktop') ? 'film_left' : 'film_after_similar',
        });
      });
    });
  }

  /* TAKPRODAM_FINITE1 — auto-loop only; hover/wheel/drag is a finite list */
  var _productScrollBound = typeof WeakSet === 'function' ? new WeakSet() : null;

  function productLoopEl(track) {
    return track && track.querySelector('.mp-product-loop');
  }

  function productFirstList(track) {
    var loop = productLoopEl(track);
    return (loop && loop.querySelector('.mp-product-list')) || (track && track.querySelector('.mp-product-list'));
  }

  function productFirstListHeight(track) {
    var list = productFirstList(track);
    return list ? list.offsetHeight : 0;
  }

  function stripProductDup(track) {
    var loop = productLoopEl(track);
    if (!loop) return;
    var lists = loop.querySelectorAll('.mp-product-list');
    if (lists.length < 2) return;
    var half = lists[0].offsetHeight;
    if (half > 8 && track.scrollTop >= half) track.scrollTop -= half;
    for (var i = 1; i < lists.length; i++) lists[i].remove();
  }

  function ensureProductDup(track) {
    if (!track || !track.classList.contains('is-looping')) return;
    var loop = productLoopEl(track);
    var list = productFirstList(track);
    if (!loop || !list) return;
    if (loop.querySelectorAll('.mp-product-list').length > 1) return;
    var dup = list.cloneNode(true);
    dup.setAttribute('aria-hidden', 'true');
    loop.appendChild(dup);
  }

  function wrapProductAuto(track) {
    var half = productFirstListHeight(track);
    if (half <= 8) return;
    if (track.scrollTop >= half) track.scrollTop -= half;
  }

  function bindDesktopProductScroll(track) {
    if (!track || (_productScrollBound && _productScrollBound.has(track))) return;
    if (_productScrollBound) _productScrollBound.add(track);
    var lastTs = 0;
    var userUntil = 0;
    function onUser() {
      userUntil = Date.now() + 800;
      stripProductDup(track);
    }
    track.addEventListener('wheel', onUser, { passive: true });
    track.addEventListener('pointerdown', onUser);
    function tick(ts) {
      if (!track.isConnected) {
        if (_productScrollBound) _productScrollBound.delete(track);
        return;
      }
      requestAnimationFrame(tick);
      if (!track.classList.contains('is-looping')) {
        stripProductDup(track);
        lastTs = ts;
        return;
      }
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        stripProductDup(track);
        lastTs = ts;
        return;
      }
      var hover = false;
      try { hover = track.matches(':hover'); } catch (_m) {}
      if (hover || track.classList.contains('is-adtune-open') || Date.now() < userUntil) {
        stripProductDup(track);
        lastTs = ts;
        return;
      }
      ensureProductDup(track);
      var half = productFirstListHeight(track);
      if (half <= 8) {
        lastTs = ts;
        return;
      }
      var ms = parseFloat(String(track.style.getPropertyValue('--mp-product-loop-ms') || '24000')) || 24000;
      var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
      lastTs = ts;
      track._mpAutoScrolling = true;
      track.scrollTop += Math.max(0.35, (half / (ms / 1000)) * dt);
      wrapProductAuto(track);
      track._mpAutoScrolling = false;
    }
    requestAnimationFrame(tick);
  }

  function syncProductLoop(track) {
    if (!track || track.closest('.mp-product-shelf--mobile')) return;
    var loop = track.querySelector('.mp-product-loop');
    var list = track.querySelector('.mp-product-list');
    if (!list) return;
    if (!loop) {
      loop = document.createElement('div');
      loop.className = 'mp-product-loop';
      list.parentNode.insertBefore(loop, list);
      loop.appendChild(list);
    }
    loop.querySelectorAll('.mp-product-list').forEach(function (el, idx) {
      if (idx > 0) el.remove();
    });
    track.classList.remove('is-looping');
    track.style.removeProperty('--mp-product-loop-ms');
    var n = list.querySelectorAll('.mp-offer-card').length;
    if (n < 3) {
      bindDesktopProductScroll(track);
      return;
    }
    if (list.scrollHeight <= track.clientHeight + 8) {
      bindDesktopProductScroll(track);
      return;
    }
    var dup = list.cloneNode(true);
    dup.setAttribute('aria-hidden', 'true');
    loop.appendChild(dup);
    track.classList.add('is-looping');
    track.style.setProperty('--mp-product-loop-ms', String(Math.max(18000, n * 7000)) + 'ms');
    bindDesktopProductScroll(track);
  }

  function findFilmPageOuter() {
    return document.querySelector('#section-film .film-page-outer') || document.querySelector('.film-page-outer');
  }

  /* TAKPRODAM_GUTTER1 — same 16px gap to film card as RSY; stay below .cabinet-nav */
  function visibleTopChrome() {
    var bottom = 0;
    var navLeft = Infinity;
    var vh = window.innerHeight || 800;
    var header = document.getElementById('site-header');
    if (header && !header.classList.contains('site-header--retracted')) {
      var hr = header.getBoundingClientRect();
      if (hr.height >= 8 && hr.top < 90 && hr.bottom > bottom) bottom = hr.bottom;
    }
    var navs = document.querySelectorAll('.cabinet-nav, #film-standalone-nav, nav.film-standalone-nav');
    for (var i = 0; i < navs.length; i++) {
      var el = navs[i];
      if (!el || el.classList.contains('hidden') || el.classList.contains('mp-film-nav-dup-hidden')) continue;
      var st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
      var r = el.getBoundingClientRect();
      if (r.height < 16 || r.width < 80) continue;
      var pos = st.position;
      var bottomDock = (pos === 'fixed' || pos === 'sticky') && r.bottom >= (vh - 12);
      if (bottomDock) continue;
      if (r.left < navLeft) navLeft = r.left;
      if (r.top > vh * 0.45) continue;
      if (r.bottom > 8 && r.bottom > bottom) bottom = r.bottom;
    }
    return {
      bottom: bottom,
      navLeft: navLeft < Infinity ? navLeft : null
    };
  }

  function layoutDesktopProductShelf() {
    var rail = document.getElementById('mp_product_shelf_desktop');
    if (!rail) return;
    if (viewportIsDesktop() !== true) {
      rail.hidden = true;
      return;
    }
    var outer = findFilmPageOuter();
    if (!outer) {
      rail.hidden = true;
      return;
    }
    var rect = outer.getBoundingClientRect();
    var chrome = visibleTopChrome();
    var gap = PRODUCT_SHELF_GUTTER_GAP;
    var edge = PRODUCT_SHELF_EDGE_PAD;
    var maxW = rect.left - gap - edge;
    if (maxW < PRODUCT_SHELF_MIN_W) {
      rail.hidden = true;
      var mobile = document.getElementById('mp_product_shelf_mobile');
      if (mobile) mobile.classList.add('mp-product-shelf--fallback');
      return;
    }
    var mobileKeep = document.getElementById('mp_product_shelf_mobile');
    if (mobileKeep) mobileKeep.classList.remove('mp-product-shelf--fallback');
    var w = Math.min(220, maxW);
    var left = Math.round(rect.left - gap - w);
    if (left < edge) left = edge;
    var minTop = Math.max(12, Math.round(chrome.bottom + 10));
    var top = minTop;
    var vh = window.innerHeight || 800;
    var footer = document.querySelector('body > div.content-wrapper > footer')
      || document.querySelector('.content-wrapper > footer.footer')
      || document.querySelector('footer.footer');
    var floor = vh - 12;
    if (footer) {
      var fb = footer.getBoundingClientRect().top;
      if (fb < floor) floor = fb - 12;
    }
    rail.hidden = false;
    rail.style.left = left + 'px';
    rail.style.width = Math.round(w) + 'px';
    rail.style.maxHeight = Math.max(96, Math.round(floor - top)) + 'px';
    var h = rail.offsetHeight || 0;
    if (h && top + h > floor) {
      top = Math.max(minTop, Math.round(floor - h));
    }
    rail.style.top = top + 'px';
    var track = rail.querySelector('.mp-product-track');
    if (track) {
      var nextMax = Math.max(88, Math.round(floor - top - 4)) + 'px';
      var prevMax = track.style.maxHeight;
      var ready = track.getAttribute('data-mp-loop-ready') === '1';
      track.style.maxHeight = nextMax;
      if (!ready || prevMax !== nextMax) {
        syncProductLoop(track);
        track.setAttribute('data-mp-loop-ready', '1');
      }
    }
  }

  function viewportIsDesktop() {
    return (window.innerWidth || 0) >= PRODUCT_SHELF_DESKTOP_MIN;
  }

  function ensureProductShelfResize() {
    if (_productShelfBound) return;
    _productShelfBound = true;
    var raf = 0;
    function schedule() {
      if (raf) return;
      raf = window.requestAnimationFrame(function () {
        raf = 0;
        layoutDesktopProductShelf();
      });
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
  }

  function mountProductShelf(pageRoot, kpId) {
    var root = pageRoot || document.getElementById('film-page-content') || document.querySelector('main.film-page');
    var kp = String(kpId || '').replace(/\D/g, '');
    if (!root || !kp) return;
    _productShelfKp = kp;
    /* Sync CPC courses take the games shelf slot; no collision with Takprodam. */
    Promise.all([fetchCourseOffers(root, kp), fetchProductOffers(kp)]).then(function (pair) {
      if (String(_productShelfKp) !== kp) return;
      var courses = pair[0] || [];
      var games = pair[1] || [];
      closeOfferAdtune();
      document.querySelectorAll('.mp-product-shelf').forEach(function (el) { el.remove(); });
      document.querySelectorAll('.mp-course-banner-anchor').forEach(function (el) { el.remove(); });
      var useCourses = courses.length > 0;
      var itemsHtml = useCourses ? courseListHtml(courses) : productListHtml(games);
      if (!useCourses && (!games || !games.length)) return;
      var aria = useCourses ? 'Курсы' : 'Игры по мотивам';

      var desktop = document.createElement('aside');
      desktop.id = 'mp_product_shelf_desktop';
      desktop.className = 'mp-product-shelf mp-product-shelf--desktop' + (useCourses ? ' mp-product-shelf--course' : '');
      desktop.setAttribute('aria-label', aria);
      desktop.innerHTML = '<div class="mp-product-track"><div class="mp-product-loop">' + itemsHtml + '</div></div>';
      document.body.appendChild(desktop);
      if (useCourses) bindCourseClicks(desktop, kp);
      else bindProductClicks(desktop, kp);
      bindOfferAdtune(desktop);

      var mobile = document.createElement('aside');
      mobile.id = 'mp_product_shelf_mobile';
      mobile.className = 'mp-product-shelf mp-product-shelf--mobile' + (useCourses ? ' mp-product-shelf--course' : '');
      mobile.setAttribute('aria-label', aria);
      mobile.innerHTML = '<div class="mp-product-track"><div class="mp-product-loop">' + itemsHtml + '</div></div>';
      var similar = root.querySelector('.film-page-similar-section');
      var rsy = document.getElementById('mp_rsy_inline_after_similar');
      if (rsy && rsy.parentNode) rsy.parentNode.insertBefore(mobile, rsy);
      else if (similar && similar.parentNode) similar.parentNode.insertBefore(mobile, similar.nextSibling);
      else {
        var hero = root.querySelector(':scope > section.hero, :scope > section.film-hero-with-tag, :scope > section');
        if (hero) hero.insertAdjacentElement('afterend', mobile);
        else root.appendChild(mobile);
      }
      if (useCourses) bindCourseClicks(mobile, kp);
      else bindProductClicks(mobile, kp);
      bindOfferAdtune(mobile);
      syncProductLoop(mobile.querySelector('.mp-product-track'));
      ensureProductShelfResize();
      layoutDesktopProductShelf();
      try {
        if (global.MpRsy && typeof global.MpRsy.mountFilmAfterSimilar === 'function') {
          global.MpRsy.mountFilmAfterSimilar();
        }
      } catch (_rsy) {}
    });
  }

  function filmHeroEl(pageRoot) {
    var scope = pageRoot && pageRoot.querySelector ? pageRoot : document;
    return scope.querySelector('.film-hero-with-tag') || document.querySelector('.film-hero-with-tag');
  }

  function filmDirectorId(pageRoot) {
    var hero = filmHeroEl(pageRoot);
    var fromHero = hero && hero.getAttribute('data-director-id');
    if (fromHero && /^\d+$/.test(fromHero)) return fromHero;
    var dirRow = (pageRoot || document).querySelector('.film-cast-row .staff-cast-link[data-staff-kp]');
    var kp = dirRow && dirRow.getAttribute('data-staff-kp');
    return (kp && /^\d+$/.test(kp)) ? kp : '';
  }

  function filmGenresParam(pageRoot) {
    var hero = filmHeroEl(pageRoot);
    var fromHero = hero && hero.getAttribute('data-genres');
    if (fromHero) return fromHero;
    var line = (pageRoot || document).querySelector('#film-genres-line, .film-genres-line');
    return line ? String(line.textContent || '').trim() : '';
  }

  function filmTitleParam(pageRoot) {
    var el = document.getElementById('film-title');
    return el ? String(el.textContent || '').replace(/\s*\(\d{4}\)\s*$/, '').trim() : '';
  }

  function courseBannerHtml(item) {
    return courseCardHtml(item);
  }

  function mountCourseOffers(pageRoot, kpId) {
    /* Remount shelf after cast loads director_id — Sync takes games slot. */
    var key = String(kpId || '').replace(/\D/g, '');
    if (key) delete _courseOfferCache[key];
    mountProductShelf(pageRoot, kpId);
    return Promise.resolve();
  }

  function mountTicketPartners(pageRoot, kpId) {
    if (!pageRoot || !kpId || isNaN(Number(kpId))) return Promise.resolve();
    var title = filmTitleParam(pageRoot);
    var url = API_BASE + '/api/public/film/' + encodeURIComponent(kpId) + '/ticket-partners?city=moscow';
    if (title) url += '&title=' + encodeURIComponent(title);
    return fetch(url, { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var partners = (data && data.partners) || [];
        pageRoot.querySelectorAll('.mp-ticket-banner-anchor').forEach(function (el) { el.remove(); });
        var usable = [];
        for (var i = 0; i < partners.length; i++) {
          if (partners[i] && partners[i].url) usable.push(partners[i]);
        }
        if (!usable.length) return;
        var links = usable.map(function (p) {
          var logo = partnerLogoUrl(p);
          var label = escapeHtml(p.label || 'Билеты');
          var inner = logo
            ? ('<img class="mp-ticket-banner__logo" src="' + escapeHtml(logo) + '" alt="" width="72" height="22" decoding="async" />')
            : label;
          return (
            '<a class="mp-ticket-banner__link mp-ticket-banner__link--' + escapeHtml(p.key || 'other') + '" href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener sponsored nofollow" data-partner="' + escapeHtml(p.key || '') + '" aria-label="' + label + '">' +
              inner +
            '</a>'
          );
        }).join('');
        var anchor = document.createElement('div');
        anchor.className = 'mp-ticket-banner-anchor';
        anchor.innerHTML =
          '<aside class="mp-ticket-banner">' +
            '<span class="mp-ticket-banner__label">Билеты</span>' +
            '<div class="mp-ticket-banner__links">' + links + '</div>' +
          '</aside>';
        var similar = pageRoot.querySelector('.film-page-similar-section');
        if (similar && similar.parentNode) similar.parentNode.insertBefore(anchor, similar);
        else pageRoot.appendChild(anchor);
        anchor.querySelectorAll('.mp-ticket-banner__link').forEach(function (a) {
          a.addEventListener('click', function () {
            metrikaGoal('ticket_click', {
              kp_id: String(kpId || ''),
              partner: a.getAttribute('data-partner') || '',
              placement: 'film_before_similar',
            });
          });
        });
      })
      .catch(function () {});
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
    /* TAKPRODAM_SHELF_VERTICAL_LOOP */
    /* TAKPRODAM_ADTUNE */
    /* TAKPRODAM_JUICY2 TAKPRODAM_GRID2 TAKPRODAM_GUTTER1 */
    /* TAKPRODAM_COVER1 TAKPRODAM_HOVERSCROLL1 TAKPRODAM_FINITE1 */
    mountProductShelf(pageRoot, kpId);
    mountTicketPartners(pageRoot, kpId);
    try {
      pageRoot.querySelectorAll('.mp-subscribe-prompt[data-mp-subscribe="streaming"]').forEach(function (el) {
        el.remove();
      });
    } catch (_rm) {}
    mountPartnerWatchPills(pageRoot, kpId).then(function () {
      mountTicketPartnerButton(pageRoot, kpId, { isSeries: isSeries, city: 'moscow' });
      // Never show email "notify when online" for movies — empty watch-partners
      // is normal for theatrical releases; the prompt looked broken (guest Win).
      // Series keep the new-episode alert when no partner CTA is present.
      if (!isSeries) return;
      var watch = pageRoot.querySelector('.film-partner-watch-block');
      if (!watch) {
        mountSubscribePrompt(pageRoot, {
          type: 'series',
          kpId: kpId,
          copy: 'Уведомите о новых сериях',
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
    mountProductShelf: mountProductShelf,
    mountCourseOffers: mountCourseOffers,
    mountTicketPartners: mountTicketPartners,
    metrikaGoal: metrikaGoal,
    fetchConfig: fetchConfig,
  };

  try {
    if (document.body && document.body.classList.contains('film-standalone-page')) {
      initFilmPageFromRoot();
    }
  } catch (_bootShelf) {}
})(typeof window !== 'undefined' ? window : this);
