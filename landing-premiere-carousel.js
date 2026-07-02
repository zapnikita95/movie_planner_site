/**
 * Автопрокрутка каруселей премьер и сериалов на лендинге (без дублирования карточек).
 */
(function () {
  "use strict";

  var SCROLL_PX_PER_FRAME = 0.45;
  var RESUME_DELAY_MS = 2200;

  function bindCarousel(viewportId, trackId) {
    var viewport = document.getElementById(viewportId);
    var track = document.getElementById(trackId);
    if (!viewport || !track) return;

    var paused = false;
    var resumeTimer = null;

    function pauseAuto() {
      paused = true;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(function () {
        paused = false;
      }, RESUME_DELAY_MS);
    }

    ["pointerenter", "touchstart", "wheel"].forEach(function (ev) {
      viewport.addEventListener(ev, pauseAuto, { passive: true });
    });
    viewport.addEventListener("scroll", pauseAuto, { passive: true });

    function tick() {
      if (!paused && track.scrollWidth > viewport.clientWidth + 4) {
        viewport.scrollLeft += SCROLL_PX_PER_FRAME;
        if (viewport.scrollLeft + viewport.clientWidth >= track.scrollWidth - 2) {
          viewport.scrollLeft = 0;
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
