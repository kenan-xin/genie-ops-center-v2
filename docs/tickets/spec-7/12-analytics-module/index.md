# S7-12: Analytics module

Bead: `czjw.12`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-48 to R-51. [Analytics module](../../../modules/analytics/README.md).
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-04](../04-chart-gate-and-component/index.md) to start, and [S7-10](../10-agent-runtime/index.md) for the chat panel and the tools.

## Scope

- Module `packages/modules/analytics`: the `dashboard` table and config schema, permissions and default roles, owner-only dashboards.
- The Dashboards list and dashboard page, editing by hand, dashboard filters, the 10-second refresh, Undo, the chart gate on every save.
- The chat panel and the dashboard tools through the `agent-tools` interface.
- The Receivables overview starter as a step of the S7-07 seed script, with its test.
- Add `analytics` to the include lists of `customers/genie-demo/deploy/` and `customers/genie-dev/deploy/` (`modules.txt` and `tenant.yaml`). S7-07 added `invoices` only, because the module did not exist yet.

## Acceptance

AC-9.
