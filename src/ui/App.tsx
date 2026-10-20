import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import placesUrl from '../../data/places.json?url';
import { groupByAddress } from '../domain/groups.ts';
import { placeIdFromPath, placePath } from '../domain/links.ts';
import { linkFromPath, searchFor } from '../domain/shortLinks.ts';
import type { Place } from '../domain/osmPlaces.ts';
import { confirmedByRaters, type RatingTotal } from '../domain/ratings.ts';
import { around, searchPlaces } from '../domain/search.ts';
import { MapView, type MapRequest } from '../map/MapView.tsx';
import { AddPlace, type PickStart } from './AddPlace.tsx';
import { noFixOf, whereAmI } from './location.ts';
import { closeWelcome, myRatings, nothingSaved } from './rater.ts';
import { NearbyList, type NearState } from './NearbyList.tsx';
import { PlaceCard } from './PlaceCard.tsx';
import { SearchBar } from './SearchBar.tsx';
import { Settings } from './Settings.tsx';
import { chosenLanguage } from './settings.ts';
import { Tally } from './Tally.tsx';
import { Welcome } from './Welcome.tsx';
import type { Language, Strings } from './strings.ts';

/**
 * A friend's stars the Worker checked and wrote in the page of a place's link (worker/pages.ts);
 * null without them (a typed "?s=5" alone shows nothing).
 */
function friendOnPage(): number | null {
  const stars = Number(
    document.querySelector('meta[name="poutine-friend"]')?.getAttribute('content'),
  );
  return Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null;
}

type State = { kind: 'loading' } | { kind: 'ready'; places: Place[] } | { kind: 'failed' };

/** The selected pin, and at a shared pin the place chosen there. */
interface Selection {
  groupId: string;
  placeId: string | null;
}

