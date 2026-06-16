#!/usr/bin/env python3
"""Generate EN article HTML + hreflang on RU pairs. Run from movie_planner_site root."""
from __future__ import annotations

import re
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
ARTICLES = SITE / "articles"
EN_DIR = ARTICLES / "en"
BASE = "https://movie-planner.ru"

SOCIAL_SVG = """<a href="https://t.me/movie_planner_channel" target="_blank" rel="noopener" class="social-link" aria-label="Telegram"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161l-1.84 8.68c-.135.608-.486.758-.984.472l-2.72-2.004-1.313 1.26c-.149.15-.275.275-.564.275l.2-2.83 5.033-4.547c.22-.196-.048-.305-.342-.11l-6.22 3.918-2.68-.84c-.584-.183-.598-.584.11-.88l10.46-4.03c.486-.18.91.112.75.7z"/></svg></a>"""

INSTAGRAM_SVG = """<a href="https://instagram.com/movie_planner_bot" target="_blank" rel="noopener" class="social-link" aria-label="Instagram"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></a>"""

FOOTERS = {
    "minimal": """
                <div class="footer-info">
                    <h3>Contact</h3>
                    <p>💬 <a href="https://t.me/zapnikita95" target="_blank" rel="noopener">@zapnikita95</a></p>
                </div>
                <div class="footer-social">
                    <h3>Follow us</h3>
                    <div class="social-links">
                        {social}
</div>
                </div>""",
    "standard": """
                <div class="footer-info">
                    <h3>Contact</h3>
                    <p>📍 Moscow</p>
                    <p>✉️ <a href="mailto:movie-planner-bot@yandex.com">movie-planner-bot@yandex.com</a></p>
                    <p>💬 <a href="https://t.me/zapnikita95" target="_blank" rel="noopener">@zapnikita95</a></p>
                </div>
                <div class="footer-social">
                    <h3>Follow us</h3>
                    <div class="social-links">
                        {social}
</div>
                </div>""",
    "full": """
                <div class="footer-info">
                    <h3>Contact</h3>
                    <p>📍 Moscow</p>
                    <p>📞 +7 (977) 613-45-08</p>
                    <p>✉️ <a href="mailto:movie-planner-bot@yandex.com">movie-planner-bot@yandex.com</a></p>
                    <p>💬 <a href="https://t.me/zapnikita95" target="_blank" rel="noopener">Questions: @zapnikita95</a></p>
                </div>
                <div class="footer-social">
                    <h3>Follow us</h3>
                    <div class="social-links">
                        {social}
                        {instagram}
                    </div>
                </div>""",
}


def hreflang_block(ru_slug: str, en_slug: str, *, lang: str) -> str:
    ru_url = f"{BASE}/articles/{ru_slug}"
    en_url = f"{BASE}/articles/en/{en_slug}"
    if lang == "en":
        canonical = en_url
        locale = "en_US"
    else:
        canonical = ru_url
        locale = "ru_RU"
    return f"""    <link rel="canonical" href="{canonical}">
    <link rel="alternate" hreflang="ru" href="{ru_url}">
    <link rel="alternate" hreflang="en" href="{en_url}">
    <link rel="alternate" hreflang="x-default" href="{ru_url}">
    <meta property="og:locale" content="{locale}">"""


def og_block(title: str, description: str, url: str) -> str:
    esc = lambda s: s.replace('"', "&quot;")
    return f"""    <meta property="og:title" content="{esc(title)}">
    <meta property="og:description" content="{esc(description)}">
    <meta property="og:url" content="{url}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Movie Planner">"""


def json_ld(headline: str, description: str, url: str, date: str) -> str:
    esc = lambda s: s.replace('"', '\\"')
    return f"""    <script type="application/ld+json">
    {{
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": "{esc(headline)}",
      "description": "{esc(description)}",
      "datePublished": "{date}",
      "dateModified": "{date}",
      "author": {{
        "@type": "Person",
        "name": "Nikita",
        "url": "https://t.me/zapnikita95"
      }},
      "publisher": {{
        "@type": "Organization",
        "name": "Movie Planner",
        "url": "https://movie-planner.ru/"
      }},
      "mainEntityOfPage": "{url}"
    }}
    </script>"""


