# Implementation brief for handing work to Claude Code

## Requested daily Outlook task — 10:00 Dubai

The source mailbox is `operation@safeen-invictus.com` (including its report folders/subfolders, excluding other mailboxes). The user requested a once-daily collection of the preceding 24 hours of Noon, Arrival, Departure and Working reports for the Dataloy Operational fleet, including Voyage and TC Out. Use [the current automation specification](CLAUDE-OUTLOOK-DAILY-AUTOMATION.md) and [the ready-to-paste task prompt](CLAUDE-OUTLOOK-TASK-PROMPT.md). These define the requested handoff; they do not mean a task has already been registered in Claude. This specific request supersedes the conditional handoff wording below for daily report collection.

> The initial design is currently owned by Codex. This document is the brief to use if implementation is later handed to Claude Code. It does not delegate any work automatically.

## If VMware access verification is handed over

The user confirmed that Claude has connected to VMware before. If Codex cannot get access, Claude takes on the limited scope below. The site, API and worker remain on DigitalOcean App Platform, and Codex continues to own the overall design and the cloud side.

- Confirm the actual access method, Classic versus New Outlook, the mailbox and folder structure, and what is readable.
- Verify whether report collection is possible over Graph or COM. Keep "the UI is reachable" and "reports can be collected programmatically and continuously" as two different findings.
- Confirm what collection and spool recovery look like after logoff, reconnection and a VM reset.
- Confirm whether HTTPS upload from the VM to the designated App Platform ingestion URL is possible. The URL is provided after deployment; do not invent one now.
- Record anonymised noon/port/working/SOF samples with their per-field times, units and event semantics.
- Report results with success/failure, reproduction steps and remaining constraints. Real mail content and credentials never go to GitHub.

The transfer contract follows [the DigitalOcean deployment design](DEPLOYMENT-DIGITALOCEAN.md). This section describes the scope to hand over if the condition is met; it does not mean the work has already been requested of Claude.

## If the full implementation is handed over

Hand over the brief below together with `ARCHITECTURE-V2.md` and `REVIEW-CLAUDE-DESIGN.md`.

---

Revise the existing `docs/00`–`09` design of VMwareconnect to match the attached v2 structure. The review baseline is commit `49f760dde3326067fe2cde5ca8f6c5f7ccf868c2`, so if the current branch has changes after it, check the difference first and identify which changes to keep.

The goal is a dashboard that automatically collects noon/port/working/SOF reports from the Outlook mailbox reachable through VMware, based on Dataloy Operational voyages, and shows each vessel's latest reported position, working state and the differences against Dataloy, with the evidence attached.

Core requirements:

1. Run automatic collection, parsing and comparison from a scheduler and a durable job queue, with no dependency on whether a Claude/MCP conversation is happening. Have the web API and MCP use the same Application Service.
2. Verify Graph availability for mail access first, and select COM only conditionally, inside a Classic Outlook user session. Do not settle the connectivity between VMware, the mail network and Dataloy by assumption.
3. Separate the raw email, the document, the report revision, the per-field observation and the multiple operational events. Preserve several events in one SOF, along with corrections, forwards, duplicates and late reports.
4. Distinguish ship's time, port time and UTC per field. Do not settle a timezone from longitude alone, and hold unconfirmed times out of time comparisons.
5. OPR is the managed set shown on screen. Include the previous and next voyages among matching candidates, and never auto-attribute just because there is a single OPR voyage. Send ambiguous vessel, voyage and port call candidates to the review queue.
6. Keep Dataloy plan/forecast, Dataloy recorded actual and the vessel report separately. Do not merge ARRIVAL/EOSP, DEPARTURE/COSP or NOR tendered/accepted without confirming their semantics.
7. Distinguish source sync failure, partial queries and a parsing backlog from a genuinely missing report or a genuine Dataloy gap. Never display not-comparable, in-grace or insufficient-data as normal.
8. Show on the map the last reported position, with its observation time and source. Do not present it as a real-time position while there is no AIS. Keep unevidenced estimated ETA, drifting and laden states off by default or as UNKNOWN.
9. Distinguish acknowledged, resolved, held and recurring review issues, and keep the evidence and evaluation history. Include sign-in, per-fleet permissions and raw content access control in v1 for a shared deployment.
10. Keep Dataloy read-only and keep raw content and credentials out of Git. Draw a clear line between changing an internal review record and changing an external system.

In the first step, verify the real environment's accessibility, the Dataloy API field and event contract, and an anonymised set of representative mail samples. Where access details are missing, record them as unverified and do not claim a successful connection. Designing the domain contracts and the test fixtures may proceed.

Next, implement the minimal vertical slice — automatic collection → position/ETA → comparison → raw evidence — for 3–5 vessels. Then extend in this order: SOF and cargo progress, correction and delay handling, the review lifecycle, and the team dashboard. Do not leave all the original documents in place and add a conflicting design alongside them; reconcile each document's decisions and unverified items consistently.

In the completion report, separate the environment actually verified, the files changed, the scenarios passed and the remaining unverified assumptions. Do not claim accuracy from "high coverage" alone — report the errors and the missed cases in vessel, coordinate, time and event matching too.
