# S7-38: Plain labels and dates in answers

Bead: `czjw.74`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-16 and R-44 as amended 2026-11-03 (no internal dataset or field names, no ISO dates). Owner, 2026-11-03 dry run step 8, issue I17. It folds wave 4 deviation D33.
- The [Spec 7 ticket index](../README.md).
- Prototype: none.

## Dependencies

Depends on: S7-29. Shares the system prompt and one re-recording with S7-36 and S7-37 in one branch. Runs on an Opus model (owner rule 1).

## Scope

- The agent instructions and the chart gate's column labels name datasets and fields by their human titles only.
- Dates print in the app format (27 Oct 2026).
- Table headers use plain labels, not column names.

## Acceptance

The recorded invoice answers hold no internal dataset or field name and no ISO date. One live smoke case in the live phase confirms it. The shared definition of done in the [index](../README.md) also applies.
