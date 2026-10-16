// Ratings: 1 to 5 stars per place, shown at once to everyone, no approval (Alex, 2026-10-16).
// Written reviews are switched off (REVIEWS_ON): checkRating refuses a comment until then.
import {
  checkRating,
  isPlaceId,
  REVIEWS_ON,
  type RatingTotal,
  type Review,
} from '../src/domain/ratings.ts';
import { connectionOf, KEEP_SENDER_DAYS, passedBotCheck, senderKey } from './guard.ts';
import { fromThisSite, json, jsonBody, problem } from './http.ts';

/** Ratings one connection may send in an hour. */
const PER_HOUR = 30;
/** How long the map's totals may be kept by Cloudflare and browsers, in seconds. */
const TOTALS_KEPT = 60;

/** Every rated place's count and stars added up, for the cards: one row per place. */
export async function ratingTotals(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache = caches.default;
  const kept = await cache.match(request);
  if (kept) return kept;
  const { results } = await env.DB.prepare(
    'SELECT place, count, total FROM rating_totals WHERE count > 0',
  ).all<RatingTotal & { place: string }>();
  const totals = Object.fromEntries(
    results.map(({ place, count, total }) => [place, { count, total }]),
  );
  const response = json({ totals }, 200, TOTALS_KEPT);
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

/**
 * A rating, sent or changed: one per place for each rater (the browser's random ID); another
 * browser on the same connection can't rate the same place again that day. The place's new total
 * comes back for its card.
 */
export async function rate(request: Request, env: Env): Promise<Response> {
  if (!fromThisSite(request)) return problem(403, 'other-site');
  const body = await jsonBody(request, 4 * 1024);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return problem(400, 'not-a-rating');
  const { botCheck, ...fields } = body as Record<string, unknown>;
  const checked = checkRating(fields);
  if ('problems' in checked) return json({ error: 'problems', problems: checked.problems }, 400);
  const ip = connectionOf(request);
  if (!(await passedBotCheck(botCheck, ip, env.TURNSTILE_SECRET))) return problem(403, 'bot-check');

  const { rating } = checked;
  const now = new Date();
  const sender = await senderKey(ip, now.toISOString().slice(0, 10), env.TURNSTILE_SECRET);
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const [recent, twin] = await env.DB.batch<{ n: number }>([
    env.DB.prepare('SELECT COUNT(*) AS n FROM ratings WHERE sender = ? AND updated_at > ?').bind(
      sender,
      hourAgo,
    ),
    env.DB.prepare(
      'SELECT COUNT(*) AS n FROM ratings WHERE place = ? AND sender = ? AND rater != ?',
    ).bind(rating.place, sender, rating.rater),
  ]);
  if ((recent?.results[0]?.n ?? 0) >= PER_HOUR) return problem(429, 'too-many');
  if ((twin?.results[0]?.n ?? 0) > 0) return problem(409, 'already-rated');

  const at = now.toISOString();
  const monthAgo = new Date(now.getTime() - KEEP_SENDER_DAYS * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO ratings (place, rater, stars, comment, created_at, updated_at, sender)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (place, rater) DO UPDATE SET
          stars = excluded.stars, comment = excluded.comment,
          updated_at = excluded.updated_at, sender = excluded.sender`,
    ).bind(rating.place, rating.rater, rating.stars, rating.comment, at, at, sender),
    env.DB.prepare(
      `INSERT OR REPLACE INTO rating_totals (place, count, total)
        SELECT ?, COUNT(*), COALESCE(SUM(stars), 0) FROM ratings WHERE place = ? AND hidden = 0`,
    ).bind(rating.place, rating.place),
    env.DB.prepare("UPDATE ratings SET sender = '' WHERE sender != '' AND updated_at < ?").bind(
      monthAgo,
    ),
  ]);
  const total = await env.DB.prepare('SELECT count, total FROM rating_totals WHERE place = ?')
    .bind(rating.place)
    .first<RatingTotal>();
  return json({ total: total ?? { count: 0, total: 0 } });
}

/** A place's latest written reviews, once reviews are switched on; not found until then. */
export async function placeReviews(request: Request, env: Env): Promise<Response> {
  if (!REVIEWS_ON) return problem(404, 'not-found');
  const place = new URL(request.url).searchParams.get('place') ?? '';
  if (!isPlaceId(place)) return problem(400, 'not-a-place');
  const { results } = await env.DB.prepare(
    `SELECT stars, comment, updated_at FROM ratings
      WHERE place = ? AND hidden = 0 AND comment != ''
      ORDER BY updated_at DESC LIMIT 20`,
  )
    .bind(place)
    .all<{ stars: number; comment: string; updated_at: string }>();
  const reviews: Review[] = results.map(({ stars, comment, updated_at }) => ({
    stars,
    comment,
    date: updated_at.slice(0, 10),
  }));
  return json({ reviews }, 200, TOTALS_KEPT);
}
