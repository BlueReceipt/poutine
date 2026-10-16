import type { Place } from './osmPlaces.ts';
import { fold } from './text.ts';

/** One pin: a place, or the places sharing one street address (a food court, one building). */
export interface PinGroup {
  /** The first place's OpenStreetMap ID. */
  id: string;
  lon: number;
  lat: number;
  places: Place[];
}

/**
 * Pins per address (Alex, 2026-10-15): places group only when their street addresses are the same
 * (civic number, street and town, accents and punctuation ignored). A place with no street address
 * keeps its own pin, wherever it is.
 */
export function groupByAddress(places: readonly Place[]): PinGroup[] {
  const groups: PinGroup[] = [];
  const byAddress = new Map<string, PinGroup>();
  for (const place of places) {
    const key =
      place.housenumber && place.street
        ? fold(`${place.housenumber} ${place.street} ${place.city}`)
        : null;
    const shared = key ? byAddress.get(key) : undefined;
    if (shared) {
      shared.places.push(place);
      continue;
    }
    const group: PinGroup = { id: place.osm, lon: place.lon, lat: place.lat, places: [place] };
    groups.push(group);
    if (key) byAddress.set(key, group);
  }
  return groups;
}
