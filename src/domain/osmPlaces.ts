import { sameName, sameStreetName } from './addresses.ts';
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
 * Québec), the nearest Québec town on the map (shown as "near …"), nowhere yet, the visitor
 * who added the place, or a correction in data/fixes.json.
 */
export type CitySource =
  'osm' | 'adresses-quebec' | 'nominatim' | 'nearest-town' | 'none' | 'visitor' | 'fix';

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
  /**
   * The village or sector inside a merged municipality (Sainte-Scholastique in Mirabel), shown
   * before the town and searched too; none where the town says it all (src/domain/localities.ts).
   */
  locality?: string;
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
  /** The links of other entries for it, merged into it since: they open it still. */
  oldLinks?: string[];
  /**
   * A vegan poutine on the menu (Alex, 2026-10-21: "a vegan offering present tag. that would make
   * the aluminum plate green"): OpenStreetMap's diet:vegan=only, or a fix (Alex's own, or a
   * visitor's change he approved). Its pin's tray is green.
   */
  vegan?: true;
  /** While the list is built: the IDs of other entries for it merged into it (for `oldLinks`). */
  absorbed?: string[];
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
  /ma?c ?donald|tim horton|subway|\ba w\b|burger king|dairy queen|\bkfc\b|kentucky|pizza hut|domino|st hubert|saint hubert|benny|valentine|lafleur|belle province|ashton|\bcora\b|normandin|frites? alors|\bmikes?\b|scores|harvey|wendy|five guys|casa grecque|new york fries|smoke s|poutineville|steak frites st paul|fromagerie victoria|mary brown|popeyes|a w canada|rotisseries? fusee|chung ?chun|costco|arirang|aridang/;

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

/** A counter cooking one of these, and nothing from OTHER_CUISINE, is a casse-croûte at heart. */
const COUNTER_CUISINE = /burger|chicken|american|diner|canadian/;

/** A sit-down restaurant cooking one of these is a family restaurant, where poutine is on the menu. */
const FAMILY_CUISINE = /burger|hot_dog|fish_and_chips|chicken|diner|fries|friture/;

/** A sit-down restaurant cooking only Québec food: a family restaurant, or a fine table. */
const QUEBEC_CUISINE = /regional|quebec|canadian/;

/** Sugar shacks cook Québec food in the spring, not poutine. */
const SUGAR_SHACK = /cabane|sucre|erabliere|sucrerie/;

/** A snack bar with no cuisine whose name says it sells something else. */
const OTHER_FOOD_NAME =
  /pizz|sushi|shawarma|chawarma|kebab|doner|falafel|\bpho\b|ramen|thai|\bwok\b|dumpling|taco|burrit|bagel|\bcafe\b|coffee|espresso|boulangerie|bakery|patisserie|traiteur|bubble|\bthe\b|\btea\b|crepe|beigne|donut|doughnut|smoothie|\bjus\b|juice|poke|curry|souvlaki|gyro|deli\b|sous marin|\bsubs?\b|sandwich|panini|salade|salad|noodle|nouille|asia|chin|vietnam|japon|indien|libanais|mexic|portug|italien|empanada|arepa|pupusa|halal|dim sum|\bbao\b|glace|gelato|yogourt|yogurt|cupcake|biscuit|cookie|gaufre|waffle|churro|chocolat|fromagerie|epicerie|depanneur|latin|sabor|szechuan|sichuan|panda|\blao\b|baan|marrakech|maroc|shish|taouk|tandoori|biryani|banh mi|\bpita\b|nutrition|cafeteria|college|universit|hopital|croissant|macaron|bonbon|soja|castor|boulange|baguette|madina|mechwi|acai|galerie|variete/;

/**
 * Why a place is on the list. The first rules (2026-10-16): its cuisine says poutine, its name says
 * what it is (casse-croûte, cantine, patates, frites...), a dairy bar, a snack bar cooking fries,
 * hot dogs or Québec food. The wider rules (Alex, 2026-10-20), each a group that WIDER switches on:
 * an independent burger or chicken counter, a snack bar OpenStreetMap gives no cuisine for (and
 * whose name says no other food), a family restaurant cooking burgers, hot dogs, chicken or fries,
 * a restaurant cooking only Québec food (sugar shacks left out).
 */
export type ListedFor =
  | 'cuisine'
  | 'name'
  | 'dairy-bar'
  | 'snack-cuisine'
  | 'burger-or-chicken'
  | 'snack-bar'
  | 'family-restaurant'
  | 'quebec-restaurant';

const WIDER_GROUPS: ReadonlySet<ListedFor> = new Set([
  'burger-or-chicken',
  'snack-bar',
  'family-restaurant',
  'quebec-restaurant',
]);

