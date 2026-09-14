# 00. 개요 — 문제 정의와 범위

## 1. 해결하려는 문제

선박 운항 관리에서 정보는 두 곳에 나뉘어 존재합니다.

| 소스 | 성격 | 문제 |
|---|---|---|
| **Dataloy VMS** | 계획·정산의 기준. 항차, 기항지 순서, ETA/ETD, 화물, 이벤트 로그 | 사람이 수기로 갱신하므로 **지연되거나 누락**됨 |
| **Outlook (VMware 내부)** | 본선이 실제로 보내오는 noon report, port report, working report | 메일함에 흩어져 있어 **한눈에 볼 수 없고 집계 불가** |

담당자는 매일 아침 이 두 곳을 수동으로 오가며 대조합니다.
이 작업은 반복적이고, 누락되기 쉽고, 선대 규모에 비례해 시간이 늘어납니다.

## 2. 이 시스템이 하는 일

1. **수집** — Dataloy에서 Operational(OPR) 항차를 가져오고, 그 항차에 해당하는 본선 보고 메일을 Outlook에서 검색
2. **정규화** — 제각각인 메일 포맷을 하나의 `VesselReport` 스키마로 변환
3. **매칭** — 어느 메일이 어느 선박의 어느 항차에 속하는지 결정
4. **대조** — Dataloy의 계획값과 본선 보고 실적값을 비교하여 차이를 규칙으로 검출
5. **표현** — 지도 위 현재 포지션 + 선박별 상태 카드 + 불일치 목록

## 3. 범위

### 포함 (v1)
- Dataloy **읽기 전용** 연동 (OPR 항차, 기항지, 이벤트 로그, 선박 마스터)
- Outlook 검색·조회 (Claude가 MCP 도구로 직접 제어)
- Noon / Arrival / Departure / Port event / Working(SOF) 리포트 파싱
- 선박-항차 매칭 및 불일치 규칙 엔진
- 지도 기반 웹 대시보드 + 선박 상세 타임라인
- MCP 도구 세트 (Claude가 자연어로 질의·분석)

### 제외 (v1)
- **Dataloy 쓰기** — 자동 입력은 오입력 리스크가 크므로 v1에서는 "차이를 알려주기"까지만. 쓰기는 v2에서 사람 승인 게이트와 함께.
- AIS 실시간 위치 연동 — 별도 유료 소스이며 본선 보고만으로도 일일 단위 목적은 충족
- 용선료·정산·Laytime 계산
- 모바일 전용 앱

## 4. 용어

| 용어 | 설명 |
|---|---|
| **Voyage** | Dataloy의 항차. `voyageHeader.voyageStatus.statusTypeCode`로 상태 구분 (OPR=Operational, NOM=Nominated, EST=Estimate) |
| **PortCall** | 항차 내 기항 단위. `portCallSequence`로 순서 지정 |
| **EventLog** | PortCall에 붙는 이벤트(도착, 접안, 하역 개시/완료, 출항 등)와 시각 |
| **Noon Report** | 본선이 매일 정오(선박 현지시) 보내는 위치·속력·소모·잔량 보고 |
| **Port Report** | 입항/접안/NOR/출항 등 항만 이벤트 발생 시 보고 |
| **Working Report / SOF** | 하역 작업 진행 상황, Statement of Facts |
| **ROB** | Remaining On Board. 연료·청수 잔량 |
| **EOSP / COSP** | End of Sea Passage / Commencement of Sea Passage |
| **NOR** | Notice of Readiness |
| **Reconciliation** | 본 시스템에서 Dataloy 계획값과 본선 보고 실적값을 대조하는 행위 |
| **Discrepancy** | 대조 결과 검출된 차이 항목 |

## 5. 성공 기준

설계가 옳았는지 판단할 기준을 미리 정합니다.

| 기준 | 목표 |
|---|---|
| 아침 확인 시간 | 선대 전체 상태 파악을 **5분 이내** |
| 파싱 커버리지 | 수신 리포트의 **90% 이상**을 사람 개입 없이 구조화 |
| 위치 정확도 | 최신 noon 위치가 대시보드에 **누락 없이** 표시 |
| 불일치 검출 | Dataloy 이벤트 누락을 **당일 내** 발견 |
| 오탐 | CRITICAL 경보의 오탐률 **10% 미만** (오탐이 많으면 아무도 안 봄) |

마지막 기준이 가장 중요합니다. 경보가 시끄러우면 시스템 전체가 무시됩니다.
규칙 엔진은 **조용하게 시작해서 점진적으로 민감하게** 조정하는 방향으로 설계합니다.
