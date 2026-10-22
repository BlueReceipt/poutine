import { useCallback, useEffect, useState } from 'preact/hooks';
import placesUrl from '../../data/places.json?url';
import { possibleDuplicates } from '../domain/duplicates.ts';
import type { Place } from '../domain/osmPlaces.ts';
import type { SubmissionRow } from '../domain/submission.ts';
import type { Strings } from '../ui/strings.ts';
import { ChangeReview, type WaitingChange } from './ChangeReview.tsx';
import { Waiting, whenOf } from './Waiting.tsx';

/** A place two visitors on the spot listed, and when. */
type ListedRow = SubmissionRow & { reviewed_at: string };

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; waiting: SubmissionRow[]; changes: WaitingChange[]; byVisitors: ListedRow[] }
  | { kind: 'signed-out' }
  | { kind: 'failed' };

/**
 * The approval page (Alex, 2026-10-20: "It lists waiting places, each on a small map with its
 * details and look-alikes, with Approve / Reject / Fix"): the places waiting, oldest first; one
 * opened shows on a small map with the places it may already be, to approve, fix or reject. Then
 * the changes and claims waiting (Add more info), each opened the same way, and the places two
 * visitors on the spot listed without him (src/domain/onTheSpot.ts), each with Remove.
 */
export function Admin({ strings }: { strings: Strings }) {
  const words = strings.admin;
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [openChange, setOpenChange] = useState<number | null>(null);
  const [said, setSaid] = useState('');

  const reload = useCallback(async () => {
    try {
      const answer = await fetch('/api/admin/waiting', { cache: 'no-store' });
      if (answer.status === 403) {
        setLoad({ kind: 'signed-out' });
        return;
      }
      if (!answer.ok) throw new Error(`waiting answered ${String(answer.status)}`);
      const {
        waiting,
        changes = [],
        byVisitors = [],
      } = (await answer.json()) as {
        waiting: SubmissionRow[];
        changes?: WaitingChange[];
        byVisitors?: ListedRow[];
      };
      setLoad({ kind: 'ready', waiting, changes, byVisitors });
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
          ? { ...before, waiting: before.waiting.filter((row) => row.id !== id) }
          : before,
      );
    window.scrollTo(0, 0);
  };
  const changeDecided = (id: number | null, text: string) => {
    setSaid(text);
    setOpenChange(null);
    if (id === null) void reload();
    else
      setLoad((before) =>
        before.kind === 'ready'
          ? { ...before, changes: before.changes.filter((row) => row.id !== id) }
          : before,
      );
    window.scrollTo(0, 0);
  };

  const removed = (id: number, name: string) => {
    setSaid(words.removed(name));
    setLoad((before) =>
      before.kind === 'ready'
        ? { ...before, byVisitors: before.byVisitors.filter((row) => row.id !== id) }
        : before,
    );
  };

  const row = load.kind === 'ready' ? load.waiting.find((each) => each.id === open) : undefined;
  const changeRow =
    load.kind === 'ready' ? load.changes.find((each) => each.id === openChange) : undefined;
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
        (changeRow ? (
          <ChangeReview
            key={changeRow.id}
            row={changeRow}
            strings={strings}
            onDecided={changeDecided}
            onBack={() => {
              setOpenChange(null);
            }}
          />
        ) : row ? (
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
        ) : load.waiting.length === 0 &&
          load.changes.length === 0 &&
          load.byVisitors.length === 0 ? (
          <p>{words.none}</p>
        ) : (
          <>
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
            {load.changes.length > 0 && (
              <>
                <h2>{words.changesTitle}</h2>
                <ul class="waiting-list">
                  {load.changes.map((each) => (
                    <li key={each.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSaid('');
                          setOpenChange(each.id);
                        }}
                      >
                        <span class="name">{each.current.name}</span>
                        <span class="where">
                          {[
                            each.claim === 1 ? words.claim : words.change,
                            each.current.city,
                            whenOf(each.created_at),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {load.byVisitors.length > 0 && (
              <>
                <h2>{words.byVisitorsTitle}</h2>
                <p class="where">{words.byVisitorsNote}</p>
                <ul class="waiting-list">
                  {load.byVisitors.map((each) => (
                    <Listed
                      key={each.id}
                      row={each}
                      strings={strings}
                      onRemoved={removed}
                      onFailed={setSaid}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        ))}
    </main>
  );
}

/** One place two visitors listed: its name, town and since when, its link, and Remove (two taps). */
function Listed({
  row,
  strings,
  onRemoved,
  onFailed,
}: {
  row: ListedRow;
  strings: Strings;
  onRemoved: (id: number, name: string) => void;
  onFailed: (text: string) => void;
}) {
  const words = strings.admin;
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      const answer = await fetch('/api/admin/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, decision: 'remove' }),
      });
      if (answer.ok) onRemoved(row.id, row.name);
      else onFailed(answer.status === 409 ? words.notWaiting : words.unexpected);
    } catch {
      onFailed(words.unexpected);
    } finally {
      setBusy(false);
      setSure(false);
    }
  };
  return (
    <li class="listed">
      <span class="name">{row.name}</span>
      <span class="where">
        {[row.city, words.listedOn(whenOf(row.reviewed_at))].filter(Boolean).join(' · ')}
      </span>
      {row.link && (
        <a class="where" href={`/${row.link}`} target="_blank" rel="noopener noreferrer">
          poutines.app/{row.link}
        </a>
      )}
      <button
        type="button"
        class={sure ? 'action danger' : 'action'}
        disabled={busy}
        onClick={() => {
          if (sure) void remove();
          else setSure(true);
        }}
      >
        {sure ? words.removeSure : words.remove}
      </button>
    </li>
  );
}
