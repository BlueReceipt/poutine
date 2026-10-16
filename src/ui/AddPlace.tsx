import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { placementFor, splitStreet, type AddressCandidate } from '../domain/addresses.ts';
import { possibleDuplicates } from '../domain/duplicates.ts';
import { metersBetween, type Place } from '../domain/osmPlaces.ts';
import { townText } from '../domain/placeText.ts';
import { checkNewPlace, type PlacedBy, type Problem } from '../domain/submission.ts';
import { noFixOf, whereAmI } from './location.ts';
import type { AddProblem, Strings } from './strings.ts';
import { loadTurnstile, siteKey } from './turnstile.ts';

/** Where pin picking starts: a spot and how close, or the map as it is. */
export type PickStart = { lat: number; lon: number; zoom: number } | 'as-is';

type Step = 'where' | 'pin' | 'details' | 'sent';

interface Props {
  places: readonly Place[];
  strings: Strings;
  /** The map's center while picking: where the pin stands. */
  picked: { lat: number; lon: number } | null;
  onPick: (start: PickStart | null) => void;
  /** "Is it one of these?" → open that place's card instead. */
  onOpen: (place: Place) => void;
  onClose: () => void;
}

/** A pin moved farther than this from where the address or the phone put it was put by hand. */
const MOVED = 25;

const FIRST: Record<AddProblem, Step> = {
  name: 'where',
  town: 'where',
  position: 'pin',
  phone: 'details',
  website: 'details',
  poutine: 'details',
  'too-long': 'details',
  'not-a-place': 'details',
  'bot-check': 'details',
  'too-many': 'details',
  'queue-full': 'details',
  offline: 'details',
  unexpected: 'details',
};

/**
 * Add a place, in a sheet over the map: where it is (address, or I'm here), the pin (the map moves
 * under it), a few details and the bot check, then thanks. It waits for Alex's approval.
 */
