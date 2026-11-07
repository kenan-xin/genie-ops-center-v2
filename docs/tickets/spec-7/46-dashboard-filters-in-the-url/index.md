# S7-46: Dashboard filters, several at once, in the page address

Bead: `czjw.116`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-49, R-12, AC-15.
- [Technical plan](../../../tech-plans/07-invoice-and-payments.md), wave 5, Decisions: "Dashboard filters".
- agent-native `templates/analytics/app/pages/adhoc/sql-dashboard/types.ts` `DashboardFilter` and `DashboardFilterBar.tsx` (MIT, commit `f31225ba3332a3dd4965d1ee5644df4d281bc650`), ideas only, never their SQL text templates.
- The [Spec 7 ticket index](../README.md).
- Prototype: the dashboard filter bar prototype of phase W3a of follow-up 11, the variant the owner picks at gate G2. It starts from the list header's filter controls (S7-19, `czjw.102` variant A) and the date pickers (S7-16, `czjw.101`).

## Dependencies

Depends on: S7-42 (the Dashboards surface), S7-44 (the "You can change" line and its test), `czjw.101`, `czjw.102` and gate G2.

## Scope

- `contract.ts`: `filters.field` becomes `filters.fields`, at most 4; the schema reads a stored single field as a list of one. A panel gains an optional `ownRange`.
- Kinds follow the dataset's `DatasetFieldType`: text gives select or multi-select, boolean gives a toggle, the time field gives the date range.
- The filter bar writes only the page address, in the list header's URL filter model. The dashboard opens with its stored filters when the address has none. Save as default writes the current filters with `set-filters` and Undo; the bar shows "Not saved as default" while they differ.
- Transient filters reach the server: `panelData` and `filterValues` take an optional `filters` input, validated by the same `dashboardFilters` schema and checked against the panel datasets; with no input they read the stored filters as today. The TanStack Query key of each panel includes the filters, so a stale answer never shows under new filters. `filterValues` answers the options of one field.
- `filters.ts`: each filter reaches each panel through the typed `queryDataset` filters behind `scopesFor()`. A field filter applies only to a panel whose dataset has that field, as today; such a panel's header says that the filter does not apply. A panel with `ownRange` skips the dashboard range, uses its own range for its comparison figures too, and shows its range in its header.
- Agent: the Dashboards surface's `set-filters` takes the new shape; its "You can change" line and test follow (S7-44).

## Acceptance

Unit tests: the URL mapping, the list-of-one read, the kind from the field type. Integration tests: a transient filter narrows every panel whose dataset has the field, leaves the others unfiltered with the notice, and respects scopes; an invalid filter input is refused. End to end at phone and desktop: set two filters, reload, copy the link to a new tab, same view; Save as default survives a reload. The shared definition of done in the [index](../README.md) also applies.
