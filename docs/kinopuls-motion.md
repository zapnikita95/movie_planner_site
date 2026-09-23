# Kinopuls motion standard

User clarified that graphics means animated transitions, not generated cover art.
The generated image experiment is not included or referenced by the site.

- Native scrolling; no scroll interception, autoplay video, timer loops or dependencies.
- Scroll-linked parallax in the opening composition.
- Sections reveal once with staggered content.
- The four-stage method activates sequentially; lines draw with scroll progress.
- requestAnimationFrame throttles passive scroll/resize work.
- Complete content remains available without JavaScript.
- prefers-reduced-motion removes movement and reveals all content.
- Shared header/footer remain untouched.

Verify: desktop and 390px, first screen, method section halfway and fully visible,
CTA links, no overflow, reduced-motion and no-JS readability.
