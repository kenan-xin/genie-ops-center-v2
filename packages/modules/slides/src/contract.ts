import { oc } from "@genie/core/rpc";
import { z } from "zod";

/** At most 20 slides per deck, so a deck stays one talk and one bounded row. */
export const DECK_SLIDE_LIMIT = 20;

/** A title, one text or bullet list, and two visuals fit one 16:9 slide (D5). */
export const SLIDE_ELEMENT_LIMIT = 5;

/** The saves a deck keeps for Undo, newest first. Each holds frozen data, so 10 bounds the row (D1). */
export const UNDO_DEPTH = 10;

/** The steps one change may hold. */
export const DECK_CHANGE_LIMIT = 20;

export const deckId = z.uuid();

/** `s<n>`: a new slide takes the highest current number plus one, so a removed last id comes back (D5). */
export const slideId = z.string().regex(/^s[1-9][0-9]{0,2}$/);

export const deckTitle = z
  .string()
  .trim()
  .min(1, "Give the deck a title.")
  .max(80, "A deck title holds at most 80 characters.");

/** The hex sha256 the database computes over the title and content (D2). */
export const contentHash = z.string().regex(/^[0-9a-f]{64}$/);

export const titleElement = z.strictObject({
  kind: z.literal("title"),
  text: z.string().trim().min(1).max(90),
});

export const textElement = z.strictObject({
  kind: z.literal("text"),
  text: z.string().trim().min(1).max(280),
});

export const bulletsElement = z.strictObject({
  kind: z.literal("bullets"),
  items: z.array(z.string().trim().min(1).max(80)).min(1).max(5),
});

export const imageElement = z.strictObject({
  kind: z.literal("image"),
  fileId: z.uuid(),
  alt: z.string().trim().min(1).max(200),
});

/** One element as a person or the agent sends it. A data element names its chart config only. */
export const elementInput = z.discriminatedUnion("kind", [
  titleElement,
  textElement,
  bulletsElement,
  z.strictObject({ kind: z.literal("figure"), chart: z.unknown() }),
  z.strictObject({ kind: z.literal("chart"), chart: z.unknown() }),
  z.strictObject({ kind: z.literal("table"), chart: z.unknown() }),
  imageElement,
]);

export type ElementKind = z.infer<typeof elementInput>["kind"];

const SLIDE_RULE_MESSAGES = {
  firstNotTitle: "A slide starts with its title, the one claim of the slide.",
  title: "A slide has one title.",
  body: "A slide holds at most one text or bullet list.",
  visual: "A slide holds at most two figures, charts, tables or images.",
  table:
    "A table shares its slide with one text or one other figure, chart or image, not both.",
};

const LIMIT: Record<
  ElementKind,
  [group: "title" | "body" | "visual", max: number]
> = {
  title: ["title", 1],
  text: ["body", 1],
  bullets: ["body", 1],
  figure: ["visual", 2],
  chart: ["visual", 2],
  table: ["visual", 2],
  image: ["visual", 2],
};

function ruleIssues(
  kinds: readonly ElementKind[]
): { index: number; message: string }[] {
  const issues: { index: number; message: string }[] = [];
  const seen = { title: 0, body: 0, visual: 0 };

  if (kinds[0] !== "title") {
    issues.push({ index: 0, message: SLIDE_RULE_MESSAGES.firstNotTitle });
  }

  for (const [index, kind] of kinds.entries()) {
    const [group, max] = LIMIT[kind];

    seen[group] += 1;

    if (seen[group] > max) {
      issues.push({ index, message: SLIDE_RULE_MESSAGES[group] });
    }
  }

  // A table needs the wide visual column, so its slide has room for one more box (T4-FIT).
  const tables = kinds.filter((kind) => kind === "table").length;

  if (tables > 1 || (tables === 1 && seen.body > 0 && seen.visual > 1)) {
    issues.push({
      index: kinds.length - 1,
      message: SLIDE_RULE_MESSAGES.table,
    });
  }

  return issues;
}

/** The slide shape of D5, as issues with paths relative to the slide. */
export function slideRuleIssues(
  kinds: readonly ElementKind[]
): { path: string; message: string }[] {
  return ruleIssues(kinds).map(({ index, message }) => ({
    path: `elements.${index}`,
    message,
  }));
}

/** Adds the slide shape issues to a slide schema's refinement, at each element's path. */
export function refineSlideRules(
  slide: { readonly elements: readonly { readonly kind: ElementKind }[] },
  ctx: z.RefinementCtx
): void {
  for (const { index, message } of ruleIssues(
    slide.elements.map(({ kind }) => kind)
  )) {
    ctx.addIssue({ code: "custom", path: ["elements", index], message });
  }
}

