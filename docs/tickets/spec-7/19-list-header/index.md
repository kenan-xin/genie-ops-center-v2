# S7-19: One list header for Invoices, Payments and the Documents inbox

Bead: `czjw.73`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-37, R-37a, AC-7. Owner, 2026-11-03, issue I15. It replaces redesign choices 12 and 13 and the toolbar of wave 4 finding 1.4.
- [Module contract](../../../architecture/module-contract.md), list header.
- [UI development](../../../architecture/ui-development.md).
- The [Spec 7 ticket index](../README.md).
- Prototype: `list-filters.prototype.html?variant=C&screen=invoices|payments|documents` in the design workspace, branch `chore/prototype-list-filters` (`541715e`, aligned figure strip `50dc422`), captures `product/list-filters-captures/variant-C-*`.

## Dependencies

Depends on: S7-16 (date range picker), S7-17 (the table below the header) and S7-18 (sortable headers, Updated). S7-26 later changes the shared placeholder colour in `packages/ui`. This ticket follows the placeholder rule of R-37a for its own controls and does not wait for S7-26.

## Scope

- One list header in `packages/ui`, open for extension and closed for change: figures (0 to n), status tabs (optional), a filter bar built from filter definitions (search, option, multi-option, date range, and a new kind that registers its own control), actions, and the table.
- Filter state lives in the URL and maps to the dataset query.
- Filters past the bar's width move into More filters on a desktop and one Filters sheet on a phone. Tabs fold into a select or a scrolling row. Run the `impeccable` adapt command for 390 px.
- Invoices, Payments and the Documents inbox become three configurations, with no per-list code in the component. The inbox tabs are Needs you, Reading, Done and All, and Upload stays in the page header.
- Import the prototype into `docs/design/` with an import record.

## Acceptance

AC-7 for the list header. Stories cover each of the three configurations and a list with no tabs and no figures, with axe. Captures at 390 and 1440 per list. The shared definition of done in the [index](../README.md) also applies.
