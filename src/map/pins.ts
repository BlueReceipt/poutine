import type { FeatureCollection, Point } from 'geojson';
import type { FilterSpecification, LayerSpecification } from 'maplibre-gl';
import type { PinGroup } from '../domain/groups.ts';
import type { Place, PoutineEvidence } from '../domain/osmPlaces.ts';
import { FONT_BOLD } from './style.ts';

export const PLACES = 'places';

/** Gravy brown: the pins own the map's color. */
export const GRAVY = '#7a4a2a';

/** Green: the places this visitor has rated ("so they can see where they've been"; Alex chose green). */
export const BEEN = '#1e8e3e';

export interface PinProperties {
  /** The pin group's ID: its first place's OpenStreetMap ID. */
  id: string;
  /** How many places share the pin (1 for most). */
  count: number;
  /** Unconfirmed only when nothing confirms any of the pin's places. */
  poutine: PoutineEvidence;
  /** This visitor rated one of the pin's places (their browser remembers which). */
  visited: boolean;
}

const STRENGTH: readonly PoutineEvidence[] = ['unconfirmed', 'name', 'cuisine', 'confirmed'];

/** One point per pin: a place, or the places at one address; visited when this visitor rated one. */
export function pinFeatures(
  groups: readonly PinGroup[],
  rated: ReadonlySet<string> = new Set(),
): FeatureCollection<Point, PinProperties> {
  return {
    type: 'FeatureCollection',
    features: groups.map((group) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [group.lon, group.lat] },
      properties: {
        id: group.id,
        count: group.places.length,
        poutine: group.places
          .map((place) => place.poutine)
          .reduce((best, next) => (STRENGTH.indexOf(next) > STRENGTH.indexOf(best) ? next : best)),
        visited: group.places.some((place) => rated.has(place.osm)),
      },
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

export const ME = 'me';

/** Where you are, once Near me found it; nothing before. */
export function meFeatures(me: { lat: number; lon: number } | null): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: me
      ? [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [me.lon, me.lat] },
            properties: {},
          },
        ]
      : [],
  };
}

/** You: the usual blue dot, white-rimmed, above the pins. */
export const meLayer: LayerSpecification = {
  id: 'me',
  type: 'circle',
  source: ME,
  paint: {
    'circle-radius': 7,
    'circle-color': '#1a73e8',
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 3,
  },
};

/** Only the selected pin; none when nothing is selected. */
export function selectedFilter(id: string | null): FilterSpecification {
  return ['==', ['get', 'id'], id ?? ''];
}

/**
 * Solid gravy pins; a place nothing confirms yet is a ring with a white center; a place this
 * visitor rated is solid green. A shared pin is bigger and carries its count. The selected pin wears a black ring outside a white one.
 */
export const pinLayers: LayerSpecification[] = [
  {
    id: 'selected',
    type: 'circle',
    source: PLACES,
    filter: selectedFilter(null),
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 9, 10, 12, 15, 15],
      'circle-color': '#ffffff',
      'circle-stroke-color': '#000000',
      'circle-stroke-width': 2.5,
    },
  },
  {
    id: 'pins',
    type: 'circle',
    source: PLACES,
    paint: {
      // MapLibre wants the zoom on the outside: each stop picks the size for one or several places.
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4,
        ['case', ['>', ['get', 'count'], 1], 7.5, 3.5],
        10,
        ['case', ['>', ['get', 'count'], 1], 10, 6],
        15,
        ['case', ['>', ['get', 'count'], 1], 13, 9],
      ],
      // Rated by this visitor: solid green rimmed in white, whatever else the place is.
      'circle-color': [
        'case',
        ['get', 'visited'],
        BEEN,
        ['match', ['get', 'poutine'], 'unconfirmed', '#ffffff', GRAVY],
      ],
      'circle-stroke-color': [
        'case',
        ['get', 'visited'],
        '#ffffff',
        ['match', ['get', 'poutine'], 'unconfirmed', GRAVY, '#ffffff'],
      ],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 10, 2],
    },
  },
  {
    id: 'counts',
    type: 'symbol',
    source: PLACES,
    filter: ['>', ['get', 'count'], 1],
    layout: {
      'text-field': ['to-string', ['get', 'count']],
      'text-font': [FONT_BOLD],
      'text-size': 11,
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': [
        'case',
        ['get', 'visited'],
        '#ffffff',
        ['match', ['get', 'poutine'], 'unconfirmed', GRAVY, '#ffffff'],
      ],
    },
  },
];
