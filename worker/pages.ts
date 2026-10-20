// A place's link (/p/la-banquise-n265847671): the app's own page, its title and link preview naming
// the place and its stars, for WhatsApp, Messenger, Facebook and the rest. The page then opens the
// place's card itself.
import list from '../data/places.json';
import { placeIdFromPath, placeUrl, previewOf } from '../src/domain/links.ts';
import type { Place } from '../src/domain/osmPlaces.ts';
import type { RatingTotal } from '../src/domain/ratings.ts';
import { phoneLanguage, stringsFor, type Language } from '../src/ui/strings.ts';

const places = new Map((list as unknown as { places: Place[] }).places.map((p) => [p.osm, p]));

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

export async function placePage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new URL('/', url));
  const id = placeIdFromPath(url.pathname);
  const place = id ? places.get(id) : undefined;
  if (!place || !page.ok) return page;

  const language = languageOf(request);
  const strings = stringsFor(language);
  const total = await totalOf(env, place.osm);
  const { title, description } = previewOf(place, total, {
    appName: strings.appName,
    tagline: strings.tagline,
    summary: strings.ratings.summary,
    none: strings.ratings.none,
    near: strings.card.near,
  });
  const link = placeUrl(place);
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
    .on('link[rel="canonical"]', set('href', link))
    .on('meta[property="og:site_name"]', set('content', strings.appName))
    .on('meta[property="og:title"]', set('content', title))
    .on('meta[property="og:description"]', set('content', description))
    .on('meta[property="og:url"]', set('content', link))
    .on('meta[property="og:locale"]', set('content', language === 'fr' ? 'fr_CA' : 'en_CA'))
    .transform(page);
  const headers = new Headers(named.headers);
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.append('Vary', 'Accept-Language');
  return new Response(named.body, { status: 200, headers });
}
