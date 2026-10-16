import 'maplibre-gl/dist/maplibre-gl.css';
import type { Point } from 'geojson';
import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import { useEffect, useRef } from 'preact/hooks';
import type { PinGroup } from '../domain/groups.ts';
import type { Place } from '../domain/osmPlaces.ts';
import type { Strings } from '../ui/strings.ts';
import { loadMapLibre } from './maplibre.ts';
import { PLACES, boundsOf, pinFeatures, pinLayers, selectedFilter } from './pins.ts';
import { mapStyle } from './style.ts';

declare global {
  interface Window {
    /** The map, for tests and for looking around in the browser's console. */
    poutineMap?: MapLibreMap;
  }
}

/** How far from a pin a finger may land, in screen pixels: the pins are small, fingers aren't. */
const TAP = 22;

interface Props {
  places: readonly Place[];
  groups: readonly PinGroup[];
  strings: Strings;
  selectedId: string | null;
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

export function MapView({ places, groups, strings, selectedId, onSelect, onFailed }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

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
        mapRef.current = map;
        const loaded = map;
        loaded.on('load', () => {
          loaded.addSource(PLACES, { type: 'geojson', data: pinFeatures(groups) });
          for (const layer of pinLayers) loaded.addLayer(layer);
        });
        loaded.on('click', (event) => {
          const pin = nearestPin(loaded, event.point.x, event.point.y);
          select.current(pin ? String(pin.properties.id) : null);
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

  // The selected pin wears its ring, and slides above the card when the card would hide it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer('selected')) return;
    map.setFilter('selected', selectedFilter(selectedId));
    const group = groups.find((candidate) => candidate.id === selectedId);
    if (!group) return;
    const height = map.getContainer().clientHeight;
    if (map.project([group.lon, group.lat]).y > height * 0.4) {
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      map.easeTo({
        center: [group.lon, group.lat],
        offset: [0, -height * 0.25],
        duration: still ? 0 : 400,
      });
    }
  }, [selectedId, groups]);

  return <div ref={container} class="map" />;
}
