// Places Alex approved on the approval page (Alex, 2026-10-20: "Approved places show from D1 at
// once, with no push"): the app adds them to the list it ships, until `npm run fold` puts them in
// data/added.json and data/places.json.
import type { Place } from '../src/domain/osmPlaces.ts';
import {
  approvedPlace,
  newPlaceOfRow,
  SUBMISSION_COLUMNS,
  type SubmissionRow,
} from '../src/domain/submission.ts';
import { json } from './http.ts';

/**
 * How long Cloudflare keeps the approved places, in seconds; each approval empties it. Browsers
 * keep nothing (Alex, 2026-10-20: "make the map ask for approved places afresh on every visit"):
 * a place he approves shows on the next visit.
 */
const ADDED_KEPT = 60;

/** The answer as browsers get it: asked again on every visit. */
function forBrowser(answer: Response): Response {
  const response = new Response(answer.body, answer);
  response.headers.set('Cache-Control', 'no-cache');
  return response;
}

export const ADDED_PATH = '/api/added';

/** Every place approved here, as the list holds places, with its short link. */
export async function approvedPlaces(env: Env, link?: string): Promise<Place[]> {
  const statement = link
    ? env.DB.prepare(
        `SELECT ${SUBMISSION_COLUMNS} FROM submissions WHERE status = 'approved' AND link = ?`,
      ).bind(link)
    : env.DB.prepare(
        `SELECT ${SUBMISSION_COLUMNS} FROM submissions WHERE status = 'approved' AND link IS NOT NULL`,
      );
  const { results } = await statement.all<SubmissionRow>();
  return results.map((row) => ({
    ...approvedPlace(row.id, newPlaceOfRow(row)),
    link: row.link ?? undefined,
  }));
}

/** GET /api/added: the approved places for the map, kept a minute by Cloudflare only. */
export async function addedPlaces(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache = caches.default;
  const key = new Request(new URL(ADDED_PATH, request.url));
  const kept = await cache.match(key);
  if (kept) return forBrowser(kept);
  const response = json({ places: await approvedPlaces(env) }, 200, ADDED_KEPT);
  ctx.waitUntil(cache.put(key, response.clone()));
  return forBrowser(response);
}
