# S7-18: Updated column and sorting in the database

Bead: `czjw.71`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-6 and R-8 (the dataset query), R-37 and R-37a (column headers sort, Updated sorts newest first). Owner, 2026-11-03 dry run, issue I13.
- [Module contract](../../../architecture/module-contract.md), datasets.
- The [Spec 7 ticket index](../README.md).
- Prototype: `list-filters.prototype.html?variant=C` in the design workspace, branch `chore/prototype-list-filters` (`541715e`).

## Dependencies

Depends on: nothing. Runs in P2-2 before S7-19.

## Scope

- An Updated column (the row's last change, in the tenant time zone) on the Documents inbox, Invoices and Payments, newest first by default.
- Sortable headers: click to sort, click again to reverse, `aria-sort` set.
- The sort runs in the database, never in the browser. The core dataset query takes an allowlisted sort column and direction. The keyset cursor carries the sort value plus the row key (`czjw.48`), so a page edge never skips or repeats a row. Each sortable column gets an index.
- Outstanding and days overdue stay unsortable until a measured need (owner, 2026-11-03).

## Acceptance

An integration test proves the order across a page edge. A sort on 10,000 rows finishes within a measured time. The shared definition of done in the [index](../README.md) also applies.
