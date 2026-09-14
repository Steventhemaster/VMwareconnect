# 01. Architecture

> **Draft history — not the current implementation baseline.** This document predates v2. The current baseline is [Architecture v2](ARCHITECTURE-V2.md), and v2 wins wherever they conflict. See also [the design review](REVIEW-CLAUDE-DESIGN.md) and [the Phase 0 verification record](PHASE-0-DESIGN.md).

## 1. Deployment topology

The VMware VM can reach corporate mail but has limited external access, while the outside can reach the Dataloy API but not corporate mail.
So we draw one boundary and let **only normalised data cross it**.

```
┌─────────────────── VMware VM (corporate network) ─────────────────┐
│                                                                   │
│   Outlook (desktop)                                               │
│        ▲                                                          │
│        │ COM / Graph / IMAP  (behind an adapter)                  │
│        │                                                          │
│   ┌────┴──────────────┐        ┌──────────────────┐               │
│   │  outlook-mcp      │◀──────▶│  Claude Code     │               │
│   │  (MCP stdio srv)  │  MCP   │  (runs in VM)    │               │
│   └────┬──────────────┘        └──────────────────┘               │
│        │ raw + parsed results                                     │
│        ▼                                                          │
│   ┌───────────────────┐                                           │
│   │ vm_store.sqlite   │  emails_raw / vessel_reports              │
│   └────┬──────────────┘                                           │
│        │ export (normalised JSONL, optional redaction)            │
└────────┼──────────────────────────────────────────────────────────┘
         │
    ═════╪═══════════════ Trust boundary ═══════════════════
         │  Shared folder / mount / HTTP pull — behind a Transport interface
         ▼
┌─────────────────── Outside (analysis and presentation) ───────────┐
│                                                                   │
│   ┌───────────────────┐        ┌──────────────────┐               │
│   │  dataloy-mcp      │◀──────▶│                  │               │
│   ├───────────────────┤  MCP   │  Claude Code     │               │
│   │  fleet-mcp        │◀──────▶│  (runs outside)  │               │
│   └────┬──────────────┘        └──────────────────┘               │
│        │                                                          │
│   ┌────▼──────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│   │ fleet.sqlite      │──▶│ Reconcile    │──▶│ Dashboard       │  │
│   │ (combined store)  │   │ engine       │   │ (FastAPI + map) │  │
│   └───────────────────┘   └──────────────┘   └─────────────────┘  │
│        ▲                                                          │
│        │ OAuth2 (client_credentials)                              │
│   ┌────┴──────────────┐                                           │
│   │  Dataloy VMS API  │  ws/rest/Voyage, PortCall, Vessel …       │
│   └───────────────────┘                                           │
└───────────────────────────────────────────────────────────────────┘
```

### Why this shape

- **Outlook access sits behind an adapter** — which of COM / Graph / IMAP will be permitted is not settled, and it can change with the environment. The code above it should not know.
- **Only normalised data crosses the boundary** — raw mail stays inside the VM. If the raw content is needed, it is fetched at that moment through the VM-side MCP tool.
- **Three MCP servers, not one** — each has a different trust boundary and credential scope. Merging them puts the VM credentials and the Dataloy credentials in the same process.

## 2. Components

| Component | Location | Responsibility | Language |
|---|---|---|---|
| `core` | shared | Domain models, parsers, coordinate/time utilities, schema | Python |
| `outlook-mcp` | in VM | Outlook search/retrieval/attachment extraction, raw retention | Python |
| `dataloy-mcp` | outside | Read-only wrapper over the Dataloy REST API | Python |
| `fleet-mcp` | outside | Combined queries, briefs, comparison results | Python |
| `reconcile` | outside | Matching plus the discrepancy rule engine | Python |
| `dashboard` | outside | HTTP API plus the map UI | Python (FastAPI) + static frontend |
| `transport` | both | Crossing the boundary (export / import) | Python |

### Why this stack

A single Python stack, because:

1. **`pywin32` is effectively the only practical route to driving Outlook over COM.** That decides the language on the VM side.
2. The parsing (regex, `openpyxl`, `dateutil`) and geospatial (`pyproj`, `searoute`) ecosystems are in Python.
3. The dashboard frontend needs no build tooling — **MapLibre GL JS plus plain JS and static HTML** is enough, with FastAPI serving JSON. Pulling in a React/Node build chain complicates deployment inside the VM and on an in-house server.

