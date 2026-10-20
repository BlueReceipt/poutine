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

/** A name as sameName compares it: "Sainte-Cécile-de-Milton" is "ste cecile milton". */
export function nameKey(text: string): string {
  return words(text).join(' ');
}

/** "Saint-Hyacinthe" is "St-Hyacinthe" and "ST HYACINTHE". */
export function sameName(a: string, b: string): boolean {
  const left = nameKey(a);
  return left.length > 0 && left === nameKey(b);
}

const DIRECTIONS = new Set(['est', 'ouest', 'nord', 'sud', 'e', 'o', 'n', 's']);

/** The same street but perhaps for its direction: "rue Maclaren Ouest" and "Rue Maclaren Est". */
export function sameStreetName(a: string, b: string): boolean {
  const name = (text: string) => words(text).filter((word) => !DIRECTIONS.has(word));
  const left = name(a);
  return left.length > 0 && left.join(' ') === name(b).join(' ');
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

// A street's direction, however written at its end: "Curé-Poirier O", "Rachel E", "Main St W".
const DIRECTION = new Map<string, string>(
  Object.entries({
    ouest: ['o', 'w', 'west'],
    est: ['e', 'east'],
    nord: ['n', 'north'],
    sud: ['s', 'south'],
  }).flatMap(([way, short]) => [[way, way] as const, ...short.map((s) => [s, way] as const)]),
);

/**
 * A street's type, the words of its name and its direction: "780, rue St-Jean" is rue and "st
 * jean"; "Boulevard Curé-Poirier O" is boulevard, "cure poirier" and ouest. A name that is only a
 * direction keeps it ("Rue du Nord").
 */
function streetParts(text: string): { type: string | null; name: string[]; way: string | null } {
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
  const way = name.length > 1 ? DIRECTION.get(name[name.length - 1] ?? '') : undefined;
  if (way) name.pop();
  return { type, name, way: way ?? null };
}

/**
 * The service's street is the one typed: every word of its name is in the typed one, and both
 * name the same type and direction when both name one ("Rideau Terrace" is not "Rideau Street",
 * "rue Saint-Jean" is "Saint-Jean", "Curé-Poirier O" is "Curé-Poirier Ouest", not "Est").
 */
function sameStreet(query: AddressQuery, candidate: AddressCandidate): boolean {
  const asked = streetParts(query.street.replace(/^\s*\d+[a-z]?\b[\s,-]*/i, ''));
  const named = streetParts(candidate.street);
  return (
    named.name.length > 0 &&
    named.name.every((word) => asked.name.includes(word)) &&
    (asked.type === null || named.type === null || asked.type === named.type) &&
    (asked.way === null || named.way === null || asked.way === named.way)
  );
}

// Short words written out as Adresses Québec reads them best.
const LONG_TYPE: Record<string, string> = {
  boul: 'boulevard',
  bd: 'boulevard',
  blvd: 'boulevard',
  ch: 'chemin',
  av: 'avenue',
  ave: 'avenue',
  rte: 'route',
  rg: 'rang',
  mtee: 'montée',
  pl: 'place',
};
const LONG_WAY: Record<string, string> = {
  o: 'Ouest',
  w: 'Ouest',
  west: 'Ouest',
  e: 'Est',
  east: 'Est',
  n: 'Nord',
  north: 'Nord',
  s: 'Sud',
  south: 'Sud',
};

/**
 * The ways to ask Adresses Québec for an address, in turn: its search finds some better than
 * others (2026-10-20: "1225 Boulevard Curé-Poirier O, Longueuil, QC J4K 2G4" found nothing,
 * "1225 Boulevard Curé-Poirier Ouest, Longueuil" only the street, "1225 Curé-Poirier Ouest,
 * Longueuil" the building). As typed with its town, province and postal code; its short words
 * written out ("boul", "O"), with its town only; then without the street's type.
 */
export function quebecLookups(address: AddressQuery): string[] {
  const area = [address.province, address.postalCode].filter(Boolean).join(' ');
  const { housenumber, street } = splitStreet(address.street);
  const words = street.split(/[\s,]+/).filter(Boolean);
  const written = words.map((word, i) => {
    const key = fold(word);
    if (i === 0 && LONG_TYPE[key]) return LONG_TYPE[key];
    if (i === words.length - 1 && i > 0 && LONG_WAY[key]) return LONG_WAY[key];
    return word.replace(/\.$/, '');
  });
  // Without its type, a street still has a name: "Route 132" doesn't become "132".
  const rest = written.slice(1);
  const typeless =
    TYPES.has(fold(words[0] ?? '')) && rest.some((word) => /\p{L}/u.test(word)) ? rest : [];
  const line = (parts: readonly string[]) =>
    [[housenumber, ...parts].filter(Boolean).join(' '), address.town].filter(Boolean).join(', ');
  return [
    ...new Set([
      [address.street, address.town, area].filter(Boolean).join(', '),
      line(written),
      ...(typeless.length > 0 ? [line(typeless)] : []),
    ]),
  ];
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
