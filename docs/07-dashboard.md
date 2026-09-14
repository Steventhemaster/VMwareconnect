# 07. Dashboard design

> **Draft history — not the current implementation baseline.** This document predates v2. The current baseline is [Architecture v2](ARCHITECTURE-V2.md), and v2 wins wherever they conflict. See also [the design review](REVIEW-CLAUDE-DESIGN.md) and [the Phase 0 verification record](PHASE-0-DESIGN.md).

## 1. Design goal

> Understand the whole fleet **in under 5 minutes** every morning.

The screen layout follows from that goal.

- **Anomalies must be visible first.** A normal vessel can be found by scrolling.
- **The map is for locating, not for entering.** For items needing action, a list is faster.
- **One click to the evidence.** If it cannot answer "why does it say that?", it will not be used.

## 2. Screen layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Fleet status       2026-09-14 07:00 KST      [Refresh] [Daily brief] │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                        │
│  │Operating│ │ Late   │ │CRITICAL│ │Unparsed│      ← 4 KPIs          │
│  │   24    │ │reports3│ │   5    │ │   2    │                        │
│  └────────┘ └────────┘ └────────┘ └────────┘                        │
├───────────────────────────────────┬──────────────────────────────────┤
│                                   │  ⚠ Needs action                  │
│                                   │  ─────────────────────────────   │
│           M A P                   │  🔴 PACIFIC GLORY                │
│      (MapLibre GL)                │     3 Dataloy events missing     │
│                                   │  🔴 ATLANTIC DAWN                │
│   ▲ vessel marker (rotated to     │     no report for 52h            │
│     heading)                      │  🟡 NORDIC STAR                  │
│   ·─·─· track, last 7 days        │     ETA +18h vs plan             │
│   ┄┄▶ bearing to next port        │  ─────────────────────────────   │
│   ⚓ scheduled port calls         │  Vessel list (24)  [Status▾][Sort▾]│
│                                   │  ┌───────────────────────────┐  │
│                                   │  │ PACIFIC GLORY       🔴     │  │
│                                   │  │ at sea (laden) · 3h ago    │  │
│                                   │  │ → SINGAPORE  09-16 08:00Z  │  │
│                                   │  │   +14h vs plan             │  │
│                                   │  └───────────────────────────┘  │
│                                   │  ┌───────────────────────────┐  │
│                                   │  │ NORDIC STAR         🟡     │  │
│                                   │  │ discharging 62% · 1h ago   │  │
│                                   │  └───────────────────────────┘  │
└───────────────────────────────────┴──────────────────────────────────┘
```

### Why "Needs action" sits at the top of the list

Users open the dashboard **to find out what they have to do**.
Making them scan a map for anomalies defeats the five-minute goal.

## 3. The map

- **Library**: MapLibre GL JS (open source, no API key). The tile source depends on the corporate network policy — if external tile servers are blocked, fall back to self-hosting or a plain GeoJSON world background.
- **Vessel markers**: a triangle, rotated by `course_deg`. Colour = worst severity (normal grey / WARN amber / CRITICAL red).
- **Freshness**: `STALE` renders semi-transparent; `MISSING` gets a dashed outline and an explicit note that this is the last known position. **Showing an old position as if it were current is the most dangerous misreading.**
- **Track**: connect the last 7 days of noon positions with a line. No great-circle interpolation — daily intervals make straight segments fine.
- **Bearing line**: a dashed line from the current position to the next port. The legend states that it is approximate.
- **Clustering**: cluster on zoom-out once there are many vessels. Not needed at the v1 scale of a few dozen.

### Coordinate system caveats

- A track crossing the date line (longitude ±180) draws as a line straight across the world. Split the track where the longitude difference between adjacent points exceeds 180.
- Vessels with no position are excluded from the map but **must still appear in the list as "position unknown"**. Relying on the map alone makes them disappear silently.

## 4. Vessel detail

Clicking a card switches to a right-hand panel or full screen.

```
PACIFIC GLORY (IMO 9123456)          Voyage 2026-014  [OPR]
At sea (laden)  ·  last report 3 hours ago
Basis: NOON 2026-09-14 04:00Z, speed 12.4kn, no port event
───────────────────────────────────────────────────────────
[ Timeline ]  [ Position ]  [ Fuel ]  [ Source ]
───────────────────────────────────────────────────────────
  Actual (vessel report)        │ Plan (Dataloy)       │ Match
  ─────────────────────────────┼──────────────────────┼─────
  09-12 06:20Z ARRIVAL SIN anch │ ATA 09-12 06:00Z     │  ✓
  09-12 14:05Z NOR TENDERED     │ —                    │  ✗ R-002
  09-13 02:30Z ALL FAST Berth12 │ —                    │  ✗ R-002
  09-13 04:00Z COMMENCED CARGO  │ —                    │  ✗ R-002
  —                             │ ETD 09-14 18:00Z     │  ⚠ not entered
  09-14 09:00Z WORKING 62%      │ —                    │  —
