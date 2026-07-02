#!/usr/bin/env python3
"""Patch article HTML: main-page header chrome, session boot, script/css versions."""
from __future__ import annotations

import re
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
ARTICLES = SITE / "articles"
BUILD = "20260702articlechrome1"

HEAD_INSERT = f"""    <link rel="stylesheet" href="../style-v2.css?v={BUILD}">
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
    <script src="../articles/article-session-boot.js?v={BUILD}"></script>"""

HEADER = """    <header id="site-header">
      <div class="header-content">
        <a class="logo" href="/"><img src="../images/icon48.png" alt="Movie Planner"><span>Movie Planner</span></a>
        <div class="header-search" id="header-search" role="search">
          <span class="header-search-icon mp-icon" data-mp-icon="search" aria-hidden="true"></span>
          <input type="text" id="header-search-input" class="header-search-input" placeholder="Найти фильм или сериал…" autocomplete="off" aria-label="Поиск">
          <button type="button" class="header-search-mic mp-icon-btn" id="header-search-mic" data-mp-icon="voice" data-mp-icon-weight="duotone" aria-label="Голосовой ввод" title="Голосовой ввод"></button>
          <button type="button" class="header-search-clear hidden" id="header-search-clear" aria-label="Очистить">×</button>
          <div class="header-search-dropdown hidden" id="header-search-dropdown" role="listbox"></div>
        </div>
        <div class="header-buttons">
          <button type="button" class="header-login-btn" data-action="login" id="login-btn">Войти</button>
          <div class="header-user-wrap hidden account-switcher" id="header-user-wrap" style="position:relative">
            <button type="button" class="header-profile-pill hidden" id="header-profile-pill" aria-label="Профиль">
              <span class="header-profile-avatar" id="header-profile-avatar"></span>
              <span class="header-profile-name" id="header-profile-name"></span>
            </button>
            <div class="header-util-row">
              <button type="button" class="header-inbox-btn" id="header-inbox-btn" aria-label="Уведомления" title="Уведомления">
                <span class="header-inbox-icon" aria-hidden="true">📥</span>
              </button>
              <button type="button" class="header-coins-btn" id="header-coins-btn" aria-label="Монетки">
                <span class="header-coins-sprite"></span><span id="header-coins-val">—</span>
              </button>
            </div>
            <button type="button" class="header-settings-btn" id="header-settings-btn" aria-haspopup="true" aria-expanded="false" title="Настройки">
              <span class="header-settings-btn-icon" aria-hidden="true">⚙️</span><span class="header-settings-btn-text">Настройки</span>
            </button>
            <div class="header-settings-dropdown account-dropdown hidden" id="header-settings-dropdown" role="menu"></div>
          </div>
        </div>
      </div>
    </header>"""

FOOTER_SCRIPTS = f"""  <script src="../mp-icons.js?v=20260621"></script>
  <script src="../public-film-login.js?v=20260702yandexlogin2"></script>
  <script src="../film-page.js?v=20260628searchhub1"></script>
  <script src="../articles/article-chrome.js?v={BUILD}"></script>"""

HEADER_RE = re.compile(
    r"<header[^>]*class=\"site-header-subpage\"[^>]*>.*?</header>",
    re.DOTALL,
)
OLD_STYLE = re.compile(r'<link rel="stylesheet" href="\.\./style-v2\.css(?:\?v=[^"]*)?">')
OLD_SCRIPTS = re.compile(
    r"\s*<script src=\"\.\./public-film-login\.js\?v=[^\"]+\"></script>\s*"
    r"<script src=\"\.\./film-page\.js\?v=[^\"]+\"></script>\s*"
    r"<script src=\"\.\./articles/article-chrome\.js\?v=[^\"]+\"></script>",
    re.DOTALL,
)


def patch_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text

    if 'id="mp-article-critical"' not in text:
        if OLD_STYLE.search(text):
            text = OLD_STYLE.sub(HEAD_INSERT, text, count=1)
        elif '<link rel="stylesheet" href="../style-v2.css">' in text:
            text = text.replace(
                '<link rel="stylesheet" href="../style-v2.css">',
                HEAD_INSERT,
                1,
            )

    if HEADER_RE.search(text):
        text = HEADER_RE.sub(HEADER, text, count=1)

    if OLD_SCRIPTS.search(text):
        text = OLD_SCRIPTS.sub("\n" + FOOTER_SCRIPTS, text, count=1)

    if text != orig:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    changed = 0
    for path in sorted(ARTICLES.rglob("*.html")):
        if patch_file(path):
            changed += 1
            print("patched", path.relative_to(SITE))
    print(f"done: {changed} files")


if __name__ == "__main__":
    main()
