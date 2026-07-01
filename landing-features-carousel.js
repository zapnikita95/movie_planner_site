(function () {
  'use strict';

  var viewport = document.getElementById('landing-feats-viewport');
  var track = viewport && viewport.querySelector('.landing-feats-track');
  if (!viewport || !track) return;

  var prevBtn = document.querySelector('.landing-feats-arrow--prev');
  var nextBtn = document.querySelector('.landing-feats-arrow--next');
  var originalCount = 0;
  var loopWidth = 0;
  var normalizing = false;

  function isCarouselMode() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function cards() {
    return track.querySelectorAll('.landing-feat-card:not([data-feat-clone])');
  }

  function cardStep() {
    var list = cards();
    if (!list.length) return viewport.clientWidth;
    var card = list[0];
    var style = window.getComputedStyle(track);
    var gap = parseFloat(style.columnGap || style.gap || '12') || 12;
    return card.offsetWidth + gap;
  }

  function teardownClones() {
    track.querySelectorAll('[data-feat-clone]').forEach(function (el) {
      el.remove();
    });
    loopWidth = 0;
  }

  function setupInfiniteLoop() {
    teardownClones();
    if (!isCarouselMode()) return;
    var originals = cards();
    originalCount = originals.length;
    if (!originalCount) return;

    originals.forEach(function (card) {
      var clone = card.cloneNode(true);
      clone.setAttribute('data-feat-clone', '1');
      clone.removeAttribute('id');
      track.appendChild(clone);
    });

    loopWidth = cardStep() * originalCount;
  }

  function normalizeScroll(instant) {
    if (!isCarouselMode() || !loopWidth || normalizing) return;
    if (viewport.scrollLeft >= loopWidth - 2) {
      normalizing = true;
      viewport.scrollLeft -= loopWidth;
      normalizing = false;
    }
  }

  function scrollByCard(dir) {
    if (!isCarouselMode()) {
      viewport.scrollBy({ left: dir * cardStep(), behavior: 'smooth' });
      return;
    }
    setupInfiniteLoop();
    viewport.scrollBy({ left: dir * cardStep(), behavior: 'smooth' });
    window.setTimeout(normalizeScroll, 320);
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function () { scrollByCard(-1); });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function () { scrollByCard(1); });
  }

  var touchStartX = 0;
  viewport.addEventListener('touchstart', function (e) {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  viewport.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(dx) < 40) return;
    scrollByCard(dx < 0 ? 1 : -1);
  }, { passive: true });

  viewport.addEventListener('scroll', function () {
    if (normalizing) return;
    requestAnimationFrame(normalizeScroll);
  }, { passive: true });

  if (typeof viewport.addEventListener === 'function') {
    viewport.addEventListener('scrollend', normalizeScroll, { passive: true });
  }

  window.addEventListener('resize', function () {
    setupInfiniteLoop();
  });

  setupInfiniteLoop();

  try {
    if (window.MPIcons && typeof window.MPIcons.hydrate === 'function') {
      window.MPIcons.hydrate(document.getElementById('landing-features'));
      window.MPIcons.hydrate(document.querySelector('.landing-tv-section'));
    }
  } catch (_) {}
})();
