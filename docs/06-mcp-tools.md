# 06. MCP servers and tool specification

> **Draft history — not the current implementation baseline.** This document predates v2. The current baseline is [Architecture v2](ARCHITECTURE-V2.md), and v2 wins wherever they conflict. See also [the design review](REVIEW-CLAUDE-DESIGN.md) and [the Phase 0 verification record](PHASE-0-DESIGN.md).

## 1. Why three servers

| Server | Runs | Credentials held | Reason |
|---|---|---|---|
| `outlook-mcp` | in the VM | The user's Outlook session | Corporate mail access. Must know nothing about Dataloy |
| `dataloy-mcp` | outside | Dataloy OAuth2 M2M | Needs external network. Must know nothing about corporate mail |
| `fleet-mcp` | outside | None (local DB only) | Combined queries and analysis over already-collected data |

Merging them puts both credentials in one process and gives the in-VM server external-network code.
Keep them separate.

## 2. Tool design principles

Claude calls these tools **conversationally**. Therefore:

- **Keep responses small.** List tools return headers/summaries only; bodies come from a separate tool. Returning 50 mail bodies at once exhausts the context.
- **Conservative default `limit`.** Default 25–50, with the maximum stated.
- **Be honest about partial failure.** If some pages fail, return what succeeded together with `warnings`. Never quietly return an empty array.
- **No write tools (v1).** A tool that does not exist cannot be called wrongly.
- **State units in the tool description.** `speed_kn` (knots), `distance_nm` (nautical miles), times as ISO8601 UTC.

## 3. `outlook-mcp` (in the VM)

| Tool | Arguments | Returns |
|---|---|---|
| `outlook_list_folders` | — | Folder list (name, path, item count) |
| `outlook_search` | `since`, `until?`, `folder?`, `query?`, `sender?`, `limit=50` | Mail **headers** (message_id, subject, sender, received_at, has_attachments) |
| `outlook_get_message` | `message_id`, `include_html=false` | Body text, headers, attachment metadata |
| `outlook_get_attachment_text` | `message_id`, `attachment_id` | Text/tables extracted from the attachment (per-sheet cell values for xlsx). **Never returns raw binary** |
| `outlook_sync` | `since`, `folder?` | A collection summary (N new, M duplicate) — raw content is loaded into `vm_store.sqlite` |
| `outlook_parse_pending` | `limit=20` | Applies the L1/L2 parsers to unparsed mail and returns a result summary |
| `outlook_unparsed` | `limit=20` | Failed and low-confidence mail (Claude reads these directly and handles them at L3) |
| `outlook_save_report` | `report` (VesselReport JSON) | Validates and stores what Claude extracted. Accepted only if it passes the schema and physical plausibility checks |
| `outlook_export` | `since`, `redact=true` | Produces the boundary JSONL and returns the path |

### Claude's typical working flow

```
outlook_sync(since="2026-09-13")
  → 47 new
outlook_parse_pending()
  → 41 parsed automatically, 6 failed
outlook_unparsed()
  → the 6
outlook_get_message(id) × 6      ← Claude reads them itself
outlook_save_report(...) × 6     ← Claude extracts and stores
outlook_export(since="2026-09-13")
  → /shared/export_20260914.jsonl
```

`outlook_save_report` is where "Claude drives it directly" is implemented in this design.
Claude plays the fourth parser layer itself, but **deterministic validation runs before storage**,
so a wrong value does not go straight in.

## 4. `dataloy-mcp` (outside, read-only)

| Tool | Arguments | Returns |
|---|---|---|
| `dataloy_list_operational_voyages` | `vessel?`, `limit=100` | OPR voyage list (voyage_key, voyage_no, vessel, period) |
| `dataloy_get_voyage` | `voyage_key` | Voyage detail plus a port call summary |
| `dataloy_list_port_calls` | `voyage_key` | Port call sequence (order, port, ETA/ETD/ATA/ATD, reasonForCall) |
| `dataloy_get_event_logs` | `port_call_key` | Event logs plus the linked ROBs |
| `dataloy_find_vessel` | `name?`, `imo?` | Vessel master lookup |
| `dataloy_list_vessel_reports` | `vessel?`, `since?` | Vessel reports already registered in Dataloy (where present) |
| `dataloy_sync` | `full=false` | Runs the local DB sync and returns a summary |
| `dataloy_raw_get` | `resource`, `filter?`, `limit=100` | A generic GET for exploration. **GET only, with a resource allowlist** |

