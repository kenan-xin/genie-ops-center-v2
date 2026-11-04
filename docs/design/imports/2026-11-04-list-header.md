# Design import, 2026-11-04: the list filter header, variant C

Status: imported reference snapshot for the list header (`czjw.73`, S7-19). The owner picked variant C at the dry run of 2026-11-03. It is not a new design approval. The branch `feature/list-header` builds it on Invoices, Payments and the Documents inbox.

## Why

The owner found the list filter header disorganized, and the figure strip ragged. Variant C puts the status tabs with their counts on the top edge of the table card, and a compact filter bar inside the card. The figures sit in one card, with the caption, value and sub-line of each figure on shared rows.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, branch `chore/prototype-list-filters`, head `541715e` (after `f9c1c12` and `50dc422`).

1. The prototype `product/list-filters.prototype.html` was copied to `prototypes/list-filters.prototype.html`.
2. The eight variant C captures in `product/list-filters-captures/` were copied to `sections/invoices-and-payments/list-header/`. The variants A and B captures were not imported, because the owner did not pick them.
3. The data is the fictional demo pack. No real person's data is shown.

The capture `variant-C-invoices-phone-sheet-open.png` is from before `50dc422`. It still shows the old figure layout behind the sheet. The sheet itself is current.

## Screens

Open the prototype in a browser. A deep link is `?screen=<key>&variant=C`, where the key is `invoices`, `payments` or `documents`.

| Capture | What it shows |
| --- | --- |
| `variant-C-invoices-desktop.png` | Invoices at 1440: figure card, tabs with counts, filter bar, Updated newest first, footer with Show more |
| `variant-C-invoices-phone.png` | Invoices at 390: figures two by two, active tab with its count, Filters, search, sort line, cards |
| `variant-C-invoices-phone-sheet-open.png` | The phone Filters sheet: status radios with counts, customer, invoice date |
| `variant-C-payments-desktop.png` | Payments at 1440 |
| `variant-C-payments-desktop-customer-open.png` | Payments with the customer picker open, with its own search |
| `variant-C-payments-phone.png` | Payments at 390 |
| `variant-C-documents-desktop.png` | Documents inbox at 1440: no figures, tabs Needs you, Reading, Done and All, Upload in the page header |
| `variant-C-documents-phone.png` | Documents inbox at 390 |

## Files

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `prototypes/list-filters.prototype.html` | Added | `90609f99a3af1419e7e92b62315a2bb4e920da7f0ea2c43a05ef3b734b858d3a` |
| `sections/invoices-and-payments/list-header/variant-C-documents-desktop.png` | Added | `75887c0029486d4d101fc0efd34e5cfb7ec08bc6166398d65722c7941b465c24` |
| `sections/invoices-and-payments/list-header/variant-C-documents-phone.png` | Added | `a562e9f7a1e3440bedf5223fcb49c66e0e7762f7dead0a97c1327e122728af0b` |
| `sections/invoices-and-payments/list-header/variant-C-invoices-desktop.png` | Added | `e9f634356acb894c5f026788082e498d92c153adac5cf1abe6cd9b62a4110852` |
| `sections/invoices-and-payments/list-header/variant-C-invoices-phone.png` | Added | `bc98fc8ec39b3d75e69215ab9c49f2db25334d5371c08e276a8d5e303048c087` |
| `sections/invoices-and-payments/list-header/variant-C-invoices-phone-sheet-open.png` | Added | `cf89f0973d8040e2f78a0e0193f356a1fb9c4c94c6e4014a6ea1ec47225a4023` |
| `sections/invoices-and-payments/list-header/variant-C-payments-desktop-customer-open.png` | Added | `455297dfcfd16f6666ac9eb9328126c5573b1a5b3f24edcadf49996697b9f26a` |
| `sections/invoices-and-payments/list-header/variant-C-payments-desktop.png` | Added | `4ee0fbdfe631088f4949f204416432a293712039e01276eca233a238a8b3e9b1` |
| `sections/invoices-and-payments/list-header/variant-C-payments-phone.png` | Added | `33867f3ad954139d456de973bc88fd89b44ad9a8a05b4350c871d43088df4dcc` |

## Differences that the build keeps

- Payments keep the Payment and Unallocated columns, not the prototype's Reference and Allocated columns (LH29).
- Outstanding and Status do not sort (owner, 2026-11-03). The prototype sorts them.
- On a phone the lead figure spans both columns only when the count is odd (LH18).
