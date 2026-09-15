# Daily operational refresh

GitHub Actions runs `daily-dataloy.yml` on the default deployment branch at 05:00 UTC / 09:00 Asia/Dubai, daily. GitHub may queue scheduled jobs; the site changes after collection, validation and DigitalOcean deployment complete. Manual workflow dispatch is also supported.

Five repository Actions secrets hold the Dataloy OAuth configuration. Credentials never enter the published snapshot, browser bundle or committed files. The job reads all OPR voyages and paginated DocumentLine records, projects approved display fields, runs tests and a production build, and commits only the snapshot. A failed fetch or validation leaves the last published snapshot intact. Run failures are visible in GitHub Actions; check the displayed snapshot timestamp for freshness.

Responsible charterer is `voyageHeader.charteringResponsible.userName`, not the cargo's counterparty. Operator is `voyageHeader.operator.userName`. Unassigned staff are shown explicitly.

Freight status uses this tenant's `FVC` (Freight) account only. An outgoing INO document must be marked invoiced, not reversed, and POS (Posted) or RFP (Ready-for-Posting). Distinct invoice documents are counted once. Remaining pending lines yield Partly invoiced; unbilled lines, assembled invoices, reversals/credits and unverified records are distinguished. No freight lines means no matching accounting entries, not zero freight due. This is line/document coverage, not confirmation of contractual amount coverage or payment. Amounts, document identifiers and other accounting details are not published.

Registered voyage dates remain available in details and schedule review. The main table instead prioritizes staff and freight invoicing. Port dates retain local-time semantics.
