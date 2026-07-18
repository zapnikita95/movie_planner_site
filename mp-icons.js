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
    news: { name: 'newspaper', weight: 'regular' },
    newspaper: { name: 'newspaper', weight: 'regular' },
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
    bookmark: { name: 'bookmark-simple', weight: 'fill' },
    tag: { name: 'tag', weight: 'regular' },
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
    video: { name: 'video-camera', weight: 'regular' },
    globe: { name: 'globe-hemisphere-west', weight: 'regular' },
    gear: { name: 'gear', weight: 'regular' },
    creditCard: { name: 'credit-card', weight: 'regular' },
    question: { name: 'question', weight: 'regular' },
    pencil: { name: 'pencil-simple', weight: 'regular' },
    key: { name: 'key', weight: 'regular' },
    link: { name: 'link', weight: 'regular' },
    laptop: { name: 'laptop', weight: 'regular' },
    target: { name: 'target', weight: 'regular' },
    x: { name: 'x', weight: 'regular' },
    sortNew: { name: 'sort-descending', weight: 'regular' },
    sortOld: { name: 'sort-ascending', weight: 'regular' },
    sortAz: { name: 'text-aa', weight: 'regular' },
    sortZa: { name: 'text-aa', weight: 'regular' },
    sort: { name: 'arrows-down-up', weight: 'regular' },
    clipboard: { name: 'clipboard-text', weight: 'regular' },
    copy: { name: 'copy', weight: 'regular' },
    heart: { name: 'heart', weight: 'regular' },
    masks: { name: 'mask-happy', weight: 'regular' },
    palette: { name: 'palette', weight: 'regular' },
    cinema: { name: 'film-strip', weight: 'regular' },
    check: { name: 'check', weight: 'bold' },
    basket: { name: 'basket', weight: 'regular' },
    sparkle: { name: 'sparkle', weight: 'regular' },
    history: { name: 'clock-counter-clockwise', weight: 'regular' },
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

  var MIC_SVG_FALLBACK =
    '<svg class="mp-icon-svg-fallback" width="18" height="18" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">' +
    '<path d="M128,176a48.05,48.05,0,0,0,48-48V64a48,48,0,0,0-96,0v64A48.05,48.05,0,0,0,128,176ZM96,64a32,32,0,0,1,64,0v64a32,32,0,0,1-64,0Zm40,143.83V232a8,8,0,0,1-16,0V207.83A80.09,80.09,0,0,1,48,128a8,8,0,0,1,16,0,64,64,0,0,0,128,0,8,8,0,0,1,16,0A80.09,80.09,0,0,1,136,207.83Z"/></svg>';

  function fillSlot(el) {
    if (!el) return;
    var key = el.getAttribute('data-mp-icon');
    if (!key) return;
    var weight = el.getAttribute('data-mp-icon-weight') || undefined;
    var cls = iconClass(key, { weight: weight });
    var inline = el.getAttribute('data-mp-icon-inline') === '1';
    var isMic = el.classList.contains('header-search-mic') || key === 'voice';
    if (inline) {
      var label = (el.textContent || '').trim();
      el.textContent = '';
      el.insertAdjacentHTML('afterbegin', '<i class="' + cls + '" aria-hidden="true"></i> ' + label);
    } else if (isMic) {
      /* Inline SVG only — Phosphor webfont CDN is flaky and left an empty mic button. */
      if (!el.querySelector('svg')) el.innerHTML = MIC_SVG_FALLBACK;
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

  function statsTitle(iconKey, text, dataKey) {
    var attr = dataKey ? (' data-stats-key="' + String(dataKey).replace(/"/g, '') + '"') : '';
    return '<div class="stats-block-title"' + attr + '>' +
      html(iconKey, { className: 'stats-block-title-icon', size: 'sm' }) +
      '<span>' + (text || '') + '</span></div>';
  }

  function ratingInline(value, prefix) {
    var pre = prefix ? String(prefix) : '';
    var shown = value != null && value !== '' ? value : '—';
    return pre + '<span class="stats-rating-inline">' +
      html('ratings', { className: 'stats-inline-icon', size: 'xs' }) +
      '<span>' + shown + '</span></span>';
  }

  function actionLabel(iconKey, text) {
    return html(iconKey, { className: 'mp-action-icon', size: 'sm' }) + '<span>' + (text || '') + '</span>';
  }

  function posterPlaceholder() {
    return '<span class="mp-poster-ph mp-icon" data-mp-icon="film"></span>';
  }

  global.MPIcons = {
    html: html,
    className: iconClass,
    hydrate: hydrate,
    ICONS: ICONS,
    statsTitle: statsTitle,
    ratingInline: ratingInline,
    actionLabel: actionLabel,
    posterPlaceholder: posterPlaceholder,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { hydrate(); });
  } else {
    hydrate();
  }
})(typeof window !== 'undefined' ? window : globalThis);
