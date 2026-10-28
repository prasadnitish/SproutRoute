/**
 * Trend score for a venue.
 *   velocity of a post = (likes + 2*comments + views/50) / hours since posting (at least 1 hour)
 *   score = sum of velocities x (1 + ln(distinct authors)) x week-over-week factor (0.5 to 2)
 * A venue with no new posts has its score halved each week.
 */
const clampNonNegative = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

export function postVelocity(post, now = Date.now()) {
  const posted = Date.parse(post.timestamp);
  if (!Number.isFinite(posted)) return 0;
  const hours = Math.max(1, (now - posted) / 3600000);
  const engagement = clampNonNegative(post.likes) + 2 * clampNonNegative(post.comments) + clampNonNegative(post.views) / 50;
  return engagement / hours;
}

export function scoreVenue(posts, { now = Date.now(), previousWeekVelocity = null } = {}) {
  const velocitySum = posts.reduce((sum, post) => sum + postVelocity(post, now), 0);
  const authors = new Set(posts.map((post) => post.author).filter(Boolean));
  const uniqueAuthors = posts.length ? Math.max(1, authors.size) : 0;
  const authorWeight = uniqueAuthors ? 1 + Math.log(uniqueAuthors) : 0;
  const momentum = previousWeekVelocity === null || previousWeekVelocity === undefined
    ? 1
    : Math.min(2, Math.max(0.5, velocitySum / Math.max(previousWeekVelocity, 1e-6)));
  const score = velocitySum * authorWeight * momentum;
  return {
    score: Number.isFinite(score) ? Math.round(score * 1e4) / 1e4 : 0,
    velocitySum: Math.round(velocitySum * 1e4) / 1e4,
    uniqueAuthors,
    posts: posts.length,
  };
}

export function applyWeeklyDecay(score, weeksWithoutPosts) {
  return Math.round(clampNonNegative(score) * 0.5 ** Math.max(0, weeksWithoutPosts) * 1e4) / 1e4;
}
