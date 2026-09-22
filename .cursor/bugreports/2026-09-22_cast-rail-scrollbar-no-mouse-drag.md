# Film cast rail: visible Windows scrollbar and no mouse drag (2026-09-22)

## What the user saw

- On `/f/{id}`, the “Создатели и актёры” rail could only be moved with the native horizontal scrollbar.
- On Windows that scrollbar occupied a large grey strip below the portrait cards.
- The neighboring “Похожие” rail supported direct mouse dragging, so the two horizontal rails behaved inconsistently.

## Root cause

`.film-people-rail` used `overflow-x: auto` with `scrollbar-width: thin`, but it was never bound to the existing pointer-drag handler used by the similar-films rail. Chromium on Windows therefore exposed its native scrollbar as the only obvious mouse control.

## Fix

- Bind `.film-people-rail` to `bindFilmPageSimilarRailDrag` after cast cards render.
- Preserve normal clicks unless the pointer crosses the existing 18px drag threshold.
- Hide the native scrollbar with Firefox, Chromium/WebKit, and legacy Windows declarations while retaining native horizontal overflow and touch scrolling.
- Disable native image/link ghost dragging during the gesture.

## Regression checks

- `film-page.js` parses successfully.
- `film-cast-layout.test.js` asserts pointer-drag binding, hidden-scrollbar declarations, and grab/grabbing states.
- Vertical page scrolling remains untouched: no wheel handler or `preventDefault()` was added.

## Production replay

After deployment, open a film with more cast cards than fit in the viewport, drag the portraits left/right with the primary mouse button, then click a portrait normally. The rail must move only on a real drag, links must still open on click, and no scrollbar may be visible on Windows.
