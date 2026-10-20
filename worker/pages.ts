// A place's short link (/labanquise): the app's own page, its title and link preview naming the
// place and its stars (or a friend's, from "?s=4"), for WhatsApp, Messenger, Facebook and the
// rest. The page then opens the place's card itself. Cloudflare keeps each page five minutes. The
// links shared before short links (/p/la-banquise-n5228808422) are sent to the short one.
import list from '../data/places.json';
import {
  placeIdFromPath,
  placePath,
  placeUrl,
  previewOf,
  starsFromSearch,
} from '../src/domain/links.ts';
import type { Place } from '../src/domain/osmPlaces.ts';
import { linkFromPath } from '../src/domain/shortLinks.ts';
import type { RatingTotal } from '../src/domain/ratings.ts';
import { phoneLanguage, stringsFor, type Language } from '../src/ui/strings.ts';

const all = (list as unknown as { places: Place[] }).places;
const byId = new Map(all.map((p) => [p.osm, p]));
const byLink = new Map(all.flatMap((p) => (p.link ? [[p.link, p] as const] : [])));

/** A link from before short links: to the place's short link, a friend's stars kept. */
export function oldPlaceLink(request: Request, env: Env): Promise<Response> | Response {
  const url = new URL(request.url);
  const id = placeIdFromPath(url.pathname);
  const place = id ? byId.get(id) : undefined;
  if (!place) return env.ASSETS.fetch(new URL('/', url));
  return Response.redirect(`${url.origin}${placePath(place)}${url.search}`, 301);
}

/** The reader's language from the request; a preview robot rarely says, and most readers are French. */
function languageOf(request: Request): Language {
  const accepted = (request.headers.get('Accept-Language') ?? '')
    .split(',')
    .map((part) => part.split(';')[0]?.trim() ?? '')
    .filter(Boolean);
  return accepted.length > 0 ? phoneLanguage(accepted) : 'fr';
}

async function totalOf(env: Env, place: string): Promise<RatingTotal | undefined> {
  try {
    const row = await env.DB.prepare(
      'SELECT count, total FROM rating_totals WHERE place = ? AND count > 0',
    )
      .bind(place)
      .first<RatingTotal>();
    return row ?? undefined;
  } catch {
    return undefined;
  }
}

/** How long Cloudflare keeps a place's page, in seconds: a link going around asks D1 once. */
const PAGE_KEPT = 300;

/** The page as the browser gets it: always asked again (the kept copy is Cloudflare's only). */
function forBrowser(page: Response, method: string): Response {
  const headers = new Headers(page.headers);
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('Vary', 'Accept-Language');
  return new Response(method === 'HEAD' ? null : page.body, { status: 200, headers });
}

export async function placePage(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const word = linkFromPath(url.pathname);
  const place = word ? byLink.get(word) : undefined;
  // A word that's no place's link: the app's page, which looks it up (a shared name, a town).
  if (!place) return env.ASSETS.fetch(new URL('/', url));

  const language = languageOf(request);
  const friend = starsFromSearch(url.search);
  // One kept copy per place, language and friend's stars.
  const key = new Request(
    `${url.origin}/p/${place.osm}?lang=${language}&s=${friend === null ? '' : String(friend)}`,
  );
  const kept = await caches.default.match(key);
  if (kept) return forBrowser(kept, request.method);

  const page = await env.ASSETS.fetch(new URL('/', url));
  if (!page.ok) return page;
  const strings = stringsFor(language);
  const total = await totalOf(env, place.osm);
  const { title, description } = previewOf(
    place,
    total,
    {
      appName: strings.appName,
      tagline: strings.tagline,
      summary: strings.ratings.summary,
      none: strings.ratings.none,
      near: strings.card.near,
      friend: strings.share.friend,
    },
    friend,
  );
  const set = (name: string, value: string): HTMLRewriterElementContentHandlers => ({
    element(element) {
      element.setAttribute(name, value);
    },
  });
  const named = new HTMLRewriter()
    .on('html', set('lang', language))
    .on('title', {
      element(element) {
        element.setInnerContent(`${place.name} · ${strings.appName}`);
      },
    })
    .on('meta[name="description"]', set('content', description))
    .on('link[rel="canonical"]', set('href', placeUrl(place)))
    .on('meta[property="og:site_name"]', set('content', strings.appName))
    .on('meta[property="og:title"]', set('content', title))
    .on('meta[property="og:description"]', set('content', description))
    // Facebook reads the page at og:url again: it keeps the friend's stars.
    .on('meta[property="og:url"]', set('content', placeUrl(place, friend)))
    .on('meta[property="og:locale"]', set('content', language === 'fr' ? 'fr_CA' : 'en_CA'))
    .transform(page);
  const headers = new Headers(named.headers);
  headers.set('Cache-Control', `public, max-age=${String(PAGE_KEPT)}`);
  const made = new Response(await named.text(), { status: 200, headers });
  ctx.waitUntil(caches.default.put(key, made.clone()));
  return forBrowser(made, request.method);
}
