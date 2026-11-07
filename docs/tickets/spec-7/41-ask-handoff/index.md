# S7-41: The Ask handoff: tool, brief, card and target panel

Bead: `czjw.122`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-42, R-42b, R-43, R-46, AC-13.
- [Technical plan](../../../tech-plans/07-invoice-and-payments.md), wave 5, Decisions: "The brief", "Record creation", "How pages follow a run", "Handed-over run defaults".
- The [Spec 7 ticket index](../README.md).
- Prototype: `product/agent-handoff.prototype.html`, variant A, design worktree branch `chore/prototype-ask-chat`, commit `f518be2`.

## Dependencies

Depends on: S7-40 and `czjw.120` (the shared chat parts). With only the test surface declared, the handoff is exercised in tests; Ask offers it to people once S7-42 declares the Slides and Dashboards surfaces.

## Scope

- The `hand-over` tool, in Ask sessions only, on the person's own request: the zod brief (`surface`, `goal`, `facts[]` with dataset id and as-of date, `datasets[]`, `period`, `artifacts[]`, `notPassed[]`); refusal of an unknown dataset, another chat's artifact, or a surface that does not accept a handoff.
- In one transaction: the surface's `createRecord` makes the empty record, core creates the target session bound to it with the brief as its first message (`data-brief` part plus a text rendering), writes one audit row naming both sessions, and calls `startRun`. If `createRecord` refuses, nothing is saved and Ask says why. The tool answers the target address built from `recordPage` and the new id.
- Ask UI: the one-line answer and the handoff card (title, live status, Open the record, fold "What Ask passed"), then the page opens; a header chip for running work that links to it; Ask history lists only Ask sessions; a second handoff while one builds answers with the first one's link.
- Target panel in `packages/core/src/features/agent/`: the surface's agent name, tabs This chat and the surface's chats (this record's first), the From Ask brief card with Open the Ask chat, the steps and text from the checkpoints, a Building or Saved chip, Building and Stop in place of Send while `run_state` is set, and an interrupted or stopped notice with Try again. TanStack Query reads the session every second while `run_state` is set, and the record page's own query refetches on the same tick. On a phone the panel is a bottom sheet.
- Synthetic scripted model fixtures for the handoff tests; R1 of follow-up 11 records them live.

Out of scope: the Slides and Dashboards surfaces (S7-42).

## Acceptance

Unit tests: the brief schema and its refusals. Integration tests with the test surface: a handoff creates the record, the session, the audit row and the link, and starts the run; a refused `createRecord` saves nothing. Stories and behavior tests for the handoff card and the target panel, including building, saved, stopped and interrupted, at both viewports. The shared definition of done in the [index](../README.md) also applies.
