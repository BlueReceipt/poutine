// Daily counters: one number per day and kind in D1 (migrations/0003_daily_counts.sql), nothing
// about who. Written after the answer has gone (ctx.waitUntil), so nobody waits for them.
import { isTapped, type CountKind } from '../src/domain/counts.ts';
import { fromThisSite, jsonBody, problem } from './http.ts';

/** Adds one to today's count of a kind: the statement, for a batch or on its own. */
export function countStatement(env: Env, kind: CountKind, now = new Date()): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO daily_counts (day, kind, n) VALUES (?, ?, 1)
      ON CONFLICT (day, kind) DO UPDATE SET n = n + 1`,
  ).bind(now.toISOString().slice(0, 10), kind);
}

export function countLater(env: Env, ctx: ExecutionContext, kind: CountKind): void {
  ctx.waitUntil(
    countStatement(env, kind)
      .run()
      .catch(() => undefined),
  );
}

/** POST /api/count {kind}: a Share tap on this site. Nothing comes back but "noted". */
export async function countTap(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!fromThisSite(request)) return problem(403, 'other-site');
  const body = await jsonBody(request, 256);
  const kind = body && typeof body === 'object' ? (body as { kind?: unknown }).kind : undefined;
  if (!isTapped(kind)) return problem(400, 'not-a-count');
  countLater(env, ctx, kind);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
