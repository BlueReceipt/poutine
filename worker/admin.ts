// The approval page (Alex, 2026-10-20): /admin and /api/admin/*, behind Cloudflare Access and the
// Worker's own check of its token (access.ts). The places waiting and the changes and claims
// waiting (Add more info), then Approve (with Alex's fixes, checked like a visitor's form), Reject.
// An approved place or change shows on the map at once.
import {
  CHANGE_COLUMNS,
  changeOfRow,
  checkChange,
  fixOfChange,
  type ChangeRow,
} from '../src/domain/changes.ts';
import { linkForNewPlace } from '../src/domain/shortLinks.ts';
import {
  approvedPlace,
  checkNewPlace,
  newPlaceOfRow,
  SUBMISSION_COLUMNS,
  type SubmissionRow,
} from '../src/domain/submission.ts';
import { signedInAlex } from './access.ts';
import { ADDED_PATH, approvedPlaces } from './added.ts';
import { CHANGES_PATH, currentPlace } from './changes.ts';
import { fromThisSite, json, jsonBody, problem } from './http.ts';
import { givenLinks, listed } from './list.ts';

/** GET /admin: the page itself, only for Alex; never kept by a browser or Cloudflare. */
export async function adminPage(request: Request, env: Env): Promise<Response> {
  if (!(await signedInAlex(request, env)))
    return new Response('Not signed in.', {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  const page = await env.ASSETS.fetch(new URL('/admin/', request.url));
  const headers = new Headers(page.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Robots-Tag', 'noindex');
  return new Response(page.body, { status: page.status, headers });
}

/**
 * GET /api/admin/waiting: the places waiting, and the changes and claims waiting with the place as
 * the map shows it now, oldest first.
 */
export async function waitingPlaces(request: Request, env: Env): Promise<Response> {
  if (!(await signedInAlex(request, env))) return problem(403, 'not-signed-in');
  const [places, changes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT ${SUBMISSION_COLUMNS} FROM submissions WHERE status = 'pending' ORDER BY created_at`,
    ),
    env.DB.prepare(
      `SELECT ${CHANGE_COLUMNS} FROM changes WHERE status = 'pending' ORDER BY created_at`,
    ),
  ]);
  const withPlaces = await Promise.all(
    ((changes?.results ?? []) as ChangeRow[]).map(async (row) => ({
      ...row,
      current: await currentPlace(env, row.place),
    })),
  );
  return json({
    waiting: (places?.results ?? []) as SubmissionRow[],
    changes: withPlaces.filter((row) => row.current !== null),
  });
}

/**
 * One change or claim decided (POST /api/admin/review with kind "change"). On Approve, `change`
 * holds Alex's fixes as the form's fields, checked like a visitor's; what it makes different shows
 * on the map within the minute the approved changes are kept. Either way an owner's contact goes.
 */
async function reviewChange(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  id: number,
  decision: unknown,
  fixes: unknown,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT ${CHANGE_COLUMNS} FROM changes WHERE id = ? AND status = 'pending'`,
  )
    .bind(id)
    .first<ChangeRow>();
  if (!row) return problem(409, 'not-waiting');
  const now = new Date().toISOString();
  if (decision === 'reject') {
    await env.DB.prepare(
      "UPDATE changes SET status = 'rejected', reviewed_at = ?, contact = '' WHERE id = ? AND status = 'pending'",
    )
      .bind(now, id)
      .run();
    return json({ rejected: id });
  }
  if (decision !== 'approve') return problem(400, 'not-a-review');
  const place = await currentPlace(env, row.place);
  if (!place) return problem(409, 'not-waiting');
  let change = changeOfRow(row);
  if (fixes !== undefined) {
    const checked = checkChange(fixes, place);
    if ('problems' in checked) return json({ error: 'problems', problems: checked.problems }, 400);
    change = checked.change;
  }
  const fix = fixOfChange(change, place, id, now.slice(0, 10));
  await env.DB.prepare(
    `UPDATE changes SET name = ?, housenumber = ?, street = ?, city = ?, postcode = ?, phone = ?,
      website = ?, facebook = ?, instagram = ?, hours = ?, closed = ?, status = 'approved',
      reviewed_at = ?, contact = '', fix = ?
      WHERE id = ? AND status = 'pending'`,
  )
    .bind(
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
      now,
      JSON.stringify(fix),
      id,
    )
    .run();
  // The map asks for the approved changes again rather than wait out the minute they're kept.
  ctx.waitUntil(caches.default.delete(new Request(new URL(CHANGES_PATH, request.url))));
  return json({ fix });
}

/**
 * POST /api/admin/review {id, decision: "approve" | "reject", place?}: one place decided (with
 * kind "change" and `change`, one change or claim: reviewChange). On
 * Approve, `place` holds Alex's fixes as the form's fields, checked like a visitor's; the place
 * gets its short link and shows on the map within the minute the approved places are kept.
 */
export async function reviewPlace(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!fromThisSite(request)) return problem(403, 'other-site');
  if (!(await signedInAlex(request, env))) return problem(403, 'not-signed-in');
  const body = await jsonBody(request, 8 * 1024);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return problem(400, 'not-a-review');
  const { id, decision, place: fixes, kind, change } = body as Record<string, unknown>;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0)
    return problem(400, 'not-a-review');
  if (kind === 'change') return reviewChange(request, env, ctx, id, decision, change);
  const row = await env.DB.prepare(
    `SELECT ${SUBMISSION_COLUMNS} FROM submissions WHERE id = ? AND status = 'pending'`,
  )
    .bind(id)
    .first<SubmissionRow>();
  if (!row) return problem(409, 'not-waiting');
  const now = new Date().toISOString();

  if (decision === 'reject') {
    await env.DB.prepare(
      "UPDATE submissions SET status = 'rejected', reviewed_at = ? WHERE id = ? AND status = 'pending'",
    )
      .bind(now, id)
      .run();
    return json({ rejected: id });
  }
  if (decision !== 'approve') return problem(400, 'not-a-review');

  let place = newPlaceOfRow(row);
  if (fixes !== undefined) {
    const checked = checkNewPlace(fixes);
    if ('problems' in checked) return json({ error: 'problems', problems: checked.problems }, 400);
    place = checked.place;
  }
  const approved = approvedPlace(id, place);
  const others = await approvedPlaces(env);
  const given = {
    ...givenLinks,
    ...Object.fromEntries(others.flatMap((other) => (other.link ? [[other.osm, other.link]] : []))),
  };
  const link = linkForNewPlace(approved, [...listed, ...others], given);
  await env.DB.prepare(
    `UPDATE submissions SET name = ?, housenumber = ?, street = ?, city = ?, province = ?,
      postcode = ?, lat = ?, lon = ?, placed_by = ?, phone = ?, website = ?,
      status = 'approved', reviewed_at = ?, link = ?
      WHERE id = ? AND status = 'pending'`,
  )
    .bind(
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
      now,
      link,
      id,
    )
    .run();
  // The map asks for the approved places again rather than wait out the minute they're kept.
  ctx.waitUntil(caches.default.delete(new Request(new URL(ADDED_PATH, request.url))));
  return json({ place: { ...approved, link } });
}
