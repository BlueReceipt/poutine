/**
 * Who rates, without an account: a random ID this browser keeps, and the stars it gave each place
 * (to show "Your rating"). Browser storage can be off or wiped: then a fresh ID for this visit.
 */
const RATER = 'poutine.rater';
const MINE = 'poutine.ratings';
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

export function rememberStars(place: string, stars: number): void {
  try {
    localStorage.setItem(MINE, JSON.stringify({ ...myRatings(), [place]: stars }));
  } catch {
    // Nothing kept: the rating still counts.
  }
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
