import { CHART_PROMPT_RULES } from "@genie/core";
import {
  type AgentInstructions,
  type AgentToolValue,
  defineAgentTool,
} from "@genie/core/contracts";
import { z } from "zod";

import type { Placement, StoredElement, StoredSlide } from "./content.ts";
import {
  BORDER_WIDTHS,
  BULLET_CHARACTERS,
  BULLET_ITEMS,
  FONT_SIZES,
  FONT_WEIGHTS,
  minBox,
  SLIDE_CANVAS,
  TEXT_ALIGNS,
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
 * recorded follow-up request holds the output, so it must be the same on every run (D13). The one
 * exception is the change tool's content hash, which the replay transport renames (P11-43).
 */

/** One JSON object of a tool answer. */
type ToolObject = { [key: string]: AgentToolValue };

/** An element's box and style as JSON: the model reads no key without a value. */
function placementOf({ box, style }: Placement) {
  const placement: ToolObject = {};

  if (box !== undefined) placement.box = box;

  if (style !== undefined) {
    const kept: ToolObject = {};

    for (const [key, value] of Object.entries(style)) {
      if (value !== undefined) kept[key] = value;
    }

    placement.style = kept;
  }

  return placement;
}

/** A data element as its config only; its frozen rows stay out of the model's context. */
function withoutData(element: StoredElement) {
  const { box, style, ...body } = element;

  return {
    ...("chart" in body ? { kind: body.kind, chart: body.chart } : body),
    ...placementOf({ box, style }),
  };
}

/** A slide as the read tool answers it: its id, its elements, and its background when it has one. */
function slideOutput({ id, elements, background }: StoredSlide) {
  const shown = elements.map(withoutData);

  return background === undefined
    ? { id, elements: shown }
    : { id, elements: shown, background };
}

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
        slides: slides.map(slideOutput),
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

/** The position and style rules, so a first styling call passes (S7-43). */
const STYLE_RULES = [
  `To move, resize or style one element, use a change-element step with its slideId, its index on the slide (the title is 0), and a box or a style; to set a slide's background, use a change-slide-fields step with a background. In both, null clears a field, and a style step sets or clears only the keys it names.`,
  `A box is { x, y, w, h } in whole pixels on the ${SLIDE_CANVAS.width} by ${SLIDE_CANVAS.height} slide and must stay inside it; a title, text or bullet list needs at least ${minBox("text").w} by ${minBox("text").h}, a figure, chart, table or image at least ${minBox("chart").w} by ${minBox("chart").h}.`,
  `A title, text or bullet list takes the style keys color, fontSize (${FONT_SIZES.join(", ")}), weight (${FONT_WEIGHTS.join(", ")}), align (${TEXT_ALIGNS.join(", ")}), fill and border { color, width (${BORDER_WIDTHS.join(", ")}) }; a figure, chart, table or image takes only fill and border. Colors are hex such as #1E3A8A.`,
  `Every text needs a contrast of 4.5:1, or 3:1 from fontSize 24, against its fill, else the slide background, else white; a text without a color is dark gray #111827. A background change re-checks every text without a fill, so set their colors in the same change.`,
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
 * audit row are the hand editor's (R-46, R-53). The output holds the new hash, so a slide-by-slide
 * build needs no read between changes. The hash varies with the read time of the figures, and the
 * replay transport renames it (P11-43).
 */
const changeDeckTool = defineAgentTool({
  name: "slides-change-deck",
  step: {
    active: "Changing the deck",
    done: "Changed the deck",
    failed: "Could not change the deck",
  },
  description: `Saves one change to one of this person's own decks: a list of steps in order, each add-slide, change-slide, remove-slide, move-slide, rename, change-element or change-slide-fields. Give the content hash that slides-read-deck or the last slides-change-deck call answered. A deck that changed since then refuses the change, so read it again. A change-slide step replaces every element of the slide, so send the elements to keep too, each figure, chart or table with its chart config as read. ${DECK_RULES} ${STYLE_RULES} Every added or changed figure, chart or table passes the chart check first, and a refused step saves nothing. The person can undo the change with Undo on the deck.`,
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
      output: { deckId: record.id, contentHash: record.contentHash, slides },
      rowCount: slides.length,
    };
  },
});

/** The write tools, which only the Slides surface offers (P11-46). */
export const SLIDES_WRITE_TOOLS = [createDeckTool, changeDeckTool];

/** The read tools, which Ask and the Slides surface session both get. */
export const SLIDES_AGENT_TOOLS = [listDecksTool, readDeckTool];

/**
 * The module's read rule for the agent, for a holder of `slides:read` (R-56, P11-48). The recorded
 * requests hold this line verbatim, so a change here re-records them.
 */
export const SLIDES_AGENT_INSTRUCTIONS: AgentInstructions = {
  permission: "slides:read",
  lines: [
    "Decks: the slides tools read only this person's own decks. A deck is 16:9 slides of typed elements.",
  ],
};
