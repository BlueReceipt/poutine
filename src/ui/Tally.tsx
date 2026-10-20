import { useEffect, useRef } from 'preact/hooks';
import type { Place } from '../domain/osmPlaces.ts';
import { townText } from '../domain/placeText.ts';
import type { Strings } from './strings.ts';

interface Props {
  /** The places this browser rated, with the stars it gave. */
  eaten: readonly { place: Place; stars: number }[];
  strings: Strings;
  onChoose: (place: Place) => void;
  onClose: () => void;
}

/**
 * The places eaten (Alex, 2026-10-20: "a counter, for each user. showing how many place's they've
 * eaten", "Gotta eat 'em all" / "Mange-les toutes"): the ones this phone rated, the green pins,
 * with the stars given. No account: the count lives on the phone.
 */
export function Tally({ eaten, strings, onChoose, onClose }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const words = strings.tally;

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
    <section class="card" role="dialog" aria-labelledby="tally-title">
      <button type="button" class="close" aria-label={strings.card.close} onClick={onClose}>
        ×
      </button>
      <h2 id="tally-title" ref={heading} tabIndex={-1}>
        {words.title(eaten.length)}
      </h2>
      <p class="tally-motto">{words.motto}</p>
      <ul class="choices">
        {eaten.map(({ place, stars }) => (
          <li key={place.osm}>
            <button
              type="button"
              onClick={() => {
                onChoose(place);
              }}
            >
              <span class="name">{place.name}</span>
              <span class="where">
                {[townText(place, strings.card.near), strings.ratings.star(stars)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
