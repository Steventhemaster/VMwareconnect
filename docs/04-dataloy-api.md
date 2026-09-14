# 04. Dataloy VMS API 연동

> 아래 내용은 공개된 Dataloy VMS API 문서(https://api.dataloy.com)를 근거로 작성했습니다.
> 다만 **테넌트마다 base URL, API 버전, 활성화된 모듈, 상태 코드값이 다를 수 있습니다.**
> Phase 0에서 실제 테넌트로 검증하기 전까지는 모두 가설로 취급합니다.
> 미확인 항목은 `09-open-questions.md`에 정리되어 있습니다.

## 1. 인증

Dataloy는 OAuth 2.0 `client_credentials`를 사용합니다.
신규 고객은 OAuth 2.0으로 설정되지만, 여러 고객을 대상으로 하는 통합은
**Basic 인증도 함께 지원**해야 한다고 문서에 명시되어 있습니다.

```
POST {token_url}
  grant_type=client_credentials
  client_id={M2M_CLIENT_ID}
  client_secret={M2M_CLIENT_SECRET}
  audience=https://dataloy        # 운영
  audience=https://dataloy.dev    # 테스트/개발
```

발급된 토큰은 Bearer로 전달합니다.

```
Authorization: Bearer {access_token}
```

### 클라이언트 설계

```python
class DataloyAuth(ABC):
    def headers(self) -> dict[str, str]: ...

class OAuth2Auth(DataloyAuth):
    """토큰 캐시 + 만료 60초 전 선제 갱신 + 401 시 1회 강제 갱신 후 재시도"""

class BasicAuth(DataloyAuth):
    """레거시 테넌트 대응"""
```

두 방식을 인터페이스로 분리해 두면 테넌트 확인 결과에 따라 설정만 바꾸면 됩니다.
자격증명은 환경변수(`DATALOY_CLIENT_ID`, `DATALOY_CLIENT_SECRET`, `DATALOY_TOKEN_URL`,
`DATALOY_BASE_URL`, `DATALOY_AUDIENCE`)로 주입하고 저장소에 커밋하지 않습니다.

## 2. 리소스와 질의

엔드포인트는 `{base_url}/ws/rest/{Resource}` 형태입니다.
모든 리소스는 **자기 속성과 연결된 리소스의 속성 모두에 대해 필터링**을 지원합니다.

### 2.1 필터 문법

```
?filter={속성경로}({연산자}){값}
```

| 연산자 | 의미 |
|---|---|
| `EQ` | 같음 |
| `NE` | 다름 |
| `IN` | 목록 포함 |

확인된 실제 예시:

```http
# Operational 항차만
GET /ws/rest/Voyage?filter=voyageHeader.voyageStatus.statusTypeCode(EQ)OPR

# Nominated + Operational 기항지
GET /ws/rest/PortCall?filter=voyage.voyageHeader.voyageStatus.statusTypeCode(IN)(NOM,OPR)

# 견적 제외
GET /ws/rest/Voyage?filter=voyageHeader.voyageStatus.statusTypeCode(NE)EST

# 특정 선박
GET /ws/rest/PortCall?filter=voyage.vessel.imoNumber(EQ)9123456
```

> `LT`/`GT`/`LIKE` 등 추가 연산자의 존재 여부는 미확인입니다.
> 날짜 범위 필터가 필요하므로 Phase 0에서 반드시 확인합니다.
> 지원되지 않으면 클라이언트 측에서 필터링합니다 (데이터 양이 작아 실용상 문제없음).

### 2.2 페이지네이션

기본 반환 한도는 **2000건**입니다. 초과 시 페이지네이션이 필요합니다.
클라이언트는 항상 페이지네이션을 전제로 구현하고, 한 번에 500건씩 가져옵니다.

```python
def paginate(self, resource: str, **params) -> Iterator[dict]:
    """한도에 걸리지 않도록 항상 분할 요청. 마지막 페이지까지 소진."""
```

### 2.3 사용할 리소스 (읽기 전용)

| 리소스 | 용도 |
|---|---|
| `Voyage` | OPR 항차 목록, 항차 번호, 상태, 선박 참조 |
| `PortCall` | 기항지 순서, 항구, `reasonForCall`, ETA/ETD, `eventLogs` |
| `Vessel` | 선박 마스터 (이름, IMO, 콜사인) — 메일↔선박 매칭의 기준 |
| `EventLog` | 기항지별 이벤트(도착/접안/하역/출항)와 시각 |
| `Port` | 항구 코드·좌표 (지도 표시 및 거리 계산용) |

문서에 따르면 `PortCall`의 `EventLog`는 **ROB와 연결**되어 특정 이벤트 시점의
연료 잔량(예: 도착 시 FO)을 담을 수 있습니다. 이는 본선 보고의 ROB와
직접 대조할 수 있는 지점이므로 규칙 `R-004`에서 활용합니다.

**v1에서 쓰기 도구는 정의하지 않습니다.** 도구 자체가 없으면 실수로 호출될 수 없습니다.

### 2.4 항차 상태 코드

| 코드 | 의미 |
|---|---|
| `EST` | Estimate (견적) |
| `NOM` | Nominated (지명) |
| `OPR` | **Operational (운항 중)** ← 본 시스템의 주 대상 |

> 코드값이 테넌트별로 커스터마이즈 가능한지 미확인입니다.
> `VoyageStatus` 리소스를 먼저 조회해 실제 코드 목록을 확인한 뒤 상수를 확정합니다.
> 코드를 하드코딩하지 말고 설정으로 뺍니다.

## 3. Vessel Report API

Dataloy에는 **본선 보고를 받는 별도 API**가 존재합니다.
확인된 페이로드 형태:

```json
{
  "vesselReportType": "NOON",
  "reportDateLocal": "2026-09-14T12:00:00",
  "portCall": { "key": "..." },
  "latitude": 12.575,
  "longitude": 123.760,
  "foRob": 421.3,
  "mgoRob": 88.2,
  "lsFoRob": 310.0,
  "eventLogs": [ { "eventLogDate": "...", "event": { "code": "ETA" } } ]
}
```

### 이것이 설계에 주는 함의

**이 테넌트에서 Vessel Report API가 이미 사용 중이라면, 메일 파싱 부담이 크게 줄어듭니다.**
일부 선박이 이미 이 경로로 보고를 올리고 있을 수 있기 때문입니다.

Phase 0에서 반드시 확인할 것:
1. 이 테넌트에 Vessel Report 모듈이 활성화되어 있는가
2. 최근 30일간 `VesselReport` 레코드가 존재하는가, 어느 선박에 대해서인가

결과에 따라 전략이 갈립니다.

| 확인 결과 | 전략 |
|---|---|
| Vessel Report가 활발히 사용 중 | **Dataloy를 1차 소스로** 삼고, 메일은 Dataloy에 없는 선박·기간을 메우는 보완재로 사용. 파싱 부담 대폭 감소 |
| 일부만 사용 | 선박별로 소스 우선순위를 다르게 적용. `VesselReport.source`로 구분 |
| 미사용 | 설계대로 메일 파싱이 주 경로. (기본 가정) |

또한 중장기적으로는 **메일에서 파싱한 결과를 Vessel Report API로 Dataloy에 되먹이는**
경로가 열립니다. 이것이 v2의 쓰기 기능이며, 사람 승인 게이트를 반드시 둡니다.

## 4. Webhook

Dataloy는 `WebhookSubscription` 리소스로 웹훅을 지원합니다.
Voyage 구독 시 해당 객체와 **하위 객체 계층의 모든 변경**이 푸시됩니다.

동작 특성:
- 구독 시스템이 응답하지 않거나 지연되면 **1분 간격 5회 재시도 후 구독을 비활성화**합니다 (재시도 횟수·간격은 설정 가능).

### v1에서는 웹훅을 쓰지 않습니다

이유:
1. 외부 환경에 **공인 인바운드 엔드포인트**가 필요합니다. 사내망 배포에서는 대개 불가합니다.
2. 구독이 조용히 비활성화되면 데이터가 멈추는데 이를 알아채기 어렵습니다.
3. 목적이 **일일 단위 브리핑**이므로 폴링으로 충분합니다.

대신 폴링 주기를 설정 가능하게 두고(기본 1시간), 인바운드가 가능한 환경으로 옮겨갈 때
웹훅을 추가 경로로 붙일 수 있도록 `dataloy/sync.py`를 소스 중립적으로 작성합니다.

## 5. 동기화 전략

```python
def sync_operational(self) -> SyncResult:
    """
    1. Voyage?filter=voyageHeader.voyageStatus.statusTypeCode(EQ)OPR  → 대상 항차
    2. 각 항차의 PortCall (+ eventLogs) 조회
    3. Vessel 마스터 갱신 (신규 선박 등록 / alias 축적)
    4. Port 좌표 캐시 (거의 안 변하므로 장기 캐시)
    5. raw_json 통째로 보관  ← 매퍼 개선 시 재처리 가능
    """
```

- `raw_json`을 항상 보관합니다. 필드 매핑은 테넌트 확인 후 바뀔 가능성이 높고, 그때 API를 다시 호출하지 않아도 되게 하기 위함입니다.
- 회계 통합 가이드에 언급된 **"마지막 실행 이후 변경된 항차" 조회**를 쓸 수 있으면 증분 동기화로 전환합니다. 가능 여부는 Phase 0에서 확인합니다.
- Port 좌표를 Dataloy가 제공하지 않으면 UN/LOCODE 공개 데이터셋으로 보완합니다.

## 6. 오류 처리

| 상황 | 처리 |
|---|---|
| 401 | 토큰 1회 강제 갱신 후 재시도. 재실패 시 자격증명 문제로 보고 |
| 429 / 5xx | 지수 백오프 재시도 (2s, 4s, 8s, 16s), 최대 4회 |
| 타임아웃 | 요청당 30초. 페이지 단위로 실패하므로 부분 성공을 허용하고 결과에 명시 |
| 스키마 불일치 | 예외로 중단하지 않음. `raw_json`은 저장하고 매핑 실패를 경고로 기록 |

마지막 항목이 중요합니다. Dataloy가 필드를 하나 바꿨다고 해서
아침 브리핑 전체가 실패하면 안 됩니다. **부분 실패를 표시하되 나머지는 보여줍니다.**

## 출처

- [Dataloy VMS API — Authentication / Authorization](https://api.dataloy.com/dataloy-rest-api/authentication-authorization)
- [Dataloy VMS API — Getting Started](https://api.dataloy.com/dataloy-rest-api/getting-started)
- [Dataloy VMS API — Filtering](https://api.dataloy.com/dataloy-rest-api/filtering)
- [Dataloy VMS API — Data Model](https://api.dataloy.com/dataloy-rest-api/data-model)
- [Dataloy VMS API — Webhooks](https://api.dataloy.com/dataloy-rest-api/webhooks)
- [Dataloy VMS API — Vessel Report](https://api.dataloy.com/user-guides/vessel-report)
- [Dataloy VMS API — Schedule API](https://api.dataloy.com/user-guides/schedule-api)
- [Dataloy VMS API — Accounting Integration: Voyages](https://api.dataloy.com/user-guides/accounting-integration-api/voyages)
