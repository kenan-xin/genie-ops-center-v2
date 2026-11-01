import { can, chatAvailability, type ModuleRequestContext } from "@genie/core";
import { omit } from "es-toolkit";

import type { DeckListView, DeckPageView } from "../../presentation/views.ts";
import { assertCanRead } from "../decks/access.ts";
import { shownDeck } from "../decks/show.ts";
import { listOwnDecks, readOwnDeck } from "../decks/store.ts";
import { deckTheme } from "../decks/theme.ts";

/** The Slides list: the caller's own decks, whether the caller may write, and the chat beside it. */
export async function loadDeckList(
  ctx: ModuleRequestContext
): Promise<DeckListView> {
  await assertCanRead(ctx.caller);

  const [decks, canWrite, branding, chat] = await Promise.all([
    listOwnDecks(ctx),
    can(ctx.caller, "slides:write"),
    ctx.tenant.branding.get(),
    chatAvailability(ctx),
  ]);

  return { decks, canWrite, timeZone: branding.defaultTimeZone, chat };
}

/**
 * One deck page. Another person's deck id throws `not-found`, which `openModulePage` answers as
 * missing (R-52). The deck carries its image links, as every read of it does (D6).
 */
export async function loadDeckPage(
  ctx: ModuleRequestContext,
  id: string
): Promise<DeckPageView> {
  await assertCanRead(ctx.caller);

  const record = await readOwnDeck(ctx, id);

  const [deck, canWrite, branding, logo] = await Promise.all([
    shownDeck(ctx, record),
    can(ctx.caller, "slides:write"),
    ctx.tenant.branding.get(),
    ctx.tenant.fileStorage.createBrandingMarkLink({
      principal: ctx.caller,
      slot: "logoLight",
    }),
  ]);

  return {
    deck,
    canWrite,
    timeZone: branding.defaultTimeZone,
    theme: omit(deckTheme(branding), ["logoFileId"]),
    logoUrl: logo?.url ?? null,
  };
}
