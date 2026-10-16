import { describe, expect, it } from 'vitest';
import {
  applyPicks,
  isChain,
  normalizePhone,
  normalizePostcode,
  normalizeUrl,
  poutineEvidence,
  profileUrl,
  provinceCode,
  selectPlaces,
  type OsmElement,
  type Town,
} from '../../src/domain/osmPlaces.ts';

const node = (id: number, tags: Record<string, string>, lat = 46.8, lon = -71.2): OsmElement => ({
  type: 'node',
  id,
  lat,
  lon,
  tags: { amenity: 'fast_food', ...tags },
});

const towns: Town[] = [
  { name: 'Saint-Rémi', lat: 45.26, lon: -73.61 },
  { name: 'Québec', lat: 46.81, lon: -71.21 },
];

describe('poutineEvidence', () => {
  it('trusts the cuisine first, then the name', () => {
    expect(poutineEvidence({ name: 'La Banquise', cuisine: 'poutine;burger' })).toBe('cuisine');
    expect(poutineEvidence({ name: 'Casse-Croûte Chez Line' })).toBe('name');
    expect(poutineEvidence({ name: 'Cantine du Quai' })).toBe('name');
    expect(poutineEvidence({ name: 'Patates Trempette' })).toBe('name');
  });

  it('leaves out a bistro called cantine and a steak-frites restaurant', () => {
    expect(poutineEvidence({ name: 'La Cantine Grains', cuisine: 'vietnamese' })).toBeNull();
    expect(
      poutineEvidence({
        name: 'Steak Frites Poutini',
        amenity: 'restaurant',
        cuisine: 'steak_house',
      }),
    ).toBeNull();
  });

  it('keeps dairy bars and snack bars that cook fries or hot dogs, unconfirmed', () => {
    expect(poutineEvidence({ name: 'Bar laitier Trempette', amenity: 'fast_food' })).toBe(
      'unconfirmed',
    );
    expect(poutineEvidence({ name: 'Bar laitier Grains', amenity: 'ice_cream' })).toBeNull();
    expect(poutineEvidence({ name: 'Chez Grains', amenity: 'fast_food', cuisine: 'hot_dog' })).toBe(
      'unconfirmed',
    );
    expect(
      poutineEvidence({ name: 'Burger Trempette', amenity: 'fast_food', cuisine: 'burger' }),
    ).toBeNull();
  });
});

describe('isChain', () => {
  it('knows chains by brand or by name', () => {
    expect(isChain({ name: 'Anything', brand: 'Benny & Co.' })).toBe(true);
    expect(isChain({ name: 'Pataterie La Belle Province' })).toBe(true);
    expect(isChain({ name: 'Mac Donald' })).toBe(true);
    expect(isChain({ name: 'Casse-croûte Courteau' })).toBe(false);
  });
});

describe('normalizing details', () => {
  it('writes phones as E.164 and drops what is not a number', () => {
    expect(normalizePhone('(613) 524-2952')).toBe('+16135242952');
    expect(normalizePhone('+1-819-555-0101;+1 819 555 0102')).toBe('+18195550101');
    expect(normalizePhone('418 555-0123 poste 4')).toBe('+14185550123');
    expect(normalizePhone('555-0123')).toBe('');
  });

  it('gives web addresses a scheme and profiles a full address', () => {
    expect(normalizeUrl('casse-croute.example')).toBe('https://casse-croute.example/');
    expect(normalizeUrl('not a site')).toBe('');
    expect(profileUrl('@cantinetrempette', 'www.instagram.com')).toBe(
      'https://www.instagram.com/cantinetrempette',
    );
    expect(profileUrl('https://www.facebook.com/p/Grains-1/', 'www.facebook.com')).toBe(
      'https://www.facebook.com/p/Grains-1/',
    );
  });

  it('spaces postal codes and names provinces by their code', () => {
    expect(normalizePostcode('g5j2g2')).toBe('G5J 2G2');
    expect(provinceCode('Ontario')).toBe('ON');
    expect(provinceCode('CA-ON')).toBe('ON');
    expect(provinceCode('Québec')).toBe('QC');
    expect(provinceCode('Vermont')).toBe('');
  });
});

describe('selectPlaces', () => {
  it('keeps one place per name within 75 m, the richer one', () => {
    const { places, dropped } = selectPlaces(
      [
        node(1, { name: 'Cantine Trempette' }),
        node(2, { name: 'Cantine Trempette', phone: '418 555 0101' }, 46.8003, -71.2),
      ],
      towns,
      [],
    );
    expect(places.map((p) => p.osm)).toEqual(['node/2']);
    expect(dropped.duplicate).toBe(1);
  });

  it('drops a name at five separate spots, but not a family shack at three', () => {
    const at = (id: number, name: string, step: number): OsmElement =>
      node(id, { name: `Casse-croûte ${name}` }, 46 + step * 0.1, -72);
    const elements = [
      ...[0, 1, 2, 3, 4].map((step) => at(10 + step, 'Grains Express', step)),
      ...[0, 1, 2].map((step) => at(20 + step, 'Courteau', step)),
    ];
    const { places, dropped } = selectPlaces(elements, towns, []);
    expect(places.every((p) => p.name === 'Casse-croûte Courteau')).toBe(true);
    expect(places).toHaveLength(3);
    expect(dropped['repeated-name']).toBe(5);
  });

  it('keeps a pick anywhere, confirmed, with no Québec town outside Québec', () => {
    const barouche: OsmElement = node(9, { name: 'La Barouche' }, 45.3758, -74.9019);
    const { places } = selectPlaces(
      [barouche],
      towns,
      [{ osm: 'node/9', name: 'La Barouche', confirmed: true }],
      new Set(['node/9']),
    );
    expect(places[0]).toMatchObject({
      poutine: 'confirmed',
      picked: true,
      city: '',
      citySource: 'none',
      province: '',
    });
  });

  it('gives a Québec place with no town the nearest one, and its own when it has one', () => {
    const { places } = selectPlaces(
      [
        node(1, { name: 'Cantine Poutini' }, 45.27, -73.6),
        node(2, { name: 'Cantine Grains', 'addr:city': 'Lévis' }),
      ],
      towns,
      [],
    );
    expect(places.map((p) => [p.city, p.citySource, p.province])).toEqual([
      ['Saint-Rémi', 'nearest-town', 'QC'],
      ['Lévis', 'osm', 'QC'],
    ]);
  });
});

describe('applyPicks', () => {
  it('lays a pick’s details over the list, normalized', () => {
    const { places } = selectPlaces([node(9, { name: 'La Barouche' })], towns, [
      { osm: 'node/9', name: 'La Barouche' },
    ]);
    const [barouche] = applyPicks(places, [
      {
        osm: 'node/9',
        name: 'La Barouche',
        confirmed: true,
        details: { housenumber: '4755', street: 'Ste-Catherine', phone: '(613) 524-2952' },
      },
    ]);
    expect(barouche).toMatchObject({
      housenumber: '4755',
      street: 'Ste-Catherine',
      phone: '+16135242952',
      poutine: 'confirmed',
      picked: true,
    });
  });
});
