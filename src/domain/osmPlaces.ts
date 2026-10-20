import { fold } from './text.ts';

/** One element of an Overpass answer (`out center tags`). */
export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** A town on the map, for places whose own address has none. */
export interface Town {
  name: string;
  lat: number;
  lon: number;
}

/**
 * Why we think a place serves poutine: Alex vouches for it, OpenStreetMap's cuisine says so, its
 * name says what it is (casse-croûte, cantine, patates...), or nothing confirms it yet (a dairy bar,
 * one of Alex's sample picks).
 */
export type PoutineEvidence = 'confirmed' | 'cuisine' | 'name' | 'unconfirmed';

/**
 * Where the town comes from: the place's own address in OpenStreetMap, the municipality of the
 * nearest address in Adresses Québec, OpenStreetMap's own reverse lookup (Nominatim, outside
 * Québec), the nearest Québec town on the map (shown as "near …"), nowhere yet, or the visitor
 * who added the place.
 */
export type CitySource =
  'osm' | 'adresses-quebec' | 'nominatim' | 'nearest-town' | 'none' | 'visitor';

/**
 * One of Alex's picks (data/picked.json): kept whatever the rules say, wherever it is. Confirmed:
 * he vouches that it serves poutine. Details: what he gives (or the place's own page says) where
 * OpenStreetMap has nothing or has it wrong; they win over OpenStreetMap's.
 */
export interface Pick {
  osm: string;
  name: string;
  confirmed?: boolean;
  details?: PickDetails;
}

export interface PickDetails {
  housenumber?: string;
  street?: string;
  postcode?: string;
  phone?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  menu?: string;
  openingHours?: string;
  cuisine?: string[];
}

/**
 * The street address checked against Adresses Québec: that civic number exists within 150 m of the
 * pin, it exists farther away (the pin or the address is wrong), Adresses Québec doesn't know it,
 * or there was nothing to check (no street address).
 */
export type AddressCheck = 'confirmed' | 'far' | 'not-found' | 'unchecked';

export interface Place {
  /** OpenStreetMap element, "node/123": the place's ID until a visitor adds one. */
  osm: string;
  name: string;
  housenumber: string;
  street: string;
  city: string;
  citySource: CitySource;
  /** Two-letter province code (QC, ON...), or empty while unknown. */
  province: string;
  postcode: string;
  addressCheck: AddressCheck;
  lat: number;
  lon: number;
  /** E.164 (+14185550123), or empty. */
  phone: string;
  website: string;
  facebook: string;
  instagram: string;
  menu: string;
  /** OpenStreetMap's opening_hours syntax, as tagged. */
  openingHours: string;
  cuisine: string[];
  poutine: PoutineEvidence;
  /** One of Alex's picks: kept whatever the rules say. */
  picked: boolean;
  /** Its short link, poutines.app/<link> (data/links.json), set when the list is written. */
  link?: string;
}

const PROVINCES: Record<string, string> = {
  alberta: 'AB',
  'british columbia': 'BC',
  manitoba: 'MB',
  'new brunswick': 'NB',
  'newfoundland and labrador': 'NL',
  'nova scotia': 'NS',
  'northwest territories': 'NT',
  nunavut: 'NU',
  ontario: 'ON',
  'prince edward island': 'PE',
  quebec: 'QC',
  saskatchewan: 'SK',
  yukon: 'YT',
};

/** "Ontario", "ON", "CA-ON" or "Québec" → the two-letter code; empty when it isn't a province. */
export function provinceCode(raw: string): string {
  const code = /^(?:CA-)?([A-Z]{2})$/i.exec(raw.trim())?.[1]?.toUpperCase();
  if (code && Object.values(PROVINCES).includes(code)) return code;
  return PROVINCES[fold(raw)] ?? '';
}

export type DropReason = 'chain' | 'repeated-name' | 'closed' | 'no-position' | 'duplicate';

// Folded names (accents stripped, lowercase). Chains that may lack a brand tag in OpenStreetMap.
const CHAINS =
  /ma?c ?donald|tim horton|subway|\ba w\b|burger king|dairy queen|\bkfc\b|kentucky|pizza hut|domino|st hubert|saint hubert|benny|valentine|lafleur|belle province|ashton|\bcora\b|normandin|frites? alors|\bmikes?\b|scores|harvey|wendy|five guys|casa grecque|new york fries|smoke s|poutineville|steak frites st paul|fromagerie victoria|mary brown|popeyes|a w canada|rotisseries? fusee|chung ?chun|costco/;

