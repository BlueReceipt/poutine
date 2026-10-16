import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'preact/hooks';
import type { Place } from '../domain/osmPlaces.ts';
import type { Strings } from '../ui/strings.ts';
import { loadMapLibre } from './maplibre.ts';
import { PLACES, boundsOf, pinFeatures, pinLayer } from './pins.ts';
import { mapStyle } from './style.ts';

declare global {
  interface Window {
    /** The map, for tests and for looking around in the browser's console. */
    poutineMap?: MapLibreMap;
  }
}

interface Props {
  places: readonly Place[];
  strings: Strings;
  onFailed: () => void;
}

export function MapView({ places, strings, onFailed }: Props) {
  const container = useRef<HTMLDivElement>(null);

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
          loaded.addSource(PLACES, { type: 'geojson', data: pinFeatures(places) });
          loaded.addLayer(pinLayer);
        });
      })
      .catch(onFailed);
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [places, strings, onFailed]);

  return <div ref={container} class="map" />;
}
