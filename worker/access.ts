// The approval page is Alex's alone (Alex, 2026-10-20: "behind Cloudflare Access (my trouvemapoutine
// Gmail only, email code)"). Cloudflare Access signs him in before any request reaches the Worker,
// and hands the Worker a signed token (Cf-Access-Jwt-Assertion). The Worker checks that token too:
// Access's signature (its public keys, ACCESS_CERTS_URL), this application's tag (ACCESS_AUD), and
// that it hasn't run out. Without both settings, nothing gets in.

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

/**
 * Access's public keys, asked again after ten minutes, or at once for a token signed with a key
 * not among them (Access rotates its keys now and then).
 */
let keys: { url: string; at: number; list: Jwk[] } | null = null;
const KEYS_KEPT = 10 * 60_000;

async function keyOf(url: string, kid: unknown): Promise<Jwk | undefined> {
  const kept =
    keys && keys.url === url && Date.now() - keys.at < KEYS_KEPT
      ? keys.list.find((key) => key.kid === kid)
      : undefined;
  if (kept) return kept;
  const answer = await fetch(url);
  if (!answer.ok) return undefined;
  const { keys: list = [] } = (await answer.json()) as { keys?: Jwk[] };
  keys = { url, at: Date.now(), list };
  return list.find((key) => key.kid === kid);
}

function bytesOf(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replaceAll('-', '+').replaceAll('_', '/');
  const text = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function jsonOf(base64url: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytesOf(base64url))) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Alex, signed in through Access for this application: a token Access signed, for it, still good. */
export async function signedInAlex(
  request: Request,
  env: { ACCESS_CERTS_URL: string; ACCESS_AUD: string },
): Promise<boolean> {
  if (!env.ACCESS_CERTS_URL || !env.ACCESS_AUD) return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion') ?? '';
  const [head = '', body = '', signature = ''] = token.split('.');
  const header = jsonOf(head);
  const claims = jsonOf(body);
  if (!header || !claims || header.alg !== 'RS256' || !signature) return false;
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(env.ACCESS_AUD)) return false;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return false;
  try {
    const jwk = await keyOf(env.ACCESS_CERTS_URL, header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      bytesOf(signature),
      new TextEncoder().encode(`${head}.${body}`),
    );
  } catch {
    return false;
  }
}
