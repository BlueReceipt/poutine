// Where an address is, for Add a place: in Québec from Adresses Québec (Gouvernement du Québec,
// CC BY 4.0), elsewhere in Canada from Natural Resources Canada's Geolocation Service (OGL-Canada).
// Ported from Terrain's relay (relay/worker.js, /geocode), one address per request. It takes a
// street, town, postal code and province, and nothing else.
import type { AddressCandidate, AddressQuery } from '../src/domain/addresses.ts';
import { fromThisSite, json, jsonBody, problem } from './http.ts';

const ADRESSES_QUEBEC =
  'https://servicescarto.mrnf.gouv.qc.ca/pes/rest/services/Territoire/Adresse_Geocodage/GeocodeServer/findAddressCandidates';
const GEOLOCATOR = 'https://www.geolocator.api.geo.ca/geolocation/en/locate';
// Canada's provinces and territories other than Québec, by code or name, English or French.
const ELSEWHERE_IN_CANADA = new Set(
  'on ontario nb newbrunswick nouveaubrunswick ns novascotia nouvelleecosse pe pei princeedwardisland ileduprinceedouard nl newfoundland newfoundlandandlabrador terreneuve terreneuveetlabrador mb manitoba sk saskatchewan ab alberta bc britishcolumbia colombiebritannique yt yukon nt northwestterritories territoiresdunordouest nu nunavut'.split(
    ' ',
  ),
);
const FIELDS = ['street', 'town', 'postalCode', 'province'] as const;
const MAX_FIELD = 200;

/** The address asked for, or null when the request holds anything but the address fields. */
function addressIn(value: unknown): AddressQuery | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).some((key) => !(FIELDS as readonly string[]).includes(key))) return null;
  const read = (key: string): string | null => {
    const text = fields[key] ?? '';
    return typeof text === 'string' && text.length <= MAX_FIELD ? text.trim() : null;
  };
  const street = read('street');
  const town = read('town');
  const postalCode = read('postalCode');
  const province = read('province');
  if (street === null || town === null || postalCode === null || province === null) return null;
  return street && town ? { street, town, postalCode, province } : null;
}

const provinceKey = (province: string): string =>
  province
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/**
 * Natural Resources Canada's answers for an address outside Québec: its streets, and a civic
 * number's spot estimated along the street ("estimated"); places, postal codes and crossings not.
 */
async function federalCandidates(address: AddressQuery): Promise<AddressCandidate[]> {
  const query = new URLSearchParams({
    q: [address.street, address.town, address.province, address.postalCode]
      .filter(Boolean)
      .join(', '),
  });
  const answer = await fetch(`${GEOLOCATOR}?${query.toString()}`);
  if (!answer.ok) throw new Error('unreachable');
  const found = (await answer.json()) as unknown;
  if (!Array.isArray(found)) throw new Error('unreachable');
  return found.flatMap((item: Record<string, unknown>) => {
    const geometry = item.geometry as { coordinates?: unknown } | undefined;
    const [lon, lat] = Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
    if (
      !String(item.type).endsWith('.Street') ||
      typeof lon !== 'number' ||
      typeof lat !== 'number'
    )
      return [];
    // "111 Wellington Street, City Of Ottawa, Ontario"
    const [named = '', place = ''] = String(item.title ?? '')
      .split(',')
      .map((part) => part.trim());
    const civic = /^(\d+)\s+(.+)$/.exec(named);
    const atNumber = item.qualifier === 'INTERPOLATED_POSITION' && civic;
    return [
      {
        lat,
        lon,
        number: atNumber ? (civic[1] ?? '') : '',
        street: civic ? (civic[2] ?? '') : named,
        town: place.replace(
          /^(city|town|township|village|municipality|county|district|region) of\s+/i,
          '',
        ),
        postalCode: '',
        estimated: true,
      },
    ];
  });
}

/** Adresses Québec's answers for one address: buildings at a civic number, and streets. */
async function quebecCandidates(address: AddressQuery): Promise<AddressCandidate[]> {
  const area = [address.province, address.postalCode].filter(Boolean).join(' ');
  const query = new URLSearchParams({
    SingleLine: [address.street, address.town, area].filter(Boolean).join(', '),
    outSR: '4326',
    maxLocations: '5',
    outFields: 'Num,Odonyme,City,ZIP',
    f: 'json',
  });
  const answer = await fetch(`${ADRESSES_QUEBEC}?${query.toString()}`);
  if (!answer.ok) throw new Error('unreachable');
  const found = (await answer.json()) as {
    candidates?: {
      address?: string;
      location?: { x: number; y: number };
      attributes?: Record<string, unknown>;
    }[];
  };
  if (!Array.isArray(found.candidates)) throw new Error('unreachable');
  return found.candidates.flatMap(({ address: label = '', location, attributes = {} }) => {
    if (!location) return [];
    // A street's answer names it only in its label: "Rue Saint-Jean, Québec".
    const [named = '', place = ''] = label.split(',').map((part) => part.trim());
    const text = (value: unknown): string =>
      typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    return [
      {
        lat: location.y,
        lon: location.x,
        number: text(attributes.Num),
        street: text(attributes.Odonyme) || named.replace(/^\d+\s+/, ''),
        town: text(attributes.City) || place.replace(/\s+[A-Z]\d[A-Z]\d[A-Z]\d$/i, ''),
        postalCode: text(attributes.ZIP),
      },
    ];
  });
}

/**
 * Adresses Québec in Québec; Natural Resources Canada elsewhere in Canada, and for an address in
 * Québec (or without a province) that Adresses Québec doesn't know. Unlike Terrain, which keeps
 * Québec to Adresses Québec: the form says QC unless changed, so a sender unsure of the province
 * still finds the street (Natural Resources Canada's answers are only ever "on the street").
 */
async function candidatesFor(address: AddressQuery): Promise<AddressCandidate[]> {
  const province = provinceKey(address.province);
  if (ELSEWHERE_IN_CANADA.has(province)) return federalCandidates(address);
  const inQuebec = await quebecCandidates(address);
  return inQuebec.length === 0 && (province === '' || province === 'qc' || province === 'quebec')
    ? federalCandidates(address)
    : inQuebec;
}

export async function geocode(request: Request): Promise<Response> {
  if (!fromThisSite(request)) return problem(403, 'other-site');
  const address = addressIn(await jsonBody(request, 2048));
  if (!address) return problem(400, 'not-an-address');
  try {
    // A service's passing hiccup is asked again once before the lookup gives up.
    const candidates = await candidatesFor(address).catch(() => candidatesFor(address));
    return json({ candidates });
  } catch {
    return problem(502, 'unreachable');
  }
}
