import { useCallback, useEffect, useState } from 'preact/hooks';
import placesUrl from '../../data/places.json?url';
import type { Place } from '../domain/osmPlaces.ts';
import { MapView } from '../map/MapView.tsx';
import type { Strings } from './strings.ts';

type State = { kind: 'loading' } | { kind: 'ready'; places: Place[] } | { kind: 'failed' };

export function App({ strings }: { strings: Strings }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const failed = useCallback(() => {
    setState({ kind: 'failed' });
  }, []);

  useEffect(() => {
    fetch(placesUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`places.json answered ${String(response.status)}`);
        return response.json() as Promise<{ places: Place[] }>;
      })
      .then(({ places }) => {
        setState({ kind: 'ready', places });
      })
      .catch(failed);
  }, [failed]);

  return (
    <main class="app">
      {state.kind === 'ready' && (
        <MapView places={state.places} strings={strings} onFailed={failed} />
      )}
      <header class="badge">
        <h1>{strings.appName}</h1>
        {state.kind === 'ready' && <p>{strings.placeCount(state.places.length)}</p>}
      </header>
      {state.kind === 'loading' && <p class="notice">{strings.loading}</p>}
      {state.kind === 'failed' && (
        <p class="notice" role="alert">
          {strings.mapFailed}
        </p>
      )}
    </main>
  );
}
