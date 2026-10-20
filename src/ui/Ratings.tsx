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
import { myStars, raterId, rememberStars } from './rater.ts';
import { photoOf, shareStory, storyFile, type Shared } from './sharing.ts';
import type { RatingTrouble, ShareWords, Strings } from './strings.ts';
import { useBotCheck } from './useBotCheck.ts';

function Star({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
    </svg>
  );
}

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
            <Star filled />
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

/**
 * "Your rating": five stars to tap, then Send (the bot check waits behind it). A written review
 * goes with them only once reviews are switched on. The browser remembers what it gave.
 */
export function RatingBox({ place, strings, onRated }: BoxProps) {
  const words = strings.ratings;
  const [given, setGiven] = useState<number | null>(() => myStars(place.osm));
  const [chosen, setChosen] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  // Asked only where nothing confirms poutine yet; not answering is fine.
  const asks = place.poutine === 'unconfirmed';
  const [hadPoutine, setHadPoutine] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [trouble, setTrouble] = useState<RatingTrouble | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const bot = useBotCheck(box, chosen !== null);
  useEffect(() => {
    if (bot.failed) setTrouble('bot-check');
  }, [bot.failed]);

  const shown = chosen ?? given ?? 0;

  const send = async () => {
    if (chosen === null) return;
    const fields = {
      place: place.osm,
      rater: raterId(),
      stars: chosen,
      ...(REVIEWS_ON && comment.trim() ? { comment } : {}),
      ...(asks && hadPoutine !== null ? { poutine: hadPoutine } : {}),
    };
    const checked = checkRating(fields);
    if ('problems' in checked) {
      setTrouble(checked.problems[0] ?? 'not-a-rating');
      return;
    }
    setSending(true);
    setTrouble(null);
    const token = await bot.token();
    if (!token) {
      setTrouble('bot-check');
      setSending(false);
      return;
    }
    try {
      const response = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, botCheck: token }),
      });
      if (response.ok) {
        const { total, code } = (await response.json()) as { total: RatingTotal; code?: string };
        rememberStars(place.osm, chosen, code);
        setGiven(chosen);
        setChosen(null);
        setComment('');
        setThanks(true);
        onRated(total);
        return;
      }
      bot.renew();
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
    } catch {
      bot.renew();
      setTrouble('offline');
    } finally {
      setSending(false);
    }
  };

  return (
    <section class="rating-box">
      <h3 id={`yours-${place.osm}`}>{words.yours}</h3>
      <div class="stars" role="radiogroup" aria-labelledby={`yours-${place.osm}`}>
        {[1, 2, 3, 4, 5].map((stars) => (
          <button
            key={stars}
            type="button"
            role="radio"
            aria-checked={shown === stars}
            aria-label={words.star(stars)}
            onClick={() => {
              setChosen(stars);
              setThanks(false);
              setTrouble(null);
            }}
          >
            <Star filled={stars <= shown} />
          </button>
        ))}
      </div>
      {chosen !== null && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          {asks && (
            <fieldset class="had-poutine">
              <legend>{words.hadPoutine}</legend>
              {[true, false].map((answer) => (
                <label key={String(answer)}>
                  <input
                    type="radio"
                    name={`had-poutine-${place.osm}`}
                    checked={hadPoutine === answer}
                    onChange={() => {
                      setHadPoutine(answer);
                    }}
                  />
                  {answer ? words.yes : words.no}
                </label>
              ))}
            </fieldset>
          )}
          {REVIEWS_ON && (
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
          )}
          <div ref={box} class="bot-check" />
          <div class="actions">
            <button type="submit" class="action primary" disabled={sending}>
              {sending ? words.sending : words.send}
            </button>
          </div>
        </form>
      )}
      {thanks && (
        <p class="notice-line" role="status">
          {words.thanks}
        </p>
      )}
      {trouble && (
        <p class="problems" role="alert">
          {words.problems[trouble]}
        </p>
      )}
      {given !== null && chosen === null && (
        <ShareRating place={place} stars={given} strings={strings} />
      )}
    </section>
  );
}

/**
 * Share my rating, once this browser rated the place (Alex, 2026-10-19: "as a insta story, or
 * facebook story. and it shares a url to the website"): the story picture and the place's link
 * with the stars. With my photo (2026-10-20) draws the visitor's photo into the picture first;
 * the photo never leaves the phone.
 */
function ShareRating({ place, stars, strings }: { place: Place; stars: number; strings: Strings }) {
  const words = strings.share;
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState<Shared | null>(null);
  const [withPhoto, setWithPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (withPhoto) URL.revokeObjectURL(withPhoto.preview);
    },
    [withPhoto],
  );

  const share = async (file: File | Promise<File>, kind: 'share-story' | 'share-photo') => {
    setBusy(true);
    setShared(null);
    setShared(await shareStory(file, place, stars, strings, kind));
    setBusy(false);
  };
  const picked = async (chosen: File | undefined) => {
    if (!chosen) return;
    setShared(null);
    setPhotoFailed(false);
    setBusy(true);
    const photo = await photoOf(chosen);
    if (!photo) {
      setPhotoFailed(true);
      setBusy(false);
      return;
    }
    try {
      const file = await storyFile(place, stars, strings, photo);
      setWithPhoto({ file, preview: URL.createObjectURL(file) });
    } catch {
      setPhotoFailed(true);
    } finally {
      photo.close();
      setBusy(false);
    }
  };

  return (
    <div class="share">
      {withPhoto ? (
        <div class="with-photo">
          <img src={withPhoto.preview} alt="" width={108} height={192} />
          <div>
            <p class="hint">{words.photoNote}</p>
            <div class="actions">
              <button
                type="button"
                class="action primary"
                disabled={busy}
                onClick={() => {
                  void share(withPhoto.file, 'share-photo');
                }}
              >
                {words.place}
              </button>
              <button
                type="button"
                class="action"
                onClick={() => {
                  setWithPhoto(null);
                  setShared(null);
                }}
              >
                {words.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div class="actions">
          <button
            type="button"
            class="action"
            disabled={busy}
            onClick={() => {
              void share(storyFile(place, stars, strings), 'share-story');
            }}
          >
            {busy ? words.making : words.button}
          </button>
          <button
            type="button"
            class="action"
            disabled={busy}
            onClick={() => {
              picker.current?.click();
            }}
          >
            {words.withPhoto}
          </button>
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
        </div>
      )}
      <p class="hint">{words.hint}</p>
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
              {[1, 2, 3, 4, 5].map((stars) => (
                <span key={stars} class="star-small">
                  <Star filled={stars <= review.stars} />
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
