import { type AgentInstructions, defineAgentTool } from "@genie/core/contracts";
import { z } from "zod";

import type { StoredElement } from "./content.ts";
import {
  DATA_LIMIT_MESSAGES,
  DECK_SLIDE_LIMIT,
  deckId,
  deckTitle,
  SLIDE_RULE_MESSAGES,
  slideInput,
} from "./contract.ts";
import { assertCanRead, assertCanWrite } from "./services/decks/access.ts";
import {
  createDeck,
  listOwnDecks,
  readOwnDeck,
} from "./services/decks/store.ts";

/*
 * Every output holds no clock value, no data rows and no id of a deck the create tool made: a
 * recorded follow-up request holds the output, so it must be the same on every run (D13).
 */

/** A data element as its config only; its frozen rows stay out of the model's context. */
const withoutData = (element: StoredElement) =>
  "chart" in element ? { kind: element.kind, chart: element.chart } : element;

/** A stored slide's first element is its title (D5). */
const titleOf = ([first]: readonly StoredElement[]) =>
  first?.kind === "title" ? first.text : "";

const listDecksTool = defineAgentTool({
  name: "slides-list-decks",
  description:
    "Lists this person's own decks: each one's id, title, figures date and slide count.",
  input: z.strictObject({}),
  permission: "slides:read",
  run: async (ctx) => {
    await assertCanRead(ctx.caller);

    // Without `updatedAt`, a clock value (ruling F7: slide outlines come from slides-read-deck).
    const decks = (await listOwnDecks(ctx)).map((summary) => ({
      id: summary.id,
      title: summary.title,
      figuresAsOf: summary.figuresAsOf,
      slideCount: summary.slideCount,
    }));

    return { output: { decks }, rowCount: decks.length };
  },
});

const readDeckTool = defineAgentTool({
  name: "slides-read-deck",
  description:
    "Reads one of this person's own decks by id: its title, figures date and slides, with each element's kind, text and chart config.",
  input: z.strictObject({ deckId }),
  permission: "slides:read",
  run: async (ctx, input) => {
    await assertCanRead(ctx.caller);

    const record = await readOwnDeck(ctx, input.deckId);
    const { slides } = record.content;

    return {
      output: {
        id: record.id,
        title: record.title,
        figuresAsOf: record.frozenOn,
        slides: slides.map(({ id, elements }) => ({
          id,
          elements: elements.map(withoutData),
        })),
      },
      rowCount: slides.length,
    };
  },
});

/*
 * The server's own refusal sentences, so the model reads each rule before its first try (czjw.58).
 * A count per element kind and a data size are no draft-07 keyword, so they ride as a description.
 * Only here: on `slideInput` itself it would change the OpenAPI document of `changeDeck`.
 */
const slideRules = [
  ...Object.values(SLIDE_RULE_MESSAGES),
  ...Object.values(DATA_LIMIT_MESSAGES),
].join(" ");

/** Goes through the store, so the gate, the owner, the frozen date and the audit run as for a hand create. */
const createDeckTool = defineAgentTool({
  name: "slides-create-deck",
  description: `Creates a deck for this person from a title and its slides. Each slide starts with a title element that states its finding, then at most one text or bullet list, and at most two figures (KPI), charts (bar, line, area or donut) or tables, each with a chart config. A slide holds at most one table, beside one text or one other figure, chart or image, not both. ${DATA_LIMIT_MESSAGES.table} ${DATA_LIMIT_MESSAGES.chart} Every chart passes the chart check first, and a refused chart saves nothing. The figures are frozen as of the reporting date. The person can remove the deck with Delete in the Slides list.`,
  input: z.strictObject({
    title: deckTitle,
    slides: z
      .array(slideInput.describe(slideRules))
      .min(1)
      .max(DECK_SLIDE_LIMIT),
  }),
  permission: "slides:write",
  writes: true,
  run: async (ctx, input) => {
    await assertCanWrite(ctx.caller);

    const record = await createDeck(ctx, input);

    const slides = record.content.slides.map(({ elements }, index) => ({
      number: index + 1,
      title: titleOf(elements),
    }));

    return {
      output: { title: record.title, figuresAsOf: record.frozenOn, slides },
      rowCount: slides.length,
    };
  },
});

export const SLIDES_AGENT_TOOLS = [listDecksTool, readDeckTool, createDeckTool];

/**
 * The module's rules for the agent, for a holder of `slides:write` only (R-46, R-56). The recorded
 * requests hold these lines verbatim, so a change here re-records them.
 */
export const SLIDES_AGENT_INSTRUCTIONS: AgentInstructions = {
  permission: "slides:write",
  lines: [
    "Decks: the slides tools read and create only this person's own decks. A deck is 16:9 slides of typed elements.",
    "Create a deck only when the person's own message asks for one. The person can remove a new deck with Delete in the Slides list.",
    'Each slide makes one claim. Its title element comes first and states the finding in one sentence, such as "Invoiced sales grew every month from May to October.", never a topic such as "Sales".',
    "Every number in a title, text or bullet comes from a figure, chart or table on the same slide, which shows its source. A figure, chart or table takes the same config as a Chart in an answer.",
  ],
};
