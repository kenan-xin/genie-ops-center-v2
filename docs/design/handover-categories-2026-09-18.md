# Handover: category assignment

Date: 2026-09-18. Round: Categories. Reviewer: another agent reviews `docs/design/` before approval.

## What v1 gave, and what carried over

`src/features/categories/components/categories-directory.tsx` puts an "Assign solutions" table under the category list: one row per solution, one dropdown per row with None first, one write per change, and a toast that names the solution and the category. The uncategorized count sits beside the heading, and one callout says that a category organizes the sidebar and never widens what a person can open. No wizard, no bulk step, no pending list.

All of that carried over. Three things did not. v1 counts solutions on each category row, which core cannot do (`R-88`, `DEC-51`), so the counts stay modules-only. v1 assumes every item is a solution, so v2 adds the module rows and a type pill. v1 writes straight to a solutions table, which core must not do, so the record rows are contributed by their module and written by their module.

## What the screen does

The Categories page keeps create, rename, reorder, and delete, and gains one line of guidance under the title. Under the list sits Assign items: a search field, a type filter, an Uncategorized only checkbox, and one row per item with a category dropdown. One category per item, or No category.

Rows come from two places. A module with at least one static workspace entry is one row, written through `tenant_module.category_id` behind `core:settings:manage`. A record an enabled module contributes is one row, written by that module behind its own key, `solutions:admin` for a solution. The Solutions module row says "Moves this entry only. Its 9 solutions keep the category each one carries", so moving the hub never moves the catalogue.

A save reports itself three ways: Saving with a spinner, Saved with a check and the audit line, or Not saved with the reason, the value the server still holds, and Retry. A row the viewer may not write is disabled and names the key. A switched-off module keeps its own row and contributes no record rows, and the footer says the stored category is kept. Deleting a category leaves every item ungrouped and changes no permission, because a category id that no longer exists reads as no category (`R-91`).

## The handoff gap

Core cannot list or write a module's records today. The contribution read, the write, the permission key per row, the static entry count, and the audit ownership are raised in `product/amendments-categories-2026-09-18.md` as A1 to A5, with four unresolved questions, U1 to U4. U1 is the one the requirement named: the editing policy for a switched-off module's records. The design lists none, keeps the module row editable, and says the stored category is kept. It does not invent the policy.

## Changed files

- `src/sections/audit-and-tenant-settings/components/AssignItems.tsx`: new.
- `src/sections/audit-and-tenant-settings/components/CategoriesPage.tsx`: the guidance line and the Assign items card.
- `src/sections/audit-and-tenant-settings/components/ModulesPage.tsx`: fully controlled, and no picker for a module with no workspace entry.
- `src/sections/audit-and-tenant-settings/components/ui.tsx`: `Select` takes `disabled`, and `SearchField` carries a name.
- `src/sections/audit-and-tenant-settings/components/index.ts`.
- `src/sections/audit-and-tenant-settings/CategoriesPage.tsx` and `ModulesPage.tsx`: preview wiring on the shared record.
- `src/sections/solutions/AdminSolutions.tsx`: the configure sheet reads and writes the same record.
- `src/sections/solutions/components/ConfigureSolutionSlideOver.tsx`: the Category select carries a name.
- `src/shell/demoState.ts`: new, preview-only shared state. No exported component imports it.
- `product/sections/audit-and-tenant-settings/types.ts`: `AssignableItem`, `CompiledModule.staticEntries`, two props.
- `product/sections/audit-and-tenant-settings/data.json`: `staticEntries`, the `Service requests` and `Reporting exports` modules, and `assignableRecords`.
- `product/sections/audit-and-tenant-settings/spec.md`, `product/CHANGELOG.md`, `product/amendments-categories-2026-09-18.md`, and this file.
- `scripts/shots.mjs`: tall viewports, because the shell scrolls inside its own container and `fullPage` cannot grow the shot.
- `scripts/capture/categories.json` and `scripts/capture/verify-categories.mjs`.
- Ten captures in `product/sections/audit-and-tenant-settings/`.

## Preview links

The design server runs at `http://localhost:3000`. Use the `/fullscreen` routes, because the framed route drops the query string. `?reset=1` puts the sample tenant back.

- Categories with Assign items: `/sections/audit-and-tenant-settings/screen-designs/CategoriesPage/fullscreen?reset=1`
- A refused save: `?reset=1&fail=sol_general`, or `?fail=all` for every row
- An administrator without `solutions:admin`: `?reset=1&denied=1`
- A switched-off module: `?reset=1&off=solutions`
- The delete confirm: `?reset=1&confirm=cat_health`
- Modules: `/sections/audit-and-tenant-settings/screen-designs/ModulesPage/fullscreen?reset=1`
- The solution configure sheet: `/sections/solutions/screen-designs/AdminSolutions/fullscreen?open=sol_policy&tab=general`

## Checks performed

Simulated in the browser against sample data. No backend exists in this tree, so nothing below proves server behavior. 37 checks pass in `scripts/capture/verify-categories.mjs`, and the 42 checks of the Access round still pass.

Assigned a solution and saw the value survive a reload, then saw the same value in the solution configure sheet. Changed it in the sheet and saw the Categories page follow. Filed the Solutions module row and proved the nine solutions did not move, and that the Modules page shows the same value. Cleared a row back to No category. Deleted a category and proved its module and its solutions became ungrouped, with nothing removed. Forced a refusal and proved the row keeps the stored value, names the reason, shows no success toast, and retries the same value. Proved a viewer without `solutions:admin` gets read-only solution rows, a named key, and an editable module row. Switched a module off and proved its records are absent, its own row still editable, and the reason on screen. Exercised all three filters and the empty result. Proved a module with no workspace entry has no picker on Modules and no row here. No sideways overflow at 390 px on three screens, and no console errors. Light and dark captures taken at 1280 px, and phone captures at 390 px.

## Not done, and why

- The other fields of the solution configure sheet still take their name from a `span`, not a `label`, so they have no accessible name. Fixing that means changing the `Field` component for the whole sheet, which is a separate accessibility pass. Raised here, not done in a category round.
- No canonical specification, architecture document, decision, or backend file in the v2 repository was edited, and nothing was committed or pushed.
