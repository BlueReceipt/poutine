/**
 * Alex's review of the places visitors send (until the approval page exists, he reviews them with
 * Claude in a session). Reads and writes the `poutine` D1 database through Wrangler, signed in on
 * this PC (`npx wrangler login`, once).
 *
 *   npm run waiting                 the places waiting, with links to check them
 *   npm run approve -- 3 5          approves them as the approval page does (on the map within a minute),
 *                                   then folds
 *   npm run fold                    copies the approved places to data/added.json and the list, and
 *                                   the approved changes (Add more info) to data/fixes.json
 *   npm run reject -- 4             turns them down (kept in the database as rejected)
 *   npm run ratings                 the latest ratings (and written reviews, once switched on)
 *   npm run hide -- 12              hides ratings: they stop counting at once, no push needed
 *   npm run counts                  the last 30 days' counts: Share taps, link opens, ratings
 *   npm run confirmed               places raters confirmed serve poutine (3 yeses, more than noes)
 *
 * Add --local to work on the database `npm start` uses on this PC instead of the real one.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Fix } from '../src/domain/addressFixes.ts';
import { COUNT_KINDS, type CountKind } from '../src/domain/counts.ts';
import { possibleDuplicates } from '../src/domain/duplicates.ts';
import type { Place } from '../src/domain/osmPlaces.ts';
import { linkForNewPlace } from '../src/domain/shortLinks.ts';
import {
  approvedPlace,
  newPlaceOfRow,
  SUBMISSION_COLUMNS,
  type SubmissionRow,
} from '../src/domain/submission.ts';

const ROOT = join(import.meta.dirname, '..');
const ADDED = join(ROOT, 'data', 'added.json');
const FIXES = join(ROOT, 'data', 'fixes.json');
const PLACES = join(ROOT, 'data', 'places.json');
// Wrangler's own entry (its package exports don't name it): the project's installed copy.
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

type Row = SubmissionRow;

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

const COLUMNS = SUBMISSION_COLUMNS;
const LINKS = join(ROOT, 'data', 'links.json');

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

  const now = new Date().toISOString();
  if (status === 'rejected')
    sql(
      `UPDATE submissions SET status = 'rejected', reviewed_at = '${now}' WHERE id IN (${rows.map((row) => String(row.id)).join(', ')}) AND status = 'pending'`,
    );
  else {
    // Each gets its short link as the approval page gives it: against every link already given.
    const { places } = JSON.parse(readFileSync(PLACES, 'utf8')) as { places: Place[] };
    const { links } = JSON.parse(readFileSync(LINKS, 'utf8')) as { links: Record<string, string> };
    const known: Place[] = [...places, ...approvedRows().map(placeOfRow)];
    const given = {
      ...links,
      ...Object.fromEntries(known.flatMap((p) => (p.link ? [[p.osm, p.link]] : []))),
    };
    for (const row of rows) {
      const place = approvedPlace(row.id, newPlaceOfRow(row));
      const link = linkForNewPlace(place, known, given);
      given[place.osm] = link;
      known.push({ ...place, link });
      sql(
        `UPDATE submissions SET status = 'approved', reviewed_at = '${now}', link = '${link}' WHERE id = ${String(row.id)} AND status = 'pending'`,
      );
    }
  }
  for (const row of rows)
    console.log(
      `${status === 'approved' ? 'Approved' : 'Rejected'} #${String(row.id)} ${row.name}`,
    );
  if (status === 'approved') {
    console.log('They show on the map within a minute.');
    fold();
  }
}

/** The places approved in D1 (the approval page or npm run approve), with their short links. */
function approvedRows(): Row[] {
  return sql(
    `SELECT ${COLUMNS} FROM submissions WHERE status = 'approved' AND link IS NOT NULL ORDER BY id`,
  );
}

function placeOfRow(row: Row): Place {
  return { ...approvedPlace(row.id, newPlaceOfRow(row)), link: row.link ?? undefined };
}

/**
 * The changes Alex approved (Add more info) into data/fixes.json, each over the fix already there
 * for its place, the latest last; they already show from D1 until the list has them.
 */
function foldChanges(): number {
  const rows = sql<{ place: string; fix: string }>(
    "SELECT place, fix FROM changes WHERE status = 'approved' AND fix IS NOT NULL ORDER BY reviewed_at, id",
  );
  if (rows.length === 0) return 0;
  const file = JSON.parse(readFileSync(FIXES, 'utf8')) as {
    about: string;
    fixes: Record<string, Fix>;
  };
  for (const row of rows)
    file.fixes[row.place] = { ...file.fixes[row.place], ...(JSON.parse(row.fix) as Fix) };
  file.fixes = Object.fromEntries(
    Object.entries(file.fixes).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })),
  );
  writeFileSync(FIXES, `${JSON.stringify(file, null, 1)}\n`);
  return rows.length;
}

/**
 * The approved places into the list the app ships: data/added.json, their links in
 * data/links.json, the approved changes in data/fixes.json, then data/places.json again (no server
 * asked). Commit and push to ship them; they already show from D1 until then.
 */
function fold(): void {
  const changes = foldChanges();
  const rows = approvedRows();
  const file = JSON.parse(readFileSync(LINKS, 'utf8')) as {
    about: string;
    links: Record<string, string>;
  };
  const clash = rows.filter((row) =>
    Object.entries(file.links).some(
      ([osm, link]) => link === row.link && osm !== `added/${String(row.id)}`,
    ),
  );
  if (clash.length > 0)
    throw new Error(
      `These links are already another place's in data/links.json: ${clash.map((row) => `${row.link ?? ''} (#${String(row.id)})`).join(', ')}`,
    );
  for (const row of rows) if (row.link) file.links[`added/${String(row.id)}`] = row.link;
  writeFileSync(
    LINKS,
    `${JSON.stringify(file, null, 1)}
`,
  );
  writeFileSync(
    ADDED,
    `${JSON.stringify(
      {
        about:
          'Places visitors added and Alex approved (the approval page or npm run approve), copied from the database by npm run fold, joined to places.json by npm run places. Open data under the ODbL like the rest of the list.',
        places: rows.map((row) => approvedPlace(row.id, newPlaceOfRow(row))),
      },
      null,
      1,
    )}
`,
  );
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'fetch-places.ts'), '--offline'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  console.log(
    `${String(rows.length)} approved places in data/added.json, ${String(changes)} approved changes in data/fixes.json: commit and push to ship them.`,
  );
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
 * The places raters confirmed serve poutine (any rating does), and which of them the list still
 * calls unconfirmed: those can be made permanent with "confirmed": true in data/picked.json.
 */
function confirmed(): void {
  const rows = sql<{ place: string; count: number }>(
    `SELECT place, count FROM rating_totals WHERE count > 0 ORDER BY place`,
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
      `${row.place}  ${place?.name ?? '?'}, ${place?.city ?? ''}: ${String(row.count)} rating${row.count === 1 ? '' : 's'}${still}`,
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
else if (command === 'fold') fold();
else
  throw new Error(
    'npm run waiting | approve -- <numbers> | reject -- <numbers> | ratings | hide -- <numbers> | counts | confirmed | fold',
  );
