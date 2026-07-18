# Safe prod deploy (movie_planner_site)

Канон для агентов и людей живёт в репо бота:

- https://github.com/zapnikita95/movie_planner_bot/blob/main/docs/SAFE_PROD_DEPLOY.md
- https://github.com/zapnikita95/movie_planner_bot/blob/main/.cursor/skills/safe-prod-deploy/SKILL.md

## Кратко для этого репо

1. Не пушить код/статику кабинета напрямую в `main`.
2. Ветка `fix/*` / `feat/*` / `chore/*` → self-review → PR → merge (squash).
3. RISKY для сайта: auth UI, API base URL (`api.*` vs apex), кабинет home/rails wiring, login — при сомнении PR + спросить владельца перед merge.
4. После merge проверить нужную страницу на `https://movie-planner.ru`.

`main` здесь = то, что подтягивает Railway apex proxy.
