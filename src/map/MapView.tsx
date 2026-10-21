import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import { useEffect, useRef } from 'preact/hooks';
import type { PinGroup } from '../domain/groups.ts';
import type { Place } from '../domain/osmPlaces.ts';
import type { PickStart } from '../ui/AddPlace.tsx';
import { BOX, drawBowl } from '../ui/bowlArt.ts';
import type { Strings } from '../ui/strings.ts';
import { loadMapLibre } from './maplibre.ts';
import {
  ME,
  PLACES,
  boundsOf,
  meFeatures,
  meLayer,
  pinFeatures,
  pinImage,
  pinLayers,
  PIN_PIXELS,
  PIN_RATIO,
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
  /** The stars this visitor gave, by place: their pins show that bowl. */
  rated: Readonly<Record<string, number>>;
  /** The places raters confirmed serve poutine. */
  confirmed: ReadonlySet<string>;
  request: MapRequest | null;
  /** Add a place's pin: the map moves under it; null when no pin is being placed. */
  picking: { start: PickStart; seq: number } | null;
  onPicked: (center: { lat: number; lon: number }) => void;
  onSelect: (id: string | null) => void;
  /** A long press on a pin (its group's ID): Add more info (Alex, 2026-10-20). */
  onLongPress: (id: string) => void;
  onFailed: () => void;
}

/** How long a finger or a button stays on a pin for a long press, in ms, and how far it may slide. */
const LONG_PRESS = 500;
const LONG_PRESS_SLIDE = 10;

/** How far each pin's soft shadow reaches, in the pictures' pixels. */
const SHADOW = 14;

/**
 * The pins' pictures: the empty tray and the five bowls, each over a soft shadow so the silver stands
 * out on the grey map (Alex, 2026-10-20, choosing "B: the trays with a shadow"), drawn once on canvas.
 */
