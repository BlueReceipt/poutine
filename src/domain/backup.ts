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
