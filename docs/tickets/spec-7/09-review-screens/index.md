# S7-09: Review screens

Bead: `czjw.9`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-28, R-30, R-32, R-33, R-38.
- [Variant D](../../../design/sections/invoices-and-payments/README.md) and its prototype.
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-08](../08-reading-job-and-inbox/index.md).

## Scope

- The full-page review of variant D: the pdf.js viewer with a text layer, origin tags, the highlight for the selected field, the due-date choice, Save as unpaid, type correction, the stacked phone layout. Installs the viewer library after a current-docs check.
- Payment review: split confirmation, suggestions, overpayment, Possible duplicate, new customer confirmation.
- Undo after an automatic link, and link correction from the record pages.
- Added in the plan (D13): Correct the total on the invoice page, with its step that chooses the links to change (R-32). No other ticket held this screen, and S7-06 built only the procedure.

## Acceptance

AC-7.
