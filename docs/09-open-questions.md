# 09. Open questions and items requiring verification

> **Draft history — not the current implementation baseline.** This document predates v2. The current baseline is [Architecture v2](ARCHITECTURE-V2.md), and v2 wins wherever they conflict. See also [the design review](REVIEW-CLAUDE-DESIGN.md) and [the Phase 0 verification record](PHASE-0-DESIGN.md).

This document states **where the design rests on hypothesis**.
It is updated as items are confirmed during implementation, and the corresponding design document is revised.

## A. Dataloy (confirm in Phase 0)

| # | Item | Why it matters | How to confirm |
|---|---|---|---|
| A1 | Tenant base URL and API version | The premise of every call | Contract documents / the administrator |
| A2 | OAuth2 or Basic, plus the token URL and audience | Which authentication branch to implement | Attempt to issue a token |
| A3 | The real `statusTypeCode` list | Whether hardcoding `OPR` is correct | Query the `VoyageStatus` resource |
| A4 | **Whether the Vessel Report module is enabled** | **The branch that can halve Phase 2** | Query `VesselReport` |
| A5 | Support for date-range filter operators (`LT`/`GT`) | Without them, filter client-side | Try the calls directly |
| A6 | The timezone of the date fields (UTC or local) | **Get this wrong and every ETA comparison is meaningless** | Compare against known values |
| A7 | `PortCall`'s ATA/ATD field names and whether they are used | The premise of rule R-007 | Check sample responses |
| A8 | Whether port coordinates are provided | If not, the UN/LOCODE dataset is required | Query the `Port` resource |
| A9 | Support for incremental queries ("voyages changed since") | Sync efficiency | Check the accounting integration guide |
| A10 | API rate limits | Determines the polling interval | Documentation / measurement |

**A6 is the most dangerous.** Guess the timezone wrong and the rule engine quietly produces
entirely wrong results. Settle it by comparing against the dates of a known real voyage.

## B. VMware / Outlook environment

| # | Item | Why it matters |
|---|---|---|
| B1 | VMware form (Horizon VDI / Workstation / vSphere) | File sharing and clipboard policy decide the Transport method |
| B2 | Whether programmatic Outlook access (COM) is permitted, and security prompts | **If not, the v1 default path is blocked** |
| B3 | Whether outbound `graph.microsoft.com` is allowed from the VM | Whether the Graph adapter is viable |
| B4 | Whether an Entra ID app registration with `Mail.Read` consent is possible, and how long it takes | The long-term path |
| B5 | The VM OS locale | The COM `Restrict` date format |
| B6 | Whether Python can be installed, and which version | On its own, a potential blocker |
| B7 | The VM-to-outside file transfer path (shared folder / mount / other) | The Transport implementation |
| B8 | Mail retention period | How far back historical data can go |

**If B2 and B6 are blocked, the design needs a full rethink.** They are the top Phase 0 items.

## C. Business data

| # | Item | Why it matters |
|---|---|---|
| C1 | Fleet size (number of vessels) | Performance and UI density |
| C2 | The folder structure reports arrive in, and whether rules exist | Collection scope |
| C3 | Who sends them (the vessel directly / the ship manager / via an agent) | Whether sender-based template matching is viable |
| C4 | How many report formats there are | Estimating the number of templates |
| C5 | The ratio of in-body to attached (xlsx/pdf) reports | Attachment parser priority |
| C6 | Report language (English only / mixed) | The parser label dictionary |
| C7 | The noon report reference time (ship's local noon / UTC noon) | Timezone handling |
| C8 | Number of users, and whether permission separation is needed | Whether authentication is required |

**Without C5, the Phase 2 schedule cannot be estimated.**
Measure it alongside the Phase 0 sample collection.

## D. Deployment and operations

| # | Item |
|---|---|
| D1 | Where the dashboard is hosted (personal PC / in-house server) |
| D2 | Whether external map tiles are reachable — if not, self-hosting is required |
| D3 | How credentials are stored (environment variables / OS credential store / corporate vault) |
| D4 | Whether the daily sync is run by a person or a scheduler |
| D5 | Whether an internal information-security review is required — this handles mail data, so checking in advance is advisable |

**D5 is a process question rather than a technical one, but it is safer to confirm before starting.**
This reads corporate mail programmatically and exports it, and many organisations require
prior approval for that under their information-security policy.

## E. Decisions deliberately deferred

| Item | Why deferred | When to revisit |
|---|---|---|
| Live AIS position feed | Paid, and unnecessary for a daily purpose | When minute-level tracking is required |
| Move to PostgreSQL | SQLite is sufficient at this scale | When concurrent users or data volume grow |
| Receiving webhooks | Hard to obtain an inbound endpoint | When an in-house server deployment is settled |
| Accurate route distance via `searoute-py` | An approximation is enough for v1; the dependency has a cost | Phase 5 |
| PDF attachment parsing | Frequency unknown | Depending on the C5 measurement |
| User authentication | User count and environment undecided | After C8 is confirmed |
