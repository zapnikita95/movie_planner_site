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

  function mountDesktopPartnerPill(shell, partner) {
    if (!shell || !partner || partner.key !== 'flex') return;
    if (shell.querySelector('.film-partner-watch--desktop')) return;
    var a = document.createElement('a');
    a.className = 'film-partner-watch film-partner-watch--desktop film-partner-watch--flex';
    a.href = partner.url;
    a.target = '_blank';
    a.rel = 'noopener sponsored';
    a.setAttribute('data-partner', 'flex');
    a.setAttribute('data-affiliate', partner.has_affiliate ? '1' : '0');
    a.innerHTML =
      '<span class="film-partner-watch__label">Смотреть на</span>' +
      '<img class="film-partner-watch__logo" src="' + partnerFlexLogoUrl() + '" alt="FLEX" width="72" height="20" decoding="async" />';
    shell.insertBefore(a, shell.firstChild);
    a.addEventListener('click', function () {
      metrikaGoal('stream_click', {
        platform: 'flex',
        kp_id: String(partner.kp_id || ''),
        has_affiliate: partner.has_affiliate ? '1' : '0',
      });
    });
  }

  function mountMobilePartnerPill(pageRoot, partner) {
    if (!pageRoot || !partner || partner.key !== 'flex') return;
    if (pageRoot.querySelector('.film-partner-watch--mobile')) return;
    var similar = pageRoot.querySelector('.film-page-similar-section');
    if (!similar || !similar.parentNode) return;
    var a = document.createElement('a');
    a.className = 'film-partner-watch film-partner-watch--mobile film-partner-watch--flex';
    a.href = partner.url;
    a.target = '_blank';
    a.rel = 'noopener sponsored';
    a.setAttribute('data-partner', 'flex');
    a.setAttribute('data-affiliate', partner.has_affiliate ? '1' : '0');
    a.innerHTML =
      '<span class="film-partner-watch__row">' +
      '<span class="film-partner-watch__label">Смотреть на</span>' +
      '<img class="film-partner-watch__logo" src="' + partnerFlexLogoUrl() + '" alt="FLEX" width="64" height="18" decoding="async" />' +
      '</span>';
    similar.parentNode.insertBefore(a, similar);
    a.addEventListener('click', function () {
      metrikaGoal('stream_click', {
        platform: 'flex',
        kp_id: String(partner.kp_id || ''),
        has_affiliate: partner.has_affiliate ? '1' : '0',
      });
    });
    metrikaGoal('stream_block_view', { kp_id: String(partner.kp_id || ''), count: '1' });
  }

  function mountPartnerWatchPills(pageRoot, kpId) {
    if (!pageRoot || !kpId || isNaN(Number(kpId))) return Promise.resolve();
    var url = API_BASE + '/api/public/film/' + encodeURIComponent(kpId) + '/watch-partners';
    return fetch(url, { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var partners = (data && data.partners) || [];
        var flex = null;
        for (var i = 0; i < partners.length; i++) {
          if (partners[i] && partners[i].key === 'flex' && partners[i].url) {
            flex = partners[i];
            break;
          }
        }
        if (!flex) return;
        flex.kp_id = kpId;
        var shell = wrapToolbarIconsShell(pageRoot);
        if (shell) mountDesktopPartnerPill(shell, flex);
        mountMobilePartnerPill(pageRoot, flex);
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

  function initFilmPage(opts) {
    opts = opts || {};
    var pageRoot = opts.root || document.getElementById('film-page-content') || document.querySelector('main.film-page');
    var kpId = opts.kpId || '';
    var title = opts.title || '';
    var isSeries = !!opts.isSeries;
    if (!pageRoot || !kpId) return;

    ensureAdSlots(pageRoot);
    mountPartnerWatchPills(pageRoot, kpId).then(function () {
      var watch = pageRoot.querySelector('.film-partner-watch');
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
    initStaffPage: initStaffPage,
    metrikaGoal: metrikaGoal,
    fetchConfig: fetchConfig,
  };
})(typeof window !== 'undefined' ? window : this);
