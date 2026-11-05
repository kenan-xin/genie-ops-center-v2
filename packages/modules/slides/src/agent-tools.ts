import { CHART_PROMPT_RULES } from "@genie/core";
import { type AgentInstructions, defineAgentTool } from "@genie/core/contracts";
import { z } from "zod";

import type { StoredElement } from "./content.ts";
import {
  BULLET_CHARACTERS,
  BULLET_ITEMS,
  contentHash,
  DATA_LIMIT_MESSAGES,
  DECK_SLIDE_LIMIT,
  deckChanges,
  deckId,
  deckTitle,
  SLIDE_RULE_MESSAGES,
  slideInput,
  TEXT_CHARACTERS,
  TITLE_CHARACTERS,
} from "./contract.ts";
import { assertCanRead, assertCanWrite } from "./services/decks/access.ts";
import {
  changeDeck,
  createDeck,
  type DeckRecord,
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
  step: {
    active: "Looking up the decks",
    done: "Looked up the decks",
    failed: "Could not look up the decks",
  },
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
  step: {
    active: "Reading the deck",
    done: "Read the deck",
    failed: "Could not read the deck",
  },
  description:
    "Reads one of this person's own decks by id: its title, figures date and content hash, and its slides, with each slide's id and each element's kind, text and chart config. Give the content hash to slides-change-deck.",
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
        contentHash: record.contentHash,
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

/** The slide shape of D5, stated in both deck tool descriptions. */
const SLIDE_LAYOUT =
  "Each slide starts with a title element that states its finding, then at most one text or bullet list, and at most two figures (KPI), charts (bar, line, area or donut) or tables, each with a chart config. A slide holds at most one table, beside one text or one other figure, chart or image, not both.";

const SLIDE_LIMITS = `A slide title holds at most ${TITLE_CHARACTERS} characters, a text at most ${TEXT_CHARACTERS} characters, and a bullet list 1 to ${BULLET_ITEMS} items of at most ${BULLET_CHARACTERS} characters each.`;

/** The limits and gate rules a first call must meet, so it passes without a refusal (czjw.79). */
const DECK_RULES = [
  SLIDE_LAYOUT,
  SLIDE_LIMITS,
  DATA_LIMIT_MESSAGES.table,
  DATA_LIMIT_MESSAGES.chart,
  ...CHART_PROMPT_RULES,
].join(" ");

/** Each slide's number, id and title, as the deck tools answer them. */
const outlineOf = (record: DeckRecord) =>
  record.content.slides.map(({ id, elements }, index) => ({
    number: index + 1,
    id,
    title: titleOf(elements),
  }));

/** Goes through the store, so the gate, the owner, the frozen date and the audit run as for a hand create. */
const createDeckTool = defineAgentTool({
  name: "slides-create-deck",
  step: {
    active: "Making a deck",
    done: "Made a deck",
    failed: "Could not make a deck",
  },
  description: `Creates a deck for this person from a title and its slides. ${DECK_RULES} Every chart passes the chart check first, and a refused chart saves nothing. The figures are frozen as of the reporting date. The person can remove the deck with Delete in the Slides list.`,
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

/*
 * Goes through the store, so the owner check, the chart gate, the hash guard, the Undo entry and the
 * audit row are the hand editor's (R-46, R-53). The hash covers the frozen data and its read time,
 * so the output leaves the new hash out: a recorded follow-up stays the same, and a second change
 * reads the deck again (PC13).
 */
const changeDeckTool = defineAgentTool({
  name: "slides-change-deck",
  step: {
    active: "Changing the deck",
    done: "Changed the deck",
    failed: "Could not change the deck",
  },
  description: `Saves one change to one of this person's own decks: a list of steps in order, each add-slide, change-slide, remove-slide, move-slide or rename. Read the deck with slides-read-deck first and give its content hash. A deck that changed since then refuses the change, so read it again. A change-slide step replaces every element of the slide, so send the elements to keep too, each figure, chart or table with its chart config as read. ${DECK_RULES} Every added or changed figure, chart or table passes the chart check first, and a refused step saves nothing. The person can undo the change with Undo on the deck.`,
  input: z.strictObject({
    deckId,
    expectedHash: contentHash,
    changes: deckChanges,
  }),
  permission: "slides:write",
  writes: true,
  run: async (ctx, input) => {
    await assertCanWrite(ctx.caller);

    const record = await changeDeck(ctx, {
      id: input.deckId,
      expectedHash: input.expectedHash,
      changes: input.changes,
    });

    const slides = outlineOf(record);

    return {
      output: { deckId: record.id, slides },
      rowCount: slides.length,
    };
  },
});

export const SLIDES_AGENT_TOOLS = [
  listDecksTool,
  readDeckTool,
  createDeckTool,
  changeDeckTool,
];

/**
 * The module's rules for the agent, for a holder of `slides:write` only (R-46, R-56). The recorded
 * requests hold these lines verbatim, so a change here re-records them.
 */
export const SLIDES_AGENT_INSTRUCTIONS: AgentInstructions = {
  permission: "slides:write",
  lines: [
    "Decks: the slides tools read and create only this person's own decks. A deck is 16:9 slides of typed elements.",
    "Create a deck only when the person's own message asks for one. The person can remove a new deck with Delete in the Slides list.",
    "Change a deck only when the person's own message asks for that change. Read it with slides-read-deck first, then save the change with one slides-change-deck call, and the person can undo it with Undo on the deck.",
    'Each slide makes one claim. Its title element comes first and states the finding in one sentence, such as "Invoiced sales grew every month from May to October.", never a topic such as "Sales".',
    "Every number in a title, text or bullet comes from a figure, chart or table on the same slide, which shows its source. A figure, chart or table takes the same config as a Chart in an answer.",
  ],
};
