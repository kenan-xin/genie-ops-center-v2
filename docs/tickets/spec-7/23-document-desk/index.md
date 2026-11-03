# S7-23: Document desk on the invoice and payment records

Bead: `czjw.84`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-32, R-38, R-38a, AC-7. Owner, 2026-11-03 redesign review, issue I24.
- [UI development](../../../architecture/ui-development.md).
- The [Spec 7 ticket index](../README.md).
- Prototype: `invoice-record.prototype.html?variant=C` in the design workspace, branch `chore/prototype-ask-chat` (`41f4a60`), captures `product/invoice-record-captures/variant-C-*`, demo PDF in `product/invoice-record-assets/`.

## Dependencies

Depends on: nothing. Runs first in P2-3.

## Scope

- The PDF page shows inside the record page through the existing `DocumentViewer`. On a desktop each read field is pinned beside its source line by a leader line, placed by the text-layer match of R-38. Links and history sit in a side drawer. Status and amounts sit above, Outstanding the largest.
- On a phone (`impeccable` adapt) the page comes first, and the record opens in a bottom sheet that peeks with the status and the outstanding amount.
- Keep origin tags, Undo on an automatic link, Change amount, Remove link with in-row confirmation, the total correction and one history line per change.
- States: no PDF (entered by hand, record full width), paid, and PDF error (Download, Try again). A field with no quote, or a scan with no text layer, has no pin and is listed beside the page.
- The payment record uses the same layout.
- Import the prototype into `docs/design/` with an import record.

## Acceptance

Stories for each state. End-to-end at phone and desktop for INV-2026-09-03 and OR-AUG-SEP-BUNDLE: the page shows without a click, pins sit beside their lines, the drawer shows links and history, and the phone sheet peeks and opens. The shared definition of done in the [index](../README.md) also applies.
