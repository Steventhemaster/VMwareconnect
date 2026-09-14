# 04. Dataloy VMS API integration

> **Draft history — not the current implementation baseline.** This document predates v2. The current baseline is [Architecture v2](ARCHITECTURE-V2.md), and v2 wins wherever they conflict. See also [the design review](REVIEW-CLAUDE-DESIGN.md) and [the Phase 0 verification record](PHASE-0-DESIGN.md).

> What follows is based on the public Dataloy VMS API documentation (https://api.dataloy.com).
> However, **the base URL, API version, enabled modules and status code values can differ per tenant.**
> Until verified against the real tenant in Phase 0, treat all of it as hypothesis.
> The open items are collected in [09-open-questions.md](09-open-questions.md).

## 1. Authentication

Dataloy uses OAuth 2.0 `client_credentials`.
New customers are set up with OAuth 2.0, but the documentation states that an integration
targeting multiple customers must **also support Basic authentication**.

```
POST {token_url}
  grant_type=client_credentials
  client_id={M2M_CLIENT_ID}
  client_secret={M2M_CLIENT_SECRET}
  audience=https://dataloy        # production
  audience=https://dataloy.dev    # test / development
```

The issued token is passed as a Bearer token.

```
Authorization: Bearer {access_token}
```

### Client design

```python
class DataloyAuth(ABC):
    def headers(self) -> dict[str, str]: ...

class OAuth2Auth(DataloyAuth):
    """Token cache + pre-emptive refresh 60s before expiry + one forced refresh and retry on 401"""

class BasicAuth(DataloyAuth):
    """For legacy tenants"""
```

Splitting the two behind an interface means that once the tenant is confirmed, only configuration changes.
Credentials are injected through environment variables (`DATALOY_CLIENT_ID`, `DATALOY_CLIENT_SECRET`,
`DATALOY_TOKEN_URL`, `DATALOY_BASE_URL`, `DATALOY_AUDIENCE`) and are never committed.

## 2. Resources and queries

Endpoints take the form `{base_url}/ws/rest/{Resource}`.
Every resource supports **filtering on its own properties and on those of linked resources**.

### 2.1 Filter syntax

```
?filter={property.path}({operator}){value}
```

| Operator | Meaning |
|---|---|
| `EQ` | equals |
| `NE` | not equal |
| `IN` | in a list |

Confirmed real examples:

```http
# Operational voyages only
GET /ws/rest/Voyage?filter=voyageHeader.voyageStatus.statusTypeCode(EQ)OPR

# Nominated + Operational port calls
GET /ws/rest/PortCall?filter=voyage.voyageHeader.voyageStatus.statusTypeCode(IN)(NOM,OPR)

# Exclude estimates
GET /ws/rest/Voyage?filter=voyageHeader.voyageStatus.statusTypeCode(NE)EST

# A specific vessel
GET /ws/rest/PortCall?filter=voyage.vessel.imoNumber(EQ)9123456
```

> Whether additional operators such as `LT`/`GT`/`LIKE` exist is unverified.
> Date range filters are needed, so this must be confirmed in Phase 0.
> If unsupported, filter client-side (the data volume is small enough that this is fine in practice).

### 2.2 Pagination

The default return limit is **2000 records**. Beyond that, pagination is required.
The client always assumes pagination and fetches 500 at a time.

```python
def paginate(self, resource: str, **params) -> Iterator[dict]:
    """Always split the request so the limit is never hit. Drain to the last page."""
```

### 2.3 Resources used (read-only)

| Resource | Purpose |
|---|---|
| `Voyage` | The OPR voyage list, voyage number, status, vessel reference |
| `PortCall` | Port call order, port, `reasonForCall`, ETA/ETD, `eventLogs` |
| `Vessel` | Vessel master (name, IMO, call sign) — the basis for mail-to-vessel matching |
| `EventLog` | Per-port-call events (arrival, berthing, cargo, departure) and their times |
| `Port` | Port codes and coordinates (for map display and distance calculation) |

According to the documentation, a `PortCall`'s `EventLog` is **linked to ROBs**, so it can hold
the fuel remaining at a given event (for example FO on arrival). That is directly comparable with
the ROB in a vessel report, which rule `R-004` uses.

**No write tools are defined in v1.** A tool that does not exist cannot be called by mistake.

### 2.4 Voyage status codes

| Code | Meaning |
|---|---|
| `EST` | Estimate |
| `NOM` | Nominated |
| `OPR` | **Operational** ← the primary target of this system |

> Whether the code values are customisable per tenant is unverified.
> Query the `VoyageStatus` resource first to confirm the real code list, then fix the constants.
> Do not hardcode the codes — put them in configuration.

## 3. The Vessel Report API

Dataloy has **a separate API for receiving vessel reports**.
The confirmed payload shape:

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

### What this means for the design

**If the Vessel Report API is already in use on this tenant, the mail-parsing burden drops sharply**,
because some vessels may already be submitting reports through that route.

To confirm in Phase 0:
1. Is the Vessel Report module enabled on this tenant?
2. Do `VesselReport` records exist for the last 30 days, and for which vessels?

The strategy branches on the answer.

| Finding | Strategy |
|---|---|
| Vessel Report actively in use | Make **Dataloy the primary source** and use mail to fill the vessels and periods Dataloy lacks. Parsing burden drops a lot |
| Partially in use | Apply a different source priority per vessel, distinguished by `VesselReport.source` |
| Not in use | Mail parsing is the main path, as designed (the default assumption) |

In the medium term this also opens a path for **feeding the parsed mail results back into Dataloy**
through the Vessel Report API. That is the v2 write capability, and it must sit behind a human approval gate.

## 4. Webhooks

Dataloy supports webhooks through the `WebhookSubscription` resource.
Subscribing to a Voyage pushes **every change to that object and its object hierarchy**.

Behaviour:
- If the subscribing system does not respond or is too slow, the server **retries 5 times at one-minute intervals and then deactivates the subscription** (retry count and interval are configurable).

### v1 does not use webhooks

Because:
1. It requires a **publicly reachable inbound endpoint** in the external environment. On an in-house deployment that is usually impossible.
2. If the subscription is quietly deactivated, the data stops and it is hard to notice.
3. The purpose is **a daily brief**, for which polling is sufficient.

Instead, make the polling interval configurable (default 1 hour) and write `dataloy/sync.py`
source-neutrally, so a webhook can be added as an extra path once the environment allows inbound.

## 5. Sync strategy

```python
def sync_operational(self) -> SyncResult:
    """
    1. Voyage?filter=voyageHeader.voyageStatus.statusTypeCode(EQ)OPR  → target voyages
    2. Fetch each voyage's PortCall (+ eventLogs)
    3. Refresh the Vessel master (register new vessels / accumulate aliases)
    4. Cache Port coordinates (they barely change, so cache long)
    5. Keep raw_json whole  ← allows reprocessing when the mapper improves
    """
```

- Always keep `raw_json`. The field mapping is likely to change once the tenant is confirmed, and this avoids re-calling the API then.
- If the **"voyages changed since the last run"** query mentioned in the accounting integration guide is usable, switch to incremental sync. Confirm in Phase 0.
- If Dataloy does not provide port coordinates, fill the gap from the public UN/LOCODE dataset.

## 6. Error handling

| Situation | Handling |
|---|---|
| 401 | One forced token refresh and retry. On a second failure, report it as a credential problem |
| 429 / 5xx | Exponential backoff retry (2s, 4s, 8s, 16s), up to 4 attempts |
| Timeout | 30s per request. Failures are per page, so partial success is allowed and stated in the result |
| Schema mismatch | Do not abort with an exception. Store `raw_json` and record the mapping failure as a warning |

That last row matters. One changed Dataloy field must not fail the entire morning brief.
**Show the partial failure, and show the rest anyway.**

## Sources

- [Dataloy VMS API — Authentication / Authorization](https://api.dataloy.com/dataloy-rest-api/authentication-authorization)
- [Dataloy VMS API — Getting Started](https://api.dataloy.com/dataloy-rest-api/getting-started)
- [Dataloy VMS API — Filtering](https://api.dataloy.com/dataloy-rest-api/filtering)
- [Dataloy VMS API — Data Model](https://api.dataloy.com/dataloy-rest-api/data-model)
- [Dataloy VMS API — Webhooks](https://api.dataloy.com/dataloy-rest-api/webhooks)
- [Dataloy VMS API — Vessel Report](https://api.dataloy.com/user-guides/vessel-report)
- [Dataloy VMS API — Schedule API](https://api.dataloy.com/user-guides/schedule-api)
- [Dataloy VMS API — Accounting Integration: Voyages](https://api.dataloy.com/user-guides/accounting-integration-api/voyages)