const STRONG_NAME = /casse ?croute|cantine|patate|pataterie|poutin|friterie|roulotte/;
const FRIES_NAME = /\bfrites?\b/;
const STEAK_FRITES = /steak ?frites?/;
const DAIRY_BAR = /bar laitier/;

/** What a casse-croûte cooks: a dairy bar or a "cantine" with one of these serves the real thing. */
const SNACK_CUISINE = /burger|hot_dog|fries|friture|sandwich|regional|fish_and_chips|chicken|pizza/;

/** A snack bar cooking one of these is a casse-croûte by another name; burger, pizza or chicken alone isn't. */
const CASSE_CROUTE_CUISINE = /fries|friture|fried_food|regional|quebecois|hot_dog|fish_and_chips/;

/** A restaurant called "cantine" that cooks one of these is a bistro or a canteen, not a shack. */
const OTHER_CUISINE =
  /indian|punjabi|pakistani|nepal|vietnam|thai|japan|sushi|ramen|chinese|korean|leban|syrian|persian|turkish|afghan|mexican|latin|peruvian|ethiopian|african|caribbean|haitian|jamaican|portuguese|greek|middle_eastern|asian|filipino|french|italian|vegan|vegetarian|coffee|tea|crepe/;

/** Names that say only what a place is, or whose it is: several unrelated places share them. */
const GENERIC_NAME =
  /^(?:(?:le|la|les|l) )?(?:casse croute|cantine|bar laitier|poutinerie|pataterie|friterie|roulotte|patates|frites)$|^(?:restaurant |casse croute |cantine )?chez \w+$/;

/** A name at this many separate spots is a chain, even with no brand in OpenStreetMap. */
const CHAIN_SPOTS = 5;

/** How many separate spots (more than 200 m apart) carry each folded name. */
function spotsPerName(elements: readonly OsmElement[]): Map<string, number> {
  const spots = new Map<string, { lat: number; lon: number }[]>();
  for (const element of elements) {
    const name = fold(element.tags?.name ?? '');
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!name || lat === undefined || lon === undefined) continue;
    const seen = spots.get(name) ?? [];
    if (!seen.some((spot) => metersBetween(spot, { lat, lon }) < 200)) seen.push({ lat, lon });
    spots.set(name, seen);
  }
  return new Map([...spots].map(([name, seen]) => [name, seen.length]));
}

function cuisines(tags: Record<string, string>): string[] {
  return (tags.cuisine ?? '')
    .split(';')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether, and why, a place belongs on the poutine map; null when nothing says it serves poutine. */
export function poutineEvidence(tags: Record<string, string>): PoutineEvidence | null {
  const kinds = cuisines(tags);
  if (kinds.includes('poutine')) return 'cuisine';
  const name = fold(tags.name ?? '');
  const cooks = kinds.join(';');
  const amenity = tags.amenity ?? '';
  if (STRONG_NAME.test(name)) {
    if (OTHER_CUISINE.test(cooks) && !SNACK_CUISINE.test(cooks)) return null;
    return 'name';
  }
  if (
    FRIES_NAME.test(name) &&
    !STEAK_FRITES.test(name) &&
    (amenity === 'fast_food' || amenity === 'food_court')
  )
    return 'name';
  if (
    DAIRY_BAR.test(name) &&
    (amenity === 'fast_food' ||
      amenity === 'restaurant' ||
      amenity === 'food_court' ||
      SNACK_CUISINE.test(cooks))
  )
    return 'unconfirmed';
  if (amenity === 'fast_food' && CASSE_CROUTE_CUISINE.test(cooks)) return 'unconfirmed';
  return null;
}

export function isChain(tags: Record<string, string>): boolean {
  return Boolean(tags.brand || tags['brand:wikidata']) || CHAINS.test(fold(tags.name ?? ''));
}

export function isGenericName(name: string): boolean {
  return GENERIC_NAME.test(fold(name));
}

function isClosed(tags: Record<string, string>): boolean {
  const hours = (tags.opening_hours ?? '').trim().toLowerCase();
  return (
    Boolean(tags.end_date) ||
    hours === 'closed' ||
    hours === 'off' ||
    /\(\s*ferm[ée]e?\s*\)/i.test(tags.name ?? '')
  );
}

/** A North American number as E.164 (+14185550123); empty when it isn't one. */
export function normalizePhone(raw: string): string {
  const first = raw.split(/[;,]/)[0] ?? '';
  const withoutExtension = first.split(/\b(?:ext|poste|x)\b/i)[0] ?? '';
  let digits = withoutExtension.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.length === 10 ? `+1${digits}` : '';
}

/** A web address with its scheme; empty when it can't be one. */
export function normalizeUrl(raw: string): string {
  const first = (raw.split(';')[0] ?? '').trim();
  if (!first) return '';
  const withScheme = /^https?:\/\//i.test(first) ? first : `https://${first}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes('.') ? url.href : '';
  } catch {
    return '';
  }
}

