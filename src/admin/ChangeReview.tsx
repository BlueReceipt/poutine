import { useMemo, useState } from 'preact/hooks';
import {
  changedFields,
  changeOfRow,
  type ChangeForm,
  type ChangeProblem,
  type ChangeRow,
} from '../domain/changes.ts';
import type { Place } from '../domain/osmPlaces.ts';
import { displayPhone, telUrl } from '../domain/placeText.ts';
import type { Strings } from '../ui/strings.ts';
import { AdminMap } from './AdminMap.tsx';
import { whenOf } from './Waiting.tsx';

/** A change or claim waiting, with the place as the map shows it now. */
export type WaitingChange = ChangeRow & { current: Place };

interface Props {
  row: WaitingChange;
  strings: Strings;
  /** Decided (null: already decided elsewhere, the list is asked for again), with what to say. */
  onDecided: (id: number | null, said: string) => void;
  onBack: () => void;
}

type TextField = Exclude<keyof ChangeForm, 'vegan' | 'closed' | 'claim' | 'contact'>;

/** The change as the form's fields, to fix before approving. */
function formOfRow(row: WaitingChange): ChangeForm {
  return {
    name: row.name,
    street: [row.housenumber, row.street].filter(Boolean).join(' '),
    city: row.city,
    postcode: row.postcode,
    phone: row.phone,
    website: row.website,
    facebook: row.facebook,
    instagram: row.instagram,
    hours: row.hours,
    vegan: row.vegan === null ? row.current.vegan === true : row.vegan === 1,
    closed: row.closed === 1,
    claim: row.claim === 1,
    contact: row.contact,
  };
}

/** How to reach an owner: a phone to call, an email to write to. */
function contactLink(contact: string): string {
  return contact.includes('@') ? `mailto:${contact}` : telUrl(contact);
}

/**
 * One change or claim waiting (Add more info): the place on its small map, what the change makes
 * different (now, proposed), an owner's contact and the place's own phone to confirm a claim with,
 * then Approve, Fix, Reject (a second tap rejects).
 */
export function ChangeReview({ row, strings, onDecided, onBack }: Props) {
  const words = strings.admin;
  const edit = strings.edit;
  const place = row.current;
  const [form, setForm] = useState<ChangeForm>(() => formOfRow(row));
  const [fixing, setFixing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [problems, setProblems] = useState<(ChangeProblem | 'unexpected')[]>([]);
  const at = useMemo(() => ({ lat: place.lat, lon: place.lon }), [place]);
  const changed = changedFields(changeOfRow(row), place);

  const send = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setProblems([]);
    try {
      const answer = await fetch('/api/admin/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'change',
          id: row.id,
          decision,
          ...(fixing ? { change: form } : {}),
        }),
      });
      if (answer.status === 409) {
        onDecided(null, words.notWaiting);
        return;
      }
      const result = (await answer.json().catch(() => ({}))) as { problems?: ChangeProblem[] };
      if (!answer.ok) {
        setProblems(result.problems ?? ['unexpected']);
        return;
      }
      onDecided(
        row.id,
        decision === 'approve'
          ? words.changeApproved(place.name)
          : words.changeRejected(place.name),
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
  const shown = (field: string, value: string) => {
    if (field === 'vegan') return value === 'yes' ? words.yes : words.no;
    return field === 'phone' && value ? displayPhone(value) : value || '—';
  };

  return (
    <section class="waiting">
      <button type="button" class="link" onClick={onBack}>
        ← {words.back}
      </button>
      <h2>{place.name}</h2>
      <p class="where">
        {row.claim === 1 ? words.claim : words.change} · {words.sent(whenOf(row.created_at))}
      </p>
      <AdminMap at={at} lookAlikes={[]} onMove={null} />
      {row.closed === 1 && <p class="hint">{words.closedSaid}</p>}
      {fixing ? (
        <div class="fix">
          {field('name', edit.name)}
          {field('street', edit.street)}
          {field('city', edit.town)}
          {field('postcode', edit.postcode)}
          {field('phone', edit.phone)}
          {field('website', edit.website)}
          {field('facebook', edit.facebook)}
          {field('instagram', edit.instagram)}
          {field('hours', edit.hours)}
          <label class="check">
            <input
              type="checkbox"
              checked={form.vegan}
              onChange={(event) => {
                setForm({ ...form, vegan: event.currentTarget.checked });
              }}
            />
            <span>{edit.vegan}</span>
          </label>
          <label class="check">
            <input
              type="checkbox"
              checked={form.closed}
              onChange={(event) => {
                setForm({ ...form, closed: event.currentTarget.checked });
              }}
            />
            <span>{edit.closed}</span>
          </label>
        </div>
      ) : (
        changed.length > 0 && (
          <table class="changes">
            <thead>
              <tr>
                <th />
                <th>{words.before}</th>
                <th>{words.after}</th>
              </tr>
            </thead>
            <tbody>
              {changed.map(({ field, before, after }) => (
                <tr key={field}>
                  <th>{words.fields[field]}</th>
                  <td>{shown(field, before)}</td>
                  <td>{shown(field, after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
      {row.claim === 1 && (
        <>
          <h3>{words.ownerContact}</h3>
          <p>
            <a href={contactLink(row.contact)}>
              {row.contact.includes('@') ? row.contact : displayPhone(row.contact)}
            </a>
          </p>
          {place.phone && (
            <p>
              {words.placePhone}: <a href={telUrl(place.phone)}>{displayPhone(place.phone)}</a>
            </p>
          )}
          <p class="hint">{words.confirmHint}</p>
        </>
      )}
      {problems.length > 0 && (
        <p class="problems" role="alert">
          {problems
            .map((problem) =>
              problem === 'unexpected' ? words.unexpected : edit.problems[problem],
            )
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
            if (fixing) setForm(formOfRow(row));
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
