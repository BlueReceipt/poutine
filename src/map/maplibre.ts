export type MapLibre = typeof import('maplibre-gl');

let loading: Promise<MapLibre> | null = null;

/** MapLibre, loaded once and only when the map shows, its worker bundled and served from the app. */
export function loadMapLibre(): Promise<MapLibre> {
  loading ??= (async () => {
    const [maplibre, worker] = await Promise.all([
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
    ]);
    maplibre.setWorkerUrl(worker.default);
    return maplibre;
  })();
  return loading;
}