/** A social profile as a full address: a bare handle becomes https://<site>/<handle>. */
export function profileUrl(raw: string, site: 'www.facebook.com' | 'www.instagram.com'): string {
  const value = (raw.split(';')[0] ?? '').trim();
  if (!value) return '';
  if (/^(?:https?:\/\/)?(?:[\w-]+\.)*(?:facebook|fb|instagram)\.com\//i.test(value))
    return normalizeUrl(value);
  const handle = value.replace(/^@/, '');
  return /^[\w.-]+$/.test(handle) ? `https://${site}/${handle}` : '';
}

/** "g5j2g2" → "G5J 2G2"; anything that isn't a Canadian postal code is kept as typed. */
export function normalizePostcode(raw: string): string {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)
    ? `${compact.slice(0, 3)} ${compact.slice(3)}`
    : raw.trim().toUpperCase();
}

export function metersBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const north = (b.lat - a.lat) * 111_320;
  const east = (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(north, east);
}

export function nearestTown(
  point: { lat: number; lon: number },
  towns: readonly Town[],
): Town | null {
  let best: Town | null = null;
  let bestDistance = Infinity;
  for (const town of towns) {
    const distance = metersBetween(point, town);
    if (distance < bestDistance) {
      best = town;
      bestDistance = distance;
    }
  }
  return best;
}

