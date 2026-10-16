import type { FeatureCollection, Point } from 'geojson';
import type { LayerSpecification } from 'maplibre-gl';
import type { Place, PoutineEvidence } from '../domain/osmPlaces.ts';

export const PLACES = 'places';

/** Gravy brown: the pins own the map's color. */
export const GRAVY = '#7a4a2a';

export interface PinProperties {
  osm: string;
  name: string;
  poutine: PoutineEvidence;
}

/** One point per place. Grouping places at one address under a shared pin comes with the cards. */
export function pinFeatures(places: readonly Place[]): FeatureCollection<Point, PinProperties> {
  return {
    type: 'FeatureCollection',
    features: places.map((place) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
      properties: { osm: place.osm, name: place.name, poutine: place.poutine },
    })),
  };
}

/**
 * [west, south, east, north] around where the places are: the farthest 5% on each side (a cantine
 * on the Lower North Shore, one in Fermont) are left out, so the map opens on southern Québec
 * rather than half the continent.
 */
export function boundsOf(places: readonly Place[]): [number, number, number, number] {
  const within = (values: number[]): [number, number] => {
    const sorted = [...values].sort((a, b) => a - b);
    const skip = Math.floor(sorted.length * 0.05);
    return [sorted[skip] ?? 0, sorted[sorted.length - 1 - skip] ?? 0];
  };
  const [west, east] = within(places.map((place) => place.lon));
  const [south, north] = within(places.map((place) => place.lat));
  return [west, south, east, north];
}

/** Solid gravy pins; a place nothing confirms yet is a ring with a white center. */
export const pinLayer: LayerSpecification = {
  id: 'pins',
  type: 'circle',
  source: PLACES,
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 10, 6, 15, 9],
    'circle-color': ['match', ['get', 'poutine'], 'unconfirmed', '#ffffff', GRAVY],
    'circle-stroke-color': ['match', ['get', 'poutine'], 'unconfirmed', GRAVY, '#ffffff'],
    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 10, 2],
  },
};
