# S7-17: Virtualized DataTable rows

Bead: `czjw.70`. Status and claims live in Beads, not in this document.

## Governing documents

- Owner, 2026-11-03 dry run, issue I12. [Spec 7](../../../specs/07-invoice-and-payments.md) R-8 sets the 1,000-row query cap. No numbered Spec 7 line covers virtualization, so the acceptance comes from the bead.
- [UI development](../../../architecture/ui-development.md).
- The [Spec 7 ticket index](../README.md).
- Prototype: none.

## Dependencies

Depends on: nothing. Runs first in P2-2, because S7-19 builds on the table.

## Scope

- Add `@tanstack/react-virtual`, with its `../../../core/tech-stack.md` line.
- `DataTable` in `packages/ui` virtualizes its rows by default, the desktop table and the phone card list alike. Keep the sticky header, keyboard focus, `aria-rowcount` and `aria-rowindex`.
- Lower the list page size (for example 100), load the next page near the end of the scroll, and keep Show more as the accessible fallback.
- Apply it to every `DataTable` consumer: Documents inbox, Invoices, Payments, audit log, People, Groups, Roles, Dashboards and Slides lists.

## Acceptance

A story of 10,000 rows renders within a measured time at 390 and 1440. Screen readers still read the row count and position. The shared definition of done in the [index](../README.md) also applies.
