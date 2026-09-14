# 08. 구현 로드맵

> **초기 설계 이력 — 현재 구현 기준 아님.** 이 문서는 v2 이전 초안입니다. 현재 기준은 [재설계 v2](ARCHITECTURE-V2.ko.md)이며, 충돌하는 내용은 v2가 우선합니다. [검토 결과](REVIEW-CLAUDE-DESIGN.ko.md)와 [Phase 0 확인 기록](PHASE-0-DESIGN.ko.md)을 함께 확인하세요.

## 원칙

**가장 불확실한 것을 가장 먼저 검증합니다.**

이 프로젝트에서 가장 불확실한 것은 코드가 아니라 **환경**입니다.

1. Dataloy 테넌트가 실제로 어떤 모양인가
2. VM에서 Outlook 프로그램 액세스가 허용되는가
3. 실제 리포트 메일이 어떻게 생겼는가

세 가지가 확인되기 전에 파서와 규칙 엔진을 정교하게 만드는 것은
추측 위에 코드를 쌓는 일입니다. Phase 0을 반드시 먼저 통과합니다.

---

## Phase 0 — 환경 검증 (코드 최소, 가장 중요)

**목표: 설계의 전제가 맞는지 확인한다.**

| 작업 | 산출물 | 판단 기준 |
|---|---|---|
| Dataloy 인증 성공 | 토큰 발급 스크립트 | OAuth2 / Basic 중 어느 쪽인지 확정 |
| OPR 항차 조회 | `Voyage?filter=…(EQ)OPR` 응답 샘플 | 실제 상태 코드값 확인 |
| PortCall + eventLogs 조회 | 응답 샘플 | 필드명·시간대·ATA/ATD 존재 여부 확인 |
| Vessel Report 모듈 확인 | 존재 여부 + 최근 레코드 수 | **전략 분기점** (04 문서 §3) |
| Vessel 마스터 덤프 | 선박 목록 | 매칭 대상 규모 파악 |
| VM에서 Outlook COM 접근 | 최소 스크립트 | 보안 프롬프트 발생 여부 |
| 메일함 구조 관찰 | 폴더 목록, 발신자 통계 | 수집 범위 확정 |
| 리포트 샘플 수집 | **익명화된 샘플 20~30건** | 파서 설계의 실제 근거 |
| VM↔외부 파일 이동 경로 | 동작 확인 | Transport 구현 방식 확정 |

**Phase 0의 결과로 설계 문서를 개정합니다.** 여기서 나온 사실이
04·03 문서의 가설을 대체합니다.

산출 코드: `dataloy/client.py` 최소 버전, `outlook/adapter_com.py` 스파이크.
버릴 각오로 씁니다.

---

## Phase 1 — 수집 파이프라인

**목표: 원문이 안정적으로 들어오고 보관된다.**

- `core/store.py` + 스키마 마이그레이션
- `outlook/adapter_com.py` 정식 구현 (로캘 안전한 Restrict, `PR_INTERNET_MESSAGE_ID` 추출)
- `outlook-mcp` 서버: `list_folders` / `search` / `get_message` / `sync`
- `dataloy/client.py` + `sync_operational()` + `raw_json` 보관
- `dataloy-mcp` 서버: 읽기 도구 일체

**완료 기준**: Claude가 VM에서 "어제 온 리포트 보여줘"라고 요청받아
헤더 목록을 반환하고, 외부에서 OPR 항차 목록을 반환한다.

---

## Phase 2 — 정규화

**목표: 메일이 `VesselReport`가 된다.**

- `core/geo.py` 좌표 파서 + 물리 타당성 검사
- `core/timeutil.py` LT/UTC 변환, 경도 기반 tz 추정
- `parsing/generic.py` 범용 라벨 스캐너 (L2)
- `parsing/registry.py` + Phase 0 샘플 기반 템플릿 3~5개 (L1)
- `parsing/attachments.py` xlsx 라벨 탐색 파서
- `parsing/llm.py` + `outlook_save_report` 검증 경로 (L3)

**완료 기준**: Phase 0 샘플 20~30건에 대해 **파싱 커버리지 80% 이상**,
좌표 오파싱 0건 (타당성 검사가 전부 걸러냄).

테스트는 `tests/fixtures/emails/`의 실제 샘플을 고정 입력으로 씁니다.
합성 샘플로만 테스트하면 실전에서 무너집니다.

---

## Phase 3 — 매칭과 대조

**목표: "Dataloy와 맞는가"에 답할 수 있다.**

- `reconcile/matcher.py` 선박·항차·기항지 귀속
- `reconcile/rules.py` R-001 ~ R-010
- `reconcile/engine.py` + `fingerprint` 중복 제거
- `fleet-mcp` 서버 + `fleet/service.py`
- `fleet_timeline` 3열 대조 출력

**완료 기준**: 실제 데이터로 규칙을 돌렸을 때
**CRITICAL 오탐이 없다.** 오탐이 나오면 규칙을 끄거나 임계값을 올립니다.
검출률보다 오탐률을 먼저 잡습니다.

---

## Phase 4 — 대시보드

**목표: 아침 5분.**

- `dashboard/api.py` FastAPI
- 지도 화면 (MapLibre, 마커·항적·신선도 표현)
- 선박 목록 + 조치 필요 패널
- 선박 상세 4개 탭
- 불일치 확인/무시 처리

**완료 기준**: 실제 담당자가 하루 써보고
기존 수동 확인 대비 시간이 줄었다고 말한다.

---

## Phase 5 — 운영 안정화

- L3→L1 템플릿 승격 학습 루프
- 일일 브리핑 자동 생성 및 배포(메일/메신저)
- R-011 ~ R-014 규칙 추가
- `searoute-py` 기반 정확한 항로거리
- 운영 지표: 파싱 커버리지 추이, 규칙별 검출/무시 비율

마지막 지표가 중요합니다. **무시 비율이 높은 규칙은 오탐 규칙**이므로
데이터에 근거해 조정합니다.

---

## Phase 6 (별도 승인 필요) — Dataloy 쓰기

`Vessel Report API`를 통해 파싱 결과를 Dataloy에 되먹입니다.

전제 조건:
- Phase 2의 파싱 정확도가 충분히 검증됨
- **사람 승인 게이트** — 자동 전송 없음. 제안 → 확인 → 전송
- 전송 이력 전량 감사 로그
- 롤백 절차 정의

이 단계는 오입력이 실제 업무에 영향을 주므로 별도 승인 후 착수합니다.

---

## 일정 관점

각 Phase의 소요는 Phase 0의 결과에 크게 좌우됩니다.
특히 **Vessel Report 모듈 사용 여부**에 따라 Phase 2의 규모가 절반 이하로 줄 수 있습니다.
따라서 Phase 0 완료 전에는 전체 일정을 추정하지 않습니다.
