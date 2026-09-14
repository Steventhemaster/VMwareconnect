# 08. Implementation roadmap

> **Draft history — not the current implementation baseline.** This document predates v2. The current baseline is [Architecture v2](ARCHITECTURE-V2.md), and v2 wins wherever they conflict. See also [the design review](REVIEW-CLAUDE-DESIGN.md) and [the Phase 0 verification record](PHASE-0-DESIGN.md).

## Principle

**Verify the most uncertain thing first.**

In this project the most uncertain thing is not the code — it is the environment.

1. What shape is the Dataloy tenant actually in?
2. Is programmatic Outlook access permitted in the VM?
3. What do the real report emails look like?

Building an elaborate parser and rule engine before those three are answered is stacking code on
guesswork. Phase 0 has to come first.

---

## Phase 0 — Environment verification (minimal code, maximum importance)

**Goal: find out whether the design's premises hold.**

| Task | Deliverable | Criterion |
|---|---|---|
| Dataloy authentication succeeds | A token issuing script | Settle whether it is OAuth2 or Basic |
| Query OPR voyages | A sample `Voyage?filter=…(EQ)OPR` response | Confirm the real status code values |
| Query PortCall + eventLogs | Sample responses | Confirm field names, timezones, and whether ATA/ATD exist |
| Check the Vessel Report module | Whether it exists, plus recent record counts | **The strategy branch point** (doc 04 §3) |
| Dump the Vessel master | Vessel list | Understand the matching scale |
| Outlook COM access in the VM | A minimal script | Whether security prompts appear |
| Observe the mailbox structure | Folder list, sender statistics | Settle the collection scope |
| Collect report samples | **20–30 anonymised samples** | The real basis for the parser design |
| VM-to-outside file transfer path | A working check | Settle the Transport implementation |

**The design documents are revised on the results of Phase 0.** The facts found here replace the
hypotheses in docs 03 and 04.

Code produced: a minimal `dataloy/client.py` and an `outlook/adapter_com.py` spike.
Written with the expectation of throwing them away.

---

## Phase 1 — Collection pipeline

**Goal: raw content arrives reliably and is retained.**

- `core/store.py` plus schema migrations
- A proper `outlook/adapter_com.py` (locale-safe Restrict, `PR_INTERNET_MESSAGE_ID` extraction)
- `outlook-mcp` server: `list_folders` / `search` / `get_message` / `sync`
- `dataloy/client.py` plus `sync_operational()` and `raw_json` retention
- `dataloy-mcp` server: the full read tool set

**Exit criterion**: asked in the VM for "show me yesterday's reports", Claude returns a header list,
and from outside it returns the OPR voyage list.

---

## Phase 2 — Normalisation

**Goal: a mail becomes a `VesselReport`.**

- `core/geo.py` coordinate parser plus physical plausibility checks
- `core/timeutil.py` LT/UTC conversion and longitude-based tz estimation
- `parsing/generic.py` generic label scanner (L2)
- `parsing/registry.py` plus 3–5 templates built from the Phase 0 samples (L1)
- `parsing/attachments.py` label-lookup xlsx parser
- `parsing/llm.py` plus the `outlook_save_report` validation path (L3)

**Exit criterion**: on the 20–30 Phase 0 samples, **parsing coverage ≥ 80%** and
zero coordinate mis-parses (the plausibility checks catch them all).

Tests use the real samples in `tests/fixtures/emails/` as fixed inputs.
Testing only against synthetic samples collapses in the field.

---

## Phase 3 — Matching and comparison

**Goal: be able to answer "does this line up with Dataloy?"**

- `reconcile/matcher.py` vessel, voyage and port call attribution
- `reconcile/rules.py` R-001 to R-010
- `reconcile/engine.py` plus `fingerprint` deduplication
- `fleet-mcp` server plus `fleet/service.py`
- `fleet_timeline` three-column comparison output

**Exit criterion**: running the rules against real data produces
**no CRITICAL false positives.** If any appear, turn the rule off or raise the threshold.
Fix the false-positive rate before the detection rate.

---

## Phase 4 — Dashboard

**Goal: five minutes in the morning.**

- `dashboard/api.py` FastAPI
- The map screen (MapLibre; markers, tracks, freshness)
- The vessel list plus the needs-action panel
- The four vessel detail tabs
- Acknowledge/ignore handling for discrepancies

**Exit criterion**: a real operator uses it for a day and says it took less time
than their existing manual check.

---

## Phase 5 — Operational hardening

- The L3→L1 template promotion learning loop
- Automatic daily brief generation and distribution (mail/messenger)
- Rules R-011 to R-014
- Accurate route distance via `searoute-py`
- Operational metrics: parsing coverage over time, detection versus dismissal ratio per rule

That last metric matters. **A rule with a high dismissal rate is a false-positive rule**,
so tune it on the data.

---

## Phase 6 (separate approval required) — Writing to Dataloy

Feed the parsed results back into Dataloy through the Vessel Report API.

Preconditions:
- The Phase 2 parsing accuracy is sufficiently verified
- **A human approval gate** — no automatic sending. Propose → confirm → send
- A full audit log of every transmission
- A defined rollback procedure

This phase affects real business records, so it starts only after separate approval.

---

## On scheduling

How long each phase takes depends heavily on the Phase 0 results.
In particular, **whether the Vessel Report module is in use** can halve the size of Phase 2.
So no overall schedule is estimated before Phase 0 completes.
