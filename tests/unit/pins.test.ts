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
      { id: 'node/-73.6', count: 1, poutine: 'name', bowl: 0 },
      { id: 'node/-73.61', count: 2, poutine: 'cuisine', bowl: 0 },
      { id: 'node/-73.7', count: 1, poutine: 'unconfirmed', bowl: 0 },
    ]);
    expect(features[0]?.geometry.coordinates).toEqual([-73.6, 45.5]);
  });

  it('shows the bowl this visitor gave, the best at a shared pin, the empty tray before', () => {
    const shared = { housenumber: '1', street: 'Rue Principale', city: 'Saint-Rémi' };
    const groups = groupByAddress([
      at(-73.6, 45.5),
      at(-73.61, 45.26, shared),
      at(-73.62, 45.26, shared),
    ]);
    const bowls = (rated: Record<string, number>) =>
      pinFeatures(groups, rated).features.map((feature) => feature.properties.bowl);
    expect(bowls({})).toEqual([0, 0]);
    expect(bowls({ 'node/-73.6': 1 })).toEqual([1, 0]);
    expect(bowls({ 'node/-73.62': 4, 'node/-73.61': 2 })).toEqual([0, 4]);
    expect(bowls({ 'node/-73.6': 4.5 })).toEqual([5, 0]);
  });

  it('makes solid the pin of a place raters confirmed', () => {
    const groups = groupByAddress([at(-73.7, 45.3, { poutine: 'unconfirmed' })]);
    const evidence = (confirmed: string[]) =>
      pinFeatures(groups, {}, new Set(confirmed)).features[0]?.properties.poutine;
    expect(evidence([])).toBe('unconfirmed');
    expect(evidence(['node/-73.7'])).toBe('confirmed');
  });
});
