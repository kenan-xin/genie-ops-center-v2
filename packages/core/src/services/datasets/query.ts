import { z } from "zod";

import type { AppErrorIssue } from "../../lib/errors/index.ts";
import type {
  DatasetDeclaration,
  DatasetFieldType,
} from "../../lib/module-contract/module.ts";

/**
 * The one generic dataset query shape (DEC-54, Spec 7 R-6 to R-8) and its check against a
 * declaration's fields. It imports only zod and types, so a browser screen can validate with it.
 */

export const DATASET_ROW_CAP = 1000;

export type DatasetFilterValue = string | number | boolean;

export type DatasetFilter =
  | {
      readonly field: string;
      readonly op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
      readonly value: DatasetFilterValue;
    }
  | {
      readonly field: string;
      readonly op: "in";
      readonly values: readonly DatasetFilterValue[];
    }
  | {
      readonly field: string;
      readonly op: "between";
      readonly from: DatasetFilterValue;
      readonly to: DatasetFilterValue;
    }
  | { readonly field: string; readonly op: "isNull" };

export type DatasetRange = {
  readonly label: string;
  readonly min?: number;
  readonly max?: number;
};

export type DatasetGroup =
  | { readonly field: string }
  | { readonly field: string; readonly bucket: "month" | "week" }
  | { readonly field: string; readonly ranges: readonly DatasetRange[] };

export type DatasetAggregate = {
  readonly fn: "sum" | "count" | "avg" | "min" | "max";
  readonly field?: string;
  readonly as: string;
};

export type DatasetOrder = {
  readonly column: string;
  readonly direction: "asc" | "desc";
};

export type DatasetQuery = {
  readonly select?: readonly string[];
  readonly filters?: readonly DatasetFilter[];
  readonly groupBy?: readonly DatasetGroup[];
  readonly aggregates?: readonly DatasetAggregate[];
  readonly orderBy?: readonly DatasetOrder[];
  readonly limit?: number;
};

const value = z.union([z.string(), z.number(), z.boolean()]);

const range = z.strictObject({
  label: z.string(),
  min: z.number().exactOptional(),
  max: z.number().exactOptional(),
});

/** The shape check. The types above are its `z.infer`. Strict, so a misspelt key is refused. */
export const datasetQuerySchema: z.ZodType<DatasetQuery> = z.strictObject({
  select: z.array(z.string()).exactOptional(),
  filters: z
    .array(
      z.union([
        z.strictObject({
          field: z.string(),
          op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte"]),
          value,
        }),
        z.strictObject({
          field: z.string(),
          op: z.literal("in"),
          values: z.array(value),
        }),
        z.strictObject({
          field: z.string(),
          op: z.literal("between"),
          from: value,
          to: value,
        }),
        z.strictObject({ field: z.string(), op: z.literal("isNull") }),
      ])
    )
    .exactOptional(),
  groupBy: z
    .array(
      z.union([
        z.strictObject({ field: z.string() }),
        z.strictObject({
          field: z.string(),
          bucket: z.enum(["month", "week"]),
        }),
        z.strictObject({ field: z.string(), ranges: z.array(range) }),
      ])
    )
    .exactOptional(),
  aggregates: z
    .array(
      z.strictObject({
        fn: z.enum(["sum", "count", "avg", "min", "max"]),
        field: z.string().exactOptional(),
        as: z.string().min(1),
      })
    )
    .exactOptional(),
  orderBy: z
    .array(
      z.strictObject({
        column: z.string(),
        direction: z.enum(["asc", "desc"]),
      })
    )
    .exactOptional(),
  limit: z.number().int().exactOptional(),
});

const ORDERED: ReadonlySet<DatasetFieldType> = new Set([
  "date",
  "number",
  "money",
]);

const MAX_IN_VALUES = 1000;

const MAX_RANGES = 20;

/** A `YYYY-MM-DD` that names a real calendar day. */
function isCalendarDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;

  const day = new Date(`${text}T00:00:00Z`);

  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(text);
}

function fits(type: DatasetFieldType, candidate: DatasetFilterValue): boolean {
  switch (type) {
    case "text":
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the value comes from a caller
      return typeof candidate === "string";
    case "date":
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the value comes from a caller
      return typeof candidate === "string" && isCalendarDate(candidate);
    case "number":
    case "money":
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the value comes from a caller
      return typeof candidate === "number" && Number.isFinite(candidate);
    case "boolean":
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the value comes from a caller
      return typeof candidate === "boolean";
  }
}

