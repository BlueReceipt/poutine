/**
 * Checks the list's Québec addresses against Adresses Québec (CC BY 4.0) and proposes fixes for
 * Alex: the civic address at the pin over one that doesn't exist or over none, the pin's town over
 * a wrong one. Nothing changes in the list until he accepts them into data/fixes.json, each with
 * its source; npm run places lays them over OpenStreetMap's details from then on.
 *
 *   npm run addresses                              proposals: data/review/address-fixes.csv (Excel)
 *   npm run addresses -- --cached                  the same from the last answers (a rule changed)
 *   npm run addresses -- --accept 3 5              those into data/fixes.json, then the list rebuilt
 *   npm run addresses -- --accept spelling fill    every proposal of those kinds (or all)
 *   npm run addresses -- --accept all --except 4 7
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addressPoint,
  ON_STREET_METERS,
  proposalFor,
  type AddressPoint,
  type Fix,
  type Proposal,
  type ProposalKind,
} from '../src/domain/addressFixes.ts';
import { metersBetween, type OsmElement, type Place } from '../src/domain/osmPlaces.ts';

const ROOT = join(import.meta.dirname, '..');
const DATA = join(ROOT, 'data');
const PROPOSALS = join(DATA, 'review', 'address-fixes.json');
const FIXES = join(DATA, 'fixes.json');
// The last answers (gitignored), to try a changed rule without asking again.
const ANSWERS = join(DATA, 'cache', 'address-points.json');

const SERVICES = 'https://servicescarto.mrnf.gouv.qc.ca/pes/rest/services/Territoire';
const ADDRESS_LAYER = `${SERVICES}/AQ_ADRESSES_WMS/MapServer/0/query`;
const REVERSE = `${SERVICES}/Adresse_Geocodage/GeocodeServer/reverseGeocode`;

interface Numbered extends Proposal {
  /** Its number to accept it by; none for a place to look at by hand. */
  number?: number;
}

interface Feature {
  attributes: { AdresseFormatee?: string; NoCivq?: number | null; NoCivqSuf?: string | null };
  geometry?: { x: number; y: number };
}

async function json<T>(url: string): Promise<T> {
  for (const wait of [0, 5_000, 20_000]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const response = await fetch(url);
      if (response.ok) return (await response.json()) as T;
    } catch {
      // Tried again below.
    }
  }
  throw new Error(`Adresses Québec didn't answer: ${url}`);
}

