import { raterBytes, raterOfBytes } from '../domain/backup.ts';

/**
 * Visits kept by a passkey (Alex, 2026-10-21: "I want to create a better method. because people
 * won't think of getting a link before they erase"; "Garder mes visites même si je vide
 * l'historique"): the browser's random rater ID kept as a passkey's user ID in the phone's
 * password manager (Google's, Apple's), which clearing a site's data doesn't touch and which
 * follows the person to a new phone. The passkey is a safe for the ID, nothing more: no server
 * checks a signature, so the challenges are the browser's own.
 */

/** This browser saved its visits in a passkey (or found them in one): no need to offer it again. */
const KEPT = 'poutine.passkey';

/** Passkeys work here: a browser that has them, on https (or localhost). */
export function passkeysWork(): boolean {
  return window.isSecureContext && typeof window.PublicKeyCredential === 'function';
}

export function visitsKept(): boolean {
  try {
    return localStorage.getItem(KEPT) === '1';
  } catch {
    return false;
  }
}

export function markVisitsKept(): void {
  try {
    localStorage.setItem(KEPT, '1');
  } catch {
    // Nothing kept: the offer shows again on the next visit.
  }
}

const challenge = (): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(32));

/**
 * A passkey for poutines.app holding this rater's ID, named for the password manager's list
 * ("Mes visites"). The phone asks for a fingerprint, a face or its PIN; turned down, it throws.
 */
export async function saveVisits(rater: string, name: string): Promise<void> {
  await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Poutine' },
      user: { id: raterBytes(rater), name, displayName: name },
      challenge: challenge(),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
      attestation: 'none',
      timeout: 120_000,
    },
  });
  markVisitsKept();
}

/**
 * The rater's ID a passkey for this site holds, once the phone has asked whose it is; null when the
 * one chosen holds none. Turned down, or none on the phone, it throws.
 */
export async function findVisits(): Promise<string | null> {
  const credential = (await navigator.credentials.get({
    publicKey: { challenge: challenge(), userVerification: 'required', timeout: 120_000 },
  })) as PublicKeyCredential | null;
  const handle = credential
    ? (credential.response as AuthenticatorAssertionResponse).userHandle
    : null;
  return handle ? raterOfBytes(new Uint8Array(handle)) : null;
}