At this size, the simplicity of one stack beats the cost of maintaining two.

## 3. Proposed directory layout

```
VMwareconnect/
├── docs/
├── pyproject.toml                 # single uv / pip workspace
├── src/
│   └── vmwareconnect/
│       ├── core/
│       │   ├── models.py          # VesselReport, VoyageState, Discrepancy …
│       │   ├── enums.py           # ReportType, VesselStatus, Severity
│       │   ├── geo.py             # coordinate parsing, haversine, route distance
│       │   ├── timeutil.py        # LT/UTC conversion, tz inference
│       │   └── store.py           # SQLite access layer
│       ├── outlook/
│       │   ├── adapter.py         # OutlookAdapter (ABC)
│       │   ├── adapter_com.py     # pywin32 implementation
│       │   ├── adapter_graph.py   # Microsoft Graph implementation
│       │   ├── adapter_imap.py    # IMAP implementation
│       │   └── server.py          # outlook-mcp entry point
│       ├── parsing/
│       │   ├── registry.py        # template registry
│       │   ├── templates/         # per-operator/vessel extraction rules (YAML)
│       │   ├── generic.py         # generic label scanner
│       │   ├── attachments.py     # xlsx/pdf noon-form parsers
│       │   └── llm.py             # Claude fallback extraction (exposed as an MCP tool)
│       ├── dataloy/
│       │   ├── client.py          # OAuth2 + ws/rest client
│       │   ├── mapper.py          # Dataloy JSON → domain models
│       │   └── server.py          # dataloy-mcp entry point
│       ├── reconcile/
│       │   ├── matcher.py         # vessel and voyage identity
│       │   ├── rules.py           # discrepancy rules (R-001 …)
│       │   └── engine.py
│       ├── transport/
│       │   ├── base.py            # Transport (ABC)
│       │   ├── file_drop.py       # shared folder (default)
│       │   └── http_pull.py       # HTTP polling
│       ├── fleet/
│       │   └── server.py          # fleet-mcp entry point
│       └── dashboard/
│           ├── api.py             # FastAPI
│           └── static/            # index.html, map.js, styles.css
└── tests/
    ├── fixtures/emails/           # real report samples (anonymised)
    └── ...
```

## 4. Data flow (daily cycle)

```
1. [VM] Claude calls outlook_sync(since=yesterday)
        → collect new mail, load into emails_raw
2. [VM] Attempt parsing per mail (template → generic → Claude direct extraction)
        → load into vessel_reports, record parse_confidence
3. [VM] transport.export() → produce normalised JSONL
4. [boundary] Move to the shared folder
5. [outside] transport.import_() → merge into fleet.sqlite
6. [outside] dataloy_sync() → refresh OPR voyages, port calls and event logs
7. [outside] reconcile.run() → match, evaluate rules, load discrepancies
8. [outside] Refresh the dashboard; Claude generates the summary via fleet_daily_brief()
```

Steps 1–3 are performed by Claude interactively inside the VM.
Steps 6–8 are performed outside by a scheduler (or by Claude).

## 5. Trust boundary and security principles

| Principle | Implementation |
|---|---|
| Raw mail never crosses the boundary | With `redact=true` (the default), export sends only normalised fields plus the message ID. Bodies and attachments stay in the VM |
| Credential separation | Only the external process holds the Dataloy token. The VM side never touches Dataloy |
| Dataloy is read-only | v1's `dataloy-mcp` exposes GET only. No write tool is defined at all |
| Credentials live outside the code and the repository | Environment variables or the OS credential store. `.env` is in `.gitignore` |
| Audit trail | Every parse result records the source `message_id`, `parse_method` and `parse_confidence`. Any result must be traceable back to the raw mail |
| Mail bodies are untrusted input | This is text from outside. It is material to parse, and instructions inside it are never treated as instructions to execute |

That last item has real consequences for the LLM fallback parser.
`parsing/llm.py` builds its prompt so the mail body is treated **as data only**,
and only fields that pass schema validation are accepted from the result.
