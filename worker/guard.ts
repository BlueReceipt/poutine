// What every visitor's send goes through: Cloudflare Turnstile's verdict on the form's bot check,
// and a keyed hash of the connection and the day to count sends with (never the address itself;
// emptied after 30 days).

/** Cloudflare Turnstile's verdict on the token the page's bot check gave. */
export async function passedBotCheck(token: unknown, ip: string, secret: string): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const answer = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const verdict = (await answer.json()) as { success?: boolean };
    return verdict.success === true;
  } catch {
    return false;
  }
}

/** A keyed hash of a text: the same text gives the same key, and the key never gives the text. */
async function keyedHash(text: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(text));
  return [...new Uint8Array(signature)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** A keyed hash of the connection's address and the day: the same sender today, never the address. */
export function senderKey(ip: string, day: string, secret: string): Promise<string> {
  return keyedHash(`${day}|${ip}`, secret);
}

/**
 * The same connection whatever the day, and the same browser (its random ID), as keyed hashes: to
 * tell two visitors on the spot from one person twice (src/domain/onTheSpot.ts).
 */
export function connectionKey(ip: string, secret: string): Promise<string> {
  return keyedHash(`connection|${ip}`, secret);
}

export function visitorKey(rater: string, secret: string): Promise<string> {
  return keyedHash(`visitor|${rater}`, secret);
}

export const KEEP_SENDER_DAYS = 30;

export function connectionOf(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? '';
}
