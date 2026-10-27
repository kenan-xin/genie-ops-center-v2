# S7-03: Module contract additions

Bead: `czjw.3`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-3 to R-13. `DEC-54`. The module contract rows added in S7-01.
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-01](../01-documents-and-fixtures/index.md). Beads folded into this ticket: `d8l5.22` (job principal).

## Scope

- The `datasets` point and the dataset service: `listDatasets`, `queryDataset`, `queryDatasetSeries`, the generic query shape with range buckets, the row cap, the time limit, the money rule, the disabled-module skip.
- The reporting-date column on `tenant_settings`, on the Settings page, through the cached settings reader.
- The module audit call with module-prefixed actions.
- The record route from a record key to a page path.
- Job retries and backoff, the job principal, and module-enqueued jobs.
- Capabilities registered with their module id, and the list form of the registry.
- Placeholder proofs for each item, and one dataset read in the standing tenant isolation test.

Out of scope: the chart gate (S7-04), invoice datasets (S7-06), the `agent-tools` interface (S7-10).

## Acceptance

AC-2, AC-3.
