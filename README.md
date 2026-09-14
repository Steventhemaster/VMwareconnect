# VMwareconnect — Fleet Operations MCP Dashboard

VMware 내부 Outlook의 본선 보고(noon report / port report / working report)와
Dataloy VMS의 Operational 항차 데이터를 대조하여,
**운항 중인 선박의 일정·포지션·상태**를 매일 한 화면에서 확인하고
**Dataloy 입력 누락 및 계획-실적 차이**를 자동 검출하는 시스템입니다.

## 현재 상태

**설계 단계 (Phase 0 이전).** 코드는 아직 없으며, `docs/` 아래 설계 문서만 존재합니다.
구현 착수 전에 `docs/09-open-questions.md`의 미확인 항목을 먼저 해소해야 합니다.

## 문서

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

## 핵심 아이디어 한 줄

> Dataloy는 *계획된 진실*, 본선 이메일은 *현장의 진실*.
> 이 시스템의 가치는 둘을 나란히 놓고 **차이를 먼저 보여주는 것**에 있습니다.
