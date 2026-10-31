import type { ModuleRequestContext } from "@genie/core";
import { asc, desc, eq, sql } from "drizzle-orm";

import type { DeckSummary } from "../../contract.ts";
import { deck } from "../../schema.ts";

/** The caller's own decks, the last changed first. Another owner's row never reads (R-52). */
export async function listOwnDecks(
  ctx: ModuleRequestContext
): Promise<DeckSummary[]> {
  const rows = await ctx.tenant.db
    .select({
      id: deck.id,
      title: deck.title,
      slideCount:
        sql<number>`jsonb_array_length(${deck.content} -> 'slides')`.mapWith(
          Number
        ),
      figuresAsOf: deck.frozenOn,
      updatedAt: deck.updatedAt,
    })
    .from(deck)
    .where(eq(deck.ownerUserId, ctx.caller.userId))
    .orderBy(desc(deck.updatedAt), asc(deck.id));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slideCount: row.slideCount,
    figuresAsOf: row.figuresAsOf,
    updatedAt: row.updatedAt.toISOString(),
  }));
}
