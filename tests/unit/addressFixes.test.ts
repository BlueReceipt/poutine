import { describe, expect, it } from 'vitest';
import {
  addressPoint,
  applyFixes,
  proposalFor,
  staleFixes,
  type AddressPoint,
  type Fix,
} from '../../src/domain/addressFixes.ts';
import { applyPicks, type Place } from '../../src/domain/osmPlaces.ts';

const place = (details: Partial<Place>): Place => ({
  osm: 'node/1',
  name: 'Cantine Trempette',
  housenumber: '',
  street: '',
  city: 'Gatineau',
  citySource: 'osm',
  province: 'QC',
  postcode: '',
  addressCheck: 'unchecked',
  lat: 45.58,
  lon: -75.41,
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

const point = (address: string, meters: number): AddressPoint => {
  const [, number = '', street = '', city = ''] = /^(\d+\w?) (.+), (.+)$/.exec(address) ?? [];
  return { housenumber: number, street, city, postcode: '', meters };
};

const SOURCE = 'Adresses Québec (CC BY 4.0): the civic address at the pin, checked 2026-10-20';

describe('addressPoint', () => {
  it('reads Adresses Québec’s formatted address, the street type capitalized', () => {
    expect(addressPoint('1035 rue Rachel Est, Montréal H2J2J5', 1035, null, 3.4)).toEqual({
      housenumber: '1035',
      street: 'Rue Rachel Est',
      city: 'Montréal',
      postcode: 'H2J 2J5',
      meters: 3.4,
    });
    expect(addressPoint('397 A boulevard Lacombe, Repentigny', 397, 'A', 1)).toMatchObject({
      housenumber: '397A',
      street: 'Boulevard Lacombe',
      city: 'Repentigny',
      postcode: '',
    });
    expect(addressPoint('nothing to read', 12, null, 1)).toBeNull();
  });

  it('keeps a half number apart and drops the town a shared street name carries', () => {
    expect(addressPoint('124 1/2 rue Maclaren Est, Gatineau J8L1K2', 124, '1/2', 18)).toMatchObject(
      { housenumber: '124 1/2', street: 'Rue Maclaren Est' },
    );
    expect(
      addressPoint('3175 rue Saint-Jacques (Montréal), Montréal H4C1G7', 3175, null, 4),
    ).toMatchObject({ street: 'Rue Saint-Jacques', city: 'Montréal' });
  });
});

describe('proposalFor', () => {
  it('writes the street as Adresses Québec does when the same number sits on it', () => {
    const proposal = proposalFor(
      place({ housenumber: '120', street: 'Rue Grains Ouest', addressCheck: 'far' }),
      [point('120 Rue Grains Est, Gatineau', 1)],
      'Gatineau',
      SOURCE,
    );
    expect(proposal).toMatchObject({
      kind: 'spelling',
      now: '120 Rue Grains Ouest, Gatineau',
      fix: { street: 'Rue Grains Est', source: SOURCE, was: '120 Rue Grains Ouest, Gatineau' },
    });
    expect(proposal?.fix?.housenumber).toBeUndefined();
  });

  it('takes the street’s other name when the pin is on the same number', () => {
    expect(
      proposalFor(
        place({ housenumber: '1365', street: 'Route Trans-Canadienne', addressCheck: 'not-found' }),
        [point('1365 Route 117, Gatineau', 3)],
        'Gatineau',
        SOURCE,
      ),
    ).toMatchObject({ kind: 'street', fix: { street: 'Route 117' } });
  });

  it('offers the pin’s number, to check, over one Adresses Québec doesn’t know', () => {
    const proposal = proposalFor(
      place({ housenumber: '635', street: 'Route des Pionniers', addressCheck: 'not-found' }),
      [
        point('653 Route des Pionniers, Gatineau', 1),
        point('655 Route des Pionniers, Gatineau', 4),
      ],
      'Gatineau',
      SOURCE,
    );
    expect(proposal).toMatchObject({
      kind: 'number',
      fix: { housenumber: '653' },
      alsoNear: ['655 Route des Pionniers, Gatineau (4 m)'],
    });
  });

  it('isn’t sure of a street’s type when the list’s own street is at the pin too', () => {
    expect(
      proposalFor(
        place({ housenumber: '94', street: 'Boulevard Grains', addressCheck: 'not-found' }),
        [point('94 Place Grains, Gatineau', 5), point('92 Boulevard Grains, Gatineau', 18)],
        'Gatineau',
        SOURCE,
      ),
    ).toMatchObject({ kind: 'number', fix: { street: 'Place Grains' } });
  });

  it('leaves a far address with another number at the pin to look at by hand', () => {
    const proposal = proposalFor(
      place({ housenumber: '3665', street: 'Rue Grains', addressCheck: 'far' }),
      [point('4579 Rue Grains, Gatineau', 6)],
      'Gatineau',
      SOURCE,
    );
    expect(proposal).toMatchObject({ kind: 'look' });
    expect(proposal?.fix).toBeUndefined();
  });

  it('fills a missing address from the pin, sure only when it is alone there', () => {
    expect(
      proposalFor(place({}), [point('502 Route Poutini, Gatineau', 12)], 'Gatineau', SOURCE),
    ).toMatchObject({ kind: 'fill', fix: { housenumber: '502', street: 'Route Poutini' } });
    expect(
      proposalFor(
        place({}),
        [point('502 Route Poutini, Gatineau', 12), point('502A Route Poutini, Gatineau', 14)],
        'Gatineau',
        SOURCE,
      )?.kind,
    ).toBe('fill');
    expect(
      proposalFor(
        place({}),
        [point('502 Route Poutini, Gatineau', 12), point('510 Route Poutini, Gatineau', 20)],
        'Gatineau',
        SOURCE,
      )?.kind,
    ).toBe('nearest');
    expect(
      proposalFor(place({}), [point('502 Route Poutini, Gatineau', 40)], 'Gatineau', SOURCE),
    ).toMatchObject({ kind: 'look' });
    // A street named in the list with no number: only that street's numbers fill it surely.
    const onStreet = place({ street: 'Boulevard Grains' });
    expect(
      proposalFor(onStreet, [point('80 Boulevard Grains, Gatineau', 20)], 'Gatineau', SOURCE),
    ).toMatchObject({ kind: 'fill', fix: { housenumber: '80' } });
    expect(
      proposalFor(onStreet, [point('25 Avenue Poutini, Gatineau', 6)], 'Gatineau', SOURCE)?.kind,
    ).toBe('nearest');
  });

  it('fixes a slip of the town, but keeps every locality', () => {
    const typed = place({
      housenumber: '200',
      street: 'Rue Principale',
      city: 'Ste-Céclie',
      addressCheck: 'confirmed',
    });
    expect(proposalFor(typed, [], 'Sainte-Cécile', SOURCE)).toMatchObject({
      kind: 'town',
      fix: { city: 'Sainte-Cécile' },
    });
    expect(proposalFor({ ...typed, city: 'Q' }, [], 'Sainte-Cécile', SOURCE)?.kind).toBe('town');
    expect(proposalFor({ ...typed, city: 'St-Cécile' }, [], 'Saint-Cécile', SOURCE)).toBeNull();
    const village = place({
      housenumber: '41',
      street: 'Chemin Grains',
      city: 'Trempette',
      addressCheck: 'not-found',
    });
    // A village inside a bigger municipality, known to OpenStreetMap or not, keeps its name.
    expect(
      proposalFor(village, [point('41 Chemin Grains, Grande-Côte', 3)], 'Grande-Côte', SOURCE),
    ).toBeNull();
    // One spelled close to the municipality's stays too when OpenStreetMap knows it.
    expect(
      proposalFor({ ...typed, city: 'Ste-Cécilia' }, [], 'Sainte-Cécile', SOURCE, [
        'Sainte-Cécilia',
      ]),
    ).toBeNull();
  });
});

describe('applyFixes', () => {
  const fix: Fix = {
    name: 'Cantine Trempette',
    street: 'Rue Grains Est',
    city: 'Gatineau',
    postcode: 'j8t4l8',
    source: SOURCE,
    was: '120 Rue Grains Ouest, Hull',
  };
  const listed = place({
    housenumber: '120',
    street: 'Rue Grains Ouest',
    city: 'Hull',
    addressCheck: 'far',
  });

  it('lays a fix over the place, its address waiting for the next check', () => {
    const [fixed] = applyFixes([listed], { 'node/1': fix });
    expect(fixed).toMatchObject({
      housenumber: '120',
      street: 'Rue Grains Est',
      city: 'Gatineau',
      citySource: 'fix',
      postcode: 'J8T 4L8',
      addressCheck: 'unchecked',
    });
    const [again] = applyFixes([{ ...fixed!, addressCheck: 'confirmed' }], { 'node/1': fix });
    expect(again?.addressCheck).toBe('confirmed');
  });

  it('lets a pick’s own details win', () => {
    const [fixed] = applyPicks(applyFixes([listed], { 'node/1': fix }), [
      { osm: 'node/1', name: 'Cantine Trempette', details: { street: 'Rue de la Pick' } },
    ]);
    expect(fixed?.street).toBe('Rue de la Pick');
  });

  it('names the fixes OpenStreetMap has caught up with, or whose place is gone', () => {
    expect(staleFixes([listed], { 'node/1': fix })).toEqual([]);
    expect(staleFixes([{ ...listed, street: 'Rue Grains Est' }], { 'node/1': fix })).toEqual([
      {
        osm: 'node/1',
        name: 'Cantine Trempette',
        now: '120 Rue Grains Est, Hull',
        was: fix.was,
      },
    ]);
    expect(staleFixes([], { 'node/1': fix })[0]?.now).toBeNull();
  });
});
