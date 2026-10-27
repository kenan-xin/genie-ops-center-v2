# S7-14: Evaluation suite and model choice

Bead: `czjw.14`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-58.
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-08](../08-reading-job-and-inbox/index.md), [S7-11](../11-invoice-answers/index.md).

## Scope

- A script outside `pnpm gate:merge` that calls live models with the owner's key.
- The extraction track against `live_expected_entities_DO_NOT_PRELOAD.json`, and the answer and chart track at 2026-10-27, three runs per case for `anthropic/claude-opus-5.5`, `openai/gpt-6.1-terra` and `deepseek/deepseek-v4.1-flash-1017`.
- A committed report, the recommended defaults written into the seed, and refreshed recordings for the test model.

Out of scope: a vision critique.

## Acceptance

AC-11.
