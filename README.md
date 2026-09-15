# VMwareconnect — Fleet Operations

Collect vessel reports from Outlook against Dataloy Operational voyages, and show each
vessel's **latest reported position, schedule, working state and the differences against
Dataloy** — with the evidence attached.

All repository content is in English.

## Current status

[Open the site](https://fleet-operations-review-beg9z.ondigitalocean.app/) — a **published
snapshot of real Dataloy Operational voyages** on DigitalOcean App Platform.

Dataloy OAuth and the Operational voyage read are verified, and the result is published as
a fixed extract. **Outlook collection is not connected, no vessel position is held, and no
report comparison is performed** — so the site is currently a voyage register rather than
the comparison product described below. Every screen states this.

| Capability | State |
|---|---|
| Dataloy OAuth + Operational voyage read | verified |
| Published snapshot — 47 voyages / 43 vessels / 243 port calls, with call purpose and fixed-date flags | published, no auto-refresh |
| Outlook vessel report collection | not connected |
| Vessel position / map | none held — nothing plotted |
| Search, sort, charterer / operator filter | built |
| Port call dates in the rotation | projected and rendered; needs one re-run of the pull to appear |
| Voyage parties, cargo laycan, freight, port costs, invoicing, laytime — amounts and charterer names included | screens built against the agreed contract; collection pending |
| Report ↔ Dataloy comparison | not performed |
| Sign-in and fleet-scoped permissions | not implemented — see the open question below |

Deployment target is **DigitalOcean App Platform**, deploying automatically from the
`claude/eager-goodall-zoaen3` branch.

## Running it

Node.js 22 or later. The site is a dependency-free static build.

```sh
npm ci
npm run dev      # local
npm test         # unit tests
npm run build    # production build into dist/
```

Connection verification against a real tenant is server-side only and never part of the
bundle:

```sh
node --env-file=.env.local scripts/dataloy-probe.mjs        # connectivity and auth
node --env-file=.env.local scripts/fetch-operational.mjs    # full Operational pull into data/
node scripts/prepare-public-snapshot.mjs                    # project to approved public fields
```

The pull reads its credentials from the environment, so it needs `--env-file` exactly
as the probe does. Only the projector runs without it: it reads `data/` and writes
`src/operational-snapshot.json`, and never touches the network.

### Refreshing the snapshot

The projector prints a one-line report. Read it before committing — it is the only
thing that tells you whether the port call dates landed:

```jsonc
{"voyages":47,"vessels":43,"portCalls":243,"eventLogs":410,
 "withArrival":181,"withDeparture":144,"eventCodes":{"ARR":181,"DEP":144}}
```

`withArrival` and `withDeparture` at zero while `eventLogs` is not means this tenant
names its events something other than `ARR` and `DEP`. The projector says so on stderr
and names the codes it actually saw; put those codes into `eventDate` in
`scripts/prepare-public-snapshot.mjs` and run it again. Committing a snapshot in that
state publishes a rotation with no dates and no error.

## Documents

| Document | Contents |
|---|---|
| [Architecture v2](docs/ARCHITECTURE-V2.md) | Structure, data model, collection and comparison, screens, API/MCP, operations and exit criteria |
| [Design review](docs/REVIEW-CLAUDE-DESIGN.md) | Problems found in the original design, with the rationale for each fix |
| [Phase 0](docs/PHASE-0-DESIGN.md) | Scope, real-environment verification record, deliverables and done criteria |
| [DigitalOcean deployment](docs/DEPLOYMENT-DIGITALOCEAN.md) | App Platform components, VM collection link, durable storage, secrets |
| [Dataloy connection verification](docs/DATALOY-CONNECTION-CHECK.md) | What was proven, how the probe is hardened, how to run it |
| [Published snapshot](docs/PUBLIC-SNAPSHOT.md) | What is published, what is excluded, and what the site does not claim |
| [Data request — parties, cargo, invoicing, laytime](docs/DATA-REQUEST-COMMERCIAL.md) | The agreed contract for the pull, where each field lands on screen, what to verify first, and why no amounts are published |
| [Visual design](docs/DESIGN-ENGLISH.md) | Palette measured from the Dataloy VMS product, and the information hierarchy |
| [Site scope](docs/REVIEW-SITE.md) | Screens built, what is verified, and what remains |
| [Claude implementation brief](docs/CLAUDE-HANDOFF.md) | Brief to use if implementation is handed to Claude Code |

## Key decisions

- Automatic collection and rule comparison run from a scheduler/worker; MCP and the web share one service.
- Vessel reports, Dataloy plan/forecast and Dataloy recorded actuals are kept and compared separately.
- Report corrections, duplicates, delays, multiple SOF events and per-field evidence are preserved.
- Where the timezone, voyage or port call is unclear the review is held, and a collection failure is never judged as a vessel failing to report.
- **OPR is a registered status, not proof a vessel is sailing** — established from the real tenant, where 15 of 47 Operational voyages sit past their own registered end.
- Nothing is plotted as a position without an observation time and a source. Dataloy stays read-only.

## Open question

The published site has no authentication, which conflicts with Architecture v2 §12
(verified sign-in and fleet-scoped permissions for any shared deployment). The extract is a
commercial fleet's forward schedule and port rotation. The intended audience should be
settled before the next snapshot is published.

This is no longer abstract. The next snapshot is agreed to carry **freight, port cost,
invoice and demurrage amounts** and **charterer names** — the figures and counterparties
for 47 live voyages, on a public URL, readable by anyone with the link and cached beyond
any later removal. That was decided knowingly; the reasoning and what follows from it are
recorded in the [data request](docs/DATA-REQUEST-COMMERCIAL.md). Sign-in is the single
change that would close it.

## Earlier draft history

Documents 00–09 preserve the context of the initial design. Where they conflict with v2,
v2 wins, and the original assumptions are not treated as verified environment results.

[00 Overview](docs/00-overview.md) · [01 Architecture](docs/01-architecture.md) ·
[02 Data model](docs/02-data-model.md) · [03 Outlook adapter](docs/03-outlook-adapter.md) ·
[04 Dataloy API](docs/04-dataloy-api.md) · [05 Reconciliation](docs/05-reconciliation.md) ·
[06 MCP tools](docs/06-mcp-tools.md) · [07 Dashboard](docs/07-dashboard.md) ·
[08 Roadmap](docs/08-roadmap.md) · [09 Open questions](docs/09-open-questions.md)
