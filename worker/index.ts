// The Worker behind poutines.app: the built app from `dist`, under /api the few things a static
// page can't do, and a place's short link (/labanquise, and the older /p/… ones). The app's files
// (assets, fonts, map glyphs, pictures) never reach this code: run_worker_first in wrangler.jsonc.
import { adminPage, reviewPlace, waitingPlaces } from './admin.ts';
import { ADDED_PATH, addedPlaces } from './added.ts';
import { approvedChanges, CHANGES_PATH, sendChange } from './changes.ts';
import { countTap } from './counts.ts';
import { geocode } from './geocode.ts';
import { problem } from './http.ts';
import { oldPlaceLink, placePage } from './pages.ts';
import { linkFromPath } from '../src/domain/shortLinks.ts';
import { addPlace } from './places.ts';
import { joinRatings, keyRatings, placeReviews, rate, ratingTotals, unrate } from './ratings.ts';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    const { method } = request;
    if (method === 'POST' && pathname === '/api/geocode') return geocode(request);
    if (method === 'POST' && pathname === '/api/count') return countTap(request, env, ctx);
    if (method === 'POST' && pathname === '/api/places') return addPlace(request, env, ctx);
    if (method === 'GET' && pathname === ADDED_PATH) return addedPlaces(request, env, ctx);
    if (method === 'POST' && pathname === CHANGES_PATH) return sendChange(request, env, ctx);
    if (method === 'GET' && pathname === CHANGES_PATH) return approvedChanges(request, env, ctx);
    if (method === 'GET' && pathname === '/api/admin/waiting') return waitingPlaces(request, env);
    if (method === 'POST' && pathname === '/api/admin/review')
      return reviewPlace(request, env, ctx);
    if (method === 'GET' && pathname === '/api/ratings') return ratingTotals(request, env, ctx);
    if (method === 'POST' && pathname === '/api/ratings') return rate(request, env);
    if (method === 'DELETE' && pathname === '/api/ratings') return unrate(request, env);
    if (method === 'POST' && pathname === '/api/ratings/key') return keyRatings(request, env);
    if (method === 'POST' && pathname === '/api/ratings/join') return joinRatings(request, env);
    if (method === 'GET' && pathname === '/api/reviews') return placeReviews(request, env);
    if (pathname.startsWith('/api/')) return problem(404, 'not-found');
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      if (method === 'GET' || method === 'HEAD') return adminPage(request, env);
      return problem(405, 'not-allowed');
    }
    if (method === 'GET' || method === 'HEAD') {
      if (pathname.startsWith('/p/')) return oldPlaceLink(request, env);
      if (linkFromPath(pathname)) return placePage(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
