/**
 * Автопрокрутка каруселей премьер и сериалов на лендинге (без дублирования карточек).
 * После взаимодействия пользователя автопрокрутка останавливается — без прыжка в начало.
 */
(function () {
  "use strict";

  var SCROLL_PX_PER_FRAME = 0.45;

  function bindCarousel(viewportId, trackId) {
    var viewport = document.getElementById(viewportId);
    var track = document.getElementById(trackId);
    if (!viewport || !track) return;

    var userTookOver = false;
    var paused = false;

    function stopAuto() {
      userTookOver = true;
      paused = true;
    }

    ["pointerdown", "touchstart", "wheel"].forEach(function (ev) {
      viewport.addEventListener(ev, stopAuto, { passive: true });
    });
    viewport.addEventListener("scroll", function () {
      // Manual scroll or momentum — freeze auto so list doesn't jump to start.
      if (!userTookOver) stopAuto();
    }, { passive: true });

    function tick() {
      if (!userTookOver && !paused && track.scrollWidth > viewport.clientWidth + 4) {
        var maxScroll = track.scrollWidth - viewport.clientWidth;
        if (viewport.scrollLeft >= maxScroll - 2) {
          // Soft stop at the end — never snap back to 0 while visible.
          paused = true;
        } else {
          viewport.scrollLeft += SCROLL_PX_PER_FRAME;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function init() {
    bindCarousel("landing-premieres-viewport", "landing-premieres-track");
    bindCarousel("landing-series-viewport", "landing-series-track");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
