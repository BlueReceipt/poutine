/**
 * Alex's review of the places visitors send (until the approval page exists, he reviews them with
 * Claude in a session). Reads and writes the `poutine` D1 database through Wrangler, signed in on
 * this PC (`npx wrangler login`, once).
 *
 *   npm run waiting                 the places waiting, with links to check them
 *   npm run approve -- 3 5          adds them to data/added.json and the list; live with the next push
 *   npm run reject -- 4             turns them down (kept in the database as rejected)
 *
 * Add --local to work on the database `npm start` uses on this PC instead of the real one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { possibleDuplicates } from '../src/domain/duplicates.ts';
import type { Place } from '../src/domain/osmPlaces.ts';
import { approvedPlace, type NewPlace, type PlacedBy } from '../src/domain/submission.ts';

const ROOT = join(import.meta.dirname, '..');
const ADDED = join(ROOT, 'data', 'added.json');
const PLACES = join(ROOT, 'data', 'places.json');
// Wrangler's own entry (its package exports don't name it): the project's installed copy.
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

interface Row {
  id: number;
  created_at: string;
  name: string;
  housenumber: string;
  street: string;
  city: string;
  province: string;
  postcode: string;
  lat: number;
  lon: number;
  placed_by: PlacedBy;
  phone: string;
  website: string;
}

const [command = '', ...rest] = process.argv.slice(2);
const where = rest.includes('--local') ? '--local' : '--remote';
const ids = rest.filter((arg) => arg !== '--local').map(Number);

function sql(statement: string): Row[] {
  const output = execFileSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', 'poutine', where, '--json', '--command', statement],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const answer = JSON.parse(output) as { results: Row[] }[];
  return answer.flatMap((part) => part.results);
}

function newPlaceOf(row: Row): NewPlace {
  return {
    name: row.name,
    housenumber: row.housenumber,
    street: row.street,
    city: row.city,
    province: row.province,
    postcode: row.postcode,
    lat: row.lat,
    lon: row.lon,
    placedBy: row.placed_by,
    phone: row.phone,
    website: row.website,
  };
}

const COLUMNS =
  'id, created_at, name, housenumber, street, city, province, postcode, lat, lon, placed_by, phone, website';

function waiting(): void {
  const rows = sql(
    `SELECT ${COLUMNS} FROM submissions WHERE status = 'pending' ORDER BY created_at`,
  );
  if (rows.length === 0) {
    console.log('Nothing waiting.');
    return;
  }
  const { places } = JSON.parse(readFileSync(PLACES, 'utf8')) as { places: Place[] };
  for (const row of rows) {
    const address = [
      [row.housenumber, row.street].filter(Boolean).join(' '),
      row.city,
      row.province,
    ]
      .filter(Boolean)
      .join(', ');
    const twins = possibleDuplicates(places, row);
    console.log(
      [
        `#${String(row.id)}  ${row.name}  (sent ${row.created_at.slice(0, 16).replace('T', ' ')} UTC)`,
        `    ${address}${row.postcode ? `  ${row.postcode}` : ''}  · pin: ${row.placed_by}`,
        row.phone ? `    phone ${row.phone}` : '',
        row.website ? `    ${row.website}` : '',
        `    map: https://www.openstreetmap.org/?mlat=${String(row.lat)}&mlon=${String(row.lon)}#map=18/${String(row.lat)}/${String(row.lon)}`,
        twins.length > 0 ? `    maybe already listed: ${twins.map((p) => p.name).join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

function review(status: 'approved' | 'rejected'): void {
  if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0))
    throw new Error(
      `Give the numbers to ${status === 'approved' ? 'approve' : 'reject'}: npm run ... -- 3 5`,
    );
  const list = ids.join(', ');
  const rows = sql(
    `SELECT ${COLUMNS} FROM submissions WHERE id IN (${list}) AND status = 'pending'`,
  );
  const found = new Set(rows.map((row) => row.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0)
    console.warn(`Not waiting (already reviewed, or no such number): ${missing.join(', ')}`);
  if (rows.length === 0) return;

  if (status === 'approved') {
    const saved = existsSync(ADDED)
      ? (JSON.parse(readFileSync(ADDED, 'utf8')) as { places: Place[] })
      : { places: [] };
    const approved = rows.map((row) => approvedPlace(row.id, newPlaceOf(row)));
    const kept = saved.places.filter((place) => !approved.some((a) => a.osm === place.osm));
    writeFileSync(
      ADDED,
      `${JSON.stringify(
        {
          about:
            'Places visitors added and Alex approved (npm run approve), joined to places.json by npm run places. Open data under the ODbL like the rest of the list.',
          places: [...kept, ...approved],
        },
        null,
        1,
      )}\n`,
    );
    // The list the app ships: the picks and the added places applied, no server asked.
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'fetch-places.ts'), '--offline'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  }
  sql(
    `UPDATE submissions SET status = '${status}', reviewed_at = '${new Date().toISOString()}' WHERE id IN (${rows.map((row) => String(row.id)).join(', ')}) AND status = 'pending'`,
  );
  for (const row of rows)
    console.log(
      `${status === 'approved' ? 'Approved' : 'Rejected'} #${String(row.id)} ${row.name}`,
    );
  if (status === 'approved') console.log('They show on the map after the next push.');
}

if (command === 'waiting') waiting();
else if (command === 'approve') review('approved');
else if (command === 'reject') review('rejected');
else throw new Error('npm run waiting | approve -- <numbers> | reject -- <numbers>');
