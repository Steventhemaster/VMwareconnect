# 05. Matching and discrepancy detection

> **Draft history — not the current implementation baseline.** This document predates v2. The current baseline is [Architecture v2](ARCHITECTURE-V2.md), and v2 wins wherever they conflict. See also [the design review](REVIEW-CLAUDE-DESIGN.md) and [the Phase 0 verification record](PHASE-0-DESIGN.md).

This document defines **the core value of the system**.
The map and the cards are the attractive shell; this is what actually saves work.

## 1. Vessel identity

The vessel name written in a mail has to be connected to the Dataloy vessel master.

### Stages

```
1. A valid IMO in the subject or body  → settled immediately (confidence 1.0)
2. Exact match after name normalisation → settled (confidence 0.95)
3. A hit in the alias table             → settled (confidence 0.95)
4. Fuzzy match (rapidfuzz)              → a candidate above the threshold (confidence = score)
5. No match                             → the unmatched queue
```

### Normalisation rules

```python
def normalize_vessel_name(raw: str) -> str:
    """
    "M/V  Pacific-Glory " → "PACIFIC GLORY"
    """
    s = raw.upper()
    s = re.sub(r"^(M[./]?[VSTV]|MT|MS|SS)\s*[.:-]?\s*", "", s)   # strip the prefix
    s = re.sub(r"[^A-Z0-9]+", " ", s)                            # punctuation → space
    return " ".join(s.split())
```

Failure modes to watch:
- **Fuzzy matching is dangerous when the fleet contains similar names.** `PACIFIC GLORY` and `PACIFIC GLORY II` are close in edit distance.
- Mitigation: accept a fuzzy match **only when the gap between first and second place is large enough** (`top1 - top2 >= 0.15`). Otherwise send it to unmatched.
- A mis-matched report puts the wrong position on another vessel's map. **A wrong match is far worse than no match.** Be conservative.

### Accumulating aliases

When a human resolves an unmatched item, that spelling is added to `vessels.aliases_json`.
The same spelling is then caught at stage 3 next time.

## 2. Voyage attribution

Once the vessel is settled, decide which voyage.

```
1. The mail carries a voyage number matching a Dataloy voyage_no → settled
2. reported_at_utc falls inside an OPR voyage's period             → settled
3. Exactly one OPR voyage                                          → attribute to it
4. A boundary time (±24h around a voyage transition)               → decide by position proximity
5. No match                                                        → vessel only, voyage undetermined
```

Case 5 is a valid outcome too. Even without a voyage, **the position and state can still be shown on the map.**
Only the discrepancy checks are skipped.

## 3. Port call attribution

A port event report (arrival / berthing / departure) has to be assigned to a `PortCall`.

```
1. Compare the mail's port name against PortCall.port_name, normalised
2. Where a port is called more than once, choose by time proximity
3. If the port name is a UN/LOCODE, match on the code directly
4. On failure, estimate from the distance between the reported coordinate and the PortCall coordinate (within 50nm)
```

## 4. Deriving the status

`VesselStatus` is decided from **the latest event combined with the Dataloy port call state**.

| Condition | Verdict |
|---|---|
| Latest event is `COMMENCED_CARGO` with no `COMPLETED_CARGO` | `IN_PORT_WORKING` |
| `ALL_FAST` present, no cargo start | `IN_PORT_IDLE` |
| `ANCHORED` present with no later `ALL_FAST` | `AT_ANCHOR`; `WAITING_BERTH` if the next port call is confirmed |
| After `DEPARTURE`/`COSP`, a later NOON exists with speed > 3kn | `AT_SEA_*` (LADEN/BALLAST by cargo) |
| Latest NOON speed < 1kn, no port event | `DRIFTING` |
| Bunkering in progress | `BUNKERING` |
| No basis for a verdict | `UNKNOWN` |

LADEN/BALLAST is decided from Dataloy's `reasonForCall` (L = Loading, D = Discharging)
together with the most recent cargo events.

**Every verdict also produces a `status_reason` string.** A status display whose basis cannot be
stated is not trusted by users, and ends up being ignored.

## 5. Computing our own ETA

Beyond the Dataloy ETA and the vessel-declared ETA, compute **a third value** for cross-checking.

```python
def compute_eta(last: VesselReport, dest: PortCall) -> datetime | None:
    if not (last.position and dest.port_lat is not None):
        return None
    dist_nm = route_distance(last.position, (dest.port_lat, dest.port_lon))
    speed   = last.speed_kn or planned_speed(voyage)
    if speed < 1.0:
        return None                       # pointless while stopped
    hours = dist_nm / speed
    return last.reported_at_utc + timedelta(hours=hours)
```

