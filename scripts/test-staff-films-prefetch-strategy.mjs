#!/usr/bin/env node
/**
 * Frontend strategy check for /s/ filmography after sort:
 * paint first page fast, then quietly page the remainder — top must stay stable.
 *
 * Usage: node scripts/test-staff-films-prefetch-strategy.mjs
 */
const BASE = process.env.MP_BASE_URL || 'https://movie-planner.ru';
const PERSON = process.env.MP_PERSON_ID || '25584';

async function fetchFilms({ sort, offset, limit }) {
  const q = new URLSearchParams({
    role: 'ACTOR',
    offset: String(offset),
    limit: String(limit),
  });
  if (sort) q.set('sort', sort);
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/public/person/${PERSON}/films?${q}`);
  const ms = performance.now() - t0;
  if (!res.ok) throw new Error(`http_${res.status}`);
  const data = await res.json();
  return { ms, data };
}

function ratings(films) {
  return (films || []).map((f) => Number(f.rating) || 0);
}

function isMonoDesc(arr) {
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] < arr[i + 1]) return false;
  }
  return true;
}

async function main() {
  const failures = [];

  const oneShot = await fetchFilms({ sort: 'rating_desc', offset: 0, limit: 120 });
  console.log(
    `A one-shot120: ${oneShot.ms.toFixed(0)}ms n=${oneShot.data.films.length} top=${oneShot.data.films[0]?.title}`
  );

  const paint = await fetchFilms({ sort: 'rating_desc', offset: 0, limit: 21 });
  console.log(
    `B paint21: ${paint.ms.toFixed(0)}ms n=${paint.data.films.length} top=${paint.data.films[0]?.title}`
  );
  if (paint.data.films[0]?.kp_id !== oneShot.data.films[0]?.kp_id) {
    failures.push('paint top != one-shot top');
  }

  let merged = paint.data.films.slice();
  let offset = merged.length;
  let bgSum = 0;
  let pages = 0;
  while (offset < (paint.data.total || 0)) {
    const page = await fetchFilms({ sort: 'rating_desc', offset, limit: 21 });
    bgSum += page.ms;
    pages += 1;
    merged = merged.concat(page.data.films || []);
    if (!page.data.has_more) break;
    offset = merged.length;
  }
  console.log(
    `B quiet remainder: ${pages} pages, sum=${bgSum.toFixed(0)}ms, merged=${merged.length}`
  );

  if (!isMonoDesc(ratings(merged))) failures.push('merged ratings not monotonic desc');
  if (merged[0]?.kp_id !== paint.data.films[0]?.kp_id) {
    failures.push('top changed after remainder merge');
  }
  if (merged.length !== (paint.data.total || merged.length)) {
    failures.push(`merged length ${merged.length} != total ${paint.data.total}`);
  }

  const expand = await fetchFilms({ sort: 'rating_desc', offset: 21, limit: 21 });
  const boundaryOk =
    (Number(paint.data.films.at(-1)?.rating) || 0) >= (Number(expand.data.films[0]?.rating) || 0);
  console.log(
    `C expand-on-demand page2: ${expand.ms.toFixed(0)}ms first=${expand.data.films[0]?.title} boundaryOk=${boundaryOk}`
  );
  if (!boundaryOk) failures.push('page2 breaks rating order vs page1');

  const yearSort = await fetchFilms({ sort: 'year_desc', offset: 0, limit: 21 });
  console.log('D year_desc top:', yearSort.data.films[0]?.title, yearSort.data.films[0]?.year);

  console.log('---');
  console.log(
    `Verdict: paint TTI ~${paint.ms.toFixed(0)}ms vs one-shot ~${oneShot.ms.toFixed(0)}ms; ` +
      `top stable=${failures.length === 0}`
  );
  if (failures.length) {
    console.error('FAIL:', failures.join('; '));
    process.exit(1);
  }
  console.log('OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
