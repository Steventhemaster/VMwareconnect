# 01. 아키텍처

> **초기 설계 이력 — 현재 구현 기준 아님.** 이 문서는 v2 이전 초안입니다. 현재 기준은 [재설계 v2](ARCHITECTURE-V2.ko.md)이며, 충돌하는 내용은 v2가 우선합니다. [검토 결과](REVIEW-CLAUDE-DESIGN.ko.md)와 [Phase 0 확인 기록](PHASE-0-DESIGN.ko.md)을 함께 확인하세요.

## 1. 배포 토폴로지

VMware VM은 사내 메일에 접근할 수 있지만 외부망이 제한되고,
외부 환경은 Dataloy API에 접근할 수 있지만 사내 메일에는 닿지 않습니다.
따라서 **경계를 하나 두고 그 위로 정규화된 데이터만 흐르게** 합니다.

```
┌─────────────────────── VMware VM (사내망) ────────────────────────┐
│                                                                   │
│   Outlook (Desktop)                                               │
│        ▲                                                          │
│        │ COM / Graph / IMAP  (어댑터로 추상화)                     │
│        │                                                          │
│   ┌────┴──────────────┐        ┌──────────────────┐               │
│   │  outlook-mcp      │◀──────▶│  Claude Code     │               │
│   │  (MCP stdio 서버) │  MCP   │  (VM 내부 실행)  │               │
│   └────┬──────────────┘        └──────────────────┘               │
│        │ 원문 + 파싱 결과                                          │
│        ▼                                                          │
│   ┌───────────────────┐                                           │
│   │ vm_store.sqlite   │  emails_raw / vessel_reports              │
│   └────┬──────────────┘                                           │
│        │ export (정규화 JSONL, 선택적 redaction)                   │
└────────┼──────────────────────────────────────────────────────────┘
         │
    ═════╪═══════════ 신뢰 경계 (Trust Boundary) ═══════════
         │  공유 폴더 / 마운트 / HTTP 풀 — Transport 인터페이스로 추상화
         ▼
┌─────────────────────── 외부 (분석·표현) ──────────────────────────┐
│                                                                   │
│   ┌───────────────────┐        ┌──────────────────┐               │
│   │  dataloy-mcp      │◀──────▶│                  │               │
│   ├───────────────────┤  MCP   │  Claude Code     │               │
│   │  fleet-mcp        │◀──────▶│  (외부 실행)     │               │
│   └────┬──────────────┘        └──────────────────┘               │
│        │                                                          │
│   ┌────▼──────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│   │ fleet.sqlite      │──▶│ Reconcile    │──▶│ Dashboard       │  │
│   │ (통합 저장소)     │   │ Engine       │   │ (FastAPI+지도)  │  │
│   └───────────────────┘   └──────────────┘   └─────────────────┘  │
│        ▲                                                          │
│        │ OAuth2 (client_credentials)                              │
│   ┌────┴──────────────┐                                           │
│   │  Dataloy VMS API  │  ws/rest/Voyage, PortCall, Vessel …       │
│   └───────────────────┘                                           │
└───────────────────────────────────────────────────────────────────┘
```

### 왜 이 구조인가

- **어댑터로 Outlook 접근을 추상화** — COM / Graph / IMAP 중 무엇이 허용될지 아직 확정되지 않았고, 환경에 따라 바뀔 수 있습니다. 상위 코드가 이를 몰라야 합니다.
- **경계를 넘는 것은 정규화된 데이터뿐** — 메일 원문은 VM 안에 남습니다. 원문이 필요하면 VM 쪽 MCP 도구로 그때 조회합니다.
- **MCP 서버를 3개로 분리** — 각각 신뢰 경계와 자격증명 범위가 다릅니다. 하나로 합치면 VM 자격증명과 Dataloy 자격증명이 같은 프로세스에 놓입니다.

## 2. 컴포넌트

| 컴포넌트 | 위치 | 책임 | 언어 |
|---|---|---|---|
| `core` | 공통 | 도메인 모델, 파서, 좌표·시간 유틸, 스키마 | Python |
| `outlook-mcp` | VM 내부 | Outlook 검색/조회/첨부 추출, 원문 보관 | Python |
| `dataloy-mcp` | 외부 | Dataloy REST 읽기 전용 래핑 | Python |
| `fleet-mcp` | 외부 | 통합 질의, 브리핑, 대조 결과 | Python |
| `reconcile` | 외부 | 매칭 + 불일치 규칙 엔진 | Python |
| `dashboard` | 외부 | HTTP API + 지도 UI | Python(FastAPI) + 정적 프론트 |
| `transport` | 양쪽 | 경계 넘김 (export / import) | Python |

### 스택 선택 근거

Python 단일 스택으로 갑니다. 이유:

1. **Outlook COM 제어는 `pywin32`가 사실상 유일한 실용 경로**입니다. 이게 VM 쪽 언어를 결정합니다.
2. 파싱(정규식, `openpyxl`, `dateutil`)과 지리 계산(`pyproj`, `searoute`) 생태계가 Python에 있습니다.
3. 대시보드 프론트는 빌드 도구 없이 **MapLibre GL JS + 바닐라 JS/정적 HTML**로 충분합니다. 데이터는 FastAPI가 JSON으로 내려줍니다. React/Node 빌드 체인을 들이면 VM 내부·사내 서버 배포가 복잡해집니다.

