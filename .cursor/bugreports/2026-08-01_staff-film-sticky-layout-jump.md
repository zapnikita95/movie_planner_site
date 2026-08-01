# Staff/film: layout jump + sticky title flicker + header empty band (2026-08-01)

## Что увидел владелец
1. На `/s/` при загрузке всё «скачет» — фото/факты не сразу слева на десктопе.
2. Sticky-имя в хедере мигает, даже когда скролл остановлен.
3. На `/f/` название фильма не липнет к хедеру как имя актёра.
4. После скрытия поиска в хедере огромная тёмная пустота (~80px).

## Корни

### 1) Layout jump
`index.html` `paintRouteBoot` для `/s/` и `/f/` рисовал **только центр-спиннер** (`loadingShell`) без `staff-page-proto-layout`.
Потом `staff-page.js` подменял на сетку aside|main → элементы прыгали в финальные слоты.
Плюс `bootstrapInlineCabinetShell` всегда делал `innerHTML = …` и затирал уже нарисованный shell.

### 2) Sticky flicker
- Порог sticky считался от **полной** `header.offsetHeight`. Когда появлялся title / прятался search, высота хедера менялась → hysteresis ломался → on/off loop.
- CSS менял `order` title 3↔4 между title-only и with-search → визуальный скачок имени.
- На `/s/` в body часто оставались **оба** класса: `film-standalone-page` + `staff-standalone-page` (early landing leftover + staff add). В хедере жил чужой `#header-film-title` («Константин»).

### 3) Film title не sticky
`film-page.js` `bootstrap({ cabinetMode: true })` **не** ставил `film-standalone-page` (thin shell). Sticky JS требует этот класс; при dual-class film path ещё и отключался (`onFilm && !onStaff`).

### 4) Пустой хедер после retract
Flex `gap` на `.header-content` оставался между logo-row и схлопнутым search (height:0) → тёмная полоса. Плюс лишний `padding-bottom` / `min-height` у title-слота.

## Фикс
- Early boot `/s/`: сразу сетка photo+facts слева / фильмография справа из `mp-route-boot`.
- Staff bootstrap **не затирает** существующий `.staff-page--boot`.
- Взаимоисключающие body-классы staff↔film; чистка чужого header title.
- Sticky: порог от logo/buttons row; широкая hysteresis; title всегда `order:4`, search `order:3`.
- Search retract разрешён при sticky; плавный show на scroll up.
- `:has(.header-search--retracted)` → `row-gap:0` + меньший padding хедера.
- Film bootstrap всегда ставит `film-standalone-page` (и в cabinetMode).

## На что смотреть дальше
- Не рисовать route boot спиннером на всю страницу, если финальный layout — сетка.
- Не мерить sticky threshold полной высотой sticky-хедера.
- Не менять flex `order` sticky-title при toggle поиска.
- На `/s/` никогда не оставлять `film-standalone-page`.
- После retract проверять `clientHeight` `#site-header` (~48–64px без title, ~64–72 с title — не ~80+ пустоты).

## Pin
`V=20260801stickyLayout1`
