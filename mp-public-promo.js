(function (global) {
  'use strict';

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

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

  function openRegisterCta() {
    try {
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

  function mountMpPublicPromoAfterHero(pageRoot) {
    if (!pageRoot || hasSiteToken()) return;
    if (pageRoot.querySelector('.mp-public-promo')) return;
    var anchor = pageRoot.querySelector('.film-page-similar-section')
      || pageRoot.querySelector(
      ':scope > section.hero, :scope > section.film-hero-with-tag, :scope > section, .staff-page > header.staff-hero, header.staff-hero'
    );
    if (!anchor) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = buildMpPublicPromoHtml();
    var promo = wrap.firstElementChild;
    if (!promo) return;
    anchor.insertAdjacentElement('afterend', promo);
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
