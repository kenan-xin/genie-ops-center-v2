# S7-37: Result first, method after

Bead: `czjw.62`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-44 as amended 2026-11-03 (the method follows the result). Design review 5.2.
- The [Spec 7 ticket index](../README.md).
- Prototype: none.

## Dependencies

Depends on: S7-29. Shares the system prompt and one re-recording with S7-36 and S7-38 in one branch. Runs on an Opus model (owner rule 1).

## Scope

- Change the system prompt so that an answer opens with its result in one short sentence, and the method follows.
- The "How this was counted" fold reads only tool output, so it stays when the prose changes.
- Re-record the placeholder and invoice answers, and update `ask.spec.ts` and `invoice-answers.spec.ts`.

## Acceptance

With the recorded test model, every recorded answer opens with its result, and the two end-to-end specs pass at phone and desktop. The shared definition of done in the [index](../README.md) also applies.
