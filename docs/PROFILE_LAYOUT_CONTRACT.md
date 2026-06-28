# Profile Layout Contract (Web Cabinet)

This file is the source of truth for profile UI in `movie-planner.ru`.
Any profile-related change must keep this contract.

## Scope

- Own profile hub: `/settings` (section "Настройки").
- Friend profile page: `/u/{user_id}` when opened from cabinet session.

## Unified structure (must match on desktop and mobile)

1. Header card:
   - Avatar (never broken image: real avatar or preset fallback).
   - Profile name.
   - Meta line (`@username` or friendship status/coins/streak when applicable).
   - Highlights row **directly under name/meta**.
2. Highlights row (same visual style):
   - Own profile: in base / watched / series / friends.
   - Friend profile: ratings / unwatched / watched / achievements.
3. Action row for friend profile:
   - "Смотрим вместе" + secondary friendship action.
   - Must be rendered under highlights.
4. Achievements block:
   - Friend profile: visible in profile body.
   - Own profile: visible in profile hub (latest achievements preview).

## Loading behavior

- Use `mp-page-loading` spinner for profile loading states.
- Own profile hub must render from `/api/miniapp/profile?lite=1` first.
- Secondary data (friends count, own achievements preview) loads asynchronously and never blocks initial paint.

## Taste matching behavior

- Never compute taste match synchronously on profile open.
- Profile reads cached values only.
- Recompute is background-only and TTL-based.
- Detailed taste logic belongs to "Смотрим вместе" flow.

## Avatar reliability rules

- UI must always have fallback to preset avatar (`/api/avatar/defaults/{id}.jpg`).
- Backend avatar proxy must return preset fallback if source file is missing or telegram file path is stale.
- Broken `<img>` icons in profile cards are considered regressions.

## Desktop layout requirement (>=1024px)

- Highlights are visually attached to profile name block (not detached below card as a separate top-level block).
- Friend action row and achievements remain left-aligned under highlights.

