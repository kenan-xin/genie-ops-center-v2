# S7-06: Invoice records, matching and datasets

Bead: `czjw.6`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-22, R-29 to R-36, R-39.
- [Invoices and Payments module](../../../modules/invoices-and-payments/README.md) and its demo pack.
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-03](../03-module-contract-additions/index.md).

## Scope

- Module `packages/modules/invoices` from the generator: tables, migrations, factories, permissions and default roles.
- Procedures to save invoices and payments and to link, unlink and change allocations, with allocation events, the module audit call, the row lock, the unique hash and the allocation check.
- Matching in plain code, paid receipts, purchase orders, Possible duplicate, overpayment, a total corrected below its allocations, a new customer created only on confirmation.
- Datasets `invoices`, `payments`, `customers` and the record-type resolvers.
- An expected-answers file for the nine read questions at 2026-10-27.

Out of scope: pages and seed (S7-07), reading documents (S7-08).

## Acceptance

AC-6.
