# VMwareconnect — Fleet Operations MCP Dashboard

A system that builds the fleet from Dataloy Operational voyages, collects vessel reports from
Outlook, and shows each vessel's **latest reported position, schedule, working state and the
differences against Dataloy** — always with the evidence attached.

## Current status

[Open the review dashboard](https://fleet-operations-review-beg9z.ondigitalocean.app/) — a **synthetic-data demo** deployed to DigitalOcean App Platform.

**Architecture v2 and a review web dashboard are in place.** Codex owns the initial design and the web implementation. Run it with `npm ci` then `npm run dev`; verify with `npm test` and `npm run build`. [The review site scope](docs/REVIEW-SITE.md) records the screens and what remains before live data.
The current baseline document is [ARCHITECTURE-V2.md](docs/ARCHITECTURE-V2.md).
Programmatic Outlook collection and the Dataloy API connection and field semantics are not yet verified.

The deployment target is confirmed as **DigitalOcean App Platform**. Codex owns the design, the cloud backend and the dashboard; if Codex cannot reach VMware, Claude takes on in-VM collection verification. The user confirmed Claude's prior successful VMware access.

2026-09-14: Codex also confirmed access to a running VMware Horizon desktop session and the Outlook screen. Continuous automated collection over Graph/COM, and cloud delivery, remain separate verification items.

All repository content is written in English. Earlier Korean versions of these documents remain in the git history.

## Current design documents

| Document | Contents |
|---|---|
| [Architecture v2](docs/ARCHITECTURE-V2.md) | Structure, data model, collection and comparison, screens, API/MCP, operations and exit criteria |
| [Design review](docs/REVIEW-CLAUDE-DESIGN.md) | Problems found per original document, with the rationale for each fix |
| [Phase 0 initial design](docs/PHASE-0-DESIGN.md) | Scope, real-environment verification record, detailed deliverables and done criteria |
| [DigitalOcean deployment design](docs/DEPLOYMENT-DIGITALOCEAN.md) | App Platform components, VM collection link, durable storage, secrets and deployment criteria |
| [Claude implementation brief](docs/CLAUDE-HANDOFF.md) | The brief to use if implementation is later handed to Claude Code |

## Key decisions

- Automatic collection and rule comparison run from a scheduler/worker; MCP and the web share one service.
- Vessel reports, Dataloy plan/forecast and Dataloy recorded actuals are each kept and compared separately.
- Report corrections, duplicates, delays, multiple SOF events and per-field source evidence are preserved.
- Where the timezone, voyage or port call is unclear, the review is held, and a collection failure is never judged as a vessel failing to report.
- The map shows the last reported position with its as-of time, and Dataloy stays read-only.

## Earlier draft history

Documents 00–09 below preserve the context of the initial design.
Where they conflict with v2, v2 wins, and the original assumptions are not treated as verified environment results.

| Document | Contents |
|---|---|
| [00-overview.md](docs/00-overview.md) | Problem definition, scope, vocabulary, success criteria |
| [01-architecture.md](docs/01-architecture.md) | Overall architecture, deployment topology, trust boundary |
| [02-data-model.md](docs/02-data-model.md) | Normalised schema, storage schema |
| [03-outlook-adapter.md](docs/03-outlook-adapter.md) | Outlook access methods, report parsing strategy |
| [04-dataloy-api.md](docs/04-dataloy-api.md) | Dataloy REST API integration |
| [05-reconciliation.md](docs/05-reconciliation.md) | Vessel and voyage matching, discrepancy detection rules |
| [06-mcp-tools.md](docs/06-mcp-tools.md) | MCP servers and tool specification |
| [07-dashboard.md](docs/07-dashboard.md) | Dashboard UI/UX design |
| [08-roadmap.md](docs/08-roadmap.md) | Phased implementation plan |
| [09-open-questions.md](docs/09-open-questions.md) | Open questions and items requiring verification |
