(function () {
  'use strict';

  var viewport = document.getElementById('landing-feats-viewport');
  var track = viewport && viewport.querySelector('.landing-feats-track');
  if (!viewport || !track) return;

  var prevBtn = document.querySelector('.landing-feats-arrow--prev');
  var nextBtn = document.querySelector('.landing-feats-arrow--next');
  var animating = false;

  function isCarouselMode() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function cards() {
    return track.querySelectorAll('.landing-feat-card');
  }

  function cardStep() {
    var list = cards();
    if (!list.length) return viewport.clientWidth;
    var card = list[0];
    var style = window.getComputedStyle(track);
    var gap = parseFloat(style.columnGap || style.gap || '12') || 12;
    return card.offsetWidth + gap;
  }

  function clampIndex(idx) {
    var list = cards();
    if (!list.length) return 0;
    return Math.max(0, Math.min(list.length - 1, idx));
  }

  function readIndex() {
    var step = cardStep();
    if (!step) return 0;
    return clampIndex(Math.round(viewport.scrollLeft / step));
  }

  function scrollToIndex(idx, smooth) {
    if (!isCarouselMode()) return;
    var next = clampIndex(idx);
    var left = next * cardStep();
    animating = true;
    viewport.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'auto' });
    window.setTimeout(function () { animating = false; }, smooth ? 380 : 0);
  }

  function scrollByCard(dir) {
    if (!isCarouselMode() || animating) return;
    scrollToIndex(readIndex() + dir, true);
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function () { scrollByCard(-1); });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function () { scrollByCard(1); });
  }

  var touchStartX = 0;
  var touchStartY = 0;
  viewport.addEventListener('touchstart', function (e) {
    if (!isCarouselMode()) return;
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  viewport.addEventListener('touchend', function (e) {
    if (!isCarouselMode() || animating) return;
    var dx = e.changedTouches[0].screenX - touchStartX;
    var dy = e.changedTouches[0].screenY - touchStartY;
    if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy)) return;
    scrollByCard(dx < 0 ? 1 : -1);
  }, { passive: true });

  function snapToNearest() {
    if (!isCarouselMode() || animating) return;
    scrollToIndex(readIndex(), false);
  }

  viewport.addEventListener('scroll', function () {
    if (animating || !isCarouselMode()) return;
    window.clearTimeout(viewport._mpFeatSnapT);
    viewport._mpFeatSnapT = window.setTimeout(snapToNearest, 120);
  }, { passive: true });

  if (typeof viewport.addEventListener === 'function') {
    viewport.addEventListener('scrollend', snapToNearest, { passive: true });
  }

  window.addEventListener('resize', function () {
    if (!isCarouselMode()) return;
    scrollToIndex(readIndex(), false);
  });

  try {
    if (window.MPIcons && typeof window.MPIcons.hydrate === 'function') {
      window.MPIcons.hydrate(document.getElementById('landing-features'));
    }
  } catch (_) {}
})();
