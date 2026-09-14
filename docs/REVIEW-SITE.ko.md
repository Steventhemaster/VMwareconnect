# 검토용 사이트 — 구현 범위

가상 데이터로 화면과 업무 흐름을 검토하는 첫 배포 버전이다. 실데이터 운영 backend는 아직 포함하지 않는다.

## 실행

Node.js 22 이상에서 `npm ci`, `npm run dev`로 실행한다. 검증은 `npm test`, 배포 빌드는 `npm run build`다. App Platform의 Static Site에서 build command `npm ci && npm run build`, output directory `dist`로 배포한다. 예시 설정은 `.do/app.yaml`이다.

## 구현한 화면

- 선대 현황: 8척 가상 데이터, 상태 필터, 선박/항차/항구 검색, 검토 우선 및 선박명 정렬, CSV 내보내기.
- 지도: 로컬 Natural Earth 국가 지형과 MapLibre 기반 확대/축소, 선박 마커 선택, 선택 선박의 보고점 연결. 위치 미확인 선박은 표에 유지.
- 선박 상세: 운항 개요, 본선/계획/등록 실적 대조, 합성 보고서 근거.
- 검토함: 업무 차이 3건과 수집 범위 미확인 1건 분리. 확인 표시는 이 브라우저의 localStorage에만 저장.
- 일일 브리핑: 기준시각이 고정된 가상 브리핑과 텍스트 다운로드.
- 연결 상태: 실제 Outlook 자동 수집/Dataloy 인증이 연결되지 않았음을 표시. 비밀값을 받는 프론트엔드 폼은 없음.

모든 화면과 내보내기에 데모 상태를 명시한다. 실제 IMO, 실제 회사 메일, 원문, 키 또는 현재 업무 데이터를 번들에 넣지 않는다. 브리핑 및 보고시각은 2026-09-14 08:00 UTC 스냅샷을 기준으로 계산한다.

## 실데이터 전환 전 남은 작업

승인된 Outlook 수집기, 수신 API, Dataloy read-only connector, worker, PostgreSQL, 로그인 및 선대별 권한, 서버에 저장되는 검토 이력, 데이터 coverage 검증이 필요하다. 정적 사이트가 이 기능을 대신한다고 표현하지 않는다.

## 지도 데이터

Natural Earth의 1:110m 국가 지형을 축약해 `public/countries.geojson`에 포함했다. [원본](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson). 생성은 `node scripts/fetch-map.mjs`. 별도 지도 타일이나 API 키를 요청하지 않는다. 개략 지도이며 항해용 해도가 아니다. 관측점을 잇는 점선은 실제 항로가 아니다.

폰트는 Google Fonts에서 선택적으로 내려받으며 실패 시 시스템 글꼴로 표시한다. 앱 동작에는 외부 폰트가 필요하지 않다.