두 스택을 관리하는 비용보다 단일 스택의 단순함이 이 규모에서는 유리하다고 판단했습니다.

## 3. 디렉터리 구조 (제안)

```
VMwareconnect/
├── docs/
├── pyproject.toml                 # uv / pip 단일 워크스페이스
├── src/
│   └── vmwareconnect/
│       ├── core/
│       │   ├── models.py          # VesselReport, VoyageState, Discrepancy …
│       │   ├── enums.py           # ReportType, VesselStatus, Severity
│       │   ├── geo.py             # 좌표 파싱, haversine, 항로거리
│       │   ├── timeutil.py        # LT/UTC 변환, tz 추론
│       │   └── store.py           # SQLite 접근 계층
│       ├── outlook/
│       │   ├── adapter.py         # OutlookAdapter (ABC)
│       │   ├── adapter_com.py     # pywin32 구현
│       │   ├── adapter_graph.py   # Microsoft Graph 구현
│       │   ├── adapter_imap.py    # IMAP 구현
│       │   └── server.py          # outlook-mcp 진입점
│       ├── parsing/
│       │   ├── registry.py        # 템플릿 레지스트리
│       │   ├── templates/         # 선사/선박별 추출 규칙 (YAML)
│       │   ├── generic.py         # 범용 라벨 스캐너
│       │   ├── attachments.py     # xlsx/pdf 노온폼 파서
│       │   └── llm.py             # Claude 폴백 추출 (MCP 도구로 노출)
│       ├── dataloy/
│       │   ├── client.py          # OAuth2 + ws/rest 클라이언트
│       │   ├── mapper.py          # Dataloy JSON → 도메인 모델
│       │   └── server.py          # dataloy-mcp 진입점
│       ├── reconcile/
│       │   ├── matcher.py         # 선박·항차 동일성 판정
│       │   ├── rules.py           # 불일치 규칙 (R-001 …)
│       │   └── engine.py
│       ├── transport/
│       │   ├── base.py            # Transport (ABC)
│       │   ├── file_drop.py       # 공유 폴더 방식 (기본)
│       │   └── http_pull.py       # HTTP 폴링 방식
│       ├── fleet/
│       │   └── server.py          # fleet-mcp 진입점
│       └── dashboard/
│           ├── api.py             # FastAPI
│           └── static/            # index.html, map.js, styles.css
└── tests/
    ├── fixtures/emails/           # 실제 리포트 샘플 (익명화)
    └── ...
```

## 4. 데이터 흐름 (일일 사이클)

```
1. [VM] Claude가 outlook_sync(since=어제) 호출
        → 신규 메일 수집, emails_raw 적재
2. [VM] 각 메일에 대해 파싱 시도 (템플릿 → 범용 → Claude 직접 추출)
        → vessel_reports 적재, parse_confidence 기록
3. [VM] transport.export() → 정규화 JSONL 생성
4. [경계] 공유 폴더로 이동
5. [외부] transport.import_() → fleet.sqlite 병합
6. [외부] dataloy_sync() → OPR 항차/기항지/이벤트로그 갱신
7. [외부] reconcile.run() → 매칭 + 규칙 평가 → discrepancies 적재
8. [외부] 대시보드 갱신, Claude가 fleet_daily_brief()로 요약 생성
```

1~3단계는 Claude가 VM 안에서 대화적으로 수행합니다.
6~8단계는 스케줄러(또는 Claude)가 외부에서 수행합니다.

## 5. 신뢰 경계와 보안 원칙

| 원칙 | 구현 |
|---|---|
| 메일 원문은 경계를 넘지 않는다 | export 시 `redact=true`(기본)면 정규화 필드 + 메시지 ID만 전송. 본문·첨부는 VM에 잔류 |
| 자격증명 분리 | Dataloy 토큰은 외부 프로세스만 보유. VM 쪽은 Dataloy에 전혀 접근하지 않음 |
| Dataloy는 읽기 전용 | v1의 `dataloy-mcp`는 GET만 노출. 쓰기 도구를 아예 정의하지 않음 |
| 자격증명은 코드·저장소 밖 | 환경변수 또는 OS 자격증명 저장소. `.env`는 `.gitignore` |
| 감사 추적 | 모든 파싱 결과에 원본 `message_id`, `parse_method`, `parse_confidence` 기록. 결과를 항상 원문까지 거슬러 올라갈 수 있어야 함 |
| 메일 본문은 신뢰하지 않는 입력 | 외부에서 들어온 텍스트입니다. 파싱 대상일 뿐이며, 그 안의 지시문을 실행 지시로 해석하지 않습니다 |

마지막 항목은 LLM 폴백 파서를 쓸 때 실질적인 의미가 있습니다.
`parsing/llm.py`는 메일 본문을 **데이터로만** 다루도록 프롬프트를 구성하고,
추출 결과는 스키마 검증을 통과한 필드만 채택합니다.
