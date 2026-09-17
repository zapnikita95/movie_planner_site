# /watchlist — канон под GSC «мой список просмотра»

**Дата:** 2026-09-17 MSK  
**Интент GSC 28d:** «мой список просмотра» ~1271 impr / 1 click / CTR 0.1% / pos ~7.3  
**Проблема:** статьи качают показы, `/watchlist` 200, но не в top pages GSC.

## URL
https://movie-planner.ru/watchlist

## Before → After (title)
- **До:** `Приложение-трекер для фильмов и сериалов — список кино | Movie Planner`
- **После:** `Мой список просмотра — трекер фильмов и сериалов | Movie Planner`

## Что изменилось
### Bot (SSR meta + crawl)
- `site_section_seo.py`: title / description / keywords / seo_blurb / h1 под интент
- `guest_section_crawl.py`: crawl `<h1>Мой список просмотра</h1>`, ссылки на tracker-статьи, футер «Мой список просмотра»
- pin apex → site `17d48c2` (`20260917watchlistGsc1`)

### Site
- Guest hero `/watchlist`: H1 + объяснение + CTA Войти / Telegram-бот (не empty cabinet stub)
- `routeTitles` + hidden blurb
- what-is-v2 через существующий `MpPublicPromo.mountAtEnd`
- статьи: CTA/якоря → `/watchlist` («Мой список просмотра»); `kak-vesti-watchlist` получил канон-ссылку

## PR
- Site: https://github.com/zapnikita95/movie_planner_site/pull/522 (merged `17d48c2`)
- Bot: (этот PR)

## Verify
- Live `<title>` / og:title / canonical на `/watchlist`
- Crawl H1 в HTML без JS
- Guest UI H1 + CTA + what-is
