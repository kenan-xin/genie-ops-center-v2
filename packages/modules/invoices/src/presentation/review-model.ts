import type { PageBreadcrumb } from "@genie/core/features/shell";
import type { ReactNode, RefObject } from "react";

import type { ViewerHighlight } from "./document-viewer.tsx";
import type { Blocker } from "./review-blocker.ts";
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

/** What one kind of review gives its layout: the cards, the split, Save and what blocks it. */
export type ReviewModel = {
  readonly items: readonly ReviewItem[];
  /** The split section of a payment; null for an invoice or once saved. */
  readonly split: ReactNode | null;
  readonly blocker: Blocker | null;
  /** DuplicateNotice and SaveFailure, or null. */
  readonly notices: ReactNode;
  readonly saveLabel: string;
  readonly pending: boolean;
  /** Saves, or shows the blocker (Save and Enter). */
  readonly submit: () => void;
};

/** The parts of the page around the fields, which the review page builds once for both layouts. */
export type ReviewFrame = {
  readonly title: string;
  readonly meta: ReactNode;
  readonly breadcrumb: PageBreadcrumb;
  /** The Type select and its error; null for a reader. */
  readonly typeSelect: ReactNode | null;
  /** The Could not read card. */
  readonly notice: ReactNode | null;
  /** The reading landed on this page and its sweep has not played yet (P09-2). */
  readonly sweep: boolean;
  readonly onSweepEnd: () => void;
  /** The result card of a save made on this page; the cards then show their values read only. */
  readonly saved: ReactNode | null;
};

export type ReviewLayoutProps = {
  readonly frame: ReviewFrame;
  /** Null while the job reads. */
  readonly model: ReviewModel | null;
  /** The first file link of the page. */
  readonly fileUrl: string;
  /** A fresh file link for Download and Try again, because a link lives 5 minutes. */
  readonly refreshUrl: () => Promise<string | null>;
  readonly revealRef: RefObject<((blocker: Blocker) => void) | null>;
  readonly label: string;
  readonly discarding: boolean;
  /** Null hides Discard: while the job reads, and once saved. */
  readonly onDiscard: (() => void) | null;
};
