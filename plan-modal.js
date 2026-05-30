/**
 * Shared plan modal — parity with mini-app plan form (voice, NL, cinema tickets).
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }
  function pickVoiceMime() {
    var c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < c.length; i++) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c[i])) return c[i];
    }
    return '';
  }


  function defaultScheduledAt() {
    const now = new Date();
    const d = new Date(now);
    d.setHours(20, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    const pad = (n) => String(n).padStart(2, "0");
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  }
  // --- Favourite cinemas (localStorage) -------------------------------------
  const FAV_CINEMAS_KEY = "mp_fav_cinemas_v1";
  function loadFavCinemas() {
    try {
      const raw = localStorage.getItem(FAV_CINEMAS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveFavCinemas(list) {
    try { localStorage.setItem(FAV_CINEMAS_KEY, JSON.stringify(list.slice(0, 20))); } catch (e) {}
  }
  function cinemaKey(c) {
    return ((c.name || "") + "|" + (c.address || "")).toLowerCase().trim();
  }
  function isCinemaFav(c) {
    const k = cinemaKey(c);
    return loadFavCinemas().some((x) => cinemaKey(x) === k);
  }
  function toggleCinemaFav(c) {
    const list = loadFavCinemas();
    const k = cinemaKey(c);
    const idx = list.findIndex((x) => cinemaKey(x) === k);
    if (idx >= 0) {
      list.splice(idx, 1);
      saveFavCinemas(list);
      return false;
    }
    list.unshift({ name: c.name || "", address: c.address || "", lat: c.lat || null, lon: c.lon || null });
    saveFavCinemas(list);
    return true;
  }

  // --- Russian free-text date/time parser -----------------------------------
  // Handles: сегодня/завтра/послезавтра, после завтра, через N дней (цифра или слово),
  // через неделю / пару дней, следующий|ближайший <день недели>, на следующей неделе [в …],
  // дни недели (в т.ч. пятницу, в среду), утро/день/вечер, «в 19:30», 15.04, 15 апреля.
  const RU_WEEKDAYS = {
    понедельник: 1, понедельника: 1, понедельнику: 1, понедельником: 1, понедельнике: 1,
    пн: 1, пон: 1,
    вторник: 2, вторника: 2, вторнику: 2, вторником: 2, вторнике: 2,
    вт: 2, вто: 2,
    среда: 3, среду: 3, среды: 3, среде: 3, средой: 3,
    ср: 3, сре: 3,
    четверг: 4, четверга: 4, четвергу: 4, четвергом: 4, четверге: 4,
    чт: 4, чет: 4,
    пятница: 5, пятницу: 5, пятнице: 5, пятницы: 5, пятницей: 5,
    пт: 5, пят: 5,
    суббота: 6, субботу: 6, субботы: 6, субботе: 6, субботой: 6,
    сб: 6, суб: 6,
    воскресенье: 0, воскресенья: 0, воскресенью: 0, воскресеньем: 0, воскресеньи: 0,
    вс: 0, вос: 0,
  };
  const RU_REL_DAY_WORDS = {
    один: 1, одну: 1, одного: 1, одним: 1, одна: 1,
    два: 2, две: 2, двух: 2, двумя: 2,
    три: 3, трёх: 3, трех: 3,
    четыре: 4, четырёх: 4, четырех: 4,
    пять: 5, пяти: 5,
    шесть: 6, шести: 6,
    семь: 7, семи: 7,
    восемь: 8, восьми: 8,
    девять: 9, девяти: 9,
    десять: 10, десяти: 10,
  };
  const RU_MONTHS = {
    январ: 0, феврал: 1, март: 2, апрел: 3, ма: 4, июн: 5,
    июл: 6, август: 7, сентябр: 8, октябр: 9, ноябр: 10, декабр: 11,
  };
  /** JS \\b only treats [A-Za-z0-9_] as word chars — Cyrillic never matches. Use this for RU keywords. */
  function ruHasWholeWord(haystack, word) {
    if (!haystack || !word) return false;
    const h = haystack.toLowerCase();
    const w = word.toLowerCase();
    let start = 0;
    while (true) {
      const i = h.indexOf(w, start);
      if (i < 0) return false;
      const beforeOk = i === 0 || !/[0-9a-zа-яё]/i.test(h[i - 1]);
      const afterOk = i + w.length >= h.length || !/[0-9a-zа-яё]/i.test(h[i + w.length]);
      if (beforeOk && afterOk) return true;
      start = i + 1;
    }
  }
  function resolveRuWeekdayToken(tok) {
    const x = String(tok || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^а-яa-z]/g, "");
    if (!x) return null;
    const pairs = Object.entries(RU_WEEKDAYS).sort((a, b) => b[0].length - a[0].length);
    for (const [key, dow] of pairs) {
      const k = key.replace(/ё/g, "е");
      if (x === k || (x.startsWith(k) && k.length >= 2)) return dow;
    }
    return null;
  }
  function ruRelDayWordToN(w) {
    const x = String(w || "").toLowerCase().replace(/ё/g, "е");
    return RU_REL_DAY_WORDS[x] != null ? RU_REL_DAY_WORDS[x] : null;
  }
  function parseRuDateTime(text, base) {
    if (!text) return null;
    const now = base ? new Date(base) : new Date();
    const s = text.toLowerCase().trim();
    if (!s) return null;
    const d = new Date(now);
    d.setSeconds(0, 0);
    let dateSet = false, timeSet = false;

    if (ruHasWholeWord(s, "послезавтра")) {
      d.setDate(d.getDate() + 2);
      dateSet = true;
    } else if (/после\s+завтра/i.test(s)) {
      d.setDate(d.getDate() + 2);
      dateSet = true;
    }
    if (!dateSet) {
      const mNumRel = s.match(/через\s+(\d+)\s*(?:календарн(?:ых|ого|ые)?\s*)?(?:дн|ден)/i);
      if (mNumRel) {
        const n = parseInt(mNumRel[1], 10);
        if (n >= 1 && n <= 366) {
          d.setDate(d.getDate() + n);
          dateSet = true;
        }
      }
    }
    if (!dateSet) {
      const mWdRel = s.match(/через\s+([а-яё]+)\s*(?:календарн(?:ых|ого|ые)?\s*)?(?:дн|ден)/i);
      if (mWdRel) {
        const n = ruRelDayWordToN(mWdRel[1]);
        if (n != null) {
          d.setDate(d.getDate() + n);
          dateSet = true;
        }
      }
    }
    if (!dateSet && /через\s+пару\s+(?:дн|ден)/i.test(s)) {
      d.setDate(d.getDate() + 2);
      dateSet = true;
    }
    if (!dateSet && /через\s+(?:один\s+)?день(?:\s|$|[,.;!?])/i.test(s)) {
      d.setDate(d.getDate() + 1);
      dateSet = true;
    }
    if (!dateSet) {
      const mWk = s.match(/через\s+(\d+)\s+недел/i);
      if (mWk) {
        const w = parseInt(mWk[1], 10);
        if (w >= 1 && w <= 52) {
          d.setDate(d.getDate() + w * 7);
          dateSet = true;
        }
      }
    }
    if (!dateSet && /через\s+(?:одну\s+)?недел/i.test(s)) {
      d.setDate(d.getDate() + 7);
      dateSet = true;
    }
    if (!dateSet && ruHasWholeWord(s, "завтра")) {
      d.setDate(d.getDate() + 1);
      dateSet = true;
    } else if (!dateSet && ruHasWholeWord(s, "сегодня")) {
      dateSet = true;
    }
    if (!dateSet) {
      const mFollow = s.match(
        /(?:в\s+|на\s+)?(?:следующ(?:ий|ую|ее|ая|ие|его)|ближайш(?:ий|ую|ую|ее|ая)|очередн(?:ой|ая|ое))\s+([а-яё]{2,})/i,
      );
      if (mFollow) {
        const dow = resolveRuWeekdayToken(mFollow[1]);
        if (dow != null) {
          const cur = d.getDay();
          let diff = (dow - cur + 7) % 7;
          if (diff === 0) diff = 7;
          d.setDate(d.getDate() + diff);
          dateSet = true;
        }
      }
    }
    if (!dateSet) {
      const mNw = s.match(/на\s+следующей\s+неделе(?:\s+в\s+)?([а-яё]{2,})?/i);
      if (mNw) {
        if (mNw[1]) {
          const dow = resolveRuWeekdayToken(mNw[1]);
          if (dow != null) {
            const ref = new Date(d);
            const dowCur = ref.getDay();
            const daysSinceMonday = (dowCur + 6) % 7;
            const thisMonday = new Date(ref);
            thisMonday.setDate(ref.getDate() - daysSinceMonday);
            const nextMonday = new Date(thisMonday);
            nextMonday.setDate(thisMonday.getDate() + 7);
            const target = new Date(nextMonday);
            target.setDate(nextMonday.getDate() + ((dow - 1 + 7) % 7));
            d.setFullYear(target.getFullYear(), target.getMonth(), target.getDate());
            dateSet = true;
          }
        } else {
          d.setDate(d.getDate() + 7);
          dateSet = true;
        }
      }
    }
    if (!dateSet) {
      const wdEntries = Object.entries(RU_WEEKDAYS).sort((a, b) => b[0].length - a[0].length);
      for (const [w, dow] of wdEntries) {
        if (!ruHasWholeWord(s, w)) continue;
        const cur = d.getDay();
        let diff = (dow - cur + 7) % 7;
        if (diff === 0) diff = 7;
        d.setDate(d.getDate() + diff);
        dateSet = true;
        break;
      }
    }
    if (!dateSet) {
      const mDM = s.match(/\b(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?\b/);
      if (mDM) {
        const dd = parseInt(mDM[1], 10), mm = parseInt(mDM[2], 10) - 1;
        let yy = mDM[3] ? parseInt(mDM[3], 10) : d.getFullYear();
        if (yy < 100) yy += 2000;
        const candidate = new Date(yy, mm, dd, d.getHours(), d.getMinutes(), 0, 0);
        if (!isNaN(candidate)) {
          d.setFullYear(yy, mm, dd);
          dateSet = true;
        }
      }
    }
    if (!dateSet) {
      const mWord = s.match(/(?:^|[^\d])(\d{1,2})\s+([а-яё]{3,})(?:$|[^\dа-яё])/i);
      if (mWord) {
        const dd = parseInt(mWord[1], 10);
        const key = Object.keys(RU_MONTHS).find((k) => mWord[2].toLowerCase().startsWith(k));
        if (key) {
          d.setMonth(RU_MONTHS[key], dd);
          if (d < now) d.setFullYear(d.getFullYear() + 1);
          dateSet = true;
        }
      }
    }

    let mT = s.match(/\b(\d{1,2})[:.](\d{2})\b/);
    if (!mT) {
      const mv = s.match(/(?:^|[^\d\u0400-\u04FF0-9a-zA-Z])(?:в|В)\s+(\d{1,2})(?::(\d{2}))?/);
      if (mv) mT = mv;
    }
    if (!mT) mT = s.match(/\b(\d{1,2})\s*(?:ч|час)/);
    if (mT) {
      const hh = Math.min(23, parseInt(mT[1], 10));
      const mm = mT[2] ? Math.min(59, parseInt(mT[2], 10)) : 0;
      d.setHours(hh, mm, 0, 0);
      timeSet = true;
    }
    if (!timeSet) {
      if (/утром/i.test(s) || /(^|[\s,.;])утро($|[\s,.;])/i.test(s)) {
        d.setHours(10, 0, 0, 0);
        timeSet = true;
      } else if (/дн[её]м/i.test(s) || /(^|[\s,.;])день($|[\s,.;])/i.test(s) || /днем/i.test(s)) {
        d.setHours(14, 0, 0, 0);
        timeSet = true;
      } else if (/вечером/i.test(s) || /вечер/i.test(s)) {
        d.setHours(20, 0, 0, 0);
        timeSet = true;
      } else if (/ночью/i.test(s) || /ночь/i.test(s) || /(^|[\s,.;])ноч($|[\s,.;])/i.test(s)) {
        d.setHours(22, 0, 0, 0);
        timeSet = true;
      }
    }
    if (!dateSet && !timeSet) return null;
    if (!timeSet) d.setHours(20, 0, 0, 0);
    if (!dateSet && d < now) d.setDate(d.getDate() + 1);
    return d;
  }

  function formatDtRu(d) {
    if (!d || isNaN(d)) return "";
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const diffDays = Math.round((day - now) / 86400000);
    const pad = (n) => String(n).padStart(2, "0");
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (diffDays === 0) return `Сегодня в ${time}`;
    if (diffDays === 1) return `Завтра в ${time}`;
    if (diffDays === 2) return `Послезавтра в ${time}`;
    const wk = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"][d.getDay()];
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}, ${wk} в ${time}`;
  }
  function openPlanModal(opts) {
    opts = opts || {};
    var apiBase = opts.apiBase || '';
    var getHeaders = opts.getAuthHeaders || function () { return { 'Content-Type': 'application/json' }; };
    var onToast = opts.onToast || function (m) { try { console.log(m); } catch (_e) {} };
    var onSuccess = opts.onSuccess || function () {};
    var film = opts.film || {};
    var kp = String(film.kp_id || opts.kpId || '').replace(/\D/g, '');
    var fid = film.film_id != null ? Number(film.film_id) : null;
    var title = film.title || opts.title || 'Фильм';
    var year = film.year != null ? String(film.year) : '';
    var poster = film.poster || film.poster_url || (kp ? ('https://st.kp.yandex.net/images/film_big/' + kp + '.jpg') : '');

    var def = defaultScheduledAt();
    var state = {
      mode: opts.mode === 'cinema' ? 'cinema' : 'home',
      date: def.date,
      time: def.time,
      selected: (kp || fid) ? { film_id: fid, kp_id: kp, title: title, year: year, poster: poster } : null,
    };
    var pendingTicketFiles = [];
    var voiceSess = null;
    var sharedMicStream = null;
    var ov = null;
    var card = null;

    function close() {
      try { abortVoice(); } catch (_e) {}
      try { releaseMic(); } catch (_e) {}
      document.body.style.overflow = '';
      if (ov) { try { ov.remove(); } catch (_e2) {} ov = null; }
    }

    function releaseMic() {
      if (!sharedMicStream) return;
      try { sharedMicStream.getTracks().forEach(function (t) { t.stop(); }); } catch (_e) {}
      sharedMicStream = null;
    }
    function abortVoice() {
      if (!voiceSess) return;
      voiceSess.aborted = true;
      if (voiceSess.tick) clearInterval(voiceSess.tick);
      if (voiceSess.maxT) clearTimeout(voiceSess.maxT);
      try { if (voiceSess.rec && voiceSess.rec.state === 'recording') voiceSess.rec.stop(); } catch (_e) {}
      voiceSess = null;
    }
    function apiJson(path, init) {
      var h = getHeaders();
      if (init && init.body && !(init.body instanceof FormData)) h['Content-Type'] = 'application/json';
      return fetch(apiBase + path, Object.assign({ headers: h }, init || {})).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error((d && (d.error || d.message)) || ('HTTP ' + r.status));
          return d;
        });
      });
    }

    function buildDayChipsHtml() {
      var now = new Date();
      var chips = [];
      function mk(label, date) {
        var pad = function (n) { return String(n).padStart(2, '0'); };
        var d = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
        return '<button type="button" class="chip" data-day="' + d + '">' + escapeHtml(label) + '</button>';
      }
      var today = new Date(now); today.setSeconds(0, 0);
      var tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
      chips.push(mk('Сегодня', today), mk('Завтра', tomorrow));
      var names = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
      for (var i = 2; i < 5; i++) {
        var dd = new Date(now); dd.setDate(dd.getDate() + i);
        var nm = names[dd.getDay()];
        chips.push(mk(nm.charAt(0).toUpperCase() + nm.slice(1), dd));
      }
      return chips.join('');
    }

    function buildFavCinemaChipsHtml() {
      var favs = loadFavCinemas();
      if (!favs.length) return '';
      return favs.slice(0, 6).map(function (c) {
        var label = c.name || c.address || 'Кинотеатр';
        return '<button type="button" class="chip chip-fav" data-fav-cinema="' + escapeHtml(cinemaKey(c)) + '">⭐ ' + escapeHtml(label) + '</button>';
      }).join('');
    }

    function renderForm() {
      abortVoice();
      if (!card) return;
      var isCinema = state.mode === 'cinema';
      var sel = state.selected;
      var selHtml = sel ? (
        '<div class="selected-film">' +
        '<div class="selected-film-poster" style="background-image:url(\'' + escapeHtml(sel.poster || '') + '\')"></div>' +
        '<div class="selected-film-body">' +
        '<div class="selected-film-title">' + escapeHtml(sel.title || 'Фильм') + '</div>' +
        '<div class="selected-film-meta">' + escapeHtml(sel.year || '') + '</div></div></div>'
      ) : '';

      card.innerHTML =
        '<button type="button" class="mp-onboard-dismiss" data-plan-close aria-label="Закрыть">✕</button>' +
        '<div class="mp-onboard-title">Запланировать</div>' +
        '<div class="plan-page-wrap mp-plan-modal-body">' +
        '<div class="plan-mode-toggle">' +
        '<button type="button" class="plan-mode' + (!isCinema ? ' active' : '') + '" data-mode="home"><span class="plan-mode-icon">🏠</span><span class="plan-mode-label">Дома</span></button>' +
        '<button type="button" class="plan-mode' + (isCinema ? ' active' : '') + '" data-mode="cinema"><span class="plan-mode-icon">🎟️</span><span class="plan-mode-label">В кино</span></button>' +
        '</div>' +
        '<div class="field plan-voice-field">' +
        '<div class="field-label-row"><span class="field-label">Голосом</span></div>' +
        '<button type="button" id="mp-plan-voice-btn" class="btn btn-secondary btn-full">🎤 Надиктовать план</button>' +
        '<div id="mp-plan-voice-panel" class="plan-voice-active-panel hidden" role="status"><div class="plan-voice-active-head"><span class="plan-voice-active-pulse"></span><div id="mp-plan-voice-title" class="plan-voice-active-title"></div></div><p id="mp-plan-voice-sub" class="plan-voice-active-sub"></p></div>' +
        '<div id="mp-plan-voice-status" class="muted small plan-voice-status-line"></div></div>' +
        selHtml +
        '<div class="field"><label class="field-label">Когда</label>' +
        '<div class="search-relative"><span class="search-icon">🗣️</span>' +
        '<input id="mp-plan-natural" class="search-input plan-modal-input" placeholder="Например: завтра вечером" autocomplete="off">' +
        '<button type="button" id="mp-plan-natural-clear" class="search-clear hidden">✕</button></div>' +
        '<div id="mp-plan-natural-preview" class="muted small plan-natural-preview-line"></div>' +
        '<div class="dt-row plan-dt-row">' +
        '<input id="mp-plan-date" type="date" class="input dt-date plan-modal-input" value="' + escapeHtml(state.date) + '">' +
        '<input id="mp-plan-time" type="time" class="input dt-time plan-modal-input" step="300" value="' + escapeHtml(state.time) + '">' +
        '</div>' +
        '<div class="dt-quick" id="mp-plan-day-chips">' + buildDayChipsHtml() + '</div>' +
        '<div class="dt-quick" id="mp-plan-time-chips">' +
        '<button type="button" class="chip" data-time="10:00">🌅 Утро</button>' +
        '<button type="button" class="chip" data-time="14:00">☀️ День</button>' +
        '<button type="button" class="chip" data-time="20:00">🌙 Вечер</button></div></div>' +
        (isCinema ? (
          '<div class="field plan-tickets-field"><label class="field-label">Билеты</label>' +
          '<div id="mp-plan-tickets-list" class="plan-pending-tickets"></div>' +
          '<div class="ticket-upload-row">' +
          '<button type="button" class="btn btn-secondary btn-full" id="mp-plan-file-btn">＋ Прикрепить билет</button>' +
          '<button type="button" class="btn btn-secondary ticket-upload-cam" id="mp-plan-cam-btn" aria-label="Сфотографировать билет">📷</button></div>' +
          '<input type="file" id="mp-plan-file-inp" class="hidden" accept="image/*,.pdf,application/pdf" multiple>' +
          '<input type="file" id="mp-plan-cam-inp" class="hidden" accept="image/*" capture="environment"></div>' +
          '<div class="field"><label class="field-label">Кинотеатр</label>' +
          '<div class="search-relative"><span class="search-icon">📍</span>' +
          '<input id="mp-cinema-input" class="search-input plan-modal-input" placeholder="Например, «Каро 11 Октябрь»" autocomplete="off">' +
          '<button type="button" id="mp-cinema-clear" class="search-clear hidden">✕</button></div>' +
          '<div id="mp-cinema-fav-chips" class="dt-quick cinema-fav-chips-row">' + buildFavCinemaChipsHtml() + '</div>' +
          '<div id="mp-cinema-results" class="picker-results hidden"></div>' +
          '<input type="hidden" id="mp-cinema-name"><input type="hidden" id="mp-cinema-address">' +
          '<input type="hidden" id="mp-cinema-lat"><input type="hidden" id="mp-cinema-lon"></div>'
        ) : '') +
        '<button type="button" id="mp-plan-submit" class="btn btn-primary btn-full plan-submit-btn">Сохранить</button>' +
        '<div id="mp-plan-status" class="muted small plan-status-line"></div></div>';

      bindForm();
    }

    function setVoicePanel(visible, title, sub, processing) {
      var panel = card.querySelector('#mp-plan-voice-panel');
      if (!panel) return;
      if (!visible) { panel.classList.add('hidden'); panel.classList.remove('processing'); return; }
      panel.classList.remove('hidden');
      panel.classList.toggle('processing', !!processing);
      var t = card.querySelector('#mp-plan-voice-title');
      var s = card.querySelector('#mp-plan-voice-sub');
      if (t && title != null) t.textContent = title;
      if (s && sub != null) s.textContent = sub;
    }

    function applyVoiceResult(data) {
      var d = (data && data.draft) || {};
      if (d.plan_type === 'home' || d.plan_type === 'cinema') state.mode = d.plan_type;
      if (data && data.film) {
        var f = data.film;
        state.selected = {
          film_id: f.film_id != null ? Number(f.film_id) : (state.selected && state.selected.film_id),
          kp_id: f.kp_id != null ? String(f.kp_id) : (state.selected && state.selected.kp_id),
          title: f.title || title,
          year: f.year != null ? String(f.year) : year,
          poster: f.poster || poster,
        };
      }
      if (d.datetime_iso) {
        var parsed = new Date(d.datetime_iso);
        if (!isNaN(parsed.getTime())) {
          var pad = function (n) { return String(n).padStart(2, '0'); };
          state.date = parsed.getFullYear() + '-' + pad(parsed.getMonth() + 1) + '-' + pad(parsed.getDate());
          state.time = pad(parsed.getHours()) + ':' + pad(parsed.getMinutes());
        }
      }
      renderForm();
      if (d.cinema_name && state.mode === 'cinema') {
        setTimeout(function () {
          var inp = card.querySelector('#mp-cinema-input');
          if (inp) {
            inp.value = d.cinema_name + (d.cinema_address ? ' — ' + d.cinema_address : '');
            var cn = card.querySelector('#mp-cinema-name'); if (cn) cn.value = d.cinema_name;
            var ca = card.querySelector('#mp-cinema-address'); if (ca) ca.value = d.cinema_address || '';
          }
        }, 50);
      }
      var parts = [];
      if (data && data.film && data.film.title) parts.push(data.film.title);
      if (d.datetime_iso) parts.push(String(d.datetime_iso).replace('T', ' '));
      return parts.length ? ('Распознано: ' + parts.join(' · ')) : ('Распознано: ' + ((data && data.transcript) || ''));
    }

    function bindForm() {
      var isCinema = state.mode === 'cinema';
      card.querySelector('[data-plan-close]').addEventListener('click', close);
      card.querySelectorAll('.plan-mode[data-mode]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var m = btn.getAttribute('data-mode');
          if (m === state.mode) return;
          var dateEl = card.querySelector('#mp-plan-date');
          var timeEl = card.querySelector('#mp-plan-time');
          if (dateEl) state.date = dateEl.value || state.date;
          if (timeEl) state.time = timeEl.value || state.time;
          if (m === 'home') pendingTicketFiles.length = 0;
          state.mode = m;
          renderForm();
        });
      });

      var dateEl = card.querySelector('#mp-plan-date');
      var timeEl = card.querySelector('#mp-plan-time');
      var naturalEl = card.querySelector('#mp-plan-natural');
      var naturalClear = card.querySelector('#mp-plan-natural-clear');
      var naturalPreview = card.querySelector('#mp-plan-natural-preview');

      function applyNatural() {
        var raw = naturalEl ? naturalEl.value : '';
        if (!raw.trim()) { if (naturalPreview) naturalPreview.textContent = ''; return; }
        var parsed = parseRuDateTime(raw);
        if (!parsed) {
          if (naturalPreview) naturalPreview.innerHTML = '<span class="plan-nl-err">Не понял фразу 🤔</span>';
          return;
        }
        var pad = function (n) { return String(n).padStart(2, '0'); };
        state.date = parsed.getFullYear() + '-' + pad(parsed.getMonth() + 1) + '-' + pad(parsed.getDate());
        state.time = pad(parsed.getHours()) + ':' + pad(parsed.getMinutes());
        if (dateEl) dateEl.value = state.date;
        if (timeEl) timeEl.value = state.time;
        if (naturalPreview) naturalPreview.innerHTML = '→ <b>' + escapeHtml(formatDtRu(parsed)) + '</b>';
      }
      var debNatural = debounce(applyNatural, 300);
      if (naturalEl) {
        naturalEl.addEventListener('input', function (e) {
          if (naturalClear) naturalClear.classList.toggle('hidden', !e.target.value);
          debNatural();
        });
        naturalEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); applyNatural(); }
        });
      }
      if (naturalClear) {
        naturalClear.addEventListener('click', function () {
          naturalEl.value = '';
          naturalClear.classList.add('hidden');
          if (naturalPreview) naturalPreview.textContent = '';
          naturalEl.focus();
        });
      }

      var dayWrap = card.querySelector('#mp-plan-day-chips');
      if (dayWrap) {
        dayWrap.addEventListener('click', function (ev) {
          var btn = ev.target.closest('.chip[data-day]');
          if (!btn || !dateEl) return;
          dateEl.value = btn.getAttribute('data-day');
          state.date = dateEl.value;
        });
      }
      var timeWrap = card.querySelector('#mp-plan-time-chips');
      if (timeWrap) {
        timeWrap.addEventListener('click', function (ev) {
          var btn = ev.target.closest('.chip[data-time]');
          if (!btn || !timeEl) return;
          timeEl.value = btn.getAttribute('data-time');
          state.time = timeEl.value;
        });
      }
      if (dateEl) dateEl.addEventListener('change', function () { state.date = dateEl.value; });
      if (timeEl) timeEl.addEventListener('change', function () { state.time = timeEl.value; });

      // Voice
      var voiceBtn = card.querySelector('#mp-plan-voice-btn');
      var voiceStatus = card.querySelector('#mp-plan-voice-status');
      function uploadVoiceBlob(blob, durMs) {
        if (!blob.size || durMs < 800) {
          if (voiceStatus) voiceStatus.textContent = 'Слишком короткая запись';
          setVoicePanel(false);
          return;
        }
        setVoicePanel(true, 'Распознаём речь…', 'Подставим дату и время', true);
        var ext = (blob.type || '').includes('mp4') ? 'm4a' : ((blob.type || '').includes('ogg') ? 'ogg' : 'webm');
        var fd = new FormData();
        fd.append('audio', blob, 'voice.' + ext);
        var h = getHeaders();
        fetch(apiBase + '/api/miniapp/plan/voice', { method: 'POST', headers: h, body: fd })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data || !data.success) throw new Error((data && data.message) || (data && data.error) || 'Ошибка');
            var msg = applyVoiceResult(data);
            if (voiceStatus) voiceStatus.textContent = msg;
          })
          .catch(function (e) {
            if (voiceStatus) voiceStatus.textContent = (e && e.message) || 'Не удалось распознать';
          })
          .finally(function () { setVoicePanel(false); });
      }
      if (voiceBtn) {
        voiceBtn.addEventListener('click', function () {
          if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices) {
            onToast('Запись голоса не поддерживается в этом браузере');
            return;
          }
          if (voiceSess) {
            var sess = voiceSess;
            if (sess.tick) clearInterval(sess.tick);
            if (sess.maxT) clearTimeout(sess.maxT);
            setVoicePanel(true, 'Отправляем…', 'Почти готово', true);
            try { if (sess.rec && sess.rec.state === 'recording') sess.rec.stop(); } catch (_e) {}
            return;
          }
          navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
            sharedMicStream = stream;
            var mime = pickVoiceMime();
            var rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
            var chunks = [];
            var started = Date.now();
            voiceBtn.classList.add('recording');
            voiceBtn.textContent = '⏹ Остановить запись';
            setVoicePanel(true, 'Слушаю…', 'Скажите дату, время и «дома» или «в кино»', false);
            rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
            rec.onstop = function () {
              voiceBtn.classList.remove('recording');
              voiceBtn.textContent = '🎤 Надиктовать план';
              voiceSess = null;
              var blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
              uploadVoiceBlob(blob, Date.now() - started);
            };
            rec.start(100);
            voiceSess = { rec: rec, aborted: false, tick: null, maxT: setTimeout(function () {
              try { if (rec.state === 'recording') rec.stop(); } catch (_e) {}
            }, 30000) };
          }).catch(function () { onToast('Нет доступа к микрофону'); });
        });
      }

      // Cinema tickets + search
      if (isCinema) {
        function refreshTickets() {
          var list = card.querySelector('#mp-plan-tickets-list');
          if (!list) return;
          if (!pendingTicketFiles.length) { list.innerHTML = ''; return; }
          list.innerHTML = pendingTicketFiles.map(function (f, i) {
            return '<div class="plan-pending-ticket-row"><span class="plan-pending-ticket-name">' + escapeHtml(f.name || 'file') + '</span>' +
              '<button type="button" class="plan-pending-ticket-del" data-pending-idx="' + i + '">✕</button></div>';
          }).join('');
          list.querySelectorAll('[data-pending-idx]').forEach(function (del) {
            del.addEventListener('click', function () {
              var idx = parseInt(del.getAttribute('data-pending-idx'), 10);
              if (!isNaN(idx)) pendingTicketFiles.splice(idx, 1);
              refreshTickets();
            });
          });
        }
        function addFiles(files) {
          if (!files || !files.length) return;
          for (var i = 0; i < files.length; i++) pendingTicketFiles.push(files[i]);
          refreshTickets();
        }
        var pfBtn = card.querySelector('#mp-plan-file-btn');
        var pcBtn = card.querySelector('#mp-plan-cam-btn');
        var pfInp = card.querySelector('#mp-plan-file-inp');
        var pcInp = card.querySelector('#mp-plan-cam-inp');
        if (pfBtn && pfInp) {
          pfBtn.addEventListener('click', function () { pfInp.click(); });
          pfInp.addEventListener('change', function () { addFiles(pfInp.files); pfInp.value = ''; });
        }
        if (pcBtn && pcInp) {
          pcBtn.addEventListener('click', function () { pcInp.click(); });
          pcInp.addEventListener('change', function () { addFiles(pcInp.files); pcInp.value = ''; });
        }
        refreshTickets();

        var cinemaInput = card.querySelector('#mp-cinema-input');
        var cinemaClear = card.querySelector('#mp-cinema-clear');
        var cinemaResults = card.querySelector('#mp-cinema-results');
        function pickCinema(c) {
          if (!cinemaInput) return;
          cinemaInput.value = (c.name || '') + (c.address ? ' — ' + c.address : '');
          if (cinemaClear) cinemaClear.classList.remove('hidden');
          var n = card.querySelector('#mp-cinema-name'); if (n) n.value = c.name || '';
          var a = card.querySelector('#mp-cinema-address'); if (a) a.value = c.address || '';
          var la = card.querySelector('#mp-cinema-lat'); if (la) la.value = c.lat != null ? String(c.lat) : '';
          var lo = card.querySelector('#mp-cinema-lon'); if (lo) lo.value = c.lon != null ? String(c.lon) : '';
          if (cinemaResults) cinemaResults.classList.add('hidden');
        }
        var debCinema = debounce(function (q) {
          if (!q || q.length < 2) {
            if (cinemaResults) { cinemaResults.classList.add('hidden'); cinemaResults.innerHTML = ''; }
            return;
          }
          apiJson('/api/maps/cinemas?q=' + encodeURIComponent(q)).then(function (data) {
            var items = (data && data.items) || [];
            if (!cinemaResults) return;
            if (!items.length) {
              cinemaResults.classList.remove('hidden');
              cinemaResults.innerHTML = '<div class="picker-empty">Ничего не найдено</div>';
              return;
            }
            cinemaResults.classList.remove('hidden');
            cinemaResults.innerHTML = items.map(function (it) {
              var name = it.title || '';
              var addr = it.address || it.subtitle || '';
              return '<button type="button" class="picker-result cinema-pick-row" data-name="' + escapeHtml(name) + '" data-address="' + escapeHtml(addr) + '">' +
                '<div class="picker-result-body"><div class="picker-result-title">' + (it.kind === 'cinema' ? '🎬 ' : '') + escapeHtml(name) + '</div>' +
                '<div class="picker-result-meta">' + escapeHtml(addr) + '</div></div></button>';
            }).join('');
          }).catch(function () { if (cinemaResults) cinemaResults.classList.add('hidden'); });
        }, 350);
        if (cinemaInput) {
          cinemaInput.addEventListener('input', function (e) {
            if (cinemaClear) cinemaClear.classList.toggle('hidden', !e.target.value);
            debCinema(e.target.value.trim());
          });
        }
        if (cinemaClear) {
          cinemaClear.addEventListener('click', function () {
            cinemaInput.value = '';
            cinemaClear.classList.add('hidden');
            if (cinemaResults) cinemaResults.classList.add('hidden');
          });
        }
        if (cinemaResults) {
          cinemaResults.addEventListener('click', function (e) {
            var row = e.target.closest('.cinema-pick-row');
            if (!row) return;
            pickCinema({ name: row.getAttribute('data-name') || '', address: row.getAttribute('data-address') || '' });
          });
        }
        var favWrap = card.querySelector('#mp-cinema-fav-chips');
        if (favWrap) {
          favWrap.addEventListener('click', function (ev) {
            var btn = ev.target.closest('.chip[data-fav-cinema]');
            if (!btn) return;
            var k = btn.getAttribute('data-fav-cinema');
            var fav = loadFavCinemas().find(function (c) { return cinemaKey(c) === k; });
            if (fav) pickCinema(fav);
          });
        }
      }

      var submit = card.querySelector('#mp-plan-submit');
      if (submit) {
        submit.addEventListener('click', function () {
          if (!state.selected) { onToast('Выберите фильм'); return; }
          var dVal = (dateEl && dateEl.value) || state.date;
          var tVal = (timeEl && timeEl.value) || state.time;
          if (!dVal || !tVal) { onToast('Укажите дату и время'); return; }
          var dt = new Date(dVal + 'T' + tVal);
          if (isNaN(dt.getTime())) { onToast('Некорректная дата'); return; }
          var body = { plan_datetime: dt.toISOString() };
          if (state.selected.film_id) body.film_id = state.selected.film_id;
          else if (state.selected.kp_id) body.kp_id = Number(String(state.selected.kp_id).replace(/\D/g, ''));
          if (isCinema) {
            var cName = (card.querySelector('#mp-cinema-name') && card.querySelector('#mp-cinema-name').value) || '';
            var cAddr = (card.querySelector('#mp-cinema-address') && card.querySelector('#mp-cinema-address').value) || '';
            var cInput = (card.querySelector('#mp-cinema-input') && card.querySelector('#mp-cinema-input').value) || '';
            if (cName) body.cinema_name = cName;
            if (cAddr) body.cinema_address = cAddr;
            if (!cName && !cAddr && cInput.trim()) body.cinema_name = cInput.trim();
            var cLat = card.querySelector('#mp-cinema-lat'); if (cLat && cLat.value) body.cinema_lat = parseFloat(cLat.value);
            var cLon = card.querySelector('#mp-cinema-lon'); if (cLon && cLon.value) body.cinema_lon = parseFloat(cLon.value);
          }
          submit.disabled = true;
          submit.textContent = 'Сохраняем…';
          var endpoint = isCinema ? '/api/miniapp/plans/cinema' : '/api/miniapp/plans/home';
          apiJson(endpoint, { method: 'POST', body: JSON.stringify(body) })
            .then(function (res) {
              var pid = res && res.plan_id != null ? String(res.plan_id) : '';
              if (isCinema && pid && pendingTicketFiles.length) {
                var fd = new FormData();
                for (var i = 0; i < pendingTicketFiles.length; i++) fd.append('file', pendingTicketFiles[i]);
                var h = getHeaders();
                return fetch(apiBase + '/api/miniapp/plans/' + encodeURIComponent(pid) + '/tickets', { method: 'POST', headers: h, body: fd })
                  .catch(function () { onToast('План сохранён, билеты не загрузились'); return res; })
                  .then(function () { return res; });
              }
              return res;
            })
            .then(function (res) {
              close();
              onToast(isCinema ? 'План в кино сохранён' : 'План дома сохранён');
              onSuccess(res);
            })
            .catch(function (e) {
              submit.disabled = false;
              submit.textContent = 'Сохранить';
              onToast((e && e.message) || 'Не удалось сохранить план');
            });
        });
      }
    }

    ov = document.createElement('div');
    ov.className = 'mp-dialog-overlay mp-plan-modal-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    card = document.createElement('div');
    card.className = 'mp-dialog-card mp-plan-modal-card';
    ov.appendChild(card);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.style.overflow = 'hidden';
    document.body.appendChild(ov);
    renderForm();
  }

  global.MpPlanModal = { open: openPlanModal, parseRuDateTime: parseRuDateTime, formatDtRu: formatDtRu };
})(typeof window !== 'undefined' ? window : this);
