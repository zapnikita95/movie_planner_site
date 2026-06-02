(function (global) {
  'use strict';

  function isMobileUa() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
  }

  function isIos() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }

  function closePreOpenedWindow(win) {
    if (win && !win.closed) {
      try { win.close(); } catch (_e) {}
    }
  }

  /** Parse https://t.me/bot?start=param → { bot, start } */
  function parseTmeUrl(webUrl) {
    try {
      var u = new URL(String(webUrl || '').trim());
      if (u.hostname !== 't.me' && u.hostname !== 'telegram.me') return null;
      var path = (u.pathname || '').replace(/^\//, '');
      var bot = path.split('/')[0];
      if (!bot) return null;
      return { bot: bot, start: u.searchParams.get('start') || '' };
    } catch (_e) {
      return null;
    }
  }

  function tmeToTgResolve(webUrl) {
    var p = parseTmeUrl(webUrl);
    if (!p) return null;
    var url = 'tg://resolve?domain=' + encodeURIComponent(p.bot);
    if (p.start) url += '&start=' + encodeURIComponent(p.start);
    return url;
  }

  function clickAnchor(url, opts) {
    opts = opts || {};
    try {
      var a = document.createElement('a');
      a.href = url;
      if (opts.target) a.target = opts.target;
      if (opts.rel) a.rel = opts.rel;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch (_e) {
      return false;
    }
  }

  function clickWebUrl(url) {
    var u = String(url || '').trim();
    if (!u) return false;
    if (isIos()) {
      if (clickAnchor(u, { target: '_self' })) return true;
      try {
        global.location.href = u;
        return true;
      } catch (_e2) {}
      return false;
    }
    if (clickAnchor(u, { target: '_blank', rel: 'noopener noreferrer' })) return true;
    try {
      global.location.href = u;
      return true;
    } catch (_e3) {}
    return false;
  }

  function openIosTelegram(webUrl) {
    var tgUrl = tmeToTgResolve(webUrl);
    if (tgUrl) {
      if (clickAnchor(tgUrl)) return true;
      try {
        global.location.href = tgUrl;
        return true;
      } catch (_e) {}
    }
    return clickWebUrl(webUrl);
  }

  /**
   * Open t.me link. Must be called synchronously inside user click/tap handler on iOS Safari.
   * preOpenedWindow — desktop popup opened in the same click handler before async work.
   */
  function openTelegramLink(webUrl, preOpenedWindow) {
    var url = String(webUrl || '').trim();
    if (!url) return false;

    if (isMobileUa()) {
      closePreOpenedWindow(preOpenedWindow);
      if (isIos()) return openIosTelegram(url);
      return clickWebUrl(url);
    }

    if (preOpenedWindow && !preOpenedWindow.closed) {
      try {
        preOpenedWindow.opener = null;
        preOpenedWindow.location.replace(url);
        preOpenedWindow.focus();
        return true;
      } catch (_e) {
        closePreOpenedWindow(preOpenedWindow);
      }
    }

    if (clickWebUrl(url)) return true;

    var popup = null;
    try { popup = global.open(url, '_blank'); } catch (_e3) {}
    if (popup) {
      try { popup.opener = null; popup.focus(); } catch (_e4) {}
      return true;
    }

    return false;
  }

  global.MpOpenTelegramLink = openTelegramLink;
  global.MpClickWebUrl = clickWebUrl;
  global.MpIsMobileUa = isMobileUa;
  global.MpIsIos = isIos;
  global.MpTmeToTgResolve = tmeToTgResolve;
})(typeof window !== 'undefined' ? window : this);
