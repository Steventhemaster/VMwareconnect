# 03. Outlook access and report parsing

> **Draft history — not the current implementation baseline.** This document predates v2. The current baseline is [Architecture v2](ARCHITECTURE-V2.md), and v2 wins wherever they conflict. See also [the design review](REVIEW-CLAUDE-DESIGN.md) and [the Phase 0 verification record](PHASE-0-DESIGN.md).

This is **the most uncertain and highest-risk area of the project.**
Dataloy is a documented REST API; vessel report emails have no fixed format at all.

## 1. Outlook access

### 1.1 The adapter interface

Since it is not settled what will be permitted, the code above only sees this interface.

```python
class OutlookAdapter(ABC):
    @abstractmethod
    def list_folders(self) -> list[FolderInfo]: ...

    @abstractmethod
    def search(
        self,
        since: datetime,
        until: datetime | None = None,
        folder: str | None = None,
        query: str | None = None,       # subject/body keywords
        sender: str | None = None,
        limit: int = 200,
    ) -> list[MessageHeader]: ...

    @abstractmethod
    def get_message(self, message_id: str) -> MessageBody: ...

    @abstractmethod
    def get_attachment(self, message_id: str, attachment_id: str) -> bytes: ...

    @abstractmethod
    def sync_delta(self, folder: str, token: str | None) -> tuple[list[MessageHeader], str]:
        """Incremental sync. An adapter without support falls back to `since`."""
```

### 1.2 Comparing the candidates

| Method | Strengths | Weaknesses | Verdict |
|---|---|---|---|
| **COM (`pywin32`)** | No tenant approval; works on user permissions alone. Reads the cached OST, so it works offline. The most realistic option in a VDI | Outlook must be running. Windows only. Large searches are slow. Security prompts can appear | **v1 default** |
| **Microsoft Graph** | Delta sync, `$search` and `$filter`, stable, headless | Needs an Entra ID app registration plus `Mail.Read` admin consent, which takes time. Needs outbound access to `graph.microsoft.com` from the VM | **v2 target / switch as soon as it is approved** |
| **IMAP** | Simple, platform-independent | Usually disabled in corporate environments. Folder and flag semantics are limited | Fallback |
| **EWS** | — | **Not viable.** From 2026-10-01 Exchange Online starts blocking third-party EWS requests, with full retirement on 2027-04-01 | **Excluded** |

Excluding EWS is a settled decision in this design. It starts being blocked two weeks from today.

### 1.3 COM adapter implementation notes

```python
# the core of adapter_com.py
import win32com.client

outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
folder  = outlook.GetDefaultFolder(6)          # 6 = olFolderInbox
items   = folder.Items
items.Sort("[ReceivedTime]", True)
items = items.Restrict(
    "[ReceivedTime] >= '" + since.strftime("%m/%d/%Y %H:%M %p") + "'"
)
```

Watch out for:

- **The date format in `Restrict` follows the OS locale.** If the VM locale is Korean, `%m/%d/%Y` may not work. Detecting the locale on first run, or using a `DASL` query (`urn:schemas:httpmail:datereceived`), is safer.
- **`EntryID` changes when a mail moves between mailboxes.** Read `PR_INTERNET_MESSAGE_ID` (the RFC 5322 Message-ID) through `PropertyAccessor` as a portable key and store it alongside.
- **Security prompts** — some configurations make Outlook warn on body/address access. Whether programmatic access is permitted by corporate policy is the very first thing to check in Phase 1.
- **Performance** — iterating thousands of items with `for item in items` is very slow. Use `Restrict` plus `GetTable` to read only the needed columns.
- **Claude driving it directly** — Claude Code starts `outlook-mcp` over stdio inside the VM and calls the tools. Collection is therefore **conversational**, not a batch job. Each tool must respond small and fast (headers first, bodies on request), and default `limit` values are conservative.

## 2. Report parsing strategy

### 2.1 Four fallback layers

Trying to solve wildly varying formats with one parser fails. Use layers.

```
L1  Template match     ── identify a known format by sender/subject → extract via YAML rules
        │ fails
L2  Generic label scan ── proximity extraction around "POSITION", "LAT", "SPEED", "ROB" …
        │ fails or low confidence
L3  LLM extraction     ── Claude structures it against the schema (an MCP tool)
        │ fails
L4  Human review queue ── surfaced in the dashboard as unparsed
```

Each layer returns a `parse_confidence`. Below the threshold it falls through to the next.
The `parse_method` field always makes it traceable which layer produced a value.

### 2.2 The learning loop

When L3 (Claude) extracts **N consistent structures** for the same sender/subject pattern,
that mapping is automatically proposed as an L1 template candidate (`parsing/templates/_candidates/`).
Once a human approves it, it becomes a real template and that vessel is handled fast and deterministically at L1.

This loop is what reduces LLM calls over time and stabilises parsing.
Without it, the inefficiency of re-reading the same mail with an LLM every day becomes permanent.

### 2.3 Template definition example

