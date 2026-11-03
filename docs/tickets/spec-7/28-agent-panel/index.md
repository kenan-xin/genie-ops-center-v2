# S7-28: Agent panel with the step timeline

Bead: `czjw.81`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-42, R-42a, AC-8. Owner, 2026-11-03, issue I22. It replaces redesign choices 2 and 5.
- [How the agent works](../../../architecture/agent.md).
- [UI development](../../../architecture/ui-development.md).
- The [Spec 7 ticket index](../README.md).
- Prototype: `chat-bubble.prototype.html?variant=B` in the design workspace, branch `chore/prototype-ask-chat` (`3408041`), captures `product/chat-bubble-captures/variant-B-*`.

## Dependencies

Depends on: `6wz1.89` (the flush shell and the top bar). Builds one shared component set with S7-29 in the same branch, never two copies. Runs on an Opus model (owner rule 1).

## Scope

- No floating bubble. A full-height panel, about 400 px, docked on the right and flush. On a desktop it pushes the page narrower, and on a phone it is a full-screen sheet.
- An Agent button with a status dot in the top bar opens and closes it. The dot pulses while the agent works, and the button reads Working when the panel is closed.
- The header reads Agent, with the page context line (S7-31) and Open in Ask.
- The panel replaces each page's own chat on dashboards and Slides.
- The step timeline of R-42a: Thinking before the first step, the active node moves, older steps fold into "+n earlier steps", elapsed seconds after 3 s, a slow-step line after 20 s, grouped reads, one step for a fixed retry, a failure box with Try again, a finished strip that expands. Reduced motion shows still indicators and text.
- Messages, timeline, streaming, Stop, composer and artifact card live once in `packages/core/src/features/agent`. No module words in the chrome.

## Acceptance

AC-8 for the panel. End-to-end at phone and desktop: the panel opens from the Agent button, pushes the page, the dot pulses while it works, the timeline folds, and a grouped read and one fixed step show. Stories cover every state in both frames. The shared definition of done in the [index](../README.md) also applies.
