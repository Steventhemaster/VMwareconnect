# 02. Data model

> **Draft history — not the current implementation baseline.** This document predates v2. The current baseline is [Architecture v2](ARCHITECTURE-V2.md), and v2 wins wherever they conflict. See also [the design review](REVIEW-CLAUDE-DESIGN.md) and [the Phase 0 verification record](PHASE-0-DESIGN.md).

## 1. Design principles

- **Keep the raw content.** Parsing logic keeps improving. Throw the raw away and you cannot re-parse.
- **Record the source.** Every value carries where it came from (Dataloy / mail / computed). The dashboard cannot show plan next to actual without it.
- **Times always come in pairs.** Vessel reports arrive in ship's local time (LT) while Dataloy is mostly UTC. Mixing them makes ETA comparison meaningless. Store `*_utc` and `*_local` together with `tz_offset_minutes`.
- **Record confidence.** Parsing is probabilistic. Without `parse_confidence`, a wrong value reaches the dashboard silently.

## 2. Core domain models

### 2.1 `VesselReport` — a normalised vessel report

The structured data extracted from one email. This is the system's central object.

```python
@dataclass
class VesselReport:
    # identity
    report_id: str                    # UUID
    source: SourceRef                 # reference to the raw mail (below)
    report_type: ReportType

    # vessel and voyage attribution
    vessel_name_raw: str              # exactly as written in the mail
    vessel_id: str | None             # matched internal vessel ID
    imo: str | None
    voyage_ref_raw: str | None        # voyage number as written in the mail
    voyage_key: str | None            # matched Dataloy voyage key
    port_call_key: str | None

    # times
    reported_at_utc: datetime | None
    reported_at_local: datetime | None
    tz_offset_minutes: int | None

    # position and passage (mostly NOON)
    position: Position | None         # lat, lon, precision
    course_deg: float | None
    speed_kn: float | None            # observed average speed
    rpm: float | None
    slip_pct: float | None
    distance_run_nm: float | None     # distance run since the previous report
    distance_to_go_nm: float | None   # remaining distance as declared by the vessel
    eta_next_utc: datetime | None     # next-port ETA as declared by the vessel
    next_port_raw: str | None

    # fuel
    rob: dict[str, float]             # {"HSFO": 421.3, "VLSFO": …, "MGO": …, "FW": …}
    consumption: dict[str, float]     # consumption since the previous report

    # weather
    weather: Weather | None           # wind_dir, wind_bf, sea_state, swell_m, current_kn

    # port events (the PORT_* family)
    port_event: PortEvent | None      # event_type, port_raw, terminal, berth, timestamp_*

    # cargo work (WORKING / SOF)
    cargo_ops: CargoOps | None        # commenced, completed, qty, unit, rate, stoppages[]

    remarks: str | None

    # parsing metadata
    parse_method: ParseMethod         # TEMPLATE | GENERIC | ATTACHMENT | LLM | MANUAL
    parse_confidence: float           # 0.0 – 1.0
    parse_warnings: list[str]
    parsed_at: datetime
```

```python
@dataclass
class SourceRef:
    message_id: str                   # Outlook EntryID or Graph message id
    internet_message_id: str | None   # RFC 5322 Message-ID (a portable key)
    subject: str
    sender: str
    received_at_utc: datetime
    folder: str
    attachment_ids: list[str]
```

```python
@dataclass
class Position:
    lat: float                        # -90 … 90
    lon: float                        # -180 … 180
    raw: str                          # exactly as written ("12-34.5N 123-45.6E")
    precision: Literal["exact", "minute", "degree"]
```

### 2.2 `ReportType`

```python
class ReportType(StrEnum):
    NOON              = "NOON"
    DEPARTURE         = "DEPARTURE"        # COSP
    ARRIVAL           = "ARRIVAL"          # EOSP
    ANCHORED          = "ANCHORED"
    PILOT_ON_BOARD    = "PILOT_ON_BOARD"
    ALL_FAST          = "ALL_FAST"         # berthed
    NOR_TENDERED      = "NOR_TENDERED"
    COMMENCED_CARGO   = "COMMENCED_CARGO"
    COMPLETED_CARGO   = "COMPLETED_CARGO"
    WORKING           = "WORKING"          # cargo progress / SOF
    BUNKERING         = "BUNKERING"
    DEVIATION         = "DEVIATION"
    DELAY             = "DELAY"
    OTHER             = "OTHER"
```

### 2.3 `VoyageState` — the combined per-vessel picture

The view model the dashboard consumes directly, built from the Dataloy voyage plus the latest vessel reports.