/** The wider rules' groups that are on: their places come in unconfirmed. */
export const WIDER: ReadonlySet<ListedFor> = new Set([
  'burger-or-chicken',
  'snack-bar',
  'family-restaurant',
  'quebec-restaurant',
]);

/** Why a place belongs on the poutine map, whatever WIDER says; null when nothing says it does. */
export function whyListed(tags: Record<string, string>): ListedFor | null {
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
    return 'dairy-bar';
  if (amenity === 'fast_food' && CASSE_CROUTE_CUISINE.test(cooks)) return 'snack-cuisine';
  if (OTHER_CUISINE.test(cooks)) return null;
  if (amenity === 'fast_food' && COUNTER_CUISINE.test(cooks)) return 'burger-or-chicken';
  if (amenity === 'fast_food' && kinds.length === 0 && !OTHER_FOOD_NAME.test(name))
    return 'snack-bar';
  if (amenity === 'restaurant' && !cooks.includes('maple') && !SUGAR_SHACK.test(name)) {
    if (FAMILY_CUISINE.test(cooks)) return 'family-restaurant';
    if (QUEBEC_CUISINE.test(cooks)) return 'quebec-restaurant';
  }
  return null;
}

const EVIDENCE_OF: Record<ListedFor, PoutineEvidence> = {
  cuisine: 'cuisine',
  name: 'name',
  'dairy-bar': 'unconfirmed',
  'snack-cuisine': 'unconfirmed',
  'burger-or-chicken': 'unconfirmed',
  'snack-bar': 'unconfirmed',
  'family-restaurant': 'unconfirmed',
  'quebec-restaurant': 'unconfirmed',
};

/** Whether, and why, a place belongs on the poutine map; null when nothing says it serves poutine. */
export function poutineEvidence(
  tags: Record<string, string>,
  wider: ReadonlySet<ListedFor> = WIDER,
): PoutineEvidence | null {
  const why = whyListed(tags);
  if (!why || (WIDER_GROUPS.has(why) && !wider.has(why))) return null;
  return EVIDENCE_OF[why];
}

