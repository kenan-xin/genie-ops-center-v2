# S7-39: Demo script step 9 asks for a new panel

Bead: `czjw.75`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-51, R-59, AC-9, AC-12. Owner, 2026-11-03 dry run step 9.
- The demo guide under `../../../modules/invoices-and-payments/`.
- The [Spec 7 ticket index](../README.md).
- Prototype: none.

## Dependencies

Depends on: nothing. Runs in P2-7 because it changes recordings.

## Scope

- Step 9 asks for a panel that the starter dashboard lacks, for example "Add a KPI panel for unallocated payments" (2,222.00 after step 7).
- Update the expected figure, the dev end-to-end `dashboards.spec.ts` and its recordings if they use the same prompt, and the presenter guide.

## Acceptance

The demo guide's step 9 adds a panel that the starter does not have, and the end-to-end test of the ten demo steps passes with the new figure. The shared definition of done in the [index](../README.md) also applies.