/** Every civic address within ON_STREET_METERS of the place's pin, nearest first. */
async function pointsNear(place: Place): Promise<AddressPoint[]> {
  const params = new URLSearchParams({
    geometry: `${String(place.lon)},${String(place.lat)}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    distance: String(ON_STREET_METERS),
    units: 'esriSRUnit_Meter',
    outFields: 'AdresseFormatee,NoCivq,NoCivqSuf',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  });
  const { features = [] } = await json<{ features?: Feature[] }>(
    `${ADDRESS_LAYER}?${params.toString()}`,
  );
  return features
    .flatMap((feature) => {
      const { geometry, attributes } = feature;
      if (!geometry || !attributes.AdresseFormatee) return [];
      const meters = metersBetween(place, { lat: geometry.y, lon: geometry.x });
      const point = addressPoint(
        attributes.AdresseFormatee,
        attributes.NoCivq ?? null,
        attributes.NoCivqSuf ?? null,
        meters,
      );
      return point ? [point] : [];
    })
    .sort((a, b) => a.meters - b.meters);
}

/** The municipality of the nearest address within 2 km, as npm run places finds towns. */
async function townAt(place: Place): Promise<string> {
  const answer = await json<{ address?: { City?: string }; location?: { x: number; y: number } }>(
    `${REVERSE}?location=${String(place.lon)},${String(place.lat)}&outSR=4326&f=json`,
  );
  const city = answer.address?.City?.trim();
  if (!city || !answer.location) return '';
  const found = { lat: answer.location.y, lon: answer.location.x };
  return metersBetween(place, found) <= 2000 ? city : '';
}

async function fourAtATime<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  const waiting = [...items];
  const worker = async (): Promise<void> => {
    for (let item = waiting.shift(); item !== undefined; item = waiting.shift()) await work(item);
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const KIND_TEXT: Record<ProposalKind, string> = {
  spelling: 'Sure: the street written another way',
  street: 'Sure: the street named otherwise',
  town: 'Sure: the town',
  fill: 'Likely: a missing address',
  number: 'Check: another address at the pin',
  nearest: 'Check: a missing address, several at the pin',
  look: 'Look by hand',
};
const KINDS = Object.keys(KIND_TEXT) as ProposalKind[];

const LOCALITIES = join(DATA, 'cache', 'localities.json');
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/**
 * Every place name OpenStreetMap knows in Québec: cities, towns, villages, hamlets, sectors,
 * neighbourhoods, boroughs. A town of the list among them is a real locality (Saint-Canut in
 * Mirabel, Chicoutimi in Saguenay) and stays; only a name nobody knows gets the municipality.
 * Asked once, then kept (gitignored).
 */
async function knownLocalities(): Promise<string[]> {
  if (existsSync(LOCALITIES)) return JSON.parse(readFileSync(LOCALITIES, 'utf8')) as string[];
  const query = `[out:json][timeout:180];
area["ISO3166-2"="CA-QC"]["admin_level"="4"]->.qc;
(nwr["place"]["name"](area.qc); relation["boundary"="administrative"]["admin_level"~"^(8|9|10)$"]["name"](area.qc););
out tags;`;
  for (const wait of [0, 30_000, 60_000])
    for (const server of OVERPASS) {
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      try {
        const response = await fetch(server, {
          method: 'POST',
          headers: { 'User-Agent': 'Poutine map data (https://github.com/BlueReceipt/poutine)' },
          body: new URLSearchParams({ data: query }),
        });
        if (!response.ok) continue;
        const { elements } = (await response.json()) as { elements: OsmElement[] };
        const names = [...new Set(elements.map((element) => element.tags?.name ?? ''))]
          .filter(Boolean)
          .sort();
        mkdirSync(join(DATA, 'cache'), { recursive: true });
        writeFileSync(LOCALITIES, JSON.stringify(names));
        return names;
      } catch {
        // The next server, or the next round.
      }
    }
  throw new Error('No Overpass server answered for the localities');
}

function proposedText(proposal: Proposal): string {
  const fix = proposal.fix;
  if (!fix) return '';
  const street = [fix.housenumber, fix.street].filter(Boolean).join(' ');
  return [street, fix.city, fix.postcode].filter(Boolean).join(', ');
}

function proposalsCsv(proposals: readonly Numbered[], places: readonly Place[]): string {
  const header = ['#', 'What', 'Name', 'Now', 'Proposed', 'Why', 'Also at the pin', 'Map'];
  const lines = proposals.map((proposal) => {
    const place = places.find((candidate) => candidate.osm === proposal.osm);
    const map = place
      ? `https://www.openstreetmap.org/?mlat=${String(place.lat)}&mlon=${String(place.lon)}#map=19/${String(place.lat)}/${String(place.lon)}`
      : '';
    return [
      proposal.number === undefined ? '' : String(proposal.number),
      KIND_TEXT[proposal.kind],
      proposal.name,
      proposal.now,
      proposedText(proposal),
      proposal.why,
      proposal.alsoNear.join('; '),
      map,
    ]
      .map(csvCell)
      .join(',');
  });
  // The byte-order mark makes Excel read the accents as UTF-8.
  return `${String.fromCharCode(0xfeff)}${[header.join(','), ...lines].join('\r\n')}\r\n`;
}

