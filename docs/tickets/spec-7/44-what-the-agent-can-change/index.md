# S7-44: The agent names what it can change

Bead: `czjw.104`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-46a, AC-13.
- [Technical plan](../../../tech-plans/07-invoice-and-payments.md), wave 5, Decisions: "What I can change".
- The [Spec 7 ticket index](../README.md).
- Prototype: none.

## Dependencies

Depends on: S7-43.

## Scope

- Core's base prompt: "When a request is outside your tools, say in one sentence what you can change, offer the nearest change, and never name a tool that does not exist." It applies to Ask and every surface.
- The Slides surface instructions: one written "You can change" line that names slides and their order, titles, text, bullets, figures, charts, tables, images, each element's position and size, text color, size, weight and alignment, fills, borders and the slide background.
- The Dashboards surface instructions: the same kind of line for panels, chart type, name and filters.
- A unit test per surface reads the step kinds and style keys from the zod schema and fails when one is missing from the line. S7-45, S7-46 and S7-47 depend on this ticket and extend the lines when they add steps; this test makes them.
- Synthetic scripted model fixtures for the out-of-tools answer; R1 of follow-up 11 records them live.

## Acceptance

With the scripted fixtures, and after R1 with the live recordings, a request outside the tools in Ask, on a deck and on a dashboard gets one sentence that names what the agent can change and offers the nearest change. The line tests fail when a schema key is removed from a line. The shared definition of done in the [index](../README.md) also applies.
