/**
 * Ratings (Alex, 2026-10-16): 1 to 5 stars per place, shown at once to everyone, no approval; half
 * stars too since 2026-10-20 ("can we do half a star too"), from ½ to 5. A
 * written review goes with the stars only once reviews are switched on ("review comments are
 * switched off"): until then the card offers no comment box and the Worker refuses comments.
 */
export const REVIEWS_ON = false;

/** The longest written review. */
export const MAX_COMMENT = 500;

/** A place of the list: an OpenStreetMap element, or a place a visitor added. */
const PLACE_ID = /^(?:node|way|relation|added)\/\d{1,20}$/;

export function isPlaceId(text: string): boolean {
  return PLACE_ID.test(text);
}

/** A written review as the card shows it (only once reviews are switched on). */
export interface Review {
  stars: number;
  comment: string;
  /** The day it was written or last changed, YYYY-MM-DD. */
  date: string;
}
/** The rater: a random ID the browser keeps (no account), one rating per place each. */
const RATER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Rating {
  place: string;
  rater: string;
  /** ½ to 5, in halves. */
  stars: number;
  /** Empty while reviews are switched off. */
  comment: string;
  /** "Did you have poutine here?", asked at places not confirmed yet; null when not answered. */
  poutine: boolean | null;
}

export type RatingProblem = 'not-a-rating' | 'stars' | 'comment-too-long' | 'reviews-off';

/**
 * A place's ratings, as the Worker keeps them: how many, their stars added up, and the raters who
 * said they had poutine there or not (left out while none did).
 */
export interface RatingTotal {
  count: number;
  total: number;
  yes?: number;
  no?: number;
}

/** Yeses it takes from different raters to confirm a place serves poutine (Alex, 2026-10-20). */
export const CONFIRM_AT = 3;

/** Three yeses or more, and more yeses than noes. */
export function confirmedByRaters(total: RatingTotal | undefined): boolean {
  const yes = total?.yes ?? 0;
  return yes >= CONFIRM_AT && yes > (total?.no ?? 0);
}

/** Stars a rating may give: ½ to 5, in halves. */
export function isRatingStars(stars: unknown): stars is number {
  return typeof stars === 'number' && Number.isInteger(stars * 2) && stars >= 0.5 && stars <= 5;
}

/**
 * A sent rating checked the same way in the card and in the Worker: only these fields, a place
 * and rater of the right form, stars from ½ to 5 in halves, and a comment only when reviews are on.
 */
export function checkRating(
  input: unknown,
  reviewsOn = REVIEWS_ON,
): { rating: Rating } | { problems: RatingProblem[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { problems: ['not-a-rating'] };
  const fields = input as Record<string, unknown>;
  const allowed = ['place', 'rater', 'stars', 'comment', 'poutine'];
  if (Object.keys(fields).some((key) => !allowed.includes(key)))
    return { problems: ['not-a-rating'] };
  const { place, rater, stars } = fields;
  const comment = fields.comment ?? '';
  const poutine = fields.poutine ?? null;
  if (
    typeof place !== 'string' ||
    !PLACE_ID.test(place) ||
    typeof rater !== 'string' ||
    !RATER_ID.test(rater) ||
    typeof comment !== 'string' ||
    (poutine !== null && typeof poutine !== 'boolean')
  )
    return { problems: ['not-a-rating'] };
  const problems: RatingProblem[] = [];
  if (!isRatingStars(stars)) problems.push('stars');
  const words = comment.trim();
  if (words && !reviewsOn) problems.push('reviews-off');
  if (words.length > MAX_COMMENT) problems.push('comment-too-long');
  if (problems.length > 0) return { problems };
  return { rating: { place, rater, stars: stars as number, comment: words, poutine } };
}

/** The average, to one decimal: 4.33 → 4.3. Null with no rating. */
export function averageOf(total: RatingTotal | undefined): number | null {
  if (!total || total.count === 0) return null;
  return Math.round((total.total / total.count) * 10) / 10;
}
