import { metersBetween, type Place } from './osmPlaces.ts';
import { fold } from './text.ts';

/** Folded, with St and Ste written out: "St-Jérôme" and "Saint-Jérôme" are one town. */
function searchable(text: string): string {
  return fold(text)
    .replace(/\bste\b/g, 'sainte')
    .replace(/\bst\b/g, 'saint');
}

/**
 * Places whose name, town or street has a word starting with each word typed, accents and
 * punctuation ignored. Names starting with what was typed come first, then names holding every
 * word, then the rest (a town, a street); alphabetical within each.
 */
export function searchPlaces(places: readonly Place[], query: string): Place[] {
  const typed = searchable(query);
  const words = typed.split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const found: { place: Place; rank: number }[] = [];
  for (const place of places) {
    const name = searchable(place.name);
    const nameWords = name.split(' ');
    const allWords = [...nameWords, ...searchable(`${place.city} ${place.street}`).split(' ')];
    if (!words.every((word) => allWords.some((candidate) => candidate.startsWith(word)))) continue;
    let rank = 2;
    if (name.startsWith(typed)) rank = 0;
    else if (words.every((word) => nameWords.some((candidate) => candidate.startsWith(word))))
      rank = 1;
    found.push({ place, rank });
  }
  return found
    .sort((a, b) => a.rank - b.rank || a.place.name.localeCompare(b.place.name, 'fr'))
    .map(({ place }) => place);
}

export interface Nearby {
  place: Place;
  meters: number;
}

/** The places closest to a point, nearest first. */
export function nearest(
  places: readonly Place[],
  point: { lat: number; lon: number },
  count: number,
): Nearby[] {
  return places
    .map((place) => ({ place, meters: metersBetween(point, place) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, count);
}

/** How far À côté looks, in km: the first ring with any place in it (Alex, 2026-10-20). */
export const RINGS_KM = [2, 5, 10, 15] as const;

/** What À côté shows: every place within the ring found, or none and the closest anywhere. */
export interface Around {
  /** The ring, in km: where places were found, or the last one when none were. */
  km: number;
  /** Every place within the ring, nearest first; empty when none within the last ring. */
  nearby: Nearby[];
  /** When none: the closest place there is, however far. */
  closest: Nearby | null;
}

/** The places within 2 km of a point; if none, within 5, then 10, then 15 km. */
export function around(places: readonly Place[], point: { lat: number; lon: number }): Around {
  const all = nearest(places, point, places.length);
  for (const km of RINGS_KM) {
    const nearby = all.filter(({ meters }) => meters <= km * 1000);
    if (nearby.length > 0) return { km, nearby, closest: null };
  }
  return { km: RINGS_KM[RINGS_KM.length - 1] ?? 15, nearby: [], closest: all[0] ?? null };
}
