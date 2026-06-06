(function () {
  var android = document.getElementById('article-cta-android');
  if (!android) return;
  fetch('https://api.movie-planner.ru/api/app/release', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rel) {
      if (rel && rel.url) android.href = rel.url;
    })
    .catch(function () {});
})();
