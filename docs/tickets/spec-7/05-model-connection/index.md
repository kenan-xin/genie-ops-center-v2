# S7-05: Model connection and test model

Bead: `czjw.5`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-17 to R-21. `DEC-53`, `DEC-55`.
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-01](../01-documents-and-fixtures/index.md).

## Scope

- The `DEC-53` key store and the write-only key field.
- Settings for the allowed models, the chat default and the document-reading default.
- One core function that builds every model: `@openrouter/ai-sdk-provider`, the stored key, an allowed host, a timeout, and provider preferences that deny data collection. Installs `ai` and `@openrouter/ai-sdk-provider`.
- A recorded test model that replays stored responses in tests, the recordings with the test fixtures, and an owner-only script that refreshes them from a live run.
- AI features show that they are off with no key.

Out of scope: the full outbound HTTP service, other connection kinds.

## Acceptance

AC-5.
