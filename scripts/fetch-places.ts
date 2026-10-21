/**
 * Gathers Québec's casse-croûtes, cantines and potato shacks from OpenStreetMap (Overpass API):
 * every independent place whose cuisine says poutine or whose name says what it is, plus Alex's
 * picks wherever they are (data/picked.json). Writes data/places.json, and data/review/places.csv
 * to look over in Excel. Data © OpenStreetMap contributors, ODbL 1.0.
 *
 * Run: npm run places
 * Rebuild from the last answer without asking OpenStreetMap again (after changing a pick or a
 * rule): npm run places -- --cached
 * Apply the picks' details and the fixes (data/fixes.json, npm run addresses) to the list as it is,
 * with no server at all: npm run places -- --offline
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyFixes, staleFixes, type Fix } from '../src/domain/addressFixes.ts';
import { localitiesNear, localityFor, type LocalityPoint } from '../src/domain/localities.ts';
import {
  applyPicks,
  withAdded,
  metersBetween,
  normalizePostcode,
  provinceCode,
  selectPlaces,
  whyListed,
  type ListedFor,
  type OsmElement,
  type Pick,
  type Place,
  type Town,
} from '../src/domain/osmPlaces.ts';
import { assignLinks } from '../src/domain/shortLinks.ts';

const DATA = join(import.meta.dirname, '..', 'data');
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT = 'Poutine map data (https://github.com/BlueReceipt/poutine)';

/**
 * Four sets, each ended by `out count` (a "count" element in the answer): Québec's eateries,
 * Alex's picks by ID (some are elsewhere), Québec's towns, Québec's sectors (place=suburb:
 * Saint-Canut in Mirabel, Chicoutimi in Saguenay).
 */
function query(picks: readonly Pick[]): string {
  const ids = (type: string): string =>
    picks
      .filter((pick) => pick.osm.startsWith(`${type}/`))
      .map((pick) => pick.osm.slice(type.length + 1))
      .join(',');
  const byId = ['node', 'way', 'relation']
    .filter((type) => ids(type))
    .map((type) => `${type}(id:${ids(type)});`)
    .join('');
  return `[out:json][timeout:240];
area["ISO3166-2"="CA-QC"]["admin_level"="4"]->.qc;
nwr["amenity"~"^(fast_food|restaurant|food_court|cafe|ice_cream)$"]["name"](area.qc);
out center tags;
out count;
${byId ? `(${byId});\nout center tags;` : ''}
out count;
node["place"~"^(city|town|village)$"]["name"](area.qc);
out;
out count;
node["place"="suburb"]["name"](area.qc);
out;`;
}

type Answer = { elements: OsmElement[][]; base: string };

async function overpass(text: string): Promise<Answer> {
  // The public servers time out when busy: three rounds, a pause between them.
  for (const round of [1, 2, 3])
    for (const server of SERVERS) {
      if (round > 1 && server === SERVERS[0])
        await new Promise((resolve) => setTimeout(resolve, 30_000));
      const answer = await ask(server, text);
      if (answer) return answer;
    }
  throw new Error('No Overpass server answered');
}

async function ask(server: string, text: string): Promise<Answer | null> {
  try {
    const response = await fetch(server, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT },
      body: new URLSearchParams({ data: text }),
    });
    if (!response.ok) {
      console.warn(`${server} answered ${String(response.status)}`);
      return null;
    }
    const answer = (await response.json()) as {
      elements: (OsmElement | { type: 'count' })[];
      osm3s?: { timestamp_osm_base?: string };
    };
    const sets: OsmElement[][] = [[]];
    for (const element of answer.elements) {
      if (element.type === 'count') sets.push([]);
      else sets[sets.length - 1]?.push(element);
    }
    return { elements: sets, base: answer.osm3s?.timestamp_osm_base ?? '' };
  } catch (error) {
    console.warn(`${server} failed: ${String(error)}`);
    return null;
  }
}

const idOf = (element: OsmElement): string => `${element.type}/${String(element.id)}`;

const ADRESSES_QUEBEC =
  'https://servicescarto.mrnf.gouv.qc.ca/pes/rest/services/Territoire/Adresse_Geocodage/GeocodeServer/reverseGeocode';

