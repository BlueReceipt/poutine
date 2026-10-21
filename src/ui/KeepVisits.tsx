import { useState } from 'preact/hooks';
import { findVisits, passkeysWork, saveVisits, visitsKept } from './passkey.ts';
import { raterId } from './rater.ts';
import type { Strings } from './strings.ts';

/** Turned down at the phone's prompt (or no passkey there): nothing to say. */
const turnedDown = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'NotAllowedError' || error.name === 'AbortError');

/**
 * "Garder mes visites même si je vide l'historique" (Alex, 2026-10-21): this browser's visits kept
 * in a passkey, offered under a rating's thanks until it's done, and in the secret menu (`menu`),
 * which says so once it is. Where passkeys don't work, nothing shows.
 */
export function KeepVisits({ strings, menu = false }: { strings: Strings; menu?: boolean }) {
  const words = strings.keep;
  const [state, setState] = useState<'offer' | 'saving' | 'saved' | 'failed'>(() =>
    visitsKept() ? 'saved' : 'offer',
  );
  const [savedNow, setSavedNow] = useState(false);
  if (!passkeysWork()) return null;
  if (state === 'saved')
    return savedNow || menu ? (
      <p class="notice-line" role="status">
        {savedNow ? words.saved : words.kept}
      </p>
    ) : null;
  return (
    <>
      <button
        type="button"
        class={menu ? 'action keep-visits' : 'link keep-visits'}
        disabled={state === 'saving'}
        onClick={() => {
          setState('saving');
          saveVisits(raterId(), words.name)
            .then(() => {
              setSavedNow(true);
              setState('saved');
            })
            .catch((error: unknown) => {
              setState(turnedDown(error) ? 'offer' : 'failed');
            });
        }}
      >
        {state === 'saving' ? words.saving : words.save}
      </button>
      {state === 'failed' && (
        <p class="problems" role="alert">
          {words.failed}
        </p>
      )}
    </>
  );
}

/**
 * "Retrouver mes visites": the phone asks which passkey for this site, and its key goes to the
 * same restore as a backup link's (`onFound`). In the welcome box (shown only when nothing is saved,
 * as after clearing the history) and in the secret menu before any rating.
 */
export function FindVisits({
  strings,
  label,
  onFound,
}: {
  strings: Strings;
  label: string;
  onFound: (key: string) => void;
}) {
  const [none, setNone] = useState(false);
  if (!passkeysWork()) return null;
  return (
    <>
      <button
        type="button"
        class="link find-visits"
        onClick={() => {
          setNone(false);
          findVisits()
            .then((key) => {
              if (key) onFound(key);
              else setNone(true);
            })
            .catch((error: unknown) => {
              if (!turnedDown(error)) setNone(true);
            });
        }}
      >
        {label}
      </button>
      {none && (
        <p class="hint" role="status">
          {strings.keep.none}
        </p>
      )}
    </>
  );
}
