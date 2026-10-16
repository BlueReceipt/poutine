import { describe, expect, it } from 'vitest';
import { groupByAddress } from '../../src/domain/groups.ts';
import type { Place } from '../../src/domain/osmPlaces.ts';
import {
  addressLines,
  directionsUrl,
  displayPhone,
  googleMapsUrl,
} from '../../src/domain/placeText.ts';

const place = (overrides: Partial<Place>): Place => ({
  osm: 'node/1',
  name: 'Cantine Trempette',
  housenumber: '559',
  street: 'Boulevard Perron',
  city: 'Carleton-sur-Mer',
  citySource: 'osm',
  province: 'QC',
  postcode: 'G0C 1J0',
  addressCheck: 'confirmed',
  lat: 48.1049,
  lon: -66.1278,
  phone: '+14185550101',
  website: '',
  facebook: '',
  instagram: '',
  menu: '',
  openingHours: '',
  cuisine: [],
  poutine: 'name',
  picked: false,
  ...overrides,
});

const near = (town: string): string => `near ${town}`;

describe('place text', () => {
  it('writes the phone the Québec way', () => {
    expect(displayPhone('+16135242952')).toBe('613 524-2952');
    expect(displayPhone('+44 20')).toBe('+44 20');
  });

  it('gives the street, then the town and postal code; the province only outside Québec', () => {
    expect(addressLines(place({}), near)).toEqual([
      '559 Boulevard Perron',
      'Carleton-sur-Mer  G0C 1J0',
    ]);
    expect(
      addressLines(
        place({
          street: 'Ste-Catherine',
          housenumber: '4755',
          city: 'Saint-Isidore',
          province: 'ON',
          postcode: '',
        }),
        near,
      ),
    ).toEqual(['4755 Ste-Catherine', 'Saint-Isidore, ON']);
    expect(
      addressLines(
        place({ housenumber: '', street: '', citySource: 'nearest-town', postcode: '' }),
        near,
      ),
    ).toEqual(['near Carleton-sur-Mer']);
  });

  it('links directions to the pin and the listing by name and address', () => {
    expect(directionsUrl(place({}))).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=48.1049,-66.1278',
    );
    expect(googleMapsUrl(place({}))).toBe(
      'https://www.google.com/maps/search/?api=1&query=Cantine%20Trempette%2C%20559%20Boulevard%20Perron%2C%20Carleton-sur-Mer%2C%20QC',
    );
  });
});

describe('groupByAddress', () => {
  it('shares a pin only between places at the same street address', () => {
    const groups = groupByAddress([
      place({ osm: 'node/1', name: 'Cantine Trempette' }),
      place({ osm: 'node/2', name: 'Bar laitier Grains', street: 'boulevard Perron' }),
      place({ osm: 'node/3', name: 'Casse-croûte Poutini', housenumber: '561' }),
      place({ osm: 'node/4', name: 'Cantine Sans Adresse', housenumber: '', street: '' }),
      place({ osm: 'node/5', name: 'Patates Sans Adresse', housenumber: '', street: '' }),
    ]);
    expect(groups.map((group) => group.places.map((p) => p.osm))).toEqual([
      ['node/1', 'node/2'],
      ['node/3'],
      ['node/4'],
      ['node/5'],
    ]);
    expect(groups[0]?.id).toBe('node/1');
  });
});
