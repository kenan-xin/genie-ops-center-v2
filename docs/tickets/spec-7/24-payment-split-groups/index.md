# S7-24: Named and other open invoices in the payment split

Bead: `czjw.69`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-30 and R-32. `DEC-25` (phones have no hover). Owner, 2026-11-03 dry run step 5, issue I11.
- The [Spec 7 ticket index](../README.md).
- Prototype: none. The design system help disclosure is the pattern for the info icon.

## Dependencies

Depends on: nothing. Runs in P2-3.

## Scope

- In Confirm the split, group the rows: "Named on this payment" (pre-filled) and "Other open invoices of <customer>" (folded by default).
- An info icon beside each group title explains the group in one sentence. It opens on hover, keyboard focus and tap.

## Acceptance

OR-AUG-SEP-BUNDLE shows two named invoices and INV-2026-10-04 in the folded group. Stories with axe. Captures at 390 and 1440. The shared definition of done in the [index](../README.md) also applies.
