# S7-07: Invoice pages, demo tenant and seed

Bead: `czjw.7`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-59, R-60.
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-02](../02-module-pages-and-browser-client/index.md), [S7-06](../06-invoice-records-and-datasets/index.md).

## Scope

- Invoices and Payments list pages and a record page for each, with balance, allocations and their history.
- The demo tenant from `nx g @genie/generators:tenant-new`, with the three Section 7 modules in its include list, and the modules in the dev composition.
- The seed script: demo pack history, history PDFs, every Section 7 role for the demo account, reporting date 2026-10-27.

Out of scope: the Documents inbox and review, the starter dashboard (S7-12).

## Acceptance

A seeded demo deployment shows the history with the expected balances on the list and record pages, at both viewports.
