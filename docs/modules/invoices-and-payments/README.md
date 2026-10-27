# Module: Invoices and Payments

## Who it is for

A small finance team that issues invoices and receives payments, and a manager who asks questions about them.

## Problem

Invoices and payments arrive as loose documents in any order: partial, combined, duplicate or unreferenced payments, and invoices with no due date. The team needs records that are complete and correct enough for questions, dashboards and reports to trust.

## What it does

A person uploads documents to the Documents inbox. A model reads each one and classifies it. The person completes what is missing and saves an invoice as unpaid. Payments link to invoices automatically when the match is clear, and by the person's choice otherwise. Balances are always the invoice total minus its allocations. The module publishes datasets that the boss agent, Analytics and Slides read. Full requirements: `../../specs/07-invoice-and-payments.md`, R-22 to R-39.

## Permissions and roles

`invoices:read` and `invoices:write`. Default roles: Finance (both) and Viewer (read).

## Tables

`customer`, `document`, `invoice`, `payment`, `allocation`, `field_origin`, `allocation_event`. Amounts are integer cents with a currency code.

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
