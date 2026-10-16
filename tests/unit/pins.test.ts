import { describe, expect, it } from 'vitest';
import type { Place } from '../../src/domain/osmPlaces.ts';
import { boundsOf, pinFeatures } from '../../src/map/pins.ts';

const at = (lon: number, lat: number): Place =>
  ({ osm: `node/${String(lon)}`, name: 'Cantine Trempette', lon, lat, poutine: 'name' }) as Place;

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

  it('draws one point per place with what the pin needs', () => {
    const { features } = pinFeatures([at(-73.6, 45.5)]);
    expect(features[0]?.geometry.coordinates).toEqual([-73.6, 45.5]);
    expect(features[0]?.properties).toEqual({
      osm: 'node/-73.6',
      name: 'Cantine Trempette',
      poutine: 'name',
    });
  });
});