`dataloy_raw_get` is needed for Phase 0 exploration (confirming the tenant schema).
It keeps an allowlist to prevent arbitrary resource access, and the HTTP method is fixed to GET.

## 5. `fleet-mcp` (outside, combined)

| Tool | Arguments | Returns |
|---|---|---|
| `fleet_daily_brief` | `date?`, `severity_min="WARN"` | The daily brief (the structure in [05-reconciliation.md](05-reconciliation.md) §7) |
| `fleet_list_vessels` | `status?`, `freshness?` | One-line summary per vessel |
| `fleet_vessel_status` | `vessel` | The full `VoyageState` for one vessel |
| `fleet_positions` | `as_of?` | A GeoJSON FeatureCollection for the map |
| `fleet_track` | `vessel`, `days=7` | The track coordinate array |
| `fleet_timeline` | `vessel`, `voyage_key?` | Dataloy events and mail reports merged chronologically into a comparison timeline |
| `fleet_reconcile` | `vessel?`, `rules?` | Runs the rule engine and returns the discrepancies |
| `fleet_list_discrepancies` | `severity?`, `status="open"`, `limit=50` | Discrepancy query |
| `fleet_update_discrepancy` | `discrepancy_id`, `status`, `note?` | Acknowledge/ignore (the only write tool, and only against the local DB) |
| `fleet_import` | `path` | Merges the boundary JSONL |

### `fleet_timeline` answers the user's question directly

"Does this vessel line up with Dataloy right now?" — the answer is this tool's output.

```
PACIFIC GLORY / Voyage 2026-014

  09-12 06:20Z  [mail]  ARRIVAL  Singapore anchorage  ✓ Dataloy ATA 09-12 06:00Z
  09-12 14:05Z  [mail]  NOR TENDERED                  ✗ no Dataloy event  ← R-002
  09-13 02:30Z  [mail]  ALL FAST  Berth 12            ✗ no Dataloy event  ← R-002
  09-13 04:00Z  [mail]  COMMENCED CARGO               ✗ no Dataloy event  ← R-002
       —        [Dataloy] ETD 09-14 18:00Z            (actual not entered)
  09-14 09:00Z  [mail]  WORKING  62% complete, ETC 09-15 04:00 LT
```

Actuals (mail) on the left, plan (Dataloy) on the right, the verdict in between.
**The vessel detail screen visualises exactly this structure.**

## 6. Tool registration (client configuration examples)

### In the VM (`.mcp.json`)

```json
{
  "mcpServers": {
    "outlook": {
      "command": "python",
      "args": ["-m", "vmwareconnect.outlook.server"],
      "env": {
        "VMC_ADAPTER": "com",
        "VMC_STORE": "C:\\vmwareconnect\\vm_store.sqlite",
        "VMC_EXPORT_DIR": "C:\\shared\\vmwareconnect"
      }
    }
  }
}
```

### Outside (`.mcp.json`)

```json
{
  "mcpServers": {
    "dataloy": {
      "command": "python",
      "args": ["-m", "vmwareconnect.dataloy.server"],
      "env": {
        "DATALOY_BASE_URL":  "${DATALOY_BASE_URL}",
        "DATALOY_TOKEN_URL": "${DATALOY_TOKEN_URL}",
        "DATALOY_CLIENT_ID": "${DATALOY_CLIENT_ID}",
        "DATALOY_CLIENT_SECRET": "${DATALOY_CLIENT_SECRET}",
        "DATALOY_AUDIENCE":  "https://dataloy"
      }
    },
    "fleet": {
      "command": "python",
      "args": ["-m", "vmwareconnect.fleet.server"],
      "env": { "VMC_STORE": "./fleet.sqlite" }
    }
  }
}
```

Credentials are never written into `.mcp.json` directly, only referenced as environment variables.
`.mcp.json` is committed; `.env` is in `.gitignore`.
