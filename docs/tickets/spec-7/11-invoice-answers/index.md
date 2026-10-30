# S7-11: Invoice answers

Bead: `czjw.11`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-36, R-44.
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-06](../06-invoice-records-and-datasets/index.md), [S7-10](../10-agent-runtime/index.md).

## Scope

The measure definitions and dataset descriptions for the nine read questions, their recorded responses, and end-to-end tests that each answer shows its reporting date, its calculation and the records behind it. Out of scope: the deck question (S7-13).

Add R-46's module rule (the agent never creates, changes or links invoices and payments) and the R-44 answer rules to the system prompt through a module seam: extend the `agent-tools` contract with module instructions in core, in the same change (S7-10 plan P9).

## Acceptance

AC-8, on the invoice datasets.
