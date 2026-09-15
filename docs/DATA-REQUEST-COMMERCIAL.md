# Data request — voyage parties, cargo, invoicing and laytime

This is a request to the collection side. Requested by the user on 2026-09-15:
invoice status for laden voyages and whether demurrage / despatch has been
registered; then, in a second pass the same day, the responsible charterer and
operator, the cargo laycan, and freight and port costs on a voyage detail card.
Asked a third time, on the same day, to include the **amounts** and the
**charterer names** in full — see [Publishing scope](#publishing-scope), which
records that decision and what was said before it.

**The screens are built and waiting.** Every field below already has a place in the
UI, and every one of them degrades on its own: a field that is absent draws no
control, no column and no empty cell. With today's snapshot the site renders exactly
as it did before these screens existed — that was measured, not assumed — so the
collection work can land field by field without a further UI pass.

Where each field appears:

| Field | Where it shows |
|---|---|
| `charterer`, `operator` | Filter beside the search box, a sort option, free-text search, and two cells in the voyage card |
| `commercial.cargo.laycanFrom` / `laycanTo` | Under the voyage number in the Voyages table, and in the voyage card |
| `commercial.cargo.description`, `count`, `laden` | Free-text search, and the voyage card |
| `commercial.freight`, `portCosts`, `invoices`, `laytime`, with amounts | The Voyage commercials block of the voyage card |
| `ports[].arrival` / `departure` | On the port rotation's own label line, and against each call in the card |

## Why it cannot be derived from what is published

The current snapshot carries, per voyage: `id`, `dataloyId`, `name`, `voyage`,
`reference`, `status`, `start`, `end`, and `ports[{name, sequence, purpose,
arrivalFixed, departureFixed}]`.

There is no party, cargo, invoice or laytime field, and `scripts/fetch-operational.mjs`
does not request any. A laden indicator cannot be inferred from `purpose` either —
Loading and Discharging tell you what a call is for, not whether the vessel is
carrying cargo on a given leg. A charterer cannot be inferred from a vessel name, and
a laycan cannot be inferred from the voyage start. Guessing any of this would be
exactly the inference this product refuses everywhere else.

The one exception is the port call dates, which are already pulled and simply
dropped — see [Already pulled](#already-pulled) below.

<a id="publishing-scope"></a>

## Publishing scope — decided

**Pull and publish the amounts and the charterer names in full.** Freight, port
costs, invoice totals and the demurrage / despatch amount all carry a real
`amount`, and `charterer` carries the counterparty's real name.

An earlier revision of this document withheld both. The reason it gave still holds
as a fact about the deployment, so it is recorded here rather than deleted: the
site is served from a public URL with **no sign-in**, so every figure and every
counterparty name in the snapshot is readable by anyone who has the link, and
stays readable in caches and search indexes after a later snapshot removes it.
`ARCHITECTURE-V2.md` §12 requires verified sign-in and fleet-scoped permissions
for any shared deployment, and that is still not built.

The user was told this and asked for the amounts and the names anyway, which is
their call to make about their own commercial data. So the contract below carries
them, and the screens render them. What follows from that, for whoever runs the
pull:

- Treat `src/operational-snapshot.json` as a commercial document from the first
  pull that includes these fields. It is committed to the repository and served
  publicly, so a wrong pull is not quietly fixable by a later one.
- Sign-in is the one change that would retire this whole section. Until it exists,
  every snapshot published is a full disclosure of freight, port costs and
  counterparties for 47 live voyages.

## Contract

One optional `commercial` object per voyage. Every key inside it is independently
optional: a missing key renders as "not collected", never as zero and never as a
negative finding.

```jsonc
{
  "id": "voyage-1",
  "dataloyId": "12345",
  // ... existing fields unchanged ...

  // Voyage parties. Plain strings, top level, because the filter and the free-text
  // search both read them. Omit the key entirely when not collected.
  "charterer": "Oldendorff Carriers",
  "operator": "A. Nurmi",

  "ports": [
    {
      "name": "KALININGRAD",
      // ... existing port fields unchanged ...
      "arrival":   "2026-07-24T10:00:00Z",   // ISO 8601, UTC, or null
      "departure": "2026-07-26T00:53:00Z"
    }
  ],

  "commercial": {
    "cargo": {
      "count": 2,              // number of cargoes registered on the voyage
      "laden": true,           // true | false | null — null means undetermined
      "description": "Urea in bulk",         // free text as registered, or null
      "laycanFrom": "2026-07-24T00:00:00Z",  // ISO 8601, or null
      "laycanTo":   "2026-07-29T00:00:00Z"
    },
    "freight": {
      "registered": true,      // true | false | null
      "currency": "USD",       // ISO 4217 code, or null for the tenant default
      "amount": 1250000        // number as registered, or null if not collected
    },
    "portCosts": {
      "registered": true,
      "currency": "USD",
      "amount": 318400,
      "count": 3               // number of port call cost entries, or null
    },
    "invoices": {
      "count": 3,
      "currency": "USD",
      "total": 84500,          // sum as registered, or null
      "statuses": [            // the tenant's own codes, not ours
        {"code": "RFP",  "label": "Ready for posting", "count": 2},
        {"code": "POST", "label": "Posted",            "count": 1}
      ]
    },
    "laytime": {
      "registered": true,      // true | false | null
      "outcome": "demurrage",  // "demurrage" | "despatch" | "none" | null
      "currency": "USD",
      "amount": 42000          // the calculated amount, or null
    }
  }
}
```

Rules for whoever builds the screens:

- `commercial` absent must read as "not collected", never as zero and never as a
  finding.
- A group present but its value `null` means "not determined", which is different
  from "none" and should not look the same.
- `invoices.statuses` carries the tenant's own codes. Do not map them onto invented
  ones on either side; pass them through and show them as they are.
- `laytime.registered: false` means a calculation has not been registered. It does
  **not** mean there is no claim, and the screen should say so.
- `cargo.laden` should come from a field that actually states it. If the only
  honest answer is "we cannot tell from what we pulled", send `null`.
- `charterer` and `operator` are omitted, not empty strings, when not collected.
  One voyage carrying them is enough to draw the filter; voyages without them then
  read "Not collected" in the card and fall to the end of a party sort.
- A laycan with only one side registered is shown as that one date, not as an
  open-ended range. Send whichever side exists and `null` for the other.
- Send every amount as a **number**, never a pre-formatted string, and put the
  currency in its own `currency` field. The screens format it. A figure arriving as
  `"USD 1,250,000"` will not format and will read as if no amount were collected.
- Never compute an amount that the tenant does not state. If freight is registered
  as a rate rather than a lump sum, send `amount: null` rather than multiplying it
  out — the card then reads "Registered · amount not collected", which is true,
  where a derived number would not be.
- `amount: null` with `registered: true` is a normal state, not an error. It means
  the figure exists in Dataloy but was not pulled, and reads differently from
  `registered: false` ("Not registered") and from an absent group ("Not
  collected").

## What to verify first

Neither the resource names nor the field paths are known for this tenant, and
guessing them in the `fields` parameter risks failing the whole 47-voyage pull. So:

1. Read one `Voyage` **without** a `fields` parameter and record the key tree
   (keys only — strip every value before sharing it).
2. From that tree, identify the paths for cargoes, for invoice documents and their
   status code, and for the laytime / demurrage result.
3. Confirm whether invoices and laytime hang off `Voyage` or are separate resources
   that need their own filtered call. The public documentation suggests invoices
   sit in the accounting integration area and laytime is calculated per cargo and
   charter party, so both may be separate reads joined on the voyage key.
4. Extend `scripts/fetch-operational.mjs` only after the paths are confirmed, and
   keep the existing `complete` / `reportedTotal` guard intact.
5. Extend `scripts/prepare-public-snapshot.mjs` to project only the contract above.
   The projector should keep refusing to emit on an incomplete pull.

<a id="already-pulled"></a>

## Already pulled — port call dates

`fetch-operational.mjs` already requests `portCalls.eventLogs.eventLogDate`,
`isDateFixed` and `event.eventCode`. `prepare-public-snapshot.mjs` used to drop all
of it; it now projects the first `ARR` and `DEP` event date per call as `arrival`
and `departure`, and the rotation renders them on its existing label line, so the
table shows when each call is scheduled rather than only the voyage window.

**This needs no new API call and no field-path research — only a re-run.** Run the
existing pull and projector against the tenant and the dates appear. Note that it
does widen what is published, from a voyage window to a dated rotation; the user
asked for it directly, which settles the scope question for these dates but not for
the amounts or the counterparty names above.

## Sources consulted

- [Accounting Integration API — Invoicing](https://api.dataloy.com/user-guides/accounting-integration-api/invoicing)
- [Accounting Integration API — Voyages](https://api.dataloy.com/user-guides/accounting-integration-api/voyages)
- [Laytime Calculations](https://dataloy-cloud.atlassian.net/wiki/spaces/VMSKB/pages/923590653/Laytime+Calculations)
- [Filtering](https://api.dataloy.com/dataloy-rest-api/filtering)
