(function (global) {
  'use strict';

  function parseTelegramWebUrl(webUrl) {
    var m = String(webUrl || '').match(/t\.me\/([^/?#]+)(?:\?start=([^&#]+))?/);
    if (!m) return null;
    return { domain: m[1], start: m[2] || '' };
  }

  /** Open t.me / tg:// link. Pass preOpenedWindow from a synchronous click handler. */
  function openTelegramLink(webUrl, preOpenedWindow) {
    var url = String(webUrl || '').trim();
    if (!url) return false;

    var parsed = parseTelegramWebUrl(url);
    var ua = navigator.userAgent || '';
    var isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    if (isMobile && parsed && parsed.start) {
      var tgNative = 'tg://resolve?domain=' + encodeURIComponent(parsed.domain)
        + '&start=' + encodeURIComponent(parsed.start);
      try {
        global.location.href = tgNative;
        return true;
      } catch (_e) {}
    }

    if (preOpenedWindow && !preOpenedWindow.closed) {
      try {
        preOpenedWindow.location.href = url;
        preOpenedWindow.focus();
        return true;
      } catch (_e2) {}
    }

    var popup = null;
    try { popup = global.open(url, '_blank', 'noopener,noreferrer'); } catch (_e3) {}
    if (popup) {
      try { popup.focus(); } catch (_e4) {}
      return true;
    }

    try {
      var a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch (_e5) {}

    try {
      global.location.href = url;
      return true;
    } catch (_e6) {}

    return false;
  }

  global.MpOpenTelegramLink = openTelegramLink;
})(window);
