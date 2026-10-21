// A place's short link (/labanquise): the app's own page, its title and link preview naming the
// place and its stars (or a friend's, from "?s=4"), for WhatsApp, Messenger, Facebook and the
// rest. The page then opens the place's card itself. Cloudflare keeps each page five minutes. The
// links shared before short links (/p/la-banquise-n5228808422) are sent to the short one, and so
// are the links of entries merged into a place since (/alfahotdog to /alfa).
import {
  isEnglishLink,
  placeIdFromPath,
  placePath,
  placeUrl,
  previewOf,
  friendFromSearch,
  PREVIEW_PICTURE,
} from '../src/domain/links.ts';
import { linkFromPath } from '../src/domain/shortLinks.ts';
import { friendCodeFits } from './codes.ts';
import { approvedPlaces } from './added.ts';
import { countLater } from './counts.ts';
import { givenLinks, listed } from './list.ts';
import type { RatingTotal } from '../src/domain/ratings.ts';
import { phoneLanguage, stringsFor, type Language } from '../src/ui/strings.ts';

const byId = new Map(listed.map((p) => [p.osm, p]));
const byLink = new Map(listed.flatMap((p) => (p.link ? [[p.link, p] as const] : [])));
const byOldLink = new Map(
  listed.flatMap((p) => (p.oldLinks ?? []).map((old) => [old, p] as const)),
);

/** A link from before short links: to the place's short link, a friend's stars kept. */
export function oldPlaceLink(request: Request, env: Env): Promise<Response> | Response {
  const url = new URL(request.url);
  const id = placeIdFromPath(url.pathname);
  const place = id ? (byId.get(id) ?? byOldLink.get(givenLinks[id] ?? '')) : undefined;
  if (!place) return env.ASSETS.fetch(new URL('/', url));
  return Response.redirect(`${url.origin}${placePath(place)}${url.search}`, 301);
}

/** The reader's language from the request; a preview robot rarely says, and most readers are French. */
function languageOf(request: Request): Language {
  const accepted = (request.headers.get('Accept-Language') ?? '')
    .split(',')
    .map((part) => part.split(';')[0]?.trim() ?? '')
    // "*" (any language, as some robots say) is no preference: French.
    .filter((language) => language && language !== '*');
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
  const merged = word ? byOldLink.get(word) : undefined;
  if (merged) return Response.redirect(`${url.origin}${placePath(merged)}${url.search}`, 301);
  // A place approved since the list was built has its link in D1 (worker/added.ts).
  const place = word
    ? (byLink.get(word) ?? (await approvedPlaces(env, word).catch(() => []))[0])
    : undefined;
  // A word that's no place's link: the app's page, which looks it up (a shared name, a town).
  if (!place) return env.ASSETS.fetch(new URL('/', url));

  if (request.method === 'GET') countLater(env, ctx, 'link-open');
  // A link shared from an English phone carries ?en: its preview is English whoever asks.
  const english = isEnglishLink(url.search);
  const language = english ? 'en' : languageOf(request);
  // A friend's stars count only when their code fits: anyone can type "?s=5".
  const asked = friendFromSearch(url.search);
  const friend =
    asked && (await friendCodeFits(env.LINK_SECRET, place.osm, asked.stars, asked.code))
      ? asked
      : null;
  // One kept copy per place, language, friend's stars and version of the app's page: a kept copy
  // names the app's script files, which a deploy replaces, so each deploy starts fresh copies.
  const page = await env.ASSETS.fetch(new URL('/', url));
  if (!page.ok) return page;
  const version = page.headers.get('ETag') ?? '';
  const key = new Request(
    `${url.origin}/p/${place.osm}?lang=${language}&s=${friend ? `${String(friend.stars)}&c=${friend.code}` : ''}&en=${english ? '1' : ''}&v=${encodeURIComponent(version)}`,
  );
  const kept = await caches.default.match(key);
  if (kept) return forBrowser(kept, request.method);

  const strings = stringsFor(language);
  const total = await totalOf(env, place.osm);
  const { title, description } = previewOf(
    place,
    total,
    {
      tagline: strings.tagline,
      summary: strings.ratings.summary,
      near: strings.card.near,
      friend: strings.share.friend,
      number: strings.ratings.number,
      ...strings.preview,
    },
    friend?.stars ?? null,
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
    // Facebook reads the page at og:url again: it keeps the friend's stars and the ?en.
    .on('meta[property="og:url"]', set('content', placeUrl(place, friend, english)))
    .on('meta[property="og:image"]', set('content', PREVIEW_PICTURE[language]))
    .on('meta[property="og:locale"]', set('content', language === 'fr' ? 'fr_CA' : 'en_CA'))
    // The page shows the friend's line only from here: the code was checked.
    .on('head', {
      element(element) {
        if (friend)
          element.append(`<meta name="poutine-friend" content="${String(friend.stars)}" />`, {
            html: true,
          });
      },
    })
    .transform(page);
  const headers = new Headers(named.headers);
  headers.set('Cache-Control', `public, max-age=${String(PAGE_KEPT)}`);
  const made = new Response(await named.text(), { status: 200, headers });
  ctx.waitUntil(caches.default.put(key, made.clone()));
  return forBrowser(made, request.method);
}
