import { describe, expect, it } from 'vitest';
import { placementFor, splitStreet, type AddressCandidate } from '../../src/domain/addresses.ts';
import { possibleDuplicates } from '../../src/domain/duplicates.ts';
import { withAdded, type Place } from '../../src/domain/osmPlaces.ts';
import { approvedPlace, checkNewPlace } from '../../src/domain/submission.ts';

const sent = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Cantine Trempette',
  street: '559, boulevard Perron',
  city: 'Carleton-sur-Mer',
  province: '',
  postcode: 'g0c1j0',
  lat: 48.1049,
  lon: -66.1278,
  placedBy: 'address',
  phone: '(418) 555-0101',
  website: 'cantinetrempette.example',
  servesPoutine: true,
  ...overrides,
});

describe('checkNewPlace', () => {
  it('tidies a good place as the list is', () => {
    expect(checkNewPlace(sent())).toEqual({
      place: {
        name: 'Cantine Trempette',
        housenumber: '559',
        street: 'boulevard Perron',
        city: 'Carleton-sur-Mer',
        province: 'QC',
        postcode: 'G0C 1J0',
        lat: 48.1049,
        lon: -66.1278,
        placedBy: 'address',
        phone: '+14185550101',
        website: 'https://cantinetrempette.example/',
      },
    });
    expect(
      checkNewPlace(sent({ website: 'facebook.com/cantinetrempette', province: 'Ontario' })),
    ).toMatchObject({
      place: { website: 'https://facebook.com/cantinetrempette', province: 'ON' },
    });
  });

  it('names every problem the form must show', () => {
    expect(
      checkNewPlace(
        sent({
          name: ' ',
          city: '',
          lat: 10,
          phone: '555',
          website: 'not a site',
          servesPoutine: false,
        }),
      ),
    ).toEqual({ problems: ['name', 'town', 'position', 'phone', 'website', 'poutine'] });
    expect(checkNewPlace(sent({ name: 'x'.repeat(121) }))).toEqual({ problems: ['too-long'] });
  });

  it('refuses anything that isn’t a place: extra fields, wrong types, unknown placing', () => {
    expect(checkNewPlace(sent({ email: 'grains@example.com' }))).toEqual({
      problems: ['not-a-place'],
    });
    expect(checkNewPlace(sent({ name: 42 }))).toEqual({ problems: ['not-a-place'] });
    expect(checkNewPlace(sent({ placedBy: 'magic' }))).toEqual({ problems: ['not-a-place'] });
    expect(checkNewPlace(null)).toEqual({ problems: ['not-a-place'] });
    expect(checkNewPlace([])).toEqual({ problems: ['not-a-place'] });
  });
});

describe('placementFor (Terrain’s rules)', () => {
  const candidate = (overrides: Partial<AddressCandidate>): AddressCandidate => ({
    lat: 45.5252,
    lon: -73.5747,
    number: '994',
    street: 'Rue Rachel Est',
    town: 'Montréal',
    postalCode: 'H2J2J3',
    ...overrides,
  });
  const query = { street: '994 rue Rachel E', town: 'Montreal', postalCode: '', province: 'QC' };

  it('puts the place at its civic number, with its postal code', () => {
    expect(placementFor({ ...query, street: '994, rue Rachel Est' }, [candidate({})])).toEqual({
      lat: 45.5252,
      lon: -73.5747,
      precision: 'address',
      postalCode: 'H2J2J3',
    });
  });

  it('falls back to the street, and never to a street in another town', () => {
    expect(
      placementFor({ ...query, street: '996 Rachel Est' }, [candidate({ number: '', lat: 45.53 })]),
    ).toMatchObject({ precision: 'street', lat: 45.53 });
    expect(placementFor(query, [candidate({ town: 'Laval' })])).toBeNull();
  });

  it('splits the civic number from the street', () => {
    expect(splitStreet('4755 Ste-Catherine')).toEqual({
      housenumber: '4755',
      street: 'Ste-Catherine',
    });
    expect(splitStreet('12A, rang Double')).toEqual({ housenumber: '12A', street: 'rang Double' });
    expect(splitStreet('Route 132')).toEqual({ housenumber: '', street: 'Route 132' });
  });
});

describe('possibleDuplicates', () => {
  const place = (name: string, lat: number, lon: number, extra: Partial<Place> = {}): Place =>
    ({
      osm: `node/${name}`,
      name,
      lat,
      lon,
      housenumber: '',
      street: '',
      city: 'Montréal',
      ...extra,
    }) as Place;
  const added = {
    name: 'Casse-croûte Chez Trempette',
    housenumber: '',
    street: '',
    city: 'Montréal',
    lat: 45.5,
    lon: -73.6,
  };

  it('finds the same building, the same address, and a name alike close by', () => {
    const places = [
      place('Bar laitier Grains', 45.5001, -73.6), // 11 m: one building
      place('Trempette', 45.5009, -73.6), // 100 m, name alike
      place('Cantine Poutini', 45.5009, -73.6001), // 100 m, another place
      place('Trempette', 45.51, -73.6), // 1.1 km
      place('Chez Moi', 45.6, -73.6, { housenumber: '1', street: 'Rue Principale' }),
    ];
    expect(possibleDuplicates(places, added).map((p) => p.name)).toEqual([
      'Bar laitier Grains',
      'Trempette',
    ]);
    expect(
      possibleDuplicates(places, {
        ...added,
        housenumber: '1',
        street: 'rue principale',
        lat: 46,
      }).map((p) => p.name),
    ).toEqual(['Chez Moi']);
  });

  it('doesn’t take two generic names for one place unless both say only what they are', () => {
    const near = [place('Casse-croûte', 45.5009, -73.6)];
    expect(possibleDuplicates(near, { ...added, name: 'Cantine' })).toHaveLength(1);
    expect(possibleDuplicates(near, added)).toHaveLength(0);
  });
});

describe('approved places', () => {
  it('join the list as confirmed, with a Facebook page where the card shows one', () => {
    const checked = checkNewPlace(sent({ website: 'https://www.facebook.com/cantinetrempette' }));
    if (!('place' in checked)) throw new Error('expected a place');
    expect(approvedPlace(7, checked.place)).toMatchObject({
      osm: 'added/7',
      name: 'Cantine Trempette',
      citySource: 'visitor',
      addressCheck: 'confirmed',
      poutine: 'confirmed',
      picked: false,
      website: '',
      facebook: 'https://www.facebook.com/cantinetrempette',
      phone: '+14185550101',
    });
  });

  it('replace a place of the same ID and go at the end of the list', () => {
    const listed = [{ osm: 'node/1' }, { osm: 'added/7', name: 'old' }] as Place[];
    const added = [{ osm: 'added/7', name: 'new' }, { osm: 'added/8' }] as Place[];
    expect(withAdded(listed, added).map((p) => [p.osm, p.name])).toEqual([
      ['node/1', undefined],
      ['added/7', 'new'],
      ['added/8', undefined],
    ]);
  });
});