/** The municipality of the nearest address Adresses Québec knows within 2 km, or null. */
async function municipalityAt(place: { lat: number; lon: number }): Promise<string | null> {
  const url = `${ADRESSES_QUEBEC}?location=${String(place.lon)},${String(place.lat)}&outSR=4326&f=json`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const answer = (await response.json()) as {
      address?: { City?: string };
      location?: { x: number; y: number };
    };
    const city = answer.address?.City?.trim();
    if (!city || !answer.location) return null;
    const found = { lat: answer.location.y, lon: answer.location.x };
    return metersBetween(place, found) <= 2000 ? city : null;
  } catch {
    return null;
  }
}

// The municipality at each point already asked (gitignored): a rebuild asks only for new points.
const MUNICIPALITIES = join(DATA, 'cache', 'municipalities.json');

const pointKey = (point: { lat: number; lon: number }): string =>
  `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;

/** The municipality at each point, from the kept answers or Adresses Québec. */
async function municipalitiesAt(
  points: readonly { lat: number; lon: number }[],
): Promise<Map<string, string>> {
  const kept = existsSync(MUNICIPALITIES)
    ? (JSON.parse(readFileSync(MUNICIPALITIES, 'utf8')) as Record<string, string>)
    : {};
  const missing = [...new Set(points.map(pointKey))].filter((key) => !(key in kept));
  await fourAtATime(missing, async (key) => {
    const [lat = 0, lon = 0] = key.split(',').map(Number);
    const city = await municipalityAt({ lat, lon });
    if (city !== null) kept[key] = city;
  });
  mkdirSync(join(DATA, 'cache'), { recursive: true });
  writeFileSync(MUNICIPALITIES, JSON.stringify(kept));
  return new Map(Object.entries(kept));
}

/**
 * The village or sector of each Québec place whose town is a merged municipality
 * (src/domain/localities.ts): the municipality at its pin and at each village near it, asked of
 * Adresses Québec. Returns how many places got one.
 */
async function nameLocalities(places: Place[], nodes: readonly OsmElement[]): Promise<number> {
  const points: LocalityPoint[] = nodes.flatMap((node) =>
    node.lat !== undefined && node.lon !== undefined && node.tags?.name
      ? [
          {
            name: node.tags.name,
            kind: node.tags.place ?? '',
            lat: node.lat,
            lon: node.lon,
            municipality: '',
          },
        ]
      : [],
  );
  const asked = places.filter(
    (place) =>
      place.province === 'QC' &&
      place.city &&
      place.citySource !== 'nearest-town' &&
      localitiesNear(place, points).length > 0,
  );
  const villages = [...new Set(asked.flatMap((place) => localitiesNear(place, points)))];
  const at = await municipalitiesAt([...asked, ...villages]);
  for (const village of villages) village.municipality = at.get(pointKey(village)) ?? '';
  let named = 0;
  for (const place of asked) {
    const locality = localityFor(place, at.get(pointKey(place)) ?? '', points);
    if (locality) {
      place.locality = locality;
      named += 1;
    }
  }
  return named;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';

/** The village or town and the province OpenStreetMap's reverse lookup gives, or null. */
async function townAt(place: Place): Promise<{ city: string; province: string } | null> {
  const url = `${NOMINATIM}?lat=${String(place.lat)}&lon=${String(place.lon)}&format=jsonv2&zoom=18&addressdetails=1`;
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) return null;
    const { address = {} } = (await response.json()) as { address?: Record<string, string> };
    const city =
      address.village ??
      address.town ??
      address.city ??
      address.municipality ??
      address.hamlet ??
      '';
    return { city, province: provinceCode(address['ISO3166-2-lvl4'] ?? address.state ?? '') };
  } catch {
    return null;
  }
}

/**
 * Places with no town of their own: in Québec, the municipality Adresses Québec gives; elsewhere,
 * OpenStreetMap's reverse lookup, one request a second as its usage policy asks.
 */
async function lookUpTowns(places: Place[]): Promise<{ quebec: number; elsewhere: number }> {
  let quebec = 0;
  await fourAtATime(
    places.filter((p) => p.citySource === 'nearest-town'),
    async (place) => {
      const city = await municipalityAt(place);
      if (city) {
        place.city = city;
        place.citySource = 'adresses-quebec';
        quebec += 1;
      }
    },
  );
  let elsewhere = 0;
  for (const place of places.filter(
    (p) => p.province !== 'QC' && (p.citySource === 'none' || !p.province),
  )) {
    const found = await townAt(place);
    if (found) {
      if (place.citySource === 'none' && found.city) {
        place.city = found.city;
        place.citySource = 'nominatim';
        elsewhere += 1;
      }
      if (!place.province) place.province = found.province;
    }
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  return { quebec, elsewhere };
}

const FIND_ADDRESS =
  'https://servicescarto.mrnf.gouv.qc.ca/pes/rest/services/Territoire/Adresse_Geocodage/GeocodeServer/findAddressCandidates';

interface Candidate {
  location: { x: number; y: number };
  attributes: { Loc_name?: string; Num?: number | string; ZIP?: string };
}

/** Checks a street address against Adresses Québec; a confirmed one fills a missing postal code. */
async function checkAddress(place: Place): Promise<void> {
  const params = new URLSearchParams({
    SingleLine: `${place.housenumber} ${place.street}, ${place.city}`,
    outSR: '4326',
    maxLocations: '5',
    outFields: 'Loc_name,Num,ZIP',
    f: 'json',
  });
  try {
    const response = await fetch(`${FIND_ADDRESS}?${params.toString()}`);
    if (!response.ok) return;
    const { candidates = [] } = (await response.json()) as { candidates?: Candidate[] };
    const number = /^\d+/.exec(place.housenumber)?.[0];
    const civic = candidates.filter(
      (c) => c.attributes.Loc_name === 'RQA_Adresse' && String(c.attributes.Num) === number,
    );
    if (civic.length === 0) {
      place.addressCheck = 'not-found';
      return;
    }
    const nearest = civic
      .map((c) => ({ c, meters: metersBetween(place, { lat: c.location.y, lon: c.location.x }) }))
      .sort((a, b) => a.meters - b.meters)[0];
    if (!nearest || nearest.meters > 150) {
      place.addressCheck = 'far';
      return;
    }
    place.addressCheck = 'confirmed';
    if (!place.postcode && nearest.c.attributes.ZIP)
      place.postcode = normalizePostcode(nearest.c.attributes.ZIP);
  } catch {
    // Left unchecked: the next run tries again.
  }
}

/** Runs a lookup over the places four at a time, gently. */
async function fourAtATime<T>(items: T[], lookUp: (item: T) => Promise<void>): Promise<void> {
  const waiting = [...items];
  const work = async (): Promise<void> => {
    for (let item = waiting.shift(); item !== undefined; item = waiting.shift()) await lookUp(item);
  };
  await Promise.all([work(), work(), work(), work()]);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function townText(place: Place): string {
  const town =
    place.citySource === 'nearest-town' && place.city ? `near ${place.city}` : place.city;
  if (place.locality) return `${place.locality} (${town})`;
  return place.province && place.province !== 'QC' ? `${town}, ${place.province}` : town;
}

const WHY_TEXT: Record<ListedFor, string> = {
  cuisine: 'cuisine poutine',
  name: 'name',
  'dairy-bar': 'dairy bar',
  'snack-cuisine': 'snack bar: fries, hot dogs or Québec food',
  'burger-or-chicken': 'wider: burger or chicken counter',
  'snack-bar': 'wider: snack bar, no cuisine given',
  'family-restaurant': 'wider: family restaurant',
  'quebec-restaurant': 'wider: Québec-food restaurant',
};

/** The review spreadsheet; why each place is listed when the OpenStreetMap answer is at hand. */
function reviewCsv(places: readonly Place[], why = new Map<string, ListedFor | null>()): string {
  const header = [
    'Name',
    'Address',
    'Town',
    'Postal code',
    'Address check',
    'Phone',
    'Website',
    'Facebook',
    'Hours',
    'Poutine',
    'Why',
    'Alex pick',
    'OpenStreetMap',
  ];
  const lines = places.map((p) =>
    [
      p.name,
      [p.housenumber, p.street].filter(Boolean).join(' '),
      townText(p),
      p.postcode,
      p.addressCheck === 'unchecked' ? '' : p.addressCheck,
      p.phone,
      p.website,
      p.facebook,
      p.openingHours,
      p.poutine,
      ((reason) => (reason ? WHY_TEXT[reason] : ''))(why.get(p.osm)),
      p.picked ? 'yes' : '',
      `https://www.openstreetmap.org/${p.osm}`,
    ]
      .map(csvCell)
      .join(','),
  );
  // The byte-order mark makes Excel read the accents as UTF-8.
  return `\uFEFF${[header.join(','), ...lines].join('\r\n')}\r\n`;
}

