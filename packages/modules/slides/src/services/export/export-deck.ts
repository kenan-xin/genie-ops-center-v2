import type { ModuleRequestContext } from "@genie/core";
import { kebabCase } from "es-toolkit";

import { deckViewFor } from "../decks/show.ts";
import { readOwnDeck, saveDeckExport } from "../decks/store.ts";
import { deckTheme } from "../decks/theme.ts";
import { buildDeckPptx } from "./build.ts";

/**
 * Exports the caller's own deck to PowerPoint and answers a short-lived download link under
 * `slides:read` on the deck (R-55, D7). The file is built before the transaction, so no row lock
 * waits on pptxgenjs. It shows the deck as the caller may see it: a data element of a dataset the
 * caller can no longer read is the refusal line (D15).
 */
export async function exportDeck(
  ctx: ModuleRequestContext,
  id: string
): Promise<{ readonly url: string; readonly fileName: string }> {
  const record = await readOwnDeck(ctx, id);

  const [view, branding] = await Promise.all([
    deckViewFor(ctx, record),
    ctx.tenant.branding.get(),
  ]);

  const theme = deckTheme(branding);

  const imageIds = new Set(
    view.slides.flatMap(({ elements }) =>
      elements.flatMap((element) =>
        element.kind === "image" && "fileId" in element ? [element.fileId] : []
      )
    )
  );

  const [logo, images] = await Promise.all([
    theme.logoFileId === null
      ? null
      : // A logo that cannot be served (its scan is pending) is left out, as on screen.
        ctx.tenant.fileStorage.fetch(theme.logoFileId).catch(() => null),
    Promise.all(
      [...imageIds].map(
        async (fileId) =>
          [fileId, await ctx.tenant.fileStorage.fetch(fileId)] as const
      )
    ),
  ]);

  const bytes = await buildDeckPptx({
    title: record.title,
    slides: view.slides,
    figuresAsOf: view.figuresAsOf,
    timeZone: branding.defaultTimeZone,
    theme,
    logo,
    images: new Map(images),
  });

  const fileName = `${kebabCase(record.title) || "deck"}.pptx`;

  const { fileId } = await saveDeckExport(ctx, {
    id: record.id,
    fileName,
    bytes,
    slides: view.slides.length,
  });

  const { url } = await ctx.tenant.fileStorage.createLink({
    fileId,
    principal: ctx.caller,
    permission: "slides:read",
    resource: { type: "slides-deck", id: record.id },
  });

  return { url, fileName };
}
