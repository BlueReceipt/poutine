import { nameKey, sameName, sameStreetName } from './addresses.ts';
import {
  normalizePhone,
  normalizePostcode,
  normalizeUrl,
  profileUrl,
  type Place,
} from './osmPlaces.ts';
import { fold } from './text.ts';

/**
 * A correction laid over OpenStreetMap's details (data/fixes.json, applied by npm run places),
 * with where it comes from and what the list said before. A pick's own details still win.
 */
export interface Fix {
  /** The place's name, for whoever reads the file. */
  name: string;
  housenumber?: string;
  street?: string;
  city?: string;
  postcode?: string;
  /** Closed for good: the place leaves the list (its link stays given, to no other place). */
  closed?: true;
  /** No poutine there, Alex says: the place leaves the list too. */
  noPoutine?: true;
  /** The place's own name, when the list has another (its link stays as given). */
  renamed?: string;
  /** Where the pin goes when it stands elsewhere: the address's own point (Adresses Québec). */
  lat?: number;
  lon?: number;
  /**
   * Details Alex gives (2026-10-20, Chez Lulu's), or a visitor's approved change: its phone, pages
   * and hours; an empty one takes the list's away.
   */
  phone?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  openingHours?: string;
  /**
   * A vegan poutine on the menu (true: the place serves poutine, so it's confirmed), or none any
   * more (false).
   */
  vegan?: boolean;
  /** Where the corrected details come from. */
  source: string;
  /** The address the list had before, as addressOf writes it. */
  was: string;
}

/** A street address and town on one line: "120 Rue Maclaren Ouest, Gatineau". */
export function addressOf(place: { housenumber: string; street: string; city: string }): string {
  const street = [place.housenumber, place.street].filter(Boolean).join(' ');
  return [street, place.city].filter(Boolean).join(', ');
}

/**
 * The fixes laid over the places they name, a closed place left out; a place's address check waits
 * for the next full run.
 */
export function applyFixes(
  places: readonly Place[],
  fixes: Readonly<Record<string, Fix>>,
): Place[] {
  return places.flatMap((place) => {
    const fix = fixes[place.osm];
    if (!fix) return [place];
    if (fix.closed || fix.noPoutine) return [];
    const housenumber = fix.housenumber ?? place.housenumber;
    const street = fix.street ?? place.street;
    const moved = housenumber !== place.housenumber || street !== place.street;
    const { vegan, ...rest } = place;
    return [
      {
        ...rest,
        ...((fix.vegan ?? vegan) ? { vegan: true as const } : {}),
        ...(fix.vegan ? { poutine: 'confirmed' as const } : {}),
        name: fix.renamed ?? place.name,
        lat: fix.lat ?? place.lat,
        lon: fix.lon ?? place.lon,
        housenumber,
        street,
        city: fix.city ?? place.city,
        citySource: fix.city ? 'fix' : place.citySource,
        postcode: fix.postcode !== undefined ? normalizePostcode(fix.postcode) : place.postcode,
        phone: fix.phone !== undefined ? normalizePhone(fix.phone) : place.phone,
        website: fix.website !== undefined ? normalizeUrl(fix.website) : place.website,
        facebook:
          fix.facebook !== undefined
            ? profileUrl(fix.facebook, 'www.facebook.com')
            : place.facebook,
        instagram:
          fix.instagram !== undefined
            ? profileUrl(fix.instagram, 'www.instagram.com')
            : place.instagram,
        openingHours: fix.openingHours ?? place.openingHours,
        addressCheck: moved ? 'unchecked' : place.addressCheck,
      },
    ];
  });
}

/**
 * Fixes to look at again: OpenStreetMap now says something else than when the fix was made
 * (someone corrected it there, or the place moved), or the place has left the list.
 */
export function staleFixes(
  places: readonly Place[],
  fixes: Readonly<Record<string, Fix>>,
): { osm: string; name: string; now: string | null; was: string }[] {
  return Object.entries(fixes).flatMap(([osm, fix]) => {
    const place = places.find((candidate) => candidate.osm === osm);
    const now = place ? addressOf(place) : null;
    return now !== null && fold(now) === fold(fix.was)
      ? []
      : [{ osm, name: fix.name, now, was: fix.was }];
  });
}

/** A civic address of Adresses Québec near a pin, with its distance from it. */
export interface AddressPoint {
  housenumber: string;
  street: string;
  city: string;
  postcode: string;
  meters: number;
}

