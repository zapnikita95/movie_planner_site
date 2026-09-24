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

  function festivalCover(title, subtitle, bg, accent, motif) {
    var words = String(title || "").split("|");
    var lines = words.map(function (word, i) {
      return '<text x="64" y="' + (500 + i * 82) + '" fill="#fff" font-family="Arial,sans-serif" font-size="62" font-weight="800" letter-spacing="-2">' + word + "</text>";
    }).join("");
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">'
      + '<rect width="800" height="1200" fill="' + bg + '"/>'
      + '<circle cx="640" cy="190" r="260" fill="none" stroke="' + accent + '" stroke-width="42" opacity=".95"/>'
      + '<path d="M-80 1020 L760 180 M40 1180 L880 340" stroke="' + accent + '" stroke-width="20" opacity=".8"/>'
      + '<text x="64" y="410" fill="' + accent + '" font-family="Arial,sans-serif" font-size="150" font-weight="900">' + motif + "</text>"
      + lines
      + '<text x="64" y="1090" fill="' + accent + '" font-family="Arial,sans-serif" font-size="25" font-weight="700" letter-spacing="3">' + subtitle + "</text>"
      + "</svg>";
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  var FEST_COVER_SIB = festivalCover("ВСТРЕЧИ|В СИБИРИ", "НОВОСИБИРСК · 2026", "#101827", "#7BE7FF", "СИБ");
  var FEST_COVER_FLAH = festivalCover("ФЛАЭРТИАНА", "ПЕРМЬ · 2026", "#142019", "#B5F23D", "ФЛА");
  var FEST_COVER_SRETENIE = festivalCover("СРЕТЕНСКИЙ|ВСТРЕЧА", "ОБНИНСК · 2026", "#321813", "#FFB347", "ВСТ");
  var FEST_COVER_EURASIA = festivalCover("ЕВРАЗИЯ.DOC", "СМОЛЕНСК · 2026", "#101D2F", "#FFD431", "DOC");
  var FEST_COVER_KARO = festivalCover("КАРО АРТ", "МОСКВА · 2026", "#27102E", "#FF4BA6", "АРТ");
  var FEST_COVER_MESSAGE = festivalCover("ПОСЛАНИЕ|К ЧЕЛОВЕКУ", "САНКТ-ПЕТЕРБУРГ · 2026", "#191919", "#FF704D", "M2M");
  var FEST_COVER_BEAT = festivalCover("BEAT|WEEKEND", "18 ГОРОДОВ · 2026", "#181326", "#B389FF", "BW");
  var FEST_COVER_ITALIAN = festivalCover("ИТАЛЬЯНСКИЕ|ИСТОРИИ", "АРХАНГЕЛЬСКОЕ · 2026", "#192819", "#FFDD5C", "IT");
  var FEST_COVER_AFRICA = festivalCover("АФРИКА.|ВМЕСТЕ В БУДУЩЕЕ", "МОСКВА · ПЕТЕРБУРГ · 2026", "#17120D", "#E8B34B", "IV");

  // Festival-owned or organizer-published artwork. The generated covers above
  // remain as a reliable background when an external media host is unavailable.
  var OFFICIAL_ART_SIB = "https://nadvizh.ru/media/events_img/764/X5kZ1nO9RNVftuq4f-6438XsrmK-hd5tJ8mtZ_69-r6VcJWN19bWDoWNjrHE1kKYpaF_vwjB-_gSPLtjb.jpg";
  var OFFICIAL_ART_FLAH = "https://www.proficinema.com/upload/iblock/375/3d3a8u4n3jtvo5mzzd5hfakpmws6dwjx.png";
  var OFFICIAL_ART_SRETENIE = "https://images.weserv.nl/?url=festvstrecha.ru/images/bn-2026-02-18.jpg&w=1200&output=jpg";
  var OFFICIAL_ART_EURASIA = "https://data.vb.kg/image/big/2022-12-06_12-02-16_827409.jpg";
  var OFFICIAL_ART_KARO = "https://spb.hse.ru/data/2022/10/07/1729930238/3%D0%A1%D0%BD%D0%B8%D0%BC%D0%BE%D0%BA%20%D1%8D%D0%BA%D1%80%D0%B0%D0%BD%D0%B0%202022-10-05%20022043%20-%20%D0%9C%D0%B0%D1%80%D0%B8%D1%8F%20%D0%9C%D0%B0%D0%BA%D0%B0%D1%80%D0%BA%D0%B8%D0%BD%D0%B0.png";
  var OFFICIAL_ART_MESSAGE = "https://www.proficinema.com/upload/medialibrary/6b6/mahp00s41zrj4w3r9p7vpzg6zf98i0bl.png";
  var OFFICIAL_ART_BEAT = "https://images.weserv.nl/?url=design.hse.ru/system/widget_fields/field_attachments/002/539/768/large_12/Media_Keyvisual_1080x1920-3_.jpg%3F1762760222%3D&w=1200&output=jpg";
  var OFFICIAL_ART_ITALIAN = "https://s3.kinoteatr.ru/upload/movies/1960879/cover.jpg";
  var OFFICIAL_ART_AFRICA = "https://static.tildacdn.com/tild6366-6165-4135-a536-396665663132/noroot.png";
  var OFFICIAL_LOGO_AFRICA = "https://static.tildacdn.com/tild3838-6338-4261-b961-383438366166/africa_logo_ru_new1-.png";

  function row(title, director, year, venue, kp_id, poster, screening_at, description, ticket_url) {
    return {
      title: title,
      director: director || "",
      year: year || "",
      venue: venue || "",
      kp_id: kp_id || "",
      poster: poster || "",
      screening_at: screening_at || "",
      description: description || "",
      ticket_url: ticket_url || "",
    };
  }

  var FESTIVALS = [
    {
      id: "siberia-meetings-2026",
      slug: "siberia-meetings-2026",
      title: "Встречи в Сибири",
      cover: FEST_COVER_SIB,
      official_art: OFFICIAL_ART_SIB,
      city: "Новосибирск",
      online: false,
      starts_at: "2026-09-21",
      ends_at: "2026-09-27",
      official_url: "https://vpobede.ru/news/vstrechi-v-sibiri-perekrestki-kultur-i-pamyat-pokoleniy",
      collection_code: "",
      description: "Документальный фестиваль в Новосибирске. С 21 по 27 сентября 2026.",
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
      cover: FEST_COVER_FLAH,
      official_art: OFFICIAL_ART_FLAH,
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
      cover: FEST_COVER_SRETENIE,
      official_art: OFFICIAL_ART_SRETENIE,
      city: "Обнинск",
      online: false,
      starts_at: "2026-09-25",
      ends_at: "2026-09-29",
      official_url: "https://festvstrecha.ru/",
      collection_code: "",
      description: "Кинофестиваль «Встреча». Обнинск, с 25 по 29 сентября 2026.",
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
      cover: FEST_COVER_EURASIA,
      official_art: OFFICIAL_ART_EURASIA,
      city: "Смоленск",
      online: false,
      starts_at: "2026-09-28",
      ends_at: "2026-10-04",
      official_url: "https://eurasia.film/",
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
      id: "africa-together-2026",
      slug: "africa-together-2026",
      title: "Африка. Вместе в будущее",
      cover: FEST_COVER_AFRICA,
      official_art: OFFICIAL_ART_AFRICA,
      logo: OFFICIAL_LOGO_AFRICA,
      city: "Москва и Санкт-Петербург",
      online: false,
      starts_at: "2026-10-07",
      ends_at: "2026-10-15",
      official_url: "https://african-days.ru/",
      ticket_url: "https://afisha.yandex.ru/moscow/art/places/inzhenernyi-korpus-tretiakovskoi-galerei/schedule/october-2026",
      edition: "IV Международный фестиваль",
      history: "Это четвёртый выпуск. В 2026 году кинопрограмма впервые идёт сразу в Москве и Санкт-Петербурге.",
      venues: ["Третьяковская галерея, Инженерный корпус", "Кинотеатр «Иллюзион»", "Киностудия «Ленфильм»"],
      socials: [
        { label: "Telegram", url: "https://t.me/africanculturefestival", username: "africanculturefestival" },
      ],
      collection_code: "",
      description: "Премьеры современного африканского кино, ретроспектива Усмана Сембена, выставка, лекции и встречи с авторами. С 7 по 15 октября программа пройдёт в Москве, а с 12 по 15 октября — в Санкт-Петербурге.",
      program: [
        {
          section: "Российские премьеры",
          items: [
            row("Дети бога", "Мари-Клементин Дюсабежамбо", 2026, "Третьяковская галерея, Инженерный корпус", "movie-1405200", "/api/public/poster/tmdb/w500/qUBear4cXvzYMEx7WzpUIW8yLJ4.jpg", "2026-10-08T19:00:00+03:00", "Руандийская драма о семье и памяти после геноцида. «Золотая камера» и приз ФИПРЕССИ Каннского кинофестиваля 2026 года.", "https://afisha.yandex.ru/moscow/cinema/deti-boga-kinopokaz-tretiakovka"),
            row("Пророк", "Ике Ланга", 2026, "Третьяковская галерея, Инженерный корпус", "movie-1342236", "/api/public/poster/tmdb/w500/vfxQkI856GJxoOCkt5MuWgWsk8U.jpg", "2026-10-09T19:00:00+03:00", "Чёрно-белый дебют из Мозамбика. Священник теряет веру и обращается к традиционной магии, чтобы вернуть её.", "https://afisha.yandex.ru/moscow/cinema/prorok-kinopokaz-tretiakovka"),
            row("Айша не может улететь", "Морад Мостафа", 2025, "Третьяковская галерея, Инженерный корпус", "movie-1337148", "/api/public/poster/tmdb/w500/no8SXwqDhAVE8SMDILdEqS6qxh8.jpg", "2026-10-13T19:00:00+03:00", "Боди-хоррор о сомалийской мигрантке в Каире. Мировая премьера состоялась в программе «Особый взгляд» Каннского кинофестиваля 2025 года.", "https://afisha.yandex.ru/moscow/cinema/aisha-ne-mozhet-uletet-kinopokaz-tretiakovka"),
          ],
        },
        {
          section: "Классика Африки",
          items: [
            row("Гимба, тиран своей эпохи", "Шейк Умар Сиссоко", 1995, "Третьяковская галерея, Инженерный корпус", "movie-124618", "/api/public/poster/tmdb/w500/d9uQAa2ueKLJU5Nqq7t0gi0ty4a.jpg", "2026-10-11T17:30:00+03:00", "Политическая притча из Мали о восстании против жестокого правителя. Гран-при FESPACO 1995 года.", "https://afisha.yandex.ru/moscow/cinema/gimba-tiran-svoei-epokhi-kinopokaz-tretiakovka"),
          ],
        },
      ],
    },
    {
      id: "karofilmart-2026",
      slug: "karofilmart-2026",
      title: "Каро Арт",
      cover: FEST_COVER_KARO,
      official_art: OFFICIAL_ART_KARO,
      city: "Москва",
      online: false,
      starts_at: "2026-10-14",
      ends_at: "2026-10-25",
      official_url: "https://karoartfestival.ru/",
      collection_code: "",
      description: "Программа Каро Арт: спектакли и кинопоказы. Москва, с 14 по 25 октября 2026.",
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
      cover: FEST_COVER_MESSAGE,
      official_art: OFFICIAL_ART_MESSAGE,
      city: "Санкт-Петербург",
      online: false,
      starts_at: "2026-10-16",
      ends_at: "2026-10-24",
      official_url: "https://message2man.com/",
      collection_code: "",
      description: "Международный фестиваль документального, короткометражного и анимационного кино. Санкт-Петербург, с 16 по 24 октября 2026.",
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
      cover: FEST_COVER_BEAT,
      official_art: OFFICIAL_ART_BEAT,
      city: "18 городов",
      online: true,
      starts_at: "2026-09-10",
      ends_at: "2026-09-20",
      official_url: "https://beatfilmfestival.ru/news/beat-weekend-2026-daty-goroda-i-programmu",
      collection_code: "beatfilm-2026",
      description: "Документальный фестиваль о новой культуре. С 10 по 20 сентября 2026, 18 городов и онлайн. Не путать с июньским Beat Film Festival.",
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
      cover: FEST_COVER_ITALIAN,
      official_art: OFFICIAL_ART_ITALIAN,
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
    { id: "n-africa-2026", festival_id: "africa-together-2026", title: "«Африка. Вместе в будущее» объявила кинопрограмму 2026 года", cover: FEST_COVER_AFRICA, published_at: "2026-09-24" },
    { id: "n-sib-open", festival_id: "siberia-meetings-2026", title: "«Встречи в Сибири» открылись в Новосибирске", cover: FEST_COVER_SIB, published_at: "2026-09-21" },
    { id: "n-flah", festival_id: "flahertiana-2026", title: "Флаэртиана: программа Перми с 25 сентября", cover: FEST_COVER_FLAH, published_at: "2026-09-20" },
    { id: "n-beat-close", festival_id: "beatfilm-2026", title: "Beat Weekend закрылся в 18 городах", cover: FEST_COVER_BEAT, published_at: "2026-09-20" },
    { id: "n-karo", festival_id: "karofilmart-2026", title: "Каро Арт, афиша с 14 октября", cover: FEST_COVER_KARO, published_at: "2026-09-18" },
  ];

  var APPEARANCES = {
    "movie-1405200": [{ festival_id: "africa-together-2026", year: 2026, section: "Российские премьеры" }],
    "movie-1342236": [{ festival_id: "africa-together-2026", year: 2026, section: "Российские премьеры" }],
    "movie-1337148": [{ festival_id: "africa-together-2026", year: 2026, section: "Российские премьеры" }],
    "movie-124618": [{ festival_id: "africa-together-2026", year: 2026, section: "Классика Африки" }],
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
    var months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    function parts(iso) {
      var d = new Date(parseDay(iso));
      if (!iso || isNaN(d.getTime())) return null;
      return { day: d.getDate(), month: d.getMonth(), label: d.getDate() + " " + months[d.getMonth()] };
    }
    var a = parts(start);
    var b = parts(end);
    if (a && b) {
      if (a.month === b.month && a.day !== b.day) return a.day + " по " + b.label;
      if (a.label !== b.label) return a.label + " по " + b.label;
      return a.label;
    }
    return (a && a.label) || (b && b.label) || "";
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
      official_art: fest.official_art || "",
      logo: fest.logo || "",
      city: fest.city,
      online: !!fest.online,
      starts_at: fest.starts_at,
      ends_at: fest.ends_at,
      official_url: fest.official_url,
      ticket_url: fest.ticket_url || "",
      edition: fest.edition || "",
      history: fest.history || "",
      venues: fest.venues || [],
      socials: fest.socials || [],
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

  function teaserList(now) {
    return scheduleCarousel(now).filter(function (f) {
      return f.status === "live" || f.status === "upcoming";
    }).slice(0, 6);
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
          description: it.description || "",
          ticket_url: it.ticket_url || "",
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
    teaserList: teaserList,
    scheduleGroups: scheduleGroups,
    programDays: programDays,
    newsFeed: newsFeed,
    newsForFestival: newsForFestival,
    appearancesForKp: appearancesForKp,
    kpItems: kpItems,
  };
})(typeof window !== "undefined" ? window : globalThis);
