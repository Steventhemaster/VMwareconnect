# 02. 데이터 모델

> **초기 설계 이력 — 현재 구현 기준 아님.** 이 문서는 v2 이전 초안입니다. 현재 기준은 [재설계 v2](ARCHITECTURE-V2.ko.md)이며, 충돌하는 내용은 v2가 우선합니다. [검토 결과](REVIEW-CLAUDE-DESIGN.ko.md)와 [Phase 0 확인 기록](PHASE-0-DESIGN.ko.md)을 함께 확인하세요.

## 1. 설계 원칙

- **원문 보존** — 파싱 로직은 계속 개선됩니다. 원문을 버리면 재파싱이 불가능합니다.
- **출처 표기** — 모든 값은 "어디서 왔는가"(Dataloy / 메일 / 계산)를 함께 저장합니다. 대시보드가 계획값과 실적값을 나란히 보여주려면 필수입니다.
- **시간은 항상 쌍으로** — 본선 보고는 선박 현지시(LT)로 오고 Dataloy는 대개 UTC입니다. 둘을 섞으면 ETA 비교가 무의미해집니다. `*_utc`와 `*_local` + `tz_offset_minutes`를 함께 저장합니다.
- **확신도 기록** — 파싱은 확률적입니다. `parse_confidence`가 없으면 잘못된 값이 조용히 대시보드에 올라갑니다.

## 2. 핵심 도메인 모델

### 2.1 `VesselReport` — 정규화된 본선 보고

메일 1통에서 추출한 구조화 데이터입니다. 이 시스템의 중심 객체입니다.

```python
@dataclass
class VesselReport:
    # 식별
    report_id: str                    # UUID
    source: SourceRef                 # 원문 참조 (아래)
    report_type: ReportType

    # 선박·항차 귀속
    vessel_name_raw: str              # 메일에 적힌 그대로
    vessel_id: str | None             # 매칭된 내부 선박 ID
    imo: str | None
    voyage_ref_raw: str | None        # 메일에 적힌 항차 번호
    voyage_key: str | None            # 매칭된 Dataloy voyage key
    port_call_key: str | None

    # 시각
    reported_at_utc: datetime | None
    reported_at_local: datetime | None
    tz_offset_minutes: int | None

    # 위치·운항 (주로 NOON)
    position: Position | None         # lat, lon, precision
    course_deg: float | None
    speed_kn: float | None            # 관측 평균 속력
    rpm: float | None
    slip_pct: float | None
    distance_run_nm: float | None     # 직전 보고 이후 항주거리
    distance_to_go_nm: float | None   # 본선이 신고한 잔여거리
    eta_next_utc: datetime | None     # 본선이 신고한 다음 항 ETA
    next_port_raw: str | None

    # 연료
    rob: dict[str, float]             # {"HSFO": 421.3, "VLSFO": …, "MGO": …, "FW": …}
    consumption: dict[str, float]     # 직전 보고 이후 소모량

    # 기상
    weather: Weather | None           # wind_dir, wind_bf, sea_state, swell_m, current_kn

    # 항만 이벤트 (PORT_* 계열)
    port_event: PortEvent | None      # event_type, port_raw, terminal, berth, timestamp_*

    # 하역 (WORKING / SOF)
    cargo_ops: CargoOps | None        # commenced, completed, qty, unit, rate, stoppages[]

    remarks: str | None

    # 파싱 메타
    parse_method: ParseMethod         # TEMPLATE | GENERIC | ATTACHMENT | LLM | MANUAL
    parse_confidence: float           # 0.0 – 1.0
    parse_warnings: list[str]
    parsed_at: datetime
```

```python
@dataclass
class SourceRef:
    message_id: str                   # Outlook EntryID 또는 Graph message id
    internet_message_id: str | None   # RFC 5322 Message-ID (이식 가능한 키)
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
    raw: str                          # 원문 표기 그대로 ("12-34.5N 123-45.6E")
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
    ALL_FAST          = "ALL_FAST"         # 접안 완료
    NOR_TENDERED      = "NOR_TENDERED"
    COMMENCED_CARGO   = "COMMENCED_CARGO"
    COMPLETED_CARGO   = "COMPLETED_CARGO"
    WORKING           = "WORKING"          # 하역 진행 / SOF
    BUNKERING         = "BUNKERING"
    DEVIATION         = "DEVIATION"
    DELAY             = "DELAY"
    OTHER             = "OTHER"
```

### 2.3 `VoyageState` — 선박별 통합 현황

Dataloy 항차 + 최신 본선 보고를 합쳐 만든, 대시보드가 직접 소비하는 뷰 모델입니다.

