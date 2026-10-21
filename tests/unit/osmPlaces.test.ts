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
  merged,
  selectPlaces,
  twins,
  whyListed,
  withAdded,
  type OsmElement,
  type Place,
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
  });

  it('widens to burger and chicken counters, snack bars and family restaurants, each a group', () => {
    const burger = { name: 'Burger Trempette', amenity: 'fast_food', cuisine: 'burger' };
    expect(whyListed(burger)).toBe('burger-or-chicken');
    expect(poutineEvidence(burger)).toBe('unconfirmed');
    expect(poutineEvidence(burger, new Set(['snack-bar']))).toBeNull();
    expect(whyListed({ name: 'Chez Grains', amenity: 'fast_food' })).toBe('snack-bar');
    expect(
      whyListed({ name: 'Le Relais Grains', amenity: 'restaurant', cuisine: 'burger;regional' }),
    ).toBe('family-restaurant');
    expect(
      whyListed({ name: 'Le Relais Grains', amenity: 'restaurant', cuisine: 'regional' }),
    ).toBe('quebec-restaurant');
    expect(
      whyListed({ name: 'Cabane à sucre Grains', amenity: 'restaurant', cuisine: 'regional' }),
    ).toBeNull();
  });

  it('keeps out what cooks something else, by cuisine or by name', () => {
    expect(
      whyListed({ name: 'Poulet Grains', amenity: 'fast_food', cuisine: 'chicken;korean' }),
    ).toBeNull();
    expect(whyListed({ name: 'Pizzeria Trempette', amenity: 'fast_food' })).toBeNull();
    expect(whyListed({ name: 'Sushi Trempette', amenity: 'fast_food' })).toBeNull();
    expect(whyListed({ name: 'Café Grains', amenity: 'fast_food' })).toBeNull();
    expect(
      whyListed({ name: 'Le Grains', amenity: 'restaurant', cuisine: 'italian;pizza' }),
    ).toBeNull();
    expect(whyListed({ name: 'Crèmerie Trempette', amenity: 'ice_cream' })).toBeNull();
  });
});

describe('isChain', () => {
  it('knows chains by brand or by name', () => {
    expect(isChain({ name: 'Anything', brand: 'Benny & Co.' })).toBe(true);
    expect(isChain({ name: 'Pataterie La Belle Province' })).toBe(true);
    expect(isChain({ name: 'Aridang' })).toBe(true);
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

  it('takes a vegan-only place for a vegan poutine, vegan options for no promise', () => {
    const { places } = selectPlaces(
      [
        node(31, { name: 'Casse-croûte Végé', 'diet:vegan': 'only' }),
        node(32, { name: 'Casse-croûte Mixte', 'diet:vegan': 'yes' }, 46.9),
      ],
      towns,
      [],
    );
    expect(places.map((p) => [p.name, p.vegan])).toEqual([
      ['Casse-croûte Végé', true],
      ['Casse-croûte Mixte', undefined],
    ]);
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

describe('two entries for one place', () => {
  const at = (details: Partial<Place>): Place => ({
    osm: 'node/1',
    name: 'Le Verger à Grains',
    housenumber: '260',
    street: 'Rang du Bas-Saint-Jacques',
    city: 'Saint-Elzéar',
    citySource: 'osm',
    province: 'QC',
    postcode: '',
    addressCheck: 'unchecked',
    lat: 46.4143,
    lon: -71.0746,
    phone: '',
    website: '',
    facebook: '',
    instagram: '',
    menu: '',
    openingHours: '',
    cuisine: [],
    poutine: 'unconfirmed',
    picked: false,
    ...details,
  });

  it('takes a name and its long form at one address for one place, a generic name never', () => {
    const short = at({ osm: 'way/2' });
    const long = at({ name: 'Le Verger à Grains - Ferme brassicole - Boutique', lat: 46.41431 });
    expect(twins(short, long)).toBe(true);
    expect(twins(at({ name: 'Casse-croûte' }), at({ name: 'Casse-croûte Trempette' }))).toBe(false);
    expect(twins(short, at({ name: 'Le Verger à Grains', housenumber: '9', lat: 46.42 }))).toBe(
      false,
    );
    // The same name a little farther, or at one address however far; words of one in the other.
    expect(twins(short, at({ lat: 46.4153 }))).toBe(true);
    expect(twins(short, at({ street: 'Rg du Bas-St-Jacques', lat: 46.42 }))).toBe(true);
    expect(
      twins(
        at({ name: 'Grains traiteur' }),
        at({ name: 'Traiteur Grains et Crèmerie', lat: 46.4146 }),
      ),
    ).toBe(true);
  });

  it('merges them: what one lacks from the other, the short name, the known ID kept', () => {
    const long = at({
      name: 'Le Verger à Grains - Ferme brassicole - Boutique',
      facebook: 'https://www.facebook.com/grains/',
      cuisine: ['regional'],
    });
    const short = at({ osm: 'way/2', phone: '+14185550123' });
    expect(merged(long, short)).toMatchObject({
      osm: 'way/2',
      name: 'Le Verger à Grains',
      facebook: 'https://www.facebook.com/grains/',
      phone: '+14185550123',
      cuisine: ['regional'],
    });
    expect(merged(long, short, { known: new Set(['node/1']) }).osm).toBe('node/1');
  });

  it('takes the pin that stands on their address when only one does', () => {
    const onStreet = at({ osm: 'added/3', addressCheck: 'unchecked', lat: 46.42 });
    const onAddress = at({ osm: 'node/4', addressCheck: 'confirmed' });
    expect(merged(onStreet, onAddress, { own: true })).toMatchObject({
      osm: 'added/3',
      lat: 46.4143,
      addressCheck: 'confirmed',
    });
    // And the street as Adresses Québec spells it.
    const shortened = { ...onStreet, street: 'Rg du Bas-St-Jacques' };
    expect(merged(shortened, onAddress, { own: true }).street).toBe('Rang du Bas-Saint-Jacques');
  });

  it('keeps the link of the entry merged away, which opens the place still', () => {
    const kept = at({ osm: 'added/6', name: 'Alfa', link: 'alfa' });
    const other = at({
      osm: 'way/7',
      name: 'Alfa Hot-dog',
      addressCheck: 'confirmed',
      link: 'alfahotdog',
      oldLinks: ['alfa2'],
    });
    expect(merged(kept, other, { own: true })).toMatchObject({
      osm: 'added/6',
      link: 'alfa',
      absorbed: ['way/7'],
      oldLinks: ['alfa2', 'alfahotdog'],
    });
    // Run again with the list as it was last written (--offline): the twin is gone, not its link.
    const written = { ...merged(kept, other, { own: true }), absorbed: undefined };
    const fresh = at({ osm: 'added/6', name: 'Alfa', addressCheck: 'unchecked', lat: 46.42 });
    expect(withAdded([written], [fresh])[0]).toMatchObject({
      oldLinks: ['alfa2', 'alfahotdog'],
      lat: 46.4143,
    });
  });

  it('lets a place Alex approved stand for its OpenStreetMap twin, filled in from it', () => {
    const approved = at({ osm: 'added/2', name: 'Restaurant Trempette', poutine: 'confirmed' });
    const listed = at({ osm: 'node/9', name: 'Restaurant Trempette', phone: '+14185550123' });
    const places = withAdded(
      [listed, at({ osm: 'node/5', name: 'Cantine Poutini', lat: 47 })],
      [approved],
    );
    expect(places.map((place) => place.osm)).toEqual(['node/5', 'added/2']);
    expect(places[1]).toMatchObject({ phone: '+14185550123', poutine: 'confirmed' });
  });
});
