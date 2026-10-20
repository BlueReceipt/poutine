import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Place } from '../domain/osmPlaces.ts';
import {
  averageOf,
  checkRating,
  REVIEWS_ON,
  type RatingProblem,
  type RatingTotal,
  type Review,
} from '../domain/ratings.ts';
import { Bowl } from './Bowl.tsx';
import { bowlFor, fillOf } from './bowlArt.ts';
import { forgetStars, myRatings, myStars, raterId, rememberStars } from './rater.ts';
import { photoOf, sharePlace, shareStory, storyFile, type Shared } from './sharing.ts';
import type { RatingTrouble, ShareWords, Strings } from './strings.ts';
import { useBotCheck } from './useBotCheck.ts';

/** Under the place's name: its average and how many rated it, or that nobody has yet. */
export function RatingSummary({ total, strings }: { total?: RatingTotal; strings: Strings }) {
  const average = averageOf(total);
  return (
    <p class="rating-summary">
      {average === null || !total ? (
        strings.ratings.none
      ) : (
        <>
          <span class="bowl-small">
            <Bowl nth={bowlFor(average)} fill={1} />
          </span>
          {strings.ratings.summary(average, total.count)}
        </>
      )}
    </p>
  );
}

/** A quick second tap (a bowl more or less) sends once: the rating leaves this long after. */
const SEND_AFTER = 700;
/** How long a share waits for the rating in flight (its code goes in the link). */
const SHARE_WAITS = 3000;

/** One place's rating as the card and its share step both show it: one rating, never two. */
export interface Rating {
  /** The stars shown: just tapped, or the last sent from this phone; 0 before any. */
  shown: number;
  /** Sent from this phone (not just tapped). */
  given: boolean;
  tap: (stars: number) => void;
  /** A double tap on a star: the rating taken back. */
  clear: () => void;
  /** With reviews on: the stars and the words, sent when Send is tapped. */
  sendWords: (text: string) => void;
  state: 'idle' | 'sending' | 'sent' | 'cleared';
  /** How many places this phone has rated, once this one is sent. */
  count: number;
  trouble: RatingTrouble | null;
  /** Resolves once the rating in flight is in (or after a few seconds). */
  settled: () => Promise<void>;
  /** Where the bot check sits: once per card, whichever view shows. */
  botBox: RefObject<HTMLDivElement>;
}

/**
 * The rating of a place (Alex, 2026-10-20: one tap rates, whole bowls): a tap sends 0.7 s later
 * (a quick correction sends once), one send at a time, the bot check out of sight and renewed after
 * each. The browser remembers what it gave.
 */
export function useRating(place: Place, onRated: (total: RatingTotal) => void): Rating {
  const [given, setGiven] = useState<number | null>(() => myStars(place.osm));
  const [chosen, setChosen] = useState<number | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'cleared'>('idle');
  const [count, setCount] = useState(0);
  const [trouble, setTrouble] = useState<RatingTrouble | null>(null);
  const [checking, setChecking] = useState(false);
  const botBox = useRef<HTMLDivElement>(null);
  const bot = useBotCheck(botBox, checking);
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

  /** The rating taken back on the Worker, then on this phone (`clear` runs it after any send). */
  const takeBack = async () => {
    if (myStars(place.osm) === null) return;
    setTrouble(null);
    try {
      const response = await fetch('/api/ratings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place: place.osm, rater: raterId() }),
      });
      if (!response.ok) {
        setTrouble('unexpected');
        return;
      }
      const { total } = (await response.json()) as { total: RatingTotal };
      forgetStars(place.osm);
      setGiven(null);
      setState('cleared');
      onRated(total);
    } catch {
      setTrouble('offline');
    }
  };

  return {
    shown: chosen ?? given ?? 0,
    given: given !== null,
    clear: () => {
      window.clearTimeout(timer.current);
      latest.current = null;
      setChosen(null);
      setState('idle');
      const before = inFlight.current;
      inFlight.current = (async () => {
        await before;
        await takeBack();
      })();
    },
    tap: (stars) => {
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
    },
    sendWords: (text) => {
      if (latest.current !== null) queue(latest.current, text);
    },
    state,
    count,
    trouble,
    settled: () =>
      Promise.race([
        inFlight.current ?? Promise.resolve(),
        new Promise<void>((resolve) => {
          setTimeout(resolve, SHARE_WAITS);
        }),
      ]),
    botBox,
  };
}

/** Two taps on one bowl within this long: the rating taken back. */
const DOUBLE_TAP = 350;

/**
 * Five poutine bowls, sad to loaded, whole ones only (Alex, 2026-10-20: "with whole numbers. no
 * halfs"). Two quick taps on one bowl take the rating back ("remove all their stars by double
 * tapping the stars"). The words stay stars ("4 étoiles"). A half given before shows as half a bowl.
 */
