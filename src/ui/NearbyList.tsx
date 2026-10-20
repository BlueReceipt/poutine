import { useEffect, useRef } from 'preact/hooks';
import type { Place } from '../domain/osmPlaces.ts';
import { townText } from '../domain/placeText.ts';
import type { Around, Nearby } from '../domain/search.ts';
import type { Strings } from './strings.ts';

/** Where À côté stands: asking the phone, refused, no fix, or the places around. */
export type NearState =
  | { kind: 'locating' }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | ({ kind: 'found' } & Around);

interface Props {
  state: NearState;
  strings: Strings;
  onChoose: (place: Place) => void;
  onClose: () => void;
}

/**
 * The sheet À côté opens (Alex, 2026-10-20: "limit it to a 2km radius, if there isn't then 5, then
 * 10, then 15"): every place within the first ring with any, nearest first, with its distance; none
 * within 15 km says so and shows the closest place; or why there is no position.
 */
export function NearbyList({ state, strings, onChoose, onClose }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const words = strings.nearMe;

  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <section class="card" role="dialog" aria-labelledby="nearby-title">
      <button type="button" class="close" aria-label={strings.card.close} onClick={onClose}>
        ×
      </button>
      <h2 id="nearby-title" ref={heading} tabIndex={-1}>
        {state.kind !== 'found'
          ? words.title
          : state.nearby.length > 0
            ? words.within(state.km)
            : words.none(state.km)}
      </h2>
      {state.kind === 'locating' && <p aria-live="polite">{words.locating}</p>}
      {state.kind === 'denied' && <p role="alert">{words.denied}</p>}
      {state.kind === 'unavailable' && <p role="alert">{words.unavailable}</p>}
      {state.kind === 'found' && state.closest && <p class="closest">{words.closest}</p>}
      {state.kind === 'found' && (
        <ul class="choices">
          {(state.closest ? [state.closest] : state.nearby).map(({ place, meters }: Nearby) => (
            <li key={place.osm}>
              <button
                type="button"
                onClick={() => {
                  onChoose(place);
                }}
              >
                <span class="name">{place.name}</span>
                <span class="where">
                  {[townText(place, strings.card.near), words.distance(meters)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