```python
@dataclass
class VoyageState:
    vessel_id: str
    vessel_name: str
    imo: str | None
    voyage_key: str
    voyage_no: str
    voyage_status_code: str           # Dataloy statusTypeCode (OPR 등)

    derived_status: VesselStatus      # 아래 참조
    status_reason: str                # 어떤 근거로 이 상태로 판정했는지 (설명 가능성)

    # 위치
    last_position: Position | None
    last_position_at_utc: datetime | None
    track: list[TrackPoint]           # 최근 N일 noon 위치 (지도 항적용)

    # 신선도
    last_report_at_utc: datetime | None
    report_age_hours: float | None
    freshness: Freshness              # OK | STALE | MISSING

    # 다음 기항지 (계획 vs 실적)
    next_port_name: str | None
    eta_dataloy_utc: datetime | None  # Dataloy 계획 ETA
    eta_reported_utc: datetime | None # 본선 신고 ETA
    eta_computed_utc: datetime | None # 위치·속력 기반 자체 계산 ETA
    eta_delta_hours: float | None     # reported - dataloy

    # 항차 진행
    port_calls: list[PortCallView]    # 계획 순서 + 실제 이벤트 대조
    progress_pct: float | None

    # 연료
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

`status_reason`을 필수 필드로 둔 이유: 사용자가 "왜 이 배가 AT_ANCHOR로 나오지?"를
물었을 때 답할 수 없으면 그 상태 표시는 신뢰받지 못합니다.
예: `"ANCHORED report 2026-09-13T04:10Z 이후 상충 이벤트 없음"`.

### 2.4 `Discrepancy` — 검출된 불일치

```python
@dataclass
class Discrepancy:
    discrepancy_id: str
    rule_id: str                      # "R-002"
    severity: Severity                # INFO | WARN | CRITICAL
    vessel_id: str
    voyage_key: str | None
    port_call_key: str | None
    title: str                        # "입항 보고 있으나 Dataloy 이벤트 없음"
    detail: str                       # 사람이 읽을 설명
    dataloy_value: str | None         # 계획 측 값
    reported_value: str | None        # 실적 측 값
    evidence: list[str]               # message_id 등 근거 참조
    detected_at: datetime
    status: Literal["open", "acknowledged", "resolved", "ignored"]
    resolved_at: datetime | None
    note: str | None                  # 담당자 메모
```

`status`와 `note`가 있는 이유: 같은 불일치가 매일 다시 뜨면 사용자는 시스템을 끕니다.
"확인함"으로 닫을 수 있어야 합니다.

## 3. 저장소 스키마 (SQLite)

SQLite를 선택한 이유: 단일 파일이라 VM↔외부 이동이 쉽고, 서버 운영이 불필요하며,
이 규모(선대 수십 척 × 일일 수십 건)에서 성능 문제가 없습니다.
규모가 커지면 PostgreSQL로 옮기되, 접근은 `core/store.py`로만 하므로 교체 비용이 제한됩니다.

### VM 측 (`vm_store.sqlite`)

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
    stored_path    TEXT               -- VM 로컬 경로. 경계를 넘지 않음
);

CREATE TABLE sync_state (
    adapter     TEXT PRIMARY KEY,     -- "com" | "graph" | "imap"
    folder      TEXT,
    delta_token TEXT,                 -- Graph deltaLink 등
    last_synced_at TEXT
);
```

### 공통 (`fleet.sqlite`, VM 측에도 동일 테이블 존재)

```sql
CREATE TABLE vessels (
    vessel_id     TEXT PRIMARY KEY,   -- 내부 ID (IMO 있으면 "imo:9123456")
    name          TEXT NOT NULL,
    name_norm     TEXT NOT NULL,      -- 매칭용 정규화 이름
    imo           TEXT UNIQUE,
    call_sign     TEXT,
    dataloy_key   TEXT,
    aliases_json  TEXT                -- 메일에서 관측된 표기 변형들
);

CREATE TABLE voyages (
    voyage_key        TEXT PRIMARY KEY,   -- Dataloy key
    vessel_id         TEXT REFERENCES vessels(vessel_id),
    voyage_no         TEXT,
    status_type_code  TEXT,               -- OPR / NOM / EST …
    commenced_at_utc  TEXT,
    completed_at_utc  TEXT,
    raw_json          TEXT,               -- Dataloy 원본 응답
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
    fingerprint     TEXT NOT NULL      -- 동일 불일치 재검출 시 중복 생성 방지
);
CREATE UNIQUE INDEX idx_disc_fingerprint ON discrepancies(fingerprint);
```

`fingerprint`는 `rule_id + vessel_id + port_call_key + 핵심값 해시`로 만듭니다.
매일 재평가해도 같은 문제는 같은 행을 갱신하므로, 사용자가 "확인함"으로 닫은 항목이
다음 날 새 항목으로 되살아나지 않습니다.

## 4. 경계 교환 포맷

`transport`가 VM→외부로 넘기는 JSONL. 한 줄에 레코드 하나.

```json
{"kind":"vessel_report","v":1,"data":{ /* VesselReport 직렬화 */ }}
{"kind":"vessel_alias","v":1,"data":{"name_raw":"M/V PACIFIC GLORY","imo":"9123456"}}
{"kind":"sync_marker","v":1,"data":{"exported_at":"2026-09-14T07:00:00Z","since":"2026-09-13T00:00:00Z","count":47}}
```

- `v` 필드로 스키마 버전을 명시합니다. 양쪽이 독립 배포되므로 버전 불일치가 실제로 발생합니다.
- `redact=true`(기본)일 때 `remarks`와 `source.subject`는 제외하거나 마스킹합니다.
  대시보드에서 원문이 필요하면 VM 쪽 `outlook_get_report(message_id)`로 그때 조회합니다.
