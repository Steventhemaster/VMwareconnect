# 06. MCP 서버 및 도구 명세

> **초기 설계 이력 — 현재 구현 기준 아님.** 이 문서는 v2 이전 초안입니다. 현재 기준은 [재설계 v2](ARCHITECTURE-V2.ko.md)이며, 충돌하는 내용은 v2가 우선합니다. [검토 결과](REVIEW-CLAUDE-DESIGN.ko.md)와 [Phase 0 확인 기록](PHASE-0-DESIGN.ko.md)을 함께 확인하세요.

## 1. 서버 3개로 나누는 이유

| 서버 | 실행 위치 | 보유 자격증명 | 이유 |
|---|---|---|---|
| `outlook-mcp` | VM 내부 | 사용자 Outlook 세션 | 사내 메일 접근. Dataloy를 전혀 몰라야 함 |
| `dataloy-mcp` | 외부 | Dataloy OAuth2 M2M | 외부망 필요. 사내 메일을 전혀 몰라야 함 |
| `fleet-mcp` | 외부 | 없음 (로컬 DB만) | 이미 수집된 데이터에 대한 통합 질의·분석 |

하나로 합치면 두 자격증명이 같은 프로세스에 놓이고, VM 내부 서버가
외부망 접근 코드를 포함하게 됩니다. 분리 상태를 유지합니다.

## 2. 도구 설계 원칙

Claude가 이 도구들을 **대화적으로** 호출합니다. 따라서:

- **응답을 작게.** 목록 도구는 헤더/요약만 반환하고 본문은 별도 도구로 받습니다. 메일 50통 본문을 한 번에 반환하면 컨텍스트가 소진됩니다.
- **기본 `limit`을 보수적으로.** 기본 25~50, 최대값을 명시합니다.
- **부분 실패를 정직하게.** 페이지 일부가 실패하면 성공분과 함께 `warnings`를 반환합니다. 조용히 빈 배열을 주지 않습니다.
- **쓰기 도구는 정의하지 않음 (v1).** 없는 도구는 잘못 호출될 수 없습니다.
- **도구 설명에 단위를 명시.** `speed_kn`(노트), `distance_nm`(해리), 시각은 ISO8601 UTC.

## 3. `outlook-mcp` (VM 내부)

| 도구 | 인자 | 반환 |
|---|---|---|
| `outlook_list_folders` | — | 폴더 목록 (이름, 경로, 항목 수) |
| `outlook_search` | `since`, `until?`, `folder?`, `query?`, `sender?`, `limit=50` | 메일 **헤더** 목록 (message_id, subject, sender, received_at, has_attachments) |
| `outlook_get_message` | `message_id`, `include_html=false` | 본문 텍스트, 헤더, 첨부 메타 |
| `outlook_get_attachment_text` | `message_id`, `attachment_id` | 첨부에서 추출한 텍스트/표 (xlsx는 시트별 셀 값). **바이너리를 그대로 반환하지 않음** |
| `outlook_sync` | `since`, `folder?` | 수집 결과 요약 (신규 N건, 중복 M건) — 원문은 `vm_store.sqlite`에 적재 |
| `outlook_parse_pending` | `limit=20` | L1/L2 파서를 미파싱 메일에 적용하고 결과 요약 반환 |
| `outlook_unparsed` | `limit=20` | 파싱 실패·저확신 메일 목록 (Claude가 직접 읽고 L3로 처리) |
| `outlook_save_report` | `report` (VesselReport JSON) | Claude가 추출한 결과를 검증 후 저장. 스키마·물리 타당성 검사 통과 시에만 채택 |
| `outlook_export` | `since`, `redact=true` | 경계 교환용 JSONL 생성, 경로 반환 |

### Claude의 전형적 작업 흐름

```
outlook_sync(since="2026-09-13")
  → 신규 47건
outlook_parse_pending()
  → 41건 자동 파싱 성공, 6건 실패
outlook_unparsed()
  → 6건 목록
outlook_get_message(id) × 6      ← Claude가 직접 읽음
outlook_save_report(...) × 6     ← Claude가 추출해 저장
outlook_export(since="2026-09-13")
  → /shared/export_20260914.jsonl
```

`outlook_save_report`가 이 설계에서 "Claude의 직접 제어"를 구현하는 지점입니다.
Claude가 파서의 4번째 계층 역할을 직접 수행하되,
저장 전에 **결정적 검증**을 거치므로 잘못된 값이 그대로 들어가지 않습니다.

