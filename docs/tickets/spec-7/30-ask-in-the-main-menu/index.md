# S7-30: Ask in the main menu, and Open in Ask continues the chat

Bead: `czjw.76`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-42 (the main menu lists Ask, both list the same sessions), AC-8. Owner, 2026-11-03 dry run, issue I1. It replaces wave 4 deviation D32.
- The [Spec 7 ticket index](../README.md).
- Prototype: `ask-chat.prototype.html?variant=B` in the design workspace, branch `chore/prototype-ask-chat` (`279afdd`).

## Dependencies

Depends on: `6wz1.89` (Ask also shows in the collapsed icon rail) and S7-28 (Open in Ask sits in the panel header). Runs on an Opus model (owner rule 1).

## Scope

- The main menu lists Ask for a holder of `core:ask:use`, also in the collapsed icon rail.
- Open in Ask opens the session in progress, not a new Ask page, so the conversation continues full page.

## Acceptance

End-to-end at 390 and 1440: Ask shows in the menu for a holder of `core:ask:use` and not for anyone else, and Open in Ask shows the same session with its messages. Stories for the menu entry. The shared definition of done in the [index](../README.md) also applies.
