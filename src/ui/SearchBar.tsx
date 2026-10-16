import type { Place } from '../domain/osmPlaces.ts';
import { townText } from '../domain/placeText.ts';
import type { Strings } from './strings.ts';

interface Props {
  strings: Strings;
  /** How many places the map holds, for the placeholder. */
  count: number;
  query: string;
  results: readonly Place[];
  onQuery: (query: string) => void;
  onChoose: (place: Place) => void;
  /** Add a place: the search didn't find it. */
  onAdd: (name: string) => void;
}

/** The app's name and the search field across the top; what matches drops down below it. */
export function SearchBar({ strings, count, query, results, onQuery, onChoose, onAdd }: Props) {
  const words = strings.search;
  const searching = query.trim() !== '';
  return (
    <header class="top">
      <div class="bar">
        <h1>{strings.appName}</h1>
        <input
          type="search"
          value={query}
          aria-label={words.label}
          placeholder={words.placeholder(count)}
          enterKeyHint="search"
          autoComplete="off"
          spellcheck={false}
          onInput={(event) => {
            onQuery(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onQuery('');
            if (event.key === 'Enter' && results[0]) onChoose(results[0]);
          }}
        />
        {query && (
          <button
            type="button"
            class="clear"
            aria-label={words.clear}
            onClick={() => {
              onQuery('');
            }}
          >
            ×
          </button>
        )}
      </div>
      <p class="visually-hidden" aria-live="polite">
        {searching ? words.found(results.length) : ''}
      </p>
      {searching && (
        <div class="results">
          {results.length === 0 ? (
            <p class="empty">{words.none(query.trim())}</p>
          ) : (
            <ul>
              {results.map((place) => (
                <li key={place.osm}>
                  <button
                    type="button"
                    onClick={() => {
                      onChoose(place);
                    }}
                  >
                    <span class="name">{place.name}</span>
                    <span class="where">{townText(place, strings.card.near)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            class="add-missing"
            onClick={() => {
              onAdd(query.trim());
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
              <path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2.5" />
            </svg>
            {words.addMissing(query.trim())}
          </button>
        </div>
      )}
    </header>
  );
}