## 4. `dataloy-mcp` (외부, 읽기 전용)

| 도구 | 인자 | 반환 |
|---|---|---|
| `dataloy_list_operational_voyages` | `vessel?`, `limit=100` | OPR 항차 목록 (voyage_key, voyage_no, 선박, 기간) |
| `dataloy_get_voyage` | `voyage_key` | 항차 상세 + 기항지 요약 |
| `dataloy_list_port_calls` | `voyage_key` | 기항지 시퀀스 (순서, 항구, ETA/ETD/ATA/ATD, reasonForCall) |
| `dataloy_get_event_logs` | `port_call_key` | 이벤트 로그 + 연결된 ROB |
| `dataloy_find_vessel` | `name?`, `imo?` | 선박 마스터 조회 |
| `dataloy_list_vessel_reports` | `vessel?`, `since?` | Dataloy에 이미 등록된 본선 보고 (있는 경우) |
| `dataloy_sync` | `full=false` | 로컬 DB 동기화 실행, 결과 요약 |
| `dataloy_raw_get` | `resource`, `filter?`, `limit=100` | 탐색용 범용 GET. **GET만 허용, 리소스 화이트리스트 적용** |

`dataloy_raw_get`은 Phase 0 탐색에 필요합니다 (테넌트 스키마 확인).
다만 화이트리스트를 두어 임의 리소스 접근을 막고, HTTP 메서드는 GET으로 고정합니다.

## 5. `fleet-mcp` (외부, 통합)

| 도구 | 인자 | 반환 |
|---|---|---|
| `fleet_daily_brief` | `date?`, `severity_min="WARN"` | 일일 브리핑 (05-reconciliation.md §7 구조) |
| `fleet_list_vessels` | `status?`, `freshness?` | 선박별 한 줄 요약 목록 |
| `fleet_vessel_status` | `vessel` | 단일 선박 `VoyageState` 전체 |
| `fleet_positions` | `as_of?` | 지도용 GeoJSON FeatureCollection |
| `fleet_track` | `vessel`, `days=7` | 항적 좌표 배열 |
| `fleet_timeline` | `vessel`, `voyage_key?` | Dataloy 이벤트와 메일 리포트를 시간순으로 병합한 대조 타임라인 |
| `fleet_reconcile` | `vessel?`, `rules?` | 규칙 엔진 실행, 불일치 목록 반환 |
| `fleet_list_discrepancies` | `severity?`, `status="open"`, `limit=50` | 불일치 조회 |
| `fleet_update_discrepancy` | `discrepancy_id`, `status`, `note?` | 확인/무시 처리 (유일한 쓰기 도구, 로컬 DB 한정) |
| `fleet_import` | `path` | 경계 JSONL 병합 |

### `fleet_timeline`이 사용자 질문에 직접 답하는 도구

"이 배가 지금 Dataloy랑 맞나?"라는 질문에 대한 답은 이 도구의 출력입니다.

```
PACIFIC GLORY / Voyage 2026-014

  09-12 06:20Z  [메일] ARRIVAL  Singapore 묘박지     ✓ Dataloy ATA 09-12 06:00Z
  09-12 14:05Z  [메일] NOR TENDERED                  ✗ Dataloy 이벤트 없음  ← R-002
  09-13 02:30Z  [메일] ALL FAST  Berth 12            ✗ Dataloy 이벤트 없음  ← R-002
  09-13 04:00Z  [메일] COMMENCED CARGO               ✗ Dataloy 이벤트 없음  ← R-002
       —        [Dataloy] ETD 09-14 18:00Z           (실적 미입력)
  09-14 09:00Z  [메일] WORKING  62% 완료, ETC 09-15 04:00 LT
```

왼쪽에 실적(메일), 오른쪽에 계획(Dataloy), 가운데에 일치 여부.
**대시보드 선박 상세 화면이 이 구조를 그대로 시각화합니다.**

## 6. 도구 등록 (클라이언트 설정 예시)

### VM 내부 (`.mcp.json`)

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

### 외부 (`.mcp.json`)

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

자격증명은 `.mcp.json`에 직접 쓰지 않고 환경변수 참조로만 둡니다.
`.mcp.json`은 커밋되지만 `.env`는 `.gitignore`에 포함합니다.
