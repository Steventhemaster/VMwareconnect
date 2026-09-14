# Review site — implementation scope

The first deployed build, for reviewing the screens and the working flow against synthetic data. It does not yet include a live-data operational backend.

Public address: https://fleet-operations-review-beg9z.ondigitalocean.app/

On 2026-09-14 the Static Site deployment of the DigitalOcean App Platform app `fleet-operations-review` was confirmed Healthy. The create screen showed a base cost of $0.00/month, using the account's free static app allowance. Automatic deployment from the GitHub `claude/eager-goodall-zoaen3` branch is enabled. Live-data backend costs are separate.

Verification: 5 unit tests pass, the production build succeeds, and a production preview confirmed 7 map markers, acknowledge/undo in the review queue, and the connection status display. Desktop search and the vessel comparison/evidence tabs were checked. A horizontal overflow in the table accessibility labels, found while checking a 390px viewport, was fixed, and document `scrollWidth` was confirmed to match `clientWidth`. The mobile menu was checked, and the map auto-fits its zoom level to the extent of the fleet positions. The map library bundle-size warning remains and is a follow-up performance item.

## Running it

Node.js 22 or later: `npm ci`, then `npm run dev`. Verify with `npm test`; build for deployment with `npm run build`. On an App Platform Static Site, deploy with build command `npm ci && npm run build` and output directory `dist`. An example configuration is in `.do/app.yaml`.

## Screens implemented

- Fleet overview: 8 synthetic vessels, status filters, vessel/voyage/port search, review-first and by-name sorting, CSV export.
- Map: local Natural Earth country geometry with MapLibre zoom, vessel marker selection, and the selected vessel's report points connected. Vessels with no position stay in the table.
- Vessel detail: operational overview, vessel/plan/recorded-actual comparison, and synthetic report evidence.
- Review queue: 3 operational differences and 1 unverified-coverage item, kept apart. Acknowledgements are stored only in this browser's localStorage.
- Daily brief: a synthetic brief at a fixed as-of time, plus a text download.
- Connection status: shows that real Outlook collection and Dataloy authentication are not connected. There is no frontend form that accepts secrets.

Every screen and every export states the demo status. No real IMO numbers, real company mail, raw content, keys or current operational data are bundled. The brief and the report times are computed against the 2026-09-14 08:00 UTC snapshot.

## Remaining work before live data

An approved Outlook collector, the intake API, a Dataloy read-only connector, a worker, PostgreSQL, sign-in and per-fleet permissions, server-stored review history, and data coverage verification. The static site is not described as a substitute for any of these.

## Map data

Natural Earth 1:110m country geometry, simplified and bundled at `public/countries.geojson`. [Source](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson). Regenerate with `node scripts/fetch-map.mjs`. No separate map tiles or API key are requested. It is a schematic map, not a navigational chart. The dashed line between observation points is not the actual route.

Fonts are optionally fetched from Google Fonts and fall back to system fonts on failure. The app does not require an external font to work.