/**
 * Every place's short link (data/links.json, never changed once given), set on each place. The
 * file keeps the links of places since dropped, so no link ever moves to another place.
 */
function withLinks(places: Place[]): Place[] {
  const file = join(DATA, 'links.json');
  const given = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as { links: Record<string, string> }).links
    : {};
  const links = assignLinks(places, given);
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        about:
          'Each place’s short link, poutines.app/<link>: given once by npm run places (src/domain/shortLinks.ts), never changed or given to another place.',
        links,
      },
      null,
      1,
    )}
`,
  );
  return places.map((place) => ({ ...place, link: links[place.osm] }));
}

async function main(): Promise<void> {
  const { places: picks } = JSON.parse(readFileSync(join(DATA, 'picked.json'), 'utf8')) as {
    places: Pick[];
  };

  // The places visitors added and Alex approved (npm run approve), joined to the list either way.
  const addedFile = join(DATA, 'added.json');
  const added = existsSync(addedFile)
    ? (JSON.parse(readFileSync(addedFile, 'utf8')) as { places: Place[] }).places
    : [];

  // Corrections Alex accepted (npm run addresses), each with its source; picks' details win.
  const fixesFile = join(DATA, 'fixes.json');
  const fixes = existsSync(fixesFile)
    ? (JSON.parse(readFileSync(fixesFile, 'utf8')) as { fixes: Record<string, Fix> }).fixes
    : {};

  // --offline: no server at all, only the fixes, the picks' details and confirmations and the
  // added places applied to the list.
  if (process.argv.includes('--offline')) {
    const saved = JSON.parse(readFileSync(join(DATA, 'places.json'), 'utf8')) as {
      places: Place[];
    };
    const places = withLinks(withAdded(applyPicks(applyFixes(saved.places, fixes), picks), added));
    writeFileSync(join(DATA, 'places.json'), `${JSON.stringify({ ...saved, places }, null, 1)}\n`);
    mkdirSync(join(DATA, 'review'), { recursive: true });
    writeFileSync(join(DATA, 'review', 'places.csv'), reviewCsv(places));
    console.log(
      `${String(places.length)} places: picks applied offline, ${String(added.length)} added by visitors`,
    );
    return;
  }

  // The last answer is kept (gitignored): the public servers limit how often one may ask.
  const cache = join(DATA, 'cache', 'overpass.json');
  let answer: Answer;
  if (process.argv.includes('--cached')) {
    answer = JSON.parse(readFileSync(cache, 'utf8')) as Answer;
  } else {
    answer = await overpass(query(picks));
    mkdirSync(join(DATA, 'cache'), { recursive: true });
    writeFileSync(cache, JSON.stringify(answer));
  }
  const { elements, base } = answer;
  const missingFromAnswer = picks.filter(
    (pick) => !elements.flat().some((element) => idOf(element) === pick.osm),
  );
  if (missingFromAnswer.length > 0 && process.argv.includes('--cached'))
    console.warn(
      `picks added since the last answer (run without --cached to fetch them): ${missingFromAnswer.map((p) => p.name).join(', ')}`,
    );
  const [inQuebec = [], picked = [], townNodes = [], sectorNodes] = elements;
  const quebecIds = new Set(inQuebec.map(idOf));
  const outsideQuebec = new Set(picked.map(idOf).filter((id) => !quebecIds.has(id)));
  const towns: Town[] = townNodes
    .filter((e) => e.lat !== undefined && e.lon !== undefined)
    .map((e) => ({ name: e.tags?.name ?? '', lat: e.lat ?? 0, lon: e.lon ?? 0 }));
  const eateries = [...inQuebec, ...picked.filter((e) => outsideQuebec.has(idOf(e)))];
  // IDs already given a link keep it when two entries for one place merge.
  const linksFile = join(DATA, 'links.json');
  const known = new Set(
    existsSync(linksFile)
      ? Object.keys((JSON.parse(readFileSync(linksFile, 'utf8')) as { links: object }).links)
      : [],
  );
  const { places: found, dropped } = selectPlaces(eateries, towns, picks, outsideQuebec, known);
  const townsFound = await lookUpTowns(found);
  for (const stale of staleFixes(found, fixes))
    console.warn(
      stale.now === null
        ? `fix for ${stale.name} (${stale.osm}): the place has left the list`
        : `fix for ${stale.name} (${stale.osm}) was made over "${stale.was}", OpenStreetMap now says "${stale.now}": still needed?`,
    );
  const fixed = applyPicks(applyFixes(found, fixes), picks);
  await fourAtATime(
    fixed.filter((p) => p.province === 'QC' && p.housenumber && p.street),
    checkAddress,
  );
  if (!sectorNodes)
    console.warn(
      'the last answer has no sectors: run without --cached to name villages and sectors',
    );
  const localities = await nameLocalities(fixed, [...townNodes, ...(sectorNodes ?? [])]);
  const places = withLinks(withAdded(fixed, added));

  const missingPicks = picks.filter((pick) => !places.some((p) => p.osm === pick.osm));
  writeFileSync(
    join(DATA, 'places.json'),
    `${JSON.stringify(
      {
        source:
          'OpenStreetMap: independent casse-croûtes, cantines and potato shacks in Québec, by cuisine=poutine or by name, plus Alex’s picks anywhere',
        attribution:
          '© OpenStreetMap contributors, ODbL 1.0; towns where OpenStreetMap has none, and address corrections (data/fixes.json): Adresses Québec, CC BY 4.0',
        osmBase: base,
        places,
      },
      null,
      1,
    )}\n`,
  );
  mkdirSync(join(DATA, 'review'), { recursive: true });
  const why = new Map(eateries.map((e) => [idOf(e), whyListed(e.tags ?? {})]));
  writeFileSync(join(DATA, 'review', 'places.csv'), reviewCsv(places, why));

  const count = (test: (p: Place) => boolean): string => String(places.filter(test).length);
  console.log(
    `OpenStreetMap as of ${base}: ${String(inQuebec.length)} eateries in Québec, ${String(towns.length)} towns; ${String(outsideQuebec.size)} picks elsewhere`,
  );
  console.log(
    `${String(places.length)} places: ${count((p) => p.poutine === 'confirmed')} confirmed by Alex, ${count((p) => p.poutine === 'cuisine')} tagged poutine, ${count((p) => p.poutine === 'name')} by name, ${count((p) => p.poutine === 'unconfirmed')} unconfirmed; ${count((p) => p.picked)} of Alex's ${String(picks.length)} picks; ${count((p) => p.province !== 'QC')} outside Québec`,
  );
  const listed = (group: ListedFor): string => count((p) => why.get(p.osm) === group);
  console.log(
    `wider rules: ${listed('burger-or-chicken')} burger or chicken counters, ${listed('snack-bar')} snack bars with no cuisine, ${listed('family-restaurant')} family restaurants, ${listed('quebec-restaurant')} Québec-food restaurants`,
  );
  console.log(
    `details: phone ${count((p) => Boolean(p.phone))}, hours ${count((p) => Boolean(p.openingHours))}, website ${count((p) => Boolean(p.website))}, Facebook ${count((p) => Boolean(p.facebook))}, menu ${count((p) => Boolean(p.menu))}, street address ${count((p) => Boolean(p.housenumber && p.street))}`,
  );
  console.log(
    `towns: ${String(localities)} with their village or sector, ${count((p) => p.citySource === 'osm')} from OpenStreetMap, ${String(townsFound.quebec)} from Adresses Québec, ${String(townsFound.elsewhere)} from OpenStreetMap's reverse lookup, ${count((p) => p.citySource === 'nearest-town')} nearest town, ${count((p) => p.citySource === 'none')} none`,
  );
  console.log(
    `addresses: ${count((p) => p.addressCheck === 'confirmed')} confirmed at the pin, ${count((p) => p.addressCheck === 'far')} far from the pin, ${count((p) => p.addressCheck === 'not-found')} not found; postal code ${count((p) => Boolean(p.postcode))}`,
  );
  console.log('left out:', dropped);
  if (missingPicks.length > 0)
    console.warn(
      `picks not in OpenStreetMap: ${missingPicks.map((p) => `${p.name} (${p.osm})`).join(', ')}`,
    );
}

await main();
