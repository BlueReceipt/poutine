/**
 * Leads from the Registraire des entreprises du Québec's open data (CC BY-NC-SA 4.0; Alex,
 * 2026-10-20: "i like option 1"): restaurants named or described like a casse-croûte, each placed
 * with Adresses Québec, the ones the map already has marked. Writes data/review/register-leads.csv
 * for Alex to look over: leads only, never in the list (src/domain/registerLeads.ts says why).
 *
 * The register's files stay out of the project and OneDrive: download the ZIP from Données Québec
 * ("Registre des entreprises") in a browser, since its site turns scripts away, unpack
 * Etablissements.csv, Nom.csv and Entreprise.csv in a folder of their own and name that folder:
 *
 *   npm run register -- C:\Users\alexa\AppData\Local\poutine-register
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { placementFor, splitStreet, type AddressCandidate } from '../src/domain/addresses.ts';
import { possibleDuplicates } from '../src/domain/duplicates.ts';
import type { Place } from '../src/domain/osmPlaces.ts';
import {
  isRestaurant,
  leadName,
  leadTier,
  registerAddress,
  type Establishment,
  type LeadTier,
} from '../src/domain/registerLeads.ts';
import { fold } from '../src/domain/text.ts';
import { geocode } from '../worker/geocode.ts';

const ROOT = join(import.meta.dirname, '..');
const DATA = join(ROOT, 'data');
const PLACED = join(DATA, 'cache', 'register-places.json');

/** A name at this many establishments is a chain the chain rules don't know. */
const CHAIN_SPOTS = 5;

/** The rows of a CSV file, read as a stream: quoted fields may hold commas, quotes and new lines. */
async function* rowsOf(file: string): AsyncGenerator<string[]> {
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;
  let first = true;
  for await (const chunk of createReadStream(file, { encoding: 'utf8' })) {
    let text = chunk as string;
    if (first) {
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      first = false;
    }
    for (const char of text) {
      if (quoted) {
        if (char === '"') {
          quoted = false;
          afterQuote = true;
        } else field += char;
      } else if (char === '"') {
        if (afterQuote) field += '"';
        quoted = true;
        afterQuote = false;
      } else if (char === ',') {
        row.push(field);
        field = '';
        afterQuote = false;
      } else if (char === '\n') {
        row.push(field.replace(/\r$/, ''));
        yield row;
        row = [];
        field = '';
        afterQuote = false;
      } else {
        field += char;
        afterQuote = false;
      }
    }
  }
  if (field || row.length > 0) yield [...row, field];
}

/** Each row as an object by the header's names. */
async function* recordsOf(file: string): AsyncGenerator<Record<string, string>> {
  let header: string[] | null = null;
  for await (const row of rowsOf(file)) {
    if (!header) header = row;
    else yield Object.fromEntries(header.map((name, i) => [name, row[i] ?? '']));
  }
}

interface Placed {
  lat: number;
  lon: number;
  precision: 'address' | 'street';
}

interface Lead {
  tier: LeadTier;
  name: string;
  neq: string;
  street: string;
  town: string;
  postalCode: string;
  activity: string;
  placed: Placed | null;
  onMap: string;
}

