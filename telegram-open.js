(function (global) {
  'use strict';

  function isMobileUa() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
  }

  function closePreOpenedWindow(win) {
    if (win && !win.closed) {
      try { win.close(); } catch (_e) {}
    }
  }

  function clickWebUrl(url) {
    try {
      var a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch (_e) {
      try {
        global.location.href = url;
        return true;
      } catch (_e2) {}
    }
    return false;
  }

  /** Open t.me link. preOpenedWindow only used on desktop (sync popup from click). */
  function openTelegramLink(webUrl, preOpenedWindow) {
    var url = String(webUrl || '').trim();
    if (!url) return false;

    if (isMobileUa()) {
      closePreOpenedWindow(preOpenedWindow);
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
})(typeof window !== 'undefined' ? window : this);
