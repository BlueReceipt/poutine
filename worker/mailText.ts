// The new-place email's text (worker/mail.ts sends it): plain UTF-8, what came in and where to
// look. Nothing in it approves anything.
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

export function newPlaceMail(id: number, place: NewPlace, to: string, now: Date): string {
  const where = [
    [place.housenumber, place.street].filter(Boolean).join(' '),
    place.city,
    place.province,
  ]
    .filter(Boolean)
    .join(', ');
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
  return [
    `From: Poutine <${FROM}>`,
    `To: <${to}>`,
    `Subject: ${encoded(`New place waiting: ${place.name}${place.city ? ` (${place.city})` : ''}`)}`,
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
