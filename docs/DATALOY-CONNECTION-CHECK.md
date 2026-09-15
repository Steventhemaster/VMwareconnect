# Dataloy connection verification

## What has been confirmed

On 2026-09-14 the user supplied the company API host and the Client ID. `/ws/rest/Currency?filter=currencyCode(EQ)USD` on that host returned an HTTP 401 JSON body without authentication. That confirmed network reachability only — not successful authentication and not a voyage data read.

From the same tenant's configuration in the existing [dataloy-tool/worker.js](https://github.com/Steventhemaster/dataloy-tool), the OAuth client credentials flow was confirmed, with the token endpoint `https://dataloy.eu.auth0.com/oauth/token` and audience `https://dataloy`. After the Client Secret was rotated, OAuth authentication and a Currency read both returned HTTP 200. The first page of Voyage under an Operational status filter (`limit=1`) also returned HTTP 200 with one record. That is not a complete voyage collection and not a verified field mapping. Secrets and company-specific settings live only in `.env.local`, which is excluded from Git.

A full read of all Operational voyages, including per-call purpose and fixed-date flags, was subsequently taken and published as a fixed snapshot — see [PUBLIC-SNAPSHOT.md](PUBLIC-SNAPSHOT.md).

## Running it

Following `.env.example`, set the API root URL (normally including `/ws/rest`), `DATALOY_AUTH_MODE=oauth2`, the Client ID and the Client Secret in `.env.local`.

```sh
node --env-file=.env.local scripts/dataloy-probe.mjs
```

The probe runs only on a server or local Node. It is never imported into the published static site. After the token exchange it performs a single GET for USD Currency, and the output carries only the HTTP status, a record count and a fixed error code. It rejects redirects, unrecognised token services, oversized responses and HTML login pages. Tokens and upstream error bodies are never printed.

The hardening is deliberate and worth keeping in any successor implementation:

- The base URL must be clean HTTPS — no userinfo, query or fragment.
- The API destination is validated **before** any credential is sent to the token service.
- The token URL and audience are pinned to the confirmed values; anything else fails closed.
- A custom key header name is checked against an allowlist pattern and a blocklist of hop-by-hop and identity headers.
- The key is rejected if it contains CR or LF.
- Both the API and token responses are capped at 64 KiB and must carry a JSON media type.
- `redirect: 'error'` means a credential is never replayed to a redirect target.

Success here means connectivity and authentication only. Operational voyage synchronisation, permission scope, field mapping, pagination and the Outlook comparison each still need separate implementation and verification.

## Verification

The test suite passes. The authentication tests use fake tokens and mocked HTTP responses only, and contain no real company data. A configuration without a Client Secret fails with `DATALOY_OAUTH_CREDENTIALS_REQUIRED` before any network request is made.

Official references: [Getting Started](https://api.dataloy.com/dataloy-rest-api/getting-started), [Authentication / Authorization](https://api.dataloy.com/dataloy-rest-api/authentication-authorization).
