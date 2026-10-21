import { describe, expect, it } from 'vitest';
import type { Place } from '../../src/domain/osmPlaces.ts';
import { around, nearest, searchPlaces } from '../../src/domain/search.ts';

const place = (name: string, city: string, street = '', lat = 45.5, lon = -73.6): Place =>
  ({ osm: `node/${name}`, name, city, street, lat, lon }) as Place;

const places = [
  place('La Banquise', 'Montréal', 'Rue Rachel Est'),
  place('Casse-croûte Chez Trempette', 'Saint-Jérôme', 'Rue Labelle'),
  place('Cantine Grains', 'Drummondville', 'Boulevard Saint-Joseph'),
  place('Chez Poutini', 'Sainte-Adèle', 'Rue Banquise'),
  place('Patates Banquet', 'Lévis'),
];

const names = (query: string): string[] => searchPlaces(places, query).map((p) => p.name);

describe('searchPlaces', () => {
  it('finds names by the start of any word, accents and case ignored', () => {
    expect(names('banq')).toEqual(['La Banquise', 'Patates Banquet', 'Chez Poutini']);
    expect(names('la banq')).toEqual(['La Banquise']);
    expect(names('CASSE CROUTE')).toEqual(['Casse-croûte Chez Trempette']);
    expect(names('chez')).toEqual(['Chez Poutini', 'Casse-croûte Chez Trempette']);
  });

  it('finds every place in a town, St and Ste written either way', () => {
    expect(names('st-jerome')).toEqual(['Casse-croûte Chez Trempette']);
    expect(names('Ste Adele')).toEqual(['Chez Poutini']);
    expect(names('drummond')).toEqual(['Cantine Grains']);
  });

  it('finds the places with a vegan poutine, typed in English or French', () => {
    const vegan = [...places, { ...place('Aux Vivres', 'Montréal'), vegan: true as const }];
    const found = (query: string) => searchPlaces(vegan, query).map((p) => p.name);
    expect(found('vegan')).toEqual(['Aux Vivres']);
    expect(found('végane montréal')).toEqual(['Aux Vivres']);
    expect(found('végétalienne')).toEqual(['Aux Vivres']);
  });

  it('needs every word typed, and nothing for an empty search', () => {
    expect(names('cantine levis')).toEqual([]);
    expect(names('patates levis')).toEqual(['Patates Banquet']);
    expect(names('   ')).toEqual([]);
  });
});

describe('nearest', () => {
  it('lists the closest places first, with their distance', () => {
    const near = nearest(
      [
        place('Far', 'Québec', '', 46.81, -71.21),
        place('Close', 'Montréal', '', 45.501, -73.6),
        place('Middle', 'Laval', '', 45.6, -73.7),
      ],
      { lat: 45.5, lon: -73.6 },
      2,
    );
    expect(near.map((n) => n.place.name)).toEqual(['Close', 'Middle']);
    expect(near[0]?.meters).toBeCloseTo(111, 0);
  });
});

describe('around (À côté)', () => {
  // About 111 m a thousandth of a degree north of the point.
  const at = (name: string, km: number): Place =>
    place(name, 'Montréal', '', 45.5 + km / 111.2, -73.6);
  const here = { lat: 45.5, lon: -73.6 };
  const listed = (found: ReturnType<typeof around>): string[] =>
    found.nearby.map((n) => n.place.name);

  it('lists every place within 2 km, nearest first', () => {
    const found = around([at('Three', 3), at('One', 1), at('Half', 0.5), at('Two', 1.9)], here);
    expect(found.km).toBe(2);
    expect(listed(found)).toEqual(['Half', 'One', 'Two']);
    expect(found.closest).toBeNull();
  });

  it('looks within 5, then 10, then 15 km when nothing is closer', () => {
    expect(around([at('Nine', 9), at('Four', 4), at('Six', 6)], here)).toMatchObject({ km: 5 });
    expect(listed(around([at('Nine', 9), at('Six', 6), at('Twelve', 12)], here))).toEqual([
      'Six',
      'Nine',
    ]);
    expect(around([at('Twelve', 12), at('Fourteen', 14.5)], here)).toMatchObject({ km: 15 });
  });

  it('nothing within 15 km: no list, and the closest place however far', () => {
    const found = around([at('Forty', 40), at('Twenty', 20)], here);
    expect(found.km).toBe(15);
    expect(found.nearby).toEqual([]);
    expect(found.closest?.place.name).toBe('Twenty');
    expect(around([], here)).toEqual({ km: 15, nearby: [], closest: null });
  });
});
