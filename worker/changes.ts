// "Add more info" and "Claim this spot" (Alex, 2026-10-20): a visitor's change to a place already
// on the map, or its owner's claim, checked, saved as waiting for Alex's approval (POST
// /api/changes); the changes he approved, laid over the list by the map at once (GET
// /api/changes), until `npm run fold` copies them to data/fixes.json. Nothing about the sender is
// kept but a keyed hash of their connection and the day (emptied after 30 days); an owner's
// contact only until Alex decides.
import { applyFixes, type Fix } from '../src/domain/addressFixes.ts';
import { checkChange } from '../src/domain/changes.ts';
import type { Place } from '../src/domain/osmPlaces.ts';
import { approvedPlaces } from './added.ts';
import { connectionOf, KEEP_SENDER_DAYS, passedBotCheck, senderKey } from './guard.ts';
import { fromThisSite, json, jsonBody, problem } from './http.ts';
import { listed } from './list.ts';
import { mailChangeLater } from './mail.ts';

/** Changes one connection may send in an hour, and changes waiting before the form says to wait. */
const PER_HOUR = 5;
const MAX_WAITING = 500;

/** How long Cloudflare keeps the approved changes, in seconds; each approval empties it. */
const CHANGES_KEPT = 60;

export const CHANGES_PATH = '/api/changes';

/** Every approved change's fix, by place, the latest last (it wins). */
export async function approvedFixes(env: Env): Promise<Record<string, Fix>> {
  const { results } = await env.DB.prepare(
    "SELECT place, fix FROM changes WHERE status = 'approved' AND fix IS NOT NULL ORDER BY reviewed_at, id",
  ).all<{ place: string; fix: string }>();
  const fixes: Record<string, Fix> = {};
  for (const row of results)
    fixes[row.place] = { ...fixes[row.place], ...(JSON.parse(row.fix) as Fix) };
  return fixes;
}

/** A place as the map shows it now: the list's or an approved one, with approved changes over it. */
export async function currentPlace(env: Env, id: string): Promise<Place | null> {
  const found =
    listed.find((place) => place.osm === id) ??
    (await approvedPlaces(env)).find((place) => place.osm === id);
  if (!found) return null;
  return applyFixes([found], await approvedFixes(env))[0] ?? null;
}

/** POST /api/changes {place, …the form's fields, botCheck}: one change saved as waiting. */
export async function sendChange(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!fromThisSite(request)) return problem(403, 'other-site');
  const body = await jsonBody(request, 8 * 1024);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return problem(400, 'not-a-change');
  const { botCheck, place: id, ...fields } = body as Record<string, unknown>;
  if (typeof id !== 'string' || id.length > 40) return problem(400, 'not-a-change');
  const place = await currentPlace(env, id);
  if (!place) return problem(404, 'no-such-place');
  const checked = checkChange(fields, place);
  if ('problems' in checked) return json({ error: 'problems', problems: checked.problems }, 400);
  const ip = connectionOf(request);
  if (!(await passedBotCheck(botCheck, ip, env.TURNSTILE_SECRET))) return problem(403, 'bot-check');

  const now = new Date();
  const sender = await senderKey(ip, now.toISOString().slice(0, 10), env.TURNSTILE_SECRET);
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const [recent, waiting] = await env.DB.batch<{ n: number }>([
    env.DB.prepare('SELECT COUNT(*) AS n FROM changes WHERE sender = ? AND created_at > ?').bind(
      sender,
      hourAgo,
    ),
    env.DB.prepare("SELECT COUNT(*) AS n FROM changes WHERE status = 'pending'"),
  ]);
  if ((recent?.results[0]?.n ?? 0) >= PER_HOUR) return problem(429, 'too-many');
  if ((waiting?.results[0]?.n ?? 0) >= MAX_WAITING) return problem(503, 'queue-full');

  const change = checked.change;
  const monthAgo = new Date(now.getTime() - KEEP_SENDER_DAYS * 86_400_000).toISOString();
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO changes
        (created_at, place, name, housenumber, street, city, postcode, phone, website, facebook,
         instagram, hours, closed, claim, contact, sender)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      now.toISOString(),
      place.osm,
      change.name,
      change.housenumber,
      change.street,
      change.city,
      change.postcode,
      change.phone,
      change.website,
      change.facebook,
      change.instagram,
      change.hours,
      change.closed ? 1 : 0,
      change.claim ? 1 : 0,
      change.contact,
      sender,
    ),
    env.DB.prepare("UPDATE changes SET sender = '' WHERE sender != '' AND created_at < ?").bind(
      monthAgo,
    ),
  ]);
  mailChangeLater(env, ctx, inserted?.meta.last_row_id ?? 0, change, place);
  return json({ ok: true }, 201);
}

/** The answer as browsers get it: asked again on every visit. */
function forBrowser(answer: Response): Response {
  const response = new Response(answer.body, answer);
  response.headers.set('Cache-Control', 'no-cache');
  return response;
}

/** GET /api/changes: the approved changes' fixes for the map, kept a minute by Cloudflare only. */
export async function approvedChanges(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache = caches.default;
  const key = new Request(new URL(CHANGES_PATH, request.url));
  const kept = await cache.match(key);
  if (kept) return forBrowser(kept);
  const response = json({ fixes: await approvedFixes(env) }, 200, CHANGES_KEPT);
  ctx.waitUntil(cache.put(key, response.clone()));
  return forBrowser(response);
}
