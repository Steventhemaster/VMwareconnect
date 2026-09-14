# 03. Outlook 접근과 리포트 파싱

> **초기 설계 이력 — 현재 구현 기준 아님.** 이 문서는 v2 이전 초안입니다. 현재 기준은 [재설계 v2](ARCHITECTURE-V2.ko.md)이며, 충돌하는 내용은 v2가 우선합니다. [검토 결과](REVIEW-CLAUDE-DESIGN.ko.md)와 [Phase 0 확인 기록](PHASE-0-DESIGN.ko.md)을 함께 확인하세요.

이 문서가 다루는 영역이 **프로젝트에서 가장 불확실하고 리스크가 큽니다.**
Dataloy는 문서화된 REST API이지만, 본선 보고 메일은 정해진 포맷이 없습니다.

## 1. Outlook 접근 방식

### 1.1 어댑터 인터페이스

무엇이 허용될지 확정 전이므로 상위 코드는 아래 인터페이스만 봅니다.

```python
class OutlookAdapter(ABC):
    @abstractmethod
    def list_folders(self) -> list[FolderInfo]: ...

    @abstractmethod
    def search(
        self,
        since: datetime,
        until: datetime | None = None,
        folder: str | None = None,
        query: str | None = None,       # 제목/본문 키워드
        sender: str | None = None,
        limit: int = 200,
    ) -> list[MessageHeader]: ...

    @abstractmethod
    def get_message(self, message_id: str) -> MessageBody: ...

    @abstractmethod
    def get_attachment(self, message_id: str, attachment_id: str) -> bytes: ...

    @abstractmethod
    def sync_delta(self, folder: str, token: str | None) -> tuple[list[MessageHeader], str]:
        """증분 동기화. 지원하지 않는 어댑터는 since 기반으로 폴백."""
```

### 1.2 구현 후보 비교

| 방식 | 장점 | 단점 | 판단 |
|---|---|---|---|
| **COM (`pywin32`)** | 테넌트 승인 불필요, 사용자 권한만으로 즉시 가능. 캐시된 OST를 읽으므로 오프라인에서도 동작. VDI 환경에 가장 현실적 | Outlook이 실행 중이어야 함. Windows 전용. 대용량 검색이 느림. 보안 프롬프트가 뜰 수 있음 | **v1 기본값** |
| **Microsoft Graph** | delta 동기화, `$search`·`$filter` 지원, 안정적, 헤드리스 | Entra ID 앱 등록 + `Mail.Read` 관리자 동의 필요. 승인에 시간이 걸림. VM에서 `graph.microsoft.com` 아웃바운드 허용 필요 | **v2 목표 / 승인되면 즉시 전환** |
| **IMAP** | 단순, 플랫폼 무관 | 사내에서 대개 비활성. 폴더·플래그 의미가 제한적 | 폴백 |
| **EWS** | — | **채택 불가.** 2026-10-01부터 Exchange Online이 서드파티 앱의 EWS 요청 차단을 시작하고 2027-04-01 완전 폐지 | **배제** |

EWS를 배제하는 것이 이 설계의 확정 사항입니다. 오늘 기준 2주 뒤부터 막히기 시작합니다.

### 1.3 COM 어댑터 구현 노트

```python
# adapter_com.py 핵심
import win32com.client

outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
folder  = outlook.GetDefaultFolder(6)          # 6 = olFolderInbox
items   = folder.Items
items.Sort("[ReceivedTime]", True)
items = items.Restrict(
    "[ReceivedTime] >= '" + since.strftime("%m/%d/%Y %H:%M %p") + "'"
)
```

주의할 점:

- **`Restrict`의 날짜 포맷은 OS 로캘을 따릅니다.** VM 로캘이 한국어면 `%m/%d/%Y`가 안 먹을 수 있습니다. 첫 실행 시 로캘을 탐지하거나, `DASL` 쿼리(`urn:schemas:httpmail:datereceived`)를 쓰는 편이 안전합니다.
- **`EntryID`는 메일박스 이동 시 바뀝니다.** 이식 가능한 키로 `PR_INTERNET_MESSAGE_ID`(RFC 5322 Message-ID)를 `PropertyAccessor`로 함께 읽어 저장합니다.
- **보안 프롬프트** — 본문/주소 접근 시 Outlook이 경고를 띄우는 구성이 있습니다. 사내 정책으로 프로그램 액세스가 허용되어 있는지 Phase 1에서 가장 먼저 확인해야 합니다.
- **성능** — 수천 통을 `for item in items`로 순회하면 매우 느립니다. `Restrict` + `GetTable`로 필요한 컬럼만 읽는 방식을 사용합니다.
- **Claude의 직접 제어** — Claude Code가 VM 안에서 `outlook-mcp`를 stdio로 띄우고 도구를 호출합니다. 즉 수집은 배치 잡이 아니라 **대화형**입니다. 따라서 각 도구는 응답이 작고 빨라야 하며(헤더 목록 먼저, 본문은 요청 시), `limit` 기본값을 보수적으로 둡니다.

