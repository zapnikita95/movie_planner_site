/**
 * Shared poster rating circle rule (KP vs IMDb by vote count).
 * Prefer KP if rating_kp present AND (rating_kp_votes null/unknown OR >= 1000).
 * Else if rating_imdb present AND rating_imdb_votes > (rating_kp_votes or 0), use IMDb.
 * Else if only one source exists, use that.
 * Else nothing.
 */
(function (global) {
  'use strict';

  function _score(raw) {
    if (raw == null || raw === '') return null;
    var n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  function _votes(raw) {
    if (raw == null || raw === '') return null;
    var n = parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  function displayPosterRating(film) {
    var out = { value: null, source: null, label: null };
    if (!film || typeof film !== 'object') return out;

    // Prefer server-computed fields when present.
    var prefRaw = film.poster_rating != null ? film.poster_rating : film.display_rating;
    var prefSrc = film.poster_rating_source || film.display_rating_source || null;
    if (prefRaw != null && prefSrc) {
      var pref = _score(prefRaw);
      if (pref != null) {
        out.value = Math.round(pref * 10) / 10;
        out.source = String(prefSrc);
        out.label = out.value.toFixed(1);
        return out;
      }
    }

    var kp = _score(film.rating_kp != null ? film.rating_kp : film.rating);
    var imdb = _score(film.rating_imdb);
    var kpVotes = _votes(film.rating_kp_votes);
    var imdbVotes = _votes(film.rating_imdb_votes);

    if (kp != null && (kpVotes == null || kpVotes >= 1000)) {
      out.value = Math.round(kp * 10) / 10;
      out.source = 'kp';
      out.label = out.value.toFixed(1);
      return out;
    }
    if (imdb != null && (imdbVotes || 0) > (kpVotes || 0)) {
      out.value = Math.round(imdb * 10) / 10;
      out.source = 'imdb';
      out.label = out.value.toFixed(1);
      return out;
    }
    if (kp != null && imdb == null) {
      out.value = Math.round(kp * 10) / 10;
      out.source = 'kp';
      out.label = out.value.toFixed(1);
      return out;
    }
    if (imdb != null && kp == null) {
      out.value = Math.round(imdb * 10) / 10;
      out.source = 'imdb';
      out.label = out.value.toFixed(1);
      return out;
    }
    return out;
  }

  function ratingBandClass(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 4) return ' poster-kp-rating--low';
    if (n < 5) return ' poster-kp-rating--mid';
    if (n < 7) return ' poster-kp-rating--amber';
    return ' poster-kp-rating--high';
  }

  function sourceTitle(source, label) {
    if (source === 'imdb') return 'Рейтинг IMDb ' + label;
    return 'Рейтинг Кинопоиска ' + label;
  }

  function sourceAria(source, label) {
    if (source === 'imdb') return 'IMDb ' + label;
    return 'КП ' + label;
  }

  function sourceChip(source, label) {
    if (source === 'imdb') return 'IMDb ' + label;
    return 'КП ' + label;
  }

  function posterRatingHtml(film, escFn) {
    var esc = typeof escFn === 'function' ? escFn : function (s) { return String(s || ''); };
    var d = displayPosterRating(film);
    if (d.value == null || !d.label) return '';
    return (
      '<span class="poster-kp-rating' + ratingBandClass(d.value)
      + '" title="' + esc(sourceTitle(d.source, d.label))
      + '" aria-label="' + esc(sourceAria(d.source, d.label))
      + '" data-rating-source="' + esc(d.source || '')
      + '">' + esc(d.label) + '</span>'
    );
  }

  function ratingDataAttrs(film, escFn) {
    var esc = typeof escFn === 'function' ? escFn : function (s) { return String(s || ''); };
    if (!film || typeof film !== 'object') return '';
    var bits = [];
    if (film.rating_kp != null) bits.push(' data-rating-kp="' + esc(String(film.rating_kp)) + '"');
    if (film.rating_imdb != null) bits.push(' data-rating-imdb="' + esc(String(film.rating_imdb)) + '"');
    if (film.rating_kp_votes != null) bits.push(' data-rating-kp-votes="' + esc(String(film.rating_kp_votes)) + '"');
    if (film.rating_imdb_votes != null) bits.push(' data-rating-imdb-votes="' + esc(String(film.rating_imdb_votes)) + '"');
    var d = displayPosterRating(film);
    if (d.value != null) {
      bits.push(' data-display-rating="' + esc(String(d.label || d.value)) + '"');
      bits.push(' data-poster-rating="' + esc(String(d.label || d.value)) + '"');
      if (d.source) {
        bits.push(' data-display-rating-source="' + esc(d.source) + '"');
        bits.push(' data-poster-rating-source="' + esc(d.source) + '"');
      }
    }
    return bits.join('');
  }

  function filmFromTile(tile) {
    if (!tile || !tile.getAttribute) return {};
    function numAttr(name) {
      var raw = tile.getAttribute(name);
      if (raw == null || raw === '') return null;
      var n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    return {
      rating_kp: numAttr('data-rating-kp'),
      rating_imdb: numAttr('data-rating-imdb'),
      rating_kp_votes: numAttr('data-rating-kp-votes'),
      rating_imdb_votes: numAttr('data-rating-imdb-votes'),
      poster_rating: numAttr('data-poster-rating') != null ? numAttr('data-poster-rating') : numAttr('data-display-rating'),
      poster_rating_source: tile.getAttribute('data-poster-rating-source') || tile.getAttribute('data-display-rating-source') || null,
    };
  }

  global.MpPosterRating = {
    displayPosterRating: displayPosterRating,
    ratingBandClass: ratingBandClass,
    posterRatingHtml: posterRatingHtml,
    ratingDataAttrs: ratingDataAttrs,
    sourceChip: sourceChip,
    sourceTitle: sourceTitle,
    sourceAria: sourceAria,
    filmFromTile: filmFromTile,
  };
})(typeof window !== 'undefined' ? window : globalThis);
