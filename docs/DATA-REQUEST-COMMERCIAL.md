# Data request — cargo, invoicing and laytime

This is a request to the collection side. Requested by the user on 2026-09-15:
invoice status for laden voyages, and whether demurrage / despatch has been
registered.

**The UI for this is not built.** A first attempt was made and reverted along with
the rest of that design pass, so when the data lands the screens for it still need
designing. The contract below stands on its own — it says what to pull and what not
to publish — and holding it steady means the collection work does not have to wait
for the UI question to be settled.

## Why it cannot be derived from what is published

The current snapshot carries, per voyage: `id`, `dataloyId`, `name`, `voyage`,
`reference`, `status`, `start`, `end`, and `ports[{name, sequence, purpose,
arrivalFixed, departureFixed}]`.

There is no cargo, no invoice and no laytime field, and `scripts/fetch-operational.mjs`
does not request any. A laden indicator cannot be inferred from `purpose` either —
Loading and Discharging tell you what a call is for, not whether the vessel is
carrying cargo on a given leg. Guessing any of this would be exactly the inference
this product refuses everywhere else.

## Publishing scope — read this before adding amounts

**Do not publish monetary values.** Invoice amounts and demurrage / despatch
amounts are commercial figures, and the site is currently served without
authentication. The request was for *status* and *registration*, and the contract
below carries only that: counts, status codes and which side a laytime calculation
landed on.

If amounts are ever wanted on screen, the site needs a verified sign-in and
fleet-scoped permissions first — which is what `ARCHITECTURE-V2.md` §12 already
requires for any shared deployment, and which remains the open question in the
README.

## Contract

One optional `commercial` object per voyage. Every key inside it is independently
optional: a missing key renders as "not collected", never as zero and never as a
negative finding.

```jsonc
{
  "id": "voyage-1",
  "dataloyId": "12345",
  // ... existing fields unchanged ...
  "commercial": {
    "cargo": {
      "count": 2,              // number of cargoes registered on the voyage
      "laden": true            // true | false | null — null means undetermined
    },
    "invoices": {
      "count": 3,
      "statuses": [            // the tenant's own codes, not ours
        {"code": "RFP",  "label": "Ready for posting", "count": 2},
        {"code": "POST", "label": "Posted",            "count": 1}
      ]
    },
    "laytime": {
      "registered": true,      // true | false | null
      "outcome": "demurrage"   // "demurrage" | "despatch" | "none" | null
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

## Related, and cheaper

`fetch-operational.mjs` already requests `portCalls.eventLogs.eventLogDate`,
`isDateFixed` and `event.eventCode`, and `prepare-public-snapshot.mjs` drops all of
it. Per-call dates would let the rotation show when each call is scheduled rather
than only the voyage start and end. That needs no new API call — only a projection
change and a scope decision, since it widens what is published.

## Sources consulted

- [Accounting Integration API — Invoicing](https://api.dataloy.com/user-guides/accounting-integration-api/invoicing)
- [Accounting Integration API — Voyages](https://api.dataloy.com/user-guides/accounting-integration-api/voyages)
- [Laytime Calculations](https://dataloy-cloud.atlassian.net/wiki/spaces/VMSKB/pages/923590653/Laytime+Calculations)
- [Filtering](https://api.dataloy.com/dataloy-rest-api/filtering)
