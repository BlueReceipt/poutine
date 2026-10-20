import { useCallback, useEffect, useState } from 'preact/hooks';
import placesUrl from '../../data/places.json?url';
import { possibleDuplicates } from '../domain/duplicates.ts';
import type { Place } from '../domain/osmPlaces.ts';
import type { SubmissionRow } from '../domain/submission.ts';
import type { Strings } from '../ui/strings.ts';
import { Waiting, whenOf } from './Waiting.tsx';

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; waiting: SubmissionRow[] }
  | { kind: 'signed-out' }
  | { kind: 'failed' };

/**
 * The approval page (Alex, 2026-10-20: "It lists waiting places, each on a small map with its
 * details and look-alikes, with Approve / Reject / Fix"): the places waiting, oldest first; one
 * opened shows on a small map with the places it may already be, to approve, fix or reject.
 */
export function Admin({ strings }: { strings: Strings }) {
  const words = strings.admin;
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [said, setSaid] = useState('');

  const reload = useCallback(async () => {
    try {
      const answer = await fetch('/api/admin/waiting', { cache: 'no-store' });
      if (answer.status === 403) {
        setLoad({ kind: 'signed-out' });
        return;
      }
      if (!answer.ok) throw new Error(`waiting answered ${String(answer.status)}`);
      const { waiting } = (await answer.json()) as { waiting: SubmissionRow[] };
      setLoad({ kind: 'ready', waiting });
    } catch {
      setLoad({ kind: 'failed' });
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  // Every place on the map, for the look-alikes: the list the app ships, and those approved since.
  useEffect(() => {
    const listed = fetch(placesUrl).then((answer) => answer.json()) as Promise<{ places: Place[] }>;
    const since = fetch('/api/added', { cache: 'no-cache' })
      .then((answer) => (answer.ok ? answer.json() : { places: [] }))
      .catch(() => ({ places: [] })) as Promise<{ places: Place[] }>;
    Promise.all([listed, since])
      .then(([list, added]) => {
        const known = new Set(list.places.map((place) => place.osm));
        setPlaces([...list.places, ...added.places.filter((place) => !known.has(place.osm))]);
      })
      .catch(() => {
        // No look-alikes shown: deciding still works.
      });
  }, []);

  const decided = (id: number | null, text: string) => {
    setSaid(text);
    setOpen(null);
    if (id === null) void reload();
    else
      setLoad((before) =>
        before.kind === 'ready'
          ? { kind: 'ready', waiting: before.waiting.filter((row) => row.id !== id) }
          : before,
      );
    window.scrollTo(0, 0);
  };

  const row = load.kind === 'ready' ? load.waiting.find((each) => each.id === open) : undefined;
  return (
    <main class="admin">
      <h1>{words.title}</h1>
      {said && (
        <p class="notice-line" role="status">
          {said}
        </p>
      )}
      {load.kind === 'loading' && <p>{words.loading}</p>}
      {load.kind === 'signed-out' && <p role="alert">{words.notSignedIn}</p>}
      {load.kind === 'failed' && <p role="alert">{words.failed}</p>}
      {load.kind === 'ready' &&
        (row ? (
          <Waiting
            key={row.id}
            row={row}
            places={places}
            strings={strings}
            onDecided={decided}
            onBack={() => {
              setOpen(null);
            }}
          />
        ) : load.waiting.length === 0 ? (
          <p>{words.none}</p>
        ) : (
          <ul class="waiting-list">
            {load.waiting.map((each) => {
              const twins = possibleDuplicates(places, each).length;
              return (
                <li key={each.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSaid('');
                      setOpen(each.id);
                    }}
                  >
                    <span class="name">{each.name}</span>
                    <span class="where">
                      {[each.city, whenOf(each.created_at)].filter(Boolean).join(' · ')}
                    </span>
                    {twins > 0 && <span class="where">{words.lookAlikes(twins)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </main>
  );
}
