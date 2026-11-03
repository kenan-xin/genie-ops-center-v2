# S7-22: Hydration warning on the Documents pages

Bead: `czjw.83` (bug). Status and claims live in Beads, not in this document.

## Governing documents

- Owner, 2026-11-03 dry run, issue I3. No numbered Spec 7 line covers it, so the acceptance comes from the bead.
- The [Spec 7 ticket index](../README.md).
- Prototype: none.

## Dependencies

Depends on: nothing. Runs in P2-2 because it touches the inbox.

## Scope

- Reproduce the React hydration warning in a clean browser (a Playwright end-to-end run with no extensions) first.
- If it reproduces, fix the server and client mismatch at its cause (often a date, a time zone or a locale).
- If it does not reproduce, close the bead as caused by the browser extensions, with the proof.

## Acceptance

A clean-browser run of the Documents pages logs no hydration warning, or the bead closes with the proof that only extensions cause it. The shared definition of done in the [index](../README.md) also applies.
