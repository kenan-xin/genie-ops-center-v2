# S7-27: A paid receipt saves without a due date choice

Bead: `czjw.72` (bug). Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-27 to R-31. R-28 blocks a save on a missing due date. Owner, 2026-11-03 dry run step 7, issue I14.
- The [Spec 7 ticket index](../README.md).
- Prototype: none.

## Dependencies

Depends on: nothing. Runs in P2-3.

## Scope

- Read R-27 to R-31 first. A sale that is paid in full has no meaningful due date. The paid-receipt review saves without the due date choice, or with a default, and with no extra decision.
- If the fix changes what R-28 says for a paid receipt, amend R-28 in the same change, with the bead as its reference.

## Acceptance

The review of `06_Paid_Sales_Receipt.pdf` saves with no due date choice, and the invoice it creates is settled at once and never overdue. A test fails on the old code. The shared definition of done in the [index](../README.md) also applies.
