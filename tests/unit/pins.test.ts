import { describe, expect, it } from 'vitest';
import { groupByAddress } from '../../src/domain/groups.ts';
import type { Place } from '../../src/domain/osmPlaces.ts';
import { boundsOf, pinFeatures } from '../../src/map/pins.ts';

const at = (lon: number, lat: number, extra: Partial<Place> = {}): Place =>
  ({
    osm: `node/${String(lon)}`,
    name: 'Cantine Trempette',
    housenumber: '',
    street: '',
    city: '',
    lon,
    lat,
    poutine: 'name',
    ...extra,
  }) as Place;

describe('pins', () => {
  it('opens on where the places are, leaving out the farthest few', () => {
    const places = [
      ...Array.from({ length: 38 }, (_, i) => at(-74 + i * 0.05, 45 + i * 0.02)),
      at(-57.1, 51.4),
      at(-67.1, 52.8),
    ];
    const [west, south, east, north] = boundsOf(places);
    expect(west).toBeCloseTo(-73.9);
    expect(south).toBeCloseTo(45.04);
    expect(east).toBeLessThan(-72);
    expect(north).toBeLessThan(46);
  });

  it('draws one point per pin, with its count and whether anything confirms it', () => {
    const shared = { housenumber: '1', street: 'Rue Principale', city: 'Saint-Rémi' };
    const { features } = pinFeatures(
      groupByAddress([
        at(-73.6, 45.5),
        at(-73.61, 45.26, { ...shared, poutine: 'unconfirmed' }),
        at(-73.62, 45.26, { ...shared, poutine: 'cuisine' }),
        at(-73.7, 45.3, { poutine: 'unconfirmed' }),
      ]),
    );
    expect(features.map((feature) => feature.properties)).toEqual([
      { id: 'node/-73.6', count: 1, poutine: 'name', visited: false },
      { id: 'node/-73.61', count: 2, poutine: 'cuisine', visited: false },
      { id: 'node/-73.7', count: 1, poutine: 'unconfirmed', visited: false },
    ]);
    expect(features[0]?.geometry.coordinates).toEqual([-73.6, 45.5]);
  });

  it('turns green the pins of places this visitor rated, shared pins included', () => {
    const shared = { housenumber: '1', street: 'Rue Principale', city: 'Saint-Rémi' };
    const groups = groupByAddress([
      at(-73.6, 45.5),
      at(-73.61, 45.26, shared),
      at(-73.62, 45.26, shared),
    ]);
    const visited = (rated: string[]) =>
      pinFeatures(groups, new Set(rated)).features.map((feature) => feature.properties.visited);
    expect(visited([])).toEqual([false, false]);
    expect(visited(['node/-73.6'])).toEqual([true, false]);
    expect(visited(['node/-73.62'])).toEqual([false, true]);
  });
});
