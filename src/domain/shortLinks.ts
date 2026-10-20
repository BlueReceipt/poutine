import type { Place } from './osmPlaces.ts';
import { fold } from './text.ts';

/**
 * Short links (Alex, 2026-10-20: "poutines.app/labanquise"): a place's name in one word, accents
 * and punctuation gone. Places sharing a name all take their town after it ("if there are multiple
 * ones, we could put the town name. so if it was banquisemtl, or banquiseQC"): Montréal is "mtl",
 * Québec City "qc", other towns spelled out. The same name in the same town adds 2, 3... A link,
 * once given, never changes or moves to another place (data/links.json keeps them all).
 */

/** Words the site keeps for itself: no place takes them. */
export const RESERVED: ReadonlySet<string> = new Set([
  'about',
  'admin',
  'aide',
  'api',
  'app',
  'apropos',
  'assets',
  'confidentialite',
  'fonts',
  'help',
  'index',
  'mapassets',
  'p',
  'privacy',
  'static',
  'www',
]);

const TOWN_SHORT: Readonly<Record<string, string>> = { montreal: 'mtl', quebec: 'qc' };

/** "La Banquise" → "labanquise": what a short link is made of, and how a typed one is read. */
export function linkWord(text: string): string {
  return fold(text).replaceAll(' ', '');
}

function townWord(city: string): string {
  const word = linkWord(city);
  return TOWN_SHORT[word] ?? word;
}

type Named = Pick<Place, 'osm' | 'name' | 'city'>;

/**
 * Every place's short link: the ones given before kept as they are, new ones given in the order of
 * their IDs (the same answer on every run). A name no other place has is the link; a shared one
 * takes the town; then a number.
 */
export function assignLinks(
  places: readonly Named[],
  given: Readonly<Record<string, string>>,
): Record<string, string> {
  const links: Record<string, string> = { ...given };
  const taken = new Set(Object.values(links));
  const named = new Map<string, number>();
  for (const place of places) {
    const word = linkWord(place.name);
    named.set(word, (named.get(word) ?? 0) + 1);
  }
  const free = (link: string): boolean =>
    link.length > 1 && !taken.has(link) && !RESERVED.has(link);
  const fresh = places
    .filter((place) => !links[place.osm])
    .sort((a, b) => a.osm.localeCompare(b.osm, 'en', { numeric: true }));
  for (const place of fresh) {
    const word = linkWord(place.name) || 'poutine';
    const withTown = `${word}${townWord(place.city)}`;
    let link = named.get(word) === 1 && free(word) ? word : withTown;
    for (let n = 2; !free(link); n += 1) link = `${withTown}${String(n)}`;
    links[place.osm] = link;
    taken.add(link);
  }
  return links;
}

/** The word a one-word path names ("/La-Banquise" → "labanquise"); null for any other path. */
export function linkFromPath(path: string): string | null {
  const found = /^\/([^/.]+)\/?$/.exec(path);
  if (!found?.[1]) return null;
  let text: string;
  try {
    text = decodeURIComponent(found[1]);
  } catch {
    return null;
  }
  const word = linkWord(text);
  return word || null;
}

/**
 * A one-word path that's no place's link: what to search for instead. A name several places share
 * ("/cassecroute": the search for Casse-croûte lists them all), or a town ("/drummondville",
 * "/mtl"). Null when it names neither.
 */
export function searchFor(
  word: string,
  places: readonly Pick<Place, 'name' | 'city'>[],
): string | null {
  const named = places.find((place) => linkWord(place.name) === word);
  if (named) return named.name;
  const town = places.find((place) => place.city && townWord(place.city) === word);
  if (town) return town.city;
  return places.find((place) => place.city && linkWord(place.city) === word)?.city ?? null;
}
