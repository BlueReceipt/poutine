import { describe, expect, it } from 'vitest';
import type { Place } from '../../src/domain/osmPlaces.ts';
import { nearest, searchPlaces } from '../../src/domain/search.ts';

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