export function AddPlace({ places, strings, picked, onPick, onOpen, onClose }: Props) {
  const words = strings.add;
  const heading = useRef<HTMLHeadingElement>(null);
  const botCheck = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>('where');
  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('QC');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [servesPoutine, setServesPoutine] = useState(false);
  const [placedBy, setPlacedBy] = useState<PlacedBy>('hand');
  const [start, setStart] = useState<{ lat: number; lon: number } | null>(null);
  const [postcode, setPostcode] = useState('');
  const [busy, setBusy] = useState<'finding' | 'locating' | 'sending' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [offerByHand, setOfferByHand] = useState(false);
  const [problems, setProblems] = useState<AddProblem[]>([]);
  const widget = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiting = useRef<((value: string) => void)[]>([]);

  const gotToken = (value: string | null) => {
    token.current = value;
    if (value) for (const resolve of waiting.current.splice(0)) resolve(value);
  };
  /** The bot check's token, waiting up to 15 s for Cloudflare's answer; null if none came. */
  const botToken = (): Promise<string | null> =>
    token.current
      ? Promise.resolve(token.current)
      : new Promise((resolve) => {
          waiting.current.push(resolve);
          setTimeout(() => {
            resolve(token.current);
          }, 15_000);
        });
  /** A token is spent once sent: a new check for the next try. */
  const newBotCheck = () => {
    gotToken(null);
    if (widget.current) window.turnstile?.reset(widget.current);
  };

  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  // Leaving the form, the map stops picking.
  useEffect(
    () => () => {
      onPick(null);
    },
    [onPick],
  );

  // The bot check, once the details show: Cloudflare's widget, mostly invisible. Its token comes
  // a moment later; Send waits for it rather than failing (each token is good for one send).
  useEffect(() => {
    if (step !== 'details' || !botCheck.current) return;
    let gone = false;
    const container = botCheck.current;
    loadTurnstile()
      .then((turnstile) => {
        if (gone) return;
        widget.current = turnstile.render(container, {
          sitekey: siteKey(window.location.hostname),
          callback: gotToken,
          'expired-callback': () => {
            gotToken(null);
          },
          'error-callback': () => {
            gotToken(null);
          },
          language: document.documentElement.lang,
          appearance: 'interaction-only',
        });
      })
      .catch(() => {
        setProblems(['bot-check']);
      });
    return () => {
      gone = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
      gotToken(null);
    };
  }, [step]);

  const pinAt = (where: { lat: number; lon: number }, how: PlacedBy, zoom: number) => {
    setPlacedBy(how);
    setStart(where);
    setNotice(null);
    setOfferByHand(false);
    onPick({ ...where, zoom });
    setStep('pin');
  };

  const needsNameAndTown = (): boolean => {
    const missing: AddProblem[] = [];
    if (!name.trim()) missing.push('name');
    if (!city.trim()) missing.push('town');
    setProblems(missing);
    return missing.length === 0;
  };

  const find = async () => {
    if (!needsNameAndTown()) return;
    setBusy('finding');
    setNotice(null);
    const query = { street: street.trim(), town: city.trim(), postalCode: '', province };
    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      });
      if (!response.ok) throw new Error(String(response.status));
      const { candidates } = (await response.json()) as { candidates: AddressCandidate[] };
      const placement = street.trim() ? placementFor(query, candidates) : null;
      if (placement) {
        setPostcode(placement.postalCode);
        pinAt(placement, placement.precision, placement.precision === 'address' ? 18 : 16);
      } else {
        setNotice(words.notFound);
        setOfferByHand(true);
      }
    } catch {
      setNotice(words.lookupFailed);
      setOfferByHand(true);
    } finally {
      setBusy(null);
    }
  };

  const here = async () => {
    if (!needsNameAndTown()) return;
    setBusy('locating');
    setNotice(null);
    try {
      pinAt(await whereAmI(), 'me', 18);
    } catch (error) {
      setNotice(noFixOf(error) === 'denied' ? strings.nearMe.denied : strings.nearMe.unavailable);
      setOfferByHand(true);
    } finally {
      setBusy(null);
    }
  };

  const byHand = () => {
    if (!needsNameAndTown()) return;
    setPlacedBy('hand');
    setStart(null);
    setNotice(null);
    onPick('as-is');
    setStep('pin');
  };

  const pinDone = () => {
    if (!picked) return;
    if (start && metersBetween(start, picked) > MOVED) setPlacedBy('hand');
    setProblems([]);
    setStep('details');
  };

  const duplicates = useMemo(() => {
    if (step !== 'details' || !picked) return [];
    return possibleDuplicates(places, { name, ...splitStreet(street), city, ...picked });
  }, [step, places, name, street, city, picked]);

  const send = async () => {
    const fields = {
      name,
      street,
      city,
      province,
      postcode,
      lat: picked?.lat ?? Number.NaN,
      lon: picked?.lon ?? Number.NaN,
      placedBy,
      phone,
      website,
      servesPoutine,
    };
    const checked = checkNewPlace(fields);
    if ('problems' in checked) {
      setProblems(checked.problems);
      setStep(FIRST[checked.problems[0] ?? 'not-a-place']);
      return;
    }
    setBusy('sending');
    setProblems([]);
    const check = await botToken();
    if (!check) {
      setProblems(['bot-check']);
      setBusy(null);
      return;
    }
    try {
      const response = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, botCheck: check }),
      });
      if (response.status === 201) {
        onPick(null);
        setStep('sent');
        return;
      }
      newBotCheck();
      const answer = (await response.json().catch(() => ({}))) as {
        error?: string;
        problems?: Problem[];
      };
      if (answer.problems?.length) {
        setProblems(answer.problems);
        setStep(FIRST[answer.problems[0] ?? 'not-a-place']);
      } else if (
        answer.error === 'bot-check' ||
        answer.error === 'too-many' ||
        answer.error === 'queue-full'
      )
        setProblems([answer.error]);
      else setProblems(['unexpected']);
    } catch {
      newBotCheck();
      setProblems(['offline']);
    } finally {
      setBusy(null);
    }
  };

  const problemList = problems.length > 0 && (
    <ul class="problems" role="alert">
      {problems.map((problem) => (
        <li key={problem}>{words.problems[problem]}</li>
      ))}
    </ul>
  );

  return (
    <section
      class={`card add ${step === 'pin' ? 'picking' : 'form'}`}
      role="dialog"
      aria-labelledby="add-title"
    >
      <button type="button" class="close" aria-label={words.close} onClick={onClose}>
        ×
      </button>

      {step === 'where' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void find();
          }}
        >
          <h2 id="add-title" ref={heading} tabIndex={-1}>
            {words.title}
          </h2>
          {problemList}
          <label class="field">
            <span>{words.name}</span>
            <input
              value={name}
              maxLength={120}
              autoComplete="off"
              enterKeyHint="next"
              onInput={(event) => {
                setName(event.currentTarget.value);
              }}
            />
          </label>
          <label class="field">
            <span>{words.street}</span>
            <input
              value={street}
              maxLength={120}
              placeholder={words.streetHint}
              autoComplete="off"
              enterKeyHint="next"
              onInput={(event) => {
                setStreet(event.currentTarget.value);
              }}
            />
          </label>
          <div class="row">
            <label class="field">
              <span>{words.town}</span>
              <input
                value={city}
                maxLength={120}
                autoComplete="off"
                enterKeyHint="search"
                onInput={(event) => {
                  setCity(event.currentTarget.value);
                }}
              />
            </label>
            <label class="field narrow">
              <span>{words.province}</span>
              <select
                value={province}
                onChange={(event) => {
                  setProvince(event.currentTarget.value);
                }}
              >
                {words.provinces.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {notice && (
            <p class="notice-line" role="status">
              {notice}
            </p>
          )}
          <div class="actions">
            <button type="submit" class="action primary" disabled={busy !== null}>
              {busy === 'finding' ? words.finding : words.find}
            </button>
            <button
              type="button"
              class="action"
              disabled={busy !== null}
              onClick={() => {
                void here();
              }}
            >
              {busy === 'locating' ? words.locating : words.here}
            </button>
          </div>
          {offerByHand && (
            <button type="button" class="link" onClick={byHand}>
              {words.byHand}
            </button>
          )}
        </form>
      )}

      {step === 'pin' && (
        <>
          <h2 id="add-title" ref={heading} tabIndex={-1}>
            {words.pinTitle}
          </h2>
          {problemList}
          <p>{words.pinAt[placedBy]}</p>
          <div class="actions">
            <button type="button" class="action primary" disabled={!picked} onClick={pinDone}>
              {words.pinOk}
            </button>
            <button
              type="button"
              class="action"
              onClick={() => {
                onPick(null);
                setStep('where');
              }}
            >
              {words.back}
            </button>
          </div>
        </>
      )}

      {step === 'details' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <h2 id="add-title" ref={heading} tabIndex={-1}>
            {words.detailsTitle}
          </h2>
          {duplicates.length > 0 && (
            <section class="maybe-known">
              <h3>{words.maybeKnown}</h3>
              <ul>
                {duplicates.map((place) => (
                  <li key={place.osm}>
                    <span>
                      <span class="name">{place.name}</span>
                      <span class="where">{townText(place, strings.card.near)}</span>
                    </span>
                    <button
                      type="button"
                      class="action"
                      onClick={() => {
                        onOpen(place);
                      }}
                    >
                      {words.open}
                    </button>
                  </li>
                ))}
              </ul>
              <p class="where">{words.maybeKnownHint}</p>
            </section>
          )}
          <label class="field">
            <span>
              {words.phone} <small>({words.optional})</small>
            </span>
            <input
              type="tel"
              value={phone}
              maxLength={40}
              autoComplete="off"
              enterKeyHint="next"
              onInput={(event) => {
                setPhone(event.currentTarget.value);
              }}
            />
          </label>
          <label class="field">
            <span>
              {words.website} <small>({words.optional})</small>
            </span>
            <input
              type="text"
              inputMode="url"
              value={website}
              maxLength={120}
              autoComplete="off"
              autoCapitalize="off"
              spellcheck={false}
              onInput={(event) => {
                setWebsite(event.currentTarget.value);
              }}
            />
          </label>
          <label class="check">
            <input
              type="checkbox"
              checked={servesPoutine}
              onChange={(event) => {
                setServesPoutine(event.currentTarget.checked);
              }}
            />
            <span>{words.servesPoutine}</span>
          </label>
          <div ref={botCheck} class="bot-check" />
          {problemList}
          <div class="actions">
            <button type="submit" class="action primary" disabled={busy !== null}>
              {busy === 'sending' ? words.sending : words.send}
            </button>
            <button
              type="button"
              class="action"
              disabled={busy !== null}
              onClick={() => {
                onPick('as-is');
                setStep('pin');
              }}
            >
              {words.back}
            </button>
          </div>
          <p class="fine">{words.privacy}</p>
          <p class="fine">{words.license}</p>
        </form>
      )}

      {step === 'sent' && (
        <>
          <h2 id="add-title" ref={heading} tabIndex={-1}>
            {words.sentTitle}
          </h2>
          <p>{words.sent(name.trim())}</p>
          <div class="actions">
            <button type="button" class="action primary" onClick={onClose}>
              {words.close}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