/** The ranges of a group, checked one by one and then for overlap in bound order. */
function rangeIssues(
  ranges: readonly DatasetRange[],
  path: string
): AppErrorIssue[] {
  if (ranges.length < 1 || ranges.length > MAX_RANGES) {
    return [{ path, message: `A group holds 1 to ${MAX_RANGES} ranges.` }];
  }

  const issues: AppErrorIssue[] = [];
  const labels = new Set<string>();

  ranges.forEach((entry, index) => {
    const at = `${path}.${index}`;

    if (entry.label.trim() === "" || labels.has(entry.label)) {
      issues.push({
        path: at,
        message: `Range "${entry.label}" needs a label no other range uses.`,
      });
    } else if (entry.min === undefined && entry.max === undefined) {
      issues.push({
        path: at,
        message: `Range "${entry.label}" needs a min, a max or both.`,
      });
    } else if (
      entry.min !== undefined &&
      entry.max !== undefined &&
      entry.min >= entry.max
    ) {
      issues.push({
        path: at,
        message: `Range "${entry.label}" needs its min below its max.`,
      });
    }

    labels.add(entry.label);
  });

  if (issues.length > 0) return issues;

  const ordered = ranges
    .map((entry, index) => ({ entry, index }))
    .toSorted(
      (left, right) =>
        (left.entry.min ?? -Infinity) - (right.entry.min ?? -Infinity)
    );

  for (let next = 1; next < ordered.length; next += 1) {
    const before = ordered[next - 1];
    const after = ordered[next];

    if (
      before !== undefined &&
      after !== undefined &&
      (before.entry.max ?? Infinity) > (after.entry.min ?? -Infinity)
    ) {
      issues.push({
        path: `${path}.${Math.max(before.index, after.index)}`,
        message: `Ranges "${before.entry.label}" and "${after.entry.label}" overlap.`,
      });
    }
  }

  return issues;
}

function joinPath(prefix: string, path: string): string {
  if (prefix === "") return path;

  return path === "" ? prefix : `${prefix}.${path}`;
}

/** The issues of a failed query schema check, with its paths under `prefix`. */
export function schemaIssues(
  error: z.ZodError,
  prefix = ""
): readonly AppErrorIssue[] {
  return error.issues.map((issue) => ({
    path: joinPath(prefix, issue.path.join(".")),
    message: issue.message,
  }));
}

/** The declared-field issues of one shape-checked query, with its paths under `prefix`. */
export function fieldIssues(
  fields: DatasetDeclaration["fields"],
  query: DatasetQuery,
  prefix = ""
): readonly AppErrorIssue[] {
  return validateDatasetQuery(fields, query).map((issue) => ({
    path: joinPath(prefix, issue.path),
    message: issue.message,
  }));
}

export type DatasetQueryCheck = {
  readonly query?: DatasetQuery;
  readonly issues: readonly AppErrorIssue[];
};

/** The schema check and the declared-field check of one query (DEC-54). */
export function checkDatasetQuery(
  fields: DatasetDeclaration["fields"],
  input: DatasetQuery,
  prefix = ""
): DatasetQueryCheck {
  const parsed = datasetQuerySchema.safeParse(input);

  if (!parsed.success) {
    return { issues: schemaIssues(parsed.error, prefix) };
  }

  return {
    query: parsed.data,
    issues: fieldIssues(fields, parsed.data, prefix),
  };
}

