# Claude 설계 검토 — VMwareconnect

검토일: 2026-09-14. 기준 브랜치: `claude/eager-goodall-zoaen3`.
기준 커밋: `49f760dde3326067fe2cde5ca8f6c5f7ccf868c2`.

GitHub의 README 및 docs/00~09 문서 전체를 검토했다. 기준 커밋에는 실행 코드나 테스트가 없으므로 아래는 구현 결함이 아닌 **설계 검토 결과**다. 실제 VMware, 메일함, Dataloy 테넌트에 접속하여 검증한 결과는 아니다.

원본: [검토한 docs 디렉터리](https://github.com/Steventhemaster/VMwareconnect/tree/49f760dde3326067fe2cde5ca8f6c5f7ccf868c2/docs).
대체 설계: [ARCHITECTURE-V2.ko.md](ARCHITECTURE-V2.ko.md).

## 유지할 좋은 결정

Outlook 어댑터 추상화, 원문 보관, 결정적 파서 우선, 미귀속 큐, Dataloy 읽기 전용, API/MCP 공통 서비스 계층, 조치 목록 중심 UI, 위치 신선도 표시, 날짜변경선 처리, 환경 검증을 먼저 하는 로드맵은 유지한다. 원본에 이러한 장치가 이미 있으므로 새 제안으로 중복 주장하지 않는다.

## 반드시 수정할 사항

| 우선순위 | 원본 근거 | 문제 및 실제 실패 예 | 재설계 결정 |
|---|---|---|---|
| P0 | 01 §4, 03 §1.3, 06 §3 | 일일 수집이 VM 내 Claude의 대화형 호출에 의존. 대화가 없으면 다음 날 데이터가 멈춘다. | 스케줄러·지속 작업 큐·체크포인트가 수집 실행. MCP는 동일 서비스를 호출하는 질의/관리 인터페이스. |
| P0 | 01 §1, 09 B/D | VM은 사내망, 외부만 Dataloy 접근 가능하다는 토폴로지가 확인되지 않은 전제다. | 접근성 표를 먼저 작성. 양쪽 소스 접근이 가능한 사내 실행 위치를 우선하고 필요할 때만 경계를 분리. |
| P0 | 03 §1.2 | COM을 v1 기본값으로 선택하면서 Classic/New Outlook, 비영구 VDI 및 로그오프 복구 조건이 빠져 있다. | Graph 사용 가능 여부를 먼저 확인. COM은 Classic Outlook 사용자 세션에 종속된 조건부 경로. 무인 서버 실행을 가정하지 않음. |
| P0 | 02 §2.1~2.2 | 메일 한 통 중심의 단일 `port_event` 및 ARRIVAL/EOSP, DEPARTURE/COSP의 동일시. SOF 한 통에 여러 이벤트가 있으면 손실·오대조 가능. | 메일→문서→보고서→관측값/이벤트 다대 관계. ARRIVAL, EOSP, COSP, DEPARTURE를 각각 보존하고 테넌트 의미 사전으로 비교. |
| P0 | 03 §2.5, 08 Phase 2 | 경도/15 시간대 추정값이 UTC 비교에 들어갈 수 있음. 선박시와 도착항시가 다르면 ETA 오탐. | 필드별 시간 근거 저장. 시간대 미확정은 비교 보류. 경도 추정은 공식 시각으로 승격하지 않음. |
| P0 | 05 §2~3 | OPR 항차가 하나면 확정, 항구 50nm 근접으로 추정. 이전 항차 지연 보고와 인접 항만을 잘못 연결할 수 있음. | OPR은 표시 대상. 매칭 후보에는 이전/다음 항차를 포함. 시간·항차번호·기항 맥락을 함께 검증하고 후보가 모호하면 보류. |
| P0 | 00 §1, 06 §5, 07 §4 | Dataloy를 계획으로 통칭하지만 ATA/ATD와 고정 이벤트는 실적 의미일 수 있음. ETD 존재만으로 실적 누락처럼 표시. | Dataloy 계획/예측, Dataloy 등록 실적, 본선 보고를 분리. 이벤트 발생 증거와 유예기간 없이는 실적 누락 판정 금지. |
| P0 | 04 §3 | Dataloy Vessel Report 사용 시 이메일을 누락 보완용으로만 축소. 같은 보고를 Dataloy와 대조해야 한다는 목적이 약해짐. | 이메일과 Dataloy를 독립적으로 수집·비교하고 동일 보고에서 유래한 두 값은 독립 검증으로 세지 않음. |
| P0 | 04 §6, 05 R-002/003/006 | 부분 동기화·로그오프 때문에 못 읽은 데이터가 ‘이벤트 누락/본선 미보고’로 보일 수 있음. | 소스별 coverage와 성공 체크포인트를 평가 전제에 포함. 장애는 SOURCE_UNAVAILABLE, 정보 부족은 INSUFFICIENT_DATA. |
| P1 | 02 SQL sync_state | `adapter` 단독 PK이면 같은 어댑터의 폴더별 커서를 보존할 수 없음. | connector+mailbox/store+folder+query_version 복합 식별. |
| P1 | 02 SQL emails_raw | Internet Message-ID 전역 UNIQUE와 이동 가능한 message_id PK만으로 복사·전달·수정 관계를 표현하기 어려움. | 원본 위치 식별, 내용 버전, 논리적 보고 중복을 별도 계층으로 분리. |
| P1 | 03 §2.7 | message_id만으로 파싱 캐시. 파서 개선·첨부 변경 뒤에도 과거 결과 고착. LLM 0.8 상한은 CRITICAL 0.7 게이트와도 목적이 불일치. | 내용 해시+파서/스키마/프롬프트 버전으로 캐시. 중요한 필드별 검증 상태와 실측 평가 사용. |
| P1 | 02 §3, 05 §6 | 핵심값 해시가 바뀔 때 경보가 새로 생성되고 ignored는 영구 유지. 확인함과 해결됨도 혼재. | 문제의 안정적 식별자+평가 이력. ACK는 미해결, suppression은 범위·만료 포함, 재평가로만 자동 해결. |
| P1 | 02 §4, 01 §5 | JSONL count만으로 전송 완료·무결성·재전송·정정 순서·ack를 처리할 수 없음. | 인증된 배치 manifest, 해시, 원자적 완료 표시, idempotent inbox/outbox, ACK 후 전송 큐 정리. |
| P1 | 05 §4~5 | 낮은 속력만으로 DRIFTING, 기항 목적만으로 LADEN/BALLAST 추정. 대권거리×1.15 ETA는 항로에 따라 크게 틀림. | 운항/화물/작업 상태 분리. 근거 없으면 UNKNOWN. v1 자동 계산 ETA는 기본 비활성. |
| P1 | 05 R-004 | 서로 다른 시각의 ROB를 5% 기준으로 비교하면 정상 소비도 불일치. | 같은 이벤트·유종·단위·관측시각에서만 비교. near-zero 절대 허용오차 포함. |
| P1 | 07 §1/4, 09 E | ‘한 클릭 근거’ 목표지만 실제로 다른 Claude 세션에 물어야 함. 인증도 보류. | 원문 조회 가능 위치를 설계 단계에 확정. 공유 배포에서는 인증·선대 범위 권한을 v1 필수로 구현. |

## 공개 문서로 바로 정정 가능한 부분

- Dataloy 원본 04 §2.1은 GT/LT 등을 미확인으로 두지만, 공식 Filtering 문서에 GT/GTE/LT/LTE 및 날짜 변경 조회 예제가 있다. 정확한 테넌트 필드와 자식 변경 전파 여부는 여전히 검증 대상이다. [Dataloy Filtering](https://api.dataloy.com/dataloy-rest-api/filtering)
- 공식 Vessel Report 안내의 개요는 `PositionReport`를 지칭한다. 원본의 `VesselReport` 리소스명·페이로드를 확정 계약으로 사용하면 안 된다. 현재 테넌트의 API 버전 및 조회 리소스를 확인해야 한다. [Vessel Report 문서 입구](https://api.dataloy.com/user-guides/vessel-report)
- Dataloy Schedule API는 EventLog의 `isDateFixed`를 다룬다. 날짜 필드 이름만으로 계획/실적을 결정할 수 없다는 근거이며, 이것만으로 모든 이벤트의 실적 의미가 확정되는 것도 아니다. [Schedule API](https://api.dataloy.com/user-guides/schedule-api)
- Graph 메일 delta는 폴더별로 추적하고 nextLink를 끝까지 따라간 뒤 deltaLink를 저장한다. 일반 검색과 증분 수집은 같은 기능이 아니다. [Graph delta](https://learn.microsoft.com/en-us/graph/delta-query-messages)
- Graph ImmutableId도 동일 mailbox 범위에서 안정적이며, archive mailbox 이동·재가져오기는 예외다. [Immutable identifiers](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)
- Microsoft는 Outlook Object Model의 Windows Service 사용을 지원하지 않으며 Office 비대화형 무인 자동화의 한계를 명시한다. New Outlook은 COM add-in을 지원하지 않는다. 따라서 COM 실행 조건은 별도 실증해야 한다. [Outlook API 선택](https://learn.microsoft.com/en-us/office/client-developer/outlook/selecting-an-api-or-technology-for-developing-solutions-for-outlook), [Office 무인 실행](https://learn.microsoft.com/en-us/office/client-developer/integration/considerations-unattended-automation-office-microsoft-365-for-unattended-rpa), [New Outlook 확장](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/one-outlook)

## 판단

원본은 PoC 설계의 출발점으로 유용하다. 실운영 전에는 **수집의 지속성, 시간·항차·이벤트의 의미, 부분 실패 처리, 정정 이력**을 먼저 보강해야 한다. 컴포넌트를 많이 추가하는 것보다 잘못된 ‘정상/누락/현재 위치’를 만들지 않는 것이 우선이다.
