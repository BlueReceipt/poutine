// Friend's stars that can't be faked (Alex, 2026-10-20): each accepted rating gets a short code,
// a keyed hash of the place and the stars (the Worker's LINK_SECRET, never in the repo). A shared
// link carries both, "?s=4&c=x7Kq2mPa"; the Worker shows the friend's stars only when they match.

async function signature(secret: string, text: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}

/** Eight characters, letters, digits, - and _ (48 bits of the hash). */
export async function friendCode(secret: string, place: string, stars: number): Promise<string> {
  const bytes = await signature(secret, `friend|${place}|${String(stars)}`);
  return btoa(String.fromCharCode(...bytes.slice(0, 6)))
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

export async function friendCodeFits(
  secret: string,
  place: string,
  stars: number,
  code: string,
): Promise<boolean> {
  const expected = await friendCode(secret, place, stars);
  let differs = expected.length ^ code.length;
  for (let i = 0; i < expected.length; i += 1)
    differs |= expected.charCodeAt(i) ^ code.charCodeAt(i);
  return differs === 0;
}