function placeFrom(
  element: OsmElement,
  evidence: PoutineEvidence,
  picked: boolean,
  towns: readonly Town[],
  inQuebec: boolean,
): Place | null {
  const tags = element.tags ?? {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const ownCity = (tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:village'] ?? '').trim();
  // The towns on hand are Québec's: elsewhere a missing town waits for the script's lookup.
  const town = ownCity || !inQuebec ? null : nearestTown({ lat, lon }, towns);
  let citySource: CitySource = 'none';
  if (ownCity) citySource = 'osm';
  else if (town) citySource = 'nearest-town';
  const website = normalizeUrl(tags.website ?? tags['contact:website'] ?? tags.url ?? '');
  const websiteIsFacebook = /(?:^|\.)facebook\.com$/i.test(
    website ? new URL(website).hostname : '',
  );
  const menuTag = tags['website:menu'] ?? tags['menu:url'] ?? tags.menu ?? '';
  return {
    osm: `${element.type}/${String(element.id)}`,
    name: (tags.name ?? '').trim(),
    housenumber: (tags['addr:housenumber'] ?? '').trim(),
    street: (tags['addr:street'] ?? '').trim(),
    city: ownCity || (town?.name ?? ''),
    citySource,
    province: inQuebec ? 'QC' : provinceCode(tags['addr:province'] ?? tags['addr:state'] ?? ''),
    postcode: normalizePostcode(tags['addr:postcode'] ?? ''),
    addressCheck: 'unchecked',
    lat,
    lon,
    phone: normalizePhone(tags.phone ?? tags['contact:phone'] ?? tags['contact:mobile'] ?? ''),
    website: websiteIsFacebook ? '' : website,
    facebook:
      profileUrl(tags['contact:facebook'] ?? tags.facebook ?? '', 'www.facebook.com') ||
      (websiteIsFacebook ? website : ''),
    instagram: profileUrl(tags['contact:instagram'] ?? tags.instagram ?? '', 'www.instagram.com'),
    menu:
      /^https?:\/\//i.test(menuTag.trim()) || menuTag.includes('.') ? normalizeUrl(menuTag) : '',
    openingHours: (tags.opening_hours ?? '').trim(),
    cuisine: cuisines(tags),
    poutine: evidence,
    picked,
  };
}

/** A pick's own details over OpenStreetMap's, normalized like them. */
function withDetails(place: Place, details: PickDetails | undefined): Place {
  if (!details) return place;
  const given = (value: string | undefined, normalize: (raw: string) => string): string | null =>
    value?.trim() ? normalize(value) : null;
  return {
    ...place,
    housenumber: given(details.housenumber, (v) => v.trim()) ?? place.housenumber,
    street: given(details.street, (v) => v.trim()) ?? place.street,
    postcode: given(details.postcode, normalizePostcode) ?? place.postcode,
    phone: given(details.phone, normalizePhone) ?? place.phone,
    website: given(details.website, normalizeUrl) ?? place.website,
    facebook: given(details.facebook, (v) => profileUrl(v, 'www.facebook.com')) ?? place.facebook,
    instagram:
      given(details.instagram, (v) => profileUrl(v, 'www.instagram.com')) ?? place.instagram,
    menu: given(details.menu, normalizeUrl) ?? place.menu,
    openingHours: given(details.openingHours, (v) => v.trim()) ?? place.openingHours,
    cuisine: details.cuisine?.length ? details.cuisine : place.cuisine,
  };
}

/** Alex's picks applied again to a list already made: their details and their confirmations. */
export function applyPicks(places: readonly Place[], picks: readonly Pick[]): Place[] {
  const pickById = new Map(picks.map((pick) => [pick.osm, pick]));
  return places.map((place) => {
    const pick = pickById.get(place.osm);
    if (!pick) return place;
    const detailed = withDetails(place, pick.details);
    return pick.confirmed ? { ...detailed, poutine: 'confirmed', picked: true } : detailed;
  });
}

/**
 * The places visitors added and Alex approved (data/added.json), joined to the list: each replaces
 * any place of the list with its ID (an approved place approved again), the rest go at the end.
 */
export function withAdded(places: readonly Place[], added: readonly Place[]): Place[] {
  const ids = new Set(added.map((place) => place.osm));
  return [...places.filter((place) => !ids.has(place.osm)), ...added];
}

function richness(place: Place): number {
  return [
    place.housenumber,
    place.street,
    place.postcode,
    place.phone,
    place.website,
    place.facebook,
    place.openingHours,
  ].filter(Boolean).length;
}

const EVIDENCE_RANK: Record<PoutineEvidence, number> = {
  confirmed: 3,
  cuisine: 2,
  name: 1,
  unconfirmed: 0,
};

/**
 * The poutine map's places from an Overpass answer: independent places whose cuisine or name says
 * poutine, and every one of Alex's picks. One place per name within 75 m (OpenStreetMap often has
 * the same shack as a point and as a building), keeping the richer one. Elements listed in
 * outsideQuebec (picks elsewhere) get no Québec town or province.
 */
export function selectPlaces(
  elements: readonly OsmElement[],
  towns: readonly Town[],
  picks: readonly Pick[],
  outsideQuebec: ReadonlySet<string> = new Set(),
): { places: Place[]; dropped: Record<DropReason, number> } {
  const pickById = new Map(picks.map((pick) => [pick.osm, pick]));
  const dropped: Record<DropReason, number> = {
    chain: 0,
    'repeated-name': 0,
    closed: 0,
    'no-position': 0,
    duplicate: 0,
  };
  const spots = spotsPerName(elements);

  const candidates: Place[] = [];
  for (const element of elements) {
    const tags = element.tags ?? {};
    const id = `${element.type}/${String(element.id)}`;
    const pick = pickById.get(id);
    const picked = pick !== undefined;
    const evidence = pick?.confirmed
      ? 'confirmed'
      : (poutineEvidence(tags) ?? (picked ? 'unconfirmed' : null));
    if (!evidence || !tags.name) continue;
    if (!picked) {
      if (isChain(tags)) {
        dropped.chain += 1;
        continue;
      }
      if (!isGenericName(tags.name) && (spots.get(fold(tags.name)) ?? 0) >= CHAIN_SPOTS) {
        dropped['repeated-name'] += 1;
        continue;
      }
      if (isClosed(tags)) {
        dropped.closed += 1;
        continue;
      }
    }
    const place = placeFrom(element, evidence, picked, towns, !outsideQuebec.has(id));
    if (place) candidates.push(withDetails(place, pick?.details));
    else dropped['no-position'] += 1;
  }

  candidates.sort(
    (a, b) =>
      Number(b.picked) - Number(a.picked) ||
      EVIDENCE_RANK[b.poutine] - EVIDENCE_RANK[a.poutine] ||
      richness(b) - richness(a) ||
      a.osm.localeCompare(b.osm),
  );
  const places: Place[] = [];
  for (const place of candidates) {
    const name = fold(place.name);
    const twin = places.find(
      (other) => fold(other.name) === name && metersBetween(place, other) < 75,
    );
    if (twin) {
      dropped.duplicate += 1;
      continue;
    }
    places.push(place);
  }
  places.sort((a, b) => a.osm.localeCompare(b.osm, 'en', { numeric: true }));
  return { places, dropped };
}