function Bowls({ id, rating, strings }: { id: string; rating: Rating; strings: Strings }) {
  const last = useRef<{ nth: number; at: number } | null>(null);
  return (
    <div class="bowls" role="radiogroup" aria-labelledby={id}>
      {[1, 2, 3, 4, 5].map((nth) => (
        <span key={nth} class="bowl">
          <Bowl nth={nth} fill={fillOf(rating.shown, nth)} />
          <button
            type="button"
            role="radio"
            class="pick"
            aria-checked={rating.shown === nth}
            aria-label={strings.ratings.star(nth)}
            onClick={(event) => {
              const before = last.current;
              last.current = { nth, at: event.timeStamp };
              if (before && before.nth === nth && event.timeStamp - before.at < DOUBLE_TAP) {
                last.current = null;
                rating.clear();
              } else rating.tap(nth);
            }}
          />
        </span>
      ))}
    </div>
  );
}

/** Sending, sent (the how-manyth place), or what went wrong. */
function RatingStatus({ rating, strings }: { rating: Rating; strings: Strings }) {
  const words = strings.ratings;
  return (
    <>
      {rating.state !== 'idle' && (
        <p class="notice-line" role="status">
          {rating.state === 'sending'
            ? words.sending
            : rating.state === 'cleared'
              ? words.cleared
              : words.thanks(rating.count)}
        </p>
      )}
      {rating.given && rating.state !== 'sending' && <p class="hint">{words.clearHint}</p>}
      {rating.trouble && (
        <p class="problems" role="alert">
          {words.problems[rating.trouble]}
        </p>
      )}
    </>
  );
}

/** "Your rating" on the card: the stars for a quick rating, without sharing. */
export function RatingBox({
  place,
  strings,
  rating,
}: {
  place: Place;
  strings: Strings;
  rating: Rating;
}) {
  const words = strings.ratings;
  const [comment, setComment] = useState('');
  const id = `yours-${place.osm}`;
  return (
    <section class="rating-box">
      <h3 id={id}>{words.yours}</h3>
      <Bowls id={id} rating={rating} strings={strings} />
      {REVIEWS_ON && rating.shown > 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            rating.sendWords(comment);
            setComment('');
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
            <button type="submit" class="action primary" disabled={rating.state === 'sending'}>
              {words.send}
            </button>
          </div>
        </form>
      )}
      <RatingStatus rating={rating} strings={strings} />
    </section>
  );
}

interface PanelProps {
  place: Place;
  strings: Strings;
  rating: Rating;
  onBack: () => void;
}

/**
 * What the card's Partager opens (Alex, 2026-10-20: "When someone clicks on a poutine place. that
 * should be the share button. when someone clicks it, then it should show the awaye montre ta
 * pouts, and offer a button, and a rating button"): the invitation, the photo button (the photo
 * becomes the story, the stars laid over it once given), a small "just the link" for chats, and the
 * same stars as the card's.
 */
export function SharePanel({ place, strings, rating, onBack }: PanelProps) {
  const words = strings.share;
  const [linkShared, setLinkShared] = useState<Shared | null>(null);
  const id = `share-yours-${place.osm}`;
  return (
    <section class="share-panel">
      <button type="button" class="link back" onClick={onBack}>
        ← {strings.add.back}
      </button>
      <p class="invite-line">{words.invite}</p>
      <ShareRating place={place} stars={rating.shown} strings={strings} settled={rating.settled} />
      <button
        type="button"
        class="link"
        onClick={() => {
          setLinkShared(null);
          void sharePlace(place, strings).then(setLinkShared);
        }}
      >
        {words.linkOnly}
      </button>
      {linkShared && (linkShared.how === 'copied' || linkShared.how === 'failed') && (
        <p class="notice-line" role="status">
          {linkShared.how === 'copied' ? (
            words.copied
          ) : (
            <span class="share-link">{linkShared.url}</span>
          )}
        </p>
      )}
      <h3 id={id}>{strings.ratings.yours}</h3>
      <Bowls id={id} rating={rating} strings={strings} />
      <RatingStatus rating={rating} strings={strings} />
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
 * The photo: a button for one from the phone (the camera or the photos); it becomes the story
 * picture with the place and its link laid over it, and the stars once given (they follow each
 * tap), then Share opens the phone's share sheet. The photo never leaves the phone.
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
        <button
          type="button"
          class="action primary photo-button"
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
            <circle cx="12" cy="12.5" r="3.5" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
          {words.addPhoto}
        </button>
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
                <span key={nth} class="bowl-small">
                  <Bowl nth={nth} fill={fillOf(review.stars, nth)} />
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
