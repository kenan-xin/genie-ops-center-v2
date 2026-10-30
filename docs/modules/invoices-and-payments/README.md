# Module: Invoices and Payments

## Who it is for

A small finance team that issues invoices and receives payments, and a manager who asks questions about them.

## Problem

Invoices and payments arrive as loose documents in any order: partial, combined, duplicate or unreferenced payments, and invoices with no due date. The team needs records that are complete and correct enough for questions, dashboards and reports to trust.

## What it does

A person uploads documents to the Documents inbox. A model reads each one and classifies it. The person completes what is missing and saves an invoice as unpaid. Payments link to invoices automatically when the match is clear, and by the person's choice otherwise. Balances are always the invoice total minus its allocations. The module publishes datasets that the boss agent, Analytics and Slides read. Full requirements: `../../specs/07-invoice-and-payments.md`, R-22 to R-39.

## Permissions and roles

Three keys: `invoices:read` reads invoices, payments and customers, `invoices:write` saves invoices and payments and changes their links, and `invoices:use` opens the Invoices and Payments workspace (`DEC-50`). Three default roles: Finance (use, read and write), Viewer (use and read), and Invoices and Payments user (use). The roles carry `invoices:use` now because a seeded role is never rewritten. S7-07 adds the workspace entries and pages.

## Tables

Amounts are integer cents beside a three-letter upper-case currency code. A balance is the invoice total minus its allocations and is never stored.

- `customer`: a name and an optional email. Two names that differ only in case and outer spaces are refused.
- `document`: one uploaded file, by the core file id, with its SHA-256 hash and its kind (invoice, payment, paid receipt or purchase order). A unique hash stores an exact copy once.
- `invoice`: a customer, an optional document, the number, the invoice date, an optional due date with its source (document, person or unspecified; unspecified has no date), the payment terms, the currency, a positive total and a description.
- `payment`: a customer, an optional document, the payment date, the currency, a positive amount, the reference, the method and the invoice numbers it names.
- `allocation`: a positive amount of one payment linked to one invoice, at most once per pair, marked when the link was automatic.
- `allocation_event`: an append-only history of each link, change and unlink, with the amounts before and after and the person who made it.
- `field_origin`: for one field of a document, whether it was extracted, entered or corrected. An extracted field always holds its quote and page.

## Record types

- `invoices-customer`: a customer, labelled by name, with no parent and no path.
- `invoices-invoice`: an invoice, labelled by number, under its customer, at `/m/invoices/invoices/<id>`.
- `invoices-payment`: a payment, labelled by reference or date, under its customer, at `/m/invoices/payments/<id>`.

A grant on a customer covers its invoices and payments.

## Links

A link (an allocation) puts an amount of one payment against one invoice. Every write locks rows in one order: the customer row, then invoice rows in id order, then the payment row, then allocation rows. A write can skip a level and never reverses two, so two writes cannot deadlock. Under those locks, a link is refused when it would make the invoice's allocations exceed its total, or the payment's allocations exceed its amount.

A payment links only to an invoice of the same customer and the same currency. A pair links at most once; a second amount changes the existing link. A removed link returns its amount to the payment as unallocated. Every link, change and removal writes an `allocation_event` row, with the amounts before and after and the person who made it, and an audit row on the invoice. `automatic` marks a link the module made by itself, which Undo can remove. A changed link is a person's link, so it loses the mark.

## Saving invoices

An invoice saves as unpaid and joins outstanding at once. Its customer is either an existing one, chosen by id, or a new one that the person confirmed. A new customer needs a write grant on the whole deployment. A grant on one customer saves only that customer's invoices. Customer names are unique when case and outer spaces are ignored, so a confirmed name that already exists reuses that customer, and only a new one writes a `customer-created` audit row.

The key facts of a Possible duplicate invoice are the same customer and the same number, ignoring case and outer spaces. The save then answers `possible-duplicate` with the existing invoice and writes nothing. The person can send the save again with `keepPossibleDuplicate`, because no unique index holds the number. A document gives at most one invoice: a second save from it is refused with `document-already-saved`. An invoice save takes only an `invoice` document. A purchase order or a payment document is refused with `document-kind-mismatch`, so a purchase order never counts as a sale.

When the invoice is saved, R-31 runs in the same transaction. It takes each payment of that customer, in that currency, with no link, that names this invoice number and no other, and whose facts passed the quote check, oldest payment date first. Each one links automatically under R-30 when its amount fits the open amount that remains. A link made this way is marked automatic, so Undo applies, and it writes its allocation event and audit row. Every other payment stays unallocated for the person.

The seam for S7-08 and S7-09 is `MATCH_FACT_FIELDS`: the `field_origin` rows `customer`, `invoiceNumbers` and `amount` of the payment's document. Their facts passed the quote check when all three hold origin `extracted`. The reading job writes `extracted` only for a value that passed the quote check, and a person's change marks the field `corrected`, so a corrected payment never links by itself.

## Saving payments

The key facts of a Possible duplicate payment are the same customer, the same payment date, the same amount and the same currency. A payment of a customer that already existed with those facts answers `possible-duplicate` with the existing payment and writes nothing, until the person sends the save again with `keepPossibleDuplicate`. A document gives at most one payment, and a payment save takes only a `payment` document. The named invoice numbers are stored trimmed, in upper case, without repeats and sorted.

A payment saves in one of two ways.

- By hand, through `savePayment` at `POST /invoices/payments`. The person chooses the customer and the links. The save never links by itself. It checks a write grant on the customer and on each chosen invoice, and saves the payment and every link in one transaction, so a refused link, for example one above an invoice's open balance, saves nothing. A second save from the same document is refused with `document-already-saved`, before the duplicate check.
- From a reading, through `recordPaymentFromReading`, which the S7-08 reading job calls on the server. It is not a procedure. It finds the customer by name, ignoring case and outer spaces, and never creates one. It links automatically only under R-30: the payment names one invoice of that customer in its currency, the amount is no more than that invoice's open balance, and the document's `MATCH_FACT_FIELDS` all hold origin `extracted`. Every other case writes nothing and answers the match for the person.

For S7-08, each answer of `recordPaymentFromReading` and the inbox status it leads to:

| Answer | Inbox status |
| --- | --- |
| `saved` (an automatic link) | Linked automatically |
| `needs-review` with match `split` | Confirm the split |
| `needs-review` with match `no-match`, also when no customer has the name (`customerId` is null) | No matching invoice |
| `possible-duplicate` | Possible duplicate |
| `needs-review` with match `confirm`, `overpayment` or `suggestions` | Needs your input |
| `already-saved` | The document's payment is saved already; the job shows that payment |

## Datasets

`invoices`, `payments`, `customers`, with the measures of the specification, R-36.

## Demo pack

`demo-pack/` holds the fictional demo data: 6 customers, 36 invoices, 30 payments, the history PDFs, seven live-upload PDFs and the expected answers at reporting date 2026-10-27. The SQL and SQLite copies of the same history are left out, so `SHA256SUMS.txt` lists two files that are not here. `04_Demo_Guide/live_expected_entities_DO_NOT_PRELOAD.json` is test data only: no seed reads it.

## Open decisions

| Id | Question | Default if not decided |
| --- | --- | --- |
| OPEN-I1 | May real customer invoices go to OpenRouter? | No. Only the fictional demo data, until Management approves. |

## Not built

Foreign exchange, credit notes, refunds, write-offs, bank reconciliation, accrual accounting and tax rules.
