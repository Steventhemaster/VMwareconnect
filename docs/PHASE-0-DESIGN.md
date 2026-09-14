# Phase 0 — Initial design and environment verification

Status: design in progress / awaiting real environment verification. Written 2026-09-14.
Design owner: Codex. Business semantics: the user or the operations staff. Access configuration: the relevant system administrators.
Design baseline: [ARCHITECTURE-V2.md](ARCHITECTURE-V2.md).

## User decisions — 2026-09-14

- The site, API and worker are deployed to DigitalOcean App Platform. The detailed configuration follows [the deployment design](DEPLOYMENT-DIGITALOCEAN.md).
- Codex owns the initial design, the Dataloy integration, the dashboard and the cloud deployment configuration.
- Claude has previously connected to VMware successfully (user-confirmed). If Codex cannot get access, Claude takes on verification of the VM collector. No work has been handed to Claude at this point.
- The user can supply a Dataloy API key when connection verification happens. No key has been received and no authentication has been verified yet. The base URL, the key delivery method and header, and the read scope are to be confirmed together.
- Access is via the desktop app (user-confirmed). Using a Computer Use runtime, Codex selected and activated a running VMware Horizon session and read the Outlook screen. That is not a verification of a new sign-in, of API/COM access, of continuous collection, or of cloud delivery.

## Goal and definition of done

For 3–5 vessels, confirm an approved Outlook report collection path and a Dataloy read contract, and settle the specification for a first implementation that runs from report through map, voyage comparison and evidence retrieval.
The repository design review and screen access to an existing VMware Horizon session with Outlook have been confirmed. Programmatic mail collection and the Dataloy API connection have not been verified.

Done means:

- At least one real mail collection path is confirmed, with its execution session, network and recovery conditions recorded.
- Against real Dataloy responses, the Operational scope, the voyage/vessel/port call keys, and the time and event semantics are confirmed.
- In anonymised report samples, position, ETA, SOF and working data are traceable to their fields and evidence.
- The screens, the data contract, the error handling and the test cases all use the same vocabulary and the same states.
- Unverified values are not implemented on a guess; they are left recorded together with the features they block.

## Verification record

| ID | What to verify | Current status | Evidence required | Impact on the design |
|---|---|---|---|---|
| E01 | VMware product, VM persistence, sign-in/logoff behaviour | Codex screen access to a Horizon desktop session confirmed / persistence and re-login unverified | Observation after reconnect and after logoff | Collector location and availability |
| E02 | Classic versus New Outlook, Exchange Online versus on-premises, shared mailboxes | Unverified | Client and mailbox details | Which of Graph/COM is viable |
| E03 | Approved Graph permissions or COM programmatic access | Unverified | A limited read verification result | Continuous collection method |
| E04 | Whether Dataloy and the mail API are reachable from the VM or an in-house server | Unverified | Per-source connection results | Single-network versus split-network deployment |
| E05 | Dataloy API version, authentication, resources, pagination | Key can be supplied / not received, not verified | Base URL, the authentication header contract, responses with secrets removed | Connector implementation |
| E06 | OPR, previous/next voyages, port call and event keys, and their time semantics | Unverified | Known business cases compared against the API | Matching and rule accuracy |
| E07 | Representative vessels, report folders, forms, attachments and reporting cycles | Unverified | 30–50 anonymised samples and their distribution | Parser and missing-report policy |
| E08 | Users, permission scopes, deployment location, raw content and model egress policy | App Platform decided / permissions and egress scope unverified | The organisation's applicable rules, plus the deployment account and region | Authentication, evidence retrieval, LLM path |
| E09 | Business-day timezone, brief time, grace periods | Unverified | Operations staff decision | Daily aggregation and alerting |
| E10 | Design review of the repository baseline commit | Complete | REVIEW-CLAUDE-DESIGN.md | v2 structure and fix priorities |

Credentials, real mail content, personal data and internal addresses are never recorded in this public repository. Real evidence is kept in an approved store; only anonymised results and verification status appear here.

## Initial deliverables

| Order | Task | Deliverable | Done criteria |
|---|---|---|---|
| 1 | Codex: choose a deployment path from the input conditions | Accessibility table and decision record | The chosen path and its fallback are stated |
| 2 | Codex: Dataloy field and event semantics specification | `docs/contracts/dataloy` contract | Grounded in real responses, with types, nullability, units and time semantics stated |
| 3 | Codex: report and observation contract | `docs/contracts/report` contract | Represents multiple events, corrections, duplicates and evidence locators |
| 4 | Codex: vessel/voyage/port call and review policy | Matching and rule specification | Auto-confirm, hold and not-comparable criteria are stated |
| 5 | Codex: detailed UI and API/MCP specification | Screen flows plus request/response examples | The map → vessel → difference → evidence flow is complete |
| 6 | Codex: minimum implementation scope and verification plan | Development items and golden cases | A definition of done for the 3–5 vessel vertical slice |

The contract paths above are planned deliverables. A contract that does not yet exist is never treated as implemented or as tenant-verified.

## Design that can proceed before environment access

- Firming up the domain model, state transitions, the internal issue lifecycle and the collection job contract.
- UI and API examples built on synthetic reports. Every example is labelled as synthetic.
- Defining the expected outcome for voyage transitions, delayed reports, duplicate SOFs, unknown timezones and partial collection failure.

## Scope of the first implementation

3–5 vessels, selected mailboxes and folders, and the validated major report forms.
The chain is: automatic collection → raw and version storage → position and ETA extraction → vessel/voyage attribution → Dataloy comparison → map, vessel table and evidence retrieval.
Dataloy stays read-only and only internal review actions are stored. Where the quantity semantics of SOF and working reports are unconfirmed, those fields stay pending review.
