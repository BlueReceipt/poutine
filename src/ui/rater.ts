import type { FriendStars } from '../domain/links.ts';

/**
 * Who rates, without an account: a random ID this browser keeps, and the stars it gave each place
 * (to show "Your rating"). Browser storage can be off or wiped: then a fresh ID for this visit.
 */
const RATER = 'poutine.rater';
const MINE = 'poutine.ratings';
/** The Worker's code for each rating's stars, for shared links (worker/codes.ts). */
const CODES = 'poutine.codes';
/** The welcome box was closed. Every key this browser keeps starts with "poutine.". */
const WELCOMED = 'poutine.welcomed';

let visitRater: string | null = null;

export function raterId(): string {
  try {
    let id = localStorage.getItem(RATER);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(RATER, id);
    }
    return id;
  } catch {
    visitRater ??= crypto.randomUUID();
    return visitRater;
  }
}

/** This browser's random ID if it has one (it rated something once), without making one. */
export function savedRater(): string | null {
  try {
    return localStorage.getItem(RATER);
  } catch {
    return visitRater;
  }
}

/**
 * A backup link's key taken as this browser's own, with the ratings it gave and their codes
 * (the Worker's answer): the bowls, the counter, and the ratings to change or take back.
 */
export function adoptRater(
  key: string,
  ratings: Record<string, number>,
  codes: Record<string, string>,
): void {
  visitRater = key;
  try {
    localStorage.setItem(RATER, key);
    localStorage.setItem(MINE, JSON.stringify(ratings));
    localStorage.setItem(CODES, JSON.stringify(codes));
  } catch {
    // Storage off: the key serves this visit only.
  }
}

/**
 * Ask the browser to keep this site's data rather than clear it on its own (Safari empties a
 * site's after seven days away); it may ask the visitor, or say no.
 */
export function keepStorage(): void {
  try {
    void navigator.storage.persist().catch(() => false);
  } catch {
    // An older browser: nothing to ask.
  }
}

/** Every place this browser rated, with its stars. */
export function myRatings(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(MINE) ?? '{}') as unknown;
    return saved && typeof saved === 'object' ? (saved as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function myStars(place: string): number | null {
  const stars = myRatings()[place];
  return typeof stars === 'number' ? stars : null;
}

/** A rating taken back: the place is no longer this browser's (its pin, the counter). */
export function forgetStars(place: string): void {
  try {
    const mine = myRatings();
    delete mine[place];
    localStorage.setItem(MINE, JSON.stringify(mine));
    const codes = savedCodes();
    delete codes[place];
    localStorage.setItem(CODES, JSON.stringify(codes));
  } catch {
    // Nothing kept anyway.
  }
}

export function rememberStars(place: string, stars: number, code?: string): void {
  try {
    localStorage.setItem(MINE, JSON.stringify({ ...myRatings(), [place]: stars }));
    const codes = savedCodes();
    if (code) codes[place] = code;
    else delete codes[place];
    localStorage.setItem(CODES, JSON.stringify(codes));
  } catch {
    // Nothing kept: the rating still counts.
  }
}

function savedCodes(): Record<string, string> {
  try {
    const saved = JSON.parse(localStorage.getItem(CODES) ?? '{}') as unknown;
    return saved && typeof saved === 'object' ? (saved as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * This browser's stars for a place with the Worker's code, for the links it shares; null when it
 * didn't rate it, or rated before codes (its next rating brings one).
 */
export function myFriendStars(place: string): FriendStars | null {
  const stars = myStars(place);
  const code = savedCodes()[place];
  return stars !== null && code ? { stars, code } : null;
}

/**
 * Nothing saved yet in this browser (no rating, the welcome never closed): the welcome box shows
 * only then. Storage that's off counts as nothing saved.
 */
export function nothingSaved(): boolean {
  try {
    return !Object.keys(localStorage).some((key) => key.startsWith('poutine.'));
  } catch {
    return true;
  }
}

export function closeWelcome(): void {
  try {
    localStorage.setItem(WELCOMED, '1');
  } catch {
    // Nothing kept: it shows again on the next visit.
  }
}