## 2. 리포트 파싱 전략

### 2.1 4계층 폴백

포맷이 제각각인 문제를 하나의 파서로 풀려는 시도는 실패합니다. 계층을 둡니다.

```
L1  템플릿 매칭     ── 발신자/제목 패턴으로 알려진 포맷 식별 → YAML 규칙으로 추출
        │ 실패
L2  범용 라벨 스캐너 ── "POSITION", "LAT", "SPEED", "ROB" 등 라벨 근접 추출
        │ 실패 또는 저확신
L3  LLM 추출        ── Claude가 스키마에 맞춰 구조화 (MCP 도구)
        │ 실패
L4  사람 확인 큐    ── 대시보드에 미파싱 항목으로 노출
```

각 계층은 `parse_confidence`를 반환합니다. 임계값 미만이면 다음 계층으로 넘깁니다.
`parse_method` 필드로 어느 계층이 값을 만들었는지 항상 추적 가능합니다.

### 2.2 학습 루프

L3(Claude)가 같은 발신자·제목 패턴에 대해 **N회 일관된 구조**를 추출하면,
그 매핑을 L1 템플릿 후보로 자동 승격 제안합니다(`parsing/templates/_candidates/`).
사람이 승인하면 정식 템플릿이 되고, 이후 그 선박은 L1에서 빠르고 결정적으로 처리됩니다.

이 루프가 있어야 시간이 갈수록 LLM 호출이 줄고 파싱이 안정됩니다.
없으면 매일 같은 메일을 LLM으로 다시 읽는 비효율이 고착됩니다.

### 2.3 템플릿 정의 예시

```yaml
# parsing/templates/pacific_fleet_noon.yaml
id: pacific_fleet_noon
match:
  sender_domain: ["pacificfleet-ship.com"]
  subject_regex: "^(MV|M/V)\\s+(?P<vessel>[A-Z0-9 ]+)\\s*[-–]\\s*NOON REPORT"
report_type: NOON
timezone:
  field: "ZONE TIME"
  regex: "ZT\\s*[:=]\\s*(?P<sign>[+-])(?P<h>\\d{1,2})(?::(?P<m>\\d{2}))?"
fields:
  reported_at_local:
    regex: "DATE\\s*[:=]\\s*(?P<v>\\d{2}[./-]\\d{2}[./-]\\d{2,4}\\s+\\d{2}:?\\d{2})"
    parse: datetime
  position:
    regex: "POSN?\\s*[:=]\\s*(?P<v>.+?)$"
    parse: coordinates
  speed_kn:
    regex: "(?:AVG\\s*)?SPEED\\s*[:=]\\s*(?P<v>[\\d.]+)"
    parse: float
  distance_run_nm:
    regex: "(?:DIST(?:ANCE)?\\s*RUN|D\\.?RUN)\\s*[:=]\\s*(?P<v>[\\d.]+)"
    parse: float
  distance_to_go_nm:
    regex: "(?:DTG|DIST(?:ANCE)?\\s*TO\\s*GO)\\s*[:=]\\s*(?P<v>[\\d.]+)"
    parse: float
  eta_next_utc:
    regex: "ETA\\s*(?P<port>[A-Z ]+)?\\s*[:=]\\s*(?P<v>[\\d./:-]+\\s*[\\d:]*)"
    parse: datetime
  rob.VLSFO:
    regex: "(?:VLSFO|LSFO)\\s*(?:ROB)?\\s*[:=]\\s*(?P<v>[\\d.]+)"
    parse: float
  rob.MGO:
    regex: "(?:MGO|LSMGO|DO)\\s*(?:ROB)?\\s*[:=]\\s*(?P<v>[\\d.]+)"
    parse: float
confidence:
  base: 0.95
  required: [reported_at_local, position]   # 이 중 하나라도 없으면 실패 처리
```

### 2.4 좌표 파싱

실무에서 관측되는 표기가 매우 다양합니다. 전용 파서(`core/geo.py`)를 둡니다.