def render_en(article: dict) -> str:
    ru_slug = article["ru_slug"]
    en_slug = article["en_slug"]
    title = article["title"]
    desc = article["description"]
    h1 = article["h1"]
    date = article["date"]
    body = article["body"]
    footer = article.get("footer", "full")
    iso_date = article.get("iso_date", "2026-01-30")
    has_og = article.get("og", True)

    en_url = f"{BASE}/articles/en/{en_slug}"
    ru_url = f"{BASE}/articles/{ru_slug}"

    social = SOCIAL_SVG
    instagram = INSTAGRAM_SVG if footer == "full" else ""
    footer_html = FOOTERS[footer].format(social=social, instagram=instagram)

    extra_head = ""
    if has_og:
        extra_head += "\n" + og_block(title, desc, en_url)
        extra_head += "\n" + json_ld(h1, desc, en_url, iso_date)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <meta name="description" content="{desc}">
{hreflang_block(ru_slug, en_slug, lang="en")}{extra_head}
    <link rel="stylesheet" href="../../style-v2.css">
    <link rel="icon" type="image/png" href="../../images/favicon.png" sizes="16x16">
    <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body data-mp-article-locale="en">
  <div class="content-wrapper subpage-wrapper">
    <header class="site-header-subpage">
      <div class="header-content">
        <a href="/" class="logo"><img src="../../images/icon48.png" alt="Movie Planner">Movie Planner</a>
        <div class="site-header-subpage-actions">
          <a href="/?open_login=1" class="btn btn-small btn-secondary" data-mp-chrome="sign-in">Sign in</a>
          <a href="/" class="btn btn-small btn-primary" data-mp-chrome="open-cabinet">Open cabinet</a>
        </div>
      </div>
    </header>
    <main class="container subpage-main">
        <section class="article-content">
            <h1>{h1}</h1>
            <p class="date">{date}</p>
{body}
            <div class="article-cta">
                <p class="article-cta-lead" data-mp-chrome="cta-lead">Try the app or web cabinet</p>
                <div class="footer-store-row">
                    <a href="https://apps.apple.com/app/movie-planner/id6769016073" class="footer-store-badge" target="_blank" rel="noopener">
                        <img src="../../images/app-store-badge.svg" alt="Download on the App Store" width="120" height="40" loading="lazy">
                    </a>
                    <a href="/download" class="footer-store-badge" id="article-cta-android" target="_blank" rel="noopener">
                        <img src="../../images/google-play-badge.svg" alt="Get it on Google Play" width="135" height="40" loading="lazy">
                    </a>
                </div>
                <div class="article-cta-secondary">
                    <a href="/?open_login=1" data-mp-chrome="sign-in-link">Sign in to cabinet</a>
                    <span aria-hidden="true">·</span>
                    <a href="/" data-mp-chrome="home-link">Home</a>
                    <span aria-hidden="true">·</span>
                    <a href="{ru_url}" hreflang="ru" data-mp-chrome="lang-switch">Русский</a>
                </div>
            </div>
</section>
    </main>
    <footer class="footer">
        <div class="container">
            <div class="footer-content">
                <div class="article-footer-apps">
                    <h4>Apps</h4>
                    <div class="footer-store-row">
                        <a href="https://apps.apple.com/app/movie-planner/id6769016073" class="footer-store-badge" target="_blank" rel="noopener">
                            <img src="../../images/app-store-badge.svg" alt="App Store" width="110" height="36" loading="lazy">
                        </a>
                        <a href="/download" class="footer-store-badge" id="article-cta-android-footer" target="_blank" rel="noopener">
                            <img src="../../images/google-play-badge.svg" alt="Google Play" width="120" height="36" loading="lazy">
                        </a>
                    </div>
                </div>
{footer_html}
            </div>
            <div class="footer-bottom">
                <p>&copy; <span id="footer-year"></span> Movie Planner. All rights reserved. · <a href="/terms-en.html" class="footer-link-muted">Terms of use</a></p>
            </div>
        </div>
    </footer>
  </div>
  <script src="../article-chrome.js"></script>
  <script>document.getElementById('footer-year').textContent = new Date().getFullYear();</script>
