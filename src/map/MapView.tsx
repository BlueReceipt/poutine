import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import { useEffect, useRef } from 'preact/hooks';
import type { PinGroup } from '../domain/groups.ts';
import type { Place } from '../domain/osmPlaces.ts';
import type { PickStart } from '../ui/AddPlace.tsx';
import type { Strings } from '../ui/strings.ts';
import { loadMapLibre } from './maplibre.ts';
import {
  ME,
  PLACES,
  boundsOf,
  meFeatures,
  meLayer,
  pinFeatures,
  pinLayers,
  selectedFilter,
} from './pins.ts';
import { mapStyle } from './style.ts';

declare global {
  interface Window {
    /** The map, for tests and for looking around in the browser's console. */
    poutineMap?: MapLibreMap;
  }
}

/** How far from a pin a finger may land, in screen pixels: the pins are small, fingers aren't. */
const TAP = 22;

/** Where the app asks the map to go: a pin chosen in a list, or an area (you and the closest). */
export type MapRequest =
  | { kind: 'place'; id: string; seq: number }
  | { kind: 'area'; bounds: [number, number, number, number]; seq: number };

/**
 * The share of the map's height the Add a place sheet covers while the pin is placed (the sheet's
 * height in styles.css, .card.picking): the pin stands in the middle of what's left above it.
 */
export const PICK_SHEET = 0.45;

interface Props {
  places: readonly Place[];
  groups: readonly PinGroup[];
  strings: Strings;
  selectedId: string | null;
  /** Where you are, once Near me found it. */
  me: { lat: number; lon: number } | null;
  request: MapRequest | null;
  /** Add a place's pin: the map moves under it; null when no pin is being placed. */
  picking: { start: PickStart; seq: number } | null;
  onPicked: (center: { lat: number; lon: number }) => void;
  onSelect: (id: string | null) => void;
  onFailed: () => void;
}

/** The pin nearest the tap among those within reach, or null. */
function nearestPin(map: MapLibreMap, x: number, y: number): MapGeoJSONFeature | null {
  const within = map.queryRenderedFeatures(
    [
      [x - TAP, y - TAP],
      [x + TAP, y + TAP],
    ],
    { layers: ['pins'] },
  );
  let best: MapGeoJSONFeature | null = null;
  let bestDistance = Infinity;
  for (const feature of within) {
    const [lon = 0, lat = 0] = (feature.geometry as Point).coordinates;
    const at = map.project([lon, lat]);
    const distance = Math.hypot(at.x - x, at.y - y);
    if (distance < bestDistance) {
      best = feature;
      bestDistance = distance;
    }
  }
  return best;
}

const still = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function MapView(props: Props) {
  const { places, groups, strings, selectedId, me, request, picking, onSelect, onFailed } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const picked = useRef(props.onPicked);
  picked.current = props.onPicked;
  const isPicking = useRef(false);
  isPicking.current = picking !== null;
  const meNow = useRef<FeatureCollection<Point>>(meFeatures(me));
  meNow.current = meFeatures(me);

  useEffect(() => {
    let map: MapLibreMap | undefined;
    let cancelled = false;
    void loadMapLibre()
      .then((maplibre) => {
        if (cancelled || !container.current) return;
        map = new maplibre.Map({
          container: container.current,
          style: mapStyle(window.location.origin),
          bounds: boundsOf(places),
          fitBoundsOptions: { padding: 40 },
          attributionControl: { compact: true, customAttribution: strings.placesCredit },
        });
        window.poutineMap = map;
        const loaded = map;
        loaded.on('load', () => {
          loaded.addSource(PLACES, { type: 'geojson', data: pinFeatures(groups) });
          for (const layer of pinLayers) loaded.addLayer(layer);
          loaded.addSource(ME, { type: 'geojson', data: meNow.current });
          loaded.addLayer(meLayer);
          mapRef.current = loaded;
        });
        loaded.on('click', (event) => {
          // While a new place's pin is placed, a tap only moves the map.
          if (isPicking.current) return;
          const pin = nearestPin(loaded, event.point.x, event.point.y);
          select.current(pin ? String(pin.properties.id) : null);
        });
        loaded.on('moveend', () => {
          if (!isPicking.current) return;
          const center = loaded.getCenter();
          picked.current({ lat: center.lat, lon: center.lng });
        });
        loaded.on('mouseenter', 'pins', () => {
          loaded.getCanvas().style.cursor = 'pointer';
        });
        loaded.on('mouseleave', 'pins', () => {
          loaded.getCanvas().style.cursor = '';
        });
      })
      .catch(onFailed);
    return () => {
      cancelled = true;
      mapRef.current = null;
      map?.remove();
    };
  }, [places, groups, strings, onFailed]);

  // The selected pin wears its ring, and slides into view when the card or the search bar would
  // hide it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setFilter('selected', selectedFilter(selectedId));
    const group = groups.find((candidate) => candidate.id === selectedId);
    if (!group) return;
    const height = map.getContainer().clientHeight;
    const { y } = map.project([group.lon, group.lat]);
    if (y < 90 || y > height * 0.4)
      map.easeTo({
        center: [group.lon, group.lat],
        offset: [0, -height * 0.25],
        duration: still() ? 0 : 400,
      });
  }, [selectedId, groups]);

  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>(ME)?.setData(meFeatures(me));
  }, [me]);

  // A place chosen in a list: fly there, close enough to see the streets around it. Near me: show
  // you and the closest places, above the list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !request) return;
    const height = map.getContainer().clientHeight;
    if (request.kind === 'place') {
      const group = groups.find((candidate) => candidate.id === request.id);
      if (!group) return;
      map.flyTo({
        center: [group.lon, group.lat],
        zoom: Math.max(map.getZoom(), 14),
        offset: [0, -height * 0.25],
        duration: still() ? 0 : 1200,
      });
    } else {
      map.fitBounds(request.bounds, {
        padding: { top: 140, bottom: height * 0.5, left: 40, right: 40 },
        maxZoom: 15,
        duration: still() ? 0 : 1200,
      });
    }
  }, [request, groups]);

  // Add a place: the map keeps the bottom of the screen for the sheet, so its center (where the pin
  // stands) is the middle of what's left; it flies to where the address or the phone put the place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const height = map.getContainer().clientHeight;
    const duration = still() ? 0 : 800;
    if (!picking) {
      map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration });
      return;
    }
    const padding = { top: 0, bottom: height * PICK_SHEET, left: 0, right: 0 };
    if (picking.start === 'as-is') map.easeTo({ padding, duration });
    else
      map.flyTo({
        center: [picking.start.lon, picking.start.lat],
        zoom: picking.start.zoom,
        padding,
        duration: still() ? 0 : 1200,
      });
  }, [picking]);

  return <div ref={container} class="map" />;
}
