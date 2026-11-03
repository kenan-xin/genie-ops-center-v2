# S7-32: An agent tool that changes an open deck, with Undo

Bead: `czjw.63`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-15 (the chart gate), R-46 (Undo reverses a chat change to a deck), R-53 (patch operations), AC-10. Owner ruling D21, 2026-11-03.
- [Module contract](../../../architecture/module-contract.md), `agent-tools`.
- The [Spec 7 ticket index](../README.md).
- Prototype: none.

## Dependencies

Depends on: S7-28 (the panel on the deck editor) and S7-31 (the open deck and slide). Runs on an Opus model (owner rule 1).

## Scope

- A `slides-change-deck` agent tool: change a slide's title, text, chart or order, and add or remove a slide.
- Charts pass the same chart gate. Edits are patch operations guarded by the content hash.
- Undo reverses the change.
- No separate chat on the deck view.
- Recordings for the recorded test model.

## Acceptance

With the recorded test model, "change this slide" on the deck editor changes the selected slide, and Undo restores it, at phone and desktop. A change made on an older version is refused. The shared definition of done in the [index](../README.md) also applies.
