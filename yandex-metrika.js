/* Yandex.Metrika — сайт movie-planner.ru (счётчик 110038199) */
(function () {
  try {
    if (
      window.MpCookieConsent &&
      typeof window.MpCookieConsent.allows === 'function' &&
      !window.MpCookieConsent.allows('analytics')
    ) {
      return;
    }
  } catch (_) {}
  try {
    // e2e / headless не должны портить отказы и «цели формы».
    // sessionStorage: SPA может снять ?e2e= при навигации на /home — skip сохраняем.
    var q = String(location.search || "");
    if (/[?&]e2e=/.test(q)) {
      try {
        sessionStorage.setItem("mp_metrika_skip_e2e", "1");
      } catch (_) {}
      return;
    }
    try {
      if (sessionStorage.getItem("mp_metrika_skip_e2e") === "1") return;
    } catch (_) {}
    var ua = String(navigator.userAgent || "");
    if (/HeadlessChrome|Playwright|Puppeteer/i.test(ua)) return;
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
