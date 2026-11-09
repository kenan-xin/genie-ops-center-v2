import { listDatasets, type ModuleRequestContext } from "@genie/core";

import type { ImageLinks } from "../../presentation/image-links.ts";
import type { DeckView } from "../../presentation/views.ts";
import type { DeckRecord } from "./store.ts";

/**
 * The deck as the caller may see it. A deck shows frozen data, so the show path runs no gate: it
 * only hides each data element with a dataset the caller can no longer read, data dropped (D15).
 */
export async function deckViewFor(
  ctx: ModuleRequestContext,
  record: DeckRecord
): Promise<Omit<DeckView, "images">> {
  const readable = new Set((await listDatasets(ctx)).map(({ name }) => name));

  return {
    id: record.id,
    title: record.title,
    contentHash: record.contentHash,
    figuresAsOf: record.frozenOn,
    canUndo: record.undo.length > 0,
    slides: record.content.slides.map((slide) => ({
      id: slide.id,
      background: slide.background,
      elements: slide.elements.map((element) =>
        "chart" in element &&
        element.chart.series.some(({ dataset }) => !readable.has(dataset))
          ? {
              kind: element.kind,
              hidden: true,
              chart: element.chart,
              // A hidden element keeps its place and style, so an edit never moves it.
              box: element.box,
              style: element.style,
            }
          : element
      ),
    })),
  };
}

/**
 * One link per image the deck shows, under `slides:read` on the deck; an uploaded image no element
 * names gets none (D6).
 */
async function imageLinksFor(
  ctx: ModuleRequestContext,
  record: DeckRecord
): Promise<ImageLinks> {
  const shown = new Set(
    record.content.slides.flatMap(({ elements }) =>
      elements.flatMap((element) =>
        element.kind === "image" ? [element.fileId] : []
      )
    )
  );

  return Object.fromEntries(
    await Promise.all(
      [...shown].map(async (fileId) => {
        const { url, expiresAt } = await ctx.tenant.fileStorage.createLink({
          fileId,
          principal: ctx.caller,
          permission: "slides:read",
          resource: { type: "slides-deck", id: record.id },
        });

        return [fileId, { url, expiresAt: expiresAt.toISOString() }] as const;
      })
    )
  );
}

/**
 * The deck as every read and write answers it, with fresh image links, so an image a change adds
 * or Undo brings back shows at once, and a poll renews a link before it expires (I1).
 */
export async function shownDeck(
  ctx: ModuleRequestContext,
  record: DeckRecord
): Promise<DeckView> {
  const [view, images] = await Promise.all([
    deckViewFor(ctx, record),
    imageLinksFor(ctx, record),
  ]);

  return { ...view, images };
}
