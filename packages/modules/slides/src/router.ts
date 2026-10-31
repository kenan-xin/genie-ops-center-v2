import { implementModule } from "@genie/core";

import { slidesContract } from "./contract.ts";
import { assertCanRead, assertCanWrite } from "./services/decks/access.ts";
import { deckViewFor } from "./services/decks/show.ts";
import {
  changeDeck,
  createDeck,
  deleteDeck,
  listOwnDecks,
  readOwnDeck,
  undoDeck,
} from "./services/decks/store.ts";

const os = implementModule("slides", slidesContract);

/**
 * The module's router, built by core from the contract and mounted under the module id when the
 * module is enabled. Each procedure asks `can()` first and reads only the caller's own rows
 * through `context.tenant.db` (DEC-34, DEC-39, D14).
 */
export const slidesRouter = os.router({
  listDecks: os.listDecks.handler(async ({ context }) => {
    await assertCanRead(context.caller);

    return listOwnDecks(context);
  }),

  readDeck: os.readDeck.handler(async ({ context, input }) => {
    await assertCanRead(context.caller);

    return deckViewFor(context, await readOwnDeck(context, input.id));
  }),

  createDeck: os.createDeck.handler(async ({ context, input }) => {
    await assertCanWrite(context.caller);

    return deckViewFor(context, await createDeck(context, input));
  }),

  changeDeck: os.changeDeck.handler(async ({ context, input }) => {
    await assertCanWrite(context.caller);

    return deckViewFor(context, await changeDeck(context, input));
  }),

  undoDeck: os.undoDeck.handler(async ({ context, input }) => {
    await assertCanWrite(context.caller);

    return deckViewFor(context, await undoDeck(context, input));
  }),

  deleteDeck: os.deleteDeck.handler(async ({ context, input }) => {
    await assertCanWrite(context.caller);
    await deleteDeck(context, input.id);

    return { id: input.id };
  }),
});

export type SlidesRouter = typeof slidesRouter;
