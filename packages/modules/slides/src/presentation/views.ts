import type { ChatAvailability, PanelConfig } from "@genie/core";

import type { StoredElement } from "../content.ts";
import type { DeckSummary } from "../contract.ts";
import type { DeckTheme } from "../services/decks/theme.ts";

/**
 * One element as the screen shows it. A data element whose dataset the caller can no longer read
 * comes without its data (D15); the editor sends its stored `chart` back, and the screen shows
 * `chart.title`.
 */
export type ShownElement =
  | StoredElement
  | {
      readonly kind: "figure" | "chart" | "table";
      readonly hidden: true;
      readonly chart: PanelConfig;
    };

export type ShownSlide = {
  readonly id: string;
  readonly elements: readonly ShownElement[];
};

/** One deck as its owner reads it. */
export type DeckView = {
  readonly id: string;
  readonly title: string;
  readonly contentHash: string;
  readonly figuresAsOf: string;
  readonly canUndo: boolean;
  readonly slides: readonly ShownSlide[];
};

/** What the Slides list page loads. */
export type DeckListView = {
  readonly decks: readonly DeckSummary[];
  readonly canWrite: boolean;
  readonly timeZone: string;
  readonly chat: ChatAvailability;
};

/** What one deck page loads: the deck, the tenant theme and a link per image it shows (R-55). */
export type DeckPageView = {
  readonly deck: DeckView;
  readonly canWrite: boolean;
  readonly timeZone: string;
  readonly theme: Omit<DeckTheme, "logoFileId">;
  readonly logoUrl: string | null;
  readonly imageUrls: Readonly<Record<string, string>>;
};
