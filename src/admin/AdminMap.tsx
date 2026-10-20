import type { FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'preact/hooks';
import type { Place } from '../domain/osmPlaces.ts';
import { loadMapLibre } from '../map/maplibre.ts';
import { GRAVY } from '../map/pins.ts';
import { mapStyle } from '../map/style.ts';

interface Props {
  /** The place waiting, where its pin is now. */
  at: { lat: number; lon: number };
  lookAlikes: readonly Place[];
  /** While fixing: a tap on the map moves the pin there. */
  onMove: ((at: { lat: number; lon: number }) => void) | null;
}

const WAITING = 'waiting';
const OTHERS = 'look-alikes';

const pointOf = (spots: readonly { lat: number; lon: number }[]): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: spots.map((spot) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [spot.lon, spot.lat] },
    properties: {},
  })),
});

/** A small map of one waiting place (gravy pin) and the places it may already be (white rings). */
export function AdminMap({ at, lookAlikes, onMove }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const move = useRef(onMove);
  move.current = onMove;

  useEffect(() => {
    let map: MapLibreMap | undefined;
    let gone = false;
    void loadMapLibre().then((maplibre) => {
      if (gone || !box.current) return;
      map = new maplibre.Map({
        container: box.current,
        style: mapStyle(window.location.origin),
        center: [at.lon, at.lat],
        zoom: 16,
        attributionControl: { compact: true },
      });
      const loaded = map;
      loaded.on('load', () => {
        loaded.addSource(OTHERS, { type: 'geojson', data: pointOf(lookAlikes) });
        loaded.addLayer({
          id: OTHERS,
          type: 'circle',
          source: OTHERS,
          paint: {
            'circle-radius': 8,
            'circle-color': '#ffffff',
            'circle-stroke-color': GRAVY,
            'circle-stroke-width': 3,
          },
        });
        loaded.addSource(WAITING, { type: 'geojson', data: pointOf([at]) });
        loaded.addLayer({
          id: WAITING,
          type: 'circle',
          source: WAITING,
          paint: {
            'circle-radius': 10,
            'circle-color': GRAVY,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 3,
          },
        });
        mapRef.current = loaded;
      });
      loaded.on('click', (event) => {
        move.current?.({ lat: event.lngLat.lat, lon: event.lngLat.lng });
      });
    });
    return () => {
      gone = true;
      mapRef.current = null;
      map?.remove();
    };
    // The map is made once per place shown (the page keys it on the place); the pin moves below.
  }, []);

  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>(WAITING)?.setData(pointOf([at]));
  }, [at]);

  return <div ref={box} class="admin-map" />;
}
