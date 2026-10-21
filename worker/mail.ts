// An email to Alex for each place a visitor sends (Alex, 2026-10-20: "Send me an email for each new
// place, linking to /admin. Never approve from inside the email."). Sent through Cloudflare Email
// Routing (the MAIL binding) to MAIL_TO, a secret: his address stays out of the public repo. The
// email only says what came in and where to look; nothing in it approves anything.
import { EmailMessage } from 'cloudflare:email';
import type { PlaceChange } from '../src/domain/changes.ts';
import type { Place } from '../src/domain/osmPlaces.ts';
import type { NewPlace } from '../src/domain/submission.ts';
import { changeMail, FROM, newPlaceMail } from './mailText.ts';

/** Sends it after the visitor's answer has gone; a failure only goes to the Worker's log. */
export function mailLater(env: Env, ctx: ExecutionContext, id: number, place: NewPlace): void {
  if (!env.MAIL_TO) return;
  const raw = newPlaceMail(id, place, env.MAIL_TO, new Date());
  ctx.waitUntil(
    env.MAIL.send(new EmailMessage(FROM, env.MAIL_TO, raw)).catch((error: unknown) => {
      console.error('The new-place email was not sent:', error);
    }),
  );
}

/** The same for a change to a place or an owner's claim (Add more info). */
export function mailChangeLater(
  env: Env,
  ctx: ExecutionContext,
  id: number,
  change: PlaceChange,
  place: Place,
): void {
  if (!env.MAIL_TO) return;
  const raw = changeMail(id, change, place, env.MAIL_TO, new Date());
  ctx.waitUntil(
    env.MAIL.send(new EmailMessage(FROM, env.MAIL_TO, raw)).catch((error: unknown) => {
      console.error('The change email was not sent:', error);
    }),
  );
}
