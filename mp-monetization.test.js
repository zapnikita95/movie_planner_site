/**
 * Node unit tests for ticket-partner parsing in mp-monetization.js
 * Run: node mp-monetization.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'mp-monetization.js'), 'utf8');
const sandbox = {
  window: { matchMedia: function () { return { matches: false }; } },
  document: {
    body: { classList: { contains: function () { return false; } }, appendChild: function () {} },
    createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {} }; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    addEventListener: function () {},
    head: { appendChild: function () {} },
  },
  location: { origin: 'https://movie-planner.ru' },
  fetch: function () { return Promise.reject(new Error('no fetch in unit test')); },
  console: console,
};
sandbox.window.document = sandbox.document;
sandbox.window.location = sandbox.location;
sandbox.window.fetch = sandbox.fetch;
vm.runInNewContext(src, sandbox);

const api = sandbox.window.MpMonetization || sandbox.MpMonetization;
if (!api) throw new Error('MpMonetization missing');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

assert(api.normalizeTicketPartnerKey('tinkoff') === 't_afisha', 'tinkoff → t_afisha');
assert(api.normalizeTicketPartnerKey('T-Bank Afisha') === 't_afisha', 'T-Bank Afisha → t_afisha');
assert(api.normalizeTicketPartnerKey('tbank-afisha') === 't_afisha', 'tbank-afisha → t_afisha');
assert(api.normalizeTicketPartnerKey('ticket_land') === 'ticketland', 'ticket_land → ticketland');
assert(api.normalizeTicketPartnerKey('flex') === 'flex', 'unknown key stays');

const liveEmpty = { city: 'moscow', kp_id: 435, partners: [] };
assert(api.extractTicketPartnersPayload(liveEmpty).length === 0, 'live empty partners');
assert(api.collectTicketPartners(api.extractTicketPartnersPayload(liveEmpty)).length === 0, 'empty stays empty');

const altShape = {
  data: {
    partners: [
      { key: 'tinkoff', href: 'https://afisha.tbank.ru/x' },
      { partner: 'ticketland', link: 'https://www.ticketland.ru/y' },
      { key: 'flex', url: 'https://flex.ru' },
    ],
  },
};
const fromAlt = api.collectTicketPartners(api.extractTicketPartnersPayload(altShape));
assert(fromAlt.length === 2, 'alt shape keeps ticket partners only');
assert(fromAlt[0].key === 't_afisha' && fromAlt[0].url.indexOf('tbank') >= 0, 't_afisha first + url from href');
assert(fromAlt[1].key === 'ticketland' && fromAlt[1].url.indexOf('ticketland') >= 0, 'ticketland url from link');

const dupes = api.collectTicketPartners([
  { key: 't_afisha', url: 'https://a.example/1' },
  { key: 'tinkoff_afisha', url: 'https://a.example/2' },
  { key: 'ticketland', url: 'https://t.example/1' },
]);
assert(dupes.length === 2, 'dedupe by normalized key');
assert(dupes[0].url === 'https://a.example/1', 'first t_afisha wins');

const noUrl = api.collectTicketPartners([{ key: 't_afisha' }, { key: 'ticketland', url: '' }]);
assert(noUrl.length === 0, 'drop partners without url');

const srcText = src;
assert(srcText.indexOf('TICKET_FETCH_MS = 2500') >= 0, 'short ticket timeout');
assert(srcText.indexOf('fetchTicketPartnersOnce') >= 0, 'retry helper present');
assert(srcText.indexOf('if (opts.isSeries) return Promise.resolve()') < 0, 'do not skip tickets on series');
assert(srcText.indexOf('mountPosterTicketCtas') >= 0 && srcText.indexOf('mountToolbarTicketBtns') >= 0, 'both surfaces');

const cfgSrc = fs.readFileSync(path.join(__dirname, 'mp-api-config.js'), 'utf8');
assert(cfgSrc.indexOf('ensureMpMonetization') >= 0, 'cabinet can lazy-load monetization');
assert(cfgSrc.indexOf('initFilmMonetization') >= 0, 'shared film monetization entry');

const filmSrc = fs.readFileSync(path.join(__dirname, 'film-page.js'), 'utf8');
assert(filmSrc.indexOf('function initFilmMonetization') >= 0, 'guest film page loads tickets even if script is late');

const cabSrc = fs.readFileSync(path.join(__dirname, 'cabinet-app.js'), 'utf8');
assert(cabSrc.indexOf('function initFilmMonetization') >= 0, 'cabinet SPA loads tickets without waiting for /f/ bundle');
assert((cabSrc.match(/initFilmMonetization\(/g) || []).length >= 6, 'cabinet film paints remount tickets');

console.log('mp-monetization.test.js: OK');
