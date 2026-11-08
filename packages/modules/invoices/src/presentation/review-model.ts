import type { ReactNode } from "react";

import type { ViewerHighlight } from "./document-viewer.tsx";
import type { OriginTagKind, ReviewFieldKey } from "./review-fields.tsx";

/** One field of a review as the desk card, the pager step and the summary show it (czjw.98). */
export type ReviewItem = {
  readonly key: ReviewFieldKey;
  readonly label: string;
  readonly tag: OriginTagKind;
  /** The quotes of the read value; none puts the card in the panel, with no pin. */
  readonly sources: readonly ViewerHighlight[];
  /** The input, or `display` as text once saved. */
  readonly control: ReactNode;
  /** The id that the label names; null for a group such as the due choice. */
  readonly controlId: string | null;
  /** The value in words, for the summary, the All fields list and a saved card. */
  readonly display: string;
  /** The read value in the input's format, once the person changed it. */
  readonly readAs: string | null;
  /** Puts the read value back and focuses the control; null once saved. */
  readonly onUndo: (() => void) | null;
  /** One card note of the product copy, or null. */
  readonly note: string | null;
};
