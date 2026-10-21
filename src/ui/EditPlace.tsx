import { useRef, useState } from 'preact/hooks';
import { changeFormOf, checkChange, type ChangeForm } from '../domain/changes.ts';
import type { Place } from '../domain/osmPlaces.ts';
import { displayPhone } from '../domain/placeText.ts';
import type { EditWords, Strings } from './strings.ts';
import { useBotCheck } from './useBotCheck.ts';

type EditProblem = keyof EditWords['problems'];

interface Props {
  place: Place;
  strings: Strings;
  onBack: () => void;
}

type TextField = Exclude<keyof ChangeForm, 'closed' | 'claim'>;

/**
 * Add more info and Claim this spot (Alex, 2026-10-20: "if we long press a poutine area, can it
 * open the function, add more info, and maybe claim a spot"), in place of the card: the place's
 * details as the map has them, to fix; closed for good; "It's my business" with a phone or email
 * to be reached at. Sent behind the bot check, to wait for approval like a new place.
 */
export function EditPlace({ place, strings, onBack }: Props) {
  const words = strings.edit;
  const [form, setForm] = useState<ChangeForm>(() => {
    const start = changeFormOf(place);
    return { ...start, phone: start.phone ? displayPhone(start.phone) : '' };
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [problems, setProblems] = useState<EditProblem[]>([]);
  const botBox = useRef<HTMLDivElement>(null);
  const bot = useBotCheck(botBox, !sent);

  const set = (key: TextField, value: string) => {
    setForm((before) => ({ ...before, [key]: value }));
  };
  const field = (key: TextField, label: string, kind: 'text' | 'tel' | 'url' = 'text') => (
    <label class="field">
      <span>{label}</span>
      <input
        type={kind === 'tel' ? 'tel' : 'text'}
        inputMode={kind === 'url' ? 'url' : undefined}
        value={form[key]}
        maxLength={120}
        autoComplete="off"
        autoCapitalize={kind === 'url' ? 'off' : undefined}
        spellcheck={kind !== 'url'}
        onInput={(event) => {
          set(key, event.currentTarget.value);
        }}
      />
    </label>
  );

  const send = async () => {
    const checked = checkChange(form, place);
    if ('problems' in checked) {
      setProblems(checked.problems);
      return;
    }
    setBusy(true);
    setProblems([]);
    const check = await bot.token();
    if (!check) {
      setProblems(['bot-check']);
      setBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place: place.osm, ...form, botCheck: check }),
      });
      if (response.status === 201) {
        setSent(true);
        return;
      }
      bot.renew();
      const answer = (await response.json().catch(() => ({}))) as {
        error?: string;
        problems?: EditProblem[];
      };
      if (answer.problems?.length) setProblems(answer.problems);
      else if (answer.error && answer.error in words.problems)
        setProblems([answer.error as EditProblem]);
      else setProblems(['unexpected']);
    } catch {
      bot.renew();
      setProblems(['offline']);
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <div class="edit-place">
        <h3>{words.sentTitle}</h3>
        <p>{words.sent}</p>
        <div class="actions">
          <button type="button" class="action primary" onClick={onBack}>
            {words.close}
          </button>
        </div>
      </div>
    );

  return (
    <form
      class="edit-place"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <button type="button" class="link back" onClick={onBack}>
        ← {words.back}
      </button>
      <h3>{words.title}</h3>
      <p class="hint">{words.intro}</p>
      {field('name', words.name)}
      {field('street', words.street)}
      <div class="field-row">
        {field('city', words.town)}
        {field('postcode', words.postcode)}
      </div>
      {field('phone', words.phone, 'tel')}
      {field('website', words.website, 'url')}
      {field('facebook', words.facebook, 'url')}
      {field('instagram', words.instagram, 'url')}
      <label class="field">
        <span>{words.hours}</span>
        <textarea
          rows={3}
          value={form.hours}
          maxLength={300}
          onInput={(event) => {
            set('hours', event.currentTarget.value);
          }}
        />
        <small class="where">{words.hoursHint}</small>
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={form.closed}
          onChange={(event) => {
            const closed = event.currentTarget.checked;
            setForm((before) => ({ ...before, closed }));
          }}
        />
        <span>{words.closed}</span>
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={form.claim}
          onChange={(event) => {
            const claim = event.currentTarget.checked;
            setForm((before) => ({ ...before, claim }));
          }}
        />
        <span>{words.claim}</span>
      </label>
      {form.claim && (
        <>
          <p class="hint">{words.claimHint}</p>
          {field('contact', words.contact)}
        </>
      )}
      <div ref={botBox} class="bot-check" />
      {problems.length > 0 && (
        <ul class="problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{words.problems[problem]}</li>
          ))}
        </ul>
      )}
      <div class="actions">
        <button type="submit" class="action primary" disabled={busy}>
          {busy ? words.sending : words.send}
        </button>
      </div>
      <p class="fine">{words.privacy}</p>
      <p class="fine">{words.license}</p>
    </form>
  );
}
