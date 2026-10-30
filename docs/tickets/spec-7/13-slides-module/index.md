# S7-13: Slides module

Bead: `czjw.13`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-52 to R-57. [Slides module](../../../modules/slides/README.md).
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-04](../04-chart-gate-and-component/index.md) to start, and [S7-10](../10-agent-runtime/index.md) for the chat panel and the tools.

## Scope

- Module `packages/modules/slides`: the `deck` table and typed element schema, permissions and default roles, owner-only decks.
- Hash-guarded patch edits, the Slides list and deck editor, frozen figures and Refresh data, the tenant branding theme, present mode.
- PowerPoint export with native charts through pptxgenjs, saved through `FileStorage`. Installs `pptxgenjs`.
- The chat panel and the deck tools through the `agent-tools` interface, with one claim per slide.
- Add `slides` to the include lists of `customers/genie-demo/deploy/` and `customers/genie-dev/deploy/` (`modules.txt` and `tenant.yaml`). S7-07 added `invoices` only, because the module did not exist yet.

## Acceptance

AC-10.
