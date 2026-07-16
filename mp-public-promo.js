(function (global) {
  'use strict';

  function hasSiteToken() {
    try {
      if (typeof global.getToken === 'function' && global.getToken()) return true;
      var active = localStorage.getItem('mp_site_active_chat_id');
      var sessions = JSON.parse(localStorage.getItem('mp_site_sessions') || '[]');
      if (Array.isArray(sessions)) {
        for (var i = 0; i < sessions.length; i++) {
          if (String(sessions[i].chat_id) === String(active) && sessions[i].token) return true;
        }
      }
      return !!localStorage.getItem('mp_site_token');
    } catch (_e) {
      return false;
    }
  }

  function rememberReturnPath() {
    try {
      var path = (global.location.pathname || '/') + (global.location.search || '');
      sessionStorage.setItem('mp_oauth_return', path);
      if (typeof global.__mpWriteOnboardReturnFromLocation === 'function') {
        global.__mpWriteOnboardReturnFromLocation();
        return;
      }
      var pathOnly = (global.location.pathname || '/').replace(/\/$/, '') || '/';
      var film = pathOnly.match(/^\/f\/(\d+)$/);
      var staff = pathOnly.match(/^\/s\/(\d+)$/);
      if (film) {
        sessionStorage.setItem('mp_onboard_return', JSON.stringify({
          type: 'film', id: film[1], path: '/f/' + film[1], savedAt: Date.now(),
        }));
      } else if (staff) {
        sessionStorage.setItem('mp_onboard_return', JSON.stringify({
          type: 'staff', id: staff[1], path: '/s/' + staff[1], savedAt: Date.now(),
        }));
      }
    } catch (_e) {}
  }

  function openRegisterCta() {
    try {
      rememberReturnPath();
      if (global.MpPublicFilmLogin && typeof global.MpPublicFilmLogin.open === 'function') {
        global.MpPublicFilmLogin.open('');
      } else if (typeof global.showLoginModalOverlay === 'function') {
        global.showLoginModalOverlay();
      }
      document.querySelectorAll('[data-login-tab="register"]').forEach(function (btn) {
        btn.click();
      });
    } catch (_e) {}
  }

  function buildMpPublicPromoHtml() {
    return (
      '<section class="mp-public-promo" aria-label="О Movie Planner">'
      + '<div class="what-is-v2 what-is-v2--public-page">'
      + '<div class="what-is-v2-label">Что такое Movie Planner</div>'
      + '<div class="what-is-v2-title">'
      + 'Трекер фильмов и сериалов<br>'
      + 'с <span class="gradient-text">планированием<wbr> просмотров</span>'
      + '</div>'
      + '<div class="what-is-v2-text">'
      + 'Собирайте личную базу, отмечайте что уже посмотрели, ведите совместный список с друзьями или партнёром. '
      + 'Планируйте дома и в кино, прикрепляйте билеты — сервис напомнит вовремя. '
      + 'Оценивайте, сравнивайте вкусы и не теряйте фильмы в длинном списке «когда-нибудь».'
      + '</div>'
      + '<div class="what-is-v2-cta">'
      + '<button type="button" class="header-login-btn what-is-v2-register-btn" data-mp-register-cta="1">Зарегистрироваться</button>'
      + '</div>'
      + '</div>'
      + '</section>'
    );
  }

  function bindPromoRegisterBtn(scope) {
    if (!scope) return;
    scope.querySelectorAll('[data-mp-register-cta]').forEach(function (btn) {
      if (btn.dataset.mpRegisterBound === '1') return;
      btn.dataset.mpRegisterBound = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openRegisterCta();
      });
    });
  }

  function resolvePromoMountRoot(pageRoot) {
    if (!pageRoot) return null;
    if (pageRoot.id === 'film-page-content') return pageRoot;
    if (pageRoot.classList && pageRoot.classList.contains('movie-page')) return pageRoot;
    var nested = pageRoot.querySelector && pageRoot.querySelector('#film-page-content');
    if (nested) return nested;
    if (pageRoot.classList && pageRoot.classList.contains('staff-page')) {
      return pageRoot.parentElement || pageRoot;
    }
    if (pageRoot.querySelector && pageRoot.querySelector('header.staff-hero, .staff-page, .staff-hero')) {
      return pageRoot;
    }
    var filmPage = document.getElementById('film-page-content');
    if (filmPage && (filmPage === pageRoot || filmPage.contains(pageRoot))) return filmPage;
    return pageRoot;
  }

  function findPromoAnchor(root) {
    if (!root || !root.querySelector) return null;
    var similar = root.querySelector('.film-page-similar-section');
    if (similar) return similar;
    var staff = root.querySelector('article.staff-page, .staff-page');
    if (staff && staff !== root) return staff;
    if (root.classList && root.classList.contains('staff-page')) return root;
    return root.querySelector('section.film-hero-with-tag, section.hero.film-hero-with-tag, section.hero')
      || root.querySelector('header.staff-hero, .staff-hero');
  }

  function mountMpPublicPromoAfterHero(pageRoot) {
    if (hasSiteToken()) return;
    var root = resolvePromoMountRoot(pageRoot) || document.getElementById('film-page-content');
    if (!root) return;
    if (root.querySelector('.mp-public-promo')) return;
    var anchor = findPromoAnchor(root);
    if (!anchor) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = buildMpPublicPromoHtml();
    var promo = wrap.firstElementChild;
    if (!promo) return;
    if (anchor === root) {
      root.appendChild(promo);
    } else {
      anchor.insertAdjacentElement('afterend', promo);
    }
    bindPromoRegisterBtn(promo);
    try {
      if (global.MPIcons && global.MPIcons.hydrate) global.MPIcons.hydrate(promo);
    } catch (_e) {}
  }

  global.MpPublicPromo = {
    buildHtml: buildMpPublicPromoHtml,
    mountAfterHero: mountMpPublicPromoAfterHero,
    bindRegister: bindPromoRegisterBtn,
  };
})(typeof window !== 'undefined' ? window : globalThis);
