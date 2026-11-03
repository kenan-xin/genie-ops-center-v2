# S7-33: A deck by chat in one call, with no "refused" steps

Bead: `czjw.79` (bug). Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-15, R-42a (a call refused and then fixed is one step), AC-10. Owner, 2026-11-03 dry run step 10, issue I21.
- The [Spec 7 ticket index](../README.md).
- Prototype: `chat-bubble.prototype.html?variant=B` in the design workspace, branch `chore/prototype-ask-chat` (`3408041`), the fixed step.

## Dependencies

Depends on: S7-28 (the step timeline). Runs on an Opus model (owner rule 1).

## Scope

- A tool input schema error returns to the model as a fixable tool error with the path and the limit, as the chart gate does. Never the generic error.
- The `slides-create-deck` tool description and the chart catalog prompt state the 90-character text limit and the chart gate rules: no `orderBy` on a series with one group and one aggregate, and an amount column needs the dataset's currency field.
- A self-corrected retry shows as one step ("Made a deck, after 3 fixes"). Refused stays for a final refusal.

## Acceptance

With the recorded test model, the step 10 request saves the deck in one call. A forced schema error returns the field message to the model. The step list shows one deck step. The shared definition of done in the [index](../README.md) also applies.
