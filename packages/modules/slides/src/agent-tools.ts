import { CHART_PROMPT_RULES } from "@genie/core";
import {
  type AgentInstructions,
  type AgentToolValue,
  defineAgentTool,
  stepProgressInput,
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
  type ElementStyle,
  deckId,
  deckTitle,
  NOTES_CHARACTERS,
  SLIDE_RULE_MESSAGES,
  slideInput,
  type StoredTheme,
  TEXT_CHARACTERS,
  THEME_LAYOUTS,
  THEME_LOGOS,
  THEME_WEIGHTS,
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
import { brandTheme } from "./services/decks/theme.ts";

/*
 * Every output holds no clock value, no data rows and no id of a deck the create tool made: a
 * recorded follow-up request holds the output, so it must be the same on every run (D13). The one
 * exception is the change tool's content hash, which the replay transport renames (P11-43).
 */

/** One JSON object of a tool answer. */
type ToolObject = { [key: string]: AgentToolValue };

/** An object's keys that hold a value, as JSON: the model reads no key without a value. */
function definedOf(value: ElementStyle | StoredTheme) {
  const kept: ToolObject = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) kept[key] = entry;
  }

  return kept;
}

/** An element's box and style as JSON. */
function placementOf({ box, style }: Placement) {
  const placement: ToolObject = {};

  if (box !== undefined) placement.box = box;

  if (style !== undefined) placement.style = definedOf(style);

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

/** A slide as the read tool answers it: its id, its elements, and its background and notes when it has them. */
function slideOutput({ id, elements, background, notes }: StoredSlide) {
  const fields: ToolObject = {};

  if (background !== undefined) fields.background = background;

  if (notes !== undefined) fields.notes = notes;

  return { id, elements: elements.map(withoutData), ...fields };
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
    "Reads one of this person's own decks by id: its title, the company name, its figures date and content hash, the deck's own theme when it has one, and its slides, with each slide's id, its background and speaker notes when it has them, and each element's kind, text and chart config, and its box and style when it has them. Give the content hash to slides-change-deck.",
  input: z.strictObject({ deckId }),
  permission: "slides:read",
  run: async (ctx, input) => {
    await assertCanRead(ctx.caller);

    const record = await readOwnDeck(ctx, input.deckId);
    const { slides, theme } = record.content;
    const { companyName } = brandTheme(await ctx.tenant.branding.get());

    const head = {
      id: record.id,
      title: record.title,
      companyName,
      figuresAsOf: record.frozenOn,
      contentHash: record.contentHash,
    };

    // Only a deck with its own theme: the model reads no key without a value.
    const output =
      theme === undefined
        ? { ...head, slides: slides.map(slideOutput) }
        : { ...head, theme: definedOf(theme), slides: slides.map(slideOutput) };

    return {
      output,
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
  "Each slide starts with a title element that states its finding, then at most one text or bullet list, and at most two figures (KPI), charts (bar, line, area or donut) or tables, each with a chart config. A slide holds at most one table, beside one text or one other figure, chart or image, not both. A slide's elements choose its layout: the title slide is the first slide, with a title and a text; Big number is a title, a text and a figure; Chart with insight is a title, a text and a chart; Two figures is a title, a text and two figures; Comparison is a title, a text and two charts of one measure; Table with note is a title, a text and a table; Priorities list is a title and bullets; a statement is a later slide with a title and a text.";

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
  `To move, resize or style one element, use a change-element step with its slideId, its index on the slide (the title is 0), and a box or a style; to set a slide's background or speaker notes, use a change-slide-fields step with a background or notes. In both, null clears a field, and a style step sets or clears only the keys it names.`,
  `A box is { x, y, w, h } in whole pixels on the ${SLIDE_CANVAS.width} by ${SLIDE_CANVAS.height} slide and must stay inside it; a title, text or bullet list needs at least ${minBox("text").w} by ${minBox("text").h}, a figure, chart, table or image at least ${minBox("chart").w} by ${minBox("chart").h}.`,
  `A title, text or bullet list takes the style keys color, fontSize (${FONT_SIZES.join(", ")}), weight (${FONT_WEIGHTS.join(", ")}), align (${TEXT_ALIGNS.join(", ")}), fill and border { color, width (${BORDER_WIDTHS.join(", ")}) }; a figure, chart, table or image takes only fill and border. Colors are hex such as #1E3A8A.`,
  `Every text needs a contrast of 4.5:1, or 3:1 from fontSize 24. The check reads the text's fill, else the panel for a text on the panel, else the slide background, else the theme background. A text without a color takes the theme's color for its place. A background change re-checks every text without a fill, so set their colors in the same change.`,
].join(" ");

/** The deck theme rules, so a first theme call passes (P14-18, P14-22). */
export const THEME_RULES = [
  `To change the look of the whole deck, use one change-theme step with a theme of these keys: background, text, secondaryText, accent, panel and panelText are hex colors; weight is ${THEME_WEIGHTS.join(" or ")}; layout is ${THEME_LAYOUTS.join(" or ")}, where solid fills the side panel and light draws it as a line; logo is ${THEME_LOGOS.join(" or ")}, the logo that reads on the background.`,
  `A key with null clears it, and theme null returns the deck to the brand look.`,
  `The text and the secondaryText need 4.5:1 on the background and the accent 3:1; in the solid layout, the panelText needs 4.5:1 on the panel. A theme change re-checks every slide.`,
  `A theme cannot change the face: the deck keeps the brand font.`,
].join(" ");

/** The notes rule, in both deck tool descriptions (S7-45). */
const NOTES_RULES = `A slide may carry notes: plain-text speaker notes of at most ${NOTES_CHARACTERS.toLocaleString("en-US")} characters, which only the presenter window and the PowerPoint export show. To change or clear one slide's notes, use a change-slide-fields step with notes; null clears them.`;

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
  description: `Creates a deck for this person from a title and its slides. ${DECK_RULES} ${NOTES_RULES} Every chart passes the chart check first, and a refused chart saves nothing. The figures are frozen as of the reporting date. The person can remove the deck with Delete in the Slides list.`,
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
    progress: {
      active: "Writing slide {n} of {m}",
      doneOne: "Wrote slide {n}",
      done: "Wrote slides {first} to {last}",
    },
  },
  description: `Saves one change to one of this person's own decks: a list of steps in order, each add-slide, change-slide, remove-slide, move-slide, rename, change-element, change-slide-fields or change-theme. Give the content hash that slides-read-deck or the last slides-change-deck call answered. A deck that changed since then refuses the change, so read it again. A change-slide step replaces every element of the slide, so send the elements to keep too, each figure, chart or table with its chart config as read. An element at the same place with the same kind keeps its box and style when the step leaves them out, and null clears them. If the step removes, adds or reorders elements, send each element's box and style as read. ${DECK_RULES} ${STYLE_RULES} ${THEME_RULES} ${NOTES_RULES} Every added or changed figure, chart or table passes the chart check first, and a refused step saves nothing. The person can undo the change with Undo on the deck.`,
  input: z.strictObject({
    progress: stepProgressInput(DECK_SLIDE_LIMIT).optional(),
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

    const output = {
      deckId: record.id,
      contentHash: record.contentHash,
      slides,
    };

    return {
      // A step that leaves the deck as it is saves nothing (czjw.134), so nothing can be undone.
      output:
        record.contentHash === input.expectedHash
          ? {
              ...output,
              note: "Nothing changed: the deck already looks like this. Nothing was saved, so there is nothing to undo.",
            }
          : output,
      rowCount: slides.length,
    };
  },
});

/** The write tools, which only the Slides surface offers (P11-46). */
export const SLIDES_WRITE_TOOLS = [createDeckTool, changeDeckTool];

/** The read tools, which Ask and the Slides surface session both get. */
export const SLIDES_AGENT_TOOLS = [listDecksTool, readDeckTool];

/**
 * The module's read rules for the agent, for a holder of `slides:read` (R-56, P11-48, `czjw.166`).
 * The recorded requests hold these lines verbatim, so a change here re-keys them.
 */
export const SLIDES_AGENT_INSTRUCTIONS: AgentInstructions = {
  permission: "slides:read",
  lines: [
    "Decks: the slides tools read only this person's own decks. A deck is 16:9 slides of typed elements.",
    "A number in a deck's title, text, bullets or notes is text that a person typed, not a record. When you answer about such a number, start with the value from a query-dataset result as of the reporting date, never filtered to the deck's figures date. If the deck's number differs, or the deck's figures date is not the reporting date, then give the deck's number in one sentence that names the deck and the slide, with the figures date when it is not the reporting date, for example: Slide 3 of Q3 review says SGD 4,500.00, as of 30 Jun 2026. Never ask which number to use.",
  ],
};
