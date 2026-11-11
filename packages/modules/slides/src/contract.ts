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

/** The notes cap, counted as JavaScript string length, the same unit as the textarea's `maxLength`. */
export const NOTES_CHARACTERS = 2000;

export const NOTES_MESSAGES = {
  cap: "Notes hold at most 2,000 characters.",
  blank: "Write the notes, or clear them.",
};

/**
 * Speaker notes as plain text. Never trimmed, so the text under the person's cursor does not move;
 * a string with no non-space character is refused, because a stored note is real text or absent.
 */
export const slideNotes = z
  .string()
  .max(NOTES_CHARACTERS, NOTES_MESSAGES.cap)
  .refine((value) => value.trim() !== "", NOTES_MESSAGES.blank);

/** The text limits of one slide, shared by the schemas and the deck tool descriptions (czjw.79). */
export const TITLE_CHARACTERS = 90;

export const TEXT_CHARACTERS = 280;

export const BULLET_CHARACTERS = 80;

export const BULLET_ITEMS = 5;

/** The one slide canvas, on screen and in PowerPoint, in canvas pixels (D10). */
export const SLIDE_CANVAS = { width: 960, height: 540 } as const;

/** The colors a slide draws with when nothing sets one: the light theme, as the export (R-52a). */
export const THEME_TEXT = "#111827";

export const THEME_BACKGROUND = "#FFFFFF";

/** The font sizes in canvas pixels and the border widths an element may take (tech plan, Style defaults). */
export const FONT_SIZES = [12, 14, 18, 24, 32, 40, 56] as const;

export const BORDER_WIDTHS = [0, 1, 2, 4] as const;

export const FONT_WEIGHTS = ["regular", "semibold", "bold"] as const;

export const TEXT_ALIGNS = ["left", "center", "right"] as const;

export const hexColor = z
  .string()
  .regex(
    /^#[0-9A-Fa-f]{6}$/,
    "Enter a 6-digit hex color, for example #1E3A8A."
  );

/** An element's own place on the canvas, in whole canvas pixels; without one it keeps the computed layout. */
export const elementBox = z.strictObject({
  x: z.int().min(0),
  y: z.int().min(0),
  w: z.int().min(1),
  h: z.int().min(1),
});

const elementBorder = z.strictObject({
  color: hexColor,
  width: z.literal(BORDER_WIDTHS),
});

/** Every style key. Title, text and bullets take all; a figure, chart, table or image only fill and border. */
export const elementStyle = z.strictObject({
  color: hexColor.optional(),
  fontSize: z.literal(FONT_SIZES).optional(),
  weight: z.enum(FONT_WEIGHTS).optional(),
  align: z.enum(TEXT_ALIGNS).optional(),
  fill: hexColor.optional(),
  border: elementBorder.optional(),
});

/** A style change: a key with a value sets it, a key with `null` clears it, an absent key stays. */
export const styleChange = z.strictObject({
  color: hexColor.nullable().optional(),
  fontSize: z.literal(FONT_SIZES).nullable().optional(),
  weight: z.enum(FONT_WEIGHTS).nullable().optional(),
  align: z.enum(TEXT_ALIGNS).nullable().optional(),
  fill: hexColor.nullable().optional(),
  border: elementBorder.nullable().optional(),
});

export type StyleChange = z.infer<typeof styleChange>;

export type ElementBox = z.infer<typeof elementBox>;

export type ElementStyle = z.infer<typeof elementStyle>;

/** The optional place and style every element kind carries. */
export const placed = {
  box: elementBox.optional(),
  style: elementStyle.optional(),
};

export const titleElement = z.strictObject({
  kind: z.literal("title"),
  text: z.string().trim().min(1).max(TITLE_CHARACTERS),
  ...placed,
});

export const textElement = z.strictObject({
  kind: z.literal("text"),
  text: z.string().trim().min(1).max(TEXT_CHARACTERS),
  ...placed,
});

export const bulletsElement = z.strictObject({
  kind: z.literal("bullets"),
  items: z
    .array(z.string().trim().min(1).max(BULLET_CHARACTERS))
    .min(1)
    .max(BULLET_ITEMS),
  ...placed,
});

export const imageElement = z.strictObject({
  kind: z.literal("image"),
  fileId: z.uuid(),
  alt: z.string().trim().min(1).max(200),
  ...placed,
});

/** One element as a person or the agent sends it. A data element names its chart config only. */
export const elementInput = z.discriminatedUnion("kind", [
  titleElement,
  textElement,
  bulletsElement,
  z.strictObject({ kind: z.literal("figure"), chart: z.unknown(), ...placed }),
  z.strictObject({ kind: z.literal("chart"), chart: z.unknown(), ...placed }),
  z.strictObject({ kind: z.literal("table"), chart: z.unknown(), ...placed }),
  imageElement,
]);

/**
 * One element of a change-slide step. A box or style left out keeps the stored element's at that
 * place with that kind, and `null` clears it (czjw.157).
 */
const stated = {
  box: elementBox.nullable().optional(),
  style: elementStyle.nullable().optional(),
};

export const changedElementInput = z.discriminatedUnion("kind", [
  titleElement.extend(stated),
  textElement.extend(stated),
  bulletsElement.extend(stated),
  z.strictObject({ kind: z.literal("figure"), chart: z.unknown(), ...stated }),
  z.strictObject({ kind: z.literal("chart"), chart: z.unknown(), ...stated }),
  z.strictObject({ kind: z.literal("table"), chart: z.unknown(), ...stated }),
  imageElement.extend(stated),
]);

export type ChangedElementInput = z.infer<typeof changedElementInput>;

export type ElementKind = z.infer<typeof elementInput>["kind"];

