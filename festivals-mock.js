/**
 * Фестивали v1: статичный мок для сайта.
 *
 * TODO(bot): заменить на публичные эндпоинты, когда появятся в movie_planner_bot:
 *   GET /api/public/festivals
 *   GET /api/public/festivals/:slug
 *   GET /api/public/film/:kp/festivals
 * Auth later: subscribe / unsubscribe / remind (source=festival:<slug>).
 *
 * Не деплой в прод этим PR. Контент: «Итальянские истории» + Каро Фильм Арт
 * (театральная программа с рефа karofilmart) + Beat/Venice как seed appearances.
 */
(function (global) {
  "use strict";

  var COVER_ITALIAN =
    "https://avatars.mds.yandex.net/get-kinopoisk-image/10853012/94dd6f44-d662-4bdb-aa9f-6a08f955e642/600x900";
  var COVER_KARO =
    "https://avatars.mds.yandex.net/get-kinopoisk-image/4486454/d9d353ab-f01a-4797-8a3a-c06457e47c06/600x900";
  var COVER_BEAT =
    "https://avatars.mds.yandex.net/get-kinopoisk-image/10703959/afb31142-79da-4209-9877-657521673aba/600x900";
  var COVER_VENICE =
    "https://avatars.mds.yandex.net/get-kinopoisk-image/10592371/20b18cde-faf5-47e3-b192-db9ae8c3d4ff/600x900";

  var FESTIVALS = [
    {
      id: "italian-stories-2026",
      slug: "italian-stories-2026",
      title: "Итальянские истории",
      cover: COVER_ITALIAN,
      city: "Архангельское",
      online: false,
      starts_at: "2026-08-28",
      ends_at: "2026-08-30",
      official_url: "https://movie-planner.ru/whattowatch/collections/italian-stories-2026",
      collection_code: "italian-stories-2026",
      description:
        "Три дня итальянского кино в музее-усадьбе Архангельское: новые фильмы, классика и встречи. Площадка усадьбы, показы вечером.",
      covers: [
        COVER_ITALIAN,
        "https://avatars.mds.yandex.net/get-kinopoisk-image/10853012/996e145d-a771-4f85-9d4f-cd69f1313d6c/600x900",
        COVER_VENICE,
      ],
      participants: [
        { name: "Музей-усадьба Архангельское", role: "Площадка" },
        { name: "Итальянский институт культуры", role: "Партнёр" },
        { name: "Паоло Соррентино", role: "Режиссёр, «Партенопа»" },
        { name: "Маттео Гарроне", role: "Режиссёр, «Я — капитан»" },
      ],
      program: [
        {
          section: "Основная программа",
          items: [
            {
              title: "Партенопа",
              director: "Паоло Соррентино",
              year: 2024,
              venue: "Кинотеатр усадьбы",
              kp_id: "5411300",
              poster: COVER_ITALIAN,
              screening_at: "2026-08-28T19:00:00+03:00",
            },
            {
              title: "Я — капитан",
              director: "Маттео Гарроне",
              year: 2023,
              venue: "Кинотеатр усадьбы",
              kp_id: "4541881",
              poster: "https://avatars.mds.yandex.net/get-kinopoisk-image/10835644/6ca9bb0e-c7c9-4705-9625-7f471535330c/600x900",
              screening_at: "2026-08-29T19:00:00+03:00",
            },
            {
              title: "Ещё одна жизнь",
              director: "Эмануэле Криалезе",
              year: 2023,
              venue: "Кинотеатр усадьбы",
              kp_id: "4542093",
              poster: "https://avatars.mds.yandex.net/get-kinopoisk-image/10853012/996e145d-a771-4f85-9d4f-cd69f1313d6c/600x900",
              screening_at: "2026-08-30T18:00:00+03:00",
            },
            {
              title: "Сделано в Милане",
              director: "Джон Маджо",
              year: 2024,
              venue: "Кинотеатр усадьбы",
              kp_id: "movie-1660825",
              poster: COVER_BEAT,
              screening_at: "2026-08-30T20:30:00+03:00",
            },
          ],
        },
        {
          section: "Классика",
          items: [
            {
              title: "Сладкая жизнь",
              director: "Федерико Феллини",
              year: 1960,
              venue: "Парк усадьбы",
              kp_id: "349",
              poster: COVER_VENICE,
              screening_at: "2026-08-29T16:00:00+03:00",
            },
            {
              title: "Восемь с половиной",
              director: "Федерико Феллини",
              year: 1963,
              venue: "Парк усадьбы",
              kp_id: "414",
              poster: COVER_KARO,
              screening_at: "2026-08-30T16:00:00+03:00",
            },
          ],
        },
      ],
    },
    {
      id: "karofilmart-theater-2026",
      slug: "karofilmart-theater-2026",
      title: "Каро Фильм Арт. Театральная программа",
      cover: COVER_KARO,
      city: "Москва",
      online: false,
      starts_at: "2026-10-02",
      ends_at: "2026-10-26",
      official_url: "https://www.instagram.com/karofilmart/",
      collection_code: "",
      description:
        "Октябрьская театральная программа Каро Фильм Арт: записи спектаклей и кинопоказы. Москва, 2–26 октября 2026.",
      covers: [
        COVER_KARO,
        "https://avatars.mds.yandex.net/get-kinopoisk-image/10835644/6ca9bb0e-c7c9-4705-9625-7f471535330c/600x900",
        COVER_ITALIAN,
      ],
      participants: [
        { name: "Каро Фильм Арт", role: "Организатор" },
        { name: "Театр Старый дом", role: "Площадка" },
        { name: "Comédie-Française", role: "Площадка" },
        { name: "Meno fortas", role: "Площадка" },
        { name: "МХТ имени А. П. Чехова", role: "Конкурс короткого метра" },
        { name: "Арсений Мещеряков", role: "Режиссёр, «Скасска»" },
        { name: "Эймунтас Някрошюс", role: "Режиссёр, «Отелло»" },
      ],
      program: [
        {
          section: "Театральная программа",
          items: [
            {
              title: "Скасска",
              director: "Арсений Мещеряков",
              year: 2025,
              venue: "Театр Старый дом",
              kp_id: "",
              poster: COVER_KARO,
              screening_at: "2026-10-02T19:00:00+03:00",
            },
            {
              title: "Маскарад",
              director: "Анатолий Васильев",
              year: 1993,
              venue: "Comédie-Française",
              kp_id: "",
              poster: COVER_VENICE,
              screening_at: "2026-10-05T19:00:00+03:00",
            },
            {
              title: "Отелло",
              director: "Эймунтас Някрошюс",
              year: 2009,
              venue: "Meno fortas",
              kp_id: "",
              poster: COVER_ITALIAN,
              screening_at: "2026-10-12T19:00:00+03:00",
            },
            {
              title: "Безумный день в Комеди Франсез",
              director: "Мартин Дарондо, Бертран Юскла",
              year: 2026,
              venue: "Москва",
              kp_id: "",
              poster: COVER_BEAT,
              screening_at: "2026-10-18T18:00:00+03:00",
            },
            {
              title: "Юрий Бутусов. Барабаны внутри",
              director: "Наталья Пешкова",
              year: 2026,
              venue: "Москва",
              kp_id: "",
              poster: COVER_KARO,
              screening_at: "2026-10-22T19:30:00+03:00",
            },
            {
              title: "Конкурс короткометражного кино МХТ имени А. П. Чехова",
              director: "",
              year: "2025 / 2026",
              venue: "МХТ имени А. П. Чехова",
              kp_id: "",
              poster: COVER_VENICE,
              screening_at: "2026-10-26T16:00:00+03:00",
            },
          ],
        },
      ],
    },
    {
      id: "beatfilm-2026",
      slug: "beatfilm-2026",
      title: "Beat Weekend / Битфилм",
      cover: COVER_BEAT,
      city: "18 городов",
      online: true,
      starts_at: "2026-09-10",
      ends_at: "2026-09-20",
      official_url: "https://beatfilmfestival.ru/news/beat-weekend-2026-daty-goroda-i-programmu",
      collection_code: "beatfilm-2026",
      description:
        "Документальный фестиваль о новой культуре. 10–20 сентября 2026, 18 городов и онлайн на Кинопоиске.",
      program: [
        {
          section: "Открытие и мода",
          items: [
            { title: "Твигги", director: "Сэди Фрост", year: 2024, venue: "Москва", kp_id: "movie-1049286", screening_at: "2026-09-10T19:00:00+03:00" },
            { title: "Сделано в Милане", director: "Джон Маджо", year: 2024, venue: "Пионер", kp_id: "movie-1660825" },
          ],
        },
        {
          section: "Музыка",
          items: [
            { title: "Боуи: последняя глава", director: "Джонатан Стиасни", year: 2025, venue: "Москва", kp_id: "movie-1571485" },
            { title: "Канье Уэст: во имя кого?", director: "Нико Бальестерос", year: 2025, venue: "Москва", kp_id: "movie-1381066" },
            { title: "Лучшее лето", director: "Тамра Дэвис", year: 2025, venue: "Москва", kp_id: "movie-1596324" },
          ],
        },
        {
          section: "Документальные премьеры",
          items: [
            { title: "История бетона", director: "Джон Уилсон", year: 2025, venue: "Москва", kp_id: "movie-1596296" },
            { title: "Овсянка для чемпионов", director: "Константин Коста", year: 2025, venue: "Москва", kp_id: "11979853" },
            { title: "Биостанция Анива: дело длинной воли", director: "Александр Фёдоров", year: 2025, venue: "Москва", kp_id: "12587600" },
          ],
        },
      ],
    },
    {
      id: "venice-2026",
      slug: "venice-2026",
      title: "Венецианский кинофестиваль",
      cover: COVER_VENICE,
      city: "Венеция",
      online: false,
      starts_at: "2026-09-02",
      ends_at: "2026-09-12",
      official_url: "https://www.labiennale.org/en/cinema",
      collection_code: "venice-2026",
      description: "83-й Венецианский кинофестиваль. 2–12 сентября 2026. Подборка фильмов — в «Коллекциях».",
      program: [
        {
          section: "Основной конкурс",
          items: [
            { title: "Основной конкурс", director: "", year: 2026, venue: "Венеция", kp_id: "" },
          ],
        },
      ],
    },
  ];

  var NEWS = [
    {
      id: "n-karo-theater",
      festival_id: "karofilmart-theater-2026",
      title: "Каро Фильм Арт открыл театральную программу",
      cover: COVER_KARO,
      published_at: "2026-09-19",
    },
    {
      id: "n-karo-othello",
      festival_id: "karofilmart-theater-2026",
      title: "«Отелло» Някрошюса в афише октября",
      cover: COVER_ITALIAN,
      published_at: "2026-09-18",
    },
    {
      id: "n-karo-mht",
      festival_id: "karofilmart-theater-2026",
      title: "Короткий метр МХТ закроет программу",
      cover: COVER_VENICE,
      published_at: "2026-09-16",
    },
    {
      id: "n-beat-close",
      festival_id: "beatfilm-2026",
      title: "Beat Weekend закрылся в 18 городах",
      cover: COVER_BEAT,
      published_at: "2026-09-20",
    },
    {
      id: "n-italian-wrap",
      festival_id: "italian-stories-2026",
      title: "«Итальянские истории» прошли в Архангельском",
      cover: COVER_ITALIAN,
      published_at: "2026-08-31",
    },
    {
      id: "n-italian-parthenope",
      festival_id: "italian-stories-2026",
      title: "«Партенопа» закрыла фестиваль",
      cover: COVER_ITALIAN,
      published_at: "2026-08-30",
    },
    {
      id: "n-venice-wrap",
      festival_id: "venice-2026",
      title: "Венеция-2026: итоги 83-го фестиваля",
      cover: COVER_VENICE,
      published_at: "2026-09-13",
    },
  ];

  /* kp_id → appearances. Seed from Beat/Italian mock program. */
  var APPEARANCES = {
    "movie-1049286": [{ festival_id: "beatfilm-2026", year: 2026, section: "Открытие и мода" }],
    "movie-1660825": [
      { festival_id: "beatfilm-2026", year: 2026, section: "Открытие и мода" },
      { festival_id: "italian-stories-2026", year: 2026, section: "Основная программа" },
    ],
    "movie-1571485": [{ festival_id: "beatfilm-2026", year: 2026, section: "Музыка" }],
    "movie-1381066": [{ festival_id: "beatfilm-2026", year: 2026, section: "Музыка" }],
    "movie-1596324": [{ festival_id: "beatfilm-2026", year: 2026, section: "Музыка" }],
    "movie-1596296": [{ festival_id: "beatfilm-2026", year: 2026, section: "Документальные премьеры" }],
    "11979853": [{ festival_id: "beatfilm-2026", year: 2026, section: "Документальные премьеры" }],
    "12587600": [{ festival_id: "beatfilm-2026", year: 2026, section: "Документальные премьеры" }],
    "5411300": [{ festival_id: "italian-stories-2026", year: 2026, section: "Основная программа" }],
    "4541881": [{ festival_id: "italian-stories-2026", year: 2026, section: "Основная программа" }],
    "4542093": [{ festival_id: "italian-stories-2026", year: 2026, section: "Основная программа" }],
    "349": [{ festival_id: "italian-stories-2026", year: 2026, section: "Классика" }],
    "414": [{ festival_id: "italian-stories-2026", year: 2026, section: "Классика" }],
  };

  var STATUS_LABEL = { upcoming: "Скоро", live: "Идёт", past: "Прошёл" };

  function parseDay(value) {
    var s = String(value || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 0;
    return Date.parse(s + "T12:00:00+03:00") || 0;
  }

  function statusOf(fest, now) {
    var t = now instanceof Date ? now.getTime() : Date.parse(now) || Date.now();
    var start = parseDay(fest && fest.starts_at);
    var end = parseDay(fest && fest.ends_at);
    if (!start) return "upcoming";
    if (t < start) return "upcoming";
    if (end && t > end) return "past";
    return "live";
  }

  function formatDateRange(start, end) {
    function fmt(iso) {
      var d = new Date(parseDay(iso));
      if (!iso || isNaN(d.getTime())) return "";
      var day = d.getDate();
      var months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
      return day + " " + months[d.getMonth()];
    }
    var a = fmt(start);
    var b = fmt(end);
    if (a && b && a !== b) return a + " по " + b;
    return a || b || "";
  }

  function enrich(fest, now) {
    if (!fest) return null;
    var status = statusOf(fest, now);
    return {
      id: fest.id,
      slug: fest.slug,
      title: fest.title,
      cover: fest.cover,
      city: fest.city,
      online: !!fest.online,
      starts_at: fest.starts_at,
      ends_at: fest.ends_at,
      official_url: fest.official_url,
      collection_code: fest.collection_code || "",
      description: fest.description,
      covers: fest.covers || (fest.cover ? [fest.cover] : []),
      participants: fest.participants || [],
      program: fest.program || [],
      status: status,
      status_label: STATUS_LABEL[status] || status,
      dates_label: formatDateRange(fest.starts_at, fest.ends_at),
      place_label: fest.online ? (fest.city ? fest.city + ", онлайн" : "Онлайн") : fest.city || "",
    };
  }

  function bySlug(slug) {
    var key = String(slug || "").trim();
    for (var i = 0; i < FESTIVALS.length; i++) {
      if (FESTIVALS[i].slug === key || FESTIVALS[i].id === key) return FESTIVALS[i];
    }
    return null;
  }

  function listFestivals(now) {
    return FESTIVALS.map(function (f) { return enrich(f, now); });
  }

  function getFestival(slug, now) {
    var raw = bySlug(slug);
    return raw ? enrich(raw, now) : null;
  }

  function scheduleGroups(now) {
    var items = listFestivals(now);
    var upcoming = [];
    var past = [];
    items.forEach(function (f) {
      if (f.status === "past") past.push(f);
      else upcoming.push(f);
    });
    upcoming.sort(function (a, b) { return parseDay(a.starts_at) - parseDay(b.starts_at); });
    past.sort(function (a, b) { return parseDay(b.ends_at) - parseDay(a.ends_at); });
    return { upcoming: upcoming, past: past };
  }

  function newsFeed() {
    return NEWS.slice().sort(function (a, b) {
      return String(b.published_at).localeCompare(String(a.published_at));
    }).map(function (n) {
      var fest = bySlug(n.festival_id);
      return {
        id: n.id,
        title: n.title,
        cover: n.cover || (fest && fest.cover) || "",
        published_at: n.published_at,
        festival_id: n.festival_id,
        festival_slug: fest ? fest.slug : n.festival_id,
        festival_title: fest ? fest.title : "",
      };
    });
  }

  function normalizeKp(kp) {
    return String(kp || "").trim();
  }

  function appearancesForKp(kp) {
    var key = normalizeKp(kp);
    var rows = APPEARANCES[key] || [];
    return rows.map(function (row) {
      var fest = bySlug(row.festival_id);
      return {
        festival_id: row.festival_id,
        slug: fest ? fest.slug : row.festival_id,
        title: fest ? fest.title : row.festival_id,
        year: row.year,
        section: row.section || "",
        cover: fest ? fest.cover : "",
      };
    });
  }

  function newsForFestival(slug) {
    var key = String(slug || "").trim();
    return newsFeed().filter(function (n) {
      return n.festival_slug === key || n.festival_id === key;
    });
  }

  function kpItems(fest) {
    var out = [];
    var program = (fest && fest.program) || [];
    program.forEach(function (sec) {
      (sec.items || []).forEach(function (it) {
        if (it && it.kp_id) out.push(it);
      });
    });
    return out;
  }

  global.MpFestivalsMock = {
    SOURCE: "mock",
    FESTIVALS: FESTIVALS,
    NEWS: NEWS,
    APPEARANCES: APPEARANCES,
    STATUS_LABEL: STATUS_LABEL,
    statusOf: statusOf,
    formatDateRange: formatDateRange,
    listFestivals: listFestivals,
    getFestival: getFestival,
    scheduleGroups: scheduleGroups,
    newsFeed: newsFeed,
    newsForFestival: newsForFestival,
    appearancesForKp: appearancesForKp,
    kpItems: kpItems,
  };
})(typeof window !== "undefined" ? window : globalThis);
