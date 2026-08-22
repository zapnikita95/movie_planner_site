#!/usr/bin/env python3
"""One-off generator for articles/index.html — run from articles/."""
from __future__ import annotations

import re
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
items: list[tuple[str, str]] = []
for p in sorted(HERE.glob("*.html")):
    if p.name in ("index.html",):
        continue
    text = p.read_text(encoding="utf-8")
    m = re.search(r"<title>([^<]+)</title>", text)
    title = m.group(1).split("|")[0].strip() if m else p.stem
    items.append((p.name, title))

cards = "\n".join(
    f'                <a href="/articles/{escape(name)}" class="article-card"><h3>{escape(title)}</h3></a>'
    for name, title in items
)

html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Статьи о кино и сериалах — гайды Movie Planner</title>
    <meta name="description" content="Гайды Movie Planner: трекер фильмов, watchlist, сериалы, группы, подбор и премьеры. Все статьи на movie-planner.ru.">
    <link rel="canonical" href="https://movie-planner.ru/articles/">
    <meta property="og:locale" content="ru_RU">
    <link rel="stylesheet" href="../style-v2.css?v=20260822content1">
    <style id="mp-article-critical">
      html.mp-session #site-header [data-action="login"],
      html.mp-session #site-header #login-btn,
      html.mp-session #site-header .header-login-btn,
      html.mp-session .site-header-subpage-actions{{display:none!important}}
      html.mp-session #header-user-wrap{{display:flex!important}}
      html.mp-session #header-user-wrap.hidden{{display:flex!important}}
      html.mp-session #header-profile-pill.hidden{{display:inline-flex!important}}
      html.mp-session #login-modal.modal:not(.hidden){{visibility:hidden!important;opacity:0!important;pointer-events:none!important}}
    </style>
    <script src="../articles/article-session-boot.js?v=20260702articlechrome1"></script>
    <link rel="icon" type="image/png" href="../images/favicon.png" sizes="16x16">
    <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body>
  <div class="content-wrapper subpage-wrapper">
    <header id="site-header">
      <div class="header-content">
        <a class="logo" href="/"><img src="../images/icon48.png" alt="Movie Planner"><span>Movie Planner</span></a>
        <div class="header-search" id="header-search" role="search">
          <span class="header-search-icon mp-icon" data-mp-icon="search" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg></span>
          <input type="text" id="header-search-input" class="header-search-input" placeholder="Найти фильм или сериал…" autocomplete="off" aria-label="Поиск">
        </div>
        <div class="header-buttons">
          <button type="button" class="header-login-btn" data-action="login" id="login-btn">Войти</button>
        </div>
      </div>
    </header>
    <main class="container subpage-main">
      <section class="article-content">
        <h1>Статьи о кино и сериалах</h1>
        <p class="date">Обновлено 22 августа 2026</p>
        <p>Гайды по Movie Planner: трекер фильмов и сериалов, watchlist, группы, подбор, премьеры и сравнения с другими сервисами.</p>
        <div class="articles-grid landing-articles-grid" id="articles-index-grid">
{cards}
        </div>
        <p><a href="/">На главную</a> · <a href="/premieres">Премьеры</a> · <a href="/?open_login=1">Войти в кабинет</a></p>
      </section>
    </main>
    <footer class="footer">
      <div class="container">
        <div class="footer-bottom">
          <p>&copy; <span id="footer-year"></span> Movie Planner. <a href="/usloviya-ispolzovaniya.html">Условия</a></p>
        </div>
      </div>
    </footer>
  </div>
  <script src="../articles/article-chrome.js?v=20260702articlechrome1"></script>
  <link rel="stylesheet" href="../cookie-consent.css?v=20260822content1">
  <script src="../cookie-consent.js?v=20260822content1"></script>
</body>
</html>
"""

(HERE / "index.html").write_text(html, encoding="utf-8")
print(f"wrote index.html with {len(items)} articles")
