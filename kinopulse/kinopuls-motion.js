/* Progressive enhancement: the complete page remains readable without JS. */
(() => {
  const main = document.querySelector('.kp-main');
  if (!main) return;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const groups = [...main.querySelectorAll('section, .kp-hero-copy, .kp-motion-stage')];
  let observer, frame = 0;
  const stage = main.querySelector('.kp-motion-stage');
  const method = main.querySelector('[data-kp-sequence]');
  const artworks = [...main.querySelectorAll('[data-kp-art]')];
  const scenes = [...main.querySelectorAll('[data-kp-scene]')];
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  function update() {
    frame = 0;
    if (preference.matches) return;
    scenes.forEach(el => {
      const box = el.getBoundingClientRect();
      // Work only near the viewport; use native scroll, never scroll-jacking.
      if (box.bottom < -100 || box.top > innerHeight + 100) return;
      const progress = clamp((innerHeight - box.top) / (innerHeight + box.height), 0, 1);
      el.style.setProperty('--scene-progress', progress.toFixed(4));
    });
    artworks.forEach(el => el.style.setProperty('--art-progress', clamp((innerHeight * .8 - el.getBoundingClientRect().top) / innerHeight, -1, 1).toFixed(3)));
    if (stage) {
      const box = stage.getBoundingClientRect();
      const progress = clamp((innerHeight * .65 - box.top) / innerHeight, -1, 1);
      stage.style.setProperty('--stage-progress', progress.toFixed(3));
    }
    if (method) {
      const box = method.getBoundingClientRect();
      const progress = clamp((innerHeight * .85 - box.top) / Math.min(box.height, innerHeight * .9), 0, 1);
      method.style.setProperty('--line-progress', progress.toFixed(3));
      method.querySelectorAll('.kp-map-word').forEach((word, i) => {
        word.classList.toggle('kp-map-active', progress >= i / 4);
      });
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  function setup() {
    observer?.disconnect();
    groups.forEach(el => el.classList.remove('kp-reveal', 'kp-in-view'));
    stage?.style.removeProperty('--stage-progress');
    method?.style.removeProperty('--line-progress');
    artworks.forEach(el => el.style.removeProperty('--art-progress'));
    scenes.forEach(el => el.style.removeProperty('--scene-progress'));
    if (preference.matches || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('kp-in-view');
        observer.unobserve(entry.target);
      }
    }), {threshold: 0, rootMargin: '0px 0px -35px 0px'});
    groups.forEach(el => {
      // Never hide content that is already in the viewport at initialization.
      if (el.getBoundingClientRect().top < innerHeight - 35) el.classList.add('kp-in-view');
      el.classList.add('kp-reveal');
      observer.observe(el);
    });
    schedule();
  }
  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', schedule, {passive: true});
  preference.addEventListener('change', setup);
  setup();
})();
