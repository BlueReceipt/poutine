import { useEffect, useState } from 'preact/hooks';
import { adoptRater, myRatings, savedRater } from './rater.ts';
import type { Strings } from './strings.ts';

/** A key's ratings and their codes, as the Worker answers (worker/ratings.ts). */
interface Answer {
  ratings: Record<string, number>;
  codes: Record<string, string>;
}

type Step =
  | { kind: 'looking' }
  | { kind: 'none' }
  | { kind: 'ask'; answer: Answer; here: number; rater: string; busy: boolean }
  | { kind: 'done'; count: number }
  | { kind: 'failed' };

async function post(path: string, body: object): Promise<Answer> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as Answer;
}

interface Props {
  /** The key the backup link carried: a rater's random ID. */
  backupKey: string;
  strings: Strings;
  /** The key is this browser's now: its bowls and counter to show again. */
  onRestored: () => void;
  onClose: () => void;
}

/**
 * A backup link opened (Alex, 2026-10-21: "if i clear my cache or local browser history, ill erase
 * my data on the website"): the ratings its key gave come back to this browser, its bowls on the
 * pins, its counter, the ratings to change. A browser that rated places of its own asks first, then
 * joins them to the key's (a place both rated keeps the key's).
 */
export function Restore({ backupKey, strings, onRestored, onClose }: Props) {
  const words = strings.restore;
  const [step, setStep] = useState<Step>({ kind: 'looking' });

  useEffect(() => {
    let live = true;
    post('/api/ratings/key', { key: backupKey })
      .then((answer) => {
        if (!live) return;
        const count = Object.keys(answer.ratings).length;
        const rater = savedRater();
        const here = Object.keys(myRatings()).length;
        if (count === 0) setStep({ kind: 'none' });
        else if (rater && rater !== backupKey && here > 0)
          setStep({ kind: 'ask', answer, here, rater, busy: false });
        else {
          adoptRater(backupKey, answer.ratings, answer.codes);
          setStep({ kind: 'done', count });
          onRestored();
        }
      })
      .catch(() => {
        if (live) setStep({ kind: 'failed' });
      });
    return () => {
      live = false;
    };
  }, [backupKey, onRestored]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const join = (rater: string) => {
    if (step.kind === 'ask') setStep({ ...step, busy: true });
    post('/api/ratings/join', { key: backupKey, rater })
      .then((answer) => {
        adoptRater(backupKey, answer.ratings, answer.codes);
        setStep({ kind: 'done', count: Object.keys(answer.ratings).length });
        onRestored();
      })
      .catch(() => {
        setStep({ kind: 'failed' });
      });
  };

  return (
    <aside class="card restore" aria-labelledby="restore-title">
      <button type="button" class="close" aria-label={strings.card.close} onClick={onClose}>
        ×
      </button>
      <h2 id="restore-title">{words.title}</h2>
      <p role="status">
        {step.kind === 'looking'
          ? words.looking
          : step.kind === 'none'
            ? words.none
            : step.kind === 'failed'
              ? words.failed
              : step.kind === 'done'
                ? words.done(step.count)
                : words.ask(Object.keys(step.answer.ratings).length, step.here)}
      </p>
      {step.kind === 'ask' && (
        <div class="actions">
          <button
            type="button"
            class="action primary"
            disabled={step.busy}
            onClick={() => {
              join(step.rater);
            }}
          >
            {words.join}
          </button>
          <button type="button" class="action" disabled={step.busy} onClick={onClose}>
            {words.cancel}
          </button>
        </div>
      )}
    </aside>
  );
}
