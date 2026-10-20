// Add a place: a visitor's place, checked, saved as waiting for Alex's approval. Nothing about the
// sender is kept but a keyed hash of their connection and the day (emptied after 30 days), to
// stop spam.
import { checkNewPlace } from '../src/domain/submission.ts';
import { connectionOf, KEEP_SENDER_DAYS, passedBotCheck, senderKey } from './guard.ts';
import { fromThisSite, json, jsonBody, problem } from './http.ts';
import { mailLater } from './mail.ts';

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
  const { botCheck, ...fields } = body as Record<string, unknown>;
  const checked = checkNewPlace(fields);
  if ('problems' in checked) return json({ error: 'problems', problems: checked.problems }, 400);
  const ip = connectionOf(request);
  if (!(await passedBotCheck(botCheck, ip, env.TURNSTILE_SECRET))) return problem(403, 'bot-check');

  const now = new Date();
  const sender = await senderKey(ip, now.toISOString().slice(0, 10), env.TURNSTILE_SECRET);
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
        (created_at, name, housenumber, street, city, province, postcode, lat, lon, placed_by, phone, website, sender)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ),
    env.DB.prepare("UPDATE submissions SET sender = '' WHERE sender != '' AND created_at < ?").bind(
      monthAgo,
    ),
  ]);
  mailLater(env, ctx, inserted?.meta.last_row_id ?? 0, place);
  return json({ ok: true }, 201);
}
