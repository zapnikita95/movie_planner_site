# Festivals used movie posters and had no standalone planning page (2026-09-24)

## What the user saw

- Festival cards looked like film cards because their main image was a random programme poster.
- A festival detail stayed visually nested under the four “Смотреть” mode cards instead of opening as a standalone destination.
- The programme exposed only a few dates and did not explain the films, link to tickets, or show the festival’s own channels.
- Film cards and “В тренде” did not connect films and news back to a festival.

## Root cause

The first festival catalogue was a static presentation mock. It reused available film imagery, held minimal edition metadata, and had no festival event taxonomy for product analytics. Buzz aggregation also ranked films only and did not build a festival-level mention count.

## Fix

- Use festival-owned artwork with a generated festival identity only as fallback.
- Render festival details without the four mode cards and keep a single “← Фестивали” return action.
- Add edition history, venues, official links, social channels, confirmed screenings, film descriptions, reminders, database actions, and ticket links.
- Add a film-page festival badge for live and upcoming editions.
- Add the “Фестивали на слуху” block to “В тренде”, with the nearest edition and 30-day mention counts.
- Track festival page views, subscriptions, programme dates, film opens, database adds, reminders, outbound ticket/social clicks, and film badges.

## Regression checks

- `node festivals-mock.test.js` verifies festival-owned art, the Africa edition, four confirmed screening days, ticket links, descriptions, and the upcoming badge on “Айша не может улететь”.
- JavaScript syntax checks cover the festival page, mock, film page, and buzz page.
- Browser replay covers the standalone detail, festival catalogue, and “В тренде” block.

## Production replay

Open `/whattowatch/festivals/africa-together-2026`, verify the official festival art/logo and four programme days, then open `/f/movie-1337148` and verify the upcoming-festival badge. Open `/buzz` and verify that “Фестивали на слуху” appears without the removed explanatory lead.
