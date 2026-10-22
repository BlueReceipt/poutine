// Add a place: a visitor's place, checked, saved as waiting for Alex's approval, or listed at once
// when a second visitor on the spot confirms it (src/domain/onTheSpot.ts). Nothing about the
// sender is kept but keyed hashes of their connection (with the day, and without it) and of their
// browser's random ID, all emptied after 30 days: to stop spam, and to tell two people from one.
import { confirmedSend, filledFrom, waitsForAlex, type SpotSend } from '../src/domain/onTheSpot.ts';
import { isRaterId } from '../src/domain/ratings.ts';
import {
  approvedPlace,
  checkNewPlace,
  newPlaceOfRow,
  SUBMISSION_COLUMNS,
  type NewPlace,
  type SubmissionRow,
} from '../src/domain/submission.ts';
import { ADDED_PATH, approvedPlaces, linkForApproved } from './added.ts';
import {
  connectionKey,
  connectionOf,
  KEEP_SENDER_DAYS,
  passedBotCheck,
  senderKey,
  visitorKey,
} from './guard.ts';
import { fromThisSite, json, jsonBody, problem } from './http.ts';
import { listed } from './list.ts';
import { mailLater, mailSpotLater } from './mail.ts';

/** Places one connection may send in an hour, and places waiting before the form says to wait. */
const PER_HOUR = 5;
const MAX_WAITING = 500;

export async function addPlace(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!fromThisSite(request)) return problem(403, 'other-site');
  const body = await jsonBody(request, 8 * 1024);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return problem(400, 'not-a-place');
  const { botCheck, visitor, ...fields } = body as Record<string, unknown>;
  const checked = checkNewPlace(fields);
  if ('problems' in checked) return json({ error: 'problems', problems: checked.problems }, 400);
  const ip = connectionOf(request);
  if (!(await passedBotCheck(botCheck, ip, env.TURNSTILE_SECRET))) return problem(403, 'bot-check');

  const now = new Date();
  const sender = await senderKey(ip, now.toISOString().slice(0, 10), env.TURNSTILE_SECRET);
  const connection = await connectionKey(ip, env.TURNSTILE_SECRET);
  const browser = isRaterId(visitor) ? await visitorKey(visitor, env.TURNSTILE_SECRET) : '';
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const [recent, waiting] = await env.DB.batch<{ n: number }>([
    env.DB.prepare(
      'SELECT COUNT(*) AS n FROM submissions WHERE sender = ? AND created_at > ?',
    ).bind(sender, hourAgo),
    env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status = 'pending'"),
  ]);
  if ((recent?.results[0]?.n ?? 0) >= PER_HOUR) return problem(429, 'too-many');
  if ((waiting?.results[0]?.n ?? 0) >= MAX_WAITING) return problem(503, 'queue-full');

  const place = checked.place;
  const monthAgo = new Date(now.getTime() - KEEP_SENDER_DAYS * 86_400_000).toISOString();
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO submissions
        (created_at, name, housenumber, street, city, province, postcode, lat, lon, placed_by, phone,
          website, sender, visitor, connection)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      now.toISOString(),
      place.name,
      place.housenumber,
      place.street,
      place.city,
      place.province,
      place.postcode,
      place.lat,
      place.lon,
      place.placedBy,
      place.phone,
      place.website,
      sender,
      browser,
      connection,
    ),
    env.DB.prepare(
      `UPDATE submissions SET sender = '', visitor = '', connection = ''
        WHERE created_at < ? AND (sender != '' OR visitor != '' OR connection != '')`,
    ).bind(monthAgo),
  ]);
  const id = inserted?.meta.last_row_id ?? 0;
  const sent: SpotSend = {
    id,
    createdAt: now.toISOString(),
    name: place.name,
    lat: place.lat,
    lon: place.lon,
    placedBy: place.placedBy,
    visitor: browser,
    connection,
  };
  const listedNow = await approveOnTheSpot(request, env, ctx, sent, place, now);
  if (listedNow) mailSpotLater(env, ctx, listedNow.first, id, listedNow.place);
  else mailLater(env, ctx, id, place);
  return json({ ok: true }, 201);
}

/** About 220 m of latitude and longitude: the earlier sends worth a look, by box before by metres. */
const NEAR_DEGREES = 0.002;
const NEAR_LON_DEGREES = 0.003;

/**
 * A second visitor on the spot: when this send confirms an earlier one waiting (onTheSpot.ts), the
 * earlier is approved with what this one adds, given its short link, and this one kept as its echo.
 * A place that looks like one already on the map, or names a chain, still waits for Alex.
 */
async function approveOnTheSpot(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  sent: SpotSend,
  place: NewPlace,
  now: Date,
): Promise<{ first: number; place: NewPlace } | null> {
  if (sent.placedBy !== 'me' || !sent.visitor) return null;
  const since = new Date(now.getTime() - KEEP_SENDER_DAYS * 86_400_000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT ${SUBMISSION_COLUMNS}, visitor, connection FROM submissions
      WHERE status = 'pending' AND placed_by = 'me' AND id != ? AND created_at >= ?
        AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`,
  )
    .bind(
      sent.id,
      since,
      sent.lat - NEAR_DEGREES,
      sent.lat + NEAR_DEGREES,
      sent.lon - NEAR_LON_DEGREES,
      sent.lon + NEAR_LON_DEGREES,
    )
    .all<SubmissionRow & { visitor: string; connection: string }>();
  const earlier = results.map((row): SpotSend => ({
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    lat: row.lat,
    lon: row.lon,
    placedBy: row.placed_by,
    visitor: row.visitor,
    connection: row.connection,
  }));
  const confirmed = confirmedSend(sent, earlier, now);
  const row = confirmed && results.find((each) => each.id === confirmed.id);
  if (!row) return null;
  const filled = filledFrom(newPlaceOfRow(row), place);
  const others = await approvedPlaces(env);
  if (waitsForAlex(filled, [...listed, ...others])) return null;
  const link = linkForApproved(approvedPlace(row.id, filled), others);
  const at = now.toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE submissions SET housenumber = ?, street = ?, postcode = ?, phone = ?, website = ?,
        status = 'approved', reviewed_at = ?, link = ?, approved_by = 'visitors'
        WHERE id = ? AND status = 'pending'`,
    ).bind(
      filled.housenumber,
      filled.street,
      filled.postcode,
      filled.phone,
      filled.website,
      at,
      link,
      row.id,
    ),
    env.DB.prepare(
      "UPDATE submissions SET status = 'echo', reviewed_at = ?, echo_of = ? WHERE id = ?",
    ).bind(at, row.id, sent.id),
  ]);
  // The map asks for the approved places again rather than wait out the minute they're kept.
  ctx.waitUntil(caches.default.delete(new Request(new URL(ADDED_PATH, request.url))));
  return { first: row.id, place: filled };
}
