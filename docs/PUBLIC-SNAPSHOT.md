# Published voyage snapshot

The user explicitly asked for real voyages to be reflected in the public site. The Operational voyages read at 2026-09-15 09:55:05 UTC — 47 voyages across 43 distinct vessels and 243 registered port calls — are displayed on the static site. This is not an automatic feed.

## What is published, and what is not

Published fields: vessel name, a Dataloy voyage id, year/voyage number, reference number, OPR status, the registered start/end GMT times, and for each port call in registered sequence its name, sequence number, purpose (Loading, Discharging, Bunkering, Canal passage and so on) and whether its arrival and departure dates are fixed.

Excluded: API internal `key`/`self`, IMO, the company API host, any financial field, raw reports, and all credentials. The raw pull under `data/` is excluded from Git.

## How it is produced

`node scripts/prepare-public-snapshot.mjs` projects the local raw pull down to the approved fields. It refuses to emit anything if the pull is incomplete (`reportedTotal` must equal the row count) or if any row carries a status other than OPR. Port calls are sorted by `portCallSequence` and timestamps are normalised to explicit UTC.

Publishing a new snapshot is a deliberate step taken after a fresh scope check. No key is ever placed in the bundle, and the site never calls Dataloy from the browser.

## What the site does and does not claim

`src/live.js` is the entry point. Voyages are keyed individually, so a vessel with several Operational voyages keeps them separate, and vessel count and voyage count are reported as different numbers.

Date state is judged against the snapshot instant, not against the reader's clock. 15 voyages sit past their registered end while still OPR and are surfaced for review. The 32 inside their registered window are **not** asserted to be sailing.

Registered start and end are `voyageStartDateGMT` and `voyageEndDateGMT`. They are not destination ETAs and not actual completion times, and the UI says so on every screen that shows them.

**No map is shipped.** Without a verified vessel report or AIS position there is nothing to plot, and a registered port call is a plan rather than a position. The map returns when a position with an observation time and a source exists.

The Outlook comparison — the reason this product exists — is not connected. Every screen states that.

## Open scope question

The site is currently served without authentication. That conflicts with [ARCHITECTURE-V2.md](ARCHITECTURE-V2.md) §12, which requires a verified sign-in and fleet-scoped permissions for any shared deployment. The published extract is a commercial fleet's forward schedule and port rotation, so the intended audience should be settled before the next snapshot is published.
