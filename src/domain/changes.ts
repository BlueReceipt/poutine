import { addressOf, type Fix } from './addressFixes.ts';
import { splitStreet } from './addresses.ts';
import {
  normalizePhone,
  normalizePostcode,
  normalizeUrl,
  profileUrl,
  type Place,
} from './osmPlaces.ts';
import { MAX_TEXT } from './submission.ts';

// "Add more info" and "Claim this spot" (Alex, 2026-10-20: "if we long press a poutine area, can
// it open the function, add more info, and maybe claim a spot"): a visitor corrects a place already
// on the map, or its owner claims it, and it waits for Alex's approval like a new place. Checked
// the same way by the form and the Worker.

/** The form's fields, filled in from the place and changed by the visitor. */
export interface ChangeForm {
  name: string;
  /** Civic number and street on one line, as typed. */
  street: string;
  city: string;
  postcode: string;
  phone: string;
  website: string;
  facebook: string;
  instagram: string;
  /** Opening hours in the visitor's own words, or OpenStreetMap's syntax as the list has it. */
  hours: string;
  /** Closed for good. */
  closed: boolean;
  /** "It's my business": the owner claims the spot. */
  claim: boolean;
  /** The owner's phone or email, for Alex to confirm the claim; only with a claim. */
  contact: string;
}

/** A change checked and tidied: what waits for Alex. */
export interface PlaceChange {
  name: string;
  housenumber: string;
  street: string;
  city: string;
  postcode: string;
  /** E.164, or empty. */
  phone: string;
  website: string;
  facebook: string;
  instagram: string;
  hours: string;
  closed: boolean;
  claim: boolean;
  contact: string;
}

/** What's wrong with a sent change, field by field; the form says it in words. */
export type ChangeProblem =
  | 'name'
  | 'phone'
  | 'website'
  | 'facebook'
  | 'instagram'
  | 'contact'
  | 'nothing'
  | 'too-long'
  | 'not-a-change';

/** Hours run longer than other fields: a line a day. */
export const MAX_HOURS = 300;

const TEXTS = [
  'name',
  'street',
  'city',
  'postcode',
  'phone',
  'website',
  'facebook',
  'instagram',
  'hours',
  'contact',
] as const;
const FIELDS: readonly string[] = [...TEXTS, 'closed', 'claim'];

/** The form as it opens: the place as the map has it. */
export function changeFormOf(place: Place): ChangeForm {
  return {
    name: place.name,
    street: [place.housenumber, place.street].filter(Boolean).join(' '),
    city: place.city,
    postcode: place.postcode,
    phone: place.phone,
    website: place.website,
    facebook: place.facebook,
    instagram: place.instagram,
    hours: place.openingHours,
    closed: false,
    claim: false,
    contact: '',
  };
}

/** An email address or a phone number an owner can be reached at. */
function contactOf(raw: string): string {
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) return raw.toLowerCase();
  return normalizePhone(raw);
}

/** The fields a change makes different from the place, each before and after. */
export interface ChangedField {
  field:
    | 'name'
    | 'address'
    | 'city'
    | 'postcode'
    | 'phone'
    | 'website'
    | 'facebook'
    | 'instagram'
    | 'hours';
  before: string;
  after: string;
}

/** What a change would make different, field by field (the approval page's before and after). */
export function changedFields(change: PlaceChange, place: Place): ChangedField[] {
  const pairs: ChangedField[] = [
    { field: 'name', before: place.name, after: change.name },
    {
      field: 'address',
      before: [place.housenumber, place.street].filter(Boolean).join(' '),
      after: [change.housenumber, change.street].filter(Boolean).join(' '),
    },
    { field: 'city', before: place.city, after: change.city },
    { field: 'postcode', before: place.postcode, after: change.postcode },
    { field: 'phone', before: place.phone, after: change.phone },
    { field: 'website', before: place.website, after: change.website },
    { field: 'facebook', before: place.facebook, after: change.facebook },
    { field: 'instagram', before: place.instagram, after: change.instagram },
    { field: 'hours', before: place.openingHours, after: change.hours },
  ];
  return pairs.filter((pair) => pair.before !== pair.after);
}

/**
 * A change sent about a place, checked the same way in the form and in the Worker: only these
 * fields, short texts, a name, a phone and pages that are ones, an owner's contact with a claim,
 * and something new (a field changed, closed for good, or a claim). Tidied as the list is.
 */