/** Where Adresses Québec (else Natural Resources Canada) puts an address, as Add a place does. */
async function place(street: string, town: string, postalCode: string): Promise<Placed | null> {
  const query = { street, town, postalCode, province: 'QC' };
  const response = await geocode(
    new Request('https://poutines.app/api/geocode', {
      method: 'POST',
      headers: { Origin: 'https://poutines.app', 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    }),
  );
  if (!response.ok) return null;
  const { candidates } = (await response.json()) as { candidates: AddressCandidate[] };
  const placement = placementFor(query, candidates);
  return placement
    ? { lat: placement.lat, lon: placement.lon, precision: placement.precision }
    : null;
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

async function main(): Promise<void> {
  const folder = process.argv[2];
  if (!folder || !existsSync(join(folder, 'Etablissements.csv')))
    throw new Error(
      'Name the folder holding the register’s Etablissements.csv, Nom.csv and Entreprise.csv: npm run register -- <folder>',
    );

  // The restaurants among the establishments, then their companies' names and standing.
  const restaurants: Establishment[] = [];
  for await (const r of recordsOf(join(folder, 'Etablissements.csv'))) {
    const establishment: Establishment = {
      neq: r.NEQ ?? '',
      name: r.NOM_ETAB ?? '',
      lines: [r.LIGN1_ADR ?? '', r.LIGN2_ADR ?? '', r.LIGN3_ADR ?? '', r.LIGN4_ADR ?? ''],
      activities: [
        { code: r.COD_ACT_ECON ?? '', text: r.DESC_ACT_ECON_ETAB ?? '' },
        { code: r.COD_ACT_ECON2 ?? '', text: r.DESC_ACT_ECON_ETAB2 ?? '' },
      ],
    };
    if (isRestaurant(establishment)) restaurants.push(establishment);
  }
  const neqs = new Set(restaurants.map((establishment) => establishment.neq));
  const names = new Map<string, string[]>();
  for await (const r of recordsOf(join(folder, 'Nom.csv'))) {
    // Names in force, other than the legal one: what the place is known by.
    if (!neqs.has(r.NEQ ?? '') || r.STAT_NOM !== 'V' || r.TYP_NOM_ASSUJ === 'M') continue;
    const list = names.get(r.NEQ ?? '') ?? [];
    list.push(r.NOM_ASSUJ ?? '');
    names.set(r.NEQ ?? '', list);
  }
  const registered = new Set<string>();
  for await (const r of recordsOf(join(folder, 'Entreprise.csv')))
    if (neqs.has(r.NEQ ?? '') && r.COD_STAT_IMMAT === 'IM') registered.add(r.NEQ ?? '');

  const leads: Lead[] = [];
  for (const establishment of restaurants) {
    if (!registered.has(establishment.neq)) continue;
    const name = leadName(establishment, names.get(establishment.neq) ?? []);
    const tier = leadTier(establishment, name);
    if (!tier) continue;
    const address = registerAddress(establishment.lines);
    if (!address.street || !address.town) continue;
    leads.push({
      tier,
      name,
      neq: establishment.neq,
      ...address,
      activity: establishment.activities
        .map((activity) => activity.text)
        .filter((text) => text && text !== '-')
        .join('; '),
      placed: null,
      onMap: '',
    });
  }
  // A name at five establishments or more is a chain.
  const spots = new Map<string, number>();
  for (const lead of leads) spots.set(fold(lead.name), (spots.get(fold(lead.name)) ?? 0) + 1);
  const kept = leads.filter((lead) => (spots.get(fold(lead.name)) ?? 0) < CHAIN_SPOTS);

  const cache: Record<string, Placed | null> = existsSync(PLACED)
    ? (JSON.parse(readFileSync(PLACED, 'utf8')) as Record<string, Placed | null>)
    : {};
  let done = 0;
  await fourAtATime(kept, async (lead) => {
    const key = `${lead.street}|${lead.town}|${lead.postalCode}`;
    if (!(key in cache))
      cache[key] = await place(lead.street, lead.town, lead.postalCode).catch(() => null);
    lead.placed = cache[key] ?? null;
    done += 1;
    if (done % 100 === 0) console.log(`${String(done)} of ${String(kept.length)} placed`);
  });
  mkdirSync(join(DATA, 'cache'), { recursive: true });
  writeFileSync(PLACED, JSON.stringify(cache));

  const { places } = JSON.parse(readFileSync(join(DATA, 'places.json'), 'utf8')) as {
    places: Place[];
  };
  for (const lead of kept) {
    if (!lead.placed) continue;
    const { housenumber, street } = splitStreet(lead.street);
    const twins = possibleDuplicates(places, {
      name: lead.name,
      housenumber,
      street,
      city: lead.town,
      lat: lead.placed.lat,
      lon: lead.placed.lon,
    });
    lead.onMap = twins.map((twin) => `${twin.name} (poutines.app/${twin.link ?? ''})`).join('; ');
  }

  const order: Record<LeadTier, number> = { named: 0, described: 1 };
  kept.sort(
    (a, b) =>
      Number(Boolean(a.onMap)) - Number(Boolean(b.onMap)) ||
      order[a.tier] - order[b.tier] ||
      a.town.localeCompare(b.town, 'fr') ||
      a.name.localeCompare(b.name, 'fr'),
  );
  const header = [
    'Kind',
    'Name',
    'Address',
    'Town',
    'Postal code',
    'Placed',
    'Activity in the register',
    'Map',
    'Already on the map',
    'NEQ',
  ];
  const lines = kept.map((lead) =>
    [
      lead.tier === 'named' ? 'Named like a casse-croûte' : 'Described as one',
      lead.name,
      lead.street,
      lead.town,
      lead.postalCode,
      lead.placed
        ? lead.placed.precision === 'address'
          ? 'at the address'
          : 'on the street'
        : 'not found',
      lead.activity,
      lead.placed
        ? `https://www.openstreetmap.org/?mlat=${String(lead.placed.lat)}&mlon=${String(lead.placed.lon)}#map=18/${String(lead.placed.lat)}/${String(lead.placed.lon)}`
        : '',
      lead.onMap,
      lead.neq,
    ]
      .map(csvCell)
      .join(','),
  );
  const credit =
    'Source: Registraire des entreprises du Québec, open data (Données Québec), CC BY-NC-SA 4.0. Leads only: not for the list.';
  mkdirSync(join(DATA, 'review'), { recursive: true });
  // The byte-order mark makes Excel read the accents as UTF-8.
  writeFileSync(
    join(DATA, 'review', 'register-leads.csv'),
    `${String.fromCharCode(0xfeff)}${[header.join(','), ...lines, '', csvCell(credit)].join('\r\n')}\r\n`,
  );
  const count = (test: (lead: Lead) => boolean): string => String(kept.filter(test).length);
  console.log(
    `${String(restaurants.length)} restaurants read; ${String(kept.length)} leads (${count((l) => l.tier === 'named')} named like a casse-croûte, ${count((l) => l.tier === 'described')} described as one; ${String(leads.length - kept.length)} at chains of ${String(CHAIN_SPOTS)}+ left out)`,
  );
  console.log(
    `placed: ${count((l) => l.placed?.precision === 'address')} at the address, ${count((l) => l.placed?.precision === 'street')} on the street, ${count((l) => !l.placed)} not found; already on the map: ${count((l) => Boolean(l.onMap))}; new: ${count((l) => !l.onMap)}`,
  );
  console.log('Leads in data/review/register-leads.csv.');
}

await main();
