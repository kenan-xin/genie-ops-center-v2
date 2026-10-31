import { type PanelConfig, panelConfigSchema } from "@genie/core";
import type { ChartData } from "@genie/ui";
import { z } from "zod";

import {
  bulletsElement,
  DECK_SLIDE_LIMIT,
  imageElement,
  refineSlideRules,
  SLIDE_ELEMENT_LIMIT,
  slideId,
  textElement,
  titleElement,
} from "./contract.ts";

/** The chart config and the data the gate answered for it, frozen on the deck (D3). */
export type FrozenChart = {
  readonly chart: PanelConfig;
  readonly data: ChartData;
};

export type StoredElement =
  | { readonly kind: "title" | "text"; readonly text: string }
  | { readonly kind: "bullets"; readonly items: readonly string[] }
  | ({ readonly kind: "figure" | "chart" | "table" } & FrozenChart)
  | { readonly kind: "image"; readonly fileId: string; readonly alt: string };

export type StoredSlide = {
  readonly id: string;
  readonly elements: readonly StoredElement[];
};

/** The stored content of one deck: its slides in display order (R-52). */
export type DeckContent = { readonly slides: readonly StoredSlide[] };

/** One save that Undo can restore, frozen figures included (D1). */
export type UndoEntry = {
  readonly title: string;
  readonly content: DeckContent;
  readonly frozenOn: string;
};

const TABLE_ROWS = 12;

const TABLE_COLUMNS = 5;

const CHART_POINTS = 60;

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
          message: `A slide table shows at most ${TABLE_ROWS} rows and ${TABLE_COLUMNS} columns. Limit or group the query.`,
        });
      }

      if (kind === "chart" && data.rows.length > CHART_POINTS) {
        ctx.addIssue({
          code: "custom",
          path: ["data"],
          message: `A slide chart shows at most ${CHART_POINTS} points. Group the query by month or limit it.`,
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
});

export const EMPTY_DECK_CONTENT: DeckContent = { slides: [] };
