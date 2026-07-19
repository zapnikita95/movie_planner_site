/* Yandex.Metrika — сайт movie-planner.ru (счётчик 110038199) */
(function () {
  try {
    // e2e / headless не должны портить отказы и «цели формы»
    if (/[?&]e2e=/.test(String(location.search || ""))) return;
    if (/HeadlessChrome/i.test(String(navigator.userAgent || ""))) return;
  } catch (_) {}
  if (window.__mpMetrikaSite) return;
  window.__mpMetrikaSite = true;
  (function (m, e, t, r, i, k, a) {
    m[i] =
      m[i] ||
      function () {
        (m[i].a = m[i].a || []).push(arguments);
      };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) {
      if (document.scripts[j].src === r) return;
    }
    k = e.createElement(t);
    a = e.getElementsByTagName(t)[0];
    k.async = 1;
    k.src = r;
    a.parentNode.insertBefore(k, a);
  })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=110038199", "ym");

  window.ym(110038199, "init", {
    ssr: true,
    webvisor: true,
    clickmap: true,
    ecommerce: "dataLayer",
    referrer: document.referrer,
    url: location.href,
    accurateTrackBounce: true,
    trackLinks: true,
  });
})();
