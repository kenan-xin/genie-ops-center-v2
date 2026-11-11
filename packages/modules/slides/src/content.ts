import {
  contrastRatio,
  type PanelConfig,
  panelConfigSchema,
} from "@genie/core";
import type { ChartData } from "@genie/ui";
import { z } from "zod";

import {
  bulletsElement,
  CHART_POINTS,
  DATA_LIMIT_MESSAGES,
  DECK_SLIDE_LIMIT,
  type ElementBox,
  elementName,
  type ElementStyle,
  hexColor,
  imageElement,
  placed,
  refineSlideRules,
  SLIDE_ELEMENT_LIMIT,
  slideId,
  slideNotes,
  TABLE_COLUMNS,
  TABLE_ROWS,
  textElement,
  THEME_BACKGROUND,
  THEME_TEXT,
  titleElement,
} from "./contract.ts";
import { contrastLimit } from "./presentation/slide-layout.ts";

/** The chart config and the data the gate answered for it, frozen on the deck (D3). */
export type FrozenChart = {
  readonly chart: PanelConfig;
  readonly data: ChartData;
};

/** An element's own box and style; absent keeps the computed layout and the theme (R-52a). */
export type Placement = {
  readonly box?: ElementBox | undefined;
  readonly style?: ElementStyle | undefined;
};

export type StoredElement = Placement &
  (
    | { readonly kind: "title" | "text"; readonly text: string }
    | { readonly kind: "bullets"; readonly items: readonly string[] }
    | ({ readonly kind: "figure" | "chart" | "table" } & FrozenChart)
    | { readonly kind: "image"; readonly fileId: string; readonly alt: string }
  );

export type StoredSlide = {
  readonly id: string;
  readonly elements: readonly StoredElement[];
  readonly background?: string | undefined;
  readonly notes?: string | undefined;
};

/**
 * Each text element whose color is below the contrast limit against its own fill, else the slide
 * background, else the theme background. A text without a color is checked in the theme's text
 * color, so a background change re-checks every text without a fill (tech plan, Style reach).
 */
export function textContrastIssues(slide: {
  readonly background?: string | undefined;
  readonly elements: readonly (Placement & {
    readonly kind: StoredElement["kind"];
    readonly text?: string | undefined;
    readonly items?: readonly string[] | undefined;
  })[];
}): { index: number; message: string }[] {
  return slide.elements.flatMap((element, index) => {
    if (
      element.kind !== "title" &&
      element.kind !== "text" &&
      element.kind !== "bullets"
    ) {
      return [];
    }

    const style = element.style ?? {};
    const color = style.color ?? THEME_TEXT;

    const [where, behind] =
      style.fill !== undefined
        ? ["its fill", style.fill]
        : slide.background !== undefined
          ? ["the slide background", slide.background]
          : ["the theme background", THEME_BACKGROUND];

    const needs = contrastLimit(element.kind, style.fontSize);

    const ratio = contrastRatio(color, behind);

    if (ratio >= needs) return [];

    // Rounded down, so a refused pair never shows the limit itself.
    const shown = (Math.floor(ratio * 10) / 10).toFixed(1);

    return [
      {
        index,
        message: `${elementName(element)}: ${color} on ${where} ${behind} is ${shown}:1, and this text needs ${needs}:1. Pick a color with more contrast, or give the text a fill.`,
      },
    ];
  });
}

/** The stored content of one deck: its slides in display order (R-52). */
export type DeckContent = { readonly slides: readonly StoredSlide[] };

/** One save that Undo can restore, frozen figures included (D1). */
export type UndoEntry = {
  readonly title: string;
  readonly content: DeckContent;
  readonly frozenOn: string;
};

const CHART_ELEMENT_TYPES: ReadonlySet<string> = new Set([
  "bar",
  "line",
  "area",
  "donut",
]);

/** Enough of the gate's `ChartData` to check a frozen element against its limits. */
const frozenData = z.looseObject({
  kind: z.string(),
  columns: z.array(z.unknown()),
  rows: z.array(z.unknown()),
});

/** The chart type each data element takes, with the message when it does not. */
const TAKES = {
  figure: [(type: string) => type === "kpi", "A figure takes a KPI chart."],
  chart: [
    (type: string) => CHART_ELEMENT_TYPES.has(type),
    "A chart element takes a bar, line, area or donut chart.",
  ],
  table: [
    (type: string) => type === "table",
    "A table element takes a table chart.",
  ],
} as const;

const frozenElement = <K extends keyof typeof TAKES>(kind: K) =>
  z
    .strictObject({
      kind: z.literal(kind),
      // Core's chart schema, so a stored element has the shape the chart gate checks (R-14).
      chart: panelConfigSchema,
      // The gate built the data, so only its kind is checked against the chart.
      data: z.custom<ChartData>((value) => frozenData.safeParse(value).success),
      ...placed,
    })
    .superRefine(({ chart, data }, ctx) => {
      const [takes, message] = TAKES[kind];

      if (!takes(chart.type)) {
        ctx.addIssue({ code: "custom", path: ["chart"], message });
      }

      if (data.kind !== chart.type) {
        ctx.addIssue({
          code: "custom",
          path: ["data"],
          message: "The frozen data is not the data of its chart.",
        });
      }

      if (
        kind === "table" &&
        (data.rows.length > TABLE_ROWS || data.columns.length > TABLE_COLUMNS)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["data"],
          message: DATA_LIMIT_MESSAGES.table,
        });
      }

      if (kind === "chart" && data.rows.length > CHART_POINTS) {
        ctx.addIssue({
          code: "custom",
          path: ["data"],
          message: DATA_LIMIT_MESSAGES.chart,
        });
      }
    });

const storedSlide = z
  .strictObject({
    id: slideId,
    elements: z
      .array(
        z.discriminatedUnion("kind", [
          titleElement,
          textElement,
          bulletsElement,
          frozenElement("figure"),
          frozenElement("chart"),
          frozenElement("table"),
          imageElement,
        ])
      )
      .min(1)
      .max(SLIDE_ELEMENT_LIMIT),
    background: hexColor.optional(),
    notes: slideNotes.optional(),
  })
  .superRefine((slide, ctx) => {
    refineSlideRules(slide, ctx);

    for (const { index, message } of textContrastIssues(slide)) {
      ctx.addIssue({
        code: "custom",
        path: ["elements", index, "style"],
        message,
      });
    }
  });

/** The server's parse of a stored or changed deck content. */
export const deckContentSchema: z.ZodType<DeckContent> = z.strictObject({
  slides: z
    .array(storedSlide)
    .max(DECK_SLIDE_LIMIT, `A deck holds at most ${DECK_SLIDE_LIMIT} slides.`)
    .superRefine((slides, ctx) => {
      const seen = new Set<string>();

      for (const [index, { id }] of slides.entries()) {
        if (seen.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "id"],
            message: `Two slides share the id ${id}.`,
          });
        }

        seen.add(id);
      }
    }),
});

export const EMPTY_DECK_CONTENT: DeckContent = { slides: [] };
