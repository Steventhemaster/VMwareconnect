# Design review of the initial VMwareconnect design

Reviewed 2026-09-14. Baseline branch: `claude/eager-goodall-zoaen3`.
Baseline commit: `49f760dde3326067fe2cde5ca8f6c5f7ccf868c2`.

The README and all of `docs/00`–`09` on GitHub were reviewed. The baseline commit contains no executable code or tests, so what follows is a **design review, not a list of implementation defects**. It is not the result of connecting to the real VMware environment, mailbox or Dataloy tenant.

Source: [the reviewed docs directory](https://github.com/Steventhemaster/VMwareconnect/tree/49f760dde3326067fe2cde5ca8f6c5f7ccf868c2/docs).
Replacement design: [ARCHITECTURE-V2.md](ARCHITECTURE-V2.md).

## Decisions worth keeping

The Outlook adapter abstraction, raw content retention, deterministic parsers first, the unmatched queue, read-only Dataloy, a shared service layer behind API and MCP, an action-list-first UI, position freshness display, date line handling, and a roadmap that verifies the environment first are all kept. The original already has these, so they are not re-proposed here as new.

## Must fix

| Priority | Source in the original | Problem and a concrete failure | Redesign decision |
|---|---|---|---|
| P0 | 01 §4, 03 §1.3, 06 §3 | Daily collection depends on Claude being called interactively inside the VM. With no conversation, the next day's data stops. | A scheduler, a durable job queue and checkpoints run collection. MCP is a query and management interface onto the same service. |
| P0 | 01 §1, 09 B/D | The topology — VM on the corporate network, Dataloy reachable only from outside — is an unverified premise. | Write the accessibility table first. Prefer an in-house execution location that reaches both sources, and split the boundary only where it is actually required. |
| P0 | 03 §1.2 | COM is chosen as the v1 default without covering Classic versus New Outlook, non-persistent VDI, and recovery after logoff. | Verify Graph availability first. COM is a conditional path tied to a Classic Outlook user session. Unattended server execution is not assumed. |
| P0 | 02 §2.1–2.2 | A single `port_event` per email, and ARRIVAL treated as EOSP, DEPARTURE as COSP. One SOF carrying several events loses data or mis-compares. | Many-to-many from mail → document → report → observation/event. ARRIVAL, EOSP, COSP and DEPARTURE are each preserved and compared through a tenant semantics dictionary. |
| P0 | 03 §2.5, 08 Phase 2 | A longitude/15 timezone estimate can enter a UTC comparison. Where ship's time and arrival-port time differ, the ETA rule produces false positives. | Store the time basis per field. Hold the comparison where the timezone is unconfirmed. A longitude estimate is never promoted to an official time. |
| P0 | 05 §2–3 | A single OPR voyage settles attribution, and a 50nm port proximity estimates the call. A delayed report from the previous voyage, or a neighbouring port, can be wired to the wrong record. | OPR is the display set. Matching candidates include the previous and next voyages. Time, voyage number and port call context are verified together, and an ambiguous candidate is held. |
| P0 | 00 §1, 06 §5, 07 §4 | Dataloy is described throughout as "the plan", but ATA/ATD and fixed events may carry actual semantics. The mere existence of an ETD is displayed as a missing actual. | Separate Dataloy plan/forecast, Dataloy recorded actual, and the vessel report. No missing-actual verdict without evidence the event occurred and without a grace period. |
| P0 | 04 §3 | Where Dataloy Vessel Report is in use, email is reduced to a gap-filler. That weakens the whole point of comparing the same report against Dataloy. | Collect and compare email and Dataloy independently, and never count two values with the same lineage as independent evidence. |
| P0 | 04 §6, 05 R-002/003/006 | Data missed because of a partial sync or a logoff can look like "missing event" or "vessel did not report". | Per-source coverage and successful checkpoints are preconditions of evaluation. An outage is SOURCE_UNAVAILABLE; a lack of information is INSUFFICIENT_DATA. |
| P1 | 02 SQL sync_state | With `adapter` alone as the primary key, per-folder cursors for the same adapter cannot be kept. | Identify by connector + mailbox/store + folder + query_version. |
| P1 | 02 SQL emails_raw | A global UNIQUE on Internet Message-ID plus a movable message_id as primary key cannot express copy, forward and edit relationships. | Separate source location identity, content version and logical report duplication into their own layers. |
| P1 | 03 §2.7 | Parse caching on message_id alone freezes old results after parser or attachment changes. The 0.8 LLM cap also does not line up with the 0.7 CRITICAL gate. | Cache on content hash plus parser/schema/prompt version. Use per-field validation state and measured evaluation. |
| P1 | 02 §3, 05 §6 | A changing core-value hash spawns a new alert, and `ignored` lasts forever. Acknowledged and resolved are also conflated. | A stable problem identifier plus an evaluation history. ACK means unresolved; suppression carries a scope and an expiry; only re-evaluation resolves. |
| P1 | 02 §4, 01 §5 | A JSONL count alone cannot handle transfer completion, integrity, resend, correction ordering or acknowledgement. | An authenticated batch manifest with hashes, an atomic completion marker, an idempotent inbox/outbox, and queue cleanup after ACK. |
| P1 | 05 §4–5 | DRIFTING from low speed alone, LADEN/BALLAST from call purpose alone. A great-circle × 1.15 ETA is badly wrong on some routes. | Separate navigation, cargo and activity state. UNKNOWN where there is no evidence. The v1 computed ETA is off by default. |
| P1 | 05 R-004 | Comparing ROB from two different times at a 5% threshold flags normal consumption. | Compare only at the same event, fuel grade, unit and observation time, with a near-zero absolute tolerance included. |
| P1 | 07 §1/4, 09 E | The stated goal is one-click evidence, but in practice it means asking another Claude session. Authentication is also deferred. | Fix where raw content can be opened at design time. For a shared deployment, authentication and fleet-scoped permissions are v1 requirements. |

## Corrections available from public documentation

- Original 04 §2.1 leaves GT/LT and similar operators as unverified, but the official Filtering documentation includes GT/GTE/LT/LTE and date-change query examples. The exact tenant fields and whether child changes propagate are still to be verified. [Dataloy Filtering](https://api.dataloy.com/dataloy-rest-api/filtering)
- The overview in the official Vessel Report guide refers to `PositionReport`. The original's `VesselReport` resource name and payload must not be used as a settled contract. The current tenant's API version and readable resources need checking. [Vessel Report documentation entry](https://api.dataloy.com/user-guides/vessel-report)
- The Dataloy Schedule API covers `isDateFixed` on EventLog. That is evidence that a date field name alone cannot determine plan versus actual — and it does not by itself settle actual semantics for every event either. [Schedule API](https://api.dataloy.com/user-guides/schedule-api)
- Graph mail delta is tracked per folder, following nextLink to the end before storing the deltaLink. General search and incremental sync are not the same capability. [Graph delta](https://learn.microsoft.com/en-us/graph/delta-query-messages)
- Graph ImmutableId is likewise stable within the same mailbox scope; archive moves and re-imports are the exceptions. [Immutable identifiers](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)
- Microsoft does not support using the Outlook Object Model from a Windows Service and states the limits of unattended, non-interactive Office automation. New Outlook does not support COM add-ins. COM execution conditions therefore need their own empirical verification. [Selecting an Outlook API](https://learn.microsoft.com/en-us/office/client-developer/outlook/selecting-an-api-or-technology-for-developing-solutions-for-outlook), [Unattended Office automation](https://learn.microsoft.com/en-us/office/client-developer/integration/considerations-unattended-automation-office-microsoft-365-for-unattended-rpa), [New Outlook extensibility](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/one-outlook)

## Verdict

The original is a useful starting point for a PoC design. Before production it needs **collection durability, the semantics of time, voyage and event, partial-failure handling, and correction history** strengthened first. Not manufacturing a wrong "normal / missing / current position" matters more than adding components.
