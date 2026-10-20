import { useMemo, useState } from 'preact/hooks';
import { possibleDuplicates } from '../domain/duplicates.ts';
import { metersBetween, type Place } from '../domain/osmPlaces.ts';
import { displayPhone } from '../domain/placeText.ts';
import {
  formOf,
  newPlaceOfRow,
  type PlaceForm,
  type Problem,
  type SubmissionRow,
} from '../domain/submission.ts';
import type { Strings } from '../ui/strings.ts';
import { AdminMap } from './AdminMap.tsx';

/** When a place was sent, in the page's language. */
export const whenOf = (iso: string): string =>
  new Date(iso).toLocaleString(document.documentElement.lang === 'fr' ? 'fr-CA' : 'en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

interface Props {
  row: SubmissionRow;
  places: readonly Place[];
  strings: Strings;
  /** Decided (null: already decided elsewhere, the list is asked for again), with what to say. */
  onDecided: (id: number | null, said: string) => void;
  onBack: () => void;
}

type TextField = 'name' | 'street' | 'city' | 'postcode' | 'phone' | 'website';

/**
 * One place waiting: its small map with the places it may already be, its details (or the form to
 * fix them, the pin moved by a tap on the map), then Approve, Fix, Reject (a second tap rejects).
 */
export function Waiting({ row, places, strings, onDecided, onBack }: Props) {
  const words = strings.admin;
  const add = strings.add;
  const [form, setForm] = useState<PlaceForm>(() => formOf(newPlaceOfRow(row)));
  const [fixing, setFixing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [problems, setProblems] = useState<(Problem | 'unexpected')[]>([]);
  const at = useMemo(() => ({ lat: form.lat, lon: form.lon }), [form.lat, form.lon]);
  const twins = useMemo(
    () => possibleDuplicates(places, { ...newPlaceOfRow(row), lat: at.lat, lon: at.lon }),
    [places, row, at],
  );

  const send = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setProblems([]);
    try {
      const answer = await fetch('/api/admin/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, decision, ...(fixing ? { place: form } : {}) }),
      });
      if (answer.status === 409) {
        onDecided(null, words.notWaiting);
        return;
      }
      const result = (await answer.json().catch(() => ({}))) as { problems?: Problem[] };
      if (!answer.ok) {
        setProblems(result.problems ?? ['unexpected']);
        return;
      }
      onDecided(
        row.id,
        decision === 'approve' ? words.approved(form.name) : words.rejected(form.name),
      );
    } catch {
      setProblems(['unexpected']);
    } finally {
      setBusy(false);
    }
  };

  const field = (key: TextField, label: string) => (
    <label class="field">
      <span>{label}</span>
      <input
        value={form[key]}
        onInput={(event) => {
          setForm({ ...form, [key]: event.currentTarget.value });
        }}
      />
    </label>
  );
  const details: [string, string][] = [
    [add.street, form.street],
    [add.town, [form.city, form.province, form.postcode].filter(Boolean).join(', ')],
    [add.phone, form.phone && displayPhone(form.phone)],
    [add.website, form.website],
  ];

  return (
    <section class="waiting">
      <button type="button" class="link" onClick={onBack}>
        ← {words.back}
      </button>
      <h2>{form.name}</h2>
      <p class="where">
        {words.sent(whenOf(row.created_at))} · {words.pinBy[form.placedBy]}
      </p>
      <AdminMap
        at={at}
        lookAlikes={twins}
        onMove={
          fixing
            ? (spot) => {
                setForm({ ...form, lat: spot.lat, lon: spot.lon, placedBy: 'hand' });
              }
            : null
        }
      />
      {fixing ? (
        <div class="fix">
          <p class="hint">{words.moveHint}</p>
          {field('name', add.name)}
          {field('street', add.street)}
          {field('city', add.town)}
          <label class="field">
            <span>{add.province}</span>
            <select
              value={form.province}
              onChange={(event) => {
                setForm({ ...form, province: event.currentTarget.value });
              }}
            >
              {add.provinces.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {field('postcode', words.postcode)}
          {field('phone', add.phone)}
          {field('website', add.website)}
        </div>
      ) : (
        <dl class="details">
          {details
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
      )}
      <h3>{twins.length > 0 ? words.lookAlikes(twins.length) : words.noLookAlike}</h3>
      {twins.length > 0 && (
        <ul class="twins">
          {twins.map((twin) => (
            <li key={twin.osm}>
              <span class="name">{twin.name}</span>
              <span class="where">
                {[[twin.housenumber, twin.street].filter(Boolean).join(' '), twin.city]
                  .filter(Boolean)
                  .join(', ')}
                {' · '}
                {strings.nearMe.distance(metersBetween(at, twin))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {problems.length > 0 && (
        <p class="problems" role="alert">
          {problems
            .map((problem) => (problem === 'unexpected' ? words.unexpected : add.problems[problem]))
            .join(' ')}
        </p>
      )}
      <div class="admin-actions">
        <button
          type="button"
          class="action primary"
          disabled={busy}
          onClick={() => {
            void send('approve');
          }}
        >
          {fixing ? words.saveApprove : words.approve}
        </button>
        <button
          type="button"
          class="action"
          disabled={busy}
          onClick={() => {
            if (fixing) setForm(formOf(newPlaceOfRow(row)));
            setFixing(!fixing);
          }}
        >
          {fixing ? words.back : words.fix}
        </button>
        <button
          type="button"
          class={rejecting ? 'action danger' : 'action'}
          disabled={busy}
          onClick={() => {
            if (rejecting) void send('reject');
            else setRejecting(true);
          }}
        >
          {rejecting ? words.rejectSure : words.reject}
        </button>
      </div>
    </section>
  );
}
