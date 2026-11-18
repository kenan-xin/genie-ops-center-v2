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
  type SlideTheme,
  slideNotes,
  storedTheme,
  type StoredTheme,
  TABLE_COLUMNS,
  TABLE_ROWS,
  textElement,
  titleElement,
} from "./contract.ts";
import { contrastLimit, textGround } from "./presentation/slide-layout.ts";

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

const PLACE_WORDS = {
  fill: "its fill",
  panel: "the panel",
  background: "the background",
} as const;

/** Each text on the named slides whose color is below its limit on what draws behind it (R-52a, P14-7). */
export function textContrastIssues(
  content: DeckContent,
  theme: SlideTheme,
  slideIds: ReadonlySet<string> | "all"
): { readonly path: string; readonly message: string }[] {
  return content.slides.flatMap((slide, i) => {
    if (slideIds !== "all" && !slideIds.has(slide.id)) return [];

    return slide.elements.flatMap((element, j) => {
      if (
        element.kind !== "title" &&
        element.kind !== "text" &&
        element.kind !== "bullets"
      ) {
        return [];
      }

      const { behind, chosen, where } = textGround(slide, j, theme, i === 0);

      if (
        contrastRatio(chosen, behind) >=
        contrastLimit(element.kind, element.style?.fontSize)
      ) {
        return [];
      }

      const fix = where === "fill" ? "change its fill" : "give the text a fill";

      return [
        {
          path: `slides.${i}.elements.${j}.style`,
          message: `${elementName(element)}: this text color is too close to ${PLACE_WORDS[where]} to read. Pick a color with more contrast, or ${fix}.`,
        },
      ];
    });
  });
}

/** The theme pairs a save checks: each role on its ground, at its limit (P14-22). */
const THEME_PAIRS = [
  ["text", "text", "background", 4.5],
  ["secondaryText", "secondary text", "background", 4.5],
  ["accent", "accent", "background", 3],
  ["panelText", "panel text", "panel", 4.5],
] as const;

/**
 * Each theme color below its limit on its ground, at the stored key to change: the role's when the
 * deck sets it, else the ground's. A pair of two brand colors is not the deck's to fix, so it is
 * skipped. The panel pair counts only in a solid layout, where text sits on the panel.
 */
export function themeContrastIssues(
  theme: SlideTheme,
  stored: StoredTheme
): { readonly path: string; readonly message: string }[] {
  return THEME_PAIRS.flatMap(([role, words, ground, limit]) => {
    if (ground === "panel" && theme.layout !== "solid") return [];

    if (stored[role] === undefined && stored[ground] === undefined) return [];

    const ratio = contrastRatio(theme[role], theme[ground]);

    if (ratio >= limit) return [];

    // Rounded down, so a failing ratio never reads as its limit.
    const shown = Math.floor(ratio * 100) / 100;

    return [
      {
        path: `theme.${stored[role] === undefined ? ground : role}`,
        message: `The theme's ${words} ${theme[role]} is too close to the ${ground} ${theme[ground]} to read: ${shown}:1, and it needs ${limit}:1. Pick colors with more contrast.`,
      },
    ];
  });
}

/** The stored content of one deck: its slides in display order and its own theme (R-52, czjw.183). */
export type DeckContent = {
  readonly slides: readonly StoredSlide[];
  readonly theme?: StoredTheme | undefined;
};

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
  .superRefine(refineSlideRules);

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
  theme: storedTheme.optional(),
});

export const EMPTY_DECK_CONTENT: DeckContent = { slides: [] };
