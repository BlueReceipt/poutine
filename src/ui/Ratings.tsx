import { useEffect, useId, useRef, useState } from 'preact/hooks';
import type { Place } from '../domain/osmPlaces.ts';
import {
  averageOf,
  checkRating,
  REVIEWS_ON,
  type RatingProblem,
  type RatingTotal,
  type Review,
} from '../domain/ratings.ts';
import { myRatings, myStars, raterId, rememberStars } from './rater.ts';
import { photoOf, shareStory, storyFile, type Shared } from './sharing.ts';
import type { RatingTrouble, ShareWords, Strings } from './strings.ts';
import { useBotCheck } from './useBotCheck.ts';

const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';

/** A star filled to `fill` (0, ½ or 1) from the left. */
function Star({ fill }: { fill: number }) {
  const clip = useId();
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <rect x="0" y="0" width={24 * fill} height="24" />
        </clipPath>
      </defs>
      <path d={STAR_PATH} fill="currentColor" clip-path={`url(#${clip})`} />
      <path
        d={STAR_PATH}
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** How much of the nth star (1 to 5) a rating fills. */
const fillOf = (stars: number, nth: number): number => Math.max(0, Math.min(1, stars - (nth - 1)));

/** Under the place's name: its average and how many rated it, or that nobody has yet. */
export function RatingSummary({ total, strings }: { total?: RatingTotal; strings: Strings }) {
  const average = averageOf(total);
  return (
    <p class="rating-summary">
      {average === null || !total ? (
        strings.ratings.none
      ) : (
        <>
          <span class="star-small">
            <Star fill={1} />
          </span>
          {strings.ratings.summary(average, total.count)}
        </>
      )}
    </p>
  );
}

interface BoxProps {
  place: Place;
  strings: Strings;
  onRated: (total: RatingTotal) => void;
}

/** A quick second tap (a half star more or less) sends once: the rating leaves this long after. */
const SEND_AFTER = 700;
/** How long a share waits for the rating in flight (its code goes in the link). */
const SHARE_WAITS = 3000;

/**
 * "Your rating" (Alex, 2026-10-20: one tap rates, half stars too): five stars, each in two halves;
 * a tap sends (the bot check runs out of sight), and the invitation to share shows at once. A
 * written review goes with the stars only once reviews are switched on. The browser remembers what
 * it gave.
 */
export function RatingBox({ place, strings, onRated }: BoxProps) {
  const words = strings.ratings;
  const [given, setGiven] = useState<number | null>(() => myStars(place.osm));
  const [chosen, setChosen] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  /** How many places this phone has rated, once this one is sent. */
  const [count, setCount] = useState(0);
  const [trouble, setTrouble] = useState<RatingTrouble | null>(null);
  const [checking, setChecking] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const bot = useBotCheck(box, checking);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<number | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (bot.failed) setTrouble('bot-check');
  }, [bot.failed]);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const shown = chosen ?? given ?? 0;

  const sendNow = async (stars: number, text: string): Promise<void> => {
    const fields = {
      place: place.osm,
      rater: raterId(),
      stars,
      ...(REVIEWS_ON && text.trim() ? { comment: text } : {}),
    };
    const checked = checkRating(fields);
    if ('problems' in checked) {
      setTrouble(checked.problems[0] ?? 'not-a-rating');
      return;
    }
    setState('sending');
    setTrouble(null);
    const token = await bot.token();
    if (!token) {
      setTrouble('bot-check');
      setState('idle');
      return;
    }
    try {
      const response = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, botCheck: token }),
      });
      // A token is spent once sent: a new check for the next tap.
      bot.renew();
      if (response.ok) {
        const { total, code } = (await response.json()) as { total: RatingTotal; code?: string };
        rememberStars(place.osm, stars, code);
        setCount(Object.keys(myRatings()).length);
        setGiven(stars);
        if (latest.current === stars) {
          setChosen(null);
          setState('sent');
        }
        setComment('');
        onRated(total);
        return;
      }
      const answer = (await response.json().catch(() => ({}))) as {
        error?: string;
        problems?: RatingProblem[];
      };
      const known: RatingTrouble[] = ['bot-check', 'too-many', 'already-rated'];
      setTrouble(
        answer.problems?.[0] ??
          (known.includes(answer.error as RatingTrouble)
            ? (answer.error as RatingTrouble)
            : 'unexpected'),
      );
      setState('idle');
    } catch {
      bot.renew();
      setTrouble('offline');
      setState('idle');
    }
  };

  /** One send at a time, the latest stars only. */
  const queue = (stars: number, text = '') => {
    const before = inFlight.current;
    const run = async () => {
      await before;
      if (latest.current === stars) await sendNow(stars, text);
    };
    inFlight.current = run();
  };

  const tap = (stars: number) => {
    setChosen(stars);
    setTrouble(null);
    setChecking(true);
    latest.current = stars;
    window.clearTimeout(timer.current);
    // With reviews on, the words go with the stars when Send is tapped.
    if (!REVIEWS_ON)
      timer.current = window.setTimeout(() => {
        queue(stars);
      }, SEND_AFTER);
  };

  /** The share step waits (a little) for the rating in flight. */
  const settled = () =>
    Promise.race([
      inFlight.current ?? Promise.resolve(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, SHARE_WAITS);
      }),
    ]);

  return (
    <section class="rating-box">
      <h3 id={`yours-${place.osm}`}>{words.yours}</h3>
      <div class="stars" role="radiogroup" aria-labelledby={`yours-${place.osm}`}>
        {[1, 2, 3, 4, 5].map((nth) => (
          <span key={nth} class="star">
            <Star fill={fillOf(shown, nth)} />
            {[nth - 0.5, nth].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                class={value === nth ? 'half right' : 'half left'}
                aria-checked={shown === value}
                aria-label={words.star(value)}
                onClick={() => {
                  tap(value);
                }}
              />
            ))}
          </span>
        ))}
      </div>
      <div ref={box} class="bot-check" />
      {REVIEWS_ON && chosen !== null && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            queue(chosen, comment);
          }}
        >
          <label class="field">
            <span>
              {words.comment} <small>({strings.add.optional})</small>
            </span>
            <textarea
              value={comment}
              maxLength={500}
              rows={3}
              onInput={(event) => {
                setComment(event.currentTarget.value);
              }}
            />
          </label>
          <div class="actions">
            <button type="submit" class="action primary" disabled={state === 'sending'}>
              {words.send}
            </button>
          </div>
        </form>
      )}
      {state !== 'idle' && (
        <p class="notice-line" role="status">
          {state === 'sending' ? words.sending : words.thanks(count)}
        </p>
      )}
      {trouble && (
        <p class="problems" role="alert">
          {words.problems[trouble]}
        </p>
      )}
      {shown > 0 && <ShareRating place={place} stars={shown} strings={strings} settled={settled} />}
    </section>
  );
}

