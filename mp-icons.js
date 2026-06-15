/**
 * Phosphor Icons helper for Movie Planner web.
 * Requires @phosphor-icons/web CSS (regular + duotone) in index.html.
 */
(function (global) {
  'use strict';

  var WEIGHT_CLASS = {
    regular: 'ph',
    duotone: 'ph-duotone',
    bold: 'ph-bold',
    fill: 'ph-fill',
  };

  /** @type {Record<string, {name: string, weight?: string}>} */
  var ICONS = {
    home: { name: 'house', weight: 'regular' },
    plans: { name: 'calendar-check', weight: 'regular' },
    library: { name: 'film-slate', weight: 'regular' },
    watch: { name: 'sparkle', weight: 'regular' },
    premieres: { name: 'mask-happy', weight: 'regular' },
    tournament: { name: 'trophy', weight: 'regular' },
    inbox: { name: 'bell', weight: 'regular' },
    random: { name: 'shuffle', weight: 'duotone' },
    shazam: { name: 'magic-wand', weight: 'duotone' },
    voice: { name: 'microphone', weight: 'duotone' },
    series: { name: 'television', weight: 'regular' },
    stats: { name: 'chart-bar', weight: 'regular' },
    integrations: { name: 'plug', weight: 'regular' },
    extension: { name: 'puzzle-piece', weight: 'regular' },
    developer: { name: 'code', weight: 'regular' },
    profile: { name: 'user', weight: 'regular' },
    friends: { name: 'users', weight: 'regular' },
    ratings: { name: 'star', weight: 'regular' },
    about: { name: 'info', weight: 'regular' },
    ticket: { name: 'ticket', weight: 'regular' },
    popcorn: { name: 'popcorn', weight: 'regular' },
    mail: { name: 'envelope-simple', weight: 'regular' },
    plus: { name: 'plus', weight: 'regular' },
    tv: { name: 'television', weight: 'regular' },
    phone: { name: 'device-mobile', weight: 'regular' },
    chat: { name: 'chat-circle', weight: 'regular' },
    puzzle: { name: 'puzzle-piece', weight: 'regular' },
    film: { name: 'film-slate', weight: 'regular' },
    search: { name: 'magnifying-glass', weight: 'regular' },
    watchlist: { name: 'bookmark-simple', weight: 'regular' },
    calendar: { name: 'calendar', weight: 'regular' },
    robot: { name: 'robot', weight: 'regular' },
    camera: { name: 'camera', weight: 'regular' },
    rocket: { name: 'rocket-launch', weight: 'regular' },
    scales: { name: 'scales', weight: 'regular' },
    bellOff: { name: 'bell-slash', weight: 'regular' },
    telegram: { name: 'paper-plane-tilt', weight: 'regular' },
    folder: { name: 'folder', weight: 'regular' },
    play: { name: 'play', weight: 'fill' },
    fire: { name: 'fire', weight: 'regular' },
    coin: { name: 'coins', weight: 'regular' },
    medal: { name: 'medal', weight: 'regular' },
    crown: { name: 'crown', weight: 'regular' },
    gear: { name: 'gear', weight: 'regular' },
    globe: { name: 'globe-hemisphere-west', weight: 'regular' },
    creditCard: { name: 'credit-card', weight: 'regular' },
    question: { name: 'question', weight: 'regular' },
    key: { name: 'key', weight: 'regular' },
    upload: { name: 'upload-simple', weight: 'regular' },
    desktop: { name: 'desktop', weight: 'regular' },
    crosshair: { name: 'crosshair', weight: 'regular' },
    basket: { name: 'basket', weight: 'regular' },
    pencil: { name: 'pencil-simple', weight: 'regular' },
  };

  function iconClass(key, opts) {
    var def = ICONS[key] || { name: String(key || 'question').replace(/^ph-/, ''), weight: 'regular' };
    var weight = (opts && opts.weight) || def.weight || 'regular';
    var prefix = WEIGHT_CLASS[weight] || WEIGHT_CLASS.regular;
    return prefix + ' ph-' + def.name;
  }

  function html(key, opts) {
    var o = opts || {};
    var cls = iconClass(key, o);
    var size = o.size ? (' mp-icon--' + o.size) : '';
    var extra = o.className ? (' ' + o.className) : '';
    return '<span class="mp-icon' + size + extra + '" aria-hidden="true"><i class="' + cls + '"></i></span>';
  }

  function fillSlot(el) {
    if (!el) return;
    var key = el.getAttribute('data-mp-icon');
    if (!key) return;
    var weight = el.getAttribute('data-mp-icon-weight') || undefined;
    var cls = iconClass(key, { weight: weight });
    var inline = el.getAttribute('data-mp-icon-inline') === '1';
    if (inline) {
      var label = (el.textContent || '').trim();
      el.textContent = '';
      el.insertAdjacentHTML('afterbegin', '<i class="' + cls + '" aria-hidden="true"></i> ' + label);
    } else {
      el.innerHTML = '<i class="' + cls + '"></i>';
    }
    el.classList.add('mp-icon');
    if (weight === 'duotone') el.classList.add('mp-icon--duotone');
    if (el.classList.contains('home-emoji-btn') || el.classList.contains('header-search-mic')) {
      el.classList.add('mp-icon-btn');
    }
  }

  function hydrate(root) {
    var scope = root || document;
    scope.querySelectorAll('[data-mp-icon]').forEach(fillSlot);
  }

  global.MPIcons = {
    html: html,
    className: iconClass,
    hydrate: hydrate,
    ICONS: ICONS,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { hydrate(); });
  } else {
    hydrate();
  }
})(typeof window !== 'undefined' ? window : globalThis);
