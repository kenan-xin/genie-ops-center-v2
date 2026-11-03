# S7-31: The agent panel knows the page

Bead: `czjw.77`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-42 (the panel names the open record through the page context) and R-46. Owner, 2026-11-03 dry run, issue I20, and the D21 ruling.
- [Module contract](../../../architecture/module-contract.md), page context. Authorization goes through `can()` and `scopesFor()` (`DEC-39`).
- The [Spec 7 ticket index](../README.md).
- Prototype: `chat-bubble.prototype.html?variant=B` in the design workspace, branch `chore/prototype-ask-chat` (`3408041`), the About line.

## Dependencies

Depends on: S7-28. Runs first in P2-5, on an Opus model (owner rule 1).

## Scope

- Each page declares its context through the module contract: page, record type and id, tab, filters, search, sort, selection. Names and ids only, never the visible rows.
- The panel sends it with each message, and the server adds one line to the prompt. The agent reads data through its tools as the person, so a forged context reveals nothing.
- The panel shows an "About: <page>" line that the person can remove before sending.
- On the deck editor the context names the open deck and the selected slide (D21).
- Write the seam's shape into `module-contract.md` in the same change.

## Acceptance

End-to-end at phone and desktop: on Invoices with the Overdue tab, "which of these is largest?" answers from the overdue list. On a review page, "what is wrong with this document?" answers about that document. On the deck editor, "change this slide" acts on the selected slide. A forged context for a record the person cannot read returns nothing. The shared definition of done in the [index](../README.md) also applies.
