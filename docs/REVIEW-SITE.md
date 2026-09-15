# Site scope

Public address: https://fleet-operations-review-beg9z.ondigitalocean.app/

The site shows the published Dataloy voyage snapshot. It is a static build with no
dependencies, no backend, no API call from the browser and no secrets. What it can honestly
show is bounded by what the snapshot carries: registered voyage data, and nothing else.

Visual design decisions are recorded separately in [DESIGN-ENGLISH.md](DESIGN-ENGLISH.md).

## Screens

- **Operational voyages** — the register of 47 Operational voyages, with search, filters,
  sorting and CSV export.
- **Schedule review** — the 15 voyages whose registered end date has passed while the
  status is still OPR.
- **Briefing** — a fixed reading of the snapshot.
- **Connections** — what is verified, what is published, what is missing.
- **Voyage detail** — every port call in registered sequence with its purpose, and whether
  its arrival and departure dates are fixed.

## What the snapshot supports

47 voyages, 43 distinct vessels, 243 registered port calls. Three vessels carry more than
one Operational voyage, so a vessel name is not a key.

Port call purpose is recorded across 16 categories — Bunkering (57), Discharging (55),
Loading (48), Canal passage (42), Redelivery, Delivery, Waiting, Repair, Dry dock and
others. Arrival and departure each carry a fixed-date flag, which is the closest thing in
this extract to a plan-versus-actual discriminator.

15 voyages sit past their registered end while still OPR, ranging from 1 to 102 days past.

## What it does not show

No vessel position, no speed, no cargo quantity, no ETA against plan, no report freshness
and no comparison — the snapshot holds none of these. A registered port call is a planned
call, not a place the vessel is, so nothing is plotted and no map ships in the build.

Registered start and end are `voyageStartDateGMT` and `voyageEndDateGMT`. They are not
destination ETAs and not actual completion times.

## Dependencies

None at runtime. The map library, its bundled geometry and the synthetic demo modules were
removed once the entry point moved to the real snapshot and nothing referenced them; all
are recoverable from git history when a verified position source exists.

## Before this is the real product

An approved Outlook collector, the intake API, a scheduled Dataloy sync, a worker,
PostgreSQL, sign-in with fleet-scoped permissions, server-stored review history, and
coverage verification. The static site is not a substitute for any of these, and does not
present itself as one.
