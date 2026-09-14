# 05. 매칭과 불일치 검출

> **초기 설계 이력 — 현재 구현 기준 아님.** 이 문서는 v2 이전 초안입니다. 현재 기준은 [재설계 v2](ARCHITECTURE-V2.ko.md)이며, 충돌하는 내용은 v2가 우선합니다. [검토 결과](REVIEW-CLAUDE-DESIGN.ko.md)와 [Phase 0 확인 기록](PHASE-0-DESIGN.ko.md)을 함께 확인하세요.

이 문서가 **시스템의 핵심 가치**를 정의합니다.
지도와 카드는 보기 좋은 껍데기이고, 실제로 일을 줄여주는 것은 여기입니다.

## 1. 선박 동일성 판정

메일에 적힌 선박명을 Dataloy의 선박 마스터에 연결해야 합니다.

### 단계별 판정

```
1. IMO 번호가 본문/제목에 있으면 → 즉시 확정 (confidence 1.0)
2. 선박명 정규화 후 완전 일치  → 확정 (confidence 0.95)
3. alias 테이블 조회           → 확정 (confidence 0.95)
4. 퍼지 매칭 (rapidfuzz)       → 임계값 이상이면 후보 (confidence = score)
5. 실패                        → unmatched 큐
```

### 정규화 규칙

```python
def normalize_vessel_name(raw: str) -> str:
    """
    "M/V  Pacific-Glory " → "PACIFIC GLORY"
    """
    s = raw.upper()
    s = re.sub(r"^(M[./]?[VSTV]|MT|MS|SS)\s*[.:-]?\s*", "", s)   # 접두 선급 표기 제거
    s = re.sub(r"[^A-Z0-9]+", " ", s)                            # 특수문자 → 공백
    return " ".join(s.split())
```

주의할 실패 사례:
- **선대에 유사 이름이 있으면 퍼지 매칭이 위험합니다.** `PACIFIC GLORY`와 `PACIFIC GLORY II`는 편집거리가 가깝습니다.
- 대응: 퍼지 매칭은 **1위와 2위의 점수 차가 충분할 때만** 채택합니다(`top1 - top2 >= 0.15`). 그렇지 않으면 unmatched로 보냅니다.
- 잘못 매칭된 리포트는 다른 배의 지도 위치를 틀리게 만듭니다. **매칭 실패보다 오매칭이 훨씬 나쁩니다.** 보수적으로 갑니다.

### alias 축적

사람이 unmatched 항목을 해소하면 그 표기를 `vessels.aliases_json`에 추가합니다.
같은 표기가 다시 오면 3단계에서 바로 잡힙니다.

## 2. 항차 귀속

선박이 정해지면 어느 항차인지 결정합니다.

```
1. 메일에 항차번호가 있고 Dataloy voyage_no와 일치 → 확정
2. reported_at_utc가 어느 OPR 항차의 기간에 포함  → 확정
3. OPR 항차가 정확히 1개                          → 그 항차로 귀속
4. 경계 시점(항차 전환 전후 24h)                   → 위치 근접도로 판정
5. 실패                                           → 선박에만 귀속, 항차 미정
```

5번도 유효한 결과입니다. 항차를 몰라도 **위치와 상태는 지도에 표시할 수 있습니다.**
불일치 검출만 건너뜁니다.

## 3. 기항지 귀속

Port event 리포트(도착/접안/출항)는 어느 `PortCall`에 속하는지 정해야 합니다.

```
1. 메일의 항구명 ↔ PortCall.port_name 정규화 비교
2. 동일 항구에 기항이 여러 번이면 시각 근접도로 선택
3. 항구명이 UN/LOCODE면 코드로 직접 매칭
4. 실패 시 위치 좌표와 PortCall 좌표의 거리로 추정 (50nm 이내)
```

## 4. 파생 상태 판정

`VesselStatus`는 **최신 이벤트 + Dataloy 기항지 상태**를 조합해 결정합니다.

| 조건 | 판정 |
|---|---|
| 최신 이벤트가 `COMMENCED_CARGO`이고 `COMPLETED_CARGO` 없음 | `IN_PORT_WORKING` |
| `ALL_FAST` 있고 하역 개시 없음 | `IN_PORT_IDLE` |
| `ANCHORED` 있고 이후 `ALL_FAST` 없음 | `AT_ANCHOR`, 다음 기항지가 확정이면 `WAITING_BERTH` |
| `DEPARTURE`/`COSP` 이후 최신 NOON 존재, 속력 > 3kn | `AT_SEA_*` (화물 유무로 LADEN/BALLAST) |
| 최신 NOON 속력 < 1kn, 항만 이벤트 없음 | `DRIFTING` |
| `BUNKERING` 진행 중 | `BUNKERING` |
| 판정 근거 없음 | `UNKNOWN` |

LADEN/BALLAST 구분은 Dataloy의 `reasonForCall`(L=Loading, D=Discharging)과
최근 하역 이벤트로 판정합니다.

**모든 판정은 `status_reason` 문자열을 함께 생성합니다.** 근거를 말할 수 없는 상태 표시는
사용자에게 신뢰받지 못하고, 결국 아무도 보지 않게 됩니다.

## 5. ETA 자체 계산

Dataloy ETA, 본선 신고 ETA 외에 **세 번째 값**을 계산해 교차 검증합니다.

```python
def compute_eta(last: VesselReport, dest: PortCall) -> datetime | None:
    if not (last.position and dest.port_lat is not None):
        return None
    dist_nm = route_distance(last.position, (dest.port_lat, dest.port_lon))
    speed   = last.speed_kn or planned_speed(voyage)
    if speed < 1.0:
        return None                       # 정지 중이면 계산 무의미
    hours = dist_nm / speed
    return last.reported_at_utc + timedelta(hours=hours)
```

