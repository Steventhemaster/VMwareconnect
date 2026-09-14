# VMwareconnect — Fleet Operations MCP Dashboard

Dataloy Operational 항차를 기준으로 Outlook의 본선 보고를 수집하고,
선박의 **최신 보고 위치·일정·업무 상태·Dataloy 반영 차이**를 근거와 함께 확인하는 시스템입니다.

## 현재 상태

**재설계 v2 및 검토용 웹 대시보드 구현.** 초기 설계와 웹 구현은 Codex가 담당합니다. `npm ci` 후 `npm run dev`로 실행하며, `npm test`와 `npm run build`로 검증합니다. [검토용 사이트 구현 범위](docs/REVIEW-SITE.ko.md)에 화면과 실데이터 전환 전 남은 작업을 정리했습니다.
현재 기준 문서는 [ARCHITECTURE-V2.ko.md](docs/ARCHITECTURE-V2.ko.md)입니다.
프로그램 기반 Outlook 수집 및 Dataloy API 연결·필드 의미는 아직 검증하지 않았습니다.

배포 대상은 **DigitalOcean App Platform**으로 확정했습니다. Codex가 설계·클라우드 backend·대시보드를 담당하며, Codex의 VMware 접근이 불가능하면 Claude가 VM 내부 수집 검증을 맡는 조건부 역할 분담입니다. 사용자는 Claude의 VMware 접근 성공 이력을 확인했습니다.

2026-09-14: Codex도 실행 중인 VMware Horizon 데스크톱 세션과 Outlook 화면의 접근·열람을 확인했습니다. Graph/COM 기반 지속 자동 수집과 클라우드 전송은 별도 검증 대상입니다.

## 현재 설계 문서

| 문서 | 내용 |
|---|---|
| [재설계 v2](docs/ARCHITECTURE-V2.ko.md) | 구조, 데이터 모델, 수집·대조, 화면, API/MCP, 운영 및 검증 기준 |
| [기존 설계 검토](docs/REVIEW-CLAUDE-DESIGN.ko.md) | 원본 문서별 문제와 수정 근거 |
| [Phase 0 초기 설계](docs/PHASE-0-DESIGN.ko.md) | 담당 범위, 실제 환경 확인 기록, 상세 명세 산출물 및 완료 조건 |
| [DigitalOcean 배포 설계](docs/DEPLOYMENT-DIGITALOCEAN.ko.md) | App Platform 구성, VM 수집 연결, 영속 저장소, 비밀값 및 배포 조건 |
| [Claude 구현 전달 지침](docs/CLAUDE-HANDOFF.ko.md) | 추후 Claude Code에 구현을 맡길 때 사용하는 지침 |

## 핵심 결정

- 자동 수집과 규칙 대조는 스케줄러/worker가 실행하고 MCP와 웹은 공통 서비스에 접근합니다.
- 본선 보고, Dataloy 계획·예측, Dataloy 등록 실적을 각각 보존하고 비교합니다.
- 보고 정정·중복·지연·SOF 다중 이벤트와 필드별 원문 근거를 보존합니다.
- 시간대·항차·기항이 불명확하면 검토를 보류하고, 수집 장애를 본선 미보고로 판단하지 않습니다.
- 지도에는 기준시각이 있는 마지막 보고 위치를 표시하며 Dataloy는 읽기 전용입니다.

## 기존 초안 이력

아래 00~09 문서는 초기 설계의 맥락을 보존하는 참고 문서입니다.
v2와 충돌하는 결정은 v2가 우선하며, 초기 가정을 실제 환경 검증 결과로 취급하지 않습니다.

| 문서 | 내용 |
|---|---|
| [00-overview.md](docs/00-overview.md) | 문제 정의, 범위, 용어, 성공 기준 |
| [01-architecture.md](docs/01-architecture.md) | 전체 아키텍처, 배포 토폴로지, 신뢰 경계 |
| [02-data-model.md](docs/02-data-model.md) | 정규화 스키마, 저장소 스키마 |
| [03-outlook-adapter.md](docs/03-outlook-adapter.md) | Outlook 접근 방식, 리포트 파싱 전략 |
| [04-dataloy-api.md](docs/04-dataloy-api.md) | Dataloy REST API 연동 |
| [05-reconciliation.md](docs/05-reconciliation.md) | 선박·항차 매칭, 불일치 검출 규칙 |
| [06-mcp-tools.md](docs/06-mcp-tools.md) | MCP 서버 및 도구 명세 |
| [07-dashboard.md](docs/07-dashboard.md) | 대시보드 UI/UX 설계 |
| [08-roadmap.md](docs/08-roadmap.md) | 단계별 구현 계획 |
| [09-open-questions.md](docs/09-open-questions.md) | 미확인 사항 및 검증 필요 항목 |