export function checkChange(
  input: unknown,
  place: Place,
): { change: PlaceChange } | { problems: ChangeProblem[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { problems: ['not-a-change'] };
  const fields = input as Record<string, unknown>;
  if (Object.keys(fields).some((key) => !FIELDS.includes(key)))
    return { problems: ['not-a-change'] };
  const read = (key: string): string | null => {
    const value = fields[key] ?? '';
    return typeof value === 'string' ? value.trim() : null;
  };
  const texts = Object.fromEntries(TEXTS.map((key) => [key, read(key)])) as Record<
    (typeof TEXTS)[number],
    string | null
  >;
  if (Object.values(texts).some((value) => value === null)) return { problems: ['not-a-change'] };
  const text = texts as Record<(typeof TEXTS)[number], string>;
  const closed = fields.closed ?? false;
  const claim = fields.claim ?? false;
  if (typeof closed !== 'boolean' || typeof claim !== 'boolean')
    return { problems: ['not-a-change'] };

  const problems: ChangeProblem[] = [];
  if (
    TEXTS.some((key) => key !== 'hours' && text[key].length > MAX_TEXT) ||
    text.hours.length > MAX_HOURS
  )
    problems.push('too-long');
  if (!text.name) problems.push('name');
  const phone = text.phone ? normalizePhone(text.phone) : '';
  if (text.phone && !phone) problems.push('phone');
  const website = text.website ? normalizeUrl(text.website) : '';
  if (text.website && !website) problems.push('website');
  const facebook = text.facebook ? profileUrl(text.facebook, 'www.facebook.com') : '';
  if (text.facebook && !facebook) problems.push('facebook');
  const instagram = text.instagram ? profileUrl(text.instagram, 'www.instagram.com') : '';
  if (text.instagram && !instagram) problems.push('instagram');
  const contact = claim && text.contact ? contactOf(text.contact) : '';
  if (claim && !contact) problems.push('contact');
  if (problems.length > 0) return { problems };

  const { housenumber, street } = splitStreet(text.street);
  const change: PlaceChange = {
    name: text.name,
    housenumber,
    street,
    city: text.city,
    postcode: text.postcode ? normalizePostcode(text.postcode) : '',
    phone,
    website,
    facebook,
    instagram,
    hours: text.hours,
    closed,
    claim,
    contact,
  };
  if (!closed && !claim && changedFields(change, place).length === 0)
    return { problems: ['nothing'] };
  return { change };
}

/**
 * What an approved change lays over the place (a fix, like Alex's own in data/fixes.json): only
 * what it makes different, closed for good when it says so, with where it comes from.
 */
export function fixOfChange(change: PlaceChange, place: Place, id: number, day: string): Fix {
  const fix: Fix = {
    name: place.name,
    source: `${change.claim ? 'Its owner' : 'A visitor'}, approved by Alex ${day} (change #${String(id)})`,
    was: addressOf(place),
  };
  if (change.closed) {
    fix.closed = true;
    return fix;
  }
  for (const { field, after } of changedFields(change, place)) {
    if (field === 'name') fix.renamed = after;
    else if (field === 'address') {
      fix.housenumber = change.housenumber;
      fix.street = change.street;
    } else if (field === 'hours') fix.openingHours = after;
    else fix[field] = after;
  }
  return fix;
}

/** A change as D1 keeps it (migrations/0007). */
export interface ChangeRow {
  id: number;
  created_at: string;
  place: string;
  name: string;
  housenumber: string;
  street: string;
  city: string;
  postcode: string;
  phone: string;
  website: string;
  facebook: string;
  instagram: string;
  hours: string;
  closed: number;
  claim: number;
  contact: string;
  fix: string | null;
}

export const CHANGE_COLUMNS =
  'id, created_at, place, name, housenumber, street, city, postcode, phone, website, facebook, instagram, hours, closed, claim, contact, fix';

export function changeOfRow(row: ChangeRow): PlaceChange {
  return {
    name: row.name,
    housenumber: row.housenumber,
    street: row.street,
    city: row.city,
    postcode: row.postcode,
    phone: row.phone,
    website: row.website,
    facebook: row.facebook,
    instagram: row.instagram,
    hours: row.hours,
    closed: row.closed === 1,
    claim: row.claim === 1,
    contact: row.contact,
  };
}
