import { nameKey, sameName } from './addresses.ts';
import { metersBetween, type Place } from './osmPlaces.ts';

// The village or sector a place is in when its town is a merged municipality (Alex, 2026-10-20:
// "we should keep local localities. else mirabel ignores many good eateries"): Casse-croûte Le
// St-Scho, in Mirabel, is in Sainte-Scholastique.

/** A place name of OpenStreetMap (a city, town, village or sector) and the municipality it's in. */
export interface LocalityPoint {
  name: string;
  /** OpenStreetMap's place=* kind. */
  kind: string;
  lat: number;
  lon: number;
  /** Its municipality (Adresses Québec), empty while unknown. */
  municipality: string;
}

/** Kinds that name a village or a sector: no neighbourhoods, quarters or hamlets. */
export const LOCALITY_KINDS: ReadonlySet<string> = new Set(['town', 'village', 'suburb']);
/** A village or sector this near the pin is the one the place is in. */
export const LOCALITY_METERS = 1500;
/** Cities whose own name is what everyone says: no borough or neighbourhood before it. */
export const OWN_NAME_CITIES: readonly string[] = ['Montréal', 'Québec', 'Laval'];

/** The village and sector points within LOCALITY_METERS of a place: the ones to ask the town of. */
export function localitiesNear(
  place: Pick<Place, 'lat' | 'lon'>,
  points: readonly LocalityPoint[],
): LocalityPoint[] {
  return points.filter(
    (point) => LOCALITY_KINDS.has(point.kind) && metersBetween(place, point) <= LOCALITY_METERS,
  );
}

/**
 * One town's names, not a village and its town: "Belœil" and "Beloeil", "Kahnawà:ke" and
 * "Kahnawake", "Ville de Mont-Royal" and "Mont-Royal", "Shawinigan-Sud" and "Shawinigan".
 */
function ofTheTown(name: string, town: string): boolean {
  const squeezed = (text: string) =>
    nameKey(text.replace(/œ/g, 'oe').replace(/Œ/g, 'Oe')).replaceAll(' ', '');
  const left = squeezed(name);
  const right = squeezed(town);
  return left.length > 0 && right.length > 0 && (left.includes(right) || right.includes(left));
}

/**
 * The village or sector to show before a Québec place's town: the nearest within LOCALITY_METERS
 * that lies in the pin's municipality, when the town shown is that municipality and not one of
 * OWN_NAME_CITIES. None when a point of the town's own name is nearer (the place is in its
 * centre), or when the village's name is only the town's again ("Shawinigan-Sud").
 */
export function localityFor(
  place: Place,
  municipality: string,
  points: readonly LocalityPoint[],
): string | null {
  if (place.province !== 'QC' || !municipality || !sameName(place.city, municipality)) return null;
  if (OWN_NAME_CITIES.some((city) => sameName(city, municipality))) return null;
  const village = localitiesNear(place, points)
    .filter(
      (point) => sameName(point.municipality, municipality) && !ofTheTown(point.name, municipality),
    )
    .map((point) => ({ point, meters: metersBetween(place, point) }))
    .sort((a, b) => a.meters - b.meters)[0];
  if (!village) return null;
  const centre = Math.min(
    ...points
      .filter((point) => ofTheTown(point.name, municipality))
      .map((point) => metersBetween(place, point)),
  );
  return centre < village.meters ? null : village.point.name;
}
