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
