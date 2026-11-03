# S7-36: Answer rules for the invoice answers

Bead: `czjw.59`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-35 (the summary fields of the `invoices` dataset), R-44 as amended 2026-11-03, AC-8. Owner rulings 1 to 3 and coordinator rulings 4 and 5 on the bead.
- [Module contract](../../../architecture/module-contract.md), dataset `summaryFields`.
- The module's expected-answers file.
- The [Spec 7 ticket index](../README.md).
- Prototype: none.

## Dependencies

Depends on: S7-35 (the short list and the full-list offer). Shares the system prompt and one re-recording with S7-37 and S7-38 in one branch. Runs on an Opus model (owner rule 1).

## Scope

- An answer about money states the total first, then the rows.
- A list answer shows a short top list with "n more".
- A list of a dataset's rows always shows its summary fields (for invoices: number, customer, outstanding), plus the columns the question is about.
- A follow-up reads the chat's earlier artifacts by their definition and runs the query again as the viewer.
- The chart gate rules go into the chart tool description and the catalog prompt. A refused chart returns its field message to the model, and the chat never shows a chart that the gate refuses.
- Update the expected-answers file, then re-record the answers with the live model in the one live phase of the run.

## Acceptance

With the recorded test model, the nine read questions match the updated expected-answers file. The shared definition of done in the [index](../README.md) also applies.
