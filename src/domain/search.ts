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