/** The kinds that hold text and take every style key. */
export const TEXT_KINDS: ReadonlySet<ElementKind> = new Set([
  "title",
  "text",
  "bullets",
]);

/** The smallest box per kind, so a text keeps one line and a visual stays readable (tech plan, Style defaults). */
export function minBox(kind: ElementKind): {
  readonly w: number;
  readonly h: number;
} {
  return TEXT_KINDS.has(kind) ? { w: 80, h: 32 } : { w: 160, h: 96 };
}

const TEXT_ONLY_KEYS = ["color", "fontSize", "weight", "align"] as const;

/** What the shape rules and the refusals read of one element. */
export type ElementLike = {
  readonly kind: ElementKind;
  readonly text?: string | undefined;
  readonly items?: readonly string[] | undefined;
  readonly alt?: string | undefined;
  readonly box?: ElementBox | null | undefined;
  readonly style?: ElementStyle | null | undefined;
};

const NAME_CHARACTERS = 28;

const quoted = (value: string) =>
  `"${value.length > NAME_CHARACTERS ? `${value.slice(0, NAME_CHARACTERS)}…` : value}"`;

/** An element as a refusal names it, for example `Text "Sales rose."` or `The chart`. */
export function elementName(element: ElementLike): string {
  switch (element.kind) {
    case "title":
      return `Title ${quoted(element.text ?? "")}`;
    case "text":
      return `Text ${quoted(element.text ?? "")}`;
    case "bullets":
      return `Bullets ${quoted(element.items?.[0] ?? "")}`;
    case "image":
      return `Image ${quoted(element.alt ?? "")}`;
    case "figure":
    case "chart":
    case "table":
      return `The ${element.kind}`;
  }
}

/** The box limits and kind rules of one element, at its `box` or `style` field. */
function placementIssues(
  element: ElementLike
): { field: "box" | "style"; message: string }[] {
  const issues: { field: "box" | "style"; message: string }[] = [];
  // A change-slide step's null clears, so it reads as none (czjw.157).
  const box = element.box ?? undefined;
  const style = element.style ?? undefined;

  if (box !== undefined) {
    const min = minBox(element.kind);

    if (
      box.x + box.w > SLIDE_CANVAS.width ||
      box.y + box.h > SLIDE_CANVAS.height
    ) {
      issues.push({
        field: "box",
        message: `${elementName(element)} must stay inside the ${SLIDE_CANVAS.width} by ${SLIDE_CANVAS.height} slide.`,
      });
    } else if (box.w < min.w || box.h < min.h) {
      issues.push({
        field: "box",
        message: `${elementName(element)} needs a box of at least ${min.w} by ${min.h}.`,
      });
    }
  }

  if (
    style !== undefined &&
    !TEXT_KINDS.has(element.kind) &&
    TEXT_ONLY_KEYS.some((key) => style[key] !== undefined)
  ) {
    issues.push({
      field: "style",
      message: `${elementName(element)} takes only a fill and a border.`,
    });
  }

  return issues;
}

export const TABLE_ROWS = 12;

export const TABLE_COLUMNS = 5;

export const CHART_POINTS = 60;

/** The refusals of a frozen element's data size, which the server checks after the chart gate. */
export const DATA_LIMIT_MESSAGES = {
  table: `A slide table shows at most ${TABLE_ROWS} rows and ${TABLE_COLUMNS} columns. Limit or group the query.`,
  chart: `A slide chart shows at most ${CHART_POINTS} points. Group the query by month or limit it.`,
};

export const SLIDE_RULE_MESSAGES = {
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
  slide: { readonly elements: readonly ElementLike[] },
  ctx: z.RefinementCtx
): void {
  for (const { index, message } of ruleIssues(
    slide.elements.map(({ kind }) => kind)
  )) {
    ctx.addIssue({ code: "custom", path: ["elements", index], message });
  }

  for (const [index, element] of slide.elements.entries()) {
    for (const { field, message } of placementIssues(element)) {
      ctx.addIssue({
        code: "custom",
        path: ["elements", index, field],
        message,
      });
    }
  }
}

const slideFields = {
  background: hexColor.optional(),
  notes: slideNotes.optional(),
};

export const slideInput = z
  .strictObject({
    elements: z.array(elementInput).min(1).max(SLIDE_ELEMENT_LIMIT),
    ...slideFields,
  })
  .superRefine(refineSlideRules);

/** A slide of a change-slide step: `slideInput` with elements of `changedElementInput`. */
export const changedSlideInput = z
  .strictObject({
    elements: z.array(changedElementInput).min(1).max(SLIDE_ELEMENT_LIMIT),
    ...slideFields,
  })
  .superRefine(refineSlideRules);

export type ChangedSlideInput = z.infer<typeof changedSlideInput>;

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
  z.strictObject({
    op: z.literal("change-slide"),
    slideId,
    slide: changedSlideInput,
  }),
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
  /** Sets the box or the style of one element; `null` clears (tech plan, Change steps). */
  z.strictObject({
    op: z.literal("change-element"),
    slideId,
    index: z
      .int()
      .min(0)
      .max(SLIDE_ELEMENT_LIMIT - 1),
    box: elementBox.nullable().optional(),
    style: styleChange.nullable().optional(),
  }),
  /** Sets the fields of one slide that are not its elements; `null` clears. */
  z.strictObject({
    op: z.literal("change-slide-fields"),
    slideId,
    background: hexColor.nullable().optional(),
    notes: slideNotes.nullable().optional(),
  }),
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
      z.object({
        id: z.string(),
        elements: z.array(z.unknown()).readonly(),
        background: z.string().optional(),
        notes: z.string().optional(),
      })
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
