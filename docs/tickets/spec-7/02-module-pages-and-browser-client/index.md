# S7-02: Module pages and browser client

Bead: `czjw.2`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-1 and R-2. Roadmap Section 6 items 1 and 2.
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-01](../01-documents-and-fixtures/index.md), and Spec 3 beads `6wz1.32` (PageHeader slot) and `6wz1.40` (gatedArea helper), which touch the same pages.

## Scope

Module pages with nested routes, route parameters, server-side data loading and a permission per route on the oRPC module contracts (ADR 0011). A typed browser client for a module's own procedures. A nested route declares its parent route, so the core `PageHeader` breadcrumb (added in pending-fix batch 5) shows the trail on desktop and a back link on phones, with the record label from the module's record resolver; a top-level route shows none. Proven on the placeholder module. Out of scope: relation scopes, notifications, `s3`, the full outbound HTTP service.

## Acceptance

AC-1.
