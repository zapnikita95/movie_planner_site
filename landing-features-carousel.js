(function () {
  'use strict';

  var viewport = document.getElementById('landing-feats-viewport');
  var track = viewport && viewport.querySelector('.landing-feats-track');
  if (!viewport || !track) return;

  var prevBtn = document.querySelector('.landing-feats-arrow--prev');
  var nextBtn = document.querySelector('.landing-feats-arrow--next');

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

  function scrollByCard(dir) {
    viewport.scrollBy({ left: dir * cardStep(), behavior: 'smooth' });
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

  try {
    if (window.MPIcons && typeof window.MPIcons.hydrate === 'function') {
      window.MPIcons.hydrate(document.getElementById('landing-features'));
      window.MPIcons.hydrate(document.querySelector('.landing-tv-section'));
    }
  } catch (_) {}
})();
