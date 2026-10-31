import type { PanelConfig } from "@genie/core";

import type { StoredElement } from "../content.ts";

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
