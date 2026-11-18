import type { IconAllowEntry } from "./icon-alignment.ts";

/**
 * Places the icon check skips. Each reason names a bead id or a design document and says why the
 * place is not a defect. An entry that waits for a later phase names that bead and phase, and that
 * phase removes it.
 */
export const ICON_ALIGNMENT_ALLOW_LIST: readonly IconAllowEntry[] = [
  {
    selector: ".recharts-legend-wrapper",
    reason:
      "6wz1.113 (Phase 07 Task 4 triage): a chart legend sits in the plot area, so its swatches are measured against the axis tick labels, which are no text column the swatch starts.",
  },
  {
    selector: "[data-slot=empty-icon]",
    reason:
      'tokens.md, "Empty state": the framed form centers its glyph in a 52 px icon tile by design; the check\'s tile term stops at 40 px, so it reads the centered glyph as a slot.',
  },
  {
    selector: "[data-slot=person-self-note] > svg",
    reason:
      "6wz1.113 (Phase 11 Task 4): person-access.prototype.html, viewer=self, draws the lock as a plain leading note beside one sentence. On the Sessions tab the column's nearest edge line is the Sign out all button's indented text, so the check reads the aligned lock as off it; the lock starts on the sheet's body text edge, which the Roles tab confirms.",
  },
  {
    selector: "[data-add-tile]",
    reason:
      "czjw.176: deck-phone.prototype.html (.th.add) centers the plus in the dashed 76 px preview box of the strip's Add tile, above the word Add, as a slide preview sits above its number; the check's tile term stops at 40 px, so it reads the centered glyph as a slot.",
  },
  {
    selector: "[data-visual-thumb]",
    reason:
      "czjw.180: edit-slide.prototype.html centers a chart or image glyph in the 56 x 36 px thumbnail of a Charts and images row, beside the row's name and kind; the check's tile term stops at 40 px, so it reads the centered glyph as a slot.",
  },
  {
    selector: "[data-slide-ring]",
    decoration: true,
    reason:
      "czjw.183 (P14-14): the ring of a title or statement slide is a 135 px slide decoration on the 960 x 540 canvas; in a scaled slide tile it draws under 24 px, so the check reads it as a box icon beside the slide's title.",
  },
  {
    selector: "[data-slot=agent-group-header] > svg:first-child",
    reason:
      "6wz1.113 (P07-55): agent-runs.prototype.html lines 190-191 and DEC-57: a chat history group header keeps the agent's icon in a fixed 16 px slot and indents its chats so their text starts under the name, so the icon leads the name, not the chats below it.",
  },
  {
    selector:
      '[role=log]:has([data-slot=brief-card]) ol[aria-label="Steps"] > li',
    reason:
      "czjw.181 (P15-35): agent-progress.prototype.html lines the steps up with the answer's text column, not with the icon inside the brief card above. While a handed-over run works there is no answer text yet, so the check's icon fallback reads the card's boxed icon. Task 9 or the owner may revisit this entry.",
  },
];