/** A name that names a chain (McDonald's, La Belle Province…), however it's written. */
export function isChainName(name: string): boolean {
  return CHAINS.test(fold(name));
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
    // Vegan only: its poutine is too. "yes" (vegan options) promises no vegan poutine: those are
    // leads for Alex (data/review/vegan-leads.csv).
    ...(tags['diet:vegan'] === 'only' ? { vegan: true as const } : {}),
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
 * Two entries for one place (Alex, 2026-10-20: "le verger a ti-paul has two pins"; "l'express is
 * entered twice. it shouldn't. if one is missing info, it should be merged"): the same name within
 * 75 m (OpenStreetMap's point and building), or one name the other's start ("Le Verger à Ti-Paul"
 * and "Le Verger à Ti-Paul - Ferme brassicole - …") at one street address or within 25 m. A name
 * that only says what a place is ("Casse-croûte") makes no twin of a longer one.
 */
export function twins(a: Place, b: Place): boolean {
  const left = fold(a.name);
  const right = fold(b.name);
  const meters = metersBetween(a, b);
  const together = sameAddress(a, b);
  // Before a push (Alex: "make sure there are no duplicates"): Poulet Bronzé twice 91 m apart, Au
  // coin du hamburger twice at 3040 chemin Sainte-Marie, its two pins 736 m apart.
  if (left === right) return together || meters < (isGenericName(a.name) ? 75 : 150);
  const [short, long] = left.length < right.length ? [a.name, b.name] : [b.name, a.name];
  if (isGenericName(short)) return false;
  // Every word of one name in the other: "Lafortune traiteur", "Traiteur Lafortune et Crèmerie".
  const words = (name: string) =>
    fold(name)
      .split(' ')
      .filter((word) => !SMALL_WORDS.has(word));
  const longWords = words(long);
  const contained = words(short).every((word) => longWords.includes(word));
  return contained && (together || meters < 75);
}

const SMALL_WORDS = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'l',
  'd',
  'et',
  'a',
  'au',
  'aux',
]);

/** Two places at one street address: the same civic number, street and town, however written. */
function sameAddress(a: Place, b: Place): boolean {
  return Boolean(
    a.housenumber &&
    a.housenumber === b.housenumber &&
    a.street &&
    b.street &&
    sameStreetName(a.street, b.street) &&
    sameName(a.city, b.city),
  );
}

const DETAILS = [
  'postcode',
  'phone',
  'website',
  'facebook',
  'instagram',
  'menu',
  'openingHours',
] as const;

/**
 * One place out of two entries for it: the first kept, what it lacks taken from the other (its
 * street address, phone, links, hours, cuisine), and the other's pin and spelling of the street
 * when only the other's stands on their shared address (a visitor's pin put on the street alone).
 * The entry not kept leaves its ID and link to it, so a link shared before still opens it. Of two
 * nested names, the
 * shorter ("Le Verger à
 * Ti-Paul"), and that entry's ID and link unless the first's ID is the one already known (it has
 * a link, maybe ratings: `known`). `own` keeps the first's name and ID whatever: a pick's, or a
 * place Alex approved, whose link is already shared.
 */
export function merged(
  kept: Place,
  other: Place,
  {
    known = new Set<string>(),
    own = kept.picked,
  }: { known?: ReadonlySet<string>; own?: boolean } = {},
): Place {
  const place: Place = { ...kept };
  if (!place.housenumber && !place.street && other.street) {
    place.housenumber = other.housenumber;
    place.street = other.street;
  }
  for (const field of DETAILS) if (!place[field]) place[field] = other[field];
  if (place.cuisine.length === 0) place.cuisine = other.cuisine;
  if (other.vegan) place.vegan = true;
  if (
    kept.addressCheck !== 'confirmed' &&
    other.addressCheck === 'confirmed' &&
    sameAddress(kept, other)
  ) {
    place.street = other.street;
    place.lat = other.lat;
    place.lon = other.lon;
    place.addressCheck = 'confirmed';
  }
  const shorter =
    fold(other.name) !== fold(kept.name) &&
    other.name.length < kept.name.length &&
    twins(kept, other);
  if (shorter && !own) {
    place.name = other.name;
    if (known.has(other.osm) || !known.has(kept.osm)) {
      place.osm = other.osm;
      place.link = other.link;
    }
  }
  // Nothing goes when the other is the same entry as the list last held it (withAdded).
  const dropped = other.osm === kept.osm ? null : place.osm === kept.osm ? other : kept;
  const absorbed = [...(kept.absorbed ?? []), ...(other.absorbed ?? []), dropped?.osm ?? ''].filter(
    (id, at, all) => id && id !== place.osm && all.indexOf(id) === at,
  );
  const oldLinks = [
    ...(kept.oldLinks ?? []),
    ...(other.oldLinks ?? []),
    dropped?.link ?? '',
  ].filter((link, at, all) => link && link !== place.link && all.indexOf(link) === at);
  if (absorbed.length > 0) place.absorbed = absorbed;
  if (oldLinks.length > 0) place.oldLinks = oldLinks;
  else delete place.oldLinks;
  return place;
}

/**
 * The places visitors added and Alex approved (data/added.json), joined to the list: each replaces
 * any place of the list with its ID (an approved place approved again), the rest go at the end. An
 * OpenStreetMap entry for the same place goes, what it knows that the approved one lacks kept.
 */
export function withAdded(places: readonly Place[], added: readonly Place[]): Place[] {
  const ids = new Set(added.map((place) => place.osm));
  const listed = places.filter((place) => !ids.has(place.osm));
  // As the list last held it (npm run places -- --offline): what it took from twins gone since.
  const before = new Map(places.filter((place) => ids.has(place.osm)).map((p) => [p.osm, p]));
  const gone = new Set<string>();
  const joined = added.map((place) => {
    const earlier = before.get(place.osm);
    return listed
      .filter((other) => twins(place, other))
      .reduce(
        (kept, other) => {
          gone.add(other.osm);
          // The approved place keeps its own ID, name and link: they are already shared.
          return merged(kept, other, { own: true });
        },
        earlier ? merged(place, earlier, { own: true }) : place,
      );
  });
  return [...listed.filter((place) => !gone.has(place.osm)), ...joined];
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
 * poutine, and every one of Alex's picks. Twins (`twins`: OpenStreetMap often has the same shack as
 * a point and as a building) make one place, the richer one with what the other adds (`merged`).
 * Elements listed in outsideQuebec (picks elsewhere) get no Québec town or province; `known` holds
 * the IDs already given a link (data/links.json), kept when twins merge.
 */
export function selectPlaces(
  elements: readonly OsmElement[],
  towns: readonly Town[],
  picks: readonly Pick[],
  outsideQuebec: ReadonlySet<string> = new Set(),
  known: ReadonlySet<string> = new Set(),
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
    const twin = places.findIndex((other) => twins(place, other));
    if (twin >= 0) {
      places[twin] = merged(places[twin] ?? place, place, { known });
      dropped.duplicate += 1;
      continue;
    }
    places.push(place);
  }
  places.sort((a, b) => a.osm.localeCompare(b.osm, 'en', { numeric: true }));
  return { places, dropped };
}
