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

/** How long Cloudflare and browsers keep the approved places, in seconds. */
const ADDED_KEPT = 60;

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

/** GET /api/added: the approved places for the map, kept a minute. */
export async function addedPlaces(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache = caches.default;
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = json({ places: await approvedPlaces(env) }, 200, ADDED_KEPT);
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}