### Distance calculation

- **v1: great-circle (haversine) × a 1.15 correction factor** — simple, but it cuts across land. Legs involving Suez, Panama or Malacca are badly wrong.
- **v2: `searoute-py`** — based on a real route graph. Accurate, at the cost of another dependency.

In v1 the computed ETA is **explicitly labelled as approximate in the UI** and is used only as
supporting evidence in the rules (never raising a CRITICAL on its own). A false positive from an
inaccurate calculation loses trust in the entire rule engine.

## 6. Discrepancy rules

### Design principle

> **Start quiet, get more sensitive gradually.**

At the start, catch only what is certain. Once false positives accumulate, the user closes the dashboard.
Each rule's `enabled` flag and thresholds live in configuration so they can be tuned in operation.

### Rule list

| ID | Rule | Condition | Severity | v1 |
|---|---|---|---|---|
| **R-001** | ETA difference | Vessel-declared ETA vs Dataloy ETA ≥ 12h apart | WARN (≥24h: CRITICAL) | ✅ |
| **R-002** | Missing event | The vessel reported a port event but `eventLogs` has no matching entry (12h elapsed) | CRITICAL | ✅ |
| **R-003** | No report received | An OPR voyage whose latest report is more than 30h old | WARN (48h: CRITICAL) | ✅ |
| **R-004** | ROB mismatch | Vessel-reported ROB differs from the Dataloy EventLog ROB by more than 5% | WARN | ✅ |
| **R-005** | Port call order mismatch | The actual call order differs from `portCallSequence` | CRITICAL | ✅ |
| **R-006** | No reports at all | An OPR voyage with zero reports in the period | CRITICAL | ✅ |
| **R-007** | ATA/ATD not entered | 24h after an arrival/departure report, Dataloy's `ata`/`atd` is still empty | WARN | ✅ |
| **R-008** | Computed ETA divergence | Our computed ETA differs from the Dataloy ETA by ≥ 24h | INFO | ✅ |
| **R-009** | Unparsed reports | `parse_confidence` < 0.5, or a backlog in the unparsed queue | INFO | ✅ |
| **R-010** | Voyage unattributed | The vessel matched but voyage attribution failed | INFO | ✅ |
| **R-011** | Speed anomaly | ±30% deviation from planned speed for 3 consecutive days | INFO | v2 |
| **R-012** | Off-route | Position moving away from the next port call | INFO | v2 |
| **R-013** | Prolonged waiting | `WAITING_BERTH` for more than 72h | WARN | v2 |
| **R-014** | No departure after cargo | 24h after `COMPLETED_CARGO` with no departure report | INFO | v2 |

### Rule implementation shape

```python
@dataclass
class RuleContext:
    voyage_state: VoyageState
    reports: list[VesselReport]        # that voyage's reports, newest first
    port_calls: list[PortCall]
    event_logs: list[EventLog]
    config: RuleConfig

class Rule(Protocol):
    id: str
    default_severity: Severity
    def evaluate(self, ctx: RuleContext) -> list[Discrepancy]: ...
```

Each rule is an independent function, and one raising an exception **does not block the others**.
A failed rule is logged and recorded as an `R-000` internal error item.

### False-positive suppression

| Device | Purpose |
|---|---|
| `parse_confidence` gate | A value below 0.7 confidence never raises a CRITICAL |
| `fingerprint` deduplication | The same problem does not pile up as a new item every day |
| `status='ignored'` persistence | An item the user dismissed does not come back on re-detection |
| Grace period | Each rule has one (default 12h). Entry lag is accepted as normal |
| Exclude unresolved timezones | If `reported_at_utc` is `None`, time-related rules are skipped |

That last device matters especially. As explained in [03-outlook-adapter.md](03-outlook-adapter.md) §2.5,
when the timezone is unknown we do not assume UTC — **we do not compare at all**.

## 7. Generating the daily brief

The structure `fleet_daily_brief(date)` returns:

```
1. Headline
   - N vessels operating / M with late reports / K CRITICAL discrepancies
2. Immediate action (CRITICAL)
   - Per vessel: what, why, and which mail is the evidence
3. Worth checking (WARN)
4. One-line summary per vessel
   - "PACIFIC GLORY | at sea (laden) | 12.5N 123.7E | Singapore ETA 09-16 08:00Z (+14h vs plan) | reported 3h ago"
5. Parse failures and unattributed items
```

Item 4 is most likely the only part the user actually reads every day.
**Putting the deviation from plan in the parentheses** is the heart of that line.