```

**Left = actual, right = plan, far right = match.**
This three-column structure is the direct implementation of the "check whether they line up" requirement.

Each row is clickable and opens the source mail.
The raw content lives in the VM, so the dashboard shows only the `message_id` and,
where needed, directs the user to fetch it through the VM-side Claude with `outlook_get_message`.
(In an environment with a live VM-to-outside connection, this becomes a direct link.)

### Tabs

| Tab | Content |
|---|---|
| Timeline | The three-column comparison above |
| Position | A zoomed track map plus a table of noon positions (date, coordinate, speed, distance run, DTG) |
| Fuel | A ROB trend line chart per grade, with consumption bars |
| Source | The mail attributed to this voyage (subject, received time, parse method, confidence) |

`parse_method` and `parse_confidence` appear on the Source tab because
the user has to be able to tell an LLM-extracted value from a template-extracted one.

## 5. API design

FastAPI serves the following, consumed by a static frontend.

```
GET  /api/summary                       The 4 KPIs
GET  /api/vessels?status=&freshness=    Vessel list (card summaries)
GET  /api/vessels/{vessel_id}           The full VoyageState
GET  /api/vessels/{vessel_id}/timeline  The three-column comparison timeline
GET  /api/vessels/{vessel_id}/track?days=7
GET  /api/positions                     GeoJSON FeatureCollection
GET  /api/discrepancies?severity=&status=
PATCH /api/discrepancies/{id}           Update status / note
POST /api/refresh                       Run dataloy_sync + reconcile
GET  /api/brief?date=                   The daily brief (markdown)
```

The MCP tools and the HTTP API call **the same service layer** (`fleet/service.py`).
The logic is never implemented twice.

```
          ┌──────────────┐
 MCP ────▶│              │
          │ fleet/       │───▶ store (SQLite)
 HTTP ───▶│ service.py   │───▶ reconcile engine
          └──────────────┘
```

## 6. Presentation rules

| Item | Rule |
|---|---|
| Times | UTC by default (with a `Z` suffix), switchable to KST in settings. **Never mixed — always suffixed** |
| Coordinates | `12°34.5'N 123°45.6'E` (degrees-minutes, the shipping convention) |
| Speed | `12.4 kn` |
| Distance | `1,240 nm` |
| Deviation | Always signed (`+14h`, `-3h`). Late is positive |
| Estimated values | Italic or a `~` prefix, with the basis in a tooltip |
| Missing | `—`, never a blank. A blank reads as "0" |

## 7. Accessibility and environment

- Severity is never conveyed **by colour alone**. Icons (🔴🟡) and text labels go with it.
- Both light and dark themes are supported.
- The dashboard runs on an in-house server or locally, so **external CDN dependencies are minimised**. MapLibre and the tile policy are settled after the deployment environment is confirmed (an open item).
- Auto-refresh is off by default. A screen that changes while someone is reading it is an interruption. A "new data available" banner is shown instead.
