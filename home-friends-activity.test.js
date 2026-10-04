/**
 * Home «Активность друзей»: one reaction row and a single section frame.
 * Run: node home-friends-activity.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assert failed');
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const cabinetSrc = fs.readFileSync(path.join(__dirname, 'cabinet-app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(__dirname, 'style-v2.css'), 'utf8');
const indexSrc = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert(indexSrc.includes('id="home-friends-activity-root"'), 'home has a friends activity mount');

const start = cabinetSrc.indexOf('  const HOME_FRIEND_REACTION_OPTIONS');
const end = cabinetSrc.indexOf('  function hydrateHomeFriendAvatars', start);
assert(start >= 0 && end > start, 'friend card renderer is present');

const sandbox = {
  escapeHtml,
  avatarInitial: function (name) { return String(name || '?').trim().charAt(0).toUpperCase() || '?'; },
};
vm.runInNewContext(
  cabinetSrc.slice(start, end) + '\nthis.renderHomeFriendActivityCard = renderHomeFriendActivityCard;',
  sandbox,
);

const html = sandbox.renderHomeFriendActivityCard({
  event_type: 'rating',
  activity_key: 'act-1',
  friend_name: 'Лена',
  rating: 7,
  film_title: 'Обитель зла',
  kp_id: 777,
  user_id: 4,
  comments_count: 2,
  reactions: [{ reaction: 'star' }, { reaction: 'fire' }],
});

assert(html.includes('Лена'), 'renders the friend name');
assert(html.includes('оценила на 7/10'), 'uses the feminine verb and rating');
assert(html.includes('Обитель зла'), 'renders the film title');
assert(html.includes('Новое у друзей'), 'renders the activity reason');
assert(html.includes('home-friend-more-btn') && html.includes('>…</button>'), 'shows an ellipsis control after the first reactions');
assert(html.includes('aria-label="Ещё реакции"'), 'names the overflow control');

const popAt = html.indexOf('home-friend-reaction-pop');
const commentAt = html.indexOf('home-friend-comment-btn');
assert(popAt > 0 && commentAt > popAt, 'comment control comes after the reaction menu, on the same social row');
const beforePop = html.slice(0, popAt);
const popAndRest = html.slice(popAt, commentAt);
assert((beforePop.match(/data-home-activity-reaction=/g) || []).length === 3, 'only the first 3 reactions are inline');
assert((popAndRest.match(/data-home-activity-reaction=/g) || []).length === 5, 'the other reactions live in the popover');
assert(html.includes('hidden'), 'the extra reactions start closed');
assert(!html.includes('home-friend-card" style='), 'friend items do not carry an inline frame');

assert(cssSrc.includes('.home-friend-social {\n  display: flex;\n  align-items: center;\n  flex-wrap: nowrap;'), 'reaction row does not wrap');
assert(cssSrc.includes('.home-friend-comment-btn { margin-left: auto; }'), 'comment sits at the right end of the row');
assert(cssSrc.includes('.home-friend-reaction-pop {\n  position: fixed;'), 'extra reactions overlay instead of growing the row');
assert(cssSrc.includes('.home-friend-reaction-pop[hidden] { display: none !important; }'), 'closed menu is not in the layout');
assert(cssSrc.includes('.home-friends-block,\n.home-friends-empty {\n  margin: 0 0 20px;\n  border: 1px solid rgba(255, 255, 255, 0.09);'), 'the section keeps one border');
assert(cssSrc.includes('.home-friends-block .home-friend-card,\n.home-friends-block .home-friend-card--high,\n.home-friends-block .home-friend-card--gap,\n.home-friends-block .home-friend-card--unseen {\n  border: 0;'), 'friend items have no box');

console.log('home-friends-activity.test.js ok');
