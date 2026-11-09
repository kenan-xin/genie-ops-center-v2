# S7-47: Saved views of a dashboard, with one default

Bead: `czjw.117`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-49a, AC-15.
- [Technical plan](../../../tech-plans/07-invoice-and-payments.md), wave 5, Decisions: "Saved views".
- agent-native `templates/analytics/server/db/schema.ts` `dashboardViews` and `app/hooks/use-dashboard-views.ts` (MIT, commit `f31225ba3332a3dd4965d1ee5644df4d281bc650`), ideas only.
- The [Spec 7 ticket index](../README.md).
- Prototype: the view menu in the dashboard filter bar prototype of phase W3a of follow-up 11, variant A, a "View: <name>" menu at the left of the bar: [`dashboard-filters.prototype.html`](../../../design/prototypes/dashboard-filters.prototype.html), states `views`, `view-changed` and `default-view` in [`dashboard-filters/`](../../../design/sections/invoices-and-payments/dashboard-filters/). Picked by the run, owner review at G3 (owner, 2026-11-08).

## Dependencies

Depends on: S7-46.

## Scope

- The dashboard config gains `views: [{ id, name, filters }]` and `defaultViewId`; no migration and no new table. A view holds filter values only.
- Steps `save-view` (new or update by id), `remove-view` and `set-default-view`, each with Undo.
- Two separate actions, so no change is ever lost. Save as default always stores the current filters as the dashboard's filters and clears `defaultViewId`. Make default, in the view menu, sets `defaultViewId` to that view. The dashboard opens with the default view's filters, else the stored filters. Removing the default view clears `defaultViewId`.
- A selected view whose filters the person changed shows "Changed" with Update view and Save as new view; switching away without either drops the change, as any unsaved filter does.
- UI: a view menu in the filter bar to switch, save the current filters as a view, update, remove, and make one the default.
- Agent: the Dashboards surface gains `save-view` and `set-default-view` on the person's request; its "You can change" line names views.

## Acceptance

Integration tests: saving, updating, switching, removing and setting the default work, undo, and survive a reload; Save as default after changing a selected view keeps the changed filters; removing the default view opens the stored filters. End to end at phone and desktop. The shared definition of done in the [index](../README.md) also applies.
