/**
 * Shared standalone film page (/f/:kp) for guests and authenticated users.
 */
(function (global) {
  'use strict';

  var API_BASE = (function () {
    try {
      var loc = global.location;
      var h = loc.hostname || '';
      if (h === 'movie-planner.ru' || h === 'www.movie-planner.ru') return loc.protocol + '//' + h;
    } catch (_e) {}
    return 'https://movie-planner.ru';
  })();

  function appOpenBannerHtml() {
    if (global.MpAppOpenBanner && MpAppOpenBanner.appOpenBannerHtml) {
      return MpAppOpenBanner.appOpenBannerHtml();
    }
    return (
      '<div id="app-open-banner" class="app-open-banner hidden">' +
        '<span class="app-open-text">Открыть в приложении Movie Planner?</span>' +
        '<div class="app-open-actions">' +
          '<button type="button" class="btn-app-open" id="app-open-btn">Открыть</button>' +
          '<button type="button" class="btn-app-dismiss" id="app-dismiss-btn">Позже</button>' +
        '</div>' +
      '</div>'
    );
  }

  function setupAppOpenBanner(opts) {
    if (global.MpAppOpenBanner && MpAppOpenBanner.setupAppOpenBanner) {
      MpAppOpenBanner.setupAppOpenBanner(opts);
      return;
    }
  }


  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function isFilmDescPlaceholder(text) {
    var s = String(text || '').trim().toLowerCase();
    if (!s) return true;
    if (s.indexOf('откройте в movie planner') === 0) return true;
    if (s.indexOf('откройте фильм в movie planner') === 0) return true;
    return false;
  }

  function pickFilmDescription(film) {
    if (!film) return '';
    var raw = film.description || film.plot || film.shortDescription || '';
    var s = String(raw).trim();
    if (!s || isFilmDescPlaceholder(s)) return '';
    return s;
  }

  function trimMetaText(text, maxLen) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (s.length <= maxLen) return s;
    var cut = s.slice(0, maxLen - 1);
    var sp = cut.lastIndexOf(' ');
    if (sp > 40) cut = cut.slice(0, sp);
    return cut.replace(/[.,;:!?\s]+$/, '') + '…';
  }

  function filmMetaDescription(film, fallbackTitle) {
    var title = fallbackTitle || 'Фильм';
    var plot = pickFilmDescription(film);
    if (plot) return trimMetaText(title + '. ' + plot, 160);
    var genres = film && film.genres ? String(film.genres).trim() : '';
    if (genres) return trimMetaText(title + ' — ' + genres + '. Карточка на Movie Planner.', 160);
    return title + ' — карточка фильма на Movie Planner.';
  }

  function setFilmDescription(text) {
    var dEl = document.getElementById('film-desc');
    if (!dEl) return;
    var s = String(text || '').trim();
    if (!s || isFilmDescPlaceholder(s)) {
      dEl.textContent = '';
      dEl.classList.add('hidden');
      dEl.classList.remove('skeleton');
      return;
    }
    dEl.textContent = s;
    dEl.classList.remove('hidden', 'skeleton');
  }

  function buildRatingStars(current) {
    var cur = Number(current) || 0;
    var html = '';
    for (var i = 1; i <= 10; i++) {
      html += '<button type="button" class="rating-star' + (cur >= i ? ' filled' : '') + '" data-rating-value="' + i + '" aria-label="Оценить на ' + i + '">' + i + '</button>';
    }
    if (cur) html += '<span class="rating-current" data-rating-current>' + cur + '/10</span>';
    return html;
  }

  function buildFilmPlanDropdown(item) {
    if (!item || !item.kp_id) return '';
    var kp = String(item.kp_id).replace(/\D/g, '');
    if (!kp) return '';
    var titleAttr = escapeHtml(item.title || '');
    var yearAttr = escapeHtml(String(item.year || ''));
    var showCinemaWatch = item.plan_type === 'cinema' || item.in_cinema === true;
    var planItems = [
      '<button type="button" class="action-dropdown-item" data-goto-plans="home">🏠 Дома</button>',
      '<button type="button" class="action-dropdown-item" data-goto-plans="cinema">🎥 В кино</button>',
    ].join('');
    var watchItems = [];
    if (item.online_link) {
      watchItems.push('<a class="action-dropdown-item" href="' + escapeHtml(item.online_link) + '" target="_blank" rel="noopener">🎞 Онлайн-кинотеатр</a>');
    }
    if (showCinemaWatch) {
      watchItems.push('<button type="button" class="action-dropdown-item" data-tickets="1" data-kp="' + kp + '" data-title="' + titleAttr + '" data-year="' + yearAttr + '">🎫 В кино (билет)</button>');
    }
    var menuItems = planItems + watchItems.join('');
    return '<div class="action-dropdown" data-dropdown-root="plan">' +
      '<button type="button" class="action-dropdown-btn film-toolbar-plan" data-dropdown-toggle="1">' +
      '<span class="action-dropdown-btn-label"><span class="action-dropdown-btn-emoji" aria-hidden="true">📅</span><span class="action-dropdown-btn-text">Запланировать просмотр</span></span>' +
      '<span class="action-dropdown-caret">▾</span></button>' +
      '<div class="action-dropdown-menu">' + menuItems + '</div></div>';
  }

  function buildFilmPageToolbar(item, opts) {
    opts = opts || {};
    var inBase = !!opts.inBase;
    var watched = !!opts.watched;
    var myRating = Number(opts.myRating) || 0;
    var canRate = opts.canRate !== false;
    var ratingLocked = !!opts.ratingLocked;
    var authenticated = !!opts.authenticated;
    var usePublicRatingGrid = !inBase || !authenticated;
    var ratingInner = '';
    if (ratingLocked) {
      ratingInner = '<p class="film-rating-locked-hint">В группе оценку ставят только администраторы и создатель.</p>';
    } else if (usePublicRatingGrid) {
      ratingInner = '<div class="film-toolbar-rating-grid rating-grid" id="rate-grid">' +
        [1,2,3,4,5,6,7,8,9,10].map(function (n) { return '<button type="button" class="rate-btn" data-rate="' + n + '">' + n + '</button>'; }).join('') +
        '</div>';
    } else {
      ratingInner = '<div class="film-toolbar-rating-grid"><div class="rating-stars" data-rating-stars="1">' + buildRatingStars(myRating) + '</div></div>' +
        (myRating ? '<div class="film-rating-share-row"><button type="button" class="rating-remove-btn" data-action="remove-rating">Убрать оценку</button></div>' : '');
    }
    var planBlock = (authenticated && inBase)
      ? '<div class="film-toolbar-plan-wrap">' + buildFilmPlanDropdown(item) + '</div>'
      : '<button type="button" class="film-toolbar-plan" id="plan-watch-btn"><span class="film-icon-ico" aria-hidden="true">📅</span><span>Запланировать просмотр</span></button>';
    var addIconBtn = !inBase
      ? '<button type="button" class="film-icon-btn" id="add-btn" aria-label="Добавить в базу" title="Добавить в базу"><span class="film-icon-ico">+</span><span class="film-icon-label">В базу</span></button>'
      : '';
    var watchIconBtn = inBase
      ? '<button type="button" class="film-icon-btn film-icon-btn--watched' + (watched ? ' on' : '') + '" data-action="toggle-watched" aria-label="' + (watched ? 'Просмотрен' : 'Отметить просмотренным') + '" title="' + (watched ? 'Просмотрен' : 'Отметить просмотренным') + '"><span class="film-icon-ico">✓</span><span class="film-icon-label">' + (watched ? 'Просмотрен' : 'Просмотрен') + '</span></button>'
      : '';
    var rateIco = (myRating >= 1 && myRating <= 10) ? String(myRating) : '★';
    var rateAria = myRating ? ('Оценка ' + myRating) : 'Оценить';
    var rateBtnClass = 'film-icon-btn' + (myRating ? ' film-icon-btn--rated' : '');
    var rateLabelHtml = myRating ? '' : '<span class="film-icon-label">Оценить</span>';
    var rateBtn = canRate && !ratingLocked
      ? '<button type="button" class="' + rateBtnClass + '" id="rate-toggle-btn" data-rate-toggle="1" aria-label="' + rateAria + '" title="' + rateAria + '"><span class="film-icon-ico">' + rateIco + '</span>' + rateLabelHtml + '</button>'
      : '';
    return '<div class="film-page-toolbar">' + planBlock +
      '<div class="film-toolbar-icons">' + addIconBtn + watchIconBtn + rateBtn +
      '<button type="button" class="film-icon-btn hidden" id="facts-toggle-btn" data-facts-toggle="1" data-kp="' + escapeHtml(String(item.kp_id || '')) + '" aria-label="Интересные факты" title="Интересные факты"><span class="film-icon-ico">🤔</span><span class="film-icon-label">Факты</span></button>' +
      '<button type="button" class="film-icon-btn" id="share-film-btn" data-share-film="1" data-kp="' + escapeHtml(String(item.kp_id || '')) + '" aria-label="Поделиться" title="Поделиться"><span class="film-icon-ico">↗</span><span class="film-icon-label">Поделиться</span></button></div>' +
      '<div class="film-toolbar-expand hidden" id="rating-expand-panel"><div class="public-rating-title">Ваша оценка</div>' + ratingInner + '</div>' +
      '<div class="film-toolbar-expand hidden" id="facts-expand-panel"><ul class="film-toolbar-facts-list" id="facts-list"></ul></div></div>';
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

  function sessionNameFromStorage() {
    try {
      var active = localStorage.getItem('mp_site_active_chat_id');
      var row = mpSessions().find(function (x) { return String(x.chat_id) === String(active); });
      return (row && row.name) || 'Профиль';
    } catch (_e) { return 'Профиль'; }
  }

  var _filmPlanDropdownDocBound = false;

  function closeFilmPlanDropdowns(except) {
    document.querySelectorAll('.action-dropdown.open').forEach(function (d) {
      if (d !== except) d.classList.remove('open');
    });
  }

  function bindFilmPlanDropdowns(root, onPickPlace) {
    if (!root) return;
    root.querySelectorAll('[data-dropdown-toggle="1"]').forEach(function (tog) {
      if (tog._mpPlanToggleBound) return;
      tog._mpPlanToggleBound = true;
      tog.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var dd = tog.closest('.action-dropdown');
        if (!dd) return;
        var wasOpen = dd.classList.contains('open');
        closeFilmPlanDropdowns(wasOpen ? null : dd);
        if (!wasOpen) dd.classList.add('open');
      });
    });
    root.querySelectorAll('[data-goto-plans]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeFilmPlanDropdowns();
        var place = btn.getAttribute('data-goto-plans') || 'home';
        if (onPickPlace) onPickPlace(place);
      });
    });
    if (!_filmPlanDropdownDocBound) {
      _filmPlanDropdownDocBound = true;
      document.addEventListener('click', function (ev) {
        if (!ev.target.closest('.action-dropdown')) closeFilmPlanDropdowns();
      });
    }
  }

  function standaloneHeaderSearchHtml() {
    return '<div class="header-search" id="header-search" role="search">' +
      '<span class="header-search-icon" aria-hidden="true">🔍</span>' +
      '<input type="text" id="header-search-input" class="header-search-input" placeholder="Найти фильм или сериал…" autocomplete="off" aria-label="Поиск">' +
      '<button type="button" class="header-search-mic" id="header-search-mic" aria-label="Голосовой ввод" title="Голосовой ввод">🎤</button>' +
      '<button type="button" class="header-search-clear hidden" id="header-search-clear" aria-label="Очистить">×</button>' +
      '<div class="header-search-dropdown hidden" id="header-search-dropdown" role="listbox"></div>' +
    '</div>';
  }

  var STANDALONE_SECTION_PATHS = {
    settings: '/settings',
    groups: '/groups',
    stats: '/stats',
    shazam: '/shazam',
    integrations: '/integrations',
    about: '/about',
    home: '/home',
    tournament: '/tournament',
  };

  function standaloneNavHtml() {
    var tabs = [
      { href: '/home', label: 'Главная', emoji: '🏠' },
      { href: '/plans', label: 'Планы', emoji: '📋' },
      { href: '/premieres', label: 'Премьеры', emoji: '🎭' },
      { href: '/watchlist', label: 'База', emoji: '🎬' },
      { href: '/whattowatch', label: 'Что посмотреть', emoji: '🎯' },
      { href: '/tournament', label: 'Турнир', emoji: '🏆' },
    ];
    return '<nav class="cabinet-nav film-standalone-nav" id="film-standalone-nav" aria-label="Разделы">' +
      tabs.map(function (t) {
        return '<a class="cabinet-nav-btn" href="' + t.href + '"><span class="cabinet-nav-btn-emoji">' + t.emoji + '</span><span class="cabinet-nav-btn-text">' + escapeHtml(t.label) + '</span></a>';
      }).join('') +
    '</nav>';
  }

  function setStandaloneHeaderAvatar(el, url, name, apiBase) {
    if (!el) return;
    var initial = String(name || 'П').trim().charAt(0).toUpperCase() || 'П';
    var src = String(url || '').trim();
    if (src && !/^https?:\/\//i.test(src) && src.indexOf('data:') !== 0) {
      if (src.indexOf('/api/') === 0) src = apiBase + src;
    }
    if (src) {
      el.innerHTML = '<img src="' + escapeHtml(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
      var img = el.querySelector('img');
      if (img) img.addEventListener('error', function () { el.textContent = initial; }, { once: true });
    } else {
      el.textContent = initial;
    }
  }

  function bindStandaloneLogoHome() {
    document.querySelectorAll('a.logo[href="/"], a.logo[href="/index.html"]').forEach(function (a) {
      if (a.dataset.mpLogoHomeBound) return;
      a.dataset.mpLogoHomeBound = '1';
      a.addEventListener('click', function (e) {
        if (!mpToken()) return;
        e.preventDefault();
        global.location.href = '/home';
      });
    });
  }

  function bindStandaloneSearch(apiBase, loginNow) {
    var input = document.getElementById('header-search-input');
    var dd = document.getElementById('header-search-dropdown');
    var clearBtn = document.getElementById('header-search-clear');
    var timer = null;
    var lastAt = 0;
    var controller = null;
    var seq = 0;
    if (!input || !dd) return;
    function escapeText(v) {
      return String(v || '').replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
      });
    }
    function hide() { dd.classList.add('hidden'); dd.innerHTML = ''; }
    function cleanPoster(src) {
      var s = String(src || '');
      return s && s.indexOf('/no-poster') === -1 ? s : '';
    }
    function render(items) {
      if (!items || !items.length) {
        dd.innerHTML = '<div class="search-result-meta">Ничего не нашлось</div>';
        dd.classList.remove('hidden');
        return;
      }
      dd.innerHTML = items.slice(0, 6).map(function (it) {
        var typeLabel = it.type === 'series' ? 'Сериал' : 'Фильм';
        var year = it.year && String(it.year) !== 'null' ? String(it.year) : '';
        var posterSafe = cleanPoster(it.poster).replace(/"/g, '&quot;');
        return '<a class="search-result" href="/f/' + encodeURIComponent(String(it.kp_id)) + '">' +
          (posterSafe ? '<img class="search-result-poster" src="' + posterSafe + '" alt="" loading="lazy">' : '<span class="search-result-poster">🎬</span>') +
          '<span><span class="search-result-title">' + escapeText(it.title) + '</span>' +
          '<span class="search-result-meta"><span>' + escapeText(typeLabel) + '</span>' + (year ? '<span>·</span><span>' + escapeText(year) + '</span>' : '') + '</span></span></a>';
      }).join('');
      dd.classList.remove('hidden');
    }
    function run(q) {
      q = String(q || '').trim();
      if (clearBtn) clearBtn.classList.toggle('hidden', !q);
      if (q.length < 2) { hide(); return; }
      var wait = Math.max(0, 1000 - (Date.now() - lastAt));
      clearTimeout(timer);
      timer = setTimeout(function () {
        lastAt = Date.now();
        var mySeq = ++seq;
        if (controller) controller.abort();
        controller = global.AbortController ? new AbortController() : null;
        dd.innerHTML = '<div class="search-result-meta">Ищем…</div>';
        dd.classList.remove('hidden');
        fetch(apiBase + '/api/public/search?q=' + encodeURIComponent(q.slice(0, 60)) + '&limit=6', {
          method: 'GET',
          mode: 'cors',
          signal: controller ? controller.signal : undefined,
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (mySeq !== seq) return;
            render((data && data.items) || []);
          })
          .catch(function (e) {
            if (e && e.name === 'AbortError') return;
            if (mySeq === seq) dd.innerHTML = '<div class="search-result-meta">Не удалось найти</div>';
          });
      }, wait || 260);
    }
    input.addEventListener('input', function () { run(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; if (clearBtn) clearBtn.classList.add('hidden'); hide(); }
      if (e.key === 'Enter') {
        var q = input.value.trim();
        if (q.length >= 2) global.location.href = '/search?q=' + encodeURIComponent(q);
      }
    });
    input.addEventListener('focus', function () {
      if (input.value.trim().length >= 2 && dd.innerHTML) dd.classList.remove('hidden');
    });
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        input.value = '';
        clearBtn.classList.add('hidden');
        hide();
        input.focus();
      });
    }
    document.addEventListener('click', function (e) {
      var wrap = document.getElementById('header-search');
      if (wrap && !wrap.contains(e.target)) dd.classList.add('hidden');
    });
  }

  function bindStandaloneVoiceMic(apiBase, loginNow) {
    var mic = document.getElementById('header-search-mic');
    var input = document.getElementById('header-search-input');
    if (!mic || mic._mpVoxBound) return;
    mic._mpVoxBound = true;
    mic.addEventListener('click', function () {
      if (!mpToken()) { if (loginNow) loginNow(); return; }
      if (mic._mpRec) {
        var r = mic._mpRecorder;
        if (r && r.state === 'recording') { try { r.stop(); } catch (_e) {} }
        return;
      }
      if (mic._mpPending) return;
      if (!navigator.mediaDevices || !global.MediaRecorder) return;
      mic._mpPending = true;
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        mic._mpPending = false;
        var ch = [];
        var opt = (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') && 'audio/webm;codecs=opus') ||
          (MediaRecorder.isTypeSupported('audio/webm') && 'audio/webm') || 'audio/ogg';
        var rec = new MediaRecorder(stream, { mimeType: opt });
        mic._mpRecorder = rec;
        rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) ch.push(ev.data); };
        rec.onstop = function () {
          try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_e) {}
          mic._mpRecorder = null;
          mic.classList.remove('recording');
          mic._mpRec = false;
          if (!ch.length) return;
          var blob = new Blob(ch, { type: rec.mimeType || 'audio/webm' });
          var fd = new FormData();
          fd.append('audio', blob, 'q.webm');
          var voxH = mpAuthHeaders();
          delete voxH['Content-Type'];
          fetch(apiBase + '/api/site/voice-transcribe', { method: 'POST', body: fd, headers: voxH })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d && d.success && d.text && input) {
                input.value = d.text;
                input.dispatchEvent(new Event('input', { bubbles: true }));
              }
            })
            .catch(function () {});
        };
        mic._mpRec = true;
        mic.classList.add('recording');
        rec.start(100);
      }).catch(function () { mic._mpPending = false; });
    });
  }

  function closeStandaloneAccountDropdown() {
    var dd = document.getElementById('header-settings-dropdown');
    var settingsBtn = document.getElementById('header-settings-btn');
    if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'false');
    if (dd) {
      dd.classList.add('hidden');
      dd.classList.remove('open');
    }
  }

  function openStandaloneAccountDropdown(opts) {
    opts = opts || {};
    var dd = document.getElementById('header-settings-dropdown');
    var settingsBtn = document.getElementById('header-settings-btn');
    if (!dd) return;
    if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'true');
    var extUrl = 'https://chromewebstore.google.com/detail/movie-planner-bot/fldeclcfcngcjphhklommcebkpfipdol?authuser=0&hl=ru';
    var html = '<div class="header-dropdown-title">Перейти</div>'
      + '<button type="button" class="header-settings-nav-item" data-settings-go="settings">👤 Профиль</button>'
      + '<button type="button" class="header-settings-nav-item" data-settings-go="groups">👥 Друзья и группы</button>'
      + '<button type="button" class="header-settings-nav-item" data-settings-go="stats">📊 Статистика</button>'
      + '<button type="button" class="header-settings-nav-item" data-settings-go="shazam">🔮 Подбор по описанию</button>'
      + '<button type="button" class="header-settings-nav-item" data-settings-go="integrations">🔌 Интеграции</button>'
      + '<a class="header-settings-nav-item header-settings-nav-item--external" href="' + escapeHtml(extUrl) + '" target="_blank" rel="noopener">💻 Расширение для Chrome</a>'
      + '<button type="button" class="header-settings-nav-item" data-settings-go="about">ℹ️ О проекте</button>';
    dd.innerHTML = html;
    dd.querySelectorAll('[data-settings-go]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        closeStandaloneAccountDropdown();
        var go = btn.getAttribute('data-settings-go');
        var path = STANDALONE_SECTION_PATHS[go];
        if (path) global.location.href = path;
      });
    });
    dd.classList.remove('hidden');
    dd.classList.add('open');
  }

  function bindStandaloneHeaderChrome(me, opts) {
    opts = opts || {};
    var uid = me && me.user_id;
    var pill = document.getElementById('header-profile-pill');
    if (pill && !pill.dataset.mpStandaloneBound) {
      pill.dataset.mpStandaloneBound = '1';
      pill.addEventListener('click', function (e) {
        e.preventDefault();
        closeStandaloneAccountDropdown();
        if (uid) {
          global.location.href = '/u/' + encodeURIComponent(String(uid));
        }
      });
    }
    var settingsBtn = document.getElementById('header-settings-btn');
    if (settingsBtn && !settingsBtn.dataset.mpStandaloneBound) {
      settingsBtn.dataset.mpStandaloneBound = '1';
      settingsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var dd = document.getElementById('header-settings-dropdown');
        if (dd && dd.classList.contains('open') && !dd.classList.contains('hidden')) {
          closeStandaloneAccountDropdown();
        } else {
          openStandaloneAccountDropdown(opts);
        }
      });
    }
    var coinsBtn = document.getElementById('header-coins-btn');
    if (coinsBtn && me && me.coins && !coinsBtn.dataset.mpCoinsBound) {
      coinsBtn.dataset.mpCoinsBound = '1';
      coinsBtn.addEventListener('click', function () {
        var c = me.coins;
        var msg = c.is_infinite ? 'Безлимитные монетки' : ('Монетки: ' + (c.balance != null ? c.balance : '—'));
        try {
          var el = document.getElementById('public-toast');
          if (!el) {
            el = document.createElement('div');
            el.id = 'public-toast';
            el.className = 'public-toast';
            document.body.appendChild(el);
          }
          el.textContent = msg;
          el.classList.add('show');
          clearTimeout(el._hideTimer);
          el._hideTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
        } catch (_e) {}
      });
    }
    if (!global._mpStandaloneDropdownCloseBound) {
      global._mpStandaloneDropdownCloseBound = true;
      document.addEventListener('click', function (e) {
        var wrap = document.getElementById('header-user-wrap');
        if (wrap && !wrap.contains(e.target)) closeStandaloneAccountDropdown();
      });
    }
  }

  function applyStandaloneAuthChrome(me, opts) {
    opts = opts || {};
    var apiBase = opts.apiBase || API_BASE;
    var mainSelector = opts.mainSelector || 'main.film-page';
    var header = document.getElementById('site-header');
    if (!header) return;
    var name = (me && me.name) || 'Профиль';
    var coinsVal = '—';
    if (me && me.coins) {
      coinsVal = me.coins.is_infinite ? '∞' : (me.coins.balance != null ? String(me.coins.balance) : '—');
    }
    var photo = (me && (me.photo_url || me.avatar_url)) || '';
    if (!photo && me && me.chat_id) {
      photo = apiBase + '/api/avatar/' + encodeURIComponent(String(me.chat_id)) + '.jpg';
    }
    header.innerHTML =
      '<div class="header-content">' +
        '<a class="logo" href="/"><img src="/images/icon48.png" alt="Movie Planner"><span>Movie Planner</span></a>' +
        standaloneHeaderSearchHtml() +
        '<div class="header-buttons">' +
          '<div class="header-user-wrap account-switcher" id="header-user-wrap" style="position:relative">' +
            '<button type="button" class="header-profile-pill" id="header-profile-pill" aria-label="Профиль">' +
              '<span class="header-profile-avatar" id="header-profile-avatar"></span>' +
              '<span class="header-profile-name" id="header-profile-name">' + escapeHtml(name) + '</span>' +
            '</button>' +
            '<div class="header-util-row">' +
              '<button type="button" class="header-coins-btn" id="header-coins-btn" aria-label="Монетки">' +
                '<span class="header-coins-sprite"></span><span id="header-coins-val">' + escapeHtml(coinsVal) + '</span>' +
              '</button>' +
            '</div>' +
            '<button type="button" class="header-settings-btn" id="header-settings-btn" aria-haspopup="true" aria-expanded="false" title="Настройки">' +
              '<span class="header-settings-btn-icon" aria-hidden="true">⚙️</span><span class="header-settings-btn-text">Настройки</span>' +
            '</button>' +
            '<div class="header-settings-dropdown account-dropdown hidden" id="header-settings-dropdown" role="menu"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    setStandaloneHeaderAvatar(document.getElementById('header-profile-avatar'), photo, name, apiBase);
    bindStandaloneHeaderChrome(me, opts);
    var shell = document.querySelector('.page-shell');
    var main = shell && shell.querySelector(mainSelector);
    var nav = document.getElementById('film-standalone-nav');
    if (nav) nav.remove();
    if (shell && main) {
      var navWrap = document.createElement('div');
      navWrap.innerHTML = standaloneNavHtml();
      shell.insertBefore(navWrap.firstElementChild, main);
    }
    bindStandaloneSearch(apiBase, opts.loginNow);
    bindStandaloneVoiceMic(apiBase, opts.loginNow);
    bindStandaloneLogoHome();
  }

  function refreshStandaloneAuthChrome(opts) {
    opts = opts || {};
    var apiBase = opts.apiBase || API_BASE;
    if (!mpToken() || opts.forcePublic) {
      var nav = document.getElementById('film-standalone-nav');
      if (nav) nav.remove();
      return;
    }
    fetch(apiBase + '/api/site/me', { headers: mpAuthHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (me) {
        if (!me || !me.success) return;
        applyStandaloneAuthChrome(me, opts);
        if (opts.onAuthSuccess) opts.onAuthSuccess(me);
      })
      .catch(function () {});
  }

  function initStandaloneSiteChrome(opts) {
    opts = opts || {};
    var apiBase = opts.apiBase || API_BASE;
    var loginNow = opts.loginNow || function (action) {
      if (global.MpPublicFilmLogin) {
        MpPublicFilmLogin.open(action || '');
        return;
      }
      var path = opts.spaReturnPath || global.location.pathname || '/';
      global.location.href = '/?open_login=1&__spa=' + encodeURIComponent(path);
    };
    var loginBtn = document.getElementById('login-btn');
    if (loginBtn && opts.bindLogin !== false) {
      loginBtn.addEventListener('click', function () { loginNow(); });
    }
    bindStandaloneSearch(apiBase, loginNow);
    bindStandaloneLogoHome();
    if (global.MpPublicFilmLogin && opts.initPublicFilmLogin !== false) {
      MpPublicFilmLogin.init({
        kpId: opts.kpId || '',
        apiBase: apiBase,
        onSuccess: function () {
          refreshStandaloneAuthChrome(opts);
          if (opts.onLoginSuccess) opts.onLoginSuccess();
        },
      });
    }
    function refresh() { refreshStandaloneAuthChrome(opts); }
    refresh();
    return { refresh: refresh, loginNow: loginNow };
  }

  function renderFilmPage(opts) {
    opts = opts || {};
    var kpId = String(opts.kpId || '').replace(/\D/g, '');
    if (!kpId) return;

      function sessionsEarly() {
        try { return JSON.parse(localStorage.getItem('mp_site_sessions') || '[]'); } catch (_e) { return []; }
      }
      function tokenEarly() {
        try {
          var active = localStorage.getItem('mp_site_active_chat_id');
          var row = sessionsEarly().find(function (x) { return String(x.chat_id) === String(active); });
          return row ? row.token : null;
        } catch (_e) { return null; }
      }
      var forcePublic = false;
      try {
        var forceKp = sessionStorage.getItem('mp_public_film_force');
        if (forceKp && String(forceKp) === String(kpId)) {
          sessionStorage.removeItem('mp_public_film_force');
          forcePublic = true;
          localStorage.removeItem('mp_site_active_chat_id');
          localStorage.setItem('mp_site_sessions', '[]');
          localStorage.removeItem('mp_site_token');
        }
      } catch (_e) {}
      var poster = 'https://st.kp.yandex.net/images/film_big/' + kpId + '.jpg';
      var tgMini = 'https://t.me/movie_planner_bot/app?startapp=' + encodeURIComponent('film_' + kpId);
      var apiBase = opts.apiBase || API_BASE;
      var pageUrl = (opts.pageUrl || (window.location.origin + '/f/' + kpId));
      var fallbackFacts = [
        'Добавьте фильм в базу, чтобы он появился в вашем Movie Planner.',
        'Оценка сохранится в профиле и поможет рекомендациям.',
        'Фильм можно сразу запланировать для домашнего просмотра или кинотеатра.'
      ];

      document.title = 'Фильм · Movie Planner';
      document.documentElement.style.setProperty('--film-backdrop', 'url("' + poster + '")');
      document.body.innerHTML =
        '<div class="page-shell">' +
          '<header id="site-header">' +
            '<div class="header-content">' +
              '<a class="logo" href="/"><img src="/images/icon48.png" alt="Movie Planner"><span>Movie Planner</span></a>' +
              '<div class="header-search" id="header-search" role="search">' +
                '<span class="header-search-icon" aria-hidden="true">🔍</span>' +
                '<input type="text" id="header-search-input" class="header-search-input" placeholder="Найти фильм или сериал…" autocomplete="off" aria-label="Поиск">' +
                '<button type="button" class="header-search-mic" id="header-search-mic" aria-label="Голосовой ввод" title="Голосовой ввод">🎤</button>' +
                '<button type="button" class="header-search-clear hidden" id="header-search-clear" aria-label="Очистить">×</button>' +
                '<div class="header-search-dropdown hidden" id="header-search-dropdown" role="listbox"></div>' +
              '</div>' +
              '<div class="header-buttons">' +
                '<button type="button" class="btn-primary" id="login-btn">Войти</button>' +
              '</div>' +
            '</div>' +
          '</header>' +
          appOpenBannerHtml() +
          '<main class="film-page">' +
            '<section class="hero">' +
              '<div class="poster-wrap"><img class="poster" id="poster" src="' + poster + '" alt="Постер" onerror="this.style.opacity=.22"></div>' +
              '<div class="hero-content">' +
                '<h1 id="film-title">Фильм #' + kpId + '</h1>' +
                '<div class="eyebrow" id="chips"></div>' +
                '<div class="film-hero-crew" id="film-cast-root"></div>' +
                '<p class="description skeleton" id="film-desc">Открываем описание фильма в Movie Planner.</p>' +
                '<div class="film-page-toolbar">' +
                  '<button type="button" class="film-toolbar-plan" id="plan-watch-btn"><span class="film-icon-ico" aria-hidden="true">📅</span><span>Запланировать просмотр</span></button>' +
                  '<div class="film-toolbar-icons">' +
                    '<button type="button" class="film-icon-btn" id="add-btn" aria-label="Добавить в базу" title="Добавить в базу"><span class="film-icon-ico">+</span><span class="film-icon-label">В базу</span></button>' +
                    '<button type="button" class="film-icon-btn" id="rate-toggle-btn" aria-label="Оценить" title="Оценить"><span class="film-icon-ico">★</span><span class="film-icon-label">Оценить</span></button>' +
                    '<button type="button" class="film-icon-btn hidden" id="facts-toggle-btn" aria-label="Интересные факты" title="Интересные факты"><span class="film-icon-ico">🤔</span><span class="film-icon-label">Факты</span></button>' +
                    '<button type="button" class="film-icon-btn" id="share-film-btn" aria-label="Поделиться" title="Поделиться"><span class="film-icon-ico">↗</span><span class="film-icon-label">Поделиться</span></button>' +
                  '</div>' +
                  '<div class="film-toolbar-expand hidden" id="rating-expand-panel">' +
                    '<div class="public-rating-title">Ваша оценка</div>' +
                    '<div class="film-toolbar-rating-grid rating-grid" id="rate-grid">' +
                      [1,2,3,4,5,6,7,8,9,10].map(function (n) {
                        return '<button class="rate-btn" data-rate="' + n + '" type="button">' + n + '</button>';
                      }).join('') +
                    '</div>' +
                  '</div>' +
                  '<div class="film-toolbar-expand hidden" id="facts-expand-panel"><ul class="film-toolbar-facts-list" id="facts-list"></ul></div>' +
                '</div>' +
                '<div id="film-friends-social-block" class="hidden"></div>' +
                '<p class="status" id="hint"></p>' +
              '</div>' +
            '</section>' +
          '</main>' +
          '<aside id="film-seo-root" class="film-seo-root visually-hidden" aria-label="О фильме"></aside>' +
          '<footer class="footer">' +
            '<div class="container">' +
              '<div class="footer-content">' +
                '<div class="footer-info">' +
                  '<h3>Контакты</h3>' +
                  '<p>📍 Москва</p>' +
                  '<p>📞 +7 (977) 613-45-08</p>' +
                  '<p>✉️ <a href="mailto:movie_planner_bot@yandex.com">movie_planner_bot@yandex.com</a></p>' +
                  '<p>💬 <a href="https://t.me/zapnikita95" target="_blank" rel="noopener">По всем вопросам: @zapnikita95</a></p>' +
                '</div>' +
                '<div class="footer-social">' +
                  '<h3>Мы в соцсетях</h3>' +
                  '<div class="social-links">' +
                    '<a href="https://t.me/movie_planner_channel" target="_blank" rel="noopener" class="social-link" aria-label="Telegram канал"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161l-1.84 8.68c-.135.608-.486.758-.984.472l-2.72-2.004-1.313 1.26c-.149.15-.275.275-.564.275l.2-2.83 5.033-4.547c.22-.196-.048-.305-.342-.11l-6.22 3.918-2.68-.84c-.584-.183-.598-.584.11-.88l10.46-4.03c.486-.18.91.112.75.7z"/></svg></a>' +
                    '<a href="https://instagram.com/movie_planner_bot" target="_blank" rel="noopener" class="social-link" aria-label="Instagram"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></a>' +
                    '<a href="https://vc.ru/telegram/2707791-movie-planner-bot-telegram-servis-dlya-planirovaniya-filmov-i-serialov" target="_blank" rel="noopener" class="social-link social-link-vc" aria-label="VC.ru"><img src="/images/vc.png?v=20260526white" alt="VC.ru"></a>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="footer-bottom">' +
                '<p>© ' + String(new Date().getFullYear()) + ' Movie Planner. Все права защищены. · ' +
                  '<a href="/usloviya-ispolzovaniya.html" class="footer-link-muted">Условия использования</a>' +
                  ' · <a href="/politika-konfidentsialnosti.html" class="footer-link-muted">Политика конфиденциальности</a>' +
                  ' · <a href="/oferta-i-oplata.html" class="footer-link-muted">Оплата и оферта</a>' +
                  ' · <a href="/agents.html" class="footer-link-muted">API и нейросети</a>' +
                  ' · <a href="https://movie-planner.ru/developer" class="footer-link-muted">Документация API</a>' +
                '</p>' +
              '</div>' +
            '</div>' +
          '</footer>' +
        '</div>';

      if (tokenEarly() && !forcePublic) {
        applyStandaloneAuthChrome({
          success: true,
          name: sessionNameFromStorage(),
          chat_id: localStorage.getItem('mp_site_active_chat_id'),
        }, {
          apiBase: apiBase,
          mainSelector: 'main.film-page',
          forcePublic: forcePublic,
          loginNow: function (action) {
            if (global.MpPublicFilmLogin) {
              MpPublicFilmLogin.open(action || '');
              return;
            }
            global.location.href = '/?open_login=1&__spa=' + encodeURIComponent('/f/' + kpId);
          },
        });
      }

      var hint = document.getElementById('hint');

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

      function setOgFromFilm(film, headline) {
        var head = document.head;
        var title = (film && film.page_title) || (headline + ' — смотреть онлайн, описание, рейтинг, актёры | Movie Planner');
        var desc = (film && film.meta_description) || filmMetaDescription(film, headline);
        var keywords = (film && film.meta_keywords) || '';
        var img = String((film && film.poster_url) || poster || '').trim();
        setPageFavicon(img);
        function meta(attr, name, content) {
          if (!content) return;
          var el = head.querySelector('meta[' + attr + '="' + name + '"]');
          if (!el) {
            el = document.createElement('meta');
            el.setAttribute(attr, name);
            head.appendChild(el);
          }
          el.setAttribute('content', content);
        }
        document.title = title;
        meta('property', 'og:type', 'video.movie');
        meta('property', 'og:site_name', 'Movie Planner');
        meta('property', 'og:locale', 'ru_RU');
        meta('property', 'og:url', pageUrl);
        meta('property', 'og:title', (film && film.title ? ((film.title + (film.year ? ' (' + film.year + ')' : ''))) : headline));
        meta('property', 'og:description', desc);
        if (keywords) meta('name', 'keywords', keywords);
        if (img) {
          meta('property', 'og:image', img);
          meta('property', 'og:image:secure_url', img);
          meta('property', 'og:image:width', '1000');
          meta('property', 'og:image:height', '1500');
          meta('property', 'og:image:alt', 'Постер: ' + headline);
          meta('name', 'twitter:image', img);
          meta('name', 'twitter:image:alt', 'Постер: ' + headline);
        }
        meta('name', 'twitter:card', 'summary_large_image');
        meta('name', 'twitter:title', headline);
        meta('name', 'twitter:description', desc);
        meta('name', 'description', desc);
        meta('name', 'robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
        var canon = head.querySelector('link[rel="canonical"]');
        if (!canon) {
          canon = document.createElement('link');
          canon.rel = 'canonical';
          head.appendChild(canon);
        }
        canon.href = (film && film.canonical) || pageUrl;
      }
      setPageFavicon(poster);
      setOgFromFilm(null, 'Фильм');

      function setFilmJsonLd(film) {
        try {
          var head = document.head;
          var node = head.querySelector('#film-jsonld');
          if (!node) {
            node = document.createElement('script');
            node.type = 'application/ld+json';
            node.id = 'film-jsonld';
            head.appendChild(node);
          }
          if (film && film.json_ld) {
            node.textContent = JSON.stringify(film.json_ld);
            return;
          }
          var kp = String(kpId || '').replace(/\D/g, '');
          var title = String((film && film.title) || '').trim();
          var year = Number((film && film.year) || 0) || null;
          var description = String((pickFilmDescription(film) || title || 'Фильм в Movie Planner')).trim();
          var image = String((film && film.poster_url) || poster || '').trim();
          var genres = String((film && film.genres) || '')
            .split(/[,;/|]+/)
            .map(function (s) { return String(s || '').trim(); })
            .filter(Boolean)
            .slice(0, 6);
          var payload = {
            '@context': 'https://schema.org',
            '@type': 'Movie',
            name: title || ('Фильм ' + kp),
            description: description,
            url: pageUrl,
            image: image || undefined,
            datePublished: year ? (String(year) + '-01-01') : undefined,
            genre: genres.length ? genres : undefined,
            sameAs: kp ? ('https://www.kinopoisk.ru/film/' + kp + '/') : undefined,
          };
          if (film && film.country) {
            payload.countryOfOrigin = {
              '@type': 'Country',
              name: String(film.country),
            };
          }
          if (film && film.director && film.director.name_ru) {
            payload.director = { '@type': 'Person', name: String(film.director.name_ru) };
          }
          node.textContent = JSON.stringify(payload);
        } catch (_e) {}
      }

      function sessions() {
        try { return JSON.parse(localStorage.getItem('mp_site_sessions') || '[]'); } catch (_e) { return []; }
      }
      function token() {
        try {
          var active = localStorage.getItem('mp_site_active_chat_id');
          var row = sessions().find(function (x) { return String(x.chat_id) === String(active); });
          return row ? row.token : null;
        } catch (_e) { return null; }
      }
      function authHeaders() {
        var h = { 'Content-Type': 'application/json' };
        var t = token();
        if (t) h.Authorization = 'Bearer ' + t;
        return h;
      }
      function loginNow(action) {
        if (window.MpPublicFilmLogin) {
          MpPublicFilmLogin.open(action || '');
          return;
        }
        if (hint) hint.textContent = 'Открываем вход…';
        var suffix = action ? '&action=' + encodeURIComponent(action) : '';
        setTimeout(function () {
          window.location.href = '/?open_login=1&kp_open=' + encodeURIComponent(kpId) + suffix;
        }, 180);
      }
      function rememberAction(action) {
        try { sessionStorage.setItem('mp_public_film_action', action + ':' + kpId); } catch (_e) {}
      }
      function apiGet(path) {
        return fetch(apiBase + path, { method: 'GET', mode: 'cors' }).then(function (r) {
          if (!r.ok) throw new Error('api_' + r.status);
          return r.json();
        });
      }
      function renderGenreChips(genresStr, isSeries) {
        var container = document.getElementById('chips');
        if (!container) return;
        container.innerHTML = '';
        var parts = String(genresStr || '')
          .split(/[,;/|]+/)
          .map(function (s) { return s.trim(); })
          .filter(Boolean);
        if (!parts.length) parts = [isSeries ? 'сериал' : 'фильм'];
        parts.slice(0, 8).forEach(function (label) {
          var chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = label;
          container.appendChild(chip);
        });
      }
      function setFactsToggleVisible(hasFacts) {
        var btn = document.getElementById('facts-toggle-btn');
        var panel = document.getElementById('facts-expand-panel');
        if (btn) btn.classList.toggle('hidden', !hasFacts);
        if (!hasFacts && panel) {
          panel.classList.add('hidden');
          if (btn) btn.classList.remove('is-active');
        }
      }
      function renderFacts(items) {
        var list = document.getElementById('facts-list');
        if (!list) return;
        var arr = (items && items.length) ? items.slice(0, 6) : [];
        list.innerHTML = '';
        arr.forEach(function (x) {
          var li = document.createElement('li');
          li.textContent = String(x || '');
          list.appendChild(li);
        });
        setFactsToggleVisible(arr.length > 0);
      }
      var CAST_VISIBLE = 5;
      function castPersonLink(entry) {
        if (!entry || entry.kp_person_id == null) return '';
        var nm = String(entry.name_ru || entry.name_en || '').replace(/[&<>"']/g, function (c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
        if (!nm) return '';
        var kp = String(entry.kp_person_id);
        return '<a href="/s/' + encodeURIComponent(kp) + '" class="staff-cast-link" data-staff-kp="' + kp + '" data-staff-name="' + nm + '">' + nm + '</a>';
      }
      function buildPublicCastHtml(director, actors, country) {
        var parts = [];
        var ctry = String(country || '').trim();
        if (ctry) {
          parts.push('<div class="film-cast-row"><span class="film-cast-label">Страна:</span> ' + ctry.replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
          }) + '</div>');
        }
        if (director) {
          parts.push('<div class="film-cast-row"><span class="film-cast-label">Режиссёр:</span> ' + castPersonLink(director) + '</div>');
        }
        var links = (actors || []).map(castPersonLink).filter(Boolean);
        if (!links.length) return parts.join('');
        var collapsed = links.slice(0, CAST_VISIBLE);
        var row = '<div class="film-cast-row film-cast-actors"><span class="film-cast-label">Актёры:</span> ';
        if (links.length > CAST_VISIBLE) {
          row += '<span class="film-actors-short">' + collapsed.join('<span class="film-cast-sep">, </span>') + '</span>';
          row += '<span class="film-actors-full hidden"><span class="film-cast-sep">, </span>' +
            links.slice(CAST_VISIBLE).join('<span class="film-cast-sep">, </span>') + '</span>';
          row += ' <button type="button" class="film-actors-more-btn" aria-expanded="false">ещё</button>';
        } else {
          row += links.join('<span class="film-cast-sep">, </span>');
        }
        row += '</div>';
        parts.push(row);
        return parts.join('');
      }
      function bindPublicCastLinks(root) {
        if (!root) return;
        var hoverEl = document.getElementById('staff-hover-preview');
        if (!hoverEl) {
          hoverEl = document.createElement('div');
          hoverEl.id = 'staff-hover-preview';
          hoverEl.className = 'staff-hover-preview hidden';
          hoverEl.innerHTML = '<img alt="" class="staff-hover-photo"><div class="staff-hover-name"></div>';
          document.body.appendChild(hoverEl);
        }
        var hoverTimer = null;
        var hoverKp = null;
        function hidePreview() {
          hoverEl.classList.add('hidden');
          hoverKp = null;
        }
        root.querySelectorAll('.staff-cast-link').forEach(function (link) {
          link.addEventListener('mouseenter', function (e) {
            if (window.matchMedia && !window.matchMedia('(hover: hover)').matches) return;
            var kp = link.getAttribute('data-staff-kp');
            var nm = link.getAttribute('data-staff-name') || link.textContent || '';
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(function () {
              hoverKp = kp;
              hoverEl.querySelector('.staff-hover-name').textContent = nm;
              var img = hoverEl.querySelector('.staff-hover-photo');
              img.style.display = 'none';
              img.removeAttribute('src');
              hoverEl.classList.remove('hidden');
              hoverEl.style.left = Math.min(window.innerWidth - 220, e.clientX + 14) + 'px';
              hoverEl.style.top = Math.min(window.innerHeight - 120, e.clientY + 14) + 'px';
              if (kp) {
                img.src = 'https://st.kp.yandex.net/images/actor_iphone/iphone360_' + kp + '.jpg';
                img.style.display = 'block';
                img.onerror = function () { img.style.display = 'none'; };
              }
            }, 180);
          });
          link.addEventListener('mouseleave', function () {
            clearTimeout(hoverTimer);
            hidePreview();
          });
        });
        var moreBtn = root.querySelector('.film-actors-more-btn');
        if (moreBtn) {
          moreBtn.addEventListener('click', function () {
            var shortEl = root.querySelector('.film-actors-short');
            var fullEl = root.querySelector('.film-actors-full');
            if (!shortEl || !fullEl) return;
            var expanded = fullEl.classList.contains('hidden');
            fullEl.classList.toggle('hidden', !expanded);
            shortEl.classList.toggle('hidden', expanded);
            moreBtn.textContent = expanded ? 'свернуть' : 'ещё';
            moreBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          });
        }
      }
      var publicFilmCountry = '';
      function loadPublicCast() {
        var root = document.getElementById('film-cast-root');
        if (!root) return;
        apiGet('/api/public/film/' + encodeURIComponent(kpId) + '/cast')
          .then(function (d) {
            if (!d || !d.success) { root.innerHTML = buildPublicCastHtml(null, [], publicFilmCountry); return; }
            var html = buildPublicCastHtml(d.director, d.actors || [], publicFilmCountry);
            root.innerHTML = html || '';
            if (html) bindPublicCastLinks(root);
          })
          .catch(function () {
            var html = buildPublicCastHtml(null, [], publicFilmCountry);
            root.innerHTML = html || '';
          });
      }
      function showPublicToast(message) {
        var el = document.getElementById('public-toast');
        if (!el) {
          el = document.createElement('div');
          el.id = 'public-toast';
          el.className = 'public-toast';
          document.body.appendChild(el);
        }
        el.textContent = message || '';
        requestAnimationFrame(function () { el.classList.add('show'); });
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(function () { el.classList.remove('show'); }, 2800);
      }
      function showPublicCoinPop(anchor, delta) {
        var rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
        if (!rect) return;
        var pop = document.createElement('div');
        pop.className = 'public-coin-pop';
        pop.textContent = '🪙 +' + String(delta || 40);
        pop.style.left = Math.round(rect.left + rect.width / 2) + 'px';
        pop.style.top = Math.round(rect.top + rect.height / 2) + 'px';
        document.body.appendChild(pop);
        setTimeout(function () { try { pop.remove(); } catch (_e) {} }, 1300);
      }

      function filmTitleForPlan() {
        var el = document.getElementById('film-title');
        var raw = el ? String(el.textContent || '').trim() : '';
        return raw.replace(/\s*\(\d{4}\)\s*$/, '').trim() || 'Фильм';
      }

      function openStandalonePlanModal(filmLike, place) {
        if (!window.MpPlanModal || typeof MpPlanModal.open !== 'function') {
          showPublicToast('Форма плана недоступна');
          return;
        }
        var fl = filmLike || {};
        MpPlanModal.open({
          apiBase: apiBase,
          getAuthHeaders: authHeaders,
          onToast: showPublicToast,
          film: {
            film_id: fl.film_id != null ? Number(fl.film_id) : null,
            kp_id: fl.kp_id || kpId,
            title: fl.title || filmTitleForPlan(),
            year: fl.year,
            poster: fl.poster || fl.poster_url,
          },
          mode: place === 'cinema' ? 'cinema' : 'home',
          onSuccess: function () {
            if (hint) hint.textContent = '';
          },
        });
      }

      function startPlanFlow(place) {
        place = place === 'cinema' ? 'cinema' : 'home';
        if (!token()) { rememberAction('plan'); loginNow('plan'); return; }
        fetch(apiBase + '/api/site/film-by-kp/' + encodeURIComponent(kpId), { headers: authHeaders() })
          .then(function (r) { return r.json(); })
          .then(function (lookup) {
            if (lookup && lookup.in_library && lookup.film_id) {
              return fetch(apiBase + '/api/site/film/' + encodeURIComponent(String(lookup.film_id)), { headers: authHeaders() })
                .then(function (r2) { return r2.json(); })
                .then(function (detail) {
                  var f = detail && detail.film ? detail.film : { kp_id: kpId, film_id: lookup.film_id };
                  openStandalonePlanModal(f, place);
                });
            }
            return ensureFilm().then(function (d) {
              if (!d || !d.success) {
                if (hint) hint.textContent = (d && d.error) || 'Не удалось подготовить фильм';
                return;
              }
              openStandalonePlanModal({ kp_id: kpId, film_id: d.film_id, title: filmTitleForPlan() }, place);
            });
          })
          .catch(function () { showPublicToast('Ошибка сети'); });
      }

      function loadFacts() {
        return apiGet('/api/public/film/' + encodeURIComponent(kpId) + '/facts')
          .then(function (d) {
            var arr = [];
            if (d && Array.isArray(d.facts)) arr = d.facts.slice(0, 6);
            if (!arr.length && d && Array.isArray(d.bloopers)) arr = d.bloopers.slice(0, 6);
            renderFacts(arr);
            return arr;
          })
          .catch(function () { renderFacts([]); return []; });
      }

      loadFacts();
      apiGet('/api/public/film/' + encodeURIComponent(kpId))
        .then(function (data) {
          if (!data || !data.success || !data.film) {
            loadPublicCast();
            return;
          }
          var f = data.film;
          publicFilmCountry = f.country || '';
          var title = (f.title || 'Фильм') + (f.year ? ' (' + f.year + ')' : '');
          var tEl = document.getElementById('film-title');
          var dEl = document.getElementById('film-desc');
          if (tEl) tEl.textContent = title;
          setFilmDescription(pickFilmDescription(f));
          renderGenreChips(f.genres, f.is_series);
          if (f.poster_url) {
            var pEl = document.getElementById('poster');
            if (pEl) pEl.src = f.poster_url;
            document.documentElement.style.setProperty('--film-backdrop', 'url("' + f.poster_url + '")');
          }
          setOgFromFilm(f, title);
          setFilmJsonLd(f);
          if (f.seo_body_html) {
            var seoRoot = document.getElementById('film-seo-root');
            if (seoRoot) seoRoot.innerHTML = f.seo_body_html;
          }
          if (hint) hint.textContent = '';
          loadPublicCast();
        })
        .catch(function () {
          setFilmDescription('');
          loadPublicCast();
        });

      function ensureFilm() {
        return fetch(apiBase + '/api/site/add-film', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ kp_id: Number(kpId) })
        }).then(function (r) {
          if (r.status === 401) { loginNow(); return null; }
          return r.json();
        });
      }
      function goCabinet(action) {
        var suffix = action ? '&action=' + encodeURIComponent(action) : '';
        window.location.href = '/?kp_open=' + encodeURIComponent(kpId) + suffix;
      }
      function addCurrentFilm() {
        if (!token()) { rememberAction('add'); loginNow('add'); return; }
        ensureFilm()
          .then(function (d) {
            if (!d) return;
            if (d.success) {
              if (hint) hint.textContent = 'Фильм добавлен';
              loadAuthFilmState();
            } else if (hint) {
              hint.textContent = d.error || 'Не удалось добавить';
            }
          })
          .catch(function () { if (hint) hint.textContent = 'Ошибка сети'; });
      }
      function planCurrentFilm() {
        startPlanFlow('home');
      }
      function setCurrentRating(v, anchor) {
        if (!token()) { rememberAction('rate' + String(v)); loginNow('rate' + String(v)); return; }
        ensureFilm()
          .then(function (d) {
            if (!d || !d.success || !d.film_id) throw new Error('Не удалось подготовить фильм');
            return fetch(apiBase + '/api/site/film/' + encodeURIComponent(String(d.film_id)) + '/rating', {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({ rating: v })
            });
          })
          .then(function (r) {
            if (!r) return null;
            if (r.status === 401) { loginNow(); return null; }
            return r.json();
          })
          .then(function (d) {
            if (!d) return;
            if (d.success) {
              hint.textContent = 'Оценка ' + String(v) + '/10 сохранена';
              if (anchor) showPublicCoinPop(anchor, Number(d.coins_added) || 40);
              showPublicToast('Оценка сохранена. Начислили монетки за активность.');
              loadAuthFilmState();
            } else hint.textContent = d.error || 'Не удалось поставить оценку';
          })
          .catch(function (e) {
            hint.textContent = (e && e.message) || 'Ошибка оценки';
          });
      }
      function rebindGuestToolbarActions() {
        var addBtn = document.getElementById('add-btn');
        if (addBtn) addBtn.addEventListener('click', addCurrentFilm);
        var planWatchBtn = document.getElementById('plan-watch-btn');
        if (planWatchBtn) planWatchBtn.addEventListener('click', planCurrentFilm);
        var rg = document.getElementById('rate-grid');
        if (!rg) return;
        rg.querySelectorAll('[data-rate]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var v = Number(btn.getAttribute('data-rate'));
            if (!(v >= 1 && v <= 10)) return;
            setCurrentRating(v, btn);
          });
        });
      }
      rebindGuestToolbarActions();
      var loginBtn = document.getElementById('login-btn');
      if (loginBtn) loginBtn.addEventListener('click', function () { loginNow(); });

      function consumePendingAction() {
        try {
          var pending = sessionStorage.getItem('mp_public_film_action') || '';
          if (!pending || pending.split(':')[1] !== kpId || !token()) return;
          sessionStorage.removeItem('mp_public_film_action');
          if (pending.indexOf('plan:') === 0) startPlanFlow('home');
          else if (pending.indexOf('add:') === 0) addCurrentFilm();
          else if (pending.indexOf('rate') === 0) {
            var rating = Number((pending.split(':')[0] || '').replace('rate', ''));
            var rateToggle = document.getElementById('rate-toggle-btn');
            var ratingPanel = document.getElementById('rating-expand-panel');
            if (rateToggle && ratingPanel) {
              ratingPanel.classList.remove('hidden');
              rateToggle.classList.add('is-active');
            }
            if (rating >= 1 && rating <= 10) setCurrentRating(rating, document.querySelector('[data-rate="' + rating + '"]'));
          }
        } catch (_e) {}
      }

      function bindPublicFilmToolbar() {
        var rateToggle = document.getElementById('rate-toggle-btn');
        var factsToggle = document.getElementById('facts-toggle-btn');
        var shareBtn = document.getElementById('share-film-btn');
        var ratingPanel = document.getElementById('rating-expand-panel');
        var factsPanel = document.getElementById('facts-expand-panel');
        function togglePanel(btn, panel) {
          if (!btn || !panel) return;
          var open = !panel.classList.contains('hidden');
          if (ratingPanel && panel !== ratingPanel) ratingPanel.classList.add('hidden');
          if (factsPanel && panel !== factsPanel) factsPanel.classList.add('hidden');
          [rateToggle, factsToggle].forEach(function (b) { if (b) b.classList.remove('is-active'); });
          if (open) {
            panel.classList.add('hidden');
            btn.classList.remove('is-active');
            return;
          }
          panel.classList.remove('hidden');
          btn.classList.add('is-active');
        }
        if (rateToggle) {
          rateToggle.addEventListener('click', function () {
            if (!token()) { rememberAction('rate'); loginNow(); return; }
            togglePanel(rateToggle, ratingPanel);
          });
        }
        if (factsToggle) {
          factsToggle.addEventListener('click', function () {
            togglePanel(factsToggle, factsPanel);
          });
        }
        if (shareBtn) {
          shareBtn.addEventListener('click', function () {
            var url = pageUrl;
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(url).then(function () {
                showPublicToast('Ссылка скопирована');
              }).catch(function () { showPublicToast(url); });
            } else {
              showPublicToast(url);
            }
          });
        }
      }
      setupAppOpenBanner({ id: kpId, kind: 'film' });
      bindPublicFilmToolbar();
      var standaloneChrome = initStandaloneSiteChrome({
        apiBase: apiBase,
        mainSelector: 'main.film-page',
        spaReturnPath: '/f/' + kpId,
        kpId: kpId,
        forcePublic: forcePublic,
        bindLogin: false,
        loginNow: loginNow,
        onLoginSuccess: function () { loadAuthFilmState(); loadFilmFriendsSocialBlock(); consumePendingAction(); },
      });

      function applyAuthToolbar(filmState) {
        var hero = document.querySelector('.film-page .hero-content');
        if (!hero) return;
        var old = hero.querySelector('.film-page-toolbar');
        if (old) old.remove();
        var stub = filmState.film || { kp_id: kpId };
        var toolbarHtml = buildFilmPageToolbar(stub, filmState.toolbarOpts || {});
        hero.insertAdjacentHTML('beforeend', toolbarHtml);
        bindAuthToolbar(stub, filmState);
        bindPublicFilmToolbar();
        loadFacts();
        loadFilmFriendsSocialBlock();
        if (!(filmState.toolbarOpts && filmState.toolbarOpts.inBase)) rebindGuestToolbarActions();
      }

      function bindAuthToolbar(film, filmState) {
        filmState = filmState || {};
        var opts = filmState.toolbarOpts || {};
        var root = document.querySelector('.film-page-toolbar');
        if (!root) return;
        if (opts.inBase && film.film_id) {
          var watchedBtn = root.querySelector('[data-action="toggle-watched"]');
          if (watchedBtn) {
            watchedBtn.addEventListener('click', function () {
              fetch(apiBase + '/api/site/film/' + film.film_id + '/watched', {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ watched: !film.watched }),
              }).then(function (r) { return r.json(); }).then(function (d) {
                if (d && d.success) { film.watched = !film.watched; applyAuthToolbar(film, filmState); }
              });
            });
          }
          var starsWrap = root.querySelector('[data-rating-stars="1"]');
          if (starsWrap) {
            starsWrap.querySelectorAll('.rating-star').forEach(function (btn) {
              btn.addEventListener('click', function () {
                var v = Number(btn.getAttribute('data-rating-value'));
                fetch(apiBase + '/api/site/film/' + film.film_id + '/rating', {
                  method: 'POST', headers: authHeaders(), body: JSON.stringify({ rating: v }),
                }).then(function (r) { return r.json(); }).then(function (d) {
                  if (d && d.success) { showPublicToast('Оценка сохранена'); filmState.toolbarOpts.myRating = v; applyAuthToolbar(film, filmState); }
                });
              });
            });
          }
          var rem = root.querySelector('[data-action="remove-rating"]');
          if (rem) {
            rem.addEventListener('click', function () {
              fetch(apiBase + '/api/site/film/' + film.film_id + '/rating', { method: 'DELETE', headers: authHeaders() })
                .then(function (r) { return r.json(); }).then(function () {
                  filmState.toolbarOpts.myRating = 0; applyAuthToolbar(film, filmState);
                });
            });
          }
          bindFilmPlanDropdowns(root, function (place) {
            openStandalonePlanModal(film, place === 'cinema' ? 'cinema' : 'home');
          });
        }
      }

      function loadFilmFriendsSocialBlock() {
        if (!token() || forcePublic) return;
        if (!global.MpFilmFriendsSocial || typeof global.MpFilmFriendsSocial.mount !== 'function') return;
        global.MpFilmFriendsSocial.mount({
          kpId: kpId,
          apiBase: apiBase,
          containerId: 'film-friends-social-block',
          authHeaders: authHeaders(),
          onFriendClick: function (uid) {
            try {
              global.location.href = '/u/' + encodeURIComponent(String(uid));
            } catch (_e) {}
          },
        });
      }

      function loadAuthFilmState() {
        if (!token() || forcePublic) return;
        fetch(apiBase + '/api/site/film-by-kp/' + encodeURIComponent(kpId), { headers: authHeaders() })
          .then(function (r) { return r.json(); })
          .then(function (lookup) {
            if (!lookup || !lookup.in_library || !lookup.film_id) {
              applyAuthToolbar({ film: { kp_id: kpId }, toolbarOpts: { inBase: false, authenticated: true } });
              return;
            }
            return fetch(apiBase + '/api/site/film/' + encodeURIComponent(String(lookup.film_id)), { headers: authHeaders() })
              .then(function (r) { return r.json(); })
              .then(function (detail) {
                if (!detail || !detail.success || !detail.film) return;
                var f = detail.film;
                var myRating = 0;
                var uid = detail.me && detail.me.user_id;
                (detail.ratings || []).forEach(function (r) {
                  if (uid && String(r.user_id) === String(uid)) myRating = Number(r.rating) || 0;
                });
                var desc = pickFilmDescription(f);
                if (desc) setFilmDescription(desc);
                applyAuthToolbar({
                  film: f,
                  toolbarOpts: {
                    inBase: true,
                    authenticated: true,
                    watched: !!f.watched,
                    myRating: myRating,
                    canRate: !(f.is_virtual_room && f.can_rate_in_group === false),
                    ratingLocked: f.is_virtual_room && f.can_rate_in_group === false,
                  },
                });
              });
          })
          .catch(function () {});
      }


      loadAuthFilmState();
      loadFilmFriendsSocialBlock();
      consumePendingAction();
  }

  function bootstrap(opts) {
    opts = opts || {};
    try { document.body.classList.add('film-standalone-page'); } catch (_e) {}
    renderFilmPage(opts);
  }

  global.MpFilmPage = {
    bootstrap: bootstrap,
    renderFilmPage: renderFilmPage,
    buildFilmPageToolbar: buildFilmPageToolbar,
    initStandaloneSiteChrome: initStandaloneSiteChrome,
    refreshStandaloneAuthChrome: refreshStandaloneAuthChrome,
    applyStandaloneAuthChrome: applyStandaloneAuthChrome,
    setupAppOpenBanner: setupAppOpenBanner,
    appOpenBannerHtml: appOpenBannerHtml,
    standaloneHeaderSearchHtml: standaloneHeaderSearchHtml,
    API_BASE: API_BASE,
  };
})(typeof window !== 'undefined' ? window : this);
