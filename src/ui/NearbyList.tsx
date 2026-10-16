import { useEffect, useRef } from 'preact/hooks';
import type { Place } from '../domain/osmPlaces.ts';
import { townText } from '../domain/placeText.ts';
import type { Nearby } from '../domain/search.ts';
import type { Strings } from './strings.ts';

/** Where Near me stands: asking the phone, refused, no fix, or the closest places. */
export type NearState =
  | { kind: 'locating' }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'found'; nearby: Nearby[] };

interface Props {
  state: NearState;
  strings: Strings;
  onChoose: (place: Place) => void;
  onClose: () => void;
}

/** The sheet Near me opens: the closest places with their distance, or why there are none. */
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
        {words.title}
      </h2>
      {state.kind === 'locating' && <p aria-live="polite">{words.locating}</p>}
      {state.kind === 'denied' && <p role="alert">{words.denied}</p>}
      {state.kind === 'unavailable' && <p role="alert">{words.unavailable}</p>}
      {state.kind === 'found' && (
        <ul class="choices">
          {state.nearby.map(({ place, meters }) => (
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
