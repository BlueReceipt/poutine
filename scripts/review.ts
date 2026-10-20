/**
 * Alex's review of the places visitors send (until the approval page exists, he reviews them with
 * Claude in a session). Reads and writes the `poutine` D1 database through Wrangler, signed in on
 * this PC (`npx wrangler login`, once).
 *
 *   npm run waiting                 the places waiting, with links to check them
 *   npm run approve -- 3 5          adds them to data/added.json and the list; live with the next push
 *   npm run reject -- 4             turns them down (kept in the database as rejected)
 *   npm run ratings                 the latest ratings (and written reviews, once switched on)
 *   npm run hide -- 12              hides ratings: they stop counting at once, no push needed
 *   npm run counts                  the last 30 days' counts: Share taps, link opens, ratings
 *   npm run confirmed               places raters confirmed serve poutine (3 yeses, more than noes)
 *
 * Add --local to work on the database `npm start` uses on this PC instead of the real one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COUNT_KINDS, type CountKind } from '../src/domain/counts.ts';
import { possibleDuplicates } from '../src/domain/duplicates.ts';
import { CONFIRM_AT } from '../src/domain/ratings.ts';
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

function sql<T = Row>(statement: string): T[] {
  const output = execFileSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', 'poutine', where, '--json', '--command', statement],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const answer = JSON.parse(output) as { results: T[] }[];
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

interface RatingRow {
  id: number;
  place: string;
  stars: number;
  comment: string;
  updated_at: string;
  hidden: number;
}

function ratings(): void {
  const rows = sql<RatingRow>(
    'SELECT id, place, stars, comment, updated_at, hidden FROM ratings ORDER BY updated_at DESC LIMIT 50',
  );
  if (rows.length === 0) {
    console.log('No ratings yet.');
    return;
  }
  const { places } = JSON.parse(readFileSync(PLACES, 'utf8')) as { places: Place[] };
  const names = new Map(places.map((place) => [place.osm, place.name]));
  for (const row of rows)
    console.log(
      [
        `#${String(row.id)}  ${'★'.repeat(row.stars)}${'☆'.repeat(5 - row.stars)}  ${names.get(row.place) ?? row.place}  ${row.updated_at.slice(0, 16).replace('T', ' ')} UTC${row.hidden ? '  (hidden)' : ''}`,
        row.comment ? `    “${row.comment}”` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
}

/** Hides ratings, and counts their places' totals again without them. */
function hide(): void {
  if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0))
    throw new Error('Give the numbers to hide: npm run hide -- 12 14');
  const list = ids.join(', ');
  const rows = sql<RatingRow>(`SELECT id, place FROM ratings WHERE id IN (${list})`);
  if (rows.length === 0) {
    console.warn('No such rating.');
    return;
  }
  const placesHit = [...new Set(rows.map((row) => row.place))];
  sql(
    [
      `UPDATE ratings SET hidden = 1 WHERE id IN (${list})`,
      ...placesHit.map(
        (place) =>
          `INSERT OR REPLACE INTO rating_totals (place, count, total, poutine_yes, poutine_no) SELECT '${place.replace(/'/g, "''")}', COUNT(*), COALESCE(SUM(stars), 0), COALESCE(SUM(poutine = 1), 0), COALESCE(SUM(poutine = 0), 0) FROM ratings WHERE place = '${place.replace(/'/g, "''")}' AND hidden = 0`,
      ),
    ].join('; '),
  );
  console.log(
    `Hidden: ${rows.map((row) => `#${String(row.id)}`).join(', ')}. The map shows it within a minute.`,
  );
}

/** The last 30 days' counts, a line a day (only numbers: nothing about who). */
function counts(): void {
  const rows = sql<{ day: string; kind: CountKind; n: number }>(
    "SELECT day, kind, n FROM daily_counts WHERE day >= date('now', '-30 days') ORDER BY day",
  );
  if (rows.length === 0) {
    console.log('Nothing counted in the last 30 days.');
    return;
  }
  const heads = ['day', ...COUNT_KINDS];
  console.log(heads.map((head) => head.padEnd(12)).join(''));
  for (const day of [...new Set(rows.map((row) => row.day))]) {
    const of = (kind: CountKind) =>
      String(rows.find((row) => row.day === day && row.kind === kind)?.n ?? 0);
    console.log([day, ...COUNT_KINDS.map(of)].map((cell) => cell.padEnd(12)).join(''));
  }
}

/**
 * The places raters confirmed serve poutine, and which of them the list still calls unconfirmed:
 * those can be made permanent with "confirmed": true in data/picked.json.
 */
function confirmed(): void {
  const rows = sql<{ place: string; poutine_yes: number; poutine_no: number }>(
    `SELECT place, poutine_yes, poutine_no FROM rating_totals
      WHERE poutine_yes >= ${String(CONFIRM_AT)} AND poutine_yes > poutine_no ORDER BY place`,
  );
  if (rows.length === 0) {
    console.log('No place confirmed by raters yet.');
    return;
  }
  const { places } = JSON.parse(readFileSync(PLACES, 'utf8')) as { places: Place[] };
  for (const row of rows) {
    const place = places.find((candidate) => candidate.osm === row.place);
    const still = place?.poutine === 'unconfirmed' ? '  (still unconfirmed in the list)' : '';
    console.log(
      `${row.place}  ${place?.name ?? '?'}, ${place?.city ?? ''}: ${String(row.poutine_yes)} yes, ${String(row.poutine_no)} no${still}`,
    );
  }
}

if (command === 'waiting') waiting();
else if (command === 'approve') review('approved');
else if (command === 'reject') review('rejected');
else if (command === 'ratings') ratings();
else if (command === 'hide') hide();
else if (command === 'counts') counts();
else if (command === 'confirmed') confirmed();
else
  throw new Error(
    'npm run waiting | approve -- <numbers> | reject -- <numbers> | ratings | hide -- <numbers> | counts | confirmed',
  );
