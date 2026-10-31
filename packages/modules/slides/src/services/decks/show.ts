import { listDatasets, type ModuleRequestContext } from "@genie/core";

import type { DeckView } from "../../presentation/views.ts";
import type { DeckRecord } from "./store.ts";

/**
 * The deck as the caller may see it. A deck shows frozen data, so the show path runs no gate: it
 * only hides each data element with a dataset the caller can no longer read, data dropped (D15).
 */
export async function deckViewFor(
  ctx: ModuleRequestContext,
  record: DeckRecord
): Promise<DeckView> {
  const readable = new Set((await listDatasets(ctx)).map(({ name }) => name));

  return {
    id: record.id,
    title: record.title,
    contentHash: record.contentHash,
    figuresAsOf: record.frozenOn,
    canUndo: record.undo.length > 0,
    slides: record.content.slides.map((slide) => ({
      id: slide.id,
      elements: slide.elements.map((element) =>
        "chart" in element &&
        element.chart.series.some(({ dataset }) => !readable.has(dataset))
          ? { kind: element.kind, hidden: true, chart: element.chart }
          : element
      ),
    })),
  };
}
