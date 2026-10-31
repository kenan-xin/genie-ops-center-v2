import { implementModule } from "@genie/core";

import { slidesContract } from "./contract.ts";
import { assertCanRead } from "./services/decks/access.ts";
import { listOwnDecks } from "./services/decks/store.ts";

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
});

export type SlidesRouter = typeof slidesRouter;