</body>
</html>
"""


ARTICLE_DATA: list[dict] = [
    {
        "ru_slug": "instrukciya-novichkam.html",
        "en_slug": "getting-started.html",
        "title": "Movie Planner: getting started guide",
        "description": "First steps in Movie Planner: app or web cabinet, add a film, schedule a watch.",
        "h1": "Movie Planner: getting started guide",
        "date": "January 30, 2026",
        "footer": "standard",
        "og": False,
        "body": """
            <p>Just getting started? Here is what to do in your first five minutes.</p>

            <ol>
                <li>Download the app for <a href="https://apps.apple.com/app/movie-planner/id6769016073" target="_blank" rel="noopener">iPhone</a> or <a href="/?open_login=1">sign in to the web cabinet</a> at movie-planner.ru</li>
                <li>Find a film via search or paste a link from Kinopoisk or IMDb — it lands in your library right away</li>
                <li>Tap <strong>Schedule watch</strong> → pick a day and time</li>
                <li>Install the <a href="https://chromewebstore.google.com/detail/movie-planner-bot/fldeclcfcngcjphhklommcebkpfipdol" target="_blank" rel="noopener">Chrome extension</a> — add films in one click from Kinopoisk or IMDb</li>
                <li>Invite friends to a group in the cabinet — shared watchlist and plans</li>
            </ol>

            <p>Done. New films and watch plans stay under control.</p>""",
    },
    {
        "ru_slug": "kak-plan-pohod-kino.html",
        "en_slug": "cinema-planning.html",
        "title": "How to plan cinema trips with Movie Planner",
        "description": "Step-by-step: schedule a cinema visit, attach tickets, and get a reminder in Movie Planner.",
        "h1": "How to plan cinema trips with Movie Planner",
        "date": "January 30, 2026",
        "footer": "full",
        "og": False,
        "body": """
            <ol>
                <li>Add the film to your library (link or search).</li>
                <li>Tap <strong>Schedule watch</strong>.</li>
                <li>Choose <strong>At the cinema</strong>.</li>
                <li>Set the date, time, and cinema.</li>
                <li>Attach ticket photos or files — Movie Planner saves them.</li>
                <li>10 minutes before showtime you get a reminder with your tickets.</li>
            </ol>

            <p>In a group chat, every participant can see the plan and confirm they are coming.</p>""",
    },
    {
        "ru_slug": "kak-vesti-watchlist.html",
        "en_slug": "watchlist-guide.html",
        "title": "How to manage your watchlist in Movie Planner",
        "description": "Add films and series to your Movie Planner watchlist, mark watched titles, and use personal or group lists.",
        "h1": "How to manage your watchlist in Movie Planner",
        "date": "January 30, 2026",
        "footer": "full",
        "og": False,
        "body": """
            <p>Your watchlist is the core of Movie Planner. It holds every film and series you want to watch later.</p>

            <h2>Ways to add a film or series</h2>
            <ul>
                <li>Fastest — paste a link from Kinopoisk, IMDb, or Letterboxd in the app or cabinet.</li>
                <li>Chrome extension — an <strong>Add to Movie Planner</strong> button on the film page.</li>
                <li>Search in the app or cabinet and pick the title from results.</li>
            </ul>

            <h2>What you can do with the list</h2>
            <ul>
                <li>Mark <strong>Watched</strong> — the title moves to your watched section.</li>
                <li>Rate it — ratings help recommendations get smarter.</li>
                <li>Schedule a watch — pick date and time (home or cinema).</li>
                <li>In a group, everyone sees and adds to the shared list.</li>
            </ul>

            <h2>Tip</h2>
            <p>Keep a personal library for solo picks and a group for weekend plans or marathons with friends.</p>""",
    },
    {
        "ru_slug": "mcp-ai-agent-movie-planner.html",
        "en_slug": "mcp-ai-agent-movie-planner.html",
        "title": "MCP and AI agents for Movie Planner: connect your film library",
        "description": "Connect Claude, Cursor, or another AI agent to Movie Planner via MCP: add films, plans, tickets, calendar, and Smart TV in plain language.",
        "h1": "MCP and AI agents: connect Movie Planner to your assistant",
        "date": "May 29, 2026",
        "iso_date": "2026-05-29",
        "footer": "full",
        "body": """
            <p>A regular AI chat can <em>suggest</em> films — and forget five minutes later. <strong>Movie Planner</strong> keeps your library, plans, tickets, and reminders. With <strong>MCP</strong> (Model Context Protocol) you connect an agent on your computer — Claude Desktop, Cursor, other IDEs — and say: “add Dune to my calendar for Saturday” or “attach this ticket to Sunday’s plan.” The agent calls Movie Planner tools and the action actually runs.</p>

            <h2>What MCP is and why it matters</h2>
            <p><strong>MCP</strong> is an open protocol that lets a model use external services as tools. Instead of copying links and planning by hand, you describe the task in plain language and the agent hits the Movie Planner API.</p>
            <p>This is not a future experiment: the Movie Planner MCP server already works — locally (stdio) and over HTTP on the backend.</p>

            <h2>What you can ask the agent to do</h2>
            <ul>
                <li>“Add <em>The Matrix</em> to my library” — the film appears in your watchlist;</li>
                <li>“Schedule Oppenheimer at the cinema Saturday 7 PM, October cinema” — a plan with a reminder;</li>
                <li>“Add this to Google Calendar” — push to calendar or an .ics link;</li>
                <li>“Here is a ticket screenshot — attach it to Sunday’s plan” — saved and sent 10 minutes before showtime;</li>
                <li>“What is still unwatched?” — the agent reads your library and answers from facts;</li>
                <li>“Create a group for friends and send an invite link” — shared watchlist;</li>
                <li>“Play Interstellar on the TV” — Smart TV command;</li>
                <li>“Rate yesterday’s film a 9” — via cabinet API (expanding in MCP).</li>
            </ul>

            <h2>Tools available to the agent</h2>
            <p>The official MCP server wraps the versioned HTTP API <code>/v1</code>. Main tools:</p>
            <ul>
                <li><strong>Films</strong> — add by Kinopoisk link or ID;</li>
                <li><strong>Plans</strong> — home watch or cinema with date, time, and venue;</li>
                <li><strong>Calendar</strong> — Google Calendar, signed .ics links;</li>
                <li><strong>Tickets</strong> — upload an image to a cinema plan, list tickets;</li>
                <li><strong>Library</strong> — unwatched titles, user profile;</li>
                <li><strong>Groups</strong> — create groups and invite links;</li>
                <li><strong>Smart TV</strong> — play a film on TV, search Rutube/VK.</li>
            </ul>
            <p>Full contract: <a href="https://api.movie-planner.ru/developer/openapi.yaml">OpenAPI</a>, developer overview — <a href="/agents.html">AI and API</a>.</p>

            <h2>Setup (Cursor, Claude Desktop)</h2>
            <ol>
                <li>Sign in to Movie Planner — <a href="/?open_login=1">web cabinet</a> or the <a href="https://apps.apple.com/app/movie-planner/id6769016073" target="_blank" rel="noopener">iPhone app</a>.</li>
                <li>Get a Bearer token: cabinet → <strong>AI and API</strong>, or OAuth2 PKCE for external apps (<a href="https://api.movie-planner.ru/developer">/developer</a>).</li>
                <li>Add the MCP server to your IDE config (see docs on <a href="/agents.html">agents.html</a>).</li>
            </ol>

            <h2>Why this beats a plain chatbot</h2>
            <p>ChatGPT without integration does not remember your watchlist a month later, will not deliver a ticket at the right moment, and will not sync plans with friends. Movie Planner + MCP gives persistent memory, real reminders, groups, tickets, calendar actions, and Smart TV control.</p>

            <h2>Security</h2>
            <p>The agent acts as you only with your token. OAuth2 supports scopes: read-only plans or add-films-only access. Revoke the token anytime in the cabinet.</p>

            <h2>Learn more</h2>
            <ul>
                <li><a href="/agents.html">AI and API page</a> — auth, task table, links;</li>
                <li><a href="/llms.txt">llms.txt</a> — short context for LLMs;</li>
                <li><a href="/articles/en/chrome-extension.html">Chrome extension</a> — add films from the browser without an agent.</li>
            </ul>""",
    },
    {
        "ru_slug": "movie-planner-vs-kinopoisk.html",
        "en_slug": "movie-planner-vs-kinopoisk.html",
        "title": "Movie Planner vs Kinopoisk: what's the difference",
        "description": "Compare Movie Planner and Kinopoisk: when to use a catalog, and when to use a personal film and series planner.",
        "h1": "Movie Planner vs Kinopoisk: what's the difference",
        "date": "May 29, 2026",
        "iso_date": "2026-05-29",
        "footer": "full",
        "body": """
            <p><strong>Kinopoisk</strong> is a film encyclopedia: ratings, reviews, where to stream, cinema tickets. <strong>Movie Planner</strong> is your personal planner: what you want to watch, what you have seen, who you go with, and when. Different jobs — the services complement each other.</p>

            <h2>Kinopoisk</h2>
            <ul>
                <li>catalog of films and series;</li>
                <li>community reviews and ratings;</li>
                <li>ticket sales and Kinopoisk HD subscription;</li>
                <li>popularity-based recommendations.</li>
            </ul>

            <h2>Movie Planner</h2>
            <ul>
                <li>personal and group watchlist;</li>
                <li>watch plans with reminders;</li>
                <li>cinema tickets for every plan participant;</li>
                <li>series tracker with new-episode alerts;</li>
                <li>AI: screenshot recognition, mood picks, describe-to-search;</li>
                <li>web cabinet, mobile app, Chrome extension.</li>
            </ul>

            <h2>When to use which</h2>
            <p>Browsing <em>what is new this week</em> — Kinopoisk. You want to <em>not forget</em> a film a friend recommended, <em>align a cinema trip</em>, and <em>get the ticket in the reminder</em> — Movie Planner. Many people add films from Kinopoisk with one link or the extension.</p>

            <p>Movie Planner does not replace Kinopoisk — it handles lists, plans, episodes, and tickets. Kinopoisk stays the source of film info.</p>""",
    },
    {
        "ru_slug": "movie-planner-vs-myshows.html",
        "en_slug": "movie-planner-vs-myshows.html",
        "title": "Movie Planner vs MyShows: series trackers compared",
        "description": "Movie Planner or MyShows for series? We compare alerts, groups, planning, and the mobile app.",
        "h1": "Movie Planner vs MyShows: series trackers compared",
        "date": "May 29, 2026",
        "iso_date": "2026-05-29",
        "footer": "full",
        "body": """
            <p><strong>MyShows.me</strong> is a classic series tracker: mark episodes, see progress, get an air-date calendar. <strong>Movie Planner</strong> tracks series too, with more focus on planning and watching together.</p>

            <h2>MyShows</h2>
            <ul>
                <li>large series database;</li>
                <li>detailed season and episode progress;</li>
                <li>social feed and friends on the site;</li>
                <li>episode calendar.</li>
            </ul>

            <h2>Movie Planner</h2>
            <ul>
                <li>series and films in one library;</li>
                <li>new-episode notifications in the app;</li>
                <li>friend groups with a shared list;</li>
                <li>Chrome extension to mark episodes on streaming sites;</li>
                <li>joint watch plans and cinema trips;</li>
                <li>web cabinet, mobile app, optional Telegram channel.</li>
            </ul>

            <h2>Who Movie Planner fits</h2>
            <p>If you watch with friends and want reminders, plans, and tickets — not only episode checkmarks — Movie Planner is a better fit. MyShows remains strong for a web-only series tracker.</p>

            <p>More on series: <a href="/articles/en/series-tracker.html">Series tracker</a>, <a href="/articles/en/new-episode-notifications.html">New episode notifications</a>.</p>""",
    },
    {
        "ru_slug": "plan-prosmotra-serialov.html",
        "en_slug": "series-watch-plan.html",
        "title": "How to plan series watching — tracker and reminders",
        "description": "Plan series watching with Movie Planner: progress tracker and reminders so you never lose your place.",
        "h1": "How to plan series watching — tracker and reminders",
        "date": "January 30, 2026",
        "footer": "minimal",
        "og": False,
        "body": """
            <p>A <strong>series planner</strong> helps you keep up with shows you follow. Movie Planner combines progress tracking and reminders: see where you stopped and schedule the next episode.</p>

            <h2>Schedule a watch</h2>
            <p>Open a series in the app or cabinet, tap <strong>Schedule watch</strong>, and set a time — for example Saturday 8 PM or tomorrow evening. You get a reminder when it is time.</p>

            <h2>Tracker + reminders in one place</h2>
            <p>Series library, episode progress, new-episode alerts, and scheduled watch reminders — without juggling separate apps.</p>

            <h2>Works solo or with friends</h2>
            <p>Add a series by link, mark watched episodes, schedule the next one — reminders follow. Works in your personal cabinet or in a friend group.</p>""",
    },
    {
        "ru_slug": "podbor-filmov-po-emocii.html",
        "en_slug": "mood-based-recommendations.html",
        "title": "Pick films by mood: AI in Movie Planner",
        "description": "How mood-based film picks work in Movie Planner: a short AI dialog and 3–5 tailored recommendations.",
        "h1": "Pick films by mood: AI in Movie Planner",
        "date": "May 29, 2026",
        "iso_date": "2026-05-29",
        "footer": "full",
        "body": """
            <p>“Something light,” “need adrenaline,” “want to cry” — sound familiar? Instead of endless scrolling, <strong>Movie Planner</strong> has a <strong>By mood</strong> mode: AI asks a few short questions and suggests 3–5 films for how you feel.</p>

            <h2>How the dialog works</h2>
            <p>Pick the mood you want: relax, laugh, adrenaline, tears, or inspiration. Then context — solo, date, friends, or family. A third question if needed: genre, language, “no kid scenes,” and so on.</p>
            <p>A language model processes answers; Movie Planner searches the catalog with your taste and watch history in mind.</p>

            <h2>Unlike regular search</h2>
            <ul>
                <li>No query crafting — tap a mood button;</li>
                <li>Recommendations respect context (date night vs friends);</li>
                <li>Result is a mini watchlist, not an infinite feed;</li>
                <li>Add to library or schedule a watch from the card.</li>
            </ul>

            <h2>Where to try it</h2>
            <p><strong>By mood</strong> is in the mobile app and web cabinet — in search or on Home, near describe-to-search.</p>

            <h2>Who it is for</h2>
            <p>Anyone tired of “what should we watch tonight,” couples arguing over picks, or friends before a group watch. AI narrows thousands of titles to a few good options — it does not replace your taste.</p>""",
    },
    {
        "ru_slug": "prilozhenie-iphone-ios-android.html",
        "en_slug": "mobile-app-ios-android.html",
        "title": "Movie Planner mobile app: iOS and Android",
        "description": "Native Movie Planner app for iOS is in the App Store. Android is available on Google Play with the same features.",
        "h1": "Movie Planner mobile app: iOS and Android",
        "date": "May 29, 2026",
        "iso_date": "2026-05-29",
        "footer": "full",
        "body": """
            <p><strong>Movie Planner</strong> started as a Telegram bot, but films are easier in your pocket. There is a native <strong>iPhone</strong> app and an <strong>Android</strong> app on Google Play, plus an updated <strong>Chrome extension</strong>.</p>

            <h2>What is in the App Store</h2>
            <p>The iOS app syncs with your Movie Planner account: library, watch plans, tickets, reminders 10 minutes before showtime, search, screenshot recognition, and mood picks. Same features as the web cabinet — with push notifications and a native UI.</p>
            <p><a href="https://apps.apple.com/app/movie-planner/id6769016073" target="_blank" rel="noopener">Download Movie Planner on the App Store</a></p>

            <h2>Android</h2>
            <p>The Android app shares the same codebase (React Native / Expo). Library, plans, tickets, series, and AI picks — identical to iOS. <a href="/download">Get it on Google Play</a>.</p>

            <h2>Browser extension</h2>
            <p>The Chrome extension adds films from Kinopoisk and IMDb and marks episodes on streaming sites. Details — <a href="/articles/en/chrome-extension.html">Chrome extension for film fans</a>.</p>

            <h2>One account — every platform</h2>
            <p>Web cabinet, iPhone, Android, and the extension share one library. Add a film on your phone — see it on the site. Plan cinema on the web — get the reminder on your phone.</p>""",
    },
    {
        "ru_slug": "raspoznavanie-filma-po-skreenshotu.html",
        "en_slug": "screenshot-film-recognition.html",
        "title": "Find a film from a screenshot in Movie Planner",
        "description": "Identify a film from a social feed frame or poster: Shazam-style search in the app and web cabinet.",
        "h1": "Find a film from a screenshot in Movie Planner",
        "date": "May 29, 2026",
        "iso_date": "2026-05-29",
        "footer": "full",
        "body": """
            <p>You see a frame in a feed but no title. Or a poster without a caption. <strong>Movie Planner</strong> recognizes films from screenshots — Shazam for movies.</p>

            <h2>How it works</h2>
            <p>Upload an image: a film frame, poster, TikTok or Instagram capture, or a metro ad. Computer vision and AI match it to the catalog and suggest one or more titles.</p>
            <p>When a match is found you get the card: rating, synopsis, <strong>Add to library</strong> and <strong>Schedule watch</strong>.</p>

            <h2>Where it works</h2>
            <ul>
                <li><strong>iPhone app</strong> — Search, recognition button;</li>
                <li><strong>Web cabinet</strong> at <a href="https://movie-planner.ru/">movie-planner.ru</a> — site search;</li>
                <li><strong>Android</strong> — same feature in Google Play.</li>
            </ul>

            <h2>Which screenshots work best</h2>
            <p>Clear character frames, posters with titles, and ads work well. Text on the image helps. Blurry crops often still match — try a few shots.</p>

            <h2>After recognition</h2>
            <p>Add to your library or schedule a home or cinema watch. If several matches appear, pick the right one. You will not lose that social find.</p>""",
    },
    {
        "ru_slug": "rasshirenie-chrome-dlya-kinomanov.html",
        "en_slug": "chrome-extension.html",
        "title": "Movie Planner Chrome extension: add films and track episodes",
        "description": "Official Movie Planner extension for Chrome and Opera: add films from Kinopoisk and IMDb, mark streaming episodes in one click.",
        "h1": "Movie Planner Chrome extension: add films and track episodes",
        "date": "May 29, 2026",
        "iso_date": "2026-05-29",
        "footer": "full",
        "body": """
            <p>If you browse films in the browser, switching to Telegram every time is slow. The <strong>Movie Planner extension</strong> for Chrome (and Opera) adds an <strong>Add to library</strong> button on Kinopoisk, IMDb, or Letterboxd.</p>

            <h2>Add films in seconds</h2>
            <p>Open a film on kinopoisk.ru — click the extension icon. The title lands in Movie Planner with poster, rating, and link. Same for series with seasons and episodes.</p>

            <h2>Track episodes on streaming sites</h2>
            <p>On Okko, Kinopoisk HD, ivi, and other services the extension detects the series and episode. One <strong>Mark episode</strong> tap updates progress in the app and cabinet.</p>

            <h2>Syncs with app and cabinet</h2>
            <p>Sign in through the web cabinet. Everything you add in the browser appears in the app instantly. Plans, ratings, and stats stay in sync.</p>

            <h2>Install</h2>
            <p><a href="https://chromewebstore.google.com/detail/movie-planner-bot/fldeclcfcngcjphhklommcebkpfipdol" target="_blank" rel="noopener">Install from Chrome Web Store</a>. Open the extension and sign in to link your account.</p>

            <h2>Who it is for</h2>
            <ul>
                <li>film fans who browse Kinopoisk or IMDb;</li>
                <li>series watchers on streaming sites;</li>
                <li>anyone who wants to save finds without copying links.</li>
            </ul>""",
    },
    {
        "ru_slug": "sovmestnoe-planirovanie-kino-s-druziami.html",
        "en_slug": "planning-with-friends.html",
        "title": "Plan cinema trips with friends",
        "description": "Schedule a film with friends in Movie Planner: shared plan, tickets in the reminder, show QR at the door.",
        "h1": "Plan cinema trips with friends",
        "date": "May 29, 2026",
        "iso_date": "2026-05-29",
        "footer": "full",
        "body": """
            <p>A cinema night with friends means coordination: who buys tickets, where you meet, not losing the QR in chat. <strong>Movie Planner</strong> handles it with one plan everyone can see.</p>

            <h2>One plan for the whole group</h2>
            <p>Create an <strong>At the cinema</strong> plan with film, date, time, and venue. Share it with friends via link. The plan shows up in each person’s cabinet — no more “I thought you bought the tickets.”</p>

            <h2>Tickets for everyone</h2>
            <p>Attach ticket photos or PDFs to the plan. Ten minutes before showtime Movie Planner sends a push with tickets inside. Tap the notification — show the code at the entrance. No digging through the gallery.</p>

            <h2>Friend groups</h2>
            <p>Create a group in the cabinet with friends. Shared library, plans, and discussion in one place. Anyone can suggest a film and confirm they are coming.</p>

            <h2>Step by step</h2>
            <ol>
                <li>Add the film (search, link, or screenshot recognition).</li>
                <li>Tap <strong>Schedule watch</strong> → <strong>At the cinema</strong>.</li>
                <li>Set date, time, and cinema.</li>
                <li>Attach tickets and invite friends.</li>
                <li>Get the reminder with tickets 10 minutes before showtime.</li>
            </ol>

            <p>More on tickets: <a href="/articles/en/cinema-planning.html">How to plan cinema trips</a>.</p>""",
    },
    {
        "ru_slug": "spisok-serialov-v-telegram.html",
        "en_slug": "group-series-watchlist.html",
        "title": "Shared series watchlist — group tracker and marathons",
        "description": "Keep a group series list with friends: shared watchlist, marathon planning, and watch-together reminders.",
        "h1": "Shared series watchlist — group tracker and marathons",
        "date": "January 30, 2026",
        "footer": "minimal",
        "og": False,
        "body": """
            <p>A <strong>shared series list</strong> with friends lives in Movie Planner groups. Everyone adds shows, tracks progress, and plans marathon nights together.</p>

            <h2>Group series list</h2>
            <p>In a friend group everyone sees one list. Someone adds a show — it appears for all. Each person marks their own watched episodes; progress is individual. Great for a crew that watches or discusses together.</p>

            <h2>Shared watchlist</h2>
            <p>Create a group like “Weekend series” or “Marathon crew” and start filling the list. Pick what to watch, vote, and schedule a date and time.</p>

            <h2>Marathon planning</h2>
            <p>Schedule an episode for Saturday evening — everyone gets a reminder. Regular watch nights without endless chat threads.</p>""",
    },
    {
        "ru_slug": "top-10-serialov.html",
        "en_slug": "top-10-series-features.html",
        "title": "Top 10 Movie Planner features for series fans",
        "description": "What Movie Planner offers series watchers: subscriptions, progress, stats, and reminders.",
        "h1": "Top 10 Movie Planner features for series fans",
        "date": "January 30, 2026",
        "footer": "full",
        "og": False,
        "body": """
            <ol>
                <li>Add a series with one Kinopoisk or IMDb link</li>
                <li>Subscribe to new episodes with release alerts</li>
                <li>Mark watched episodes and see overall progress</li>
                <li>Discuss a season with friends in a group</li>
                <li>Schedule the next episode to watch together</li>
                <li>Track progress by season and episode</li>
                <li>Stats: episodes watched over a period</li>
                <li>Similar series recommendations after you rate</li>
                <li>Ratings for films and series in one library</li>
                <li>Extension: mark episodes from the streaming page</li>
            </ol>

            <p>Juggling several shows at once? Movie Planner helps you stay oriented.</p>""",
    },
    {
        "ru_slug": "treker-serialov-telegram.html",
        "en_slug": "series-tracker.html",
        "title": "Series tracker — new episode alerts and watch progress",
        "description": "Track series in Movie Planner: new episode notifications, watch progress, mark episodes from streaming or the app.",
        "h1": "Series tracker — new episode alerts and watch progress",
        "date": "January 30, 2026",
        "footer": "standard",
        "og": False,
        "body": """
            <p>A <strong>series tracker</strong> keeps you from losing place across many shows. Movie Planner lets you add series, mark episodes, and get alerts when new ones drop.</p>

            <h2>New episode notifications</h2>
            <p>Subscribe to a series — get notified when the next episode is out. Major streaming catalogs are supported. You will not miss the drop.</p>

            <h2>Watch progress</h2>
            <p>Mark episodes from a streaming page via the Chrome extension, or manually in the app. Progress is saved — you always know where you stopped.</p>

            <h2>App and web cabinet</h2>
            <p>Add a series by link, turn on new-episode alerts — done. Available in the mobile app and at movie-planner.ru.</p>""",
    },
    {
        "ru_slug": "uvedomleniya-o-novyh-seriyah.html",
        "en_slug": "new-episode-notifications.html",
        "title": "New episode notifications — never miss a release",
        "description": "Turn on new episode alerts in Movie Planner so you never miss the next installment of a show you follow.",
        "h1": "New episode notifications — never miss a release",
        "date": "January 30, 2026",
        "footer": "minimal",
        "og": False,
        "body": """
            <p>Following five or ten series at once? Easy to forget a new episode landed. <strong>New episode notifications</strong> in Movie Planner fix that: add a series, tap <strong>Subscribe</strong>, and get a message when the next episode is available.</p>

            <h2>How to turn on alerts</h2>
            <ol>
                <li><a href="/?open_login=1">Sign in to the web cabinet</a> or open the mobile app.</li>
                <li>Add a series — paste a Kinopoisk or IMDb link or search by title.</li>
                <li>On the series card tap <strong>Subscribe to new episodes</strong>.</li>
                <li>Alerts arrive automatically when an episode goes live.</li>
            </ol>

            <h2>Where notifications arrive</h2>
            <p>Push in the mobile app or in the cabinet feed. Release data updates automatically — no manual checks on streaming apps.</p>""",
    },
    {
        "ru_slug": "vs-letterboxd-trakt.html",
        "en_slug": "vs-letterboxd-trakt.html",
        "title": "Movie Planner vs Letterboxd vs Trakt — comparison",
        "description": "Compare Movie Planner, Letterboxd, and Trakt: watch planning, group lists, cinema tickets, series alerts.",
        "h1": "Movie Planner vs Letterboxd vs Trakt — comparison",
        "date": "January 30, 2026",
        "footer": "full",
        "og": False,
        "body": """
            <p>A straight comparison of three services for film fans.</p>

            <table>
                <thead>
                    <tr>
                        <th>Feature</th>
                        <th>Movie Planner</th>
                        <th>Letterboxd</th>
                        <th>Trakt</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>Watch plans with reminders</td><td>Yes (home + cinema)</td><td>No</td><td>Partial</td></tr>
                    <tr><td>Group watchlist</td><td>Yes, in app</td><td>No</td><td>No</td></tr>
                    <tr><td>Ticket attach + showtime reminder</td><td>Yes</td><td>No</td><td>No</td></tr>
                    <tr><td>New episode subscriptions</td><td>Yes</td><td>No</td><td>Yes</td></tr>
                    <tr><td>Kinopoisk integration</td><td>Full</td><td>No</td><td>Limited</td></tr>
                    <tr><td>Free tier</td><td>Most features</td><td>Yes</td><td>Yes + Pro</td></tr>
                </tbody>
            </table>

            <p>Movie Planner is for people who want to plan <em>when</em> and <em>with whom</em> they watch — not only log and rate.</p>""",
    },
]


def patch_ru_hreflang(ru_slug: str, en_slug: str) -> None:
    path = ARTICLES / ru_slug
    text = path.read_text(encoding="utf-8")
    ru_url = f"{BASE}/articles/{ru_slug}"
    en_url = f"{BASE}/articles/en/{en_slug}"
    block = hreflang_block(ru_slug, en_slug, lang="ru")

    if "hreflang=" in text:
        text = re.sub(
            r"    <link rel=\"canonical\" href=\"[^\"]+\">\n(?:    <link rel=\"alternate\" hreflang=\"[^\"]+\" href=\"[^\"]+\">\n)*(?:    <meta property=\"og:locale\" content=\"[^\"]+\">\n)?",
            block + "\n",
            text,
            count=1,
        )
    elif '<link rel="canonical"' in text:
        text = text.replace(
            f'    <link rel="canonical" href="{ru_url}">',
            block,
            1,
        )
    else:
        insert_after = '<meta name="description" content="'
        idx = text.find(insert_after)
        if idx == -1:
            raise ValueError(f"No description meta in {ru_slug}")
        end = text.find('">', idx) + 2
        end = text.find("\n", end) + 1
        text = text[:end] + block + "\n" + text[end:]

    if 'property="og:locale"' not in text:
        pass  # block includes og:locale

    # language switch link in CTA if missing
    lang_link = f'                    <a href="{en_url}" hreflang="en" data-mp-chrome="lang-switch">English</a>'
    if "lang-switch" not in text and "article-cta-secondary" in text:
        text = text.replace(
            '                    <a href="/">На главную</a>\n                </div>',
            '                    <a href="/">На главную</a>\n                    <span aria-hidden="true">·</span>\n' + lang_link + "\n                </div>",
            1,
        )

    path.write_text(text, encoding="utf-8")


def main() -> None:
    EN_DIR.mkdir(parents=True, exist_ok=True)
    for article in ARTICLE_DATA:
        en_path = EN_DIR / article["en_slug"]
        en_path.write_text(render_en(article), encoding="utf-8")
        patch_ru_hreflang(article["ru_slug"], article["en_slug"])
        print(f"  {article['ru_slug']} -> en/{article['en_slug']}")
    print(f"Done: {len(ARTICLE_DATA)} EN articles")


if __name__ == "__main__":
    main()
