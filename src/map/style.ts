import { namedFlavor, type Flavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';
import { ONLINE, onlineLayers } from './onlineLayers.ts';

export const FONT_REGULAR = 'Atkinson Hyperlegible Next Regular';
export const FONT_BOLD = 'Atkinson Hyperlegible Next Bold';

/** A color's gray of the same lightness (Rec. 709 luma). */
export function gray(hex: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return hex;
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => Number.parseInt(part ?? '0', 16));
  const level = Math.round(0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0));
  const channel = level.toString(16).padStart(2, '0');
  return `#${channel}${channel}${channel}`;
}

function desaturated<T>(value: T): T {
  if (typeof value === 'string') return gray(value) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, desaturated(inner)]),
    ) as T;
  return value;
}

/**
 * The street map, as Terrain draws it: Protomaps' light colors desaturated so the pins own the
 * color, French names in the app's font, from OpenFreeMap's tiles.
 */
export function mapStyle(origin: string): StyleSpecification {
  const flavor: Flavor = {
    ...desaturated(namedFlavor('light')),
    regular: FONT_REGULAR,
    bold: FONT_BOLD,
    italic: FONT_REGULAR,
  };
  return {
    version: 8,
    glyphs: `${origin}/map-assets/glyphs/{fontstack}/{range}.pbf`,
    sources: {
      [ONLINE]: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution:
          '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: onlineLayers(flavor, FONT_REGULAR, FONT_BOLD),
  };
}
