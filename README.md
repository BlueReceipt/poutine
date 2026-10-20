# Poutine

A map of Québec's casse-croûtes, cantines and potato shacks: **Poutine** (pronounced pootsin), at [poutines.app](https://poutines.app). Tap a pin for the place's card (address, hours, phone, directions), search by name or town, find the places near you, rate it from 1 to 5 stars and share your rating as a story picture with the place's link, and add a place that's missing: each place sent is checked before it shows.

## The places

`data/places.json` holds every independent place in Québec whose OpenStreetMap cuisine says poutine, or whose name says what it is (casse-croûte, cantine, patates, friterie...), plus a few hand-picked ones elsewhere (`data/picked.json`). Chains are left out. `npm run places` rebuilds it; `src/domain/osmPlaces.ts` holds the rules.

Places: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License (ODbL 1.0); the list in `data/places.json` is offered under the same license. Towns and postal codes where OpenStreetMap has none: [Adresses Québec](https://www.donneesquebec.ca/), CC BY 4.0. Street map: [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, data from OpenStreetMap. The map's font is Atkinson Hyperlegible Next (SIL Open Font License, `public/fonts/OFL.txt`).

## Working on it

Node 24.

- `npm install`, then `npm run dev` (http://localhost:5180) or `npm start` (the production build at http://localhost:4180).
- `npm run check`: formatting, types, unit tests and the build, as the automatic checks run them.
- `npm start` runs the Worker too (`wrangler dev`, a local D1 and Cloudflare Turnstile's test keys in `.dev.vars`: `TURNSTILE_SECRET=1x0000000000000000000000000000000AA`).
- Publishing: Cloudflare Workers, connected to this repository. Each push to `main` runs `npm run build`, then `npx wrangler deploy` with `wrangler.jsonc`. The Worker (`worker/`) answers `/api/*`: the address lookup, Add a place (stored in D1 until checked) and ratings (D1, `migrations/`); and `/p/*`, a place's link, whose page names the place and its stars for link previews.

Address lookups: [Adresses Québec](https://www.donneesquebec.ca/) (CC BY 4.0) and Natural Resources Canada's Geolocation Service (Open Government Licence – Canada). Places visitors add join `data/places.json` under the ODbL once approved.

## License

MIT, © 2026 Alex Ederer. Built with help from Claude by Anthropic.
