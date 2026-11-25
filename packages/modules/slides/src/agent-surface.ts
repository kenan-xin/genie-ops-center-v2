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
    "Build a deck slide by slide: read it once with slides-read-deck, then call slides-change-deck once for each slide, with one add-slide step. Give each call the content hash of the last answer, and do not read the deck again in between. Give each of these calls progress first: n is the number of the slide that it adds, and m is the deck's slide count when the build is done.",
    "The deck of this chat exists already. Create another deck with slides-create-deck only when the person asks for a second deck. The person can remove a new deck with Delete in the Slides list.",
    "When the person asks you to try again, read the deck first and add only the slides that it still lacks.",
    "When the person asks for a chart or a table and does not say where, first call offer-choices, before any other tool call, with one short question that names the deck by its title, and the choices Add and Just show it here. If the person answers Add, add the slide with slides-change-deck. Just show it here means in this chat: make it with make-artifact.",
    'Each slide makes one claim. Its title element comes first and states the finding in one sentence, such as "Invoiced sales grew every month from May to October.", never a topic such as "Sales". The title slide\'s title names the deck.',
    "Choose each slide's elements by the layout that fits its claim: the title slide (the first slide: a title and a text), Big number (a title, a text and a figure), Chart with insight (a title, a text and a chart), Two figures (a title, a text and two figures), Comparison (a title, a text and two charts of one measure), Table with note (a title, a text and a table), Priorities list (a title and bullets) or the statement (a later slide: a title and a text).",
    "Start a new deck with a title slide: the deck's title, and a text that starts with the companyName from slides-read-deck, then the subject, the period and Figures as of <date>, such as <companyName> · Finance · May to October 2026 · Figures as of 27 Oct 2026.",
    "End with a statement slide when the deck ends on one goal or decision: a title and one text, with no number.",
    "When the person asks for a style, such as dark and minimal or another palette, set this deck's theme with one change-theme step. Only this deck changes. The deck keeps the brand font.",
    "Every number in a title, text or bullet comes from a figure, chart or table on the same slide, which shows its source. When the deck holds a different number for a value that you write, write the value from your query-dataset result, and say in one sentence that you used it in place of the deck's number and that Undo on the deck brings the old one back. When the deck's figures date is not the reporting date, add no value from the records, as a number or as a figure, chart or table, and tell the person to use Refresh data first. A figure, chart or table takes the same config as a Chart in an answer. Speaker notes hold no figure that the slide does not show.",
    // R-46a: written, not generated; agent-surface.test.ts keeps it in step with the schema.
    "You can change the slides of this deck and their order, the deck's name, each slide's title, text, bullets, figures, charts, tables and images, each element's position and size, its text color, size, weight, alignment, fill and border, the slide background and its speaker notes, and the deck's theme.",
  ],
};

/** The Slides agent of the deck page (DEC-29, amended 2026-11-07; S7-42). */
export const SLIDES_SURFACE: AgentSurface = {
  name: "Slides",
  label: "Slides",
  icon: "presentation",
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
