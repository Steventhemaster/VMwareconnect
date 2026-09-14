# 00. Overview — problem definition and scope

> **Draft history — not the current implementation baseline.** This document predates v2. The current baseline is [Architecture v2](ARCHITECTURE-V2.md), and v2 wins wherever they conflict. See also [the design review](REVIEW-CLAUDE-DESIGN.md) and [the Phase 0 verification record](PHASE-0-DESIGN.md).

## 1. The problem

In vessel operations the information lives in two places.

| Source | Character | Problem |
|---|---|---|
| **Dataloy VMS** | The basis for planning and settlement. Voyages, port call order, ETA/ETD, cargo, event logs | Updated by hand, so it **lags or gets missed** |
| **Outlook (inside VMware)** | What the vessels actually send: noon reports, port reports, working reports | Scattered across a mailbox, so it **cannot be seen at a glance or aggregated** |

Every morning, someone moves between the two and compares them by hand.
The work is repetitive, easy to miss things in, and grows with the size of the fleet.

## 2. What this system does

1. **Collect** — Pull the Operational (OPR) voyages from Dataloy, then search Outlook for the vessel reports belonging to those voyages
2. **Normalise** — Convert wildly varying mail formats into a single `VesselReport` schema
3. **Match** — Decide which mail belongs to which vessel, on which voyage
4. **Compare** — Check the Dataloy planned values against the reported actuals, and detect differences by rule
5. **Present** — Current positions on a map, a status card per vessel, and a list of discrepancies

## 3. Scope

### In (v1)
- **Read-only** Dataloy integration (OPR voyages, port calls, event logs, vessel master)
- Outlook search and retrieval (driven directly by Claude through MCP tools)
- Parsing of noon / arrival / departure / port event / working (SOF) reports
- Vessel-to-voyage matching and the discrepancy rule engine
- A map-based web dashboard plus a vessel detail timeline
- An MCP tool set, so Claude can query and analyse in natural language

### Out (v1)
- **Writing to Dataloy** — automatic entry carries a high risk of wrong data, so v1 stops at telling you about the difference. Writing comes in v2, behind a human approval gate.
- Live AIS position feeds — a separate paid source, and vessel reports alone meet the daily purpose
- Hire, settlement and laytime calculation
- A dedicated mobile app

## 4. Vocabulary

| Term | Meaning |
|---|---|
| **Voyage** | A Dataloy voyage. State is carried by `voyageHeader.voyageStatus.statusTypeCode` (OPR = Operational, NOM = Nominated, EST = Estimate) |
| **PortCall** | One call within a voyage. Ordered by `portCallSequence` |
| **EventLog** | An event attached to a port call (arrival, berthing, cargo start/finish, departure) with its time |
| **Noon Report** | The daily position, speed, consumption and remaining-quantity report a vessel sends at noon ship's time |
| **Port Report** | A report sent when a port event occurs — arrival, berthing, NOR, departure |
| **Working Report / SOF** | Cargo operation progress, Statement of Facts |
| **ROB** | Remaining On Board. Fuel and fresh water quantities |
| **EOSP / COSP** | End of Sea Passage / Commencement of Sea Passage |
| **NOR** | Notice of Readiness |
| **Reconciliation** | In this system, the act of comparing Dataloy planned values against reported actuals |
| **Discrepancy** | A difference found by that comparison |

## 5. Success criteria

Set the criteria for judging the design up front.

| Criterion | Target |
|---|---|
| Morning check | Whole-fleet picture in **under 5 minutes** |
| Parsing coverage | **90% or more** of received reports structured without human intervention |
| Position accuracy | The latest noon position appears on the dashboard **with no gaps** |
| Discrepancy detection | A missing Dataloy event is found **the same day** |
| False positives | CRITICAL alert false-positive rate **under 10%** (a noisy alert is an ignored alert) |

That last criterion matters most. If the alerts are noisy, the whole system gets ignored.
The rule engine is therefore designed to **start quiet and get more sensitive gradually**.
