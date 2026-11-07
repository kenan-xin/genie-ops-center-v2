# S7-42: Slides and Dashboards surfaces, slide by slide, and add as a panel

Bead: `czjw.96`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-42, R-42b, R-46 (amended 2026-11-08), AC-13.
- [Technical plan](../../../tech-plans/07-invoice-and-payments.md), wave 5, Decisions: "How a module declares a surface", "Record creation", "Handed-over run defaults", "Test fixtures before R1".
- agent-native slide-by-slide generation, pattern only (MIT, commit `f31225ba3332a3dd4965d1ee5644df4d281bc650`, `templates/slides/actions/create-deck.ts`, `add-slide.ts`).
- The [Spec 7 ticket index](../README.md).
- Prototype: `product/agent-handoff.prototype.html`, variant A (the deck page filling).

## Dependencies

Depends on: S7-41.

## Scope

- Slides and Analytics each declare an `agent-surface` with their record page (the deck page, the dashboard page) and a `createRecord` that makes an empty deck or dashboard with the brief's title. Their write tools move from `agent-tools` to the surface; their list and read tools stay in `agent-tools`, which the surface session also gets.
- Slide by slide: the Slides instructions ask for one `add-slide` step per `slides-change-deck` call. `slides-change-deck` and `analytics-change-dashboard` answer the record's new content hash, so the next call needs no read in between; a five-slide deck then takes one read and five changes inside `AGENT_LIMITS.steps`. A deck that a handoff created keeps Delete as its inverse.
- Add as a panel (`czjw.96`): on a dashboard or deck page, a request for a chart or a table first asks "Add this as a panel to <name>?" (or a slide) with Add and "Just show it here"; Add uses the surface's write tool with Undo, the other choice makes an artifact. Ask asks nothing.
- Synthetic scripted model fixtures for both surfaces; R1 of follow-up 11 records them live.

Out of scope: position and style (S7-43), the "You can change" lines (S7-44).

## Acceptance

End to end at phone and desktop with the scripted fixtures: ask for slides in Ask, the deck page opens at once and fills slide by slide, Ask history has no Slides chat, and the deck page lists the chat under Slides chats; the same for a dashboard. On a dashboard, a chart request asks first, Add makes a panel with Undo, and "Just show it here" makes an artifact. After R1, the same tests pass on the live recordings. The shared definition of done in the [index](../README.md) also applies.
