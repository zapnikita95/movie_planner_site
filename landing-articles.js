(function () {
  'use strict';

  var grid = document.getElementById('landing-articles-grid');
  var nav = document.getElementById('landing-articles-pagination');
  if (!grid || !nav) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.article-card'));
  if (!cards.length) return;

  var page = 1;

  function perPage() {
    return window.matchMedia('(max-width: 768px)').matches ? 6 : 9;
  }

  function totalPages() {
    return Math.max(1, Math.ceil(cards.length / perPage()));
  }

  function render() {
    var pp = perPage();
    var pages = totalPages();
    if (page > pages) page = pages;
    if (page < 1) page = 1;

    cards.forEach(function (card, i) {
      var visible = i >= (page - 1) * pp && i < page * pp;
      card.classList.toggle('article-card-hidden', !visible);
      card.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });

    nav.innerHTML = '';
    if (pages <= 1) {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;

    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'articles-page-btn';
    prev.textContent = '←';
    prev.setAttribute('aria-label', 'Предыдущая страница');
    prev.disabled = page <= 1;
    prev.addEventListener('click', function () {
      if (page > 1) {
        page -= 1;
        render();
        scrollToSection();
      }
    });
    nav.appendChild(prev);

    for (var p = 1; p <= pages; p += 1) {
      (function (num) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'articles-page-btn' + (num === page ? ' is-active' : '');
        btn.textContent = String(num);
        btn.setAttribute('aria-label', 'Страница ' + num);
        btn.setAttribute('aria-current', num === page ? 'page' : 'false');
        btn.addEventListener('click', function () {
          page = num;
          render();
          scrollToSection();
        });
        nav.appendChild(btn);
      })(p);
    }

    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'articles-page-btn';
    next.textContent = '→';
    next.setAttribute('aria-label', 'Следующая страница');
    next.disabled = page >= pages;
    next.addEventListener('click', function () {
      if (page < pages) {
        page += 1;
        render();
        scrollToSection();
      }
    });
    nav.appendChild(next);

    var status = document.createElement('span');
    status.className = 'articles-page-status';
    status.textContent = page + ' / ' + pages;
    nav.appendChild(status);
  }

  function scrollToSection() {
    var section = document.getElementById('articles-guides');
    if (!section) return;
    var top = section.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 120);
  });

  render();
})();
