import { describe, expect, it } from 'vitest';
import {
  confirmedSend,
  filledFrom,
  waitsForAlex,
  type SpotSend,
} from '../../src/domain/onTheSpot.ts';
import type { Place } from '../../src/domain/osmPlaces.ts';
import type { NewPlace } from '../../src/domain/submission.ts';

const now = new Date('2026-10-22T18:00:00Z');
// About 11 m of latitude per 0.0001 degree.
const send = (overrides: Partial<SpotSend> = {}): SpotSend => ({
  id: 1,
  createdAt: '2026-10-20T12:00:00.000Z',
  name: 'Cantine chez Ti-Guy',
  lat: 46.5,
  lon: -72.5,
  placedBy: 'me',
  visitor: 'visitor-a',
  connection: 'connection-a',
  ...overrides,
});
const second = (overrides: Partial<SpotSend> = {}): SpotSend =>
  send({
    id: 2,
    createdAt: '2026-10-22T17:00:00.000Z',
    visitor: 'visitor-b',
    connection: 'connection-b',
    lat: 46.5004,
    ...overrides,
  });

const place = (overrides: Partial<NewPlace> = {}): NewPlace => ({
  name: 'Cantine chez Ti-Guy',
  housenumber: '',
  street: '',
  city: 'Saint-Prime',
  province: 'QC',
  postcode: '',
  lat: 46.5,
  lon: -72.5,
  placedBy: 'me',
  phone: '',
  website: '',
  ...overrides,
});

describe('two visitors on the spot', () => {
  it('approve a place both sent from where it stands, from two browsers on two connections', () => {
    expect(confirmedSend(second(), [send()], now)?.id).toBe(1);
  });

  it('take a name written a little differently, but not another place', () => {
    expect(confirmedSend(second({ name: 'Chez Ti-Guy' }), [send()], now)?.id).toBe(1);
    expect(confirmedSend(second({ name: 'Cantine Bélanger' }), [send()], now)).toBeNull();
  });

  it('need both sent with I’m here, the pins within 100 m', () => {
    expect(confirmedSend(second({ placedBy: 'hand' }), [send()], now)).toBeNull();
    expect(confirmedSend(second(), [send({ placedBy: 'address' })], now)).toBeNull();
    expect(confirmedSend(second({ lat: 46.5008 }), [send()], now)?.id).toBe(1);
    expect(confirmedSend(second({ lat: 46.5012 }), [send()], now)).toBeNull();
  });

  it('need two browsers and two connections: one person twice is not two', () => {
    expect(confirmedSend(second({ visitor: 'visitor-a' }), [send()], now)).toBeNull();
    expect(confirmedSend(second({ connection: 'connection-a' }), [send()], now)).toBeNull();
    expect(confirmedSend(second({ visitor: '' }), [send()], now)).toBeNull();
    expect(confirmedSend(second(), [send({ connection: '' })], now)).toBeNull();
  });

  it('need the first send within 30 days, and take the oldest of several', () => {
    expect(
      confirmedSend(second(), [send({ createdAt: '2026-09-21T12:00:00.000Z' })], now),
    ).toBeNull();
    const older = send({
      id: 7,
      createdAt: '2026-10-10T12:00:00.000Z',
      visitor: 'visitor-c',
      connection: 'connection-c',
    });
    expect(confirmedSend(second(), [send(), older], now)?.id).toBe(7);
  });

  it('leave it to Alex when it looks like a place on the map, or names a chain', () => {
    const listed = {
      osm: 'node/1',
      name: 'Casse-croûte Ti-Guy',
      lat: 46.5003,
      lon: -72.5,
      housenumber: '',
      street: '',
      city: 'Saint-Prime',
    } as Place;
    expect(waitsForAlex(place(), [])).toBeNull();
    expect(waitsForAlex(place(), [listed])).toBe('look-alike');
    expect(waitsForAlex(place({ name: 'La Belle Province' }), [])).toBe('chain');
  });

  it('keep the first send’s details and take what it lacks from the second', () => {
    const filled = filledFrom(
      place({ phone: '+18195550101' }),
      place({
        housenumber: '12',
        street: 'Rue Principale',
        phone: '+18195550199',
        website: 'https://tiguy.example/',
      }),
    );
    expect(filled).toMatchObject({
      housenumber: '12',
      street: 'Rue Principale',
      phone: '+18195550101',
      website: 'https://tiguy.example/',
      lat: 46.5,
    });
  });
});