export const slideInput = z
  .strictObject({
    elements: z.array(elementInput).min(1).max(SLIDE_ELEMENT_LIMIT),
  })
  .superRefine(refineSlideRules);

export const deckSummary = z.object({
  id: z.string(),
  title: z.string(),
  slideCount: z.int(),
  figuresAsOf: z.iso.date(),
  updatedAt: z.string(),
});

/**
 * One step of a change. A data element's raw chart config is checked by the chart gate, not
 * here (D3). Add takes a place up to the slide count, move up to the last slide (ruling F6).
 */
export const deckChange = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("add-slide"),
    slide: slideInput,
    toIndex: z
      .int()
      .min(0)
      .max(DECK_SLIDE_LIMIT - 1)
      .optional(),
  }),
  z.strictObject({ op: z.literal("change-slide"), slideId, slide: slideInput }),
  z.strictObject({ op: z.literal("remove-slide"), slideId }),
  z.strictObject({
    op: z.literal("move-slide"),
    slideId,
    toIndex: z
      .int()
      .min(0)
      .max(DECK_SLIDE_LIMIT - 1),
  }),
  z.strictObject({ op: z.literal("rename"), title: deckTitle }),
]);

export const deckChanges = z.array(deckChange).min(1).max(DECK_CHANGE_LIMIT);

/** One deck as its owner reads it. The browser narrows each element (Global Constraints). */
export const deckView = z.object({
  id: z.string(),
  title: z.string(),
  contentHash: z.string(),
  figuresAsOf: z.iso.date(),
  canUndo: z.boolean(),
  /** A short-lived link per image the deck shows, made at each read (D6). */
  images: z.record(
    z.string(),
    z.object({ url: z.string(), expiresAt: z.iso.datetime() })
  ),
  // Read-only, so the server's `DeckView` answers it as is.
  slides: z
    .array(
      z.object({ id: z.string(), elements: z.array(z.unknown()).readonly() })
    )
    .readonly(),
});

export type DeckChange = z.infer<typeof deckChange>;

export type ElementInput = z.infer<typeof elementInput>;

export type SlideInput = z.infer<typeof slideInput>;

export type DeckSummary = z.infer<typeof deckSummary>;

/**
 * The module's API, published as `@genie/module-slides/contract` (ADR 0011). It imports only zod
 * and the browser-safe `@genie/core/rpc`, so the browser client types its calls from this file
 * without pulling any server code. Every path starts with the module id.
 */
export const slidesContract = {
  listDecks: oc
    .route({ method: "GET", path: "/slides/decks" })
    .output(z.array(deckSummary)),
  readDeck: oc
    .route({ method: "GET", path: "/slides/decks/{id}" })
    .input(z.object({ id: deckId }))
    .output(deckView),
  createDeck: oc
    .route({ method: "POST", path: "/slides/decks" })
    .input(z.object({ title: deckTitle }))
    .output(deckView),
  changeDeck: oc
    .route({ method: "PATCH", path: "/slides/decks/{id}" })
    .input(
      z.object({ id: deckId, expectedHash: contentHash, changes: deckChanges })
    )
    .output(deckView),
  undoDeck: oc
    .route({ method: "POST", path: "/slides/decks/{id}/undo" })
    .input(z.object({ id: deckId, expectedHash: contentHash }))
    .output(deckView),
  deleteDeck: oc
    .route({ method: "DELETE", path: "/slides/decks/{id}" })
    .input(z.object({ id: deckId }))
    .output(z.object({ id: z.string() })),
  /** Reads every figure, chart and table again on the reporting date (R-54, D3, D4). */
  refreshDeck: oc
    .route({ method: "POST", path: "/slides/decks/{id}/refresh" })
    .input(z.object({ id: deckId, expectedHash: contentHash }))
    .output(z.object({ deck: deckView, changedSlides: z.array(z.string()) })),
  /** Stores one PNG or JPEG through `FileStorage` for the deck's image elements (D6). */
  uploadDeckImage: oc
    .route({ method: "POST", path: "/slides/decks/{id}/images" })
    .input(z.object({ id: deckId, file: z.file() }))
    .output(z.object({ fileId: z.string() })),
  /** Writes the deck to PowerPoint with native charts through `FileStorage` (R-55, D7). */
  exportDeck: oc
    .route({ method: "POST", path: "/slides/decks/{id}/export" })
    .input(z.object({ id: deckId }))
    .output(z.object({ url: z.string(), fileName: z.string() })),
};

export type SlidesContract = typeof slidesContract;
