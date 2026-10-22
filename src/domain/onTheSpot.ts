import { alike, possibleDuplicates } from './duplicates.ts';
import { isChainName, metersBetween, type Place } from './osmPlaces.ts';
import type { NewPlace } from './submission.ts';

/**
 * Two visitors on the spot approve a place (Alex, 2026-10-22: "if 2 people put a place in, saying
 * that they are there. we automatically approve and list the place"; approved: "100 m, I'm here for
 * both, two browsers on two connections, within 30 days; look-alikes and chains still wait for me"):
 * a new place is listed with no wait for Alex when two sends of it agree. Each was made with I'm
 * here (the pin where the phone stood, not dragged away), their names are alike, their pins within
 * 100 m, they came from two browsers on two connections, and no more than 30 days apart.
 */
export const SPOT_METERS = 100;
export const SPOT_DAYS = 30;

/** A waiting send as far as the rule looks: who sent it is only keyed hashes, kept 30 days. */
export interface SpotSend {
  id: number;
  createdAt: string;
  name: string;
  lat: number;
  lon: number;
  placedBy: NewPlace['placedBy'];
  /** A keyed hash of the browser's random ID; empty when the send had none. */
  visitor: string;
  /** A keyed hash of the connection, without the day; empty past 30 days. */
  connection: string;
}

/**
 * The earlier waiting send the new one confirms: both from where the place stands, alike names,
 * pins within 100 m, another browser on another connection, within 30 days. The oldest of them, or
 * null when none.
 */
export function confirmedSend(
  sent: SpotSend,
  waiting: readonly SpotSend[],
  now: Date,
): SpotSend | null {
  if (sent.placedBy !== 'me' || !sent.visitor || !sent.connection) return null;
  const since = now.getTime() - SPOT_DAYS * 86_400_000;
  const matches = waiting.filter(
    (earlier) =>
      earlier.id !== sent.id &&
      earlier.placedBy === 'me' &&
      earlier.visitor !== '' &&
      earlier.connection !== '' &&
      earlier.visitor !== sent.visitor &&
      earlier.connection !== sent.connection &&
      Date.parse(earlier.createdAt) >= since &&
      metersBetween(earlier, sent) <= SPOT_METERS &&
      alike(earlier.name, sent.name),
  );
  return [...matches].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
}

/** Why two visitors' place still waits for Alex: it may already be on the map, or it's a chain. */
export function waitsForAlex(
  place: NewPlace,
  onTheMap: readonly Place[],
): 'look-alike' | 'chain' | null {
  if (isChainName(place.name)) return 'chain';
  if (possibleDuplicates(onTheMap, place).length > 0) return 'look-alike';
  return null;
}

/** The place as the first send has it, with what it lacks taken from the second. */
export function filledFrom(first: NewPlace, second: NewPlace): NewPlace {
  const hasAddress = first.street !== '';
  return {
    ...first,
    housenumber: hasAddress ? first.housenumber : second.housenumber,
    street: hasAddress ? first.street : second.street,
    postcode: first.postcode || second.postcode,
    phone: first.phone || second.phone,
    website: first.website || second.website,
  };
}