export function App({
  strings,
  onLanguage,
}: {
  strings: Strings;
  /** A language chosen in the secret menu (null: the phone's): the app comes back in it. */
  onLanguage: (language: Language | null) => void;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [query, setQuery] = useState('');
  const [near, setNear] = useState<NearState | null>(null);
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  const [request, setRequest] = useState<MapRequest | null>(null);
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState('');
  const [picking, setPicking] = useState<{ start: PickStart; seq: number } | null>(null);
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [totals, setTotals] = useState<Record<string, RatingTotal>>({});
  const [ratedAt, setRatedAt] = useState<Record<string, number>>({});
  // The places this browser rated and the stars it gave, for their pins' bowls.
  const [mine, setMine] = useState<Record<string, number>>(() => myRatings());
  // A first visit's welcome box: until it's closed, or the visitor opens something else.
  const [welcome, setWelcome] = useState(nothingSaved);
  // The places eaten (the ones this phone rated): the pill by Near me opens their list.
  const [tally, setTally] = useState(false);
  // The secret menu, behind the app's name.
  const [settings, setSettings] = useState(false);
  const seq = useRef(0);
  const failed = useCallback(() => {
    setState({ kind: 'failed' });
  }, []);

  // The list the app ships, and the places Alex approved since (from the Worker; without it, the
  // list alone), so a link to a new place opens it too.
  useEffect(() => {
    const listed = fetch(placesUrl).then((response) => {
      if (!response.ok) throw new Error(`places.json answered ${String(response.status)}`);
      return response.json() as Promise<{ places: Place[] }>;
    });
    const added = fetch('/api/added', { cache: 'no-cache' })
      .then((response) => (response.ok ? response.json() : { places: [] }))
      .catch(() => ({ places: [] })) as Promise<{ places: Place[] }>;
    Promise.all([listed, added])
      .then(([list, since]) => {
        const known = new Set(list.places.map((place) => place.osm));
        setState({
          kind: 'ready',
          places: [...list.places, ...since.places.filter((place) => !known.has(place.osm))],
        });
      })
      .catch(failed);
  }, [failed]);

  // The stars of every rated place, from the Worker; without it (offline, npm run dev) cards say
  // nobody has rated yet, and rating says why it couldn't be sent.
  useEffect(() => {
    fetch('/api/ratings')
      .then((response) => (response.ok ? response.json() : { totals: {} }))
      .then((answer: { totals: Record<string, RatingTotal> }) => {
        setTotals(answer.totals);
      })
      .catch(() => {
        // No stars shown.
      });
  }, []);
  const rated = useCallback((place: string, total: RatingTotal) => {
    setTotals((before) => ({ ...before, [place]: total }));
    setRatedAt((before) => ({ ...before, [place]: Date.now() }));
    setMine(myRatings());
  }, []);
  const confirmed = useMemo(
    () =>
      new Set(
        Object.entries(totals)
          .filter(([, total]) => confirmedByRaters(total))
          .map(([place]) => place),
      ),
    [totals],
  );

  const places = state.kind === 'ready' ? state.places : null;
  // The places this phone rated that the map still has, by name, with the stars given.
  const eaten = useMemo(
    () =>
      (places ?? [])
        .filter((place) => mine[place.osm] !== undefined)
        .map((place) => ({ place, stars: mine[place.osm] ?? 0 }))
        .sort((a, b) => a.place.name.localeCompare(b.place.name, 'fr')),
    [places, mine],
  );
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
  const closeWelcomeBox = useCallback(() => {
    closeWelcome();
    setWelcome(false);
  }, []);
  useEffect(() => {
    if (group || near || adding || tally || settings) setWelcome(false);
  }, [group, near, adding, tally, settings]);

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

  // A place's link (poutines.app/labanquise, or an older /p/… one) opens its card once the places
  // are in; a friend's stars in it ("?s=4") show on that card for the visit.
  // Another word in the address (a name several places share, a town) goes to the search.
  const linked = useRef<string | null>(window.location.pathname);
  const [friend, setFriend] = useState<{ place: string; stars: number } | null>(null);
  useEffect(() => {
    if (!places || linked.current === null) return;
    const path = linked.current;
    linked.current = null;
    const id = placeIdFromPath(path);
    const word = id ? null : linkFromPath(path);
    const chosen = places.find((candidate) =>
      id ? candidate.osm === id : word !== null && candidate.link === word,
    );
    if (chosen) {
      const stars = friendOnPage();
      if (stars !== null) setFriend({ place: chosen.osm, stars });
      show(chosen);
      return;
    }
    const looked = word ? searchFor(word, places) : null;
    if (looked) setQuery(looked);
  }, [places, show]);

  // The address bar names the open place, so the browser's own Share and Copy link give its link.
  useEffect(() => {
    if (!places || linked.current !== null) return;
    const path = place ? placePath(place) : '/';
    if (window.location.pathname !== path) history.replaceState(null, '', path);
    document.title = place ? `${place.name} · ${strings.appName}` : strings.appName;
  }, [places, place, strings]);

  const locate = useCallback(() => {
    if (!places) return;
    setTally(false);
    setSelection(null);
    setQuery('');
    setNear({ kind: 'locating' });
    whereAmI()
      .then((point) => {
        const found = around(places, point);
        setMe(point);
        setNear({ kind: 'found', ...found });
        // The map frames you and every place listed (or the closest, when none is within 15 km).
        const listed = found.closest ? [found.closest] : found.nearby;
        const framed = [point, ...listed.map(({ place: close }) => close)];
        const lons = framed.map((spot) => spot.lon);
        const lats = framed.map((spot) => spot.lat);
        seq.current += 1;
        setRequest({
          kind: 'area',
          bounds: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
          seq: seq.current,
        });
      })
      .catch((error: unknown) => {
        setNear({ kind: noFixOf(error) });
      });
  }, [places]);

  const pick = useCallback((start: PickStart | null) => {
    if (!start) {
      setPicking(null);
      return;
    }
    seq.current += 1;
    setPicking({ start, seq: seq.current });
  }, []);
  /** Add a place, from a search that didn't find it: its name starts as what was searched. */
  const startAdding = useCallback((name: string) => {
    setSelection(null);
    setNear(null);
    setQuery('');
    setPicked(null);
    setAddName(name);
    setAdding(true);
  }, []);
  const closeAdding = useCallback(() => {
    setAdding(false);
    setPicking(null);
  }, []);

  return (
    <main class="app">
      {places && (
        <MapView
          places={places}
          groups={groups}
          strings={strings}
          selectedId={group?.id ?? null}
          me={me}
          rated={mine}
          confirmed={confirmed}
          request={request}
          picking={picking}
          onPicked={setPicked}
          onSelect={select}
          onFailed={failed}
        />
      )}
      {picking && (
        <div class="pick-pin" aria-hidden="true">
          <svg viewBox="0 0 32 44" width="32" height="44">
            <path
              d="M16 2C8.3 2 2 8.1 2 15.7 2 26 16 42 16 42s14-16 14-26.3C30 8.1 23.7 2 16 2z"
              fill="#7a4a2a"
              stroke="#ffffff"
              stroke-width="2.5"
            />
            <circle cx="16" cy="15.5" r="5" fill="#ffffff" />
          </svg>
        </div>
      )}
      <SearchBar
        strings={strings}
        query={query}
        results={results}
        onQuery={setQuery}
        onChoose={show}
        onAdd={startAdding}
        onSettings={() => {
          setNear(null);
          setSelection(null);
          setTally(false);
          setSettings(true);
        }}
      />
      {places && !query.trim() && !adding && (
        <div class="map-actions">
          {eaten.length > 0 && (
            <button
              type="button"
              class="pill tally-pill"
              aria-label={strings.tally.label(eaten.length)}
              onClick={() => {
                setNear(null);
                setSelection(null);
                setTally(true);
              }}
            >
              <img src="/icon.svg" alt="" width="24" height="24" />
              {eaten.length}
            </button>
          )}
          <button type="button" class="pill near-me" onClick={locate}>
            <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
              <circle cx="12" cy="12" r="4" fill="currentColor" />
              <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" stroke-width="2" />
            </svg>
            {strings.nearMe.button}
          </button>
        </div>
      )}
      {state.kind === 'loading' && <p class="notice">{strings.loading}</p>}
      {state.kind === 'failed' && (
        <p class="notice" role="alert">
          {strings.mapFailed}
        </p>
      )}
      {adding && places ? (
        <AddPlace
          places={places}
          strings={strings}
          initialName={addName}
          picked={picked}
          onPick={pick}
          onOpen={(existing) => {
            closeAdding();
            show(existing);
          }}
          onClose={closeAdding}
        />
      ) : group ? (
        <PlaceCard
          group={group}
          place={place}
          strings={strings}
          totals={totals}
          ratedAt={ratedAt}
          friend={friend}
          onRated={rated}
          onChoose={(placeId) => {
            setSelection({ groupId: group.id, placeId });
          }}
          onClose={closeCard}
        />
      ) : near ? (
        <NearbyList state={near} strings={strings} onChoose={show} onClose={closeNearby} />
      ) : settings ? (
        <Settings
          strings={strings}
          chosen={chosenLanguage()}
          onLanguage={onLanguage}
          onClose={() => {
            setSettings(false);
          }}
        />
      ) : tally ? (
        <Tally
          eaten={eaten}
          strings={strings}
          onChoose={(chosen) => {
            setTally(false);
            show(chosen);
          }}
          onClose={() => {
            setTally(false);
          }}
        />
      ) : (
        welcome && places && <Welcome strings={strings} onClose={closeWelcomeBox} />
      )}
    </main>
  );
}
