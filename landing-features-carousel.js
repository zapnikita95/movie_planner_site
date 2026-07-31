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
  var index = 0;
  var autoDir = 1;
  var lastAutoAt = 0;
  var AUTO_MS = 3200;
  var RESUME_MS = 2800;
  var ANIM_MS = 420;
  var SWIPE_PX = 36;

  function cards() {
    return track.querySelectorAll('.landing-feat-card');
  }

  function isCarouselMode() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function reducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function cardStep() {
    var list = cards();
    if (!list.length) return viewport.clientWidth;
    var card = list[0];
    var style = window.getComputedStyle(track);
    var gap = parseFloat(style.columnGap || style.gap || '12') || 12;
    return card.offsetWidth + gap;
  }

  function maxIndex() {
    return Math.max(0, cards().length - 1);
  }

  function syncIndexFromScroll() {
    var step = cardStep();
    if (step <= 0) return;
    index = Math.max(0, Math.min(maxIndex(), Math.round(viewport.scrollLeft / step)));
  }

  function pauseAuto() {
    autoPaused = true;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(function () {
      autoPaused = false;
      lastAutoAt = performance.now();
    }, RESUME_MS);
  }

  function goTo(nextIndex, smooth) {
    var max = maxIndex();
    var target = Math.max(0, Math.min(max, nextIndex));
    if (target === index && Math.abs(viewport.scrollLeft - target * cardStep()) < 2) {
      return;
    }
    index = target;
    var useSmooth = !!smooth && !reducedMotion();
    animating = useSmooth;
    viewport.scrollTo({
      left: index * cardStep(),
      behavior: useSmooth ? 'smooth' : 'auto',
    });
    window.setTimeout(function () {
      animating = false;
      syncIndexFromScroll();
    }, useSmooth ? ANIM_MS : 0);
  }

  function scrollByCard(dir) {
    if (!isCarouselMode() || animating) return;
    pauseAuto();
    syncIndexFromScroll();
    var next = index + (dir > 0 ? 1 : -1);
    if (next < 0 || next > maxIndex()) {
      // No wrap jump — stay on edge (same feel as middle cards).
      return;
    }
    goTo(next, true);
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      scrollByCard(-1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      scrollByCard(1);
    });
  }

  var touchStartX = 0;
  var touchStartY = 0;
  var touchActive = false;
  var touchLocked = false;

  viewport.addEventListener(
    'touchstart',
    function (e) {
      if (!isCarouselMode() || !e.changedTouches || !e.changedTouches[0]) return;
      touchActive = true;
      touchLocked = false;
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
      pauseAuto();
      syncIndexFromScroll();
    },
    { passive: true }
  );

  viewport.addEventListener(
    'touchmove',
    function (e) {
      if (!touchActive || !isCarouselMode() || !e.touches || !e.touches[0]) return;
      var dx = e.touches[0].clientX - touchStartX;
      var dy = e.touches[0].clientY - touchStartY;
      if (!touchLocked && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        touchLocked = true;
      }
      if (touchLocked && e.cancelable) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  viewport.addEventListener(
    'touchend',
    function (e) {
      if (!touchActive || !isCarouselMode()) return;
      touchActive = false;
      if (animating) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) < SWIPE_PX) return;
      scrollByCard(dx < 0 ? 1 : -1);
    },
    { passive: true }
  );

  viewport.addEventListener(
    'touchcancel',
    function () {
      touchActive = false;
      touchLocked = false;
    },
    { passive: true }
  );

  ['pointerenter', 'wheel'].forEach(function (ev) {
    viewport.addEventListener(ev, pauseAuto, { passive: true });
  });

  window.addEventListener(
    'resize',
    function () {
      if (!isCarouselMode()) return;
      goTo(index, false);
    },
    { passive: true }
  );

  function tick(now) {
    if (
      isCarouselMode() &&
      !autoPaused &&
      !animating &&
      !reducedMotion() &&
      !touchActive &&
      cards().length > 1
    ) {
      if (!lastAutoAt) lastAutoAt = now;
      if (now - lastAutoAt >= AUTO_MS) {
        lastAutoAt = now;
        syncIndexFromScroll();
        var next = index + autoDir;
        if (next > maxIndex()) {
          autoDir = -1;
          next = index + autoDir;
        } else if (next < 0) {
          autoDir = 1;
          next = index + autoDir;
        }
        if (next !== index) goTo(next, true);
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
