#!/usr/bin/env python3
"""Add android-app rel=alternate after canonical in article HTML heads."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
ARTICLES = ROOT / "articles"
CANONICAL_RE = re.compile(
    r'(<link rel="canonical" href="(https://movie-planner\.ru[^"]+)">)',
    re.I,
)
ALT_EXISTS = re.compile(r"android-app://com\.movie_planner/", re.I)


def android_href(canonical: str) -> str:
    parsed = urlparse(canonical)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    return f"android-app://com.movie_planner/https/movie-planner.ru{path}"


def main() -> int:
    patched = 0
    for path in sorted(ARTICLES.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        if ALT_EXISTS.search(text):
            continue
        match = CANONICAL_RE.search(text)
        if not match:
            continue
        alt = f'<link rel="alternate" href="{android_href(match.group(2))}">'
        indent = "    "
        if match.start() > 0:
            line_start = text.rfind("\n", 0, match.start()) + 1
            prefix = text[line_start:match.start()]
            if prefix.strip() == "" and prefix:
                indent = prefix
        insert = f"\n{indent}{alt}"
        path.write_text(text[: match.end()] + insert + text[match.end() :], encoding="utf-8")
        patched += 1
        print(path.relative_to(ROOT))
    print(f"patched {patched} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
