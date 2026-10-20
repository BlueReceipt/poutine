// The place list the app ships (data/places.json) and every short link given (data/links.json),
// bundled into the Worker for link previews and for giving approved places their links.
import listFile from '../data/places.json';
import linksFile from '../data/links.json';
import type { Place } from '../src/domain/osmPlaces.ts';

export const listed: readonly Place[] = (listFile as unknown as { places: Place[] }).places;

export const givenLinks: Readonly<Record<string, string>> = (
  linksFile as unknown as { links: Record<string, string> }
).links;