/**
 * "1035 rue Rachel Est, Montréal H2J2J5" (Adresses Québec's formatted address, with its civic
 * number and suffix apart) → the point's parts, the street's type capitalized as the list writes
 * it ("Rue Rachel Est"), without the town Adresses Québec adds to a street name several towns
 * share ("Rue Saint-Jacques (Montréal)"). Null when it doesn't read.
 */
export function addressPoint(
  formatted: string,
  number: number | null,
  suffix: string | null,
  meters: number,
): AddressPoint | null {
  const comma = formatted.lastIndexOf(', ');
  if (comma < 0 || number === null) return null;
  const extra = suffix?.trim() ?? '';
  // "124 1/2" keeps its space, "397A" has none.
  const housenumber = /\d/.test(extra) ? `${String(number)} ${extra}` : `${String(number)}${extra}`;
  const streetPart = formatted.slice(0, comma).trim();
  const start = new RegExp(`^${String(number)}\\s*${escape(extra)}\\s+`, 'i');
  if (!start.test(streetPart)) return null;
  const street = streetPart.replace(start, '').replace(/\s*\([^)]*\)$/, '');
  const townPart = formatted.slice(comma + 2).trim();
  const postcode = /\s([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i.exec(townPart)?.[1] ?? '';
  const city = postcode ? townPart.slice(0, -postcode.length).trim() : townPart;
  if (!street || !city) return null;
  return {
    housenumber,
    street: street.charAt(0).toUpperCase() + street.slice(1),
    city,
    postcode: postcode ? normalizePostcode(postcode) : '',
    meters,
  };
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Within this of the pin, the pin is on that address. */
export const AT_PIN_METERS = 25;
/** Within this, the list's own civic number on its own street is the one meant. */
export const ON_STREET_METERS = 60;

/**
 * What Adresses Québec says of a place's address, surest first: "spelling", the same civic number
 * on the same street written another way (its type, its direction, a typo), the town too if need
 * be; "street", the pin is on the list's civic number, on a street Adresses Québec names otherwise
 * (renamed, or a route's number); "town", the address is right but its town is a slip of the
 * pin's municipality ("Ste-Céclie", "Q"); "fill", no street address in the list and the pin on one
 * civic address; "number", Adresses Québec doesn't know the list's number and the pin is on
 * another, or the list's street is at the pin as well as another (a corner); "nearest", no street
 * address and several at the pin, the nearest taken; "look", nothing to propose (the pin and the
 * address disagree, or nothing sits at the pin).
 */
export type ProposalKind = 'spelling' | 'street' | 'town' | 'fill' | 'number' | 'nearest' | 'look';

export interface Proposal {
  osm: string;
  name: string;
  kind: ProposalKind;
  /** The address as the list has it. */
  now: string;
  /** What to lay over it; none for a place to look at by hand. */
  fix?: Fix;
  /** Why, in words. */
  why: string;
  /** Other civic addresses at the pin: the nearest may be the neighbour's. */
  alsoNear: string[];
}

/** A town that's no name at all ("Q") or a typo of the municipality's ("Ste-Céclie-de-Milton"). */
function slipOf(town: string, municipality: string): boolean {
  const key = nameKey(town);
  return key.length <= 2 || editDistance(key, nameKey(municipality)) <= 3;
}

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        (row[j] ?? 0) + 1,
        (next[j - 1] ?? 0) + 1,
        (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length] ?? 0;
}

const metersText = (point: AddressPoint) => `${String(Math.round(point.meters))} m`;
const numberOf = (point: AddressPoint) => /^\d+/.exec(point.housenumber)?.[0] ?? '';

/**
 * The fix Adresses Québec suggests for a Québec place, from the civic addresses within
 * ON_STREET_METERS of its pin (nearest first) and the town the pin is in. A town of the list stays
 * unless it's a slip of the pin's municipality that OpenStreetMap knows no place by (knownTowns):
 * localities stay (Alex, 2026-10-20: "we should keep local localities"), Saint-Canut in Mirabel,
 * Chicoutimi in Saguenay, Pierrefonds in Montréal, Kegaska. Null when the list agrees with it.
 */
export function proposalFor(
  place: Place,
  points: readonly AddressPoint[],
  townAtPin: string,
  source: string,
  knownTowns: readonly string[] = [],
): Proposal | null {
  const now = addressOf(place);
  const atPin = points.filter((point) => point.meters <= AT_PIN_METERS);
  const keepsTown = (town: string) =>
    sameName(town, place.city) ||
    (place.citySource === 'osm' &&
      (knownTowns.some((known) => sameName(known, place.city)) || !slipOf(place.city, town)));
  const proposal = (kind: ProposalKind, why: string, chosen?: AddressPoint): Proposal => ({
    osm: place.osm,
    name: place.name,
    kind,
    now,
    why,
    alsoNear: atPin
      .filter((point) => !chosen || addressOf(point) !== addressOf(chosen))
      .slice(0, 3)
      .map((point) => `${addressOf(point)} (${metersText(point)})`),
  });
  const withFix = (kind: ProposalKind, why: string, chosen: AddressPoint): Proposal | null => {
    const fix: Fix = { name: place.name, source, was: now };
    if (chosen.housenumber !== place.housenumber) fix.housenumber = chosen.housenumber;
    if (fold(chosen.street) !== fold(place.street)) fix.street = chosen.street;
    if (!keepsTown(chosen.city)) fix.city = chosen.city;
    if (chosen.postcode && chosen.postcode !== place.postcode) fix.postcode = chosen.postcode;
    if (!fix.housenumber && !fix.street && !fix.city) return null;
    return { ...proposal(kind, why, chosen), fix };
  };
  const pinOn = (point: AddressPoint) => `the pin is on ${addressOf(point)} (${metersText(point)})`;

  if (!place.housenumber || !place.street) {
    const onStreet = place.street
      ? atPin.find((point) => sameStreetName(point.street, place.street))
      : undefined;
    const chosen = onStreet ?? atPin[0];
    if (!chosen)
      return proposal(
        'look',
        `No street address in the list, and none within ${String(AT_PIN_METERS)} m of the pin`,
      );
    // The list names a street with no number, and the pin's address is on another: not sure.
    if (place.street && !onStreet)
      return withFix(
        'nearest',
        `${place.street} has no number in the list, and the pin is on another street: ${pinOn(chosen)}`,
        chosen,
      );
    const crowded = atPin.some((point) => numberOf(point) !== numberOf(chosen));
    return crowded
      ? withFix(
          'nearest',
          `No street address in the list; several at the pin, the nearest: ${pinOn(chosen)}`,
          chosen,
        )
      : withFix('fill', `No street address in the list; ${pinOn(chosen)}`, chosen);
  }
  if (place.addressCheck === 'not-found' || place.addressCheck === 'far') {
    const same = points.find(
      (point) =>
        point.housenumber === place.housenumber && sameStreetName(point.street, place.street),
    );
    // The list's own street at the pin too (a corner, a mall named for the street): not sure.
    const ownStreetHere = points.some((point) => fold(point.street) === fold(place.street));
    if (same && fold(same.street) === fold(place.street))
      return withFix('town', `Adresses Québec puts this address in ${same.city}`, same);
    if (same && !ownStreetHere)
      return withFix(
        'spelling',
        `Adresses Québec writes it ${addressOf(same)} (${metersText(same)} from the pin)`,
        same,
      );
    const chosen = same ?? atPin[0];
    if (place.addressCheck === 'not-found' && chosen)
      return chosen.housenumber === place.housenumber && !ownStreetHere
        ? withFix('street', `Adresses Québec names this street otherwise: ${pinOn(chosen)}`, chosen)
        : withFix(
            'number',
            `${ownStreetHere ? `${place.street} is at the pin too` : "Adresses Québec doesn't know this number"}; ${pinOn(chosen)}`,
            chosen,
          );
    const nearest = points[0];
    return proposal(
      'look',
      place.addressCheck === 'far'
        ? `This address is more than 150 m from the pin${nearest ? `, which is on ${addressOf(nearest)} (${metersText(nearest)})` : ''}: the pin or the address is wrong`
        : `Adresses Québec doesn't know this address, and no address is within ${String(AT_PIN_METERS)} m of the pin`,
    );
  }
  if (place.citySource === 'osm' && townAtPin && !keepsTown(townAtPin)) {
    const fix: Fix = { name: place.name, city: townAtPin, source, was: now };
    return { ...proposal('town', `Adresses Québec puts the pin in ${townAtPin}`), fix };
  }
  return null;
}
