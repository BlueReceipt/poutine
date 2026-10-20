import { describe, expect, it } from 'vitest';
import { localityFor, type LocalityPoint } from '../../src/domain/localities.ts';
import type { Place } from '../../src/domain/osmPlaces.ts';
import { townText } from '../../src/domain/placeText.ts';
import { searchPlaces } from '../../src/domain/search.ts';
import { searchFor } from '../../src/domain/shortLinks.ts';

const place = (details: Partial<Place>): Place => ({
  osm: 'node/1',
  name: 'Casse-croûte Trempette',
  housenumber: '',
  street: '',
  city: 'Mirabel',
  citySource: 'adresses-quebec',
  province: 'QC',
  postcode: '',
  addressCheck: 'unchecked',
  lat: 45.65,
  lon: -74.09,
  phone: '',
  website: '',
  facebook: '',
  instagram: '',
  menu: '',
  openingHours: '',
  cuisine: [],
  poutine: 'name',
  picked: false,
  ...details,
});

// About 111 m a thousandth of a degree north.
const point = (
  name: string,
  kind: string,
  north: number,
  municipality = 'Mirabel',
): LocalityPoint => ({ name, kind, lat: 45.65 + north / 111_000, lon: -74.09, municipality });

describe('localityFor', () => {
  it('names the village of a merged town, the nearest one in it', () => {
    expect(
      localityFor(place({}), 'Mirabel', [
        point('Saint-Grains', 'suburb', 900),
        point('Sainte-Trempette', 'village', 150),
        point('Mirabel', 'city', 4000),
      ]),
    ).toBe('Sainte-Trempette');
  });

  it('leaves out neighbourhoods, far villages and the next town’s', () => {
    const near = [
      point('Le Quartier', 'neighbourhood', 50),
      point('Sainte-Trempette', 'village', 1700),
      point('Lorraine', 'town', 300, 'Lorraine'),
    ];
    expect(localityFor(place({}), 'Mirabel', near)).toBeNull();
  });

  it('says nothing in the town’s own centre, in Montréal, Québec and Laval, or for a named town', () => {
    const villages = [point('Sainte-Trempette', 'village', 600)];
    expect(localityFor(place({}), 'Mirabel', [...villages, point('Mirabel', 'city', 200)])).toBe(
      null,
    );
    expect(
      localityFor(place({ city: 'Montréal' }), 'Montréal', [
        point('Verdun', 'suburb', 100, 'Montréal'),
      ]),
    ).toBeNull();
    expect(localityFor(place({ city: 'Saint-Canut' }), 'Mirabel', villages)).toBeNull();
  });

  it('takes no other spelling of the town for a village', () => {
    const shawinigan = place({ city: 'Shawinigan' });
    expect(
      localityFor(shawinigan, 'Shawinigan', [
        point('Shawinigan-Sud', 'suburb', 200, 'Shawinigan'),
        point('Saint-Grains-des-Piles', 'village', 900, 'Shawinigan'),
      ]),
    ).toBeNull();
    expect(
      localityFor(place({ city: 'Beloeil' }), 'Beloeil', [point('Belœil', 'town', 300, 'Beloeil')]),
    ).toBeNull();
  });
});

describe('a place in a village', () => {
  const inVillage = place({ locality: 'Sainte-Scholastique' });

  it('shows the village before its town and is found by either', () => {
    expect(townText(inVillage, (town) => `near ${town}`)).toBe('Sainte-Scholastique (Mirabel)');
    expect(searchPlaces([inVillage], 'scholastique')).toEqual([inVillage]);
    expect(searchPlaces([inVillage], 'mirabel')).toEqual([inVillage]);
    expect(searchFor('saintescholastique', [inVillage])).toBe('Sainte-Scholastique');
  });
});
