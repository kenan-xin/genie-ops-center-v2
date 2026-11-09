# S7-43: Position and style per slide element

Bead: `czjw.103`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-52a, R-53, R-55, AC-14.
- [Technical plan](../../../tech-plans/07-invoice-and-payments.md), wave 5, Decisions: "Element position", "Change steps", "Style reach", "Style defaults".
- agent-native `packages/toolkit/src/canvas-interactions/canvas-interactions.ts` and `hotkey-keys.ts` (MIT, commit `f31225ba3332a3dd4965d1ee5644df4d281bc650`), copied with the licence and a provenance note.
- [UI component sources](../../../architecture/ui-component-sources.md). `docs/modules/slides/README.md`.
- The [Spec 7 ticket index](../README.md).
- Prototype: the slide editor controls prototype of phase W3a, variant A, a floating toolbar on the selection with a Position control: [`slide-editor-controls.prototype.html`](../../../design/prototypes/slide-editor-controls.prototype.html), captures in [`slide-editor-controls/`](../../../design/sections/invoices-and-payments/slide-editor-controls/). Picked by the run, owner review at G3 (owner, 2026-11-08).

## Dependencies

Depends on: S7-42 (the Slides surface holds `slides-change-deck`) and the Phase 12 import.

## Scope

- `contract.ts`: optional `box` per element on the 960 by 540 canvas; optional `style` (text kinds: color, font size from the scale 12, 14, 18, 24, 32, 40, 56, weight, alignment, fill, border; visual kinds: fill, border); optional slide `background`. Absent values keep today's layout; stored decks read unchanged.
- Steps `change-element { slideId, index, box?, style? }` and `change-slide-fields { slideId, background? }` (S7-45 adds `notes`); `add-slide` and `change-slide` may carry box and style. One step is one Undo entry.
- Checks on save: a box inside the canvas and above the minimum size per kind; a property that does not apply to the kind is refused; text contrast 4.5:1 (3:1 for large text) against its fill, else the background, else the theme; a background change re-checks every text element without a fill. A refused change saves nothing and names the element.
- Renderer: a stored box replaces the computed box of `slideLayout`; styles draw on screen and in present mode.
- Editor: select, move, resize and nudge from the copied canvas logic, with our own adapter mapping one gesture to one `change-element` step; snap to 8 units; the style controls of variant A (Base UI popover, lucide icons); an Add element menu.
- Phone, decided by the Phase 12 pick: a drag moves and resizes, with four corner handles that have 44 px touch areas and snap to 8. The style toolbar docks at the bottom in two rows. Position opens the nudge pad and the width and height steppers in a bottom sheet, and in a popover on a desktop, so every width can move and resize without a drag (WCAG 2.2 SC 2.5.7).
- Export (`build.ts`): boxes, colors, fills, borders, font sizes and alignment through pptxgenjs.
- Update `docs/modules/slides/README.md` and the tool description so a first call passes.

## Acceptance

Unit tests: the contrast check, the box limits, the kind rules, the defaults. Integration test: a styled change saves, undoes and exports with the same boxes and colors. End to end at phone and desktop: "make the title slide dark blue with white text" changes the deck and Undo reverses it; a drag and a resize each make one Undo entry; a low-contrast color is refused. The shared definition of done in the [index](../README.md) also applies.
