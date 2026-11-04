# Design import, 2026-11-04: the invoice record, variant C (document desk)

Status: imported reference snapshot for the record pages (`czjw.84`, S7-23, Spec 7 R-38a). The owner picked variant C at the redesign review of 2026-11-03 (I24). It is not a new design approval. The branch `feature/document-desk` builds it on the invoice record and the payment record.

## Why

The owner found that "Open the PDF" leaves the page. A person must see the PDF inside the record page. Variant C puts the page on a canvas in the middle, pins each read field beside its source line by a leader line, and moves the links and their history into a drawer. On a phone the page comes first, and the record sits in a bottom sheet that peeks with the status and the outstanding amount.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design-prototype-ask-chat`, branch `chore/prototype-ask-chat`, head `41f4a60`.

1. The prototype `product/invoice-record.prototype.html` was copied to `prototypes/invoice-record.prototype.html`.
2. The four variant C captures in `product/invoice-record-captures/` were copied to `sections/invoices-and-payments/invoice-record/`. The variants A and B captures were not imported, because the owner did not pick them.
3. The prototype's `invoice-record-assets/INV-2026-09-03.pdf` is byte-equal to `docs/modules/invoices-and-payments/demo-pack/02_History_PDFs/Invoices/INV-2026-09-03.pdf`, so it was not copied a second time. Variant C always uses the drawn page, so it shows without the file. `?pdf=rendered` draws the page for variants A and B too.
4. The data is the fictional demo pack. No real person's data is shown.

## Screens

Open the prototype in a browser with `?variant=C`.

| Capture | What it shows |
| --- | --- |
| `variant-C-desktop-default.png` | INV-2026-09-03 at 1440: the header band with the status and the amounts, the page with seven pinned fields, the drawer with the payments and the history |
| `variant-C-desktop-no-pdf.png` | A record entered by hand: the No document card and the fields in two columns, each Entered by you |
| `variant-C-desktop-pdf-error.png` | A preview that does not load: Download the PDF, Try again, and the fields read from the document |
| `variant-C-phone-default.png` | The page at 390 with its toolbar, and the bottom sheet that peeks with the status and the outstanding amount |

## Files

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `prototypes/invoice-record.prototype.html` | Added | `abdbdbeed5ea64df489aeffb00cbe5bff0cd7e948b2ce3f302a6930cdf8e79c3` |
| `sections/invoices-and-payments/invoice-record/variant-C-desktop-default.png` | Added | `a5ac0c80ef57a0f853a79366bd2a53a14cae2d63ab4d0261f07b64abe58980cf` |
| `sections/invoices-and-payments/invoice-record/variant-C-desktop-no-pdf.png` | Added | `74f89f2a63c75d4f5df28e2c8d6d20ca6a45d25f961a84531d9d556ad6bf6e2d` |
| `sections/invoices-and-payments/invoice-record/variant-C-desktop-pdf-error.png` | Added | `7ebcd55105712a91a307bc65f5932a3f585dde6335e1f6a7728abea486a2daf3` |
| `sections/invoices-and-payments/invoice-record/variant-C-phone-default.png` | Added | `189e10f4c446839d543208cf04ec584149e287aa95215b23553280f2b5c82ed1` |

## Differences that the build keeps

- A field card is not a button, and the toolbar has no source chip. The prototype's press-to-highlight is in no spec line (DK7).
- The no-PDF state has no "Attach a PDF". No spec line asks for it, and no path attaches a file to a saved record (DK9).
- Change amount, Remove link and Correct the total stay dialogs, not in-row editors. R-38a keeps the R-32 actions, and `DESIGN.md` routes every destructive path through the shared ConfirmDialog (DK10, a deviation for owner review).
- The header is the page header over the figure strip, in two rows, not one band (DK12).
- In the drawer the links are cards. In the phone sheet the links are a table from 768 px (DK13).
