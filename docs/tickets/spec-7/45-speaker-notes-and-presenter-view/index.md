# S7-45: Speaker notes and the presenter view

Bead: `czjw.115`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-55a, R-56, AC-14.
- [Technical plan](../../../tech-plans/07-invoice-and-payments.md), wave 5, Decisions: "Change steps".
- agent-native `templates/slides/app/components/presentation/PresenterView.tsx`, `SpeakerNotesPanel.tsx` and `actions/export-pptx.ts` `addNotes` (MIT, commit `f31225ba3332a3dd4965d1ee5644df4d281bc650`), pattern only.
- The [Spec 7 ticket index](../README.md).
- Prototype: the presenter window prototype of phase W3a of follow-up 11, variant A: the current slide first, opened by "Present with notes" in the Present split button, and on a phone the notes field under the title in the Edit slide sheet. [`presenter-window.prototype.html`](../../../design/prototypes/presenter-window.prototype.html), captures in [`presenter-window/`](../../../design/sections/invoices-and-payments/presenter-window/). Picked by the run, owner review at G3 (owner, 2026-11-08). It reuses present mode's frame.

## Dependencies

Depends on: S7-43 (`change-slide-fields`), S7-44 (the "You can change" line and its test) and the Phase 12 import.

## Scope

- `contract.ts`: optional plain-text `notes` per slide with a length cap; absent reads as no notes.
- `change-slide-fields` gains `notes`; `add-slide` and `change-slide` may carry notes.
- Editor: a notes field under the slide; typing saves one step per pause through TanStack Pacer, one Undo entry each. On a phone the field sits in the editor sheet.
- Present: a presenter window, a module page under the deck, with the current slide, the next slide, the notes and a timer, synced with the audience window over `BroadcastChannel`.
- Export: pptxgenjs `addNotes`.
- Agent: the Slides surface may write notes on request; its instructions say notes hold no figure the slide does not show (R-56); its "You can change" line names notes.
- Update `docs/modules/slides/README.md`. No live transcription.

## Acceptance

Unit test of the notes cap. Integration test: notes save, undo and reach the exported file's notes. End to end at desktop: the presenter window follows the audience window. End to end at phone: notes edit in the editor sheet. The shared definition of done in the [index](../README.md) also applies.
