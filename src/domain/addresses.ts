import { fold } from './text.ts';

/** What the address lookup sends: a place's street (with its civic number), town and province. */
export interface AddressQuery {
  street: string;
  town: string;
  postalCode: string;
  province: string;
}

/** One answer of an address service, as the Worker passes it on. */
export interface AddressCandidate {
  lat: number;
  lon: number;
  /** The civic number; empty for the street itself. */
  number: string;
  street: string;
  town: string;
  postalCode: string;
  /**
   * The service estimated the spot along the street from the civic number (Natural Resources
   * Canada, outside Québec) instead of knowing the building: on the street, to check by eye.
   */
  estimated?: boolean;
}

/** At the civic address, or only somewhere on the street. */
export type Precision = 'address' | 'street';

export interface Placement {
  lat: number;
  lon: number;
  precision: Precision;
  postalCode: string;
}

// From here on, Terrain's matching rules (src/domain/addresses.ts there), unchanged but for lon.

// Street types and small words: "780, rue St-Jean" and "Rue Saint-Jean" are the same street.
const IGNORED = new Set([
  'rue',
  'r',
  'chemin',
  'ch',
  'rang',
  'rg',
  'route',
  'rte',
  'boulevard',
  'boul',
  'bd',
  'avenue',
  'av',
  'ave',
  'montee',
  'mtee',
  'place',
  'pl',
  'cote',
  'croissant',
  'cr',
  'impasse',
  'allee',
  'terrasse',
  'promenade',
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'l',
  'd',
  'et',
  'street',
  'road',
  'rd',
]);
const SAME = new Map([
  ['saint', 'st'],
  ['sainte', 'ste'],
  ['mont', 'mt'],
]);

/** A name's words, folded, without street types and small words, "Saint" written "st". */
function words(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => SAME.get(word) ?? word)
    .filter((word) => !IGNORED.has(word));
}

/** "Saint-Hyacinthe" is "St-Hyacinthe" and "ST HYACINTHE". */
function sameName(a: string, b: string): boolean {
  const left = words(a);
  const right = words(b);
  return left.length > 0 && left.join(' ') === right.join(' ');
}

/** The civic number that starts a street address: "780, rue Saint-Jean" → "780". */
export function civicNumber(street: string): string {
  return /^\s*(\d+)/.exec(street)?.[1] ?? '';
}

/** "4755 Ste-Catherine" → the number and the street apart; no number, the whole as the street. */
export function splitStreet(street: string): { housenumber: string; street: string } {
  const match = /^\s*(\d+[a-z]?)\b[\s,-]*(.*)$/i.exec(street);
  return match
    ? { housenumber: match[1] ?? '', street: (match[2] ?? '').trim() }
    : { housenumber: '', street: street.trim() };
}

// Street types, French and English, each spelling to one: "ch." is "chemin", "Dr" is "drive".
const TYPES = new Map<string, string>(
  Object.entries({
    rue: ['r'],
    chemin: ['ch'],
    rang: ['rg'],
    route: ['rte'],
    boulevard: ['boul', 'bd', 'blvd'],
    avenue: ['av', 'ave'],
    montee: ['mtee'],
    place: ['pl'],
    cote: [],
    croissant: [],
    impasse: [],
    allee: [],
    terrasse: [],
    promenade: [],
    street: [],
    road: ['rd'],
    drive: ['dr'],
    crescent: ['cres'],
    court: ['crt', 'ct'],
    lane: ['ln'],
    way: [],
    highway: ['hwy'],
    line: [],
    concession: ['conc'],
    sideroad: ['sdrd'],
    trail: ['trl'],
    parkway: ['pkwy'],
    terrace: ['terr'],
    circle: ['cir'],
    square: ['sq'],
  }).flatMap(([type, short]) => [[type, type] as const, ...short.map((s) => [s, type] as const)]),
);
const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'of', 'the']);

/** A street's type and the words of its name: "780, rue St-Jean" is rue and "st jean". */
function streetParts(text: string): { type: string | null; name: string[] } {
  const tokens = fold(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let type: string | null = null;
  const name: string[] = [];
  tokens.forEach((token, i) => {
    // "St" ends a name as Street ("Main St") and starts one as Saint ("St-Jean", "St Clair Ave").
    const kind = token === 'st' && i > 0 && i === tokens.length - 1 ? 'street' : TYPES.get(token);
    if (kind && type === null) type = kind;
    else if (!SMALL.has(token)) name.push(SAME.get(token) ?? token);
  });
  return { type, name };
}

/**
 * The service's street is the one typed: every word of its name is in the typed one, and both
 * name the same type when both name one ("Rideau Terrace" is not "Rideau Street", "rue Saint-Jean"
 * is "Saint-Jean").
 */
function sameStreet(query: AddressQuery, candidate: AddressCandidate): boolean {
  const asked = streetParts(query.street.replace(/^\s*\d+[a-z]?\b[\s,-]*/i, ''));
  const named = streetParts(candidate.street);
  return (
    named.name.length > 0 &&
    named.name.every((word) => asked.name.includes(word)) &&
    (asked.type === null || named.type === null || asked.type === named.type)
  );
}

function sameTownOrPostalCode(query: AddressQuery, candidate: AddressCandidate): boolean {
  const postal = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const asked = postal(query.postalCode);
  return (
    sameName(query.town, candidate.town) ||
    (asked.length === 6 && asked === postal(candidate.postalCode))
  );
}

/**
 * Where the service's answers put the place: the candidate at its civic number, else its street,
 * always in its own town (or at its postal code). Null when no answer is that street: a "rang
 * Double" in another town is not the one. A spot estimated along the street from the number is
 * the best guess on the street, never the building itself.
 */
export function placementFor(
  query: AddressQuery,
  candidates: readonly AddressCandidate[],
): Placement | null {
  const number = civicNumber(query.street);
  const fitting = candidates.filter(
    (candidate) => sameStreet(query, candidate) && sameTownOrPostalCode(query, candidate),
  );
  const numbered = (estimated: boolean) =>
    number
      ? fitting.find(
          (candidate) => candidate.number === number && Boolean(candidate.estimated) === estimated,
        )
      : undefined;
  const atAddress = numbered(false);
  const onStreet = numbered(true) ?? fitting.find((candidate) => !candidate.number) ?? fitting[0];
  const chosen = atAddress ?? onStreet;
  if (!chosen) return null;
  return {
    lat: chosen.lat,
    lon: chosen.lon,
    precision: atAddress ? 'address' : 'street',
    postalCode: atAddress ? chosen.postalCode : '',
  };
}
