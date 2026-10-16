import type { Place } from './osmPlaces.ts';

/** "+16135242952" → "613 524-2952"; anything else as stored. */
export function displayPhone(e164: string): string {
  const digits = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return digits ? `${digits[1] ?? ''} ${digits[2] ?? ''}-${digits[3] ?? ''}` : e164;
}

/**
 * The card's two address lines: the street, then the town (with its province outside Québec, and
 * "near …" when the town is only the nearest one) and the postal code. Empty lines are left out.
 */
export function addressLines(place: Place, near: (town: string) => string): string[] {
  const street = [place.housenumber, place.street].filter(Boolean).join(' ');
  const townLine = [townText(place, near), place.postcode].filter(Boolean).join('  ');
  return [street, townLine].filter(Boolean);
}

/** The town alone, as lists show it: "Saint-Isidore, ON", "near Sayabec", "Montréal". */
export function townText(place: Place, near: (town: string) => string): string {
  const town = place.citySource === 'nearest-town' && place.city ? near(place.city) : place.city;
  return town && place.province && place.province !== 'QC' ? `${town}, ${place.province}` : town;
}

/** Google Maps directions to the pin itself (Maps URLs: no key, nothing stored). */
export function directionsUrl(place: Place): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${String(place.lat)},${String(place.lon)}`;
}

/** The place's own listing on Google Maps, found by its name and address. */
export function googleMapsUrl(place: Place): string {
  const where = [
    place.name,
    [place.housenumber, place.street].filter(Boolean).join(' '),
    place.city,
    place.province,
  ]
    .filter(Boolean)
    .join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`;
}

export function telUrl(e164: string): string {
  return `tel:${e164}`;
}
