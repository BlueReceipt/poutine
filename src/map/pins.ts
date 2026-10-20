import type { FeatureCollection, Point } from 'geojson';
import type { FilterSpecification, LayerSpecification } from 'maplibre-gl';
import type { PinGroup } from '../domain/groups.ts';
import type { Place, PoutineEvidence } from '../domain/osmPlaces.ts';
import { FONT_BOLD } from './style.ts';

export const PLACES = 'places';

/** Gravy brown: the pins own the map's color. */
export const GRAVY = '#7a4a2a';

/**
 * A pin is a poutine bowl (Alex, 2026-10-20: "change the green icon to a small poutine based on our
 * personal review. if its not reviewed, we just show the empty aluminium tray"): `bowl-0` the empty
 * tray, `bowl-1` to `bowl-5` the bowl this visitor gave, drawn by `pinImages` in MapView.
 */
export const pinImage = (bowl: number): string => `bowl-${String(bowl)}`;
/** The pictures' width in pixels, and how many pixels make one on screen: 40 px wide at full size. */
export const PIN_PIXELS = 120;
export const PIN_RATIO = 3;

export interface PinProperties {
  /** The pin group's ID: its first place's OpenStreetMap ID. */
  id: string;
  /** How many places share the pin (1 for most). */
  count: number;
  /** Unconfirmed only when nothing confirms any of the pin's places. */
  poutine: PoutineEvidence;
  /**
   * The bowl this visitor gave one of the pin's places (their browser remembers it), 1 to 5, the
   * best when they rated several; 0 for none: the empty tray.
   */
  bowl: number;
}

const STRENGTH: readonly PoutineEvidence[] = ['unconfirmed', 'name', 'cuisine', 'confirmed'];

/** One point per pin: a place, or the places at one address, with the bowl this visitor gave. */
export function pinFeatures(
  groups: readonly PinGroup[],
  /** The stars this visitor gave, by place. */
  rated: Readonly<Record<string, number>> = {},
  /** Places raters confirmed serve poutine: solid pins, like any confirmed place. */
  confirmed: ReadonlySet<string> = new Set(),
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
          .map((place) => (confirmed.has(place.osm) ? 'confirmed' : place.poutine))
          .reduce((best, next) => (STRENGTH.indexOf(next) > STRENGTH.indexOf(best) ? next : best)),
        bowl: Math.max(
          0,
          ...group.places.map((place) => {
            const stars = rated[place.osm];
            return stars === undefined ? 0 : Math.max(1, Math.min(5, Math.round(stars)));
          }),
        ),
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
 * Each pin a small foil tray: empty where this visitor hasn't rated, their own bowl where they have
 * (Mr. Poo-teen for 1, loaded for 5), drawn above the empty ones. An empty tray nothing confirms
 * yet is faint. A shared pin carries its count on a gravy badge. The selected pin sits on a white
 * disc ringed in black.
 */
export const pinLayers: LayerSpecification[] = [
  {
    id: 'selected',
    type: 'circle',
    source: PLACES,
    filter: selectedFilter(null),
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 10, 9, 14, 13, 19, 16, 23],
      'circle-color': '#ffffff',
      'circle-stroke-color': '#000000',
      'circle-stroke-width': 2.5,
    },
  },
  {
    id: 'pins',
    type: 'symbol',
    source: PLACES,
    layout: {
      'icon-image': ['concat', 'bowl-', ['to-string', ['get', 'bowl']]],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 9, 0.6, 13, 0.85, 16, 1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'bowl'],
    },
    paint: {
      'icon-opacity': [
        'case',
        ['all', ['==', ['get', 'bowl'], 0], ['==', ['get', 'poutine'], 'unconfirmed']],
        0.45,
        1,
      ],
    },
  },
  {
    id: 'count-badges',
    type: 'circle',
    source: PLACES,
    filter: ['>', ['get', 'count'], 1],
    paint: {
      'circle-radius': 7,
      'circle-color': GRAVY,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-translate': [11, -8],
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
      'text-size': 10,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-translate': [11, -8],
    },
  },
];
