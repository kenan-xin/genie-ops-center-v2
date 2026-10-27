# S7-08: Reading job and Documents inbox

Bead: `czjw.8`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-23 to R-27, R-37.
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-05](../05-model-connection/index.md), [S7-07](../07-invoice-pages-tenant-and-seed/index.md).

## Scope

- Upload through `FileStorage` and the hash check.
- The reading job: retries, the uploader as principal, idempotency, text layer with page markers, the PDF for file-capable models, structured output, the quote check with normalisation, classification. Installs the server PDF text library after a current-docs check (candidates `unpdf`, `pdfjs-dist`).
- Reading and Could not read with Retry, partial readings, AI-off manual entry, PDFs with no text layer.
- Payments as drafts, then matching from S7-06.
- The Documents inbox page.

Out of scope: the review screens (S7-09).

## Acceptance

AC-7, the part up to the inbox: with the recorded test model, the seven live uploads reach the expected statuses and records.
