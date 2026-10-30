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

A link (an allocation) puts an amount of one payment against one invoice. Every write locks rows in one order: the customer row, then invoice rows in id order, then payment rows in id order, then allocation rows. A write can skip a level. One write reverses two levels: an invoice total correction locks the links of its invoice before their payments. This is safe because every write that touches a link locks the link's invoice first. With these rules, two writes cannot deadlock. Under those locks, a link is refused when it would make the invoice's allocations exceed its total, or the payment's allocations exceed its amount.

A payment links only to an invoice of the same customer and the same currency. A pair links at most once. A second link of the same pair is refused with `link-exists`. Change the existing link instead. A removed link returns its amount to the payment as unallocated. Every link, change and removal writes an `allocation_event` row, with the amounts before and after and the person who made it, and an audit row on the invoice. `automatic` marks a link the module made by itself, which Undo can remove. A changed link is a person's link, so it loses the mark.

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

## Receipts, purchase orders and corrections

A paid receipt is one invoice, one payment and one allocation. `savePaidReceipt` at `POST /invoices/receipts` saves, in one transaction, the invoice, a payment of its full total on the same date that names its number, and a link of that total, and writes a `receipt-saved` audit row. It takes only a `paid-receipt` document, gives at most one record per document, and asks Possible duplicate on the invoice's key facts like an invoice save.

No save takes a purchase-order document, so a purchase order changes no figure.

`correctInvoiceTotal` at `PATCH /invoices/invoices/{id}` changes an invoice total. A total at or above its allocations is saved with an `invoice-total-corrected` audit row. A total corrected below its allocations answers `choose-links` with the excess and the invoice's links, and writes nothing. The person sends it again with `reductions`, each the new, lower amount of one link of this invoice, where 0 removes the link. The reductions are applied as link changes, each with its allocation event and audit row, before the total changes. A reduction that names another invoice's link or does not lower its link is refused with `reduction-invalid`, and reductions that still leave the links above the new total are refused with `reductions-insufficient`, so nothing changes.

## Datasets

Four datasets, each under `invoices:read` and filtered by `scopesFor()`. A grant on a customer covers its invoices, payments and links. Every dataset reads as of the reporting date (R-9): it leaves out an invoice or a payment dated after it, and counts an allocation only when its payment is dated on or before it. The measures are those of R-36.

| Dataset | Rows | Time field | Record key |
| --- | --- | --- | --- |
| `invoices.invoices` | Invoices dated on or before the reporting date, with total (invoiced sales), allocated, outstanding, overdue, days overdue, settled on and paid late | `invoiceDate` | the invoice |
| `invoices.payments` | Payments dated on or before the reporting date, with amount (collections), allocated and unallocated | `paymentDate` | the payment |
| `invoices.customers` | Every customer, with the first invoice date and the late-payment counts | `firstInvoiceDate` | the customer |
| `invoices.allocations` | One row per link whose payment and invoice are both dated on or before the reporting date, under the scope of the invoice | `paymentDate` | the invoice |

Overdue is a positive outstanding with a known due date strictly before the reporting date, so due on the day is not overdue and an unspecified due date never is. Paid late holds only for a fully settled invoice with a known due date, so a part-paid invoice is not in the late-payment rate.

The specification names three datasets. The fourth, `invoices.allocations`, is the only way the generic query shape can show each link. `invoices.customers` holds no money, because a customer can be invoiced in more than one currency and a figure per customer would mix them; its late-payment counts carry R-36 per customer.

## Pages

The workspace entry Invoices opens the list at `/m/invoices/invoices`. Every page requires `invoices:use`, and every loader reads under `invoices:read`, so a person with only the Invoices and Payments user role gets the denied page (P5). Every page reads through the datasets above as of the reporting date (R-9), so no page adds a balance of its own and the pages and the agent agree (P3).

| Page | Path | Reads |
| --- | --- | --- |
| Invoices list | `/m/invoices/invoices` | `invoices.invoices`, ordered by invoice date and number, at most 1,000 rows; a cut read says how many it shows (P4; paging is deferred to `czjw.28`) |
| Invoice record | `/m/invoices/invoices/<id>` | The invoice's balance, its allocations, its history and a link to its source PDF |
| Payments list | `/m/invoices/payments` | `invoices.payments` |
| Payment record | `/m/invoices/payments/<id>` | The payment's amount, its links and its unallocated amount |

## Demo pack

`demo-pack/` holds the fictional demo data: 6 customers, 36 invoices, 30 payments, the history PDFs, seven live-upload PDFs and the expected answers at reporting date 2026-10-27. The SQL and SQLite copies of the same history are left out, so `SHA256SUMS.txt` lists two files that are not here. `04_Demo_Guide/live_expected_entities_DO_NOT_PRELOAD.json` is test data only: no seed reads it.

## Expected answers

`expected-answers.json`, beside the demo pack, holds the nine answers to the pack's read prompts at reporting date 2026-10-27, in integer cents: `overdue-invoices`, `repeated-late-payers`, `overdue-balances`, `monthly-invoiced-and-collected`, `top-customers-by-sales`, `top-customers-overdue`, `invoices-without-due-date`, `manual-due-dates` and `partial-payments`. Each holds its prompt, the R-36 measures it uses, its rows and, where one is meaningful, a total. The values come from the pack's own expected files and its history records, never from this module's code, and `testing/demo-history.integration.test.ts` proves the datasets answer every one of them. S7-11 asks the questions through the datasets, and S7-14 runs them as the answer track of the evaluation suite; both read this file.

## Open decisions

| Id | Question | Default if not decided |
| --- | --- | --- |
| OPEN-I1 | May real customer invoices go to OpenRouter? | No. Only the fictional demo data, until Management approves. |

## Not built

Foreign exchange, credit notes, refunds, write-offs, bank reconciliation, accrual accounting and tax rules.
