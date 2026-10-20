import type { Place } from './osmPlaces.ts';
import { townText } from './placeText.ts';
import { averageOf, type RatingTotal } from './ratings.ts';
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

/** "/p/la-banquise-n265847671": the name to read, then the place's ID in short. */
export function placePath(place: Pick<Place, 'osm' | 'name'>): string {
  const [kind = '', number = ''] = place.osm.split('/');
  const slug = slugOf(place.name);
  return `/p/${slug ? `${slug}-` : ''}${KINDS[kind] ?? ''}${number}`;
}

/** The place's link on the site's own address, wherever the page that shares it runs. */
export function placeUrl(place: Pick<Place, 'osm' | 'name'>): string {
  return `${SITE}${placePath(place)}`;
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

export interface PreviewWords {
  /** Pootsin or Poutine. */
  appName: string;
  /** What the site is, after the stars. */
  tagline: string;
  summary: (average: number, count: number) => string;
  none: string;
  near: (town: string) => string;
}

/**
 * What a link preview says (WhatsApp, Messenger, a Facebook post): the place and its town, then
 * its stars and what the site is.
 */
export function previewOf(
  place: Place,
  total: RatingTotal | undefined,
  words: PreviewWords,
): { title: string; description: string } {
  const town = townText(place, words.near);
  const average = averageOf(total);
  const stars = average === null || !total ? words.none : words.summary(average, total.count);
  return {
    title: town ? `${place.name} · ${town}` : place.name,
    description: `${stars}. ${words.tagline}`,
  };
}
