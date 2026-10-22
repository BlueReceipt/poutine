import { metersBetween, type Place } from './osmPlaces.ts';
import { fold } from './text.ts';

/** Words that say what a place is, not which one: two "Casse-croûte chez …" aren't alike for it. */
const GENERIC = new Set(
  'casse croute cantine restaurant resto chez la le les l du de des d bar laitier patate patates frite frites friterie poutine poutinerie snack cafe et the and'.split(
    ' ',
  ),
);

function telling(name: string): string[] {
  return fold(name)
    .split(' ')
    .filter((word) => word && !GENERIC.has(word));
}

/** Two names share a word that says which place it is, or neither has one ("Casse-croûte"). */
export function alike(a: string, b: string): boolean {
  const left = telling(a);
  const right = telling(b);
  if (left.length === 0 || right.length === 0) return left.length === right.length;
  return left.some((word) => right.includes(word));
}

/**
 * The places a new one may already be, closest first, for "Is it one of these?": any place within
 * 25 m (one building), one at the same street address, or one within 150 m with a name alike.
 */
export function possibleDuplicates(
  places: readonly Place[],
  added: {
    name: string;
    housenumber: string;
    street: string;
    city: string;
    lat: number;
    lon: number;
  },
): Place[] {
  const address = (housenumber: string, street: string, city: string): string =>
    housenumber && street ? fold(`${housenumber} ${street} ${city}`) : '';
  const addedAddress = address(added.housenumber, added.street, added.city);
  return places
    .map((place) => ({ place, meters: metersBetween(added, place) }))
    .filter(
      ({ place, meters }) =>
        meters <= 25 ||
        (addedAddress !== '' &&
          address(place.housenumber, place.street, place.city) === addedAddress) ||
        (meters <= 150 && alike(place.name, added.name)),
    )
    .sort((a, b) => a.meters - b.meters)
    .map(({ place }) => place);
}
