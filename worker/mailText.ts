// The new-place email's text (worker/mail.ts sends it): plain UTF-8, what came in and where to
// look. Nothing in it approves anything.
import { changedFields, type PlaceChange } from '../src/domain/changes.ts';
import type { Place } from '../src/domain/osmPlaces.ts';
import type { NewPlace } from '../src/domain/submission.ts';

export const FROM = 'places@poutines.app';
const ADMIN = 'https://poutines.app/admin';

/** UTF-8 text as base64, in lines of 76 (what mail expects). */
function base64Of(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return (btoa(binary).match(/.{1,76}/g) ?? []).join('\r\n');
}

/** A header's words, accents and all (RFC 2047). */
const encoded = (text: string): string => `=?UTF-8?B?${base64Of(text).replaceAll('\r\n', '')}?=`;

/** The mail itself around its body: headers, then the text as base64. */
function mailOf(subject: string, body: string, to: string, now: Date): string {
  return [
    `From: Poutine <${FROM}>`,
    `To: <${to}>`,
    `Subject: ${encoded(subject)}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@poutines.app>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Of(body),
    '',
  ].join('\r\n');
}

/**
 * A change to a place, or its owner's claim (Add more info): what it makes different, before and
 * after; an owner's contact stays on the approval page, never in the email.
 */
export function changeMail(
  id: number,
  change: PlaceChange,
  place: Place,
  to: string,
  now: Date,
): string {
  const lines = change.closed
    ? ['Closed for good, the sender says.']
    : changedFields(change, place).map(
        ({ field, before, after }) => `${field}: ${before || '(none)'} → ${after || '(none)'}`,
      );
  const body = [
    `${change.claim ? "A claim by a place's owner" : 'A change to a place'} is waiting for your approval (change #${String(id)}):`,
    '',
    `${place.name}${place.city ? ` (${place.city})` : ''}`,
    ...lines,
    ...(change.claim ? ['', 'How to reach the owner is on the approval page.'] : []),
    '',
    `Look at it, fix it, approve or reject it here: ${ADMIN}`,
    '',
    'Nothing in this email approves anything.',
  ].join('\r\n');
  const what = change.claim ? 'Claim waiting' : 'Change waiting';
  return mailOf(`${what}: ${place.name}${place.city ? ` (${place.city})` : ''}`, body, to, now);
}

/** A place's address on one line, as far as it was sent. */
function addressLine(place: NewPlace): string {
  return [[place.housenumber, place.street].filter(Boolean).join(' '), place.city, place.province]
    .filter(Boolean)
    .join(', ');
}

/**
 * A place two visitors on the spot listed (src/domain/onTheSpot.ts): it's on the map already; the
 * approval page can take it off. Nothing in the email takes it off.
 */
export function spotMail(
  first: number,
  second: number,
  place: NewPlace,
  to: string,
  now: Date,
): string {
  const body = [
    `Two visitors sent this place from where it stands (#${String(first)} and #${String(second)}), so it is on the map now:`,
    '',
    place.name,
    addressLine(place),
    ...(place.phone ? [`Phone: ${place.phone}`] : []),
    ...(place.website ? [`Web: ${place.website}`] : []),
    '',
    `If it shouldn't be there, remove it here: ${ADMIN}`,
    '',
    'Nothing in this email removes anything.',
  ].join('\r\n');
  return mailOf(
    `Listed by two visitors: ${place.name}${place.city ? ` (${place.city})` : ''}`,
    body,
    to,
    now,
  );
}

export function newPlaceMail(id: number, place: NewPlace, to: string, now: Date): string {
  const where = addressLine(place);
  const body = [
    `A place is waiting for your approval (#${String(id)}):`,
    '',
    place.name,
    where,
    ...(place.phone ? [`Phone: ${place.phone}`] : []),
    ...(place.website ? [`Web: ${place.website}`] : []),
    '',
    `Look at it, fix it, approve or reject it here: ${ADMIN}`,
    '',
    'Nothing in this email approves anything.',
  ].join('\r\n');
  return mailOf(
    `New place waiting: ${place.name}${place.city ? ` (${place.city})` : ''}`,
    body,
    to,
    now,
  );
}
