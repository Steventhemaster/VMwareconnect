# Dataloy 연결 검증

## 확인된 범위

2026-09-14 사용자가 회사별 API 호스트와 Client ID를 제공했다. 호스트의 `/ws/rest/Currency?filter=currencyCode(EQ)USD`는 인증 없이 HTTP 401 JSON을 반환했다. 네트워크 도달만 확인했으며 인증 성공이나 항차 데이터 조회를 뜻하지 않는다.

기존 [dataloy-tool/worker.js](https://github.com/Steventhemaster/dataloy-tool)의 동일 테넌트 설정에서 OAuth client credentials, 토큰 주소 `https://dataloy.eu.auth0.com/oauth/token`, audience `https://dataloy`를 확인했다. Client Secret 교체 후 OAuth 인증과 Currency 읽기 요청이 HTTP 200으로 성공했다. Operational 상태 필터를 적용한 Voyage 첫 페이지(limit=1)도 HTTP 200 및 레코드 1건을 확인했다. 전체 항차 수집이나 필드 매핑 검증 완료를 의미하지 않는다. 비밀값과 회사별 설정은 Git에서 제외된 `.env.local`에만 둔다.

## 실행

`.env.example`을 참고하여 `.env.local`에 API 루트 URL(일반적으로 `/ws/rest` 포함), `DATALOY_AUTH_MODE=oauth2`, Client ID와 Client Secret을 설정한다.

```sh
node --env-file=.env.local scripts/dataloy-probe.mjs
```

검증기는 서버/로컬 Node에서만 실행한다. 공개 정적 사이트에서 불러오지 않는다. OAuth 토큰 교환 후 USD Currency만 GET으로 확인하며, 응답에는 HTTP 상태·건수·고정 오류 코드만 출력한다. 리다이렉트, 임의 토큰 서비스, 과대 응답, HTML 로그인 응답을 거절한다. 토큰과 upstream 오류 본문은 출력하지 않는다.

성공의 의미는 연결 확인뿐이다. Operational 항차 동기화, 권한 범위, 필드 매핑, 페이지네이션 및 Outlook 대조는 이후 별도 구현·검증이 필요하다. 정적 검토 사이트는 계속 가상 데이터를 표시한다.

## 검증

전체 테스트 11개가 통과했다. 인증 검증 테스트는 가짜 토큰과 모의 HTTP 응답만 사용하며 실제 회사 데이터를 포함하지 않는다. Client Secret이 없는 구성은 네트워크 요청 전에 `DATALOY_OAUTH_CREDENTIALS_REQUIRED`로 중단된다.

공식 기준: [Getting Started](https://api.dataloy.com/dataloy-rest-api/getting-started), [Authentication / Authorization](https://api.dataloy.com/dataloy-rest-api/authentication-authorization).

