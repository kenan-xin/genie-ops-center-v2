import { reportingDate } from "@genie/core";
import type { AgentInstructions, AgentSurface } from "@genie/core/contracts";

import { SLIDES_WRITE_TOOLS } from "./agent-tools.ts";
import { EMPTY_DECK_CONTENT } from "./content.ts";
import { assertCanWrite } from "./services/decks/access.ts";
import { insertOwnDeck } from "./services/decks/store.ts";

/**
 * The Slides surface's rules, for a holder of `slides:write` (R-46, P11-48). The fixtures and the
 * recorded requests hold these lines verbatim, so a change here re-keys them.
 */
export const SLIDES_SURFACE_INSTRUCTIONS: AgentInstructions = {
  permission: "slides:write",
  lines: [
    "The record of this chat is a deck. Give its id as deckId to the deck tools.",
    "Change the deck only when the person's own message asks for that change. A brief from Ask is such a request. Each slides-change-deck call saves one change, and the person can undo it with Undo on the deck.",
    "Build a deck slide by slide: read it once with slides-read-deck, then call slides-change-deck once for each slide, with one add-slide step. Give each call the content hash of the last answer, and do not read the deck again in between.",
    "The deck of this chat exists already. Create another deck with slides-create-deck only when the person asks for a second deck. The person can remove a new deck with Delete in the Slides list.",
    "When the person asks you to try again, read the deck first and add only the slides that it still lacks.",
    "When the person asks for a chart or a table and does not say where, first ask in one short sentence whether to add it as a slide to the deck, named by its title, or to just show it here. Then stop and wait for the answer. If the person answers add, add the slide with slides-change-deck. Just show it here means in this chat: make it with make-artifact.",
    'Each slide makes one claim. Its title element comes first and states the finding in one sentence, such as "Invoiced sales grew every month from May to October.", never a topic such as "Sales".',
    "Every number in a title, text or bullet comes from a figure, chart or table on the same slide, which shows its source. A figure, chart or table takes the same config as a Chart in an answer.",
  ],
};

/** The Slides agent of the deck page (DEC-29, amended 2026-11-07; S7-42). */
export const SLIDES_SURFACE: AgentSurface = {
  name: "Slides agent",
  recordPage: "/m/slides/decks/:id",
  tools: SLIDES_WRITE_TOOLS,
  instructions: SLIDES_SURFACE_INSTRUCTIONS,
  acceptsHandoff: true,
  // An empty deck, frozen on the reporting date as a hand create is. No Undo entry: Delete is its
  // inverse (D1). Through `tx`, so a refused handoff leaves no deck (P11-50).
  createRecord: async (ctx, tx, { title }) => {
    await assertCanWrite(ctx.caller);

    const record = await insertOwnDeck(ctx, tx, {
      title,
      content: EMPTY_DECK_CONTENT,
      frozenOn: await reportingDate(ctx.tenant),
    });

    return record.id;
  },
};
