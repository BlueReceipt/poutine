/**
 * What the site counts per day (Alex, 2026-10-20: "Daily counters, nothing per person"): taps on
 * Share (a place's link, a story picture, one with a photo), opens of a place's link, ratings.
 * Only a number per day and kind: no address, no cookie, no browser ID.
 */
export const COUNT_KINDS = [
  'share-place',
  'share-story',
  'share-photo',
  'link-open',
  'rating',
] as const;

export type CountKind = (typeof COUNT_KINDS)[number];

/** The kinds a page reports (taps); the Worker counts link opens and ratings itself. */
const TAPPED: readonly string[] = ['share-place', 'share-story', 'share-photo'];

export function isTapped(kind: unknown): kind is CountKind {
  return typeof kind === 'string' && TAPPED.includes(kind);
}
