/* Capture first-touch UTM for outreach (kp_alt) and flush on login. */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'mp_utm_first';
  var SENT_KEY = 'mp_utm_sent_fp';

  function readStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : null;
    } catch (_e) {
      return null;
    }
  }

  function writeStored(o) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
    } catch (_e) {}
  }

  function captureFromLocation() {
    try {
      var p = new URLSearchParams(global.location.search || '');
      var source = (p.get('utm_source') || '').trim();
      var medium = (p.get('utm_medium') || '').trim();
      var campaign = (p.get('utm_campaign') || '').trim();
      var content = (p.get('utm_content') || '').trim();
      var term = (p.get('utm_term') || '').trim();
      if (!source && !medium && !campaign) return readStored();
      var existing = readStored();
      if (existing && existing.utm_campaign) return existing;
      var row = {
        utm_source: source,
        utm_medium: medium,
        utm_campaign: campaign,
        utm_content: content,
        utm_term: term,
        landing: (global.location.pathname || '/') + (global.location.search || ''),
        captured_at: new Date().toISOString(),
      };
      writeStored(row);
      return row;
    } catch (_e2) {
      return readStored();
    }
  }

  function fingerprint(utm) {
    if (!utm) return '';
    return [utm.utm_source, utm.utm_medium, utm.utm_campaign, utm.landing || ''].join('|');
  }

  function flushToApi(token, apiBase) {
    var utm = readStored();
    if (!utm || !utm.utm_campaign) return Promise.resolve({ skipped: true });
    if (!token) return Promise.resolve({ skipped: true, reason: 'no_token' });
    var fp = fingerprint(utm);
    try {
      if (localStorage.getItem(SENT_KEY) === fp) {
        return Promise.resolve({ skipped: true, reason: 'already_sent' });
      }
    } catch (_e) {}
    var base = (apiBase || global.location.origin || 'https://movie-planner.ru').replace(/\/$/, '');
    return fetch(base + '/api/site/utm-attribution', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(utm),
    })
      .then(function (r) {
        if (!r.ok) return { ok: false, status: r.status };
        try {
          localStorage.setItem(SENT_KEY, fp);
        } catch (_e2) {}
        return { ok: true };
      })
      .catch(function () {
        return { ok: false };
      });
  }

  function tryFlushWithActiveSession(apiBase) {
    try {
      var active = localStorage.getItem('mp_site_active_chat_id');
      var sessions = JSON.parse(localStorage.getItem('mp_site_sessions') || '[]');
      var token = null;
      if (Array.isArray(sessions)) {
        for (var i = 0; i < sessions.length; i++) {
          if (String(sessions[i].chat_id) === String(active) && sessions[i].token) {
            token = sessions[i].token;
            break;
          }
        }
        if (!token) {
          for (var j = 0; j < sessions.length; j++) {
            if (sessions[j] && sessions[j].token) {
              token = sessions[j].token;
              break;
            }
          }
        }
      }
      if (!token) token = localStorage.getItem('mp_site_token');
      if (token) return flushToApi(token, apiBase);
    } catch (_e) {}
    return Promise.resolve({ skipped: true });
  }

  var MpUtm = {
    capture: captureFromLocation,
    get: readStored,
    flush: flushToApi,
    tryFlush: tryFlushWithActiveSession,
  };

  global.MpUtm = MpUtm;
  captureFromLocation();
  setTimeout(function () {
    tryFlushWithActiveSession();
  }, 800);
})(typeof window !== 'undefined' ? window : this);