```yaml
# parsing/templates/pacific_fleet_noon.yaml
id: pacific_fleet_noon
match:
  sender_domain: ["pacificfleet-ship.com"]
  subject_regex: "^(MV|M/V)\\s+(?P<vessel>[A-Z0-9 ]+)\\s*[-–]\\s*NOON REPORT"
report_type: NOON
timezone:
  field: "ZONE TIME"
  regex: "ZT\\s*[:=]\\s*(?P<sign>[+-])(?P<h>\\d{1,2})(?::(?P<m>\\d{2}))?"
fields:
  reported_at_local:
    regex: "DATE\\s*[:=]\\s*(?P<v>\\d{2}[./-]\\d{2}[./-]\\d{2,4}\\s+\\d{2}:?\\d{2})"
    parse: datetime
  position:
    regex: "POSN?\\s*[:=]\\s*(?P<v>.+?)$"
    parse: coordinates
  speed_kn:
    regex: "(?:AVG\\s*)?SPEED\\s*[:=]\\s*(?P<v>[\\d.]+)"
    parse: float
  distance_run_nm:
    regex: "(?:DIST(?:ANCE)?\\s*RUN|D\\.?RUN)\\s*[:=]\\s*(?P<v>[\\d.]+)"
    parse: float
  distance_to_go_nm:
    regex: "(?:DTG|DIST(?:ANCE)?\\s*TO\\s*GO)\\s*[:=]\\s*(?P<v>[\\d.]+)"
    parse: float
  eta_next_utc:
    regex: "ETA\\s*(?P<port>[A-Z ]+)?\\s*[:=]\\s*(?P<v>[\\d./:-]+\\s*[\\d:]*)"
    parse: datetime
  rob.VLSFO:
    regex: "(?:VLSFO|LSFO)\\s*(?:ROB)?\\s*[:=]\\s*(?P<v>[\\d.]+)"
    parse: float
  rob.MGO:
    regex: "(?:MGO|LSMGO|DO)\\s*(?:ROB)?\\s*[:=]\\s*(?P<v>[\\d.]+)"
    parse: float
confidence:
  base: 0.95
  required: [reported_at_local, position]   # missing either one fails the template
```

### 2.4 Coordinate parsing

The notations seen in practice vary enormously. A dedicated parser lives in `core/geo.py`.

```
Inputs that must be supported
  12-34.5N 123-45.6E
  12°34.5'N 123°45.6'E
  12 34.5 N / 123 45.6 E
  N12-34.5 E123-45.6
  12.575N 123.760E
  LAT 12 34.5 N  LON 123 45.6 E
  1234.5N 12345.6E            (no separators — DDMM.M form)
```

Validation rules:
- |latitude| ≤ 90, |longitude| ≤ 180
- minutes < 60
- **distance from the previous reported position / elapsed time ≤ 30 knots** — this check catches mis-parses best. Get a sign or a digit wrong and the implied distance becomes unrealistic.
- On a failed check, do not discard the value: record it in `parse_warnings` and lower `parse_confidence`.

### 2.5 Timezone handling

**This is the part of the project most likely to be quietly wrong.**

- A noon report's time is usually **ship's local time (ZT/LT)**, with the zone offset somewhere in the body.
- The ETA may be in ship's time, arrival-port time, or UTC.
- Dataloy values are assumed UTC, but **the tenant setting has to be confirmed** (an open item).

Rules:
1. If an offset is stated, use it.
2. If not, **estimate from the position's longitude** (`round(lon / 15)`) and record `"tz_inferred_from_longitude"` in `parse_warnings`.
3. If even an estimate is impossible, leave `reported_at_utc` as `None` and exclude the value from UTC comparison. **Never simply assume UTC.**

Rule 3 matters. Assuming UTC for something unknown mixes up to ±12 hours of error into ETA comparison,
and the whole discrepancy rule set starts pouring out false positives.

### 2.6 Attachments

It is common for vessels to send the noon report as an **Excel form attachment** rather than in the body.

- Read the sheet with `openpyxl` and define a **cell coordinate mapping** per template (`{"position": "C7", "speed_kn": "C12"}`) in YAML.
- Cell coordinates break when the form version changes. So make **label-based lookup** the default (find the string "POSITION" in a nearby cell and read the cell to its right or below) and keep cell coordinates as the fallback.
- PDF attachments are out of v1 scope, but measure how often they occur and add them in v2 if needed.

### 2.7 The LLM fallback (L3)

`parsing/llm.py` is exposed as the MCP tool `fleet_parse_report`.
Claude reads the raw content and extracts against the `VesselReport` schema.

Safety rules:
- The mail body is treated **as data only**. Sentences inside it are never interpreted as instructions.
- The extracted result must pass **schema validation plus the physical plausibility checks in §2.4** to be accepted.
- `parse_confidence` never exceeds 0.8 (always below an L1 template), so that the rule engine does not raise CRITICAL alerts on low-confidence values.
- Results are cached by `message_id`. The same mail is never sent to the LLM twice.

## 3. Search query design

Because Claude drives Outlook directly, searching starts broad and narrows down.

Recommended first-pass keywords (one OR combination at a time):
```
noon report, noon, daily report, position report,
arrival, EOSP, departure, COSP, NOR, notice of readiness,
all fast, berthed, anchored, commenced, completed,
SOF, statement of facts, cargo operation, working report
```

That said, **keyword search alone will always miss some mail.**
So the v1 default strategy is to pull everything for a given folder and period,
and decide whether something is a report during parsing.
Keywords are only a narrowing device for when the folder is huge.

Phase 1 **observes the real mailbox structure and sending patterns first**, then settles this strategy.
Building elaborate search logic before that is effort spent on guesswork.