### 거리 계산

- **v1: 대권거리(haversine) × 보정계수 1.15** — 단순하지만 육지를 통과합니다. 수에즈/파나마/말라카가 낀 구간은 크게 틀립니다.
- **v2: `searoute-py`** — 실제 항로 그래프 기반. 정확하지만 의존성이 늘어납니다.

v1에서는 계산 ETA에 **"근사"라는 표시를 UI에 명시**하고, 불일치 규칙에서는
보조 근거로만 씁니다(단독으로 CRITICAL을 내지 않음). 부정확한 계산으로 오탐을 내면
규칙 엔진 전체의 신뢰를 잃습니다.

## 6. 불일치 규칙

### 설계 원칙

> **조용하게 시작해서 점진적으로 민감하게.**

초기에는 확실한 것만 잡습니다. 오탐이 쌓이면 사용자는 대시보드를 닫습니다.
각 규칙은 `enabled`와 임계값을 설정 파일로 빼서 운영 중 조정 가능하게 합니다.

### 규칙 목록

| ID | 규칙 | 조건 | 심각도 | v1 |
|---|---|---|---|---|
| **R-001** | ETA 차이 | 본선 신고 ETA와 Dataloy ETA 차이 ≥ 12h | WARN (≥24h: CRITICAL) | ✅ |
| **R-002** | 이벤트 누락 | 본선이 항만 이벤트를 보고했으나 Dataloy `eventLogs`에 대응 이벤트 없음 (12h 경과) | CRITICAL | ✅ |
| **R-003** | 리포트 미수신 | OPR 항차인데 최신 리포트가 30h 초과 | WARN (48h: CRITICAL) | ✅ |
| **R-004** | ROB 불일치 | 본선 보고 ROB와 Dataloy EventLog ROB 차이 > 5% | WARN | ✅ |
| **R-005** | 기항 순서 불일치 | 실제 기항 순서가 Dataloy `portCallSequence`와 다름 | CRITICAL | ✅ |
| **R-006** | 리포트 전무 | OPR 항차인데 해당 기간 리포트 0건 | CRITICAL | ✅ |
| **R-007** | ATA/ATD 미입력 | 본선 도착/출항 보고 후 24h 경과했으나 Dataloy `ata`/`atd` 공란 | WARN | ✅ |
| **R-008** | ETA 계산 괴리 | 자체 계산 ETA와 Dataloy ETA 차이 ≥ 24h | INFO | ✅ |
| **R-009** | 미파싱 리포트 | `parse_confidence` < 0.5 또는 미파싱 큐에 적체 | INFO | ✅ |
| **R-010** | 항차 미귀속 | 선박은 매칭됐으나 항차 귀속 실패 | INFO | ✅ |
| **R-011** | 속력 이상 | 계획 속력 대비 ±30% 이탈이 3일 연속 | INFO | v2 |
| **R-012** | 항로 이탈 | 위치가 다음 기항지 방향에서 벗어남 | INFO | v2 |
| **R-013** | 체선 장기화 | `WAITING_BERTH` 상태 72h 초과 | WARN | v2 |
| **R-014** | 하역 후 미출항 | `COMPLETED_CARGO` 후 24h 경과, 출항 보고 없음 | INFO | v2 |

### 규칙 구현 형태

```python
@dataclass
class RuleContext:
    voyage_state: VoyageState
    reports: list[VesselReport]        # 해당 항차의 리포트 (시간 역순)
    port_calls: list[PortCall]
    event_logs: list[EventLog]
    config: RuleConfig

class Rule(Protocol):
    id: str
    default_severity: Severity
    def evaluate(self, ctx: RuleContext) -> list[Discrepancy]: ...
```

규칙은 각각 독립 함수이고, 하나가 예외를 던져도 **다른 규칙 평가를 막지 않습니다.**
실패한 규칙은 로그와 `R-000` 내부 오류 항목으로 기록합니다.

### 오탐 억제 장치

| 장치 | 목적 |
|---|---|
| `parse_confidence` 게이트 | 확신도 0.7 미만 값으로는 CRITICAL을 내지 않음 |
| `fingerprint` 중복 제거 | 같은 문제가 매일 새 항목으로 쌓이지 않음 |
| `status='ignored'` 유지 | 사용자가 무시한 항목은 재검출해도 다시 뜨지 않음 |
| grace period | 각 규칙에 유예 시간(기본 12h). 입력 지연을 정상으로 인정 |
| 시간대 미확정 값 제외 | `reported_at_utc`가 `None`이면 시간 관련 규칙을 건너뜀 |

마지막 장치가 특히 중요합니다. `03-outlook-adapter.md` 2.5에서 설명한 대로,
시간대를 모르면 UTC로 가정하지 않고 **비교 자체를 하지 않습니다.**

## 7. 일일 브리핑 생성

`fleet_daily_brief(date)`가 반환할 구조:

```
1. 헤드라인
   - 운항 중 N척 / 리포트 지연 M척 / CRITICAL 불일치 K건
2. 즉시 조치 필요 (CRITICAL)
   - 선박별로 무엇이, 왜, 근거 메일은 무엇인지
3. 확인 권장 (WARN)
4. 선박별 한 줄 요약
   - "PACIFIC GLORY | 항해 중(적하) | 12.5N 123.7E | 싱가포르 ETA 09-16 08:00Z (계획 대비 +14h) | 리포트 3h 전"
5. 파싱 실패 / 미귀속 항목
```

4번의 한 줄 요약이 사용자가 실제로 매일 읽을 유일한 부분일 가능성이 높습니다.
**계획 대비 편차를 괄호 안에 넣는 것**이 이 줄의 핵심입니다.
