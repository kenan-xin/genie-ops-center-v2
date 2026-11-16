import type { IconAllowEntry } from "./icon-alignment.ts";

/**
 * Places the icon check skips. Each reason names a bead id or a design document and says why the
 * place is not a defect. An entry that waits for a later phase names that bead and phase, and that
 * phase removes it.
 */
export const ICON_ALIGNMENT_ALLOW_LIST: readonly IconAllowEntry[] = [];
