# S7-48: New deck from a description

The owner approved this ticket and its row in the [Spec 7 ticket index](../README.md) on 2026-11-13. Bead: `czjw.174`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-42, R-42b, R-46 (amended 2026-11-13), R-52, R-53.
- `DEC-29`, amended 2026-11-01 (Delete reverses a chat create) and 2026-11-07 (surface agents and the handoff), in `docs/core/decision-log.md`.
- [The agent](../../../architecture/agent.md), "Surfaces and the handoff". [Module contract](../../../architecture/module-contract.md), `agent-surface`.
- Prototype: [`new-deck-flow.prototype.html`](../../../design/prototypes/new-deck-flow.prototype.html), reviewed by the owner and polished on 2026-11-13. The bar at the top switches 1 Describe, 2 Drafting, 3 Ready, and Desktop or Phone. The [import record](../../../design/imports/2026-11-12-new-deck-flow.md) holds its source and hash.
- Implementation plan: `Working/plans/new-deck-from-description-plan.md` in the worktree of branch `feature/new-deck-from-description`.

## Dependencies

Depends on: S7-40, S7-41 and S7-42 (built). It uses the durable run, the target panel and the Slides surface as they are.

## Scope

- Core: one `agent` procedure starts a surface's run on a new record from a page. One transaction makes the record through the surface's `createRecord`, a session on that surface with the description as its first message, and the run. No module contract point is added. Two page hooks in `@genie/core/features/agent/panel`: one starts the run and opens the record page with the panel open, one reads the run of a record.
- Slides list: New deck opens an inline composer under the page header when chat is on, and the composer takes the place of the New deck button. Cancel brings the button back with focus. Enter creates and Shift and Enter start a new line. The two starters fill the text. With chat off, New deck keeps the title dialog.
- Deck page while the agent drafts: the title waits for the name and stays plain text until the run ends, the status reads "Drafting slide n", the slide rail shows the drafted slides and one placeholder after them, the canvas shows the newest slide, and hand edits wait until the run ends. Stop ends the run, keeps the slides, and the status reads "Stopped, n slides kept". When the run ends, the status reads "n slides drafted", and Export, More actions and Present return. Present stays disabled while the deck has no slides.
- Deck page: once the run ends, the title renames in place. Enter saves, Escape cancels, at most 80 characters.

Out of scope: a planned slide count (owner, 2026-11-13: "Drafting slide n" only), a change to the step limit (open question below), and the same flow on Dashboards.

## Owner rulings, 2026-11-13

- R-46, amended: "Create deck with a description on the Slides list is the person's own request to name the new deck and build it. The first message of its chat shows the description as the person wrote it."
- The page shows "Drafting slide n" and one placeholder after the drafted slides. No tool input changes and no migration.
- The agent's final answer stays as the existing rules write it. It does not claim that Undo reverts the agent's changes, and no Slides rule is added.
- This ticket and its index row are approved.

## Acceptance

Unit tests: the title cut, the start text, the run of a record, the drafting status and the unnamed rule. Integration tests with the placeholder test surface: a start saves the record, the session, the first message and the run; a refused start (a run already builds, AI off, no write key, a refused `createRecord`) saves nothing. Stories with behavior tests for the composer, the drafting and ready deck page, and rename in place, at both viewports. End to end at phone and desktop with synthetic fixtures: describe, the deck page fills slide by slide, the agent names the deck, rename in place; Stop keeps the slides; leaving the page does not stop the run. The shared definition of done in the [index](../README.md) also applies.

## Open question

The step limit of 10 (`AGENT_LIMITS.steps`) allows about five or six slides per run from a description. The owner is still deciding. The deck page and the end-to-end proof wait for that answer, and this ticket does not change `AGENT_LIMITS`.