async function propose(): Promise<void> {
  const { places } = JSON.parse(readFileSync(join(DATA, 'places.json'), 'utf8')) as {
    places: Place[];
  };
  const fixed = existsSync(FIXES)
    ? (JSON.parse(readFileSync(FIXES, 'utf8')) as { fixes: Record<string, Fix> }).fixes
    : {};
  // Visitors' places were checked by the form; places already fixed wait for a fresh look.
  const checked = places.filter(
    (place) => place.province === 'QC' && !place.osm.startsWith('added/') && !fixed[place.osm],
  );
  const cached = process.argv.includes('--cached');
  const answers = cached
    ? (JSON.parse(readFileSync(ANSWERS, 'utf8')) as {
        checked: string;
        at: Record<string, { points: AddressPoint[]; town: string }>;
      })
    : { checked: new Date().toISOString().slice(0, 10), at: {} };
  const source = `Adresses Québec (CC BY 4.0): the civic address at the pin, checked ${answers.checked}`;
  const towns = await knownLocalities();
  const found: Proposal[] = [];
  let done = 0;
  await fourAtATime(checked, async (place) => {
    let answer = answers.at[place.osm];
    if (!answer) {
      const points = await pointsNear(place);
      const nearest = points[0];
      answer = { points, town: nearest ? nearest.city : await townAt(place) };
      answers.at[place.osm] = answer;
    }
    const proposal = proposalFor(place, answer.points, answer.town, source, towns);
    if (proposal) found.push(proposal);
    done += 1;
    if (!cached && done % 100 === 0)
      console.log(`${String(done)} of ${String(checked.length)} checked`);
  });
  mkdirSync(join(DATA, 'cache'), { recursive: true });
  writeFileSync(ANSWERS, JSON.stringify(answers));

  const order: string[] = KINDS;
  found.sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name, 'fr'),
  );
  let next = 1;
  const numbered: Numbered[] = found.map((proposal) =>
    proposal.fix ? { ...proposal, number: next++ } : proposal,
  );
  mkdirSync(join(DATA, 'review'), { recursive: true });
  writeFileSync(
    PROPOSALS,
    `${JSON.stringify({ checked: answers.checked, proposals: numbered }, null, 1)}\n`,
  );
  writeFileSync(join(DATA, 'review', 'address-fixes.csv'), proposalsCsv(numbered, places));
  const count = (kind: ProposalKind) => found.filter((p) => p.kind === kind).length;
  console.log(`${String(checked.length)} Québec places checked:`);
  for (const kind of KINDS) console.log(`  ${KIND_TEXT[kind]}: ${String(count(kind))}`);
  console.log(
    'Proposals in data/review/address-fixes.csv. Accept with npm run addresses -- --accept <numbers or kinds> (or all, --except <numbers>).',
  );
}

function accept(args: readonly string[]): void {
  const { proposals } = JSON.parse(readFileSync(PROPOSALS, 'utf8')) as { proposals: Numbered[] };
  const exceptAt = args.indexOf('--except');
  const chosenArgs = (exceptAt < 0 ? args : args.slice(0, exceptAt)).filter(
    (a) => a !== '--accept',
  );
  const except = new Set(exceptAt < 0 ? [] : args.slice(exceptAt + 1).map(Number));
  const all = chosenArgs.includes('all');
  const kinds = new Set(KINDS.filter((kind) => chosenArgs.includes(kind)));
  const numbers = new Set(
    chosenArgs.filter((a) => a !== 'all' && !kinds.has(a as ProposalKind)).map(Number),
  );
  if (!all && numbers.size === 0 && kinds.size === 0)
    throw new Error(
      'Give the numbers or kinds to accept: npm run addresses -- --accept 3 5 (or spelling, all)',
    );
  const unknown = [...numbers].filter((n) => !proposals.some((p) => p.number === n));
  if (unknown.length > 0) throw new Error(`No proposal numbered ${unknown.join(', ')}`);
  // A place since left out of the list (a group of the wider rules switched off) takes no fix.
  const { places } = JSON.parse(readFileSync(join(DATA, 'places.json'), 'utf8')) as {
    places: Place[];
  };
  const listed = new Set(places.map((place) => place.osm));
  const chosen = proposals.filter(
    (p) =>
      p.number !== undefined &&
      p.fix &&
      (all || numbers.has(p.number) || kinds.has(p.kind)) &&
      !except.has(p.number) &&
      listed.has(p.osm),
  );
  const file = existsSync(FIXES)
    ? (JSON.parse(readFileSync(FIXES, 'utf8')) as { about: string; fixes: Record<string, Fix> })
    : { about: '', fixes: {} };
  for (const proposal of chosen) if (proposal.fix) file.fixes[proposal.osm] = proposal.fix;
  writeFileSync(
    FIXES,
    `${JSON.stringify(
      {
        about:
          'Corrections Alex accepted, laid over OpenStreetMap’s details by npm run places (picks’ own details still win), each with its source and what the list said before: addresses proposed by npm run addresses, places he says closed for good or without poutine ("closed" or "noPoutine": true, left out of the list), and names, details and pins he gives ("renamed", phone, pages, lat and lon).',
        fixes: Object.fromEntries(
          Object.entries(file.fixes).sort(([a], [b]) =>
            a.localeCompare(b, 'en', { numeric: true }),
          ),
        ),
      },
      null,
      1,
    )}\n`,
  );
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'fetch-places.ts'), '--offline'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  console.log(
    `${String(chosen.length)} fixes accepted into data/fixes.json: commit and push to ship them.`,
  );
}

const args = process.argv.slice(2);
if (args.includes('--accept')) accept(args);
else await propose();
