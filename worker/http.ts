// Every answer of the API is data, never a page: opened in a browser it downloads, and it can't
// run anything (as Terrain's relay answers).
const LOCKED = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cache-Control': 'no-store',
};

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: LOCKED });
}

/** An error the page turns into words: a code, never a sentence. */
export function problem(status: number, error: string): Response {
  return json({ error }, status);
}

/** A form on this site sent it: the browser names the page's origin on every POST. */
export function fromThisSite(request: Request): boolean {
  return request.headers.get('Origin') === new URL(request.url).origin;
}

/** The request's JSON body, or null when it's too big or not JSON. */
export async function jsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
