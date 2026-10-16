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
import type { Strings } from './strings.ts';

interface Props {
  group: PinGroup;
  /** The place shown; null at a shared pin until one is chosen. */
  place: Place | null;
  strings: Strings;
  onChoose: (id: string) => void;
  onClose: () => void;
}

/** A sheet over the bottom of the map: one place's card, or the places sharing a pin. */
export function PlaceCard({ group, place, strings, onChoose, onClose }: Props) {
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
        <PlaceDetails place={place} strings={strings} heading={heading} />
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
}

function PlaceDetails({ place, strings, heading }: DetailsProps) {
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
    </>
  );
}