```python
@dataclass
class VoyageState:
    vessel_id: str
    vessel_name: str
    imo: str | None
    voyage_key: str
    voyage_no: str
    voyage_status_code: str           # Dataloy statusTypeCode (OPR etc.)

    derived_status: VesselStatus      # see below
    status_reason: str                # the evidence this status rests on (explainability)

    # position
    last_position: Position | None
    last_position_at_utc: datetime | None
    track: list[TrackPoint]           # noon positions over the last N days, for the map

    # freshness
    last_report_at_utc: datetime | None
    report_age_hours: float | None
    freshness: Freshness              # OK | STALE | MISSING

    # next port (plan versus actual)
    next_port_name: str | None
    eta_dataloy_utc: datetime | None  # Dataloy planned ETA
    eta_reported_utc: datetime | None # vessel-declared ETA
    eta_computed_utc: datetime | None # our own computed ETA
    eta_delta_hours: float | None     # reported − dataloy

    # voyage progress
    port_calls: list[PortCallView]    # planned order against the actual events
    progress_pct: float | None

    # fuel
    rob_latest: dict[str, float]
    rob_trend: list[RobPoint]

    discrepancies: list[Discrepancy]
    worst_severity: Severity
```

```python
class VesselStatus(StrEnum):
    AT_SEA_LADEN    = "AT_SEA_LADEN"
    AT_SEA_BALLAST  = "AT_SEA_BALLAST"
    AT_ANCHOR       = "AT_ANCHOR"
    WAITING_BERTH   = "WAITING_BERTH"
    IN_PORT_WORKING = "IN_PORT_WORKING"
    IN_PORT_IDLE    = "IN_PORT_IDLE"
    BUNKERING       = "BUNKERING"
    DRIFTING        = "DRIFTING"
    UNKNOWN         = "UNKNOWN"

class Freshness(StrEnum):
    OK      = "OK"        # < 30h
    STALE   = "STALE"     # 30 – 48h
    MISSING = "MISSING"   # > 48h
```

`status_reason` is a required field because if a user asks "why is this vessel showing AT_ANCHOR?"
and there is no answer, nobody trusts the status display.
For example: `"ANCHORED report 2026-09-13T04:10Z, no conflicting event since"`.

### 2.4 `Discrepancy` — a detected difference

```python
@dataclass
class Discrepancy:
    discrepancy_id: str
    rule_id: str                      # "R-002"
    severity: Severity                # INFO | WARN | CRITICAL
    vessel_id: str
    voyage_key: str | None
    port_call_key: str | None
    title: str                        # "Arrival reported but no Dataloy event"
    detail: str                       # a human-readable explanation
    dataloy_value: str | None         # the plan side
    reported_value: str | None        # the actual side
    evidence: list[str]               # message_id and other references
    detected_at: datetime
    status: Literal["open", "acknowledged", "resolved", "ignored"]
    resolved_at: datetime | None
    note: str | None                  # the operator's note
```

`status` and `note` exist because if the same discrepancy reappears every day, the user turns the system off.
It has to be closeable with "checked".

## 3. Storage schema (SQLite)

SQLite is chosen because it is a single file — easy to move between VM and outside — needs no server, and has no performance problem at this size (tens of vessels × tens of items a day).
If the scale grows, move to PostgreSQL; access goes only through `core/store.py`, so the swap cost is bounded.

### VM side (`vm_store.sqlite`)

```sql
CREATE TABLE emails_raw (
    message_id           TEXT PRIMARY KEY,
    internet_message_id  TEXT UNIQUE,
    folder               TEXT NOT NULL,
    subject              TEXT,
    sender               TEXT,
    received_at_utc      TEXT NOT NULL,   -- ISO8601
    body_text            TEXT,
    body_html            TEXT,
    headers_json         TEXT,
    has_attachments      INTEGER NOT NULL DEFAULT 0,
    fetched_at           TEXT NOT NULL
);
CREATE INDEX idx_emails_received ON emails_raw(received_at_utc);
CREATE INDEX idx_emails_sender   ON emails_raw(sender);

CREATE TABLE attachments (
    attachment_id  TEXT PRIMARY KEY,
    message_id     TEXT NOT NULL REFERENCES emails_raw(message_id),
    filename       TEXT,
    content_type   TEXT,
    size_bytes     INTEGER,
    stored_path    TEXT               -- a VM-local path. Never crosses the boundary
);

CREATE TABLE sync_state (
    adapter     TEXT PRIMARY KEY,     -- "com" | "graph" | "imap"
    folder      TEXT,
    delta_token TEXT,                 -- Graph deltaLink etc.
    last_synced_at TEXT
);
```

### Shared (`fleet.sqlite`; the same tables also exist on the VM side)

