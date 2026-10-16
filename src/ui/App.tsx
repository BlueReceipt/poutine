import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import placesUrl from '../../data/places.json?url';
import { groupByAddress } from '../domain/groups.ts';
import type { Place } from '../domain/osmPlaces.ts';
import { nearest, searchPlaces } from '../domain/search.ts';
import { MapView, type MapRequest } from '../map/MapView.tsx';
import { NearbyList, type NearState } from './NearbyList.tsx';
import { PlaceCard } from './PlaceCard.tsx';
import { SearchBar } from './SearchBar.tsx';
import type { Strings } from './strings.ts';

type State = { kind: 'loading' } | { kind: 'ready'; places: Place[] } | { kind: 'failed' };

/** The selected pin, and at a shared pin the place chosen there. */
interface Selection {
  groupId: string;
  placeId: string | null;
}

/** How many places Near me lists, and how many of them the map frames around you. */
const NEARBY = 10;
const FRAMED = 3;

export function App({ strings }: { strings: Strings }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [query, setQuery] = useState('');
  const [near, setNear] = useState<NearState | null>(null);
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  const [request, setRequest] = useState<MapRequest | null>(null);
  const seq = useRef(0);
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
  const groupOf = useMemo(
    () => new Map(groups.flatMap((group) => group.places.map((place) => [place.osm, group.id]))),
    [groups],
  );
  const results = useMemo(() => (places ? searchPlaces(places, query) : []), [places, query]);
  const group = groups.find((candidate) => candidate.id === selection?.groupId) ?? null;
  const place =
    group?.places.length === 1
      ? (group.places[0] ?? null)
      : (group?.places.find((candidate) => candidate.osm === selection?.placeId) ?? null);

  const select = useCallback((groupId: string | null) => {
    setSelection(groupId ? { groupId, placeId: null } : null);
  }, []);
  const closeCard = useCallback(() => {
    setSelection(null);
  }, []);
  const closeNearby = useCallback(() => {
    setNear(null);
  }, []);

  /** A place picked in a list: its card opens and the map flies there. */
  const show = useCallback(
    (chosen: Place) => {
      const groupId = groupOf.get(chosen.osm);
      if (!groupId) return;
      setQuery('');
      setSelection({ groupId, placeId: chosen.osm });
      seq.current += 1;
      setRequest({ kind: 'place', id: groupId, seq: seq.current });
    },
    [groupOf],
  );

  const locate = useCallback(() => {
    if (!places) return;
    setSelection(null);
    setQuery('');
    setNear({ kind: 'locating' });
    if (!('geolocation' in navigator)) {
      setNear({ kind: 'unavailable' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lon: position.coords.longitude };
        const nearby = nearest(places, point, NEARBY);
        setMe(point);
        setNear({ kind: 'found', nearby });
        const framed = [point, ...nearby.slice(0, FRAMED).map(({ place: close }) => close)];
        const lons = framed.map((spot) => spot.lon);
        const lats = framed.map((spot) => spot.lat);
        seq.current += 1;
        setRequest({
          kind: 'area',
          bounds: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
          seq: seq.current,
        });
      },
      (error) => {
        setNear({ kind: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, [places]);

  return (
    <main class="app">
      {places && (
        <MapView
          places={places}
          groups={groups}
          strings={strings}
          selectedId={group?.id ?? null}
          me={me}
          request={request}
          onSelect={select}
          onFailed={failed}
        />
      )}
      <SearchBar
        strings={strings}
        count={places?.length ?? 0}
        query={query}
        results={results}
        onQuery={setQuery}
        onChoose={show}
      />
      {places && !query.trim() && (
        <button type="button" class="near-me" onClick={locate}>
          <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" stroke-width="2" />
          </svg>
          {strings.nearMe.button}
        </button>
      )}
      {state.kind === 'loading' && <p class="notice">{strings.loading}</p>}
      {state.kind === 'failed' && (
        <p class="notice" role="alert">
          {strings.mapFailed}
        </p>
      )}
      {group ? (
        <PlaceCard
          group={group}
          place={place}
          strings={strings}
          onChoose={(placeId) => {
            setSelection({ groupId: group.id, placeId });
          }}
          onClose={closeCard}
        />
      ) : (
        near && <NearbyList state={near} strings={strings} onChoose={show} onClose={closeNearby} />
      )}
    </main>
  );
}
