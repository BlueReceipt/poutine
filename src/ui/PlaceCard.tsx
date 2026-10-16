import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { PinGroup } from '../domain/groups.ts';
import { readableHours } from '../domain/hours.ts';
import type { Place } from '../domain/osmPlaces.ts';
import {
  addressLines,
  directionsUrl,
  displayPhone,
  googleMapsUrl,
  telUrl,
} from '../domain/placeText.ts';
import type { RatingTotal } from '../domain/ratings.ts';
import { RatingBox, RatingSummary, ReviewList } from './Ratings.tsx';
import type { Strings } from './strings.ts';

interface Props {
  group: PinGroup;
  /** The place shown; null at a shared pin until one is chosen. */
  place: Place | null;
  strings: Strings;
  /** Every rated place's count and stars added up (the Worker's totals); empty without them. */
  totals: Readonly<Record<string, RatingTotal>>;
  /** When this visitor last rated each place: its reviews are then asked for afresh. */
  ratedAt: Readonly<Record<string, number>>;
  onRated: (place: string, total: RatingTotal) => void;
  onChoose: (id: string) => void;
  onClose: () => void;
}

/** A sheet over the bottom of the map: one place's card, or the places sharing a pin. */
export function PlaceCard(props: Props) {
  const { group, place, strings, totals, ratedAt, onRated, onChoose, onClose } = props;
  const heading = useRef<HTMLHeadingElement>(null);

  // The card takes the focus when it opens or changes; Escape closes it.
  useEffect(() => {
    heading.current?.focus();
  }, [group, place]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const words = strings.card;
  return (
    <section class="card" role="dialog" aria-labelledby="card-title">
      <button type="button" class="close" aria-label={words.close} onClick={onClose}>
        ×
      </button>
      {place ? (
        <PlaceDetails
          key={place.osm}
          place={place}
          strings={strings}
          heading={heading}
          total={totals[place.osm]}
          ratedAt={ratedAt[place.osm] ?? 0}
          onRated={(total) => {
            onRated(place.osm, total);
          }}
        />
      ) : (
        <>
          <h2 id="card-title" ref={heading} tabIndex={-1}>
            {words.sharedPin(group.places.length)}
          </h2>
          <ul class="choices">
            {group.places.map((choice) => (
              <li key={choice.osm}>
                <button
                  type="button"
                  onClick={() => {
                    onChoose(choice.osm);
                  }}
                >
                  {choice.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface DetailsProps {
  place: Place;
  strings: Strings;
  heading: RefObject<HTMLHeadingElement>;
  total: RatingTotal | undefined;
  ratedAt: number;
  onRated: (total: RatingTotal) => void;
}

function PlaceDetails({ place, strings, heading, total, ratedAt, onRated }: DetailsProps) {
  const words = strings.card;
  const address = addressLines(place, words.near);
  const hours = place.openingHours
    ? (readableHours(place.openingHours, strings.hours) ?? [place.openingHours])
    : [];
  const links: [string, string][] = [
    [words.website, place.website],
    [words.facebook, place.facebook],
    [words.instagram, place.instagram],
    [words.menu, place.menu],
  ].filter((link): link is [string, string] => Boolean(link[1]));

  return (
    <>
      <h2 id="card-title" ref={heading} tabIndex={-1}>
        {place.name}
      </h2>
      <RatingSummary total={total} strings={strings} />
      {place.poutine === 'unconfirmed' && <p class="hint">{words.unconfirmed}</p>}
      {address.length > 0 && (
        <p class="address">
          {address.map((line, i) => (
            <span key={i}>
              {line}
              <br />
            </span>
          ))}
        </p>
      )}
      <div class="actions">
        {place.phone && (
          <a class="action primary" href={telUrl(place.phone)}>
            {words.call} · {displayPhone(place.phone)}
          </a>
        )}
        <a class="action" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer">
          {words.directions}
        </a>
      </div>
      <RatingBox place={place} strings={strings} onRated={onRated} />
      {hours.length > 0 && (
        <section class="hours">
          <h3>{words.hours}</h3>
          <ul>
            {hours.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      <ul class="links">
        {links.map(([label, url]) => (
          <li key={label}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {label}
            </a>
          </li>
        ))}
        <li>
          <a href={googleMapsUrl(place)} target="_blank" rel="noopener noreferrer">
            {words.googleMaps}
          </a>
        </li>
      </ul>
      <ReviewList place={place} strings={strings} version={ratedAt} />
    </>
  );
}