```sql
CREATE TABLE vessels (
    vessel_id     TEXT PRIMARY KEY,   -- internal ID ("imo:9123456" where an IMO exists)
    name          TEXT NOT NULL,
    name_norm     TEXT NOT NULL,      -- normalised name, for matching
    imo           TEXT UNIQUE,
    call_sign     TEXT,
    dataloy_key   TEXT,
    aliases_json  TEXT                -- spelling variants observed in mail
);

CREATE TABLE voyages (
    voyage_key        TEXT PRIMARY KEY,   -- Dataloy key
    vessel_id         TEXT REFERENCES vessels(vessel_id),
    voyage_no         TEXT,
    status_type_code  TEXT,               -- OPR / NOM / EST …
    commenced_at_utc  TEXT,
    completed_at_utc  TEXT,
    raw_json          TEXT,               -- the raw Dataloy response
    synced_at         TEXT NOT NULL
);
CREATE INDEX idx_voyages_status ON voyages(status_type_code);

CREATE TABLE port_calls (
    port_call_key   TEXT PRIMARY KEY,
    voyage_key      TEXT REFERENCES voyages(voyage_key),
    sequence        INTEGER,
    port_name       TEXT,
    port_unlocode   TEXT,
    port_lat        REAL,
    port_lon        REAL,
    reason_for_call TEXT,
    eta_utc         TEXT,
    etd_utc         TEXT,
    ata_utc         TEXT,
    atd_utc         TEXT,
    raw_json        TEXT,
    synced_at       TEXT NOT NULL
);

CREATE TABLE event_logs (
    event_log_key  TEXT PRIMARY KEY,
    port_call_key  TEXT REFERENCES port_calls(port_call_key),
    event_code     TEXT,
    event_desc     TEXT,
    event_at_utc   TEXT,
    raw_json       TEXT
);

CREATE TABLE vessel_reports (
    report_id            TEXT PRIMARY KEY,
    message_id           TEXT,
    internet_message_id  TEXT,
    report_type          TEXT NOT NULL,
    vessel_id            TEXT REFERENCES vessels(vessel_id),
    vessel_name_raw      TEXT,
    voyage_key           TEXT,
    port_call_key        TEXT,
    reported_at_utc      TEXT,
    reported_at_local    TEXT,
    tz_offset_minutes    INTEGER,
    lat                  REAL,
    lon                  REAL,
    position_raw         TEXT,
    course_deg           REAL,
    speed_kn             REAL,
    distance_run_nm      REAL,
    distance_to_go_nm    REAL,
    eta_next_utc         TEXT,
    next_port_raw        TEXT,
    rob_json             TEXT,
    consumption_json     TEXT,
    weather_json         TEXT,
    port_event_json      TEXT,
    cargo_ops_json       TEXT,
    remarks              TEXT,
    parse_method         TEXT NOT NULL,
    parse_confidence     REAL NOT NULL,
    parse_warnings_json  TEXT,
    parsed_at            TEXT NOT NULL
);
CREATE INDEX idx_reports_vessel_time ON vessel_reports(vessel_id, reported_at_utc DESC);
CREATE INDEX idx_reports_type        ON vessel_reports(report_type);

CREATE TABLE discrepancies (
    discrepancy_id  TEXT PRIMARY KEY,
    rule_id         TEXT NOT NULL,
    severity        TEXT NOT NULL,
    vessel_id       TEXT,
    voyage_key      TEXT,
    port_call_key   TEXT,
    title           TEXT NOT NULL,
    detail          TEXT,
    dataloy_value   TEXT,
    reported_value  TEXT,
    evidence_json   TEXT,
    detected_at     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open',
    resolved_at     TEXT,
    note            TEXT,
    fingerprint     TEXT NOT NULL      -- prevents a duplicate row on re-detection
);
CREATE UNIQUE INDEX idx_disc_fingerprint ON discrepancies(fingerprint);
```

The `fingerprint` is built from `rule_id + vessel_id + port_call_key + a hash of the core values`.
Re-evaluating daily then updates the same row for the same problem, so an item the user closed as
"checked" does not come back as a new item the next day.

## 4. Boundary exchange format

The JSONL that `transport` hands from the VM to the outside. One record per line.

```json
{"kind":"vessel_report","v":1,"data":{ /* serialised VesselReport */ }}
{"kind":"vessel_alias","v":1,"data":{"name_raw":"M/V PACIFIC GLORY","imo":"9123456"}}
{"kind":"sync_marker","v":1,"data":{"exported_at":"2026-09-14T07:00:00Z","since":"2026-09-13T00:00:00Z","count":47}}
```

- The `v` field states the schema version. The two sides deploy independently, so version mismatch really does happen.
- With `redact=true` (the default), `remarks` and `source.subject` are dropped or masked.
  When the dashboard needs the raw content, it is fetched at that moment via the VM-side `outlook_get_report(message_id)`.
