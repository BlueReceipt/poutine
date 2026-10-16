# Poutine · Pootsin

A map of Québec's casse-croûtes, cantines and potato shacks: **Poutine** in French, **Pootsin** in English, at [poutine.ederer.digital](https://poutine.ederer.digital). Coming next: each place's card (address, hours, phone, directions), then photos of poutine and menu prices sent in by visitors, each one checked before it shows.

## The places

`data/places.json` holds every independent place in Québec whose OpenStreetMap cuisine says poutine, or whose name says what it is (casse-croûte, cantine, patates, friterie...), plus a few hand-picked ones elsewhere (`data/picked.json`). Chains are left out. `npm run places` rebuilds it; `src/domain/osmPlaces.ts` holds the rules.

Places: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License (ODbL 1.0); the list in `data/places.json` is offered under the same license. Towns and postal codes where OpenStreetMap has none: [Adresses Québec](https://www.donneesquebec.ca/), CC BY 4.0. Street map: [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, data from OpenStreetMap. The map's font is Atkinson Hyperlegible Next (SIL Open Font License, `public/fonts/OFL.txt`).

## Working on it

Node 24.

- `npm install`, then `npm run dev` (http://localhost:5180) or `npm start` (the production build at http://localhost:4180).
- `npm run check`: formatting, types, unit tests and the build, as the automatic checks run them.
- Publishing: Cloudflare Workers, connected to this repository. Each push to `main` runs `npm run build`, then `npx wrangler deploy` with `wrangler.jsonc`.

## License

MIT, © 2026 Alex Ederer. Built with help from Claude by Anthropic.
