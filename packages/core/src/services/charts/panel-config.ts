import { has } from "es-toolkit/compat";
import { z } from "zod";

import type { AppErrorIssue } from "../../lib/errors/index.ts";
import { type DatasetQuery, datasetQuerySchema } from "../datasets/query.ts";

/**
 * The panel config of a chart (Spec 7 R-14): a chart type, its series and a title, with a closed
 * list of keys per type, and a fix hint per refused key. It imports only zod, types and a pure
 * helper, so a browser screen can validate with it.
 */

export const CHART_TYPES = [
  "kpi",
  "bar",
  "line",
  "area",
  "donut",
  "table",
] as const;

export type ChartType = (typeof CHART_TYPES)[number];

/** One series per color slot, so no chart draws more (R-15). */
export const CHART_SERIES_LIMIT = 8;

export type TableSeries = {
  readonly name: string;
  readonly dataset: string;
  readonly query: DatasetQuery;
};

export type KpiSeries = TableSeries & { readonly value: string };

export type CartesianSeries = TableSeries & {
  readonly x: string;
  readonly y: string;
};

export type DonutSeries = TableSeries & {
  readonly category: string;
  readonly value: string;
};

export type PanelConfig =
  | {
      readonly type: "kpi";
      readonly title: string;
      readonly series: readonly [KpiSeries];
    }
  | {
      readonly type: "bar" | "line" | "area";
      readonly title: string;
      readonly series: readonly CartesianSeries[];
    }
  | {
      readonly type: "donut";
      readonly title: string;
      readonly series: readonly [DonutSeries];
    }
  | {
      readonly type: "table";
      readonly title: string;
      readonly series: readonly [TableSeries];
    };

const text = z.string().trim().min(1);

const field = z.string().min(1);

const seriesBase = {
  // A chart row keeps its x value under "x", so a series of that name would overwrite it.
  name: text.refine((name) => name !== "x", {
    message: 'Rename the series: "x" names the x-axis.',
  }),
  dataset: field,
  query: datasetQuerySchema,
};

const cartesianSeries = z.strictObject({ ...seriesBase, x: field, y: field });

const SERIES = {
  kpi: z.strictObject({ ...seriesBase, value: field }),
  bar: cartesianSeries,
  line: cartesianSeries,
  area: cartesianSeries,
  donut: z.strictObject({ ...seriesBase, category: field, value: field }),
  table: z.strictObject(seriesBase),
};

const cartesianPanel = <T extends "bar" | "line" | "area">(type: T) =>
  z.strictObject({
    type: z.literal(type),
    title: text,
    series: z.array(cartesianSeries).min(1).max(CHART_SERIES_LIMIT),
  });

const PANELS = {
  kpi: z.strictObject({
    type: z.literal("kpi"),
    title: text,
    series: z.tuple([SERIES.kpi]),
  }),
  bar: cartesianPanel("bar"),
  line: cartesianPanel("line"),
  area: cartesianPanel("area"),
  donut: z.strictObject({
    type: z.literal("donut"),
    title: text,
    series: z.tuple([SERIES.donut]),
  }),
  table: z.strictObject({
    type: z.literal("table"),
    title: text,
    series: z.tuple([SERIES.table]),
  }),
};

/** The shape check. Strict at every level, so an unknown key is refused. */
export const panelConfigSchema: z.ZodType<PanelConfig> = z.discriminatedUnion(
  "type",
  [PANELS.kpi, PANELS.bar, PANELS.line, PANELS.area, PANELS.donut, PANELS.table]
);

export type PanelConfigCheck = {
  readonly config?: PanelConfig;
  readonly issues: readonly AppErrorIssue[];
};

const keysOf = (schema: z.ZodObject) => Object.keys(schema.shape).join(", ");

/** One fix hint per refused key, read from the schema so the hint and the schema cannot drift. */
function hints(
  issue: z.core.$ZodIssue,
  type: ChartType | undefined
): readonly AppErrorIssue[] {
  const path = issue.path.map(String);
  const at = path.join(".");
  const [head, index, key] = path;

  if (issue.code === "unrecognized_keys") {
    const owner =
      type === undefined
        ? undefined
        : at === ""
          ? { noun: "chart", schema: PANELS[type] }
          : head === "series" && key === undefined
            ? { noun: "series", schema: SERIES[type] }
            : undefined;

    return issue.keys.map((name) => ({
      path: at === "" ? name : `${at}.${name}`,
      message:
        owner === undefined || type === undefined
          ? issue.message
          : `Remove "${name}". A ${type} ${owner.noun} takes only: ${keysOf(owner.schema)}.`,
    }));
  }

  // Inside a query, the dataset query's own messages already name the fix.
  if (head === "series" && index !== undefined && key === "query") {
    if (path.length > 3) return [{ path: at, message: issue.message }];
  }

  return [{ path: at, message: message(issue, path, type) }];
}

function message(
  issue: z.core.$ZodIssue,
  path: readonly string[],
  type: ChartType | undefined
): string {
  const last = path.at(-1);

  if (issue.code === "invalid_union" && last === "type") {
    return `Use one of: ${CHART_TYPES.join(", ")}.`;
  }

  if (
    (issue.code === "too_big" || issue.code === "too_small") &&
    issue.origin === "array" &&
    path.join(".") === "series" &&
    type !== undefined
  ) {
    return type === "bar" || type === "line" || type === "area"
      ? `A ${type} chart draws 1 to ${CHART_SERIES_LIMIT} series.`
      : `A ${type} chart draws one series.`;
  }

  if (issue.code === "too_small" && issue.origin === "string") {
    return `"${last}" cannot be blank.`;
  }

  return issue.message;
}

/** The schema check of one panel config, with a fix hint per refused key (R-14, R-15). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the raw config of an agent or a screen; this is its parser
export function checkPanelConfig(input: unknown): PanelConfigCheck {
  const parsed = panelConfigSchema.safeParse(input);

  if (parsed.success) return { config: parsed.data, issues: [] };

  const type = CHART_TYPES.find((name) =>
    has(input, ["type"]) ? Object(input).type === name : false
  );

  return {
    issues: parsed.error.issues.flatMap((issue) => {
      const last = issue.path.at(-1);

      if (
        issue.code !== "unrecognized_keys" &&
        last !== undefined &&
        !has(input, issue.path.map(String))
      ) {
        return [
          { path: issue.path.join("."), message: `Add "${String(last)}".` },
        ];
      }

      return hints(issue, type);
    }),
  };
}
