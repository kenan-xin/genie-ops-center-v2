import { z } from "zod";

import type {
  AgentMessage,
  ChatFieldLabel,
  ChatLabels,
} from "../../services/agent/index.ts";
// Type-only: the datasets index also loads the server's query runner.
import type {
  DatasetColumn,
  DatasetValue,
} from "../../services/datasets/index.ts";
import {
  type DatasetFilter,
  type DatasetFilterValue,
  type DatasetGroup,
  type DatasetQuery,
  datasetQuerySchema,
} from "../../services/datasets/query.ts";
import { fmtDate } from "../audit/helpers.ts";
import { toolNameOf } from "./step-model.ts";

type MessagePart = AgentMessage["parts"][number];

const fieldType = z.enum([
  "text",
  "date",
  "instant",
  "number",
  "money",
  "boolean",
]);

/** The fields of a `query-dataset` output that the method and the rows view read. */
const readOutput = z.object({
  dataset: z.string(),
  asOf: z.string(),
  readAt: z.string().exactOptional(),
  columns: z.array(
    z.object({
      name: z.string(),
      type: fieldType,
      bucket: z.enum(["month", "week", "ranges"]).exactOptional(),
      currency: z.string().exactOptional(),
    })
  ),
  rows: z.array(
    z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()])
    )
  ),
  truncated: z.boolean(),
});

const readInput = z.object({ query: z.unknown() });

/** One finished dataset read of an answer: its query and the rows it returned (czjw.108). */
export type Read = {
  readonly toolCallId: string;
  readonly dataset: string;
  readonly asOf: string;
  readonly readAt?: string;
  /** The tool input's query, parsed with `datasetQuerySchema`; an input that does not parse is `{}`. */
  readonly query: DatasetQuery;
  readonly columns: readonly DatasetColumn[];
  readonly rows: readonly Readonly<Record<string, DatasetValue>>[];
  readonly truncated: boolean;
};

function isQueryCall(part: MessagePart): boolean {
  return toolNameOf(part) === "query-dataset" && "state" in part;
}

/** Every finished dataset read of an answer, in order; a refused or running call read nothing. */
export function readsOf(parts: readonly MessagePart[]): readonly Read[] {
  return parts.flatMap((part) => {
    if (
      !isQueryCall(part) ||
      !("state" in part) ||
      part.state !== "output-available"
    )
      return [];

    const output = readOutput.safeParse(part.output);

    if (!output.success) return [];

    const query = datasetQuerySchema.safeParse(
      readInput.safeParse(part.input).data?.query
    );

    return [
      {
        ...output.data,
        toolCallId: part.toolCallId,
        query: query.success ? query.data : {},
      },
    ];
  });
}

/** "1 row", "37 rows", or "1,000+ rows" when the gate cut the read, because then the count is only a floor. */
export function rowsText(count: number, truncated: boolean): string {
  return `${count.toLocaleString("en-GB")}${truncated ? "+" : ""} ${count === 1 && !truncated ? "row" : "rows"}`;
}

function titleOf(dataset: string, labels: ChatLabels): string {
  return labels.datasets[dataset] ?? dataset;
}

/** The titles of the datasets an answer read, once each; an untitled one keeps its name (5.1). */
export function sourceTitles(
  parts: readonly MessagePart[],
  labels: ChatLabels
): readonly string[] {
  return [
    ...new Set(readsOf(parts).map((read) => titleOf(read.dataset, labels))),
  ];
}

const refusedInput = z.object({ dataset: z.string() });

/** The titles of refused `query-dataset` calls that no later finished read of the same dataset fixed. */
export function refusedReads(
  parts: readonly MessagePart[],
  labels: ChatLabels
): readonly string[] {
  const datasetOf = (part: MessagePart) =>
    "input" in part
      ? refusedInput.safeParse(part.input).data?.dataset
      : undefined;

  const refused = parts.flatMap((part, index) => {
    if (!isQueryCall(part) || !("state" in part)) return [];

    if (part.state !== "output-error") return [];

    const dataset = datasetOf(part);

    if (dataset === undefined) return [];

    const fixed = readsOf(parts.slice(index + 1)).some(
      (read) => read.dataset === dataset
    );

    return fixed ? [] : [titleOf(dataset, labels)];
  });

  return [...new Set(refused)];
}

