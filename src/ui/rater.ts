/**
 * Who rates, without an account: a random ID this browser keeps, and the stars it gave each place
 * (to show "Your rating"). Browser storage can be off or wiped: then a fresh ID for this visit.
 */
const RATER = 'poutine.rater';
const MINE = 'poutine.ratings';

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

function mine(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(MINE) ?? '{}') as unknown;
    return saved && typeof saved === 'object' ? (saved as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function myStars(place: string): number | null {
  const stars = mine()[place];
  return typeof stars === 'number' ? stars : null;
}

export function rememberStars(place: string, stars: number): void {
  try {
    localStorage.setItem(MINE, JSON.stringify({ ...mine(), [place]: stars }));
  } catch {
    // Nothing kept: the rating still counts.
  }
}