function pinImages(map: MapLibreMap): void {
  const height = Math.round((PIN_PIXELS * BOX.height) / BOX.width);
  for (let bowl = 0; bowl <= 5; bowl += 1) {
    const art = document.createElement('canvas');
    art.width = PIN_PIXELS;
    art.height = height;
    const drawn = art.getContext('2d');
    const pin = document.createElement('canvas');
    pin.width = PIN_PIXELS + SHADOW * 2;
    pin.height = height + SHADOW * 2;
    const context = pin.getContext('2d');
    if (!drawn || !context) return;
    drawBowl(drawn, bowl, 1, 0, (height - PIN_PIXELS) / 2, PIN_PIXELS);
    context.shadowColor = 'rgba(0, 0, 0, 0.55)';
    context.shadowBlur = 10;
    context.shadowOffsetY = 3;
    context.drawImage(art, SHADOW, SHADOW);
    map.addImage(pinImage(bowl), context.getImageData(0, 0, pin.width, pin.height), {
      pixelRatio: PIN_RATIO,
    });
  }
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

/**
 * A place chosen in a list: fly there, close enough to see the streets around it. Near me: show
 * you and the closest places, above the list. `instant` when the map is only starting (a place's
 * link).
 */
function go(map: MapLibreMap, request: MapRequest, groups: readonly PinGroup[], instant: boolean) {
  const height = map.getContainer().clientHeight;
  const duration = instant || still() ? 0 : 1200;
  if (request.kind === 'place') {
    const group = groups.find((candidate) => candidate.id === request.id);
    if (!group) return;
    map.flyTo({
      center: [group.lon, group.lat],
      zoom: Math.max(map.getZoom(), 14),
      offset: [0, -height * 0.25],
      duration,
    });
  } else {
    map.fitBounds(request.bounds, {
      padding: { top: 140, bottom: height * 0.5, left: 40, right: 40 },
      maxZoom: 15,
      duration,
    });
  }
}

export function MapView(props: Props) {
  const { places, groups, strings, selectedId, me, rated, confirmed, request, picking } = props;
  const { onSelect, onFailed } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const longPress = useRef(props.onLongPress);
  longPress.current = props.onLongPress;
  const picked = useRef(props.onPicked);
  picked.current = props.onPicked;
  const isPicking = useRef(false);
  isPicking.current = picking !== null;
  const ratedNow = useRef(rated);
  ratedNow.current = rated;
  const confirmedNow = useRef(confirmed);
  confirmedNow.current = confirmed;
  const meNow = useRef<FeatureCollection<Point>>(meFeatures(me));
  meNow.current = meFeatures(me);
  // What was asked before the map was ready (a place's link): it starts there.
  const requestNow = useRef(request);
  requestNow.current = request;
  const selectedNow = useRef(selectedId);
  selectedNow.current = selectedId;
  const done = useRef(0);

  useEffect(() => {
    let map: MapLibreMap | undefined;
    let cancelled = false;
    void loadMapLibre()
      .then((maplibre) => {
        if (cancelled || !container.current) return;
        // The map's box is the screen whatever the stylesheet does: without it (a browser kept a
        // broken copy, see restyle.ts) the box once grew without end and hid every control.
        Object.assign(container.current.style, {
          position: 'absolute',
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
        });
        map = new maplibre.Map({
          container: container.current,
          style: mapStyle(window.location.origin),
          bounds: boundsOf(places),
          fitBoundsOptions: { padding: 40 },
          attributionControl: { compact: true, customAttribution: strings.placesCredit },
        });
        window.poutineMap = map;
        const loaded = map;
        const pending = () => {
          const asked = requestNow.current;
          if (!asked || asked.seq === done.current) return;
          done.current = asked.seq;
          go(loaded, asked, groups, true);
        };
        pending();
        loaded.on('load', () => {
          loaded.addSource(PLACES, {
            type: 'geojson',
            data: pinFeatures(groups, ratedNow.current, confirmedNow.current),
          });
          pinImages(loaded);
          for (const layer of pinLayers) loaded.addLayer(layer);
          loaded.setFilter('selected', selectedFilter(selectedNow.current));
          loaded.addSource(ME, { type: 'geojson', data: meNow.current });
          loaded.addLayer(meLayer);
          mapRef.current = loaded;
          pending();
        });
        // A long press on a pin opens its Add more info (Alex, 2026-10-20: "if we long press a
        // poutine area, can it open the function, add more info"); sliding, a second finger or
        // letting go before LONG_PRESS is an ordinary touch.
        let press: { x: number; y: number; timer: number } | null = null;
        let pressedAt = 0;
        const letGo = () => {
          if (press) window.clearTimeout(press.timer);
          press = null;
        };
        const hold = (x: number, y: number) => {
          letGo();
          if (isPicking.current) return;
          const pin = nearestPin(loaded, x, y);
          if (!pin) return;
          const id = String(pin.properties.id);
          press = {
            x,
            y,
            timer: window.setTimeout(() => {
              press = null;
              pressedAt = Date.now();
              longPress.current(id);
            }, LONG_PRESS),
          };
        };
        const slide = (x: number, y: number) => {
          if (press && Math.hypot(x - press.x, y - press.y) > LONG_PRESS_SLIDE) letGo();
        };
        loaded.on('touchstart', (event) => {
          if (event.points.length === 1) hold(event.point.x, event.point.y);
          else letGo();
        });
        loaded.on('touchmove', (event) => {
          slide(event.point.x, event.point.y);
        });
        loaded.on('touchend', letGo);
        loaded.on('touchcancel', letGo);
        loaded.on('mousedown', (event) => {
          if (event.originalEvent.button === 0) hold(event.point.x, event.point.y);
        });
        loaded.on('mousemove', (event) => {
          slide(event.point.x, event.point.y);
        });
        loaded.on('mouseup', letGo);
        loaded.on('dragstart', letGo);
        loaded.on('click', (event) => {
          // While a new place's pin is placed, a tap only moves the map; the tap that ends a long
          // press is no tap.
          if (isPicking.current || Date.now() - pressedAt < 800) return;
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

  // A place just rated shows its bowl at once; one raters just confirmed turns solid.
  useEffect(() => {
    mapRef.current
      ?.getSource<GeoJSONSource>(PLACES)
      ?.setData(pinFeatures(groups, rated, confirmed));
  }, [rated, confirmed, groups]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !request) return;
    done.current = request.seq;
    go(map, request, groups, false);
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