/** One run of a read's sentence; a strong run names a measure, a filter or a group. */
export type SentencePart = { readonly text: string; readonly strong: boolean };

const DATED: ReadonlySet<ChatFieldLabel["type"]> = new Set(["date", "instant"]);

/** A filter value as a person reads it: a day, yes or no, a grouped number, money in major units. */
function valueText(field: ChatFieldLabel, value: DatasetFilterValue): string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a filter value is a string, a number or a boolean
  if (typeof value === "boolean") return value ? "yes" : "no";

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a filter value is a string, a number or a boolean
  if (typeof value === "string") {
    return DATED.has(field.type) ? fmtDate(value, "UTC") : value;
  }

  // A money field holds minor units (DatasetField.type), and a filter names no currency.
  if (field.type === "money") {
    return (value / 100).toLocaleString("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return value.toLocaleString("en-GB");
}

/** "a", "a and b", "a, b and c", with `last` as the final joiner. */
function listed(items: readonly string[], last: string): string {
  if (items.length < 2) return items.join("");

  return `${items.slice(0, -1).join(", ")}${last}${items.at(-1) ?? ""}`;
}

function filterText(filter: DatasetFilter, field: ChatFieldLabel): string {
  const label = field.label;
  const dated = DATED.has(field.type);
  const shown = (value: DatasetFilterValue) => valueText(field, value);

  switch (filter.op) {
    case "eq":
      return `${label} ${shown(filter.value)}`;
    case "neq":
      return `${label} not ${shown(filter.value)}`;
    case "gt":
      return `${label} ${dated ? "after" : "over"} ${shown(filter.value)}`;
    case "gte":
      return dated
        ? `${label} on or after ${shown(filter.value)}`
        : `${label} ${shown(filter.value)} or more`;
    case "lt":
      return `${label} ${dated ? "before" : "under"} ${shown(filter.value)}`;
    case "lte":
      return dated
        ? `${label} on or before ${shown(filter.value)}`
        : `${label} ${shown(filter.value)} or less`;
    case "in":
      return `${label} ${listed(filter.values.map(shown), " or ")}`;
    case "between":
      return `${label} from ${shown(filter.from)} to ${shown(filter.to)}`;
    case "isNull":
      return `no ${label}`;
  }
}

function groupText(group: DatasetGroup, field: ChatFieldLabel): string {
  if ("bucket" in group) return `${group.bucket} of ${field.label}`;

  if ("ranges" in group) {
    return `${group.ranges.length} ranges of ${field.label}`;
  }

  return field.label;
}

/** The fields a query names in its filters, groups and measures, which its sentence prints. */
function namedFields(query: DatasetQuery): readonly string[] {
  return [
    ...(query.filters ?? []).map((filter) => filter.field),
    ...(query.groupBy ?? []).map((group) => group.field),
    ...(query.aggregates ?? []).flatMap((aggregate) =>
      aggregate.fn === "count" || aggregate.field === undefined
        ? []
        : [aggregate.field]
    ),
  ];
}

/** Joins runs with ", " and a last " and "; every run keeps its own strength. */
function joined(
  runs: readonly (readonly SentencePart[])[]
): readonly SentencePart[] {
  return runs.flatMap((run, index) => {
    if (index === 0) return run;

    return [
      { text: index === runs.length - 1 ? " and " : ", ", strong: false },
      ...run,
    ];
  });
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/**
 * One plain sentence of what a read counted (czjw.108, variant A): the measures, which records,
 * how they were grouped, and the limit, in the dataset's field labels. It never prints a field or
 * dataset name (H8): a query that names a field with no label falls back to the row count.
 */
export function readSentence(
  read: Read,
  labels: ChatLabels
): readonly SentencePart[] {
  const fields = labels.fields[read.dataset] ?? {};
  const title = titleOf(read.dataset, labels);

  const field = (name: string) =>
    Object.hasOwn(fields, name) ? fields[name] : undefined;

  if (namedFields(read.query).some((name) => field(name) === undefined)) {
    return [
      {
        text: `${title}: ${rowsText(read.rows.length, read.truncated)}, as of ${fmtDate(read.asOf, "UTC")}`,
        strong: false,
      },
    ];
  }

  const label = (name: string | undefined) =>
    name === undefined ? "" : (field(name)?.label ?? "");

  const things = title.toLowerCase();
  const { filters = [], groupBy = [], aggregates = [] } = read.query;

  const measures: readonly (readonly SentencePart[])[] =
    aggregates.length === 0
      ? [
          [
            { text: "Listed the ", strong: false },
            { text: things, strong: true },
          ],
        ]
      : aggregates.map((aggregate, index) => {
          const verb = {
            sum: "Added up ",
            avg: "Took the average of ",
            min: "Took the lowest ",
            max: "Took the highest ",
            count: "Counted the ",
          }[aggregate.fn];

          return [
            { text: index === 0 ? verb : lowerFirst(verb), strong: false },
            {
              text: aggregate.fn === "count" ? things : label(aggregate.field),
              strong: true,
            },
          ];
        });

  const first = aggregates[0];
  const sentence: SentencePart[] = [...joined(measures)];

  if (first !== undefined && first.fn !== "count") {
    sentence.push({ text: ` of the ${things}`, strong: false });
  }

  const filterRuns = filters.flatMap((filter) => {
    const labelled = field(filter.field);

    return labelled === undefined
      ? []
      : [[{ text: filterText(filter, labelled), strong: true }]];
  });

  if (filterRuns.length > 0) {
    sentence.push({ text: " with ", strong: false }, ...joined(filterRuns));
  }

  const groupRuns = groupBy.flatMap((group) => {
    const labelled = field(group.field);

    return labelled === undefined
      ? []
      : [{ text: groupText(group, labelled), strong: true }];
  });

  if (groupRuns.length > 0) {
    sentence.push(
      { text: ", grouped by ", strong: false },
      ...groupRuns.flatMap((run, index) =>
        index === 0 ? [run] : [{ text: " and ", strong: false }, run]
      )
    );
  }

  const { limit, orderBy = [] } = read.query;
  const order = orderBy[0];

  if (limit !== undefined) {
    sentence.push({
      text:
        order === undefined
          ? `, first ${limit.toLocaleString("en-GB")} rows`
          : `, ${order.direction === "desc" ? "top" : "bottom"} ${limit.toLocaleString("en-GB")} by ${columnLabel(read, order.column, labels)}`,
      strong: false,
    });
  }

  sentence.push({ text: ".", strong: false });

  return sentence;
}

/** A column header of the rows view: the field's label or the measure's words, never a name (H8). */
export function columnLabel(
  read: Read,
  column: string,
  labels: ChatLabels
): string {
  const fields = labels.fields[read.dataset] ?? {};

  const labelOf = (name: string | undefined) =>
    name !== undefined && Object.hasOwn(fields, name)
      ? fields[name]?.label
      : undefined;

  const position = read.columns.findIndex((entry) => entry.name === column);
  const unnamed = position < 0 ? "Column" : `Column ${position + 1}`;

  const aggregate = read.query.aggregates?.find((entry) => entry.as === column);

  if (aggregate === undefined) return labelOf(column) ?? unnamed;

  if (aggregate.fn === "count") return "Count";

  const measured = labelOf(aggregate.field);

  if (measured === undefined) return unnamed;

  return {
    sum: measured,
    avg: `Average ${measured}`,
    min: `Lowest ${measured}`,
    max: `Highest ${measured}`,
  }[aggregate.fn];
}
