/**
 * Центрированный спиннер загрузки страниц (кабинет, /u/, /s/).
 */
(function (global) {
  'use strict';

  function pageLoadingHtml() {
    return (
      '<div class="mp-page-loading" role="status" aria-live="polite" aria-busy="true" aria-label="Загрузка">' +
        '<div class="mp-page-loading-spinner" aria-hidden="true"></div>' +
      '</div>'
    );
  }

  global.MpPageLoading = { html: pageLoadingHtml, pageLoadingHtml: pageLoadingHtml };
})(typeof window !== 'undefined' ? window : this);
