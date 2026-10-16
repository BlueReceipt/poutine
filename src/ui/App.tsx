import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import placesUrl from '../../data/places.json?url';
import { groupByAddress } from '../domain/groups.ts';
import type { Place } from '../domain/osmPlaces.ts';
import { MapView } from '../map/MapView.tsx';
import { PlaceCard } from './PlaceCard.tsx';
import type { Strings } from './strings.ts';

type State = { kind: 'loading' } | { kind: 'ready'; places: Place[] } | { kind: 'failed' };

/** The selected pin, and at a shared pin the place chosen there. */
interface Selection {
  groupId: string;
  placeId: string | null;
}

export function App({ strings }: { strings: Strings }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [selection, setSelection] = useState<Selection | null>(null);
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

  const places = state.kind === 'ready' ? state.places : null;
  const groups = useMemo(() => (places ? groupByAddress(places) : []), [places]);
  const group = groups.find((candidate) => candidate.id === selection?.groupId) ?? null;
  const place =
    group?.places.length === 1
      ? (group.places[0] ?? null)
      : (group?.places.find((candidate) => candidate.osm === selection?.placeId) ?? null);

  const select = useCallback((groupId: string | null) => {
    setSelection(groupId ? { groupId, placeId: null } : null);
  }, []);
  const close = useCallback(() => {
    setSelection(null);
  }, []);

  return (
    <main class="app">
      {places && (
        <MapView
          places={places}
          groups={groups}
          strings={strings}
          selectedId={group?.id ?? null}
          onSelect={select}
          onFailed={failed}
        />
      )}
      <header class="badge">
        <h1>{strings.appName}</h1>
        {places && <p>{strings.placeCount(places.length)}</p>}
      </header>
      {state.kind === 'loading' && <p class="notice">{strings.loading}</p>}
      {state.kind === 'failed' && (
        <p class="notice" role="alert">
          {strings.mapFailed}
        </p>
      )}
      {group && (
        <PlaceCard
          group={group}
          place={place}
          strings={strings}
          onChoose={(placeId) => {
            setSelection({ groupId: group.id, placeId });
          }}
          onClose={close}
        />
      )}
    </main>
  );
}
