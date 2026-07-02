(function (global) {
  'use strict';

  function readStoredSession() {
    try {
      var active = localStorage.getItem('mp_site_active_chat_id');
      var sessions = JSON.parse(localStorage.getItem('mp_site_sessions') || '[]');
      if (!Array.isArray(sessions) || !sessions.length) {
        var legacy = localStorage.getItem('mp_site_token');
        return legacy ? { token: legacy, name: 'Профиль' } : null;
      }
      var session = null;
      for (var i = 0; i < sessions.length; i++) {
        if (String(sessions[i].chat_id) === String(active) && sessions[i].token) {
          session = sessions[i];
          break;
        }
      }
      if (!session) {
        for (var j = 0; j < sessions.length; j++) {
          if (sessions[j] && sessions[j].token) {
            session = sessions[j];
            break;
          }
        }
      }
      return session && session.token ? session : null;
    } catch (_e) {
      return null;
    }
  }

  function hasStoredSiteSession() {
    return !!readStoredSession();
  }

  function paintSessionHeaderStub(session) {
    if (!session) return;
    var wrap = document.getElementById('header-user-wrap');
    var pill = document.getElementById('header-profile-pill');
    var nameEl = document.getElementById('header-profile-name');
    if (nameEl && session.name) nameEl.textContent = session.name;
    if (wrap) wrap.classList.remove('hidden');
    if (pill) pill.classList.remove('hidden');
    var loginBtn = document.getElementById('login-btn') || document.querySelector('#site-header [data-action="login"]');
    if (loginBtn) loginBtn.classList.add('hidden');
  }

  function bootArticleSession() {
    if (!hasStoredSiteSession()) return;
    var root = document.documentElement;
    root.classList.add('mp-session', 'mp-auth-boot');
    function paint() {
      paintSessionHeaderStub(readStoredSession());
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', paint);
    } else {
      paint();
    }
  }

  bootArticleSession();
  global.MpArticleSessionBoot = {
    hasStoredSiteSession: hasStoredSiteSession,
    readStoredSession: readStoredSession,
    paintSessionHeaderStub: paintSessionHeaderStub,
  };
})(typeof window !== 'undefined' ? window : this);
