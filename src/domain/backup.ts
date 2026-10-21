import { SITE } from './links.ts';
import { isRaterId } from './ratings.ts';

// The backup link (Alex, 2026-10-21: "if i clear my cache or local browser history, ill erase my
// data on the website"; "lets do the link in the secret menu"): no account, the browser's random
// rater ID as a key in a link the visitor keeps. Opened in any browser, it brings back the
// ratings that ID gave. The key goes after a #, which browsers never send to a server: it stays
// out of logs and of the pages a link is shared from.

const KEY = 'cle=';

/** The link that brings a rater's ratings back: https://poutines.app/#cle=<the random ID>. */
export function backupLink(rater: string): string {
  return `${SITE}/#${KEY}${rater}`;
}

/** The key in an address's #, or null when there's none (or it isn't a rater's ID). */
export function keyFromHash(hash: string): string | null {
  if (!hash.startsWith(`#${KEY}`)) return null;
  const key = hash
    .slice(KEY.length + 1)
    .trim()
    .toLowerCase();
  return isRaterId(key) ? key : null;
}

/** A rater's ID as 16 bytes: the user ID of the passkey that keeps it (src/ui/passkey.ts). */
export function raterBytes(rater: string): Uint8Array<ArrayBuffer> {
  const hex = rater.replaceAll('-', '');
  return Uint8Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

/** The rater's ID a passkey's user ID holds, or null when it holds something else. */
export function raterOfBytes(bytes: Uint8Array): string | null {
  if (bytes.length !== 16) return null;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const rater = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return isRaterId(rater) ? rater : null;
}
