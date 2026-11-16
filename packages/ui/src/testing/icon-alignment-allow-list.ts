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
    selector: "[data-slot=agent-group-header] > svg:first-child",
    reason:
      "6wz1.113 (P07-55): agent-runs.prototype.html lines 190-191 and DEC-57: a chat history group header keeps the agent's icon in a fixed 16 px slot and indents its chats so their text starts under the name, so the icon leads the name, not the chats below it.",
  },
];
