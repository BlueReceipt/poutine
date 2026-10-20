import type { Place } from './osmPlaces.ts';
import { townText } from './placeText.ts';
import { averageOf, isRatingStars, type RatingTotal } from './ratings.ts';
import { fold } from './text.ts';

/**
 * Every place has its own link (Alex, 2026-10-19: share a rating "as a insta story, or facebook
 * story. and it shares a url to the website"). It opens the map on the place's card, and link
 * previews show the place's name and stars. Shared links always name the site's own address.
 */
export const SITE = 'https://poutines.app';

/** The address as people type it: printed on the story picture. */
export const SITE_NAME = 'poutines.app';

/** The kinds of place IDs (node/123, added/4) in one letter: n123, a4. */
const KINDS: Record<string, string> = { node: 'n', way: 'w', relation: 'r', added: 'a' };
const KIND_OF: Record<string, string> = { n: 'node', w: 'way', r: 'relation', a: 'added' };

/** The readable part of a link stays short: whole words up to this many characters. */
const LONGEST_SLUG = 60;

/** "Casse-Croûte Chez Ti-Paul" → "casse-croute-chez-ti-paul": the part of a link meant to be read. */
export function slugOf(name: string): string {
  let slug = '';
  for (const word of fold(name).split(' ').filter(Boolean)) {
    const longer = slug ? `${slug}-${word}` : word;
    if (longer.length > LONGEST_SLUG) break;
    slug = longer;
  }
  return slug;
}

/**
 * The place's path: its short link ("/labanquise", shortLinks.ts) once the list gives it one;
 * until then, and for the links shared before short links, "/p/la-banquise-n265847671": the name
 * to read, then the place's ID in short.
 */
export function placePath(place: Pick<Place, 'osm' | 'name' | 'link'>): string {
  if (place.link) return `/${place.link}`;
  const [kind = '', number = ''] = place.osm.split('/');
  const slug = slugOf(place.name);
  return `/p/${slug ? `${slug}-` : ''}${KINDS[kind] ?? ''}${number}`;
}

/**
 * A friend's stars in a shared link, with the code the Worker gave their rating (Alex, 2026-10-20:
 * "Friend's stars that can't be faked"): "?s=4&c=x7Kq2mPa". They're a friend's word, never counted
 * as a rating, and shown only when the Worker finds the code fits.
 */
export interface FriendStars {
  stars: number;
  code: string;
}

const FRIEND_CODE = /^[A-Za-z0-9_-]{8}$/;

/** The place's link on the site's own address, wherever the page that shares it runs. */
export function placeUrl(
  place: Pick<Place, 'osm' | 'name' | 'link'>,
  friend?: FriendStars | null,
): string {
  const given =
    friend && isRatingStars(friend.stars) && FRIEND_CODE.test(friend.code)
      ? `?s=${String(friend.stars)}&c=${friend.code}`
      : '';
  return `${SITE}${placePath(place)}${given}`;
}

/** The friend's stars and code a link carries; null for none or anything malformed. */
export function friendFromSearch(search: string): FriendStars | null {
  const params = new URLSearchParams(search);
  const stars = Number(params.get('s'));
  const code = params.get('c') ?? '';
  return isRatingStars(stars) && FRIEND_CODE.test(code) ? { stars, code } : null;
}

const PLACE_PATH = /^\/p\/(?:[a-z0-9-]*-)?([nwra])(\d{1,20})\/?$/i;

/**
 * The place a link names ("node/265847671"), whatever its readable part says: a renamed place's
 * old links still open it. Null for any other path.
 */
export function placeIdFromPath(path: string): string | null {
  const found = PLACE_PATH.exec(path);
  const kind = found?.[1] ? KIND_OF[found[1].toLowerCase()] : undefined;
  return found && kind ? `${kind}/${found[2] ?? ''}` : null;
}

/** What a place is, as its name says; "poutine" when it says none of these. */
export type PlaceKind =
  'casse-croute' | 'cantine' | 'friterie' | 'bar-laitier' | 'patates' | 'poutine';

export function kindOf(place: Pick<Place, 'name'>): PlaceKind {
  const name = ` ${fold(place.name)} `;
  if (/ casse ?croute /.test(name)) return 'casse-croute';
  if (/ cantine /.test(name)) return 'cantine';
  if (/ friterie /.test(name)) return 'friterie';
  if (/ bar laitier /.test(name)) return 'bar-laitier';
  if (/ patat/.test(name)) return 'patates';
  return 'poutine';
}

export interface PreviewWords {
  /** What the site is, after the stars. */
  tagline: string;
  summary: (average: number, count: number) => string;
  near: (town: string) => string;
  /** A link carrying a friend's stars: what they gave, and the question back. */
  friend: (stars: number) => string;
  /** Stars as a number, the language's way: 4.5, 4,5. */
  number: (stars: number) => string;
  kinds: Readonly<Record<PlaceKind, string>>;
  /** "Casse-croûte à Drummondville", and near a town when that's all that's known. */
  placedIn: (what: string, town: string) => string;
  placedNear: (what: string, town: string) => string;
}

/**
 * What a link preview says (WhatsApp, Messenger, a Facebook post): the place and its town, then
 * its stars once it has some, what it is and what the site is (Alex, 2026-10-20: no "No ratings
 * yet"). A link with a friend's stars leads with them.
 */
export function previewOf(
  place: Place,
  total: RatingTotal | undefined,
  words: PreviewWords,
  friend: number | null = null,
): { title: string; description: string } {
  const town = townText(place, words.near);
  const named = town ? `${place.name} · ${town}` : place.name;
  if (friend !== null)
    return {
      title: `${words.number(friend)} ★ · ${named}`,
      description: `${words.friend(friend)} ${words.tagline}`,
    };
  const what = words.kinds[kindOf(place)];
  const where = !place.city
    ? what
    : place.citySource === 'nearest-town'
      ? words.placedNear(what, place.city)
      : words.placedIn(what, place.city);
  const average = averageOf(total);
  const stars = average === null || !total ? '' : `${words.summary(average, total.count)}. `;
  return { title: named, description: `${stars}${where}. ${words.tagline}` };
}
