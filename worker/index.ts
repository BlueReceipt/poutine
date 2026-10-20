// The Worker behind poutines.app: the built app from `dist`, under /api the few things a static
// page can't do, and under /p a place's link. Only /api/* and /p/* reach this code (run_worker_first
// in wrangler.jsonc).
import { geocode } from './geocode.ts';
import { problem } from './http.ts';
import { placePage } from './pages.ts';
import { addPlace } from './places.ts';
import { placeReviews, rate, ratingTotals } from './ratings.ts';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    const { method } = request;
    if (method === 'POST' && pathname === '/api/geocode') return geocode(request);
    if (method === 'POST' && pathname === '/api/places') return addPlace(request, env);
    if (method === 'GET' && pathname === '/api/ratings') return ratingTotals(request, env, ctx);
    if (method === 'POST' && pathname === '/api/ratings') return rate(request, env);
    if (method === 'GET' && pathname === '/api/reviews') return placeReviews(request, env);
    if (pathname.startsWith('/api/')) return problem(404, 'not-found');
    if ((method === 'GET' || method === 'HEAD') && pathname.startsWith('/p/'))
      return placePage(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
