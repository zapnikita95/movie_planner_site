/**
 * Фестивали v1: статичный мок для сайта. Demo only, direct URL.
 *
 * TODO(bot): GET /api/public/festivals, /:slug, /api/public/film/:kp/festivals
 *
 * Даты относительно 2026-09-21:
 * Beat Weekend 10–20 Sep = прошлый (не июньский Beat Film Festival).
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
  var COVER_FLAH =
    "https://avatars.mds.yandex.net/get-kinopoisk-image/10835644/6ca9bb0e-c7c9-4705-9625-7f471535330c/600x900";
  var COVER_SIB =
    "https://avatars.mds.yandex.net/get-kinopoisk-image/10853012/996e145d-a771-4f85-9d4f-cd69f1313d6c/600x900";
  var COVER_MSG =
    "https://avatars.mds.yandex.net/get-kinopoisk-image/4486454/d9d353ab-f01a-4797-8a3a-c06457e47c06/600x900";

  function row(title, director, year, venue, kp_id, poster, screening_at) {
    return {
      title: title,
      director: director || "",
      year: year || "",
      venue: venue || "",
      kp_id: kp_id || "",
      poster: poster || "",
      screening_at: screening_at || "",
    };
  }

  var FESTIVALS = [
    {
      id: "siberia-meetings-2026",
      slug: "siberia-meetings-2026",
      title: "Встречи в Сибири",
      cover: COVER_SIB,
      city: "Новосибирск",
      online: false,
      starts_at: "2026-09-21",
      ends_at: "2026-09-27",
      official_url: "https://www.meetingsinsiberia.ru/",
      collection_code: "",
      description: "Документальный фестиваль в Новосибирске. 21–27 сентября 2026.",
      program: [
        {
          section: "Основной конкурс",
          items: [
            row("Овсянка для чемпионов", "Константин Коста", 2025, "Победа", "11979853", COVER_BEAT, "2026-09-21T19:00:00+07:00"),
            row("Биостанция Анива: дело длинной воли", "Александр Фёдоров", 2025, "Победа", "12587600", COVER_ITALIAN, "2026-09-22T18:30:00+07:00"),
            row("История бетона", "Джон Уилсон", 2025, "Победа", "movie-1596296", COVER_FLAH, "2026-09-24T19:00:00+07:00"),
            row("Лучшее лето", "Тамра Дэвис", 2025, "Победа", "movie-1596324", COVER_VENICE, "2026-09-26T18:00:00+07:00"),
          ],
        },
      ],
    },
    {
      id: "flahertiana-2026",
      slug: "flahertiana-2026",
      title: "Флаэртиана",
      cover: COVER_FLAH,
      city: "Пермь",
      online: false,
      starts_at: "2026-09-25",
      ends_at: "2026-10-01",
      official_url: "https://www.flahertiana.ru/",
      collection_code: "",
      description: "Международный фестиваль документального кино. Пермь, 25 сентября по 1 октября 2026.",
      program: [
        {
          section: "Международный конкурс",
          items: [
            row("Твигги", "Сэди Фрост", 2024, "Премьер", "movie-1049286", COVER_BEAT, "2026-09-25T18:00:00+05:00"),
            row("Боуи: последняя глава", "Джонатан Стиасни", 2025, "Премьер", "movie-1571485", COVER_VENICE, "2026-09-26T19:00:00+05:00"),
            row("Канье Уэст: во имя кого?", "Нико Бальестерос", 2025, "Премьер", "movie-1381066", COVER_KARO, "2026-09-28T18:30:00+05:00"),
            row("Сделано в Милане", "Джон Маджо", 2024, "Премьер", "movie-1660825", COVER_ITALIAN, "2026-09-30T17:00:00+05:00"),
          ],
        },
      ],
    },
    {
      id: "sretensky-vstrecha-2026",
      slug: "sretensky-vstrecha-2026",
      title: "Сретенский «Встреча»",
      cover: COVER_VENICE,
      city: "Обнинск",
      online: false,
      starts_at: "2026-09-25",
      ends_at: "2026-09-29",
      official_url: "https://sretenie-fest.ru/",
      collection_code: "",
      description: "Кинофестиваль «Встреча». Обнинск, 25–29 сентября 2026.",
      program: [
        {
          section: "Программа",
          items: [
            row("Партенопа", "Паоло Соррентино", 2024, "Обнинск", "5411300", COVER_ITALIAN, "2026-09-25T19:00:00+03:00"),
            row("Я — капитан", "Маттео Гарроне", 2023, "Обнинск", "4541881", COVER_SIB, "2026-09-27T18:00:00+03:00"),
            row("Ещё одна жизнь", "Эмануэле Криалезе", 2023, "Обнинск", "4542093", COVER_FLAH, "2026-09-29T18:00:00+03:00"),
          ],
        },
      ],
    },
    {
      id: "eurasia-doc-2026",
      slug: "eurasia-doc-2026",
      title: "Евразия.DOC",
      cover: COVER_KARO,
      city: "Смоленск",
      online: false,
      starts_at: "2026-09-28",
      ends_at: "2026-10-04",
      official_url: "https://eurasiadoc.ru/",
      collection_code: "",
      description: "Фестиваль документального кино. Смоленск, с 28 сентября 2026.",
      program: [
        {
          section: "Конкурс",
          items: [
            row("История бетона", "Джон Уилсон", 2025, "Смоленск", "movie-1596296", COVER_FLAH, "2026-09-28T18:00:00+03:00"),
            row("Овсянка для чемпионов", "Константин Коста", 2025, "Смоленск", "11979853", COVER_BEAT, "2026-09-30T19:00:00+03:00"),
            row("Биостанция Анива: дело длинной воли", "Александр Фёдоров", 2025, "Смоленск", "12587600", COVER_ITALIAN, "2026-10-02T18:00:00+03:00"),
          ],
        },
      ],
    },
    {
      id: "karofilmart-2026",
      slug: "karofilmart-2026",
      title: "Каро Арт",
      cover: COVER_KARO,
      city: "Москва",
      online: false,
      starts_at: "2026-10-14",
      ends_at: "2026-10-25",
      official_url: "https://www.instagram.com/karofilmart/",
      collection_code: "",
      description: "Программа Каро Арт: спектакли и кинопоказы. Москва, 14–25 октября 2026.",
      program: [
        {
          section: "Театральная программа",
          items: [
            row("Скасска", "Арсений Мещеряков", 2025, "Театр Старый дом", "", COVER_KARO, "2026-10-14T19:00:00+03:00"),
            row("Маскарад", "Анатолий Васильев", 1993, "Comédie-Française", "", COVER_VENICE, "2026-10-16T19:00:00+03:00"),
            row("Отелло", "Эймунтас Някрошюс", 2009, "Meno fortas", "", COVER_ITALIAN, "2026-10-18T19:00:00+03:00"),
            row("Безумный день в Комеди Франсез", "Мартин Дарондо, Бертран Юскла", 2026, "Москва", "", COVER_BEAT, "2026-10-21T18:00:00+03:00"),
            row("Юрий Бутусов. Барабаны внутри", "Наталья Пешкова", 2026, "Москва", "", COVER_KARO, "2026-10-23T19:30:00+03:00"),
            row("Конкурс короткометражного кино МХТ имени А. П. Чехова", "", "2025 / 2026", "МХТ имени А. П. Чехова", "", COVER_VENICE, "2026-10-25T16:00:00+03:00"),
          ],
        },
      ],
    },
    {
      id: "message-to-man-2026",
      slug: "message-to-man-2026",
      title: "Послание к человеку",
      cover: COVER_MSG,
      city: "Санкт-Петербург",
      online: false,
      starts_at: "2026-10-16",
      ends_at: "2026-10-24",
      official_url: "https://message2man.com/",
      collection_code: "",
      description: "Международный фестиваль документального, короткометражного и анимационного кино. Санкт-Петербург, 16–24 октября 2026.",
      program: [
        {
          section: "Документальный конкурс",
          items: [
            row("Твигги", "Сэди Фрост", 2024, "Родина", "movie-1049286", COVER_BEAT, "2026-10-16T19:00:00+03:00"),
            row("Боуи: последняя глава", "Джонатан Стиасни", 2025, "Родина", "movie-1571485", COVER_VENICE, "2026-10-18T18:00:00+03:00"),
            row("Лучшее лето", "Тамра Дэвис", 2025, "Родина", "movie-1596324", COVER_SIB, "2026-10-21T19:00:00+03:00"),
            row("Сделано в Милане", "Джон Маджо", 2024, "Родина", "movie-1660825", COVER_ITALIAN, "2026-10-23T18:30:00+03:00"),
          ],
        },
      ],
    },
    {
      id: "beatfilm-2026",
      slug: "beatfilm-2026",
      title: "Beat Weekend",
      cover: COVER_BEAT,
      city: "18 городов",
      online: true,
      starts_at: "2026-09-10",
      ends_at: "2026-09-20",
      official_url: "https://beatfilmfestival.ru/news/beat-weekend-2026-daty-goroda-i-programmu",
      collection_code: "beatfilm-2026",
      description: "Документальный фестиваль о новой культуре. 10–20 сентября 2026, 18 городов и онлайн. Не путать с июньским Beat Film Festival.",
      program: [
        {
          section: "Открытие и мода",
          items: [
            row("Твигги", "Сэди Фрост", 2024, "Москва", "movie-1049286", COVER_BEAT, "2026-09-10T19:00:00+03:00"),
            row("Сделано в Милане", "Джон Маджо", 2024, "Пионер", "movie-1660825", COVER_ITALIAN, "2026-09-12T18:00:00+03:00"),
          ],
        },
        {
          section: "Музыка",
          items: [
            row("Боуи: последняя глава", "Джонатан Стиасни", 2025, "Москва", "movie-1571485", COVER_VENICE, "2026-09-14T19:00:00+03:00"),
            row("Канье Уэст: во имя кого?", "Нико Бальестерос", 2025, "Москва", "movie-1381066", COVER_KARO, "2026-09-16T19:00:00+03:00"),
            row("Лучшее лето", "Тамра Дэвис", 2025, "Москва", "movie-1596324", COVER_SIB, "2026-09-18T18:00:00+03:00"),
          ],
        },
      ],
    },
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
      description: "Три дня итальянского кино в музее-усадьбе Архангельское.",
      program: [
        {
          section: "Основная программа",
          items: [
            row("Партенопа", "Паоло Соррентино", 2024, "Архангельское", "5411300", COVER_ITALIAN, "2026-08-28T19:00:00+03:00"),
            row("Я — капитан", "Маттео Гарроне", 2023, "Архангельское", "4541881", COVER_SIB, "2026-08-29T19:00:00+03:00"),
            row("Сделано в Милане", "Джон Маджо", 2024, "Архангельское", "movie-1660825", COVER_BEAT, "2026-08-30T20:30:00+03:00"),
          ],
        },
      ],
    },
  ];

  var NEWS = [
    { id: "n-sib-open", festival_id: "siberia-meetings-2026", title: "«Встречи в Сибири» открылись в Новосибирске", cover: COVER_SIB, published_at: "2026-09-21" },
    { id: "n-flah", festival_id: "flahertiana-2026", title: "Флаэртиана: программа Перми с 25 сентября", cover: COVER_FLAH, published_at: "2026-09-20" },
    { id: "n-beat-close", festival_id: "beatfilm-2026", title: "Beat Weekend закрылся в 18 городах", cover: COVER_BEAT, published_at: "2026-09-20" },
    { id: "n-karo", festival_id: "karofilmart-2026", title: "Каро Арт: афиша 14–25 октября", cover: COVER_KARO, published_at: "2026-09-18" },
  ];

  var APPEARANCES = {
    "11979853": [
      { festival_id: "siberia-meetings-2026", year: 2026, section: "Основной конкурс" },
      { festival_id: "eurasia-doc-2026", year: 2026, section: "Конкурс" },
    ],
    "12587600": [
      { festival_id: "siberia-meetings-2026", year: 2026, section: "Основной конкурс" },
      { festival_id: "eurasia-doc-2026", year: 2026, section: "Конкурс" },
    ],
    "movie-1596296": [
      { festival_id: "siberia-meetings-2026", year: 2026, section: "Основной конкурс" },
      { festival_id: "eurasia-doc-2026", year: 2026, section: "Конкурс" },
    ],
    "movie-1049286": [
      { festival_id: "flahertiana-2026", year: 2026, section: "Международный конкурс" },
      { festival_id: "beatfilm-2026", year: 2026, section: "Открытие и мода" },
      { festival_id: "message-to-man-2026", year: 2026, section: "Документальный конкурс" },
    ],
    "movie-1660825": [
      { festival_id: "flahertiana-2026", year: 2026, section: "Международный конкурс" },
      { festival_id: "beatfilm-2026", year: 2026, section: "Открытие и мода" },
      { festival_id: "italian-stories-2026", year: 2026, section: "Основная программа" },
      { festival_id: "message-to-man-2026", year: 2026, section: "Документальный конкурс" },
    ],
    "movie-1571485": [
      { festival_id: "flahertiana-2026", year: 2026, section: "Международный конкурс" },
      { festival_id: "beatfilm-2026", year: 2026, section: "Музыка" },
      { festival_id: "message-to-man-2026", year: 2026, section: "Документальный конкурс" },
    ],
    "movie-1381066": [
      { festival_id: "flahertiana-2026", year: 2026, section: "Международный конкурс" },
      { festival_id: "beatfilm-2026", year: 2026, section: "Музыка" },
    ],
    "movie-1596324": [
      { festival_id: "siberia-meetings-2026", year: 2026, section: "Основной конкурс" },
      { festival_id: "beatfilm-2026", year: 2026, section: "Музыка" },
      { festival_id: "message-to-man-2026", year: 2026, section: "Документальный конкурс" },
    ],
    "5411300": [
      { festival_id: "sretensky-vstrecha-2026", year: 2026, section: "Программа" },
      { festival_id: "italian-stories-2026", year: 2026, section: "Основная программа" },
    ],
    "4541881": [
      { festival_id: "sretensky-vstrecha-2026", year: 2026, section: "Программа" },
      { festival_id: "italian-stories-2026", year: 2026, section: "Основная программа" },
    ],
    "4542093": [{ festival_id: "sretensky-vstrecha-2026", year: 2026, section: "Программа" }],
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

  function formatDayLabel(iso) {
    var d = new Date(parseDay(iso));
    if (!iso || isNaN(d.getTime())) return "Без даты";
    var months = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    return d.getDate() + " " + months[d.getMonth()];
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

  function scheduleCarousel(now) {
    var live = [];
    var upcoming = [];
    var past = [];
    listFestivals(now).forEach(function (f) {
      if (f.status === "live") live.push(f);
      else if (f.status === "upcoming") upcoming.push(f);
      else past.push(f);
    });
    live.sort(function (a, b) { return parseDay(a.starts_at) - parseDay(b.starts_at); });
    upcoming.sort(function (a, b) { return parseDay(a.starts_at) - parseDay(b.starts_at); });
    past.sort(function (a, b) { return parseDay(b.ends_at) - parseDay(a.ends_at); });
    return live.concat(upcoming, past);
  }

  function scheduleGroups(now) {
    var items = scheduleCarousel(now);
    return {
      live: items.filter(function (f) { return f.status === "live"; }),
      upcoming: items.filter(function (f) { return f.status === "upcoming" || f.status === "live"; }),
      past: items.filter(function (f) { return f.status === "past"; }),
    };
  }

  function programDays(fest) {
    var map = {};
    ((fest && fest.program) || []).forEach(function (sec) {
      (sec.items || []).forEach(function (it) {
        var day = String((it && it.screening_at) || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) day = "";
        if (!map[day]) map[day] = [];
        map[day].push({
          title: it.title,
          director: it.director,
          year: it.year,
          venue: it.venue,
          kp_id: it.kp_id,
          poster: it.poster,
          screening_at: it.screening_at,
          section: sec.section || "",
        });
      });
    });
    var keys = Object.keys(map).sort();
    return keys.map(function (day) {
      return {
        day: day,
        label: day ? formatDayLabel(day) : "Без даты",
        items: map[day],
      };
    });
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

  function newsForFestival(slug) {
    var key = String(slug || "").trim();
    return newsFeed().filter(function (n) {
      return n.festival_slug === key || n.festival_id === key;
    });
  }

  function normalizeKp(kp) {
    return String(kp || "").trim();
  }

  function appearancesForKp(kp, now) {
    var key = normalizeKp(kp);
    var rows = APPEARANCES[key] || [];
    return rows.map(function (row) {
      var fest = getFestival(row.festival_id, now);
      return {
        festival_id: row.festival_id,
        slug: fest ? fest.slug : row.festival_id,
        title: fest ? fest.title : row.festival_id,
        year: row.year,
        section: row.section || "",
        cover: fest ? fest.cover : "",
        status: fest ? fest.status : "",
        status_label: fest ? fest.status_label : "",
      };
    });
  }

  function kpItems(fest) {
    var out = [];
    ((fest && fest.program) || []).forEach(function (sec) {
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
    scheduleCarousel: scheduleCarousel,
    scheduleGroups: scheduleGroups,
    programDays: programDays,
    newsFeed: newsFeed,
    newsForFestival: newsForFestival,
    appearancesForKp: appearancesForKp,
    kpItems: kpItems,
  };
})(typeof window !== "undefined" ? window : globalThis);