/** Every way the query does not fit the declared fields, as issues with dotted paths. Empty means it fits. */
export function validateDatasetQuery(
  fields: DatasetDeclaration["fields"],
  query: DatasetQuery
): readonly AppErrorIssue[] {
  const issues: AppErrorIssue[] = [];

  const typeOf = (name: string) =>
    Object.hasOwn(fields, name) ? fields[name]?.type : undefined;

  const unknown = (path: string, name: string) =>
    issues.push({ path, message: `Field "${name}" is not in the dataset.` });

  const outputs = new Set<string>();

  const output = (path: string, name: string) => {
    if (outputs.has(name)) {
      issues.push({
        path,
        message: `Column "${name}" appears twice in the result.`,
      });
    }

    outputs.add(name);
  };

  const {
    select,
    groupBy = [],
    aggregates,
    filters = [],
    orderBy = [],
  } = query;

  if (select !== undefined && aggregates !== undefined) {
    issues.push({
      path: "select",
      message: "A query holds select or aggregates, not both.",
    });
  } else if (select === undefined && aggregates === undefined) {
    issues.push({
      path: "select",
      message: "A query needs select or aggregates.",
    });
  }

  if (groupBy.length > 0 && aggregates === undefined) {
    issues.push({ path: "groupBy", message: "A group needs an aggregate." });
  }

  select?.forEach((name, index) => {
    if (typeOf(name) === undefined) unknown(`select.${index}`, name);
    else output(`select.${index}`, name);
  });

  filters.forEach((filter, index) => {
    const at = `filters.${index}`;
    const type = typeOf(filter.field);

    if (type === undefined) {
      unknown(`${at}.field`, filter.field);

      return;
    }

    const wrong = (path: string, candidate: DatasetFilterValue) => {
      if (!fits(type, candidate)) {
        issues.push({
          path,
          message: `Value ${JSON.stringify(candidate)} does not fit ${type} field "${filter.field}".`,
        });
      }
    };

    switch (filter.op) {
      case "isNull":
        return;
      case "in":
        if (filter.values.length < 1 || filter.values.length > MAX_IN_VALUES) {
          issues.push({
            path: `${at}.values`,
            message: `Filter on "${filter.field}" holds 1 to ${MAX_IN_VALUES} values.`,
          });
        }

        filter.values.forEach((entry, position) =>
          wrong(`${at}.values.${position}`, entry)
        );

        return;
      case "eq":
      case "neq":
        wrong(`${at}.value`, filter.value);

        return;
      default:
        if (!ORDERED.has(type)) {
          issues.push({
            path: `${at}.op`,
            message: `"${filter.op}" applies to date, number and money fields, not ${type} field "${filter.field}".`,
          });
        } else if (filter.op === "between") {
          wrong(`${at}.from`, filter.from);
          wrong(`${at}.to`, filter.to);
        } else {
          wrong(`${at}.value`, filter.value);
        }
    }
  });

  groupBy.forEach((group, index) => {
    const at = `groupBy.${index}`;
    const type = typeOf(group.field);

    if (type === undefined) {
      unknown(`${at}.field`, group.field);

      return;
    }

    if ("bucket" in group && type !== "date") {
      issues.push({
        path: `${at}.bucket`,
        message: `A ${group.bucket} bucket applies to a date field, not ${type} field "${group.field}".`,
      });
    }

    if ("ranges" in group) {
      if (type === "number") {
        issues.push(...rangeIssues(group.ranges, `${at}.ranges`));
      } else {
        issues.push({
          path: `${at}.ranges`,
          message: `Ranges apply to a number field, not ${type} field "${group.field}".`,
        });
      }
    }

    // A group answers a column only in an aggregate query; without one, `groupBy` is refused.
    if (aggregates !== undefined) output(`${at}.field`, group.field);
  });

  aggregates?.forEach((aggregate, index) => {
    const at = `aggregates.${index}.field`;

    if (aggregate.field === undefined) {
      if (aggregate.fn !== "count") {
        issues.push({
          path: at,
          message: `Aggregate "${aggregate.as}" needs a field.`,
        });
      }
    } else {
      const type = typeOf(aggregate.field);

      const allowed =
        aggregate.fn === "count" ||
        (aggregate.fn === "sum" || aggregate.fn === "avg"
          ? type === "number" || type === "money"
          : type !== undefined && ORDERED.has(type));

      if (type === undefined) unknown(at, aggregate.field);
      else if (!allowed) {
        issues.push({
          path: at,
          message: `"${aggregate.fn}" does not apply to ${type} field "${aggregate.field}".`,
        });
      }
    }

    output(`aggregates.${index}.as`, aggregate.as);
  });

  orderBy.forEach((order, index) => {
    if (!outputs.has(order.column)) {
      issues.push({
        path: `orderBy.${index}.column`,
        message: `Column "${order.column}" is not in the result.`,
      });
    }
  });

  if (
    query.limit !== undefined &&
    (query.limit < 1 || query.limit > DATASET_ROW_CAP)
  ) {
    issues.push({
      path: "limit",
      message: `The limit is 1 to ${DATASET_ROW_CAP}.`,
    });
  }

  return issues;
}
