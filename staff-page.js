/**
 * Standalone actor/person page (/s/:kp) for guests and logged-in users.
 */
(function (global) {
  'use strict';

  var SITE_ORIGIN = (global.MpApiConfig && global.MpApiConfig.SITE_ORIGIN) || 'https://movie-planner.ru';
  var API_BASE = (global.MpApiConfig && global.MpApiConfig.API_ORIGIN) || SITE_ORIGIN;

  var PERSON_FILMS_PREVIEW_PRIMARY = 21;
  var PERSON_FILMS_PREVIEW_OTHER = 14;
  var PERSON_FILM_BATCH_PRIMARY = 21;
  var PERSON_FILM_BATCH_OTHER = 14;
  var MP_POSTER_PLACEHOLDER = '/images/film-poster-placeholder.png';
  var MP_PERSON_PLACEHOLDER = '/images/person-avatar-placeholder.png';
  var _staffLastData = null;
  var _staffExpandedRoles = {};
  var _staffRoleHasMore = {};
  var _staffPrimaryRoleKey = '';
  var _staffFilterState = {
    year: '', yearFrom: '', yearTo: '', genre: '', ratingMin: '',
    mainRolesOnly: false, friendsRatedOnly: false,
  };
  var _staffSortMode = 'default';
  var _staffPersonId = '';
  var _staffLoginNow = null;
  var _staffPendingFriendsFilter = false;
  var _staffGlobalFilters = { years: [], genres: [] };
  var _staffPickOn = false;
  var _staffPickSelected = new Map();
  /** Desktop (and synced mobile awards): 'films' | 'awards' */
  var _staffMainPane = 'films';
  var PICK_START_ARROW =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">' +
    '<path d="M5 12h12m0 0-4.5-4.5M17 12l-4.5 4.5" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var STAFF_ROLE_LABELS = {
    ACTOR: 'Актер',
    DIRECTOR: 'Режиссер',
    PRODUCER: 'Продюсер',
    WRITER: 'Сценарист',
    OPERATOR: 'Оператор',
    COMPOSER: 'Композитор',
    DESIGN: 'Художник',
    EDITOR: 'Монтажер',
    VOICEOVER: 'Озвучка',
    VOICE_DIRECTOR: 'Режиссер дубляжа',
    HIMSELF: 'Играет себя',
    HRONO_TITR_MALE: 'Хроника',
    HRONO_TITR_FEMALE: 'Хроника',
    TRANSLATOR: 'Переводчик',
    CAMEO: 'Камео',
    UNCREDITED: 'Без указания в титрах',
  };

  function staffRoleDisplayName(roleKey, roleName) {
    var rk = String(roleKey || '').trim().toUpperCase();
    var rn = String(roleName || '').trim();
    if (rn && rn.toUpperCase() !== rk) return rn;
    return STAFF_ROLE_LABELS[rk] || rn || rk;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function mpSessions() {
    try { return JSON.parse(localStorage.getItem('mp_site_sessions') || '[]'); } catch (_e) { return []; }
  }

  function mpToken() {
    try {
      var active = localStorage.getItem('mp_site_active_chat_id');
      var row = mpSessions().find(function (x) { return String(x.chat_id) === String(active); });
      return row ? row.token : null;
    } catch (_e) { return null; }
  }

  function mpAuthHeaders() {
    var h = { 'Content-Type': 'application/json' };
    var t = mpToken();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  var STAFF_MAIN_ROLE_KEYS = { ACTOR: 1, DIRECTOR: 1, WRITER: 1, PRODUCER: 1 };
  var STAFF_SELF_ROLE_RE = /играет сам|сам себя|herself|himself|cameo|камео/i;

  function staffLooksMainCredit(f, roleKey) {
    if (!f) return false;
    var rk = String(roleKey || f.role_key || '').toUpperCase();
    var cr = f.cast_rank;
    if (cr != null && cr !== '') {
      var n = parseInt(cr, 10);
      return !isNaN(n) && n > 0 && n <= 3;
    }
    var desc = String(f.role_description || f.description || f.character || '').trim();
    if (!desc) return !!(STAFF_MAIN_ROLE_KEYS[rk] || !rk);
    if (STAFF_SELF_ROLE_RE.test(desc)) return false;
    return true;
  }

  function filterPersonFilmsClient(films, state, roleKey) {
    var st = state || {};
    var rk = String(roleKey || st._roleKey || '').toUpperCase();
    var genreL = String(st.genre || '').trim().toLowerCase();
    var yearExact = st.year != null && st.year !== '' ? parseInt(st.year, 10) : null;
    var yearFrom = st.yearFrom != null && st.yearFrom !== '' ? parseInt(st.yearFrom, 10) : null;
    var yearTo = st.yearTo != null && st.yearTo !== '' ? parseInt(st.yearTo, 10) : null;
    var ratingMin = st.ratingMin != null && st.ratingMin !== '' ? parseFloat(st.ratingMin) : 0;
    if (isNaN(ratingMin)) ratingMin = 0;
    return (films || []).filter(function (f) {
      if (!f) return false;
      var hasKp = !!(f.kp_id && String(f.kp_id).replace(/\D/g, ''));
      var hasFest = !!(f.film_url || f.catalog_id || f.fest_slug || f.tmdb_id);
      if (!hasKp && !hasFest) return false;
      var yr = f.year != null ? parseInt(f.year, 10) : null;
      if (yearExact != null && !isNaN(yearExact) && yr !== yearExact) return false;
      if (yearFrom != null && !isNaN(yearFrom) && (yr == null || yr < yearFrom)) return false;
      if (yearTo != null && !isNaN(yearTo) && (yr == null || yr > yearTo)) return false;
      if (ratingMin > 0) {
        var r = parseFloat(f.rating_kp != null ? f.rating_kp : f.rating);
        if (isNaN(r) || r < ratingMin) return false;
      }
      if (genreL) {
        var gblob = (f.genres || []).join(' ').toLowerCase();
        if (gblob.indexOf(genreL) < 0) return false;
      }
      if (st.mainRolesOnly && !staffLooksMainCredit(f, rk)) return false;
      if (st.friendsRatedOnly) {
        if (!f.friend_rated_high) return false;
        if (f.watched || f.has_rating) return false;
      }
      return true;
    });
  }

  function isFestPersonId(personId) {
    return /^fest-[a-z0-9\-]+$/i.test(String(personId || ''));
  }

  function festPersonSlug(personId) {
    var s = String(personId || '');
    return s.indexOf('fest-') === 0 ? s.slice(5) : '';
  }

  function staffFilmHref(f) {
    if (!f) return '';
    if (f.film_url) return String(f.film_url);
    if (f.catalog_id) return '/f/' + String(f.catalog_id).replace(/^\/?f\//, '');
    if (f.fest_slug) return '/f/fest-' + String(f.fest_slug);
    if (f.tmdb_id) return '/f/movie-' + String(f.tmdb_id).replace(/\D/g, '');
    var kp = String(f.kp_id || '').replace(/\D/g, '');
    return kp ? ('/f/' + kp) : '';
  }

  function sortRolesForDisplay(roles) {
    var primary = ['ACTOR', 'DIRECTOR', 'WRITER', 'PRODUCER'];
    function key(block) {
      var rk = String(block.role_key || block.role_name || '').toUpperCase();
      var total = parseInt(block.total, 10);
      if (isNaN(total)) total = (block.films || []).length;
      if (rk === 'UNCREDITED') return [3, 0, rk];
      if (rk === 'CAMEO') return [2, 0, rk];
      var pri = primary.indexOf(rk);
      if (pri >= 0) return [0, -total, pri];
      return [1, -total, rk];
    }
    return (roles || []).slice().sort(function (a, b) {
      var ka = key(a);
      var kb = key(b);
      for (var i = 0; i < 3; i++) {
        if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
      }
      return 0;
    });
  }

  function sortFilmsForDisplay(films) {
    var list = (films || []).slice();
    if (_staffSortMode === 'rating_desc') {
      return list.sort(function (a, b) {
        var ra = parseFloat(a.rating);
        var rb = parseFloat(b.rating);
        if (isNaN(ra)) ra = 0;
        if (isNaN(rb)) rb = 0;
        if (rb !== ra) return rb - ra;
        return (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0);
      });
    }
    if (_staffSortMode === 'year_asc') {
      return list.sort(function (a, b) {
        return (parseInt(a.year, 10) || 9999) - (parseInt(b.year, 10) || 9999);
      });
    }
    if (_staffSortMode === 'year_desc') {
      return list.sort(function (a, b) {
        return (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0);
      });
    }
    return list;
  }

  function resolvePrimaryRoleKey(roles) {
    var sorted = sortRolesForDisplay(roles || []);
    if (!sorted.length) return '';
    return String(sorted[0].role_key || '').toUpperCase();
  }

  function personFilmPreviewLimit(roleKey) {
    var rk = String(roleKey || '').toUpperCase();
    var primary = _staffPrimaryRoleKey || resolvePrimaryRoleKey(
      (_staffLastData && _staffLastData.films_by_role) || []
    );
    return primary && rk === primary ? PERSON_FILMS_PREVIEW_PRIMARY : PERSON_FILMS_PREVIEW_OTHER;
  }

  function personFilmBatchLimit(roleKey) {
    var rk = String(roleKey || '').toUpperCase();
    var primary = _staffPrimaryRoleKey || resolvePrimaryRoleKey(
      (_staffLastData && _staffLastData.films_by_role) || []
    );
    return primary && rk === primary ? PERSON_FILM_BATCH_PRIMARY : PERSON_FILM_BATCH_OTHER;
  }

  function sortRolesByFilmCount(roles) {
    return sortRolesForDisplay(roles);
  }

  function formatWebFactHtml(text) {
    var escaped = escapeHtml(String(text || ''));
    return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function webFactBodyHtml(wf) {
    if (wf && wf.fact_html) return String(wf.fact_html);
    return formatWebFactHtml(wf && wf.fact);
  }

  function staffFactsPreviewText(fact) {
    var t = String(fact || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
    if (t.length <= 140) return t;
    return t.slice(0, 137).trim() + '…';
  }

  function staffFactsPreviewHtml(fact) {
    return formatWebFactHtml(fact);
  }

  function bindStaffFactsSectionToggle(section, toggle, panel, preview) {
    if (!section || section._staffFactsBound) return;
    section._staffFactsBound = true;
    section.classList.add('staff-facts-anchor--interactive');
    if (toggle) toggle.setAttribute('tabindex', '-1');
    section.setAttribute('tabindex', '0');
    if (!section.getAttribute('role')) section.setAttribute('role', 'button');

    function setOpen(open) {
      if (panel) panel.classList.toggle('hidden', !open);
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      var chev = section.querySelector('.staff-facts-chevron');
      if (chev) chev.textContent = open ? '▴' : '▾';
      if (preview) preview.classList.toggle('hidden', open);
      section.classList.toggle('staff-facts-anchor--open', open);
    }

    function flip() {
      var open = !!(panel && panel.classList.contains('hidden'));
      setOpen(open);
    }

    section.addEventListener('click', function (e) {
      if (e.target.closest('.staff-fact-source')) return;
      if (e.target.closest('a[href]') && !e.target.closest('.staff-facts-toggle-head')) return;
      flip();
    });
    section.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      flip();
    });
  }

  function _staffFactNormKey(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[«»"'()\[\].,;:!?—–-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function _staffFactsNearDup(a, b) {
    var na = _staffFactNormKey(a);
    var nb = _staffFactNormKey(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    var shorter = na.length <= nb.length ? na : nb;
    var longer = na.length <= nb.length ? nb : na;
    if (shorter.length >= 28 && longer.indexOf(shorter) !== -1) return true;
    var wa = na.split(' ').filter(Boolean);
    var wb = nb.split(' ').filter(Boolean);
    if (wa.length < 4 || wb.length < 4) return false;
    var setB = {};
    wb.forEach(function (w) { setB[w] = 1; });
    var inter = 0;
    wa.forEach(function (w) { if (setB[w]) inter += 1; });
    return inter / Math.min(wa.length, wb.length) >= 0.78;
  }

  /** web_facts (with sources) first, then KP strings — same «Интересные факты» list. */
  function staffFactsItemsFromPayload(d) {
    var web = (d && Array.isArray(d.web_facts))
      ? d.web_facts.filter(function (f) { return f && f.fact; })
      : [];
    var kpRaw = (d && Array.isArray(d.kp_facts)) ? d.kp_facts : [];
    var kp = [];
    kpRaw.forEach(function (item) {
      if (!item) return;
      if (typeof item === 'string') {
        var t = item.trim();
        if (t) kp.push({ fact: t });
        return;
      }
      if (item.fact) kp.push(item);
    });
    if (!web.length) return kp.slice(0, 8);
    var out = web.slice();
    kp.forEach(function (f) {
      if (out.length >= 8) return;
      var dup = out.some(function (x) { return _staffFactsNearDup(f.fact, x.fact); });
      if (!dup) out.push(f);
    });
    return out.slice(0, 8);
  }

  function renderStaffPersonFacts(factsOrPayload) {
    var section = document.getElementById('staff-facts-section');
    var preview = document.getElementById('staff-facts-preview');
    var list = document.getElementById('staff-facts-list');
    var panel = document.getElementById('staff-facts-panel');
    var toggle = document.getElementById('staff-facts-toggle');
    if (!section || !preview || !list) return;
    var facts = Array.isArray(factsOrPayload)
      ? factsOrPayload.filter(function (f) { return f && f.fact; })
      : staffFactsItemsFromPayload(factsOrPayload || {});
    if (!facts.length) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden', 'staff-facts--boot');
    section.removeAttribute('aria-busy');
    preview.innerHTML = staffFactsPreviewHtml(facts[0].fact);
    list.innerHTML = '';
    facts.slice(0, 6).forEach(function (wf) {
      var li = document.createElement('li');
      var cat = wf.category ? ('<strong>' + escapeHtml(wf.category) + ':</strong> ') : '';
      var text = webFactBodyHtml(wf);
      var src = '';
      var srcUrl = wf.source_url || '';
      var srcLabel = wf.source_label || wf.source_title || 'Источник';
      if (srcUrl) {
        src = ' <cite class="staff-fact-cite"><a class="staff-fact-source" href="' +
          escapeHtml(srcUrl) + '" target="_blank" rel="noopener nofollow">' +
          escapeHtml(srcLabel) + '</a></cite>';
      }
      li.innerHTML = cat + text + src;
      list.appendChild(li);
    });
    // Mobile overview: facts are page content (always open, no card) — proto --flat
    var flat = false;
    try { flat = !!(global.matchMedia && global.matchMedia('(max-width: 860px)').matches); } catch (_e) {}
    if (flat) {
      section.classList.add('staff-facts-anchor--flat', 'staff-facts-anchor--open');
      if (panel) panel.classList.remove('hidden');
      if (preview) preview.classList.add('hidden');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('tabindex', '-1');
      }
      return;
    }
    if (panel) panel.classList.add('hidden');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    bindStaffFactsSectionToggle(section, toggle, panel, preview);
  }

  var _staffFactsPrefetch = null;

  function prefetchStaffPersonFacts(personId) {
    if (isFestPersonId(personId)) return Promise.resolve(null);
    var pid = String(personId || '');
    if (_staffFactsPrefetch && _staffFactsPrefetch.pid === pid) {
      return _staffFactsPrefetch.promise;
    }
    var promise = fetch(API_BASE + '/api/public/person/' + encodeURIComponent(pid) + '/facts', {
      method: 'GET',
      mode: 'cors',
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    _staffFactsPrefetch = { pid: pid, promise: promise };
    return promise;
  }

  function loadStaffPersonFacts(personId, bootPayload) {
    if (bootPayload) {
      var bootItems = Array.isArray(bootPayload)
        ? bootPayload
        : staffFactsItemsFromPayload(bootPayload);
      if (bootItems.length) renderStaffPersonFacts(bootItems);
    }
    if (isFestPersonId(personId)) return Promise.resolve();
    return prefetchStaffPersonFacts(personId).then(function (d) {
      if (!d || !d.success) return;
      renderStaffPersonFacts(d);
    });
  }

  var STAFF_MONTHS_GEN = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];

  function fmtStaffBirthday(iso) {
    if (!iso) return '';
    var s = String(iso).slice(0, 10);
    var p = s.split('-');
    if (p.length !== 3) return s;
    var y = +p[0];
    var m = +p[1];
    var d = +p[2];
    if (!y || !m || !d || m < 1 || m > 12) return s;
    return d + ' ' + STAFF_MONTHS_GEN[m - 1] + ' ' + y;
  }

  function staffMetaLine(person) {
    if (!person) return '';
    var bits = [];
    var bday = fmtStaffBirthday(person.birthday || person.birth_date || '');
    if (bday) bits.push('Дата рождения: ' + bday);
    var place = String(person.birthplace || person.birth_place || '').trim();
    if (place) bits.push(place);
    if (bits.length) {
      return '<p class="staff-hero-meta">' + escapeHtml(bits.join(' · ')) + '</p>';
    }
    var parts = [];
    if (person.birth_year) {
      var y = String(person.birth_year);
      if (person.death_year) y += ' — ' + person.death_year;
      parts.push(y);
    }
    if (person.country) parts.push(String(person.country));
    if (!parts.length) return '';
    return '<p class="staff-hero-meta">' + escapeHtml(parts.join(' · ')) + '</p>';
  }

  function staffProfLine(person) {
    if (!person) return '';
    var raw = '';
    if (person.profession_keys && person.profession_keys.length) {
      var skip = { HIMSELF: 1, HERSELF: 1, CAMEO: 1, UNCREDITED: 1 };
      raw = person.profession_keys.map(function (k) {
        var key = String(k || '').toUpperCase();
        if (skip[key] || key.indexOf('HRONO') === 0) return '';
        return staffRoleDisplayName(k, '');
      }).filter(Boolean);
      var seen = {};
      raw = raw.filter(function (x) {
        if (seen[x] || /играет сам/i.test(x)) return false;
        seen[x] = 1;
        return true;
      }).slice(0, 3).join(', ');
    } else if (person.professions) {
      raw = String(person.professions).split(/[,;]/).slice(0, 3).join(', ').trim();
    }
    if (!raw) return '';
    return '<p class="staff-hero-prof">' + escapeHtml(raw) + '</p>';
  }

  function staffWorksLine(filmsByRole) {
    var works = 0;
    (filmsByRole || []).forEach(function (rm) {
      var rk = String(rm.role_key || '').toUpperCase();
      if (rk === 'HIMSELF' || rk === 'HERSELF' || rk.indexOf('HRONO') === 0) return;
      var t = parseInt(rm.total != null ? rm.total : (rm.films || []).length, 10) || 0;
      if (t > works) works = t;
    });
    if (works <= 0) return '';
    var word = works === 1 ? 'работа' : works < 5 ? 'работы' : 'работ';
    return '<p class="staff-hero-stats"><span class="staff-hero-works">' + works + ' ' + word + '</span></p>';
  }

  function pickStartLabelHtml(on) {
    return on ? 'Отмена' : ('Начать ' + PICK_START_ARROW);
  }

  function staffPickBannerHtml() {
    return (
      '<div class="mp-pick-banner" id="mp-pick-banner">' +
        '<strong class="mp-pick-banner__text">Выбрать интересные</strong>' +
        '<button type="button" class="mp-pick-start" id="staff-pick-start" aria-pressed="false">' +
          pickStartLabelHtml(false) +
        '</button>' +
        '<button type="button" class="x" id="staff-pick-banner-x" aria-label="Закрыть">×</button>' +
      '</div>'
    );
  }

  function ensureStaffPickDoneBar() {
    var el = document.getElementById('mp-pick-done');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'mp-pick-done';
    el.id = 'mp-pick-done';
    el.innerHTML =
      '<span class="mp-pick-done__label" id="mp-pick-done-label">Готово</span>' +
      '<button type="button" class="mp-pick-done__go" id="mp-pick-done-go" aria-label="Далее">›</button>';
    document.body.appendChild(el);
    var go = el.querySelector('#mp-pick-done-go');
    if (go && !go._staffPickGoBound) {
      go._staffPickGoBound = true;
      go.addEventListener('click', function () {
        submitStaffPickSelection();
      });
    }
    return el;
  }

  function refreshStaffPickDone() {
    var done = ensureStaffPickDoneBar();
    var label = document.getElementById('mp-pick-done-label');
    var n = _staffPickSelected.size;
    if (n > 0 && _staffPickOn) {
      done.classList.add('is-on');
      if (label) {
        label.textContent = 'Готово · ' + n + ' ' + (n === 1 ? 'фильм' : n < 5 ? 'фильма' : 'фильмов');
      }
    } else {
      done.classList.remove('is-on');
    }
  }

  function setStaffPickMode(on) {
    _staffPickOn = !!on;
    document.body.classList.toggle('is-pick-mode', _staffPickOn);
    var start = document.getElementById('staff-pick-start');
    if (start) {
      start.setAttribute('aria-pressed', _staffPickOn ? 'true' : 'false');
      start.innerHTML = pickStartLabelHtml(_staffPickOn);
    }
    if (!_staffPickOn) _staffPickSelected.clear();
    // Keep current filmography/awards pane — selection Map persists across switch.
    paintStaffRoles();
    refreshStaffPickDone();
  }

  function staffPickPayloadFromSelection() {
    var ids = [];
    var items = [];
    _staffPickSelected.forEach(function (v, id) {
      var kp = String(id || '').replace(/\D/g, '');
      if (!kp) return;
      ids.push(kp);
      if (items.length < 10) {
        items.push({
          kp: kp,
          poster: (v && v.poster) || '',
          title: (v && v.title) || '',
        });
      }
    });
    return { ids: ids, items: items };
  }

  function persistStaffPickPayload(payload) {
    if (!payload || !payload.ids || !payload.ids.length) return;
    try {
      sessionStorage.setItem('mp_staff_pick', JSON.stringify({
        personId: String(_staffPersonId || ''),
        ids: payload.ids,
        items: payload.items || [],
        ts: Date.now(),
      }));
      sessionStorage.setItem('mp_staff_pick_kp_ids', JSON.stringify(payload.ids));
    } catch (_e) {}
  }

  function readPendingStaffPick() {
    try {
      var raw = sessionStorage.getItem('mp_staff_pick');
      if (raw) {
        var data = JSON.parse(raw);
        if (data && Array.isArray(data.ids) && data.ids.length) return data;
      }
    } catch (_e) {}
    try {
      var legacy = JSON.parse(sessionStorage.getItem('mp_staff_pick_kp_ids') || '[]');
      if (Array.isArray(legacy) && legacy.length) {
        return { personId: String(_staffPersonId || ''), ids: legacy.map(String), items: [] };
      }
    } catch (_e2) {}
    return null;
  }

  function clearPendingStaffPick() {
    try {
      sessionStorage.removeItem('mp_staff_pick');
      sessionStorage.removeItem('mp_staff_pick_kp_ids');
    } catch (_e) {}
  }

  function importStaffPickIds(ids, personId) {
    var list = (ids || []).map(function (x) { return String(x || '').replace(/\D/g, ''); }).filter(Boolean);
    if (!list.length || !mpToken()) return Promise.resolve(null);
    var pid = String(personId || _staffPersonId || '').replace(/\D/g, '');
    if (!pid) return Promise.resolve(null);
    var roleKey = String(_staffPrimaryRoleKey || 'ACTOR').trim().toUpperCase() || 'ACTOR';
    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mpToken() };
    return fetch(API_BASE + '/api/site/persons/' + encodeURIComponent(pid) + '/import', {
      method: 'POST',
      mode: 'cors',
      headers: headers,
      body: JSON.stringify({ role_key: roleKey, film_kp_ids: list }),
    }).then(function (r) { return r.json(); });
  }

  function flushPendingStaffPickImport() {
    if (!mpToken()) return Promise.resolve(false);
    if (flushPendingStaffPickImport._busy) return flushPendingStaffPickImport._busy;
    var pending = readPendingStaffPick();
    if (!pending || !pending.ids || !pending.ids.length) return Promise.resolve(false);
    flushPendingStaffPickImport._busy = importStaffPickIds(pending.ids, pending.personId)
      .then(function (res) {
        clearPendingStaffPick();
        if (res && res.success) {
          if (global.showToast) {
            global.showToast('Добавлено: ' + (res.added != null ? res.added : pending.ids.length));
          }
          setStaffPickMode(false);
          if (_staffPersonId) loadStaff(_staffPersonId);
          return true;
        }
        if (global.showToast) global.showToast((res && res.error) || 'Не удалось добавить фильмы');
        return false;
      })
      .catch(function () {
        if (global.showToast) global.showToast('Ошибка сети');
        return false;
      })
      .finally(function () {
        flushPendingStaffPickImport._busy = null;
      });
    return flushPendingStaffPickImport._busy;
  }

  function openStaffPickAuth(payload) {
    if (payload && payload.ids && payload.ids.length) persistStaffPickPayload(payload);
    var chips = (payload && payload.items) || [];
    if (!chips.length) {
      var pending = readPendingStaffPick();
      if (pending && pending.items && pending.items.length) chips = pending.items;
    }
    var cta = 'Фильмы готовы к добавлению в вашу базу. Завершите регистрацию и запланируйте просмотр интересных картин.';
    if (global.MpPublicFilmLogin && typeof global.MpPublicFilmLogin.open === 'function') {
      global.MpPublicFilmLogin.open('staff_pick', {
        tab: 'register',
        chips: chips,
        cta: cta,
      });
      return;
    }
    global.location.href = '/?open_login=1&__spa=' + encodeURIComponent('/s/' + _staffPersonId);
  }

  function submitStaffPickSelection() {
    var n = _staffPickSelected.size;
    if (!n) return;
    var payload = staffPickPayloadFromSelection();
    if (!payload.ids.length) return;
    persistStaffPickPayload(payload);
    if (!mpToken()) {
      openStaffPickAuth(payload);
      return;
    }
    importStaffPickIds(payload.ids, _staffPersonId).then(function (res) {
      clearPendingStaffPick();
      if (res && res.success) {
        if (global.showToast) global.showToast('Добавлено: ' + (res.added != null ? res.added : n));
        setStaffPickMode(false);
        if (_staffPersonId) loadStaff(_staffPersonId);
      } else if (global.showToast) {
        global.showToast((res && res.error) || 'Не удалось добавить');
      }
    }).catch(function () {
      if (global.showToast) global.showToast('Ошибка сети');
    });
  }

  function staffTabsHtml() {
    return (
      '<nav class="staff-proto-tabs" id="staff-proto-tabs" aria-label="Разделы">' +
        '<button type="button" class="staff-proto-tab" data-staff-tab="overview">Обзор</button>' +
        '<button type="button" class="staff-proto-tab is-active" data-staff-tab="films" aria-current="page">Фильмография</button>' +
        '<button type="button" class="staff-proto-tab" data-staff-tab="awards">Награды</button>' +
      '</nav>'
    );
  }

  function staffFactsSectionHtml() {
    return (
      '<section class="staff-facts-anchor hidden" id="staff-facts-section" aria-label="Интересные факты">' +
        '<button type="button" class="staff-facts-toggle" id="staff-facts-toggle" aria-expanded="false" aria-controls="staff-facts-panel" tabindex="-1">' +
          '<span class="staff-facts-toggle-head"><span class="staff-facts-toggle-label">Интересные факты</span></span>' +
          '<span class="staff-facts-chevron" aria-hidden="true">▾</span>' +
          '<span class="staff-facts-preview" id="staff-facts-preview"></span>' +
        '</button>' +
        '<div class="staff-facts-panel hidden" id="staff-facts-panel">' +
          '<ul class="staff-facts-list" id="staff-facts-list"></ul>' +
        '</div>' +
      '</section>'
    );
  }

  function ensureHeaderStaffTitleSlot() {
    var header = document.getElementById('site-header');
    var content = header && header.querySelector('.header-content');
    if (!content) return null;
    var el = document.getElementById('header-staff-title');
    if (!el) {
      el = document.createElement('div');
      el.id = 'header-staff-title';
      el.className = 'header-staff-title';
      el.setAttribute('aria-live', 'polite');
      content.appendChild(el);
    }
    return el;
  }

  function setStaffHeaderTitle(name) {
    var el = ensureHeaderStaffTitleSlot();
    if (!el) return;
    el.textContent = String(name || '').trim();
    el.title = el.textContent;
  }

  function isStaffDesktopLayout() {
    return !!(window.matchMedia && window.matchMedia('(min-width: 861px)').matches);
  }

  function ruCountWord(n, one, few, many) {
    var x = Math.abs(Number(n) || 0) % 100;
    var x1 = x % 10;
    if (x > 10 && x < 20) return many;
    if (x1 === 1) return one;
    if (x1 >= 2 && x1 <= 4) return few;
    return many;
  }

  function ruNominationsLabel(n) {
    return String(n) + ' ' + ruCountWord(n, 'номинация', 'номинации', 'номинаций');
  }

  function ruWinsLabel(n) {
    return String(n) + ' ' + ruCountWord(n, 'победа', 'победы', 'побед');
  }

  function staffDeskPaneTabsHtml() {
    return (
      '<nav class="staff-desk-pane-tabs" id="staff-desk-pane-tabs" aria-label="Фильмография и награды">' +
        '<button type="button" class="staff-desk-pane-tab' +
          (_staffMainPane === 'films' ? ' is-active' : '') +
          '" data-staff-pane="films"' +
          (_staffMainPane === 'films' ? ' aria-current="page"' : '') +
          '>Фильмография</button>' +
        '<button type="button" class="staff-desk-pane-tab' +
          (_staffMainPane === 'awards' ? ' is-active' : '') +
          '" data-staff-pane="awards"' +
          (_staffMainPane === 'awards' ? ' aria-current="page"' : '') +
          '>Награды</button>' +
      '</nav>'
    );
  }

  function ensureStaffAwardsRoot() {
    var rolesRoot = document.getElementById('staff-roles-root');
    var awardsRoot = document.getElementById('staff-awards-root');
    var main = document.getElementById('staff-proto-main');
    if (!awardsRoot) {
      awardsRoot = document.createElement('div');
      awardsRoot.id = 'staff-awards-root';
      awardsRoot.classList.add('hidden');
    }
    if (_staffPersonId) awardsRoot.setAttribute('data-person-id', String(_staffPersonId));
    // Sibling after #staff-roles-root — never between role sections.
    if (rolesRoot && rolesRoot.contains(awardsRoot)) {
      rolesRoot.after(awardsRoot);
    } else if (rolesRoot && awardsRoot.previousElementSibling !== rolesRoot) {
      rolesRoot.after(awardsRoot);
    } else if (!rolesRoot && main && !awardsRoot.parentNode) {
      main.appendChild(awardsRoot);
    }
    return awardsRoot;
  }

  function applyStaffMainPane() {
    var awardsRoot = document.getElementById('staff-awards-root') || ensureStaffAwardsRoot();
    var filmsRoot = document.getElementById('staff-roles-root');
    var filters = document.getElementById('staff-person-filters');
    var pick = document.getElementById('mp-pick-banner');
    var deskTabs = document.getElementById('staff-desk-pane-tabs');
    var desktop = isStaffDesktopLayout();
    var tab = document.body.getAttribute('data-staff-tab') || 'films';
    var showTools = desktop ? true : (tab === 'films' || tab === 'awards');
    if (filters) filters.classList.toggle('hidden', !showTools);
    if (pick) pick.classList.toggle('hidden', !showTools);
    if (deskTabs) {
      // CSS also hides on mobile; keep in DOM under filters for desktop placement.
      deskTabs.classList.toggle('hidden', !desktop);
    }
    var showAwards;
    var showFilms;
    if (desktop) {
      showAwards = _staffMainPane === 'awards';
      showFilms = _staffMainPane === 'films';
    } else if (tab === 'overview') {
      showAwards = false;
      showFilms = false;
    } else {
      showAwards = tab === 'awards';
      showFilms = tab === 'films';
    }
    if (filmsRoot) filmsRoot.classList.toggle('hidden', !showFilms);
    if (awardsRoot) awardsRoot.classList.toggle('hidden', !showAwards);
  }

  function setStaffMainPane(pane) {
    _staffMainPane = pane === 'awards' ? 'awards' : 'films';
    document.body.setAttribute('data-staff-pane', _staffMainPane);
    document.querySelectorAll('.staff-desk-pane-tab').forEach(function (btn) {
      var on = btn.getAttribute('data-staff-pane') === _staffMainPane;
      btn.classList.toggle('is-active', on);
      if (on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    applyStaffMainPane();
    if (_staffMainPane === 'awards') {
      var awardsRoot = ensureStaffAwardsRoot();
      if (awardsRoot.getAttribute('data-loaded') !== '1') loadStaffAwards(awardsRoot);
      else if (awardsRoot._awardsItems) paintStaffAwards(awardsRoot);
    }
  }

  function setStaffTab(tab) {
    var t = tab === 'overview' ? 'overview' : (tab === 'awards' ? 'awards' : 'films');
    document.body.setAttribute('data-staff-tab', t);
    document.querySelectorAll('.staff-proto-tab').forEach(function (btn) {
      var on = btn.getAttribute('data-staff-tab') === t;
      btn.classList.toggle('is-active', on);
      if (on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    if (t === 'awards' || t === 'films') {
      _staffMainPane = t === 'awards' ? 'awards' : 'films';
      document.body.setAttribute('data-staff-pane', _staffMainPane);
      document.querySelectorAll('.staff-desk-pane-tab').forEach(function (btn) {
        var on = btn.getAttribute('data-staff-pane') === _staffMainPane;
        btn.classList.toggle('is-active', on);
        if (on) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
      });
    }
    applyStaffMainPane();
    if (t === 'awards' || (isStaffDesktopLayout() && _staffMainPane === 'awards')) {
      var awardsRoot = ensureStaffAwardsRoot();
      if (awardsRoot.getAttribute('data-loaded') !== '1') loadStaffAwards(awardsRoot);
    }
  }

  function staffAwardsApiBase() {
    return (window.MpApiConfig && window.MpApiConfig.apiBase)
      ? window.MpApiConfig.apiBase()
      : ((window.API_BASE || window.location.origin || '').replace(/\/$/, ''));
  }

  function absStaffMediaUrl(url) {
    var u = String(url || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u) || u.indexOf('data:') === 0) return u;
    if (u.charAt(0) === '/') return staffAwardsApiBase() + u;
    return u;
  }

  function loadStaffAwards(root) {
    if (!root) return;
    if (root._awardsLoading) return;
    var pid = root.getAttribute('data-person-id') || String(_staffPersonId || '') || (window.__MP_STAFF_PERSON_ID || '');
    if (!pid) {
      root.innerHTML = '<p class="staff-awards-empty">Номинации пока не загружены</p>';
      return;
    }
    root._awardsLoading = true;
    root.innerHTML = '<p class="staff-awards-loading">Загружаем награды…</p>';
    fetch(staffAwardsApiBase() + '/api/public/person/' + encodeURIComponent(pid) + '/awards?limit=200', {
      method: 'GET',
      mode: 'cors',
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        root.setAttribute('data-loaded', '1');
        var items = (data && data.items) || [];
        items.forEach(function (it) {
          it.poster = absStaffMediaUrl(it.poster);
          it.icon = absStaffMediaUrl(it.icon || '');
        });
        root._awardsItems = items;
        if (root._awardsWinsOnly == null) root._awardsWinsOnly = false;
        if (!items.length) {
          root.innerHTML = '<p class="staff-awards-empty">Пока нет номинаций в базе — собираем оскары и фестивали</p>';
          applyStaffMainPane();
          return;
        }
        paintStaffAwards(root);
        applyStaffMainPane();
      })
      .catch(function () {
        root.innerHTML = '<p class="staff-awards-empty">Не удалось загрузить награды</p>';
        applyStaffMainPane();
      })
      .finally(function () {
        root._awardsLoading = false;
      });
  }

  function staffFilmIndexByKp() {
    var map = {};
    var primary = String(_staffPrimaryRoleKey || '').toUpperCase();
    ((_staffLastData && _staffLastData.films_by_role) || []).forEach(function (block) {
      var rk = String(block.role_key || '').toUpperCase();
      (block.films || []).forEach(function (f) {
        var kp = String(f.kp_id || '').replace(/\D/g, '');
        if (!kp) return;
        if (!map[kp] || (primary && rk === primary)) {
          map[kp] = f;
        }
      });
    });
    return map;
  }

  function filterStaffAwardItems(items) {
    var idx = staffFilmIndexByKp();
    var roleKey = _staffPrimaryRoleKey || 'ACTOR';
    var enriched = (items || []).map(function (it) {
      var kp = String(it.kp_id || '').replace(/\D/g, '');
      var film = (kp && idx[kp]) || {};
      return {
        kp_id: kp || it.kp_id,
        year: it.year != null ? it.year : film.year,
        genres: film.genres || [],
        rating: film.rating != null ? film.rating : film.rating_kp,
        rating_kp: film.rating_kp != null ? film.rating_kp : film.rating,
        cast_rank: film.cast_rank,
        description: film.description,
        friend_rated_high: film.friend_rated_high,
        watched: film.watched,
        has_rating: film.has_rating,
        film_url: film.film_url,
        catalog_id: film.catalog_id,
        fest_slug: film.fest_slug,
        tmdb_id: film.tmdb_id,
        _award: it,
      };
    });
    return filterPersonFilmsClient(enriched, _staffFilterState, roleKey).map(function (m) {
      return m._award;
    });
  }

  function paintStaffAwards(root) {
    if (!root) return;
    var items = filterStaffAwardItems(root._awardsItems || []);
    var winsOnly = !!root._awardsWinsOnly;
    root.innerHTML = renderStaffAwardsHtml(items, { winsOnly: winsOnly });
    bindStaffAwardsUi(root);
  }

  function awardIconFallbackLetters(awardName, slug) {
    var s = String(slug || '').replace(/[^a-z0-9]/gi, '');
    if (s === 'sag') return 'SAG';
    if (s === 'saturn') return 'SAT';
    if (s === 'emmy') return 'EMM';
    if (s === 'nika') return 'НИК';
    if (s === 'golden-eagle') return 'ОРЁ';
    if (s === 'cesar') return 'CÉS';
    var name = String(awardName || '?').replace(/[«»\"]/g, '').trim();
    return name.slice(0, 3).toUpperCase();
  }

  function renderStaffAwardsHtml(items, opts) {
    opts = opts || {};
    var winsOnly = !!opts.winsOnly;
    var source = items || [];
    var filtered = winsOnly ? source.filter(function (it) { return !!it.win; }) : source.slice();
    var byAward = {};
    filtered.forEach(function (it) {
      var key = String(it.award_name || 'Награда');
      if (!byAward[key]) byAward[key] = [];
      byAward[key].push(it);
    });
    var order = Object.keys(byAward).sort(function (a, b) {
      return byAward[b].length - byAward[a].length;
    });
    var totalNoms = filtered.length;
    var totalWins = filtered.filter(function (it) { return !!it.win; }).length;
    var html = '<div class="staff-awards">';
    html += '<div class="staff-awards-toolbar">';
    html += '<p class="staff-awards-summary">' + escapeHtml(ruNominationsLabel(totalNoms));
    if (totalWins) {
      html += ' · <strong>' + escapeHtml(ruWinsLabel(totalWins)) + '</strong>';
    }
    html += '</p>';
    html +=
      '<label class="staff-awards-switch">' +
        '<input type="checkbox" id="staff-awards-wins-only" role="switch"' +
        (winsOnly ? ' checked' : '') + '>' +
        '<span class="staff-awards-switch-ui" aria-hidden="true"></span>' +
        '<span class="staff-awards-switch-label">Только победы</span>' +
      '</label>';
    html += '</div>';
    if (!order.length) {
      html += '<p class="staff-awards-empty">' +
        (winsOnly
          ? 'Нет побед в загруженных номинациях'
          : 'Нет номинаций по текущим фильтрам') +
        '</p></div>';
      return html;
    }
    order.forEach(function (awardName, idx) {
      var rows = byAward[awardName] || [];
      var noms = rows.length;
      var wins = rows.filter(function (it) { return !!it.win; }).length;
      var first = rows[0] || {};
      var iconSrc = absStaffMediaUrl(first.icon || '').replace(/"/g, '&quot;');
      var slug = String(first.award_slug || '');
      var panelId = 'staff-awards-panel-' + idx;
      var meta = escapeHtml(ruNominationsLabel(noms));
      if (wins) meta += ' · ' + escapeHtml(ruWinsLabel(wins));
      html += '<section class="staff-awards-group">';
      html +=
        '<button type="button" class="staff-awards-acc" aria-expanded="false" aria-controls="' +
        panelId + '">';
      if (iconSrc) {
        html += '<img class="staff-awards-group-icon" src="' + iconSrc + '" alt="" width="32" height="32" loading="lazy">';
      } else {
        html +=
          '<span class="staff-awards-group-fallback">' +
          escapeHtml(awardIconFallbackLetters(awardName, slug)) +
          '</span>';
      }
      html += '<span class="staff-awards-acc-text">';
      html += '<span class="staff-awards-acc-name">' + escapeHtml(awardName) + '</span>';
      html += '<span class="staff-awards-acc-meta">' + meta + '</span>';
      html += '</span><span class="staff-awards-acc-chevron" aria-hidden="true">▾</span></button>';
      html += '<div class="staff-awards-panel hidden" id="' + panelId + '">';
      html += '<ul class="staff-awards-list">';
      rows.forEach(function (it) {
        var nom = escapeHtml(it.nomination || 'Номинация');
        var title = escapeHtml(it.film_title || 'Фильм');
        var year = it.year ? String(it.year) : '';
        var kp = it.kp_id ? String(it.kp_id) : '';
        var winCls = it.win ? ' is-win' : '';
        var badge = it.win
          ? '<span class="staff-awards-badge">Победа</span>'
          : '<span class="staff-awards-badge staff-awards-badge--nom">Номинация</span>';
        var href = kp ? ('/f/' + encodeURIComponent(kp)) : '#';
        var poster = absStaffMediaUrl(it.poster || '').replace(/"/g, '&quot;');
        var titlePlain = String(it.film_title || 'Фильм');
        var selected = !!(kp && _staffPickSelected.has(kp));
        var check = _staffPickOn
          ? ('<span class="staff-film-check' + (selected ? ' is-on' : '') + '" aria-hidden="true">' +
            (selected ? '✓' : '') + '</span>')
          : '';
        html += '<li class="staff-awards-item' + winCls + '">';
        html +=
          '<a class="staff-awards-link' + (selected ? ' is-selected' : '') + '" href="' + href + '"' +
          (kp ? (' data-kp="' + escapeHtml(kp) + '"') : '') +
          ' data-poster="' + escapeHtml(String(it.poster || poster || '')) + '"' +
          ' data-title="' + escapeHtml(titlePlain) + '">';
        html += '<span class="staff-awards-poster-wrap">';
        html += check;
        if (poster) {
          html +=
            '<img class="staff-awards-poster" src="' + poster +
            '" alt="" loading="lazy" referrerpolicy="no-referrer" ' +
            'onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">';
        } else {
          html += '<span class="staff-awards-poster staff-awards-poster--ph" aria-hidden="true"></span>';
        }
        html += '</span>';
        html += '<span class="staff-awards-copy">';
        // Film title primary; nomination secondary.
        html += '<span class="staff-awards-film">' + title + (year ? (' · ' + escapeHtml(year)) : '') + '</span>';
        html += '<span class="staff-awards-nom">' + nom + '</span>';
        html += '</span>' + badge + '</a></li>';
      });
      html += '</ul></div></section>';
    });
    html += '</div>';
    return html;
  }

  function bindStaffAwardsUi(root) {
    if (!root) return;
    var toggle = root.querySelector('#staff-awards-wins-only');
    if (toggle && !toggle._bound) {
      toggle._bound = true;
      toggle.addEventListener('change', function () {
        root._awardsWinsOnly = !!toggle.checked;
        paintStaffAwards(root);
      });
    }
    root.querySelectorAll('.staff-awards-acc').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        var panelId = btn.getAttribute('aria-controls');
        var panel = panelId ? document.getElementById(panelId) : null;
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        btn.classList.toggle('is-open', !open);
        if (panel) panel.classList.toggle('hidden', open);
      });
    });
  }

  function bindStaffDeskPaneTabs(root) {
    var nav = (root && root.querySelector('#staff-desk-pane-tabs')) || document.getElementById('staff-desk-pane-tabs');
    if (!nav || nav._deskPaneBound) return;
    nav._deskPaneBound = true;
    nav.querySelectorAll('[data-staff-pane]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setStaffMainPane(btn.getAttribute('data-staff-pane'));
      });
    });
  }

  function bindStaffTabs(root) {
    if (!root) return;
    root.querySelectorAll('.staff-proto-tab').forEach(function (btn) {
      btn.onclick = function () {
        setStaffTab(btn.getAttribute('data-staff-tab'));
      };
    });
    bindStaffDeskPaneTabs(root);
    _staffMainPane = 'films';
    setStaffTab('films');
    if (!bindStaffTabs._resizeBound) {
      bindStaffTabs._resizeBound = true;
      window.addEventListener('resize', function () {
        applyStaffMainPane();
        if (isStaffDesktopLayout() && _staffMainPane === 'awards') {
          var awardsRoot = ensureStaffAwardsRoot();
          if (awardsRoot.getAttribute('data-loaded') !== '1') loadStaffAwards(awardsRoot);
        }
      });
    }
  }

  function bindStaffPickBanner(root) {
    ensureStaffPickDoneBar();
    var start = (root && root.querySelector('#staff-pick-start')) || document.getElementById('staff-pick-start');
    var bx = (root && root.querySelector('#staff-pick-banner-x')) || document.getElementById('staff-pick-banner-x');
    if (start && !start._staffPickBound) {
      start._staffPickBound = true;
      start.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setStaffPickMode(!_staffPickOn);
      });
    }
    if (bx && !bx._staffPickBound) {
      bx._staffPickBound = true;
      bx.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var b = document.getElementById('mp-pick-banner');
        if (b) b.style.display = 'none';
        setStaffPickMode(false);
      });
    }
    if (start) {
      start.setAttribute('aria-pressed', _staffPickOn ? 'true' : 'false');
      start.innerHTML = pickStartLabelHtml(_staffPickOn);
    }
    document.body.classList.toggle('is-pick-mode', _staffPickOn);
    refreshStaffPickDone();
  }

  function bindStaffPickCardClicks(root) {
    if (!root || root._staffPickCardsBound) return;
    root._staffPickCardsBound = true;
    root.addEventListener('click', function (e) {
      if (!_staffPickOn) return;
      if (e.target && e.target.closest && e.target.closest(
        '[data-bell-kp], .staff-import-btn, .staff-role-expand, .mp-pick-start, .mp-pick-banner .x, ' +
        '.staff-awards-acc, .staff-awards-switch, #staff-desk-pane-tabs'
      )) {
        return;
      }
      var card = e.target && e.target.closest
        ? e.target.closest('a.staff-film-card, a.staff-awards-link')
        : null;
      if (!card || !root.contains(card)) return;
      e.preventDefault();
      e.stopPropagation();
      var id = String(card.getAttribute('data-kp') || '').replace(/\D/g, '');
      if (!id) return;
      if (_staffPickSelected.has(id)) _staffPickSelected.delete(id);
      else {
        _staffPickSelected.set(id, {
          poster: card.getAttribute('data-poster') || '',
          title: card.getAttribute('data-title') || '',
        });
      }
      paintStaffRoles();
      refreshStaffPickDone();
    }, true);
  }

  function countStaffFilmsWithState(state) {
    var total = 0;
    ((_staffLastData && _staffLastData.films_by_role) || []).forEach(function (block) {
      total += filterPersonFilmsClient(block.films || [], state, block.role_key).length;
    });
    return total;
  }

  function staffToggleChipAvailability() {
    // Always interactive — never grey out because progressive load / missing cast_rank
    // made a temporary count of 0. Friends opens login for guests.
    return { mainDisabled: false, friendsDisabled: false };
  }

  function staffYearBounds() {
    var years = (_staffGlobalFilters && _staffGlobalFilters.years) || [];
    var nums = years.map(function (y) { return parseInt(y, 10); }).filter(function (n) { return !isNaN(n) && n > 0; });
    if (!nums.length) {
      var min = 9999;
      var max = 0;
      ((_staffLastData && _staffLastData.films_by_role) || []).forEach(function (b) {
        (b.films || []).forEach(function (f) {
          var y = parseInt(f.year, 10);
          if (!y) return;
          if (y < min) min = y;
          if (y > max) max = y;
        });
      });
      if (min > max) {
        var now = new Date().getFullYear();
        return { min: 1950, max: now };
      }
      return { min: min, max: max };
    }
    return { min: Math.min.apply(null, nums), max: Math.max.apply(null, nums) };
  }

  function staffFilterActive() {
    return !!(
      _staffFilterState.yearFrom ||
      _staffFilterState.yearTo ||
      _staffFilterState.genre ||
      (_staffFilterState.ratingMin && parseFloat(_staffFilterState.ratingMin) > 0) ||
      _staffFilterState.year
    );
  }

  function staffToggleChipAttrs(kind) {
    var on = kind === 'main' ? !!_staffFilterState.mainRolesOnly : !!_staffFilterState.friendsRatedOnly;
    return ' class="chip' + (on ? ' chip-on' : '') + '"'
      + ' aria-disabled="false"'
      + ' aria-pressed="' + (on ? 'true' : 'false') + '"';
  }

  function yearOptionsHtml() {
    var years = _staffGlobalFilters.years || [];
    var opts = '<option value="">Любой</option>';
    years.forEach(function (y) {
      var sel = String(_staffFilterState.year) === String(y) ? ' selected' : '';
      opts += '<option value="' + y + '"' + sel + '>' + y + '</option>';
    });
    return opts;
  }

  function genreOptionsHtml() {
    var genres = _staffGlobalFilters.genres || [];
    var opts = '<option value="">Любой</option>';
    genres.forEach(function (g) {
      var sel = _staffFilterState.genre === g ? ' selected' : '';
      opts += '<option value="' + escapeHtml(g) + '"' + sel + '>' + escapeHtml(g) + '</option>';
    });
    return opts;
  }

  function filtersBarHtml() {
    var bounds = staffYearBounds();
    var yMin = bounds.min;
    var yMax = bounds.max;
    var fromVal = _staffFilterState.yearFrom !== '' ? parseInt(_staffFilterState.yearFrom, 10) : yMin;
    var toVal = _staffFilterState.yearTo !== '' ? parseInt(_staffFilterState.yearTo, 10) : yMax;
    if (isNaN(fromVal)) fromVal = yMin;
    if (isNaN(toVal)) toVal = yMax;
    var rMinVal = _staffFilterState.ratingMin !== '' ? parseFloat(_staffFilterState.ratingMin) : 0;
    if (isNaN(rMinVal)) rMinVal = 0;
    var deskRatingAttrs = rMinVal > 0
      ? (' value="' + rMinVal + '" placeholder="7"')
      : ' placeholder="7"';
    var filterOn = staffFilterActive();
    var filterSvg = '<svg viewBox="0 0 256 256" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M40,88H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16Zm32,40a8,8,0,0,0,0,16H184a8,8,0,0,0,0-16Zm32,56a8,8,0,0,0,0,16h48a8,8,0,0,0,0-16Z"/></svg>';
    var sortSvg = '<svg viewBox="0 0 256 256" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M112,168a8,8,0,0,1-5.66-2.34l-48-48a8,8,0,0,1,11.32-11.32L104,140.69V40a8,8,0,0,1,16,0V140.69l34.34-34.35a8,8,0,0,1,11.32,11.32l-48,48A8,8,0,0,1,112,168Zm88-80a8,8,0,0,0-5.66,2.34l-48,48a8,8,0,0,0,11.32,11.32L176,115.31V216a8,8,0,0,0,16,0V115.31l34.34,34.35a8,8,0,0,0,11.32-11.32l-48-48A8,8,0,0,0,200,88Z"/></svg>';
    var gOpts = genreOptionsHtml().replace('>Любой<', '>Все жанры<');
    var sortChips =
      '<button type="button" class="chip' + (_staffSortMode === 'rating_desc' ? ' chip-on' : '') + '" id="staff-sort-rating">По оценке</button>' +
      '<button type="button" class="chip' + (_staffSortMode === 'year_desc' ? ' chip-on' : '') + '" id="staff-sort-year-desc">Сначала новые</button>' +
      '<button type="button" class="chip' + (_staffSortMode === 'year_asc' ? ' chip-on' : '') + '" id="staff-sort-year-asc">Сначала старые</button>';
    return (
      '<div class="person-filters" id="staff-person-filters">' +
        '<div class="person-filters-tools">' +
          '<button type="button" class="person-tool-btn' + (filterOn ? ' is-active' : '') + '" id="staff-filter-open" aria-expanded="false" aria-controls="staff-filter-sheet">' +
            filterSvg + '<span>Фильтр</span></button>' +
          '<button type="button" class="person-tool-btn" id="staff-sort-open" aria-expanded="false" aria-controls="staff-sort-sheet">' +
            sortSvg + '<span>Сортировка</span></button>' +
        '</div>' +
        '<div class="person-filter-sheet hidden" id="staff-filter-sheet" role="dialog" aria-label="Фильтр">' +
          '<div class="person-filter-sheet-head"><span>Фильтр</span>' +
            '<button type="button" class="person-filter-sheet-close" data-sheet-close="filter" aria-label="Закрыть">×</button></div>' +
          '<label class="person-filter-field"><span class="person-filter-k">Жанр</span>' +
            '<select class="person-filter-select" id="staff-filter-genre">' + gOpts + '</select></label>' +
          '<div class="person-year-range" id="staff-year-range">' +
            '<div class="person-year-range-head"><span class="person-filter-k">Годы</span>' +
              '<span class="person-year-range-vals" id="staff-year-range-label">' + fromVal + ' – ' + toVal + '</span></div>' +
            '<div class="person-year-range-inputs">' +
              '<label>с <input type="number" id="staff-year-from" min="' + yMin + '" max="' + yMax + '" value="' + fromVal + '" inputmode="numeric"></label>' +
              '<label>по <input type="number" id="staff-year-to" min="' + yMin + '" max="' + yMax + '" value="' + toVal + '" inputmode="numeric"></label>' +
            '</div>' +
            '<div class="person-year-sliders">' +
              '<input type="range" id="staff-year-from-range" min="' + yMin + '" max="' + yMax + '" value="' + fromVal + '" aria-label="Год начала">' +
              '<input type="range" id="staff-year-to-range" min="' + yMin + '" max="' + yMax + '" value="' + toVal + '" aria-label="Год конца">' +
            '</div>' +
          '</div>' +
          '<div class="person-rating-min" id="staff-rating-min">' +
            '<div class="person-year-range-head"><span class="person-filter-k">Рейтинг от</span>' +
              '<span class="person-year-range-vals" id="staff-rating-min-label">' +
                (rMinVal > 0 ? rMinVal.toFixed(1) : 'любой') + '</span></div>' +
            '<input type="range" id="staff-rating-min-range" min="0" max="10" step="0.1" value="' + rMinVal + '" aria-label="Минимальный рейтинг">' +
          '</div>' +
          '<div class="person-filter-sheet-actions">' +
            '<button type="button" class="person-filter-reset" id="staff-filter-reset">Сбросить</button>' +
            '<button type="button" class="person-filter-apply" id="staff-filter-apply">Применить</button>' +
          '</div>' +
        '</div>' +
        '<div class="person-filter-sheet hidden" id="staff-sort-sheet" role="dialog" aria-label="Сортировка">' +
          '<div class="person-filter-sheet-head"><span>Сортировка</span>' +
            '<button type="button" class="person-filter-sheet-close" data-sheet-close="sort" aria-label="Закрыть">×</button></div>' +
          '<div class="person-filters-sort" aria-label="Сортировка">' + sortChips + '</div>' +
        '</div>' +
        '<div class="person-filters-toggles">' +
          '<button type="button"' + staffToggleChipAttrs('main') + ' id="staff-toggle-main">Главные роли</button>' +
          '<button type="button"' + staffToggleChipAttrs('friends') + ' id="staff-toggle-friends">Друзья хорошо оценили</button>' +
        '</div>' +
        '<div class="person-filters-row person-filters-row--desktop">' +
          '<label class="person-filter-field"><span class="person-filter-k">Годы</span>' +
            '<span class="person-year-range-inline">' +
              '<input type="number" class="person-filter-select" id="staff-year-from-desk" min="' + yMin + '" max="' + yMax + '" value="' + fromVal + '" aria-label="Год начала">' +
              '<span aria-hidden="true">–</span>' +
              '<input type="number" class="person-filter-select" id="staff-year-to-desk" min="' + yMin + '" max="' + yMax + '" value="' + toVal + '" aria-label="Год конца">' +
            '</span></label>' +
          '<label class="person-filter-field"><span class="person-filter-k">Жанр</span>' +
            '<select class="person-filter-select" id="staff-filter-genre-desk">' + gOpts + '</select></label>' +
          '<label class="person-filter-field"><span class="person-filter-k">Рейтинг от</span>' +
            '<input type="number" class="person-filter-select person-filter-select--placeholder" id="staff-rating-min-desk" min="0" max="10" step="0.1"' +
            deskRatingAttrs + ' aria-label="Минимальный рейтинг"></label>' +
        '</div>' +
      '</div>'
    );
  }

  function cleanStaffPoster(src) {
    var s = String(src || '').trim();
    if (!s || /no-poster|kinopoiskapiunofficial/i.test(s)) return '';
    return s;
  }

  function cleanStaffPersonPhoto(src) {
    var s = String(src || '').trim();
    if (!s || /no-poster|person-avatar-placeholder|kinopoiskapiunofficial/i.test(s)) return '';
    return s;
  }

  /** Hero needs HQ — never ship w185/w342 soap. Match guest-cta proto (original). */
  function upgradeStaffHeroPhotoUrl(src) {
    var s = cleanStaffPersonPhoto(src);
    if (!s) return '';
    // Always apex TMDB mirror (RF) at original size
    var m = s.match(/\/api\/public\/poster\/tmdb\/(?:w\d+|h\d+|original)\/([^?#]+)/i);
    if (m) return '/api/public/poster/tmdb/original/' + m[1];
    m = s.match(/image\.tmdb\.org\/t\/p\/(?:w\d+|h\d+|original)\/([^?#]+)/i);
    if (m) return '/api/public/poster/tmdb/original/' + m[1];
    if (/^\/?[a-zA-Z0-9_]+\.(jpg|jpeg|png|webp)$/i.test(s)) {
      return '/api/public/poster/tmdb/original/' + s.replace(/^\//, '');
    }
    return s;
  }

  function staffDefaultPhotoUrl(personId) {
    var kp = String(personId || '').replace(/\D/g, '');
    if (!kp) return '';
    // Prefer KP big actor art over tiny iphone360 when no TMDB
    return 'https://st.kp.yandex.net/images/actor_iphone/iphone360_' + kp + '.jpg';
  }

  function uniqueStaffPhotoCandidates(list) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (u) {
      var s = upgradeStaffHeroPhotoUrl(u);
      if (!s || seen[s]) return;
      seen[s] = 1;
      out.push(s);
    });
    return out;
  }

  function staffHeroPhotoCandidates(person, personId) {
    var kp = String(personId || '').replace(/\D/g, '');
    var boot = readMpRouteBoot();
    var bootPhoto = '';
    if (bootMatchesPerson(boot, kp)) {
      bootPhoto = String(boot.photo_url || '').trim();
    }
    var apiPhoto = person && (person.photo || person.photo_url);
    // HQ first: API/boot (upgraded), then KP fallback — never prefer tiny before original
    return uniqueStaffPhotoCandidates([
      apiPhoto,
      bootPhoto,
      staffDefaultPhotoUrl(kp),
    ]);
  }

  function resolveStaffHeroPhotoUrl(person, personId) {
    var cands = staffHeroPhotoCandidates(person, personId);
    return cands[0] || MP_PERSON_PLACEHOLDER;
  }

  function staffHeroPhotoImgHtml(person, personId) {
    var cands = staffHeroPhotoCandidates(person, personId);
    var primary = cands[0] || MP_PERSON_PLACEHOLDER;
    var rest = cands.slice(1);
    if (primary === MP_PERSON_PLACEHOLDER && !rest.length) {
      return '<div class="staff-hero-photo staff-hero-ph" aria-hidden="true">👤</div>';
    }
    var fallbackAttr = rest.length
      ? (' data-mp-fallbacks="' + escapeHtml(rest.join('|')) + '"')
      : '';
    return (
      '<img class="staff-hero-photo" src="' + escapeHtml(primary) + '" alt="" decoding="async" referrerpolicy="no-referrer"' +
      fallbackAttr +
      ' onerror="if(window.mpPersonOnError)window.mpPersonOnError(this);else{this.onerror=null;this.src=\'' + MP_PERSON_PLACEHOLDER + '\';}">'
    );
  }

  function mpPersonOnErrorLocal(img) {
    if (!img || img.dataset.mpPersonFailed === '1') return;
    var raw = String(img.getAttribute('data-mp-fallbacks') || '').trim();
    if (raw) {
      var parts = raw.split('|').map(function (s) { return String(s || '').trim(); }).filter(Boolean);
      if (parts.length) {
        var next = parts.shift();
        img.setAttribute('data-mp-fallbacks', parts.join('|'));
        img.removeAttribute('srcset');
        img.src = next;
        return;
      }
    }
    img.onerror = null;
    img.dataset.mpPersonFailed = '1';
    img.src = MP_PERSON_PLACEHOLDER;
    img.classList.add('mp-person-placeholder');
  }
  try {
    if (typeof global.mpPersonOnError !== 'function') {
      global.mpPersonOnError = mpPersonOnErrorLocal;
    } else {
      var _prevPersonOnError = global.mpPersonOnError;
      global.mpPersonOnError = function (img) {
        if (!img || img.dataset.mpPersonFailed === '1') return;
        var raw = String(img.getAttribute('data-mp-fallbacks') || '').trim();
        if (raw) {
          var parts = raw.split('|').map(function (s) { return String(s || '').trim(); }).filter(Boolean);
          if (parts.length) {
            var next = parts.shift();
            img.setAttribute('data-mp-fallbacks', parts.join('|'));
            img.removeAttribute('srcset');
            img.src = next;
            return;
          }
        }
        return _prevPersonOnError(img);
      };
    }
  } catch (_e) {}

  function staffFilmPosterHtml(poster, kpId) {
    var kp = String(kpId || '').replace(/\D/g, '');
    var p = cleanStaffPoster(poster);
    var src = p;
    if (!src) src = MP_POSTER_PLACEHOLDER;
    var phCls = src === MP_POSTER_PLACEHOLDER ? ' mp-poster-placeholder' : '';
    return (
      '<img class="staff-film-poster' + phCls + '" src="' + escapeHtml(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer" ' +
      (kp ? ('data-kp="' + escapeHtml(kp) + '" ') : '') +
      'onerror="if(window.mpPosterOnError)window.mpPosterOnError(this)">'
    );
  }

  function bindStaffImportButtons(root, personId) {
    if (!root) return;
    root.querySelectorAll('.staff-import-btn').forEach(function (btn) {
      if (btn._staffImportBound) return;
      btn._staffImportBound = true;
      btn.addEventListener('click', function () {
        var rk = btn.getAttribute('data-role-key') || '';
        var ids = btn._importIds || [];
        if (!mpToken()) {
          if (_staffLoginNow) _staffLoginNow('staff_import');
          else if (global.MpPublicFilmLogin) global.MpPublicFilmLogin.open('staff_import');
          return;
        }
        if (!rk || !ids.length) {
          if (global.showToast) global.showToast('Все фильмы уже в базе');
          return;
        }
        if (!window.confirm('Добавить ' + ids.length + ' фильмов в базу?')) return;
        btn.disabled = true;
        var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mpToken() };
        fetch(API_BASE + '/api/site/persons/' + encodeURIComponent(personId) + '/import', {
          method: 'POST',
          mode: 'cors',
          headers: headers,
          body: JSON.stringify({ role_key: rk, film_kp_ids: ids }),
        }).then(function (r) { return r.json(); }).then(function (res) {
          if (res && res.success) {
            if (global.showToast) global.showToast('Добавлено: ' + (res.added || 0));
            loadStaff(personId);
          } else if (global.showToast) {
            global.showToast((res && res.error) || 'Импорт не удался');
          }
        }).catch(function () {
          if (global.showToast) global.showToast('Ошибка сети');
        }).finally(function () { btn.disabled = false; });
      });
    });
  }

  function filmGridHtml(films, roleKey, roleTotal) {
    var all = sortFilmsForDisplay(films || []);
    if (!all.length) return '';
    var previewLimit = personFilmPreviewLimit(roleKey);
    var expanded = !!_staffExpandedRoles[roleKey];
    var chunk = expanded ? all : all.slice(0, previewLimit);
    var grid = '<div class="staff-film-grid">' + chunk.map(function (f) {
      var href = staffFilmHref(f);
      if (!href) return '';
      var kp = String(f.kp_id || '').replace(/\D/g, '');
      var posterUrl = cleanStaffPoster(f.poster || f.poster_url) || MP_POSTER_PLACEHOLDER;
      var poster = staffFilmPosterHtml(f.poster || f.poster_url, kp);
      var rating = f.rating != null && !isNaN(Number(f.rating))
        ? '<span class="staff-film-rating">' + escapeHtml(String(f.rating)) + '</span>'
        : '';
      var title = String(f.title || '—');
      var selected = !!(kp && _staffPickSelected.has(kp));
      var check = _staffPickOn
        ? ('<span class="staff-film-check' + (selected ? ' is-on' : '') + '" aria-hidden="true">' +
          (selected ? '✓' : '') + '</span>')
        : '';
      return (
        '<a class="staff-film-card' + (selected ? ' is-selected' : '') + '" href="' + escapeHtml(href) + '"' +
          (kp ? (' data-kp="' + escapeHtml(kp) + '"') : '') +
          ' data-poster="' + escapeHtml(posterUrl) + '"' +
          ' data-title="' + escapeHtml(title) + '"' +
          (title && /[а-яА-ЯёЁ]/.test(title) ? (' data-film-title-ru="' + escapeHtml(title) + '"') : '') +
          '>' +
          '<div class="staff-film-media">' + poster + rating + check + '</div>' +
          '<div class="staff-film-title">' + escapeHtml(title) + '</div>' +
          (f.year ? '<div class="staff-film-year">' + escapeHtml(String(f.year)) + '</div>' : '') +
        '</a>'
      );
    }).join('') + '</div>';
    var totalHint = Math.max(all.length, parseInt(roleTotal, 10) || 0);
    if (!expanded && totalHint > previewLimit) {
      grid += (
        '<button type="button" class="staff-role-expand" data-role-expand="' + escapeHtml(roleKey || '') + '">' +
          'Развернуть · ' + (totalHint - previewLimit) +
        '</button>'
      );
    }
    return grid;
  }

  function rolesHtml(roles) {
    return sortRolesByFilmCount(roles).map(function (block) {
      var roleTitle = staffRoleDisplayName(block.role_key, block.role_name);
      var roleKey = block.role_key || roleTitle;
      var filtered = filterPersonFilmsClient(block.films || [], _staffFilterState, roleKey);
      if (!filtered.length) return '';
      var importable = filtered.filter(function (f) { return f.importable !== false; }).map(function (f) { return String(f.kp_id || ''); });
      return (
        '<section class="staff-role-block">' +
          '<div class="staff-role-head"><h2>' + escapeHtml(roleTitle) + '</h2>' +
          '<button type="button" class="link-inline staff-import-btn" data-role-key="' + escapeHtml(roleKey) + '">В базу →' +
          (importable.length ? (' (' + importable.length + ')') : '') + '</button></div>' +
          filmGridHtml(filtered, roleKey, block.total || filtered.length) +
        '</section>'
      );
    }).join('');
  }

  function bindStaffFilters(root) {
    if (!root) return;
    var filtersRoot = root.querySelector('#staff-person-filters');
    if (root._staffFiltersBound) {
      updateStaffToggleChips(filtersRoot);
      if (filtersRoot) {
        ['#staff-sort-rating', '#staff-sort-year-desc', '#staff-sort-year-asc'].forEach(function (sel) {
          var el = filtersRoot.querySelector(sel);
          if (!el) return;
          var mode = sel.indexOf('rating') >= 0 ? 'rating_desc' : (sel.indexOf('desc') >= 0 ? 'year_desc' : 'year_asc');
          el.classList.toggle('chip-on', _staffSortMode === mode);
        });
        var fBtn = filtersRoot.querySelector('#staff-filter-open');
        if (fBtn) fBtn.classList.toggle('is-active', staffFilterActive());
      }
      return;
    }
    root._staffFiltersBound = true;
    var bounds = staffYearBounds();

    function closeSheet(which) {
      var id = which === 'sort' ? 'staff-sort-sheet' : 'staff-filter-sheet';
      var sheet = root.querySelector('#' + id);
      if (sheet) sheet.classList.add('hidden');
      var openBtn = root.querySelector(which === 'sort' ? '#staff-sort-open' : '#staff-filter-open');
      if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
    }
    function openSheet(which) {
      closeSheet('filter');
      closeSheet('sort');
      var id = which === 'sort' ? 'staff-sort-sheet' : 'staff-filter-sheet';
      var sheet = root.querySelector('#' + id);
      if (sheet) sheet.classList.remove('hidden');
      var openBtn = root.querySelector(which === 'sort' ? '#staff-sort-open' : '#staff-filter-open');
      if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
    }
    function syncFilterActiveBtn() {
      var fBtn = root.querySelector('#staff-filter-open');
      if (fBtn) fBtn.classList.toggle('is-active', staffFilterActive());
    }
    function syncYearUi(from, to) {
      var f = Math.max(bounds.min, Math.min(bounds.max, from));
      var t = Math.max(bounds.min, Math.min(bounds.max, to));
      if (f > t) { var tmp = f; f = t; t = tmp; }
      ['#staff-year-from', '#staff-year-from-range', '#staff-year-from-desk'].forEach(function (sel) {
        var el = root.querySelector(sel);
        if (el) el.value = String(f);
      });
      ['#staff-year-to', '#staff-year-to-range', '#staff-year-to-desk'].forEach(function (sel) {
        var el = root.querySelector(sel);
        if (el) el.value = String(t);
      });
      var lab = root.querySelector('#staff-year-range-label');
      if (lab) lab.textContent = f + ' – ' + t;
      return { from: f, to: t };
    }
    function applyYearRange(from, to, paint) {
      var r = syncYearUi(from, to);
      var full = r.from <= bounds.min && r.to >= bounds.max;
      _staffFilterState.yearFrom = full ? '' : String(r.from);
      _staffFilterState.yearTo = full ? '' : String(r.to);
      _staffFilterState.year = '';
      syncFilterActiveBtn();
      if (paint) paintStaffRoles();
    }
    function syncRatingUi(val) {
      var raw = String(val == null ? '' : val).trim();
      var n = raw === '' ? 0 : Math.max(0, Math.min(10, parseFloat(raw) || 0));
      var range = root.querySelector('#staff-rating-min-range');
      var desk = root.querySelector('#staff-rating-min-desk');
      var lab = root.querySelector('#staff-rating-min-label');
      if (range) range.value = String(n);
      if (desk) {
        desk.placeholder = '7';
        desk.value = n > 0 ? String(n) : '';
      }
      if (lab) lab.textContent = n > 0 ? n.toFixed(1) : 'любой';
      _staffFilterState.ratingMin = n > 0 ? String(n) : '';
      syncFilterActiveBtn();
      return n;
    }
    function readYearPair() {
      var fEl = root.querySelector('#staff-year-from') || root.querySelector('#staff-year-from-desk');
      var tEl = root.querySelector('#staff-year-to') || root.querySelector('#staff-year-to-desk');
      return {
        from: parseInt(fEl && fEl.value, 10) || bounds.min,
        to: parseInt(tEl && tEl.value, 10) || bounds.max,
      };
    }

    var filterOpen = root.querySelector('#staff-filter-open');
    var sortOpen = root.querySelector('#staff-sort-open');
    if (filterOpen) filterOpen.addEventListener('click', function () {
      var sheet = root.querySelector('#staff-filter-sheet');
      if (sheet && !sheet.classList.contains('hidden')) closeSheet('filter');
      else openSheet('filter');
    });
    if (sortOpen) sortOpen.addEventListener('click', function () {
      var sheet = root.querySelector('#staff-sort-sheet');
      if (sheet && !sheet.classList.contains('hidden')) closeSheet('sort');
      else openSheet('sort');
    });
    root.querySelectorAll('[data-sheet-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeSheet(btn.getAttribute('data-sheet-close')); });
    });

    function setSort(mode) {
      _staffSortMode = mode;
      root.querySelectorAll('.person-filters-sort .chip').forEach(function (chip) {
        var on = (chip.id === 'staff-sort-rating' && mode === 'rating_desc') ||
          (chip.id === 'staff-sort-year-desc' && mode === 'year_desc') ||
          (chip.id === 'staff-sort-year-asc' && mode === 'year_asc');
        chip.classList.toggle('chip-on', on);
      });
      paintStaffRoles();
      closeSheet('sort');
    }
    var sr = root.querySelector('#staff-sort-rating');
    var sd = root.querySelector('#staff-sort-year-desc');
    var sa = root.querySelector('#staff-sort-year-asc');
    if (sr) sr.addEventListener('click', function () { setSort('rating_desc'); });
    if (sd) sd.addEventListener('click', function () { setSort('year_desc'); });
    if (sa) sa.addEventListener('click', function () { setSort('year_asc'); });

    ['#staff-year-from', '#staff-year-to', '#staff-year-from-range', '#staff-year-to-range',
      '#staff-year-from-desk', '#staff-year-to-desk'].forEach(function (sel) {
      var el = root.querySelector(sel);
      if (!el) return;
      el.addEventListener('input', function () {
        var pair = readYearPair();
        if (sel.indexOf('from') >= 0) pair.from = parseInt(el.value, 10) || bounds.min;
        else pair.to = parseInt(el.value, 10) || bounds.max;
        applyYearRange(pair.from, pair.to, sel.indexOf('desk') >= 0);
      });
    });
    var ratingRange = root.querySelector('#staff-rating-min-range');
    var ratingDesk = root.querySelector('#staff-rating-min-desk');
    if (ratingRange) ratingRange.addEventListener('input', function () { syncRatingUi(ratingRange.value); });
    if (ratingDesk) {
      ratingDesk.addEventListener('focus', function () {
        if (String(ratingDesk.value || '').trim() === '0') ratingDesk.value = '';
      });
      ratingDesk.addEventListener('change', function () {
        syncRatingUi(ratingDesk.value);
        paintStaffRoles();
      });
      // Empty + dim placeholder "7" by default (never ship literal 0)
      if (!_staffFilterState.ratingMin) {
        ratingDesk.value = '';
        ratingDesk.placeholder = '7';
      }
    }
    var applyBtn = root.querySelector('#staff-filter-apply');
    if (applyBtn) applyBtn.addEventListener('click', function () {
      var pair = readYearPair();
      applyYearRange(pair.from, pair.to, false);
      var gEl = root.querySelector('#staff-filter-genre');
      if (gEl) _staffFilterState.genre = gEl.value || '';
      if (ratingRange) syncRatingUi(ratingRange.value);
      paintStaffRoles();
      closeSheet('filter');
    });
    var resetBtn = root.querySelector('#staff-filter-reset');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      _staffFilterState.genre = '';
      var fg = root.querySelector('#staff-filter-genre');
      var fgd = root.querySelector('#staff-filter-genre-desk');
      if (fg) fg.value = '';
      if (fgd) fgd.value = '';
      syncRatingUi(0);
      applyYearRange(bounds.min, bounds.max, true);
      closeSheet('filter');
    });
    var genreEl = root.querySelector('#staff-filter-genre');
    var genreDesk = root.querySelector('#staff-filter-genre-desk');
    if (genreEl) genreEl.addEventListener('change', function (e) {
      _staffFilterState.genre = e.target.value || '';
      if (genreDesk) genreDesk.value = _staffFilterState.genre;
      syncFilterActiveBtn();
    });
    if (genreDesk) genreDesk.addEventListener('change', function (e) {
      _staffFilterState.genre = e.target.value || '';
      if (genreEl) genreEl.value = _staffFilterState.genre;
      syncFilterActiveBtn();
      paintStaffRoles();
    });

    var mainBtn = root.querySelector('#staff-toggle-main');
    var friendsBtn = root.querySelector('#staff-toggle-friends');
    if (mainBtn) {
      mainBtn.addEventListener('click', function () {
        _staffFilterState.mainRolesOnly = !_staffFilterState.mainRolesOnly;
        paintStaffRoles();
      });
    }
    if (friendsBtn) {
      friendsBtn.addEventListener('click', function () {
        if (!mpToken()) {
          _staffPendingFriendsFilter = true;
          if (_staffLoginNow) _staffLoginNow('person_friends');
          else if (global.MpPublicFilmLogin) global.MpPublicFilmLogin.open('person_friends');
          else showStaffLoginModal();
          return;
        }
        _staffFilterState.friendsRatedOnly = !_staffFilterState.friendsRatedOnly;
        paintStaffRoles();
      });
    }
    bindStaffRoleExpandButtons(root);
  }

  function bindStaffRoleExpandButtons(root) {
    if (!root) return;
    root.querySelectorAll('[data-role-expand]').forEach(function (btn) {
      if (btn._staffExpandBound) return;
      btn._staffExpandBound = true;
      btn.addEventListener('click', function () {
        var rk = btn.getAttribute('data-role-expand') || '';
        if (!rk) return;
        _staffExpandedRoles[rk] = true;
        paintStaffRoles();
        if (_staffRoleHasMore[rk] && _staffPersonId) {
          var block = (_staffLastData.films_by_role || []).find(function (b) {
            return String(b.role_key || '') === rk;
          });
          var loaded = block && block.films ? block.films.length : 0;
          loadStaffRoleFilmsBackground(_staffPersonId, rk, loaded).catch(function () {});
        }
      });
    });
  }

  function showStaffLoginModal() {
    if (typeof global.showLoginModalOverlay === 'function') {
      global.showLoginModalOverlay();
      return;
    }
    var modal = document.getElementById('login-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('login-only-overlay');
    }
  }

  function updateStaffToggleChips(filtersRoot) {
    if (!filtersRoot) return;
    var mainBtn = filtersRoot.querySelector('#staff-toggle-main');
    var friendsBtn = filtersRoot.querySelector('#staff-toggle-friends');
    if (mainBtn) {
      mainBtn.classList.toggle('chip-on', !!_staffFilterState.mainRolesOnly);
      mainBtn.classList.remove('chip-disabled');
      mainBtn.disabled = false;
      mainBtn.setAttribute('aria-pressed', _staffFilterState.mainRolesOnly ? 'true' : 'false');
      mainBtn.setAttribute('aria-disabled', 'false');
    }
    if (friendsBtn) {
      friendsBtn.classList.toggle('chip-on', !!_staffFilterState.friendsRatedOnly);
      friendsBtn.classList.remove('chip-disabled');
      friendsBtn.disabled = false;
      friendsBtn.setAttribute('aria-pressed', _staffFilterState.friendsRatedOnly ? 'true' : 'false');
      friendsBtn.setAttribute('aria-disabled', 'false');
    }
  }

  function paintStaffRoles() {
    var root = staffContentRoot();
    if (!root || !_staffLastData) return;
    var rolesRoot = root.querySelector('#staff-roles-root');
    if (rolesRoot) rolesRoot.innerHTML = rolesHtml(_staffLastData.films_by_role || []);
    var awardsKeep = ensureStaffAwardsRoot();
    if (awardsKeep && awardsKeep.getAttribute('data-loaded') === '1' && awardsKeep._awardsItems) {
      paintStaffAwards(awardsKeep);
    }
    applyStaffMainPane();
    var filtersRoot = root.querySelector('#staff-person-filters');
    if (filtersRoot) {
      var genreEl = filtersRoot.querySelector('#staff-filter-genre');
      var genreDesk = filtersRoot.querySelector('#staff-filter-genre-desk');
      if (genreEl) genreEl.value = _staffFilterState.genre || '';
      if (genreDesk) genreDesk.value = _staffFilterState.genre || '';
      updateStaffToggleChips(filtersRoot);
      var sortRating = filtersRoot.querySelector('#staff-sort-rating');
      var sortYearDesc = filtersRoot.querySelector('#staff-sort-year-desc');
      var sortYearAsc = filtersRoot.querySelector('#staff-sort-year-asc');
      if (sortRating) sortRating.classList.toggle('chip-on', _staffSortMode === 'rating_desc');
      if (sortYearDesc) sortYearDesc.classList.toggle('chip-on', _staffSortMode === 'year_desc');
      if (sortYearAsc) sortYearAsc.classList.toggle('chip-on', _staffSortMode === 'year_asc');
      var fBtn = filtersRoot.querySelector('#staff-filter-open');
      if (fBtn) fBtn.classList.toggle('is-active', staffFilterActive());
      if (genreEl && _staffGlobalFilters.genres && _staffGlobalFilters.genres.length) {
        var nextG = genreOptionsHtml().replace('>Любой<', '>Все жанры<');
        if (genreEl.innerHTML !== nextG) genreEl.innerHTML = nextG;
        if (genreDesk && genreDesk.innerHTML !== nextG) genreDesk.innerHTML = nextG;
        genreEl.value = _staffFilterState.genre || '';
        if (genreDesk) genreDesk.value = _staffFilterState.genre || '';
      }
    }
    bindStaffFilters(root);
    bindStaffDeskPaneTabs(root);
    bindStaffRoleExpandButtons(root);
    if (_staffPersonId) bindStaffImportButtons(root, _staffPersonId);
    bindStaffPickBanner(root);
    bindStaffPickCardClicks(root);
    refreshStaffPickDone();
  }

  function readMpRouteBoot() {
    try {
      var el = document.getElementById('mp-route-boot');
      if (!el) return null;
      return JSON.parse(el.textContent || '');
    } catch (_e) {
      return null;
    }
  }

  function bootMatchesPerson(boot, personId) {
    if (!boot || boot.type !== 'staff') return false;
    var bootKp = String(boot.kp_person_id || boot.kp_id || boot.person_id || '').replace(/\D/g, '');
    var want = String(personId || _staffPersonId || '').replace(/\D/g, '');
    return !!(bootKp && want && bootKp === want);
  }

  function staffLoadingHtml(label) {
    var boot = readMpRouteBoot();
    var text = String(label || '').trim();
    if (!text && bootMatchesPerson(boot)) {
      text = boot.name_ru || boot.title || boot.display_name || 'Загрузка…';
    }
    if (!text) text = 'Загрузка…';
    return (
      '<div class="mp-page-loading mp-route-boot-loading" role="status" aria-live="polite" aria-busy="true">' +
        '<div class="mp-page-loading-spinner" aria-hidden="true"></div>' +
        '<p class="mp-page-loading-text">' + escapeHtml(text) + '</p>' +
      '</div>'
    );
  }

  function staffPageLayoutHtml(opts) {
    opts = opts || {};
    var bootCls = opts.boot ? ' staff-page--boot' : '';
    return (
      '<article class="staff-page' + bootCls + '">' +
        '<div class="staff-page-proto-layout">' +
          '<aside class="staff-proto-aside" id="staff-proto-aside">' +
            '<div class="staff-proto-aside-inner">' +
              '<div class="staff-hero staff-hero--poster" role="banner">' + (opts.heroInner || '') + '</div>' +
              staffTabsHtml() +
              '<div class="staff-proto-overview" data-pane="overview">' + (opts.overviewInner || '') + '</div>' +
            '</div>' +
          '</aside>' +
          '<div class="staff-proto-main" id="staff-proto-main" data-pane="films">' +
            (opts.mainInner || '') +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function staffBootHeroHtml() {
    var boot = readMpRouteBoot();
    if (!bootMatchesPerson(boot)) return staffLoadingHtml();
    // RU primary — boot.display_name may be «EN (RU)» from SEO; prefer name_ru.
    var title = boot.name_ru || boot.display_name || 'Персона';
    if (title.indexOf(' (') > 0 && boot.name_ru) title = boot.name_ru;
    var secondary = boot.name_en && boot.name_en !== boot.name_ru ? boot.name_en : '';
    var pid = String(boot.kp_person_id || boot.kp_id || boot.person_id || '').replace(/\D/g, '');
    var photoHtml = staffHeroPhotoImgHtml({ photo: boot.photo_url }, pid);
    setStaffHeaderTitle(title);
    var heroInner = photoHtml +
      '<div class="staff-hero-text">' +
        '<h1 class="staff-hero-name">' + escapeHtml(title) + '</h1>' +
        (secondary ? '<p class="staff-hero-sub">' + escapeHtml(secondary) + '</p>' : '') +
      '</div>';
    var overviewInner = '';
    var bootFactItems = staffFactsItemsFromPayload({
      web_facts: boot.web_facts,
      kp_facts: boot.kp_facts,
    });
    if (bootFactItems.length) {
      overviewInner = staffFactsSectionHtml();
    }
    return staffPageLayoutHtml({
      boot: true,
      heroInner: heroInner,
      overviewInner: overviewInner,
      mainInner: staffLoadingHtml('Фильмография…'),
    });
  }

  function staffContentRoot() {
    return document.getElementById('staff-root') || document.getElementById('film-page-content');
  }

  function canUseInlineCabinetShell() {
    return !!(
      document.getElementById('film-page-content') &&
      document.getElementById('site-header') &&
      document.getElementById('cabinet-readonly')
    );
  }

  function bootstrapInlineCabinetShell(personId) {
    _staffPersonId = personId;
    try {
      document.body.classList.add('in-cabinet', 'staff-standalone-page');
      document.body.classList.remove('film-standalone-page', 'landing-root-page');
      document.body.classList.remove(
        'film-header-title-on',
        'film-header-title-only',
        'film-header-search-with-title'
      );
      document.documentElement.classList.add('mp-staff-boot');
      var filmTitleEl = document.getElementById('header-film-title');
      if (filmTitleEl) {
        filmTitleEl.textContent = '';
        filmTitleEl.removeAttribute('title');
      }
      var landing = document.getElementById('landing');
      if (landing) landing.classList.add('hidden');
      var cabinet = document.getElementById('cabinet-readonly');
      if (cabinet) {
        cabinet.classList.remove('hidden');
        cabinet.classList.add('film-page-mode');
      }
      document.querySelectorAll('#cabinet-readonly .cabinet-section').forEach(function (sec) {
        if (sec) sec.classList.toggle('hidden', sec.id !== 'section-film');
      });
      var hs = document.getElementById('header-search');
      if (hs) hs.classList.remove('hidden');
      var homeStats = document.getElementById('cabinet-home-stats');
      if (homeStats) homeStats.classList.add('hidden');
    } catch (_e) {}

    var pageRoot = document.getElementById('film-page-content');
    if (pageRoot) {
      pageRoot.className = 'container film-page-container staff-page-content';
      /* Keep early index.html grid shell — do not wipe into spinner (layout jump). */
      var existingBoot = pageRoot.querySelector('#staff-root .staff-page--boot, .staff-page--boot');
      if (!existingBoot) {
        pageRoot.innerHTML = '<div id="staff-root" class="staff-page-content-inner">' + staffBootHeroHtml() + '</div>';
      } else {
        var bootEarly = readMpRouteBoot();
        if (bootMatchesPerson(bootEarly, personId)) {
          var t = bootEarly.name_ru || bootEarly.display_name || bootEarly.title || '';
          if (t) setStaffHeaderTitle(t);
        }
      }
      var boot = readMpRouteBoot();
      if (bootMatchesPerson(boot, personId)) {
        var earlyFacts = staffFactsItemsFromPayload({
          web_facts: boot.web_facts,
          kp_facts: boot.kp_facts,
        });
        if (earlyFacts.length) renderStaffPersonFacts(earlyFacts);
      }
      prefetchStaffPersonFacts(personId);
      try {
        if (global.MpHeaderSearchScroll && typeof global.MpHeaderSearchScroll.refresh === 'function') {
          global.MpHeaderSearchScroll.refresh();
        }
      } catch (_scr) {}
    }

    if (global.MpPublicFilmLogin) {
      global.MpPublicFilmLogin.init({
        kpId: personId,
        onSuccess: function () {
          if (_staffPendingFriendsFilter) {
            _staffPendingFriendsFilter = false;
            _staffFilterState.friendsRatedOnly = true;
          }
          flushPendingStaffPickImport().finally(function () {
            loadStaff(personId);
          });
        },
      });
      _staffLoginNow = function (action) {
        if (String(action || '') === 'staff_pick') {
          var pending = readPendingStaffPick();
          openStaffPickAuth(pending || { ids: [], items: [] });
          return;
        }
        global.MpPublicFilmLogin.open(action || '');
      };
    } else {
      _staffLoginNow = function (action) {
        global.location.href = '/?open_login=1&__spa=' + encodeURIComponent('/s/' + personId);
      };
    }
    // OAuth / hard reload return: import selected films if session already present.
    try {
      if (mpToken()) flushPendingStaffPickImport();
    } catch (_flush) {}
    document.querySelectorAll('[data-action="login"], #login-btn').forEach(function (btn) {
      if (btn._staffInlineLoginBound) return;
      btn._staffInlineLoginBound = true;
      btn.addEventListener('click', function (e) {
        if (mpToken()) return;
        e.preventDefault();
        if (_staffLoginNow) _staffLoginNow('');
      });
    });
    if (global.MpFilmPage && typeof MpFilmPage.initStandaloneSiteChrome === 'function') {
      MpFilmPage.initStandaloneSiteChrome({
        apiBase: API_BASE,
        kpId: personId,
        mainSelector: '#film-page-content',
        spaReturnPath: '/s/' + personId,
        cabinetMode: true,
        bindLogin: false,
        onLoginSuccess: function () {
          if (_staffPendingFriendsFilter) {
            _staffPendingFriendsFilter = false;
            _staffFilterState.friendsRatedOnly = true;
          }
          loadStaff(personId);
        },
      });
    }
  }

  function guestCabinetNavHtml() {
    if (global.MpFilmPage && typeof MpFilmPage.standaloneNavHtml === 'function') {
      return MpFilmPage.standaloneNavHtml();
    }
    return '';
  }

  var GUEST_NAV_PATHS_STAFF = {
    '/home': 1,
    '/plans': 1,
    '/premieres': 1,
    '/whattowatch': 1,
  };

  function bindGuestCabinetNav() {
    document.querySelectorAll('#film-standalone-nav .cabinet-nav-btn, #landing-root-nav .cabinet-nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        var href = btn.getAttribute('href') || '/';
        if (mpToken()) return;
        var path = href.replace(/\/$/, '') || '/';
        if (path === '/' || GUEST_NAV_PATHS_STAFF[path]) return;
        e.preventDefault();
        e.stopPropagation();
        if (_staffLoginNow) _staffLoginNow('nav');
        else global.location.href = '/?open_login=1&__spa=' + encodeURIComponent('/s/' + _staffPersonId);
      });
    });
  }

  function renderStaffShell(personId) {
    _staffPersonId = personId;
    document.title = 'Персона · Movie Planner';
    document.body.innerHTML =
      '<div class="page-shell staff-standalone-shell">' +
        '<header id="site-header">' +
          '<div class="header-content">' +
            '<a class="logo" href="/"><img src="/images/icon48.png" alt="Movie Planner"><span>Movie Planner</span></a>' +
            '<div class="header-search" id="header-search" role="search">' +
              '<span class="header-search-icon" aria-hidden="true">🔍</span>' +
              '<input type="text" id="header-search-input" class="header-search-input" placeholder="Найти фильм или сериал" autocomplete="off" aria-label="Поиск">' +
              '<button type="button" class="header-search-mic mp-icon-btn" id="header-search-mic" data-mp-icon="voice" data-mp-icon-weight="duotone" aria-label="Голосовой ввод" title="Голосовой ввод"><svg class="mp-icon-svg-fallback" width="18" height="18" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M128,176a48.05,48.05,0,0,0,48-48V64a48,48,0,0,0-96,0v64A48.05,48.05,0,0,0,128,176ZM96,64a32,32,0,0,1,64,0v64a32,32,0,0,1-64,0Zm40,143.83V232a8,8,0,0,1-16,0V207.83A80.09,80.09,0,0,1,48,128a8,8,0,0,1,16,0,64,64,0,0,0,128,0,8,8,0,0,1,16,0A80.09,80.09,0,0,1,136,207.83Z"/></svg></button>' +
              '<button type="button" class="header-search-clear hidden" id="header-search-clear" aria-label="Очистить">×</button>' +
              '<div class="header-search-dropdown hidden" id="header-search-dropdown" role="listbox"></div>' +
            '</div>' +
            '<div class="header-buttons">' +
              '<button type="button" class="btn-primary" id="login-btn">Войти</button>' +
            '</div>' +
          '</div>' +
        '</header>' +
        (global.MpAppOpenBanner && MpAppOpenBanner.appOpenBannerHtml ? MpAppOpenBanner.appOpenBannerHtml() : '') +
        '<main class="movie-page staff-standalone-main">' +
          '<div class="staff-page-content" id="staff-root">' + staffBootHeroHtml() + '</div>' +
        '</main>' +
        '<aside id="staff-seo-root" class="film-seo-root visually-hidden" aria-label="Об актёре"></aside>' +
        '<footer class="footer staff-standalone-footer">' +
          '<div class="container"><p class="footer-bottom muted small">© ' + String(new Date().getFullYear()) + ' Movie Planner</p></div>' +
        '</footer>' +
      '</div>';

    if (global.MpFilmPage && MpFilmPage.initStandaloneSiteChrome) {
      MpFilmPage.initStandaloneSiteChrome({
        apiBase: API_BASE,
        mainSelector: 'main.staff-standalone-main',
        spaReturnPath: '/s/' + personId,
        onLoginSuccess: function () {
          if (_staffPendingFriendsFilter) {
            _staffPendingFriendsFilter = false;
            _staffFilterState.friendsRatedOnly = true;
          }
          loadStaff(personId);
        },
      });
      _staffLoginNow = function (action) {
        if (global.MpPublicFilmLogin) {
          global.MpPublicFilmLogin.open(action || '');
          return;
        }
        global.location.href = '/?open_login=1&__spa=' + encodeURIComponent('/s/' + personId);
      };
    }
    if (global.MpAppOpenBanner && MpAppOpenBanner.setupAppOpenBanner) {
      MpAppOpenBanner.setupAppOpenBanner({ id: personId, kind: 'person' });
    } else if (global.MpFilmPage && MpFilmPage.setupAppOpenBanner) {
      MpFilmPage.setupAppOpenBanner({ id: personId, kind: 'person' });
    }
    bindGuestCabinetNav();
    if (global.MpFilmPage && typeof MpFilmPage.mountStandaloneCabinetNav === 'function') {
      MpFilmPage.mountStandaloneCabinetNav('main.staff-standalone-main');
    }
    try {
      if (global.MPIcons && global.MPIcons.hydrate) global.MPIcons.hydrate(document.getElementById('site-header'));
    } catch (_) {}
  }

  function applyStaffSeoFromApi(staffPayload) {
    if (!staffPayload || !staffPayload.success || !staffPayload.staff) return;
    var s = staffPayload.staff;
    try {
      var head = document.head;
      function meta(attr, key, content) {
        if (!content) return;
        var el = head.querySelector('meta[' + attr + '="' + key + '"]');
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute(attr, key);
          head.appendChild(el);
        }
        el.setAttribute('content', content);
      }
      if (s.page_title) document.title = s.page_title;
      if (s.meta_description) {
        meta('name', 'description', s.meta_description);
        meta('property', 'og:description', s.meta_description);
        meta('name', 'twitter:description', s.meta_description);
      }
      if (s.meta_keywords) meta('name', 'keywords', s.meta_keywords);
      if (s.canonical) {
        var link = head.querySelector('link[rel="canonical"]');
        if (!link) {
          link = document.createElement('link');
          link.rel = 'canonical';
          head.appendChild(link);
        }
        link.href = s.canonical;
      }
      if (s.json_ld) {
        var ld = head.querySelector('#staff-jsonld');
        if (!ld) {
          ld = document.createElement('script');
          ld.type = 'application/ld+json';
          ld.id = 'staff-jsonld';
          head.appendChild(ld);
        }
        ld.textContent = JSON.stringify(s.json_ld);
      }
      if (s.seo_body_html) {
        var seoRoot = document.getElementById('staff-seo-root');
        if (seoRoot) seoRoot.innerHTML = s.seo_body_html;
      }
    } catch (_e) {}
  }

  function setPageFavicon(imgUrl) {
    var url = String(imgUrl || '').trim();
    if (!url) return;
    var head = document.head;
    ['icon', 'apple-touch-icon'].forEach(function (rel) {
      var el = head.querySelector('link[rel="' + rel + '"]');
      if (!el) {
        el = document.createElement('link');
        el.rel = rel;
        head.appendChild(el);
      }
      el.href = url;
    });
  }

  function setStaffOg(person, personId) {
    try {
      var name = (person && (person.name_ru || person.name_en)) || 'Персона';
      var pageUrl = global.location.origin + '/s/' + personId;
      var photo = person && person.photo ? String(person.photo) : '';
      var prof = person && person.profession_keys && person.profession_keys.length
        ? person.profession_keys.join(', ')
        : '';
      var desc = prof
        ? (name + ' — ' + prof + '. Фильмография на Movie Planner.')
        : (name + ' — фильмография, роли и фильмы на Movie Planner.');
      var head = document.head;
      function meta(attr, key, content) {
        if (!content) return;
        var el = head.querySelector('meta[' + attr + '="' + key + '"]');
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute(attr, key);
          head.appendChild(el);
        }
        el.setAttribute('content', content);
      }
      document.title = name + ' · Movie Planner';
      meta('property', 'og:type', 'profile');
      meta('property', 'og:url', pageUrl);
      meta('property', 'og:title', name);
      meta('property', 'og:site_name', 'Movie Planner');
      meta('property', 'og:locale', 'ru_RU');
      meta('property', 'og:description', desc);
      if (photo) {
        setPageFavicon(photo);
        meta('property', 'og:image', photo);
        meta('property', 'og:image:secure_url', photo);
        meta('property', 'og:image:width', '400');
        meta('property', 'og:image:height', '400');
        meta('property', 'og:image:alt', 'Фото: ' + name);
        meta('name', 'twitter:image', photo);
        meta('name', 'twitter:image:alt', 'Фото: ' + name);
      }
      meta('name', 'twitter:card', photo ? 'summary_large_image' : 'summary');
      meta('name', 'twitter:title', name);
      meta('name', 'twitter:description', desc);
      meta('name', 'description', desc);
      meta('name', 'robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
      var link = head.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        head.appendChild(link);
      }
      link.setAttribute('href', pageUrl);

      var ld = head.querySelector('#staff-jsonld');
      if (!ld) {
        ld = document.createElement('script');
        ld.type = 'application/ld+json';
        ld.id = 'staff-jsonld';
        head.appendChild(ld);
      }
      var payload = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: name,
        url: pageUrl,
        image: photo || undefined,
      };
      if (!isFestPersonId(personId)) {
        payload.sameAs = 'https://www.kinopoisk.ru/name/' + personId + '/';
      }
      if (person && person.birth_year) payload.birthDate = String(person.birth_year) + '-01-01';
      if (person && person.death_year) payload.deathDate = String(person.death_year) + '-01-01';
      if (person && person.country) {
        payload.nationality = { '@type': 'Country', name: String(person.country) };
      }
      ld.textContent = JSON.stringify(payload);
    } catch (_e) {}
  }

  function renderStaffData(data, personId) {
    var root = staffContentRoot();
    if (!root) return;
    if (!data || !data.success) {
      root.innerHTML = '<p class="film-page-error-hint">Не удалось загрузить</p>';
      return;
    }
    var person = data.person || {};
    _staffLastData = data;
    _staffRoleHasMore = {};
    _staffPrimaryRoleKey = resolvePrimaryRoleKey(data.films_by_role || []);
    _staffGlobalFilters = data.filters || { years: [], genres: [] };
    var titleName = person.name_ru || person.display_name || person.name_en || 'Персона';
    var secondaryName = (
      person.name_en && person.name_en !== person.name_ru
        ? person.name_en
        : (person.secondary_name || '')
    );
    document.title = titleName + ' · Movie Planner';
    setStaffOg(person, personId);

    var photoCandidates = staffHeroPhotoCandidates(person, personId);
    var personPhoto = photoCandidates[0] || MP_PERSON_PLACEHOLDER;
    var metaHtml = staffMetaLine(person);
    var profHtml = staffProfLine(person);
    var worksHtml = staffWorksLine(data.films_by_role || []);
    setStaffHeaderTitle(titleName);

    function fillHeroText(hero) {
      if (!hero) return;
      var img = hero.querySelector('img.staff-hero-photo, .staff-hero-photo');
      if (personPhoto && personPhoto !== MP_PERSON_PLACEHOLDER) {
        if (img && img.tagName === 'IMG') {
          var rest = photoCandidates.slice(1);
          img.setAttribute('data-mp-fallbacks', rest.join('|'));
          img.dataset.mpPersonFailed = '';
          img.classList.remove('mp-person-placeholder');
          if (img.getAttribute('src') !== personPhoto) img.setAttribute('src', personPhoto);
        } else {
          var ph = hero.querySelector('.staff-hero-ph, .staff-hero-photo');
          if (ph) ph.outerHTML = staffHeroPhotoImgHtml(person, personId);
        }
      }
      var nameEl = hero.querySelector('.staff-hero-name');
      if (nameEl) nameEl.textContent = titleName;
      var textWrap = hero.querySelector('.staff-hero-text');
      if (!textWrap) return;
      var subEl = hero.querySelector('.staff-hero-sub');
      if (secondaryName) {
        if (subEl) subEl.textContent = secondaryName;
        else textWrap.insertAdjacentHTML('beforeend', '<p class="staff-hero-sub">' + escapeHtml(secondaryName) + '</p>');
      } else if (subEl) subEl.remove();
      var profEl = hero.querySelector('.staff-hero-prof');
      if (profHtml) {
        if (profEl) profEl.outerHTML = profHtml;
        else textWrap.insertAdjacentHTML('beforeend', profHtml);
      } else if (profEl) profEl.remove();
      var worksEl = hero.querySelector('.staff-hero-stats');
      if (worksHtml) {
        if (worksEl) worksEl.outerHTML = worksHtml;
        else textWrap.insertAdjacentHTML('beforeend', worksHtml);
      } else if (worksEl) worksEl.remove();
    }

    function bindStaffFilmNavTitles(scope) {
      if (!scope || scope._staffFilmNavBound) return;
      scope._staffFilmNavBound = true;
      scope.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a.staff-film-card') : null;
        if (!a) return;
        var ru = String(a.getAttribute('data-film-title-ru') || '').trim();
        if (!ru || !/[а-яА-ЯёЁ]/.test(ru)) {
          var titleEl = a.querySelector('.staff-film-title');
          ru = titleEl ? String(titleEl.textContent || '').trim() : '';
        }
        if (!ru || !/[а-яА-ЯёЁ]/.test(ru)) return;
        var href = String(a.getAttribute('href') || '');
        var m = href.match(/\/f\/(\d+)/);
        var kp = m ? m[1] : '';
        if (!kp) return;
        try { sessionStorage.setItem('mp_film_nav_title_ru_' + kp, ru); } catch (_s) {}
      }, true);
    }

    function finishStaffMount(article) {
      bindStaffTabs(article);
      bindStaffDeskPaneTabs(article);
      bindStaffPickBanner(article);
      bindStaffPickCardClicks(root);
      bindStaffFilters(root);
      bindStaffRoleExpandButtons(root);
      bindStaffImportButtons(root, personId);
      bindStaffFilmNavTitles(root);
      ensureStaffAwardsRoot();
      applyStaffMainPane();
      try {
        if (global.MpHeaderSearchScroll && typeof global.MpHeaderSearchScroll.suppressRetract === 'function') {
          global.MpHeaderSearchScroll.suppressRetract(1400);
        }
      } catch (_hs) {}
      try {
        if (!mpToken() && global.MpPublicPromo && typeof global.MpPublicPromo.mountAfterHero === 'function') {
          global.MpPublicPromo.mountAfterHero(root);
        }
      } catch (_e) {}
      var boot = readMpRouteBoot();
      var bootFacts = null;
      if (data && (data.web_facts || data.kp_facts)) {
        bootFacts = { web_facts: data.web_facts || [], kp_facts: data.kp_facts || [] };
      } else if (boot && bootMatchesPerson(boot, personId) && (boot.web_facts || boot.kp_facts)) {
        bootFacts = { web_facts: boot.web_facts || [], kp_facts: boot.kp_facts || [] };
      }
      loadStaffPersonFacts(personId, bootFacts);
      root.querySelectorAll('.staff-import-btn').forEach(function (btn) {
        var rk = btn.getAttribute('data-role-key') || '';
        var block = (_staffLastData.films_by_role || []).find(function (b) {
          return String(b.role_key || '') === rk;
        });
        var filtered = block ? filterPersonFilmsClient(block.films || [], _staffFilterState, rk) : [];
        btn._importIds = filtered.map(function (f) { return String(f.kp_id || ''); }).filter(Boolean);
      });
    }

    function mountStaffBody(article) {
      var overview = article.querySelector('.staff-proto-overview');
      var main = article.querySelector('.staff-proto-main');
      if (overview) {
        overview.innerHTML = (metaHtml || '') + staffFactsSectionHtml();
      }
      if (main) {
        var pidAttr = escapeHtml(String(personId || ''));
        main.innerHTML =
          staffPickBannerHtml() + filtersBarHtml() +
          staffDeskPaneTabsHtml() +
          '<div id="staff-roles-root">' + rolesHtml(data.films_by_role || []) + '</div>' +
          '<div id="staff-awards-root" class="hidden" data-person-id="' + pidAttr + '"></div>';
        root._staffFiltersBound = false;
      }
      var heroNode = article.querySelector('.staff-hero');
      if (heroNode) heroNode.classList.add('staff-hero--poster');
      return article;
    }

    var bootArticle = root.querySelector('.staff-page--boot');
    if (bootArticle) {
      fillHeroText(bootArticle.querySelector('.staff-hero'));
      bootArticle.classList.remove('staff-page--boot');
      var loadingEl = bootArticle.querySelector('.mp-route-boot-loading');
      if (loadingEl) loadingEl.remove();
      mountStaffBody(bootArticle);
      finishStaffMount(bootArticle);
      return;
    }

    var heroInner = staffHeroPhotoImgHtml(person, personId) +
      '<div class="staff-hero-text">' +
        '<h1 class="staff-hero-name">' + escapeHtml(titleName) + '</h1>' +
        (secondaryName
          ? '<p class="staff-hero-sub">' + escapeHtml(secondaryName) + '</p>' : '') +
        profHtml +
        worksHtml +
      '</div>';
    root.innerHTML = staffPageLayoutHtml({
      heroInner: heroInner,
      overviewInner: (metaHtml || '') + staffFactsSectionHtml(),
      mainInner: staffPickBannerHtml() + filtersBarHtml() +
        '<div id="staff-roles-root">' + rolesHtml(data.films_by_role || []) + '</div>',
    });

    root._staffFiltersBound = false;
    finishStaffMount(root);
  }

  function mergeStaffFilmsBatch(roleKey, batchFilms, append) {
    if (!_staffLastData || !Array.isArray(_staffLastData.films_by_role)) return;
    var rk = String(roleKey || '').toUpperCase();
    var block = (_staffLastData.films_by_role || []).find(function (b) {
      return String(b.role_key || '').toUpperCase() === rk;
    });
    if (!block) {
      block = { role_key: rk, role_name: staffRoleDisplayName(rk, ''), films: [] };
      _staffLastData.films_by_role.push(block);
    }
    var incoming = batchFilms || [];
    if (append) block.films = (block.films || []).concat(incoming);
    else block.films = incoming.slice();
  }

  function loadStaffRoleFilms(personId, roleKey, offset, limitOverride) {
    var off = Math.max(0, parseInt(offset, 10) || 0);
    var lim = limitOverride != null ? parseInt(limitOverride, 10) : personFilmBatchLimit(roleKey);
    if (isNaN(lim) || lim < 1) lim = personFilmBatchLimit(roleKey);
    var base = isFestPersonId(personId)
      ? (API_BASE + '/api/public/person/fest/' + encodeURIComponent(festPersonSlug(personId)))
      : (API_BASE + '/api/public/person/' + encodeURIComponent(personId));
    var url = base + '/films?role=' + encodeURIComponent(roleKey) + '&offset=' + off + '&limit=' + lim;
    return fetch(url, { method: 'GET', mode: 'cors' })
      .then(function (r) {
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then(function (batch) {
        if (!batch || !batch.success) return batch;
        mergeStaffFilmsBatch(roleKey, batch.films || [], off > 0);
        _staffRoleHasMore[roleKey] = !!batch.has_more;
        var block = (_staffLastData.films_by_role || []).find(function (b) {
          return String(b.role_key || '') === String(roleKey || '');
        });
        if (block && batch.total != null) block.total = batch.total;
        paintStaffRoles();
        return batch;
      });
  }

  function loadStaffRoleFilmsBackground(personId, roleKey, offset) {
    return loadStaffRoleFilms(personId, roleKey, offset).then(function (batch) {
      if (!batch || !batch.has_more || !_staffExpandedRoles[roleKey]) return;
      var block = (_staffLastData.films_by_role || []).find(function (b) {
        return String(b.role_key || '') === String(roleKey || '');
      });
      var nextOff = block && block.films ? block.films.length : offset;
      return loadStaffRoleFilmsBackground(personId, roleKey, nextOff);
    });
  }

  function loadStaffRolesProgressive(personId, rolesMeta) {
    var pending = (rolesMeta || []).filter(function (rm) {
      return rm && rm.role_key && (rm.total > 0);
    });
    if (!pending.length) return Promise.resolve();

    var primary = pending[0];
    var rest = pending.slice(1);
    var primaryLim = PERSON_FILM_BATCH_PRIMARY;
    return loadStaffRoleFilms(personId, primary.role_key, 0, primaryLim).then(function () {
      var idx = 0;
      function loadNextPair() {
        if (idx >= rest.length) return Promise.resolve();
        var pair = rest.slice(idx, idx + 2);
        idx += 2;
        return Promise.all(pair.map(function (rm) {
          var batchLim = PERSON_FILM_BATCH_OTHER;
          return loadStaffRoleFilms(personId, rm.role_key, 0, batchLim).catch(function () {});
        })).then(loadNextPair);
      }
      return loadNextPair();
    });
  }

  function loadStaffProgressive(personId) {
    if (isFestPersonId(personId)) {
      var slug = festPersonSlug(personId);
      return fetch(API_BASE + '/api/public/person/fest/' + encodeURIComponent(slug), { method: 'GET', mode: 'cors' })
        .then(function (r) {
          if (!r.ok) throw new Error('http_' + r.status);
          return r.json();
        })
        .then(function (d) {
          if (d && d.redirect) {
            try { global.location.replace(d.redirect); } catch (_e) {}
            return;
          }
          if (!d || !d.success) throw new Error('fest_person');
          renderStaffData(d, personId);
        });
    }
    // Facts in parallel with /head — don't wait for filmography paint
    prefetchStaffPersonFacts(personId);
    return fetch(API_BASE + '/api/public/person/' + encodeURIComponent(personId) + '/head', { method: 'GET', mode: 'cors' })
      .then(function (r) {
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then(function (head) {
        if (!head || !head.success) throw new Error('head');
        var rolesMeta = head.roles || [];
        _staffPrimaryRoleKey = rolesMeta.length
          ? String(rolesMeta[0].role_key || '').toUpperCase()
          : '';
        var filmsByRole = rolesMeta.map(function (rm) {
          return {
            role_key: rm.role_key,
            role_name: staffRoleDisplayName(rm.role_key, rm.role_name),
            films: [],
            total: rm.total || 0,
          };
        });
        renderStaffData({
          success: true,
          person: head.person || {},
          filters: head.filters || { years: [], genres: [] },
          films_by_role: filmsByRole,
          web_facts: head.web_facts || null,
          kp_facts: head.kp_facts || null,
        }, personId);
        return loadStaffRolesProgressive(personId, rolesMeta);
      });
  }

  function loadStaffLegacy(personId, authed) {
    var url = authed
      ? API_BASE + '/api/site/persons/' + encodeURIComponent(personId)
      : API_BASE + '/api/public/person/' + encodeURIComponent(personId);
    var headers = authed ? mpAuthHeaders() : {};
    return fetch(url, { method: 'GET', mode: 'cors', headers: headers })
      .then(function (r) {
        if (r.status === 401 && authed) {
          return fetch(API_BASE + '/api/public/person/' + encodeURIComponent(personId), { method: 'GET', mode: 'cors' })
            .then(function (r2) {
              if (!r2.ok) throw new Error('http_' + r2.status);
              return r2.json();
            });
        }
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then(function (d) {
        renderStaffData(d, personId);
        if (_staffFilterState.friendsRatedOnly && mpToken()) {
          paintStaffRoles();
        }
      });
  }

  function loadStaff(personId) {
    var loadPromise = loadStaffProgressive(personId);
    return loadPromise
      .then(function () {
        if (isFestPersonId(personId)) return;
        fetch(API_BASE + '/api/public/staff/' + encodeURIComponent(personId), { method: 'GET', mode: 'cors' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (seo) { applyStaffSeoFromApi(seo); })
          .catch(function () {});
      })
      .catch(function (err) {
        var root = staffContentRoot();
        if (!root) return;
        var msg = (err && String(err.message || err).indexOf('http_404') >= 0)
          ? 'Не удалось загрузить фильмографию. Попробуйте обновить страницу.'
          : 'Ошибка сети';
        root.innerHTML = '<p class="film-page-error-hint">' + msg + '</p>';
      });
  }

  function markRouteReady() {
    try {
      document.documentElement.classList.remove('mp-route-pending');
      document.documentElement.classList.add('mp-route-ready');
    } catch (_e) {}
  }

  function bootstrap(opts) {
    opts = opts || {};
    var raw = String(opts.personId || '');
    var personId = isFestPersonId(raw) ? raw : raw.replace(/\D/g, '');
    if (!personId) {
      markRouteReady();
      return;
    }
    markRouteReady();
    try {
      document.body.classList.add('staff-standalone-page');
      document.body.classList.remove(
        'film-standalone-page',
        'landing-root-page',
        'film-header-title-on',
        'film-header-title-only',
        'film-header-search-with-title'
      );
    } catch (_e) {}
    if (canUseInlineCabinetShell()) {
      bootstrapInlineCabinetShell(personId);
    } else {
      renderStaffShell(personId);
    }
    loadStaff(personId);
  }

  global.MpStaffPage = { bootstrap: bootstrap, API_BASE: API_BASE };
})(typeof window !== 'undefined' ? window : this);
