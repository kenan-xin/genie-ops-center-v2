# Amendments the centralized category assignment needs

Date: 2026-09-18. Author: design owner. **Status on 2026-09-19: accepted and applied in v2.**

The accepted text is `docs/architecture/module-contract.md` in v2, under "Category assignment
boundary", and that file is the authority. This one is kept as the record of what was asked for and
why. Where the two differ, the accepted text wins. The accepted boundary adds points this file did
not ask for: several rows report per-row outcomes with retry rather than one cross-module
transaction, a disabled compiled module keeps its record placement while contributing no editable
record rows, and placement never grants access. `product/sections/audit-and-tenant-settings/spec.md`
follows the accepted text.

The design adds one Assign items table to the Categories page: one row per module with a workspace entry, one row per record an enabled module contributes, each with a category dropdown. The rule that does not change is `DEC-51`: `category` is a core table, `solution_category` stays a solutions module table, and core reads no module table. This file lists what the platform must add for the screen to be buildable. Nothing under `/home/kenan/work/genie-ops-center-v2` was edited.

The design invents no direct core-to-solution-table access, and it adds no combined count. The Categories counts stay modules-only, as `R-88` requires.

## Amendments

### A1. The module contract needs an assignable-records contribution

Today the contract says that a module returns a navigation tree `{ pinned, entries }`, and that an entry built from a record can carry `categoryId`. That is a read for rendering. It does not offer the administrator a list to file.

Needed: one declared read on the module contract, for example `listAssignable()`, that returns, for the current tenant, the records the module lets an administrator place in a category: the id, a label, one scan fact, the current category id, and the permission key the write needs. Core calls it for every enabled module and concatenates the answers. Core stores nothing and reads no module table.

Why: without it, the only way to build this screen is for core to read `solution_category`, which `DEC-51` forbids.

### A2. The module contract needs the matching write

Needed: one declared write, for example `setAssignableCategory(recordId, categoryId | null)`, performed by the module, behind the module's own permission key, writing the module's own table. Core routes the call and never writes the row. The module writes its own `audit_event` row, as it does for every other change it owns.

The design treats the result as a promise: the row reports saving, then success, and a refusal leaves the stored value on screen with Retry. A refused write never reads as a save.

### A3. Core must pass the permission key with each row

Needed: the row carries the key its write needs, and core answers `can()` for that key with the one per-request loader (`DEC-48`). `core:settings:manage` covers a module row, because that write is `tenant_module.category_id`. A solution row needs `solutions:admin`. Holding the category key must not grant the solution write, and the screen must not offer a control that the server will refuse.

### A4. The Modules read needs the static entry count

`R-84` says the category picker shows for every module with at least one static workspace entry. The compiled-module read carries no such field today. Needed: the count, or a boolean, in the same read. The design added `CompiledModule.staticEntries`, and a module with zero shows no picker on Modules and no row in Assign items.

### A5. One audit event per change, from whichever side writes it

`R-90` already requires an audit row for every change on the Modules and Categories pages. Needed: one line that says a record's category change is written by the module that owns the record, with the module's action key, so the audit reader shows one event and not two.

## Unresolved, flagged rather than invented

### U1. The editing policy for a switched-off module's records

A switched-off module refuses its routes, so it cannot answer `listAssignable()`. The design therefore lists no record of a switched-off module, keeps the module's own row editable, because that row is core's column, and says on screen that the stored category is kept. Whether the platform instead wants core to cache the last answer, or to offer the rows read-only, is not decided. The design does not invent the policy.

### U2. Which records a module should offer

The solutions module holds drafts and archived solutions. The design lists what the sample data holds, drafts included, because a draft joins the navigation once it is ready. Whether an archived record should be offered is the module's call, and the contract should say so.

### U3. One call per row, or a batch

The design writes one row at a time, as v1 does, so a failure belongs to one row and Retry is unambiguous. If the platform prefers one batched write, the screen needs a pending list and a Save control, which is a different interaction. Raised before it is built.

### U4. A narrower key than `solutions:admin`

Filing a solution is a small change next to registering or archiving one. `solutions:admin` is the only key the module declares today, so the design uses it. If placing a solution should be available to somebody who cannot configure one, the module needs a second key, and `DEC-23` counts core keys, not module keys, so this is the module's decision.

## Sample data added for this round

- `Service requests`, an enabled module with one workspace entry and no records, so a module row can be filed end to end. It matches the module of the same name in the Access sample data.
- `Reporting exports`, an enabled module with zero workspace entries, so the no-picker rule of `R-84` and its absence from Assign items can be read on screen.
- `assignableRecords`, the nine solutions the solutions module contributes, with the ids the Solutions section already uses. This models the answer to A1. It is not a core table.
