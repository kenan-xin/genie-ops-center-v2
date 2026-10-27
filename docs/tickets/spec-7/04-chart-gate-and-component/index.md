# S7-04: Chart write gate and chart component

Bead: `czjw.4`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-14 to R-16.
- [UI development workflow](../../../architecture/ui-development.md) and [UI component sources](../../../architecture/ui-component-sources.md).
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-03](../03-module-contract-additions/index.md).

## Scope

- The panel config schema with a closed key list per chart type.
- The core chart gate: queries run, fields match returned columns and types, the chart-type rules, an empty result is valid, a failure returns a fix hint and saves nothing.
- One chart component in `packages/ui` on the shadcn Chart component, with an empty state, a table view, a caption and stable series colors. Installs `recharts` through the shadcn registry.

Out of scope: saving dashboards or decks, agent tools.

## Acceptance

AC-4.
