# Fleet Operations visual design

The public workspace uses English throughout navigation, filters, voyage details, connection status and exports. Dates use English month names and explicit UTC labels.

## Product reference

The palette was measured from the running Dataloy VMS interface using computed browser styles, rather than inferred from marketing imagery. These are observed product colors, not a claim to reproduce an official brand guideline.

| Role | Observed Dataloy value | Application |
| --- | --- | --- |
| Dataloy magenta | #DF1078 | Brand mark and identity accents |
| Dataloy navy | #092454 | Brand typography and high-priority headings |
| Primary action | #0060F0 | Buttons, active tabs and interactive controls |
| Selected navigation | rgba(0,96,240,0.12) | Pale blue navigation background |
| Divider | #E0E0E0 | Thin borders and separators |
| Amber accent | #F2B835 | Schedule review emphasis, with darker readable text |
| Typography | Roboto, Helvetica, Arial, sans-serif | Roboto with system fallbacks |

White navigation, restrained surfaces, outlined controls, compact status badges and blue tab indicators reflect the VMS product. Fleet Operations keeps its own name and vessel icon.

## Information hierarchy

- Four summary cards lead into searchable and sortable operational voyages.
- Port rotations show first and last registered calls in the table; voyage details preserve every call in sequence.
- Dates separate calendar date and UTC time for scanning.
- Review, briefing and connection pages share the same components and English terminology.
- Mobile layouts use two-column summary cards, a navigation toggle and a horizontally scrollable table without widening the page.
- Keyboard focus, labelled controls, modal focus handling and reduced-motion preferences remain supported.

The redesign does not change the approved public snapshot. OPR remains a workflow status. Registered end dates do not prove arrival or completion, and scheduled ports do not represent current vessel positions.
