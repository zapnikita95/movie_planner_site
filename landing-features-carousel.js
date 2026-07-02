(function () {
  'use strict';

  var viewport = document.getElementById('landing-feats-viewport');
  var track = viewport && viewport.querySelector('.landing-feats-track');
  if (!viewport || !track) return;

  var prevBtn = document.querySelector('.landing-feats-arrow--prev');
  var nextBtn = document.querySelector('.landing-feats-arrow--next');
  var animating = false;
  var autoPaused = false;
  var resumeTimer = null;
  var SCROLL_PX = 0.35;
  var RESUME_MS = 2400;

  function isCarouselMode() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function cardStep() {
    var list = track.querySelectorAll('.landing-feat-card');
    if (!list.length) return viewport.clientWidth;
    var card = list[0];
    var style = window.getComputedStyle(track);
    var gap = parseFloat(style.columnGap || style.gap || '12') || 12;
    return card.offsetWidth + gap;
  }

  function maxScrollLeft() {
    return Math.max(0, track.scrollWidth - viewport.clientWidth);
  }

  function pauseAuto() {
    autoPaused = true;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(function () {
      autoPaused = false;
    }, RESUME_MS);
  }

  function scrollToLeft(left, smooth) {
    var target = Math.max(0, Math.min(maxScrollLeft(), left));
    animating = !!smooth;
    viewport.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
    window.setTimeout(function () {
      animating = false;
    }, smooth ? 420 : 0);
  }

  function scrollByCard(dir) {
    if (!isCarouselMode() || animating) return;
    pauseAuto();
    var step = cardStep();
    var next = viewport.scrollLeft + dir * step;
    if (dir > 0 && next >= maxScrollLeft() - 1) {
      scrollToLeft(0, false);
      return;
    }
    if (dir < 0 && next <= 0) {
      scrollToLeft(maxScrollLeft(), false);
      return;
    }
    scrollToLeft(next, true);
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function () { scrollByCard(-1); });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function () { scrollByCard(1); });
  }

  var touchStartX = 0;
  viewport.addEventListener('touchstart', function (e) {
    if (!isCarouselMode()) return;
    touchStartX = e.changedTouches[0].screenX;
    pauseAuto();
  }, { passive: true });

  viewport.addEventListener('touchend', function (e) {
    if (!isCarouselMode() || animating) return;
    var dx = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(dx) < 36) return;
    scrollByCard(dx < 0 ? 1 : -1);
  }, { passive: true });

  ['pointerenter', 'wheel'].forEach(function (ev) {
    viewport.addEventListener(ev, pauseAuto, { passive: true });
  });

  function tick() {
    if (isCarouselMode() && !autoPaused && !animating && track.scrollWidth > viewport.clientWidth + 4) {
      viewport.scrollLeft += SCROLL_PX;
      if (viewport.scrollLeft + viewport.clientWidth >= track.scrollWidth - 2) {
        viewport.scrollLeft = 0;
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  try {
    if (window.MPIcons && typeof window.MPIcons.hydrate === 'function') {
      window.MPIcons.hydrate(document.getElementById('landing-features'));
    }
  } catch (_) {}
})();