interface ShareProps {
  place: Place;
  stars: number;
  strings: Strings;
  /** Resolves once the rating in flight is in (or after a few seconds). */
  settled: () => Promise<void>;
}

/**
 * Under the stars once rated (Alex, 2026-10-20: "Don't be shy, show us the goods" / "Awaye, montre
 * ta pouts"): one button for a photo from the phone (Android offers the camera or the photos); the
 * photo becomes the story picture with the stars, the place and its link laid over it, then
 * Share opens the phone's share sheet. The photo never leaves the phone.
 */
function ShareRating({ place, stars, strings, settled }: ShareProps) {
  const words = strings.share;
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState<Shared | null>(null);
  const [photo, setPhoto] = useState<ImageBitmap | null>(null);
  const [made, setMade] = useState<{ file: File; preview: string } | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // The picture again when the stars change (a half more or less) or a new photo comes.
  useEffect(() => {
    if (!photo) return;
    let gone = false;
    setBusy(true);
    storyFile(place, stars, strings, photo)
      .then((file) => {
        if (!gone) setMade({ file, preview: URL.createObjectURL(file) });
      })
      .catch(() => {
        if (!gone) setPhotoFailed(true);
      })
      .finally(() => {
        if (!gone) setBusy(false);
      });
    return () => {
      gone = true;
    };
  }, [photo, stars, place, strings]);
  useEffect(
    () => () => {
      if (made) URL.revokeObjectURL(made.preview);
    },
    [made],
  );
  useEffect(
    () => () => {
      photo?.close();
    },
    [photo],
  );

  const picked = async (file: File | undefined) => {
    if (!file) return;
    setShared(null);
    setPhotoFailed(false);
    setBusy(true);
    const bitmap = await photoOf(file);
    if (!bitmap) {
      setPhotoFailed(true);
      setBusy(false);
      return;
    }
    setPhoto(bitmap);
  };
  const share = async () => {
    if (!made) return;
    setShared(null);
    await settled();
    setShared(await shareStory(made.file, place, stars, strings, 'share-photo'));
  };

  return (
    <div class="share">
      {made ? (
        <div class="with-photo">
          <img src={made.preview} alt="" width={108} height={192} />
          <div>
            <p class="hint">{words.photoNote}</p>
            <div class="actions">
              <button
                type="button"
                class="action primary"
                disabled={busy}
                onClick={() => {
                  void share();
                }}
              >
                {words.place}
              </button>
              <button
                type="button"
                class="action"
                disabled={busy}
                onClick={() => {
                  picker.current?.click();
                }}
              >
                {words.changePhoto}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div class="invite">
          <p class="invite-line">{words.invite}</p>
          <button
            type="button"
            class="action primary"
            disabled={busy}
            onClick={() => {
              picker.current?.click();
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d="M4 7h3l2-2.5h6L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
              />
              <circle
                cx="12"
                cy="12.5"
                r="3.5"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              />
            </svg>
            {words.addPhoto}
          </button>
        </div>
      )}
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const input = event.currentTarget;
          void picked(input.files?.[0]);
          input.value = '';
        }}
      />
      {made && <p class="hint">{words.hint}</p>}
      {photoFailed && (
        <p class="problems" role="alert">
          {words.photoFailed}
        </p>
      )}
      {shared && <SharedLine shared={shared} words={words} />}
    </div>
  );
}

