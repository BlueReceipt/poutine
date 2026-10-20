import { splitStreet } from './addresses.ts';
import {
  normalizePhone,
  normalizePostcode,
  normalizeUrl,
  profileUrl,
  provinceCode,
  type Place,
} from './osmPlaces.ts';

/**
 * How the pin got where it is: at the civic address Adresses Québec (or Natural Resources Canada)
 * knows, on the street only, at the sender's location, or put by hand on the map.
 */
export type PlacedBy = 'address' | 'street' | 'me' | 'hand';

/** A place a visitor sends, checked and tidied: what waits for Alex's approval. */
export interface NewPlace {
  name: string;
  housenumber: string;
  street: string;
  city: string;
  /** Two-letter code; QC unless the sender chose another. */
  province: string;
  postcode: string;
  lat: number;
  lon: number;
  placedBy: PlacedBy;
  /** E.164, or empty. */
  phone: string;
  /** A web, Facebook or Instagram address, or empty. */
  website: string;
}

/** What's wrong with a sent place, field by field; the form says it in words. */
export type Problem =
  'name' | 'town' | 'position' | 'phone' | 'website' | 'poutine' | 'too-long' | 'not-a-place';

/** Where a new place may be: Québec and its neighbours (eastern Ontario, the Maritimes). */
export const AREA = { south: 41.5, north: 63, west: -95.5, east: -52 } as const;

/** The longest any text field may be. */
export const MAX_TEXT = 120;

const FIELDS = [
  'name',
  'street',
  'city',
  'province',
  'postcode',
  'lat',
  'lon',
  'placedBy',
  'phone',
  'website',
  'servesPoutine',
] as const;
const PLACED_BY: readonly PlacedBy[] = ['address', 'street', 'me', 'hand'];

/**
 * An approved place as the list holds it: ID "added/<submission number>", confirmed as serving
 * poutine (the sender ticked the box, Alex approved it), its address checked when the address
 * service placed it at its civic number; a Facebook or Instagram page where the card shows one.
 */
export function approvedPlace(id: number, place: NewPlace): Place {
  const isFacebook = /facebook\.com/i.test(place.website);
  const isInstagram = /instagram\.com/i.test(place.website);
  return {
    osm: `added/${String(id)}`,
    name: place.name,
    housenumber: place.housenumber,
    street: place.street,
    city: place.city,
    citySource: 'visitor',
    province: place.province,
    postcode: place.postcode,
    addressCheck: place.placedBy === 'address' ? 'confirmed' : 'unchecked',
    lat: place.lat,
    lon: place.lon,
    phone: place.phone,
    website: isFacebook || isInstagram ? '' : place.website,
    facebook: isFacebook ? place.website : '',
    instagram: isInstagram ? place.website : '',
    menu: '',
    openingHours: '',
    cuisine: [],
    poutine: 'confirmed',
    picked: false,
  };
}

/** A website as typed: a Facebook or Instagram page kept as a profile, anything else as a site. */
function websiteOf(raw: string): string {
  if (/facebook\.com|fb\.com/i.test(raw)) return profileUrl(raw, 'www.facebook.com');
  if (/instagram\.com/i.test(raw)) return profileUrl(raw, 'www.instagram.com');
  return normalizeUrl(raw);
}

/**
 * A sent place checked the same way in the form and in the Worker: only these fields, short
 * texts, a name and a town, a position in the area, a phone and website that are ones, and the
 * box "They serve poutine" ticked. Tidied as the place list is (E.164 phone, spaced postal code).
 */
export function checkNewPlace(input: unknown): { place: NewPlace } | { problems: Problem[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { problems: ['not-a-place'] };
  const fields = input as Record<string, unknown>;
  if (Object.keys(fields).some((key) => !(FIELDS as readonly string[]).includes(key)))
    return { problems: ['not-a-place'] };
  const text = (key: string): string | null => {
    const value = fields[key] ?? '';
    return typeof value === 'string' ? value.trim() : null;
  };
  const texts = ['name', 'street', 'city', 'province', 'postcode', 'phone', 'website'].map(text);
  if (texts.some((value) => value === null)) return { problems: ['not-a-place'] };
  const [
    name = '',
    streetLine = '',
    city = '',
    province = '',
    postcode = '',
    phone = '',
    website = '',
  ] = texts as string[];

  const problems: Problem[] = [];
  if (texts.some((value) => (value ?? '').length > MAX_TEXT)) problems.push('too-long');
  if (!name) problems.push('name');
  if (!city) problems.push('town');
  const { lat, lon } = fields;
  const placedBy = fields.placedBy as PlacedBy;
  if (!PLACED_BY.includes(placedBy)) return { problems: ['not-a-place'] };
  if (
    typeof lat !== 'number' ||
    typeof lon !== 'number' ||
    !(lat >= AREA.south && lat <= AREA.north && lon >= AREA.west && lon <= AREA.east)
  )
    problems.push('position');
  const e164 = phone ? normalizePhone(phone) : '';
  if (phone && !e164) problems.push('phone');
  const site = website ? websiteOf(website) : '';
  if (website && !site) problems.push('website');
  if (fields.servesPoutine !== true) problems.push('poutine');
  if (problems.length > 0) return { problems };

  const { housenumber, street } = splitStreet(streetLine);
  return {
    place: {
      name,
      housenumber,
      street,
      city,
      province: provinceCode(province) || 'QC',
      postcode: normalizePostcode(postcode),
      lat: lat as number,
      lon: lon as number,
      placedBy,
      phone: e164,
      website: site,
    },
  };
}

/** A place sent, as D1 keeps it (migrations/0001 and 0005). */
export interface SubmissionRow {
  id: number;
  created_at: string;
  name: string;
  housenumber: string;
  street: string;
  city: string;
  province: string;
  postcode: string;
  lat: number;
  lon: number;
  placed_by: PlacedBy;
  phone: string;
  website: string;
  /** Its short link, given when Alex approves it. */
  link?: string | null;
}

export const SUBMISSION_COLUMNS =
  'id, created_at, name, housenumber, street, city, province, postcode, lat, lon, placed_by, phone, website, link';

export function newPlaceOfRow(row: SubmissionRow): NewPlace {
  return {
    name: row.name,
    housenumber: row.housenumber,
    street: row.street,
    city: row.city,
    province: row.province,
    postcode: row.postcode,
    lat: row.lat,
    lon: row.lon,
    placedBy: row.placed_by,
    phone: row.phone,
    website: row.website,
  };
}

/** The form's fields, as Add a place sends them and the approval page's Fix edits them. */
export interface PlaceForm {
  name: string;
  /** Civic number and street on one line, as typed. */
  street: string;
  city: string;
  province: string;
  postcode: string;
  lat: number;
  lon: number;
  placedBy: PlacedBy;
  phone: string;
  website: string;
  servesPoutine: true;
}

/** A kept place as the form's fields, to fix and check again (the approval page's Fix). */
export function formOf(place: NewPlace): PlaceForm {
  return {
    name: place.name,
    street: [place.housenumber, place.street].filter(Boolean).join(' '),
    city: place.city,
    province: place.province,
    postcode: place.postcode,
    lat: place.lat,
    lon: place.lon,
    placedBy: place.placedBy,
    phone: place.phone,
    website: place.website,
    servesPoutine: true,
  };
}