```
지원해야 할 입력 예시
  12-34.5N 123-45.6E
  12°34.5'N 123°45.6'E
  12 34.5 N / 123 45.6 E
  N12-34.5 E123-45.6
  12.575N 123.760E
  LAT 12 34.5 N  LON 123 45.6 E
  1234.5N 12345.6E            (구분자 없음 — DDMM.M 형식)
```

검증 규칙:
- 위도 절댓값 ≤ 90, 경도 절댓값 ≤ 180
- 분(minute) 값 < 60
- **직전 보고 위치로부터의 이동거리 / 경과시간 ≤ 30노트** — 이 검사가 오파싱을 가장 잘 잡아냅니다. 부호나 자릿수를 틀리면 거리가 비현실적으로 커집니다.
- 검증 실패 시 값을 버리지 말고 `parse_warnings`에 기록하고 `parse_confidence`를 낮춥니다.

### 2.5 시간대 처리

**이 프로젝트에서 가장 조용히 틀리기 쉬운 부분입니다.**

- Noon report의 시각은 대개 **선박 현지시(ZT/LT)** 이고 Zone Time 오프셋이 본문 어딘가에 있습니다.
- ETA는 현지시일 수도, 도착항 현지시일 수도, UTC일 수도 있습니다.
- Dataloy 측 값은 UTC로 가정하되 **테넌트 설정을 확인해야 합니다** (미확인 항목).

규칙:
1. 오프셋이 명시되면 그대로 사용.
2. 명시되지 않으면 **위치 경도로 추정**(`round(lon / 15)`)하고 `parse_warnings`에 `"tz_inferred_from_longitude"` 기록.
3. 추정조차 불가하면 `reported_at_utc`를 `None`으로 두고 UTC 비교 대상에서 제외. **임의로 UTC라고 가정하지 않습니다.**

3번이 중요합니다. 모르는 것을 UTC로 가정하면 최대 ±12시간 오차가 ETA 비교에 섞여
불일치 규칙 전체가 오탐을 쏟아냅니다.

### 2.6 첨부 파일

Noon report를 본문이 아니라 **엑셀 양식 첨부**로 보내는 선박이 흔합니다.

- `openpyxl`로 시트를 읽고, 템플릿별 **셀 좌표 매핑**(`{"position": "C7", "speed_kn": "C12"}`)을 YAML에 정의합니다.
- 셀 좌표는 양식 버전이 바뀌면 깨집니다. 따라서 **라벨 기반 탐색**(인접 셀에서 "POSITION" 문자열을 찾아 오른쪽/아래 셀을 읽음)을 기본으로 하고, 셀 좌표는 폴백으로 둡니다.
- PDF 첨부는 v1 범위 밖으로 두되, 발생 빈도를 계측해서 필요하면 v2에서 추가합니다.

### 2.7 LLM 폴백 (L3)

`parsing/llm.py`는 MCP 도구 `fleet_parse_report`로 노출됩니다.
Claude가 원문을 읽고 `VesselReport` 스키마에 맞춰 추출합니다.

안전 규칙:
- 메일 본문은 **데이터로만** 취급합니다. 본문 안의 문장을 지시로 해석하지 않습니다.
- 추출 결과는 반드시 **스키마 검증 + 2.4의 물리적 타당성 검사**를 통과해야 채택합니다.
- `parse_confidence`는 0.8을 넘기지 않습니다 (L1 템플릿보다 항상 낮게). 규칙 엔진이 저확신 값에 대해 CRITICAL 경보를 내지 않도록 하기 위함입니다.
- 결과는 `message_id` 기준으로 캐시합니다. 같은 메일을 두 번 LLM에 보내지 않습니다.

## 3. 검색 질의 설계

Claude가 Outlook을 직접 제어하므로, 검색은 넓게 시작해 좁혀가는 방식이 됩니다.

권장 1차 질의 키워드 (한 번에 하나씩 OR 조합):
```
noon report, noon, daily report, position report,
arrival, EOSP, departure, COSP, NOR, notice of readiness,
all fast, berthed, anchored, commenced, completed,
SOF, statement of facts, cargo operation, working report
```

다만 **키워드 검색만으로는 놓치는 메일이 반드시 생깁니다.**
따라서 v1의 기본 전략은 "특정 폴더 + 기간"으로 전량을 가져와
리포트 여부 판정을 파싱 단계에서 수행하는 것입니다.
키워드는 폴더가 방대할 때의 좁히기 수단으로만 씁니다.

Phase 1에서 **실제 메일함 구조와 발신 패턴을 먼저 관찰**한 뒤 이 전략을 확정합니다.
그 전에 검색 로직을 정교하게 만드는 것은 추측에 근거한 낭비입니다.