/** After sharing: a saved picture, a failure, or the link to copy by hand when it couldn't be. */
function SharedLine({ shared, words }: { shared: Shared; words: ShareWords }) {
  const { how, copied, url } = shared;
  const said =
    how === 'failed'
      ? words.failed
      : how === 'saved'
        ? copied
          ? `${words.saved} ${words.linkCopied}`
          : words.saved
        : '';
  const link = !copied && how !== 'cancelled';
  if (!said && !link) return null;
  return (
    <p class="notice-line" role="status">
      {said}
      {link && (
        <>
          {said && ' '}
          {words.copyThis} <span class="share-link">{url}</span>
        </>
      )}
    </p>
  );
}

interface ListProps {
  place: Place;
  strings: Strings;
  /** Bumped when this visitor rates: the list is asked for afresh, past the minute's cache. */
  version: number;
}

/** The place's latest written reviews; shown only once reviews are switched on. */
export function ReviewList({ place, strings, version }: ListProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  useEffect(() => {
    if (!REVIEWS_ON) return;
    let gone = false;
    const fresh = version > 0 ? `&v=${String(version)}` : '';
    fetch(`/api/reviews?place=${encodeURIComponent(place.osm)}${fresh}`)
      .then((response) => (response.ok ? response.json() : { reviews: [] }))
      .then((answer: { reviews: Review[] }) => {
        if (!gone) setReviews(answer.reviews);
      })
      .catch(() => {
        // No reviews shown: the card works without them.
      });
    return () => {
      gone = true;
    };
  }, [place.osm, version]);
  if (!REVIEWS_ON || reviews.length === 0) return null;
  return (
    <section class="reviews">
      <h3>{strings.ratings.reviews}</h3>
      <ul>
        {reviews.map((review, i) => (
          <li key={i}>
            <span class="review-stars" aria-label={strings.ratings.star(review.stars)}>
              {[1, 2, 3, 4, 5].map((nth) => (
                <span key={nth} class="star-small">
                  <Star fill={fillOf(review.stars, nth)} />
                </span>
              ))}
            </span>{' '}
            <span class="where">{review.date}</span>
            <p>{review.comment}</p>
            <a
              class="where"
              href={`mailto:alex@ederer.digital?subject=${encodeURIComponent(`Review: ${place.name} (${place.osm}, ${review.date})`)}`}
            >
              {strings.ratings.report}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
