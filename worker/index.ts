// The Worker behind poutine.ederer.digital: the built app from `dist`, and under /api the few
// things a static page can't do. Only /api/* reaches this code (run_worker_first in wrangler.jsonc).
import { geocode } from './geocode.ts';
import { problem } from './http.ts';
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
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
