import { and, isSQLWrapper, type SQL, sql } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type {
  DatasetDeclaration,
  DatasetFieldType,
  DatasetSource,
  ModuleRequestContext,
} from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { pgErrorCode } from "../../utils/error-cause.ts";
import type { DatasetColumn, DatasetResult, DatasetValue } from "./index.ts";
import {
  DATASET_ROW_CAP,
  type DatasetFilter,
  type DatasetGroup,
  type DatasetQuery,
} from "./query.ts";

/** Spec 7 R-8: a dataset query stops after 5 seconds. */
export const DATASET_TIME_LIMIT_MS = 5000;

/**
 * The module's source, checked at the seam. An async function must answer `{ as }`, because a
 * Drizzle select is thenable and would resolve to rows.
 */
export async function datasetSource(
  ctx: ModuleRequestContext,
  declaration: DatasetDeclaration,
  asOf: string
): Promise<DatasetSource> {
  const source = await declaration.source(ctx, asOf);

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a module's answer, checked at the seam
  if (typeof source?.as !== "function") {
    throw new Error(
      `Dataset "${declaration.name}" source() must answer an object with as(alias); a Drizzle select is thenable, so wrap it.`
    );
  }

  return source;
}

/** Postgres `query_canceled`, which `statement_timeout` raises. */
const QUERY_CANCELED = "57014";

const CAST: Readonly<Record<DatasetFieldType, string>> = {
  text: "text",
  date: "date",
  number: "numeric",
  money: "numeric",
  boolean: "boolean",
};

// Every `sql.raw` piece comes from one of these fixed lookups, never from a caller's string.
const TRUNCATION = { month: "month", week: "week" } as const;

const AGGREGATE = { sum: "sum", avg: "avg", min: "min", max: "max" } as const;

const DIRECTION = { asc: "asc", desc: "desc" } as const;

/** One column of the answer: its metadata, its select expression and, for ranges, its labels. */
type Output = {
  readonly column: DatasetColumn;
  readonly expression: SQL<DatasetValue>;
  readonly labels?: readonly string[];
};

/** How a value of the type reaches the caller: an ISO date, a JS number, or text and boolean as is. */
function answer(expression: SQL, type: DatasetFieldType): SQL<DatasetValue> {
  if (type === "date") return sql`to_char(${expression}, 'YYYY-MM-DD')`;

  if (type === "number" || type === "money") {
    return sql`(${expression})::float8`;
  }

  return sql`${expression}`;
}

/**
 * Runs one validated query over the aliased select a dataset's `source()` answered (DEC-54). Core
 * names no module table: every field is read as `ds.<name>` of that subquery. The read is one
 * read-only transaction with a 5 second statement timeout (R-8).
 */
export async function runDatasetQuery(
  tenant: TenantContext,
  declaration: DatasetDeclaration,
  source: DatasetSource,
  query: DatasetQuery
): Promise<Pick<DatasetResult, "columns" | "rows" | "truncated">> {
  const ds = source.as("ds");

  const typeOf = (name: string): DatasetFieldType => {
    const field = declaration.fields[name];

    if (field === undefined)
      throw new Error(`Field "${name}" is not declared.`);

    return field.type;
  };

  const field = (name: string) => {
    // The aliased subquery's selection proxy answers each field qualified as `"ds".<column>`,
    // and `undefined` for a key the select does not hold (planning probe).
    const column = ds._.selectedFields[name];

    if (!isSQLWrapper(column)) {
      throw new Error(
        `Dataset "${declaration.name}" source() answers no column "${name}".`
      );
    }

    return column;
  };

  const cast = (name: string) =>
    sql`${field(name)}::${sql.raw(CAST[typeOf(name)])}`;

  const param = (name: string, value: DatasetValue) =>
    sql`${value}::${sql.raw(CAST[typeOf(name)])}`;

  const condition = (filter: DatasetFilter): SQL => {
    const column = cast(filter.field);

    switch (filter.op) {
      case "isNull":
        return sql`${field(filter.field)} is null`;
      case "in":
        return sql`${column} = any(${sql.param(filter.values)}::${sql.raw(CAST[typeOf(filter.field)])}[])`;
      case "between":
        return sql`${column} between ${param(filter.field, filter.from)} and ${param(filter.field, filter.to)}`;
      default: {
        const operator = {
          eq: "=",
          neq: "<>",
          gt: ">",
          gte: ">=",
          lt: "<",
          lte: "<=",
        }[filter.op];

        return sql`${column} ${sql.raw(operator)} ${param(filter.field, filter.value)}`;
      }
    }
  };

  const conditions = (query.filters ?? []).map(condition);

  const group = (entry: DatasetGroup): Output => {
    if ("bucket" in entry) {
      return {
        column: { name: entry.field, type: "date", bucket: entry.bucket },
        // Postgres weeks start on Monday; the bucket answers its first day.
        expression: sql`to_char(date_trunc(${sql.raw(`'${TRUNCATION[entry.bucket]}'`)}, ${cast(entry.field)}::timestamp), 'YYYY-MM-DD')`,
      };
    }

    if ("ranges" in entry) {
      const value = cast(entry.field);

      const whens = entry.ranges.map((range, position) => {
        const bounds = [
          range.min === undefined
            ? undefined
            : sql`${value} >= ${range.min}::numeric`,
          range.max === undefined
            ? undefined
            : sql`${value} < ${range.max}::numeric`,
        ];

        return sql`when ${and(...bounds)} then ${sql.raw(String(position))}`;
      });

      // The bucket is the range's position, so the column sorts in range order; the label
      // replaces it in each row. A value in no range, or a null, is left out.
      const bucket = sql<DatasetValue>`case ${sql.join(whens, sql` `)} end`;

      conditions.push(sql`${bucket} is not null`);

      return {
        column: { name: entry.field, type: "text", bucket: "ranges" },
        expression: bucket,
        labels: entry.ranges.map((range) => range.label),
      };
    }

    const type = typeOf(entry.field);

    return {
      column: { name: entry.field, type },
      expression: answer(cast(entry.field), type),
    };
  };

  const groups = (query.groupBy ?? []).map(group);

  const aggregated = (query.aggregates ?? []).map((aggregate): Output => {
    if (aggregate.fn === "count") {
      return {
        column: { name: aggregate.as, type: "number" },
        expression: answer(
          aggregate.field === undefined
            ? sql`count(*)`
            : sql`count(${field(aggregate.field)})`,
          "number"
        ),
      };
    }

    // SAFETY: validateDatasetQuery refused every aggregate but count without a field.
    const name = aggregate.field ?? "";
    const type = typeOf(name);

    return {
      column: { name: aggregate.as, type },
      expression: answer(
        sql`${sql.raw(AGGREGATE[aggregate.fn])}(${cast(name)})`,
        type
      ),
    };
  });

  const rowColumns = (query.select ?? []).map((name): Output => {
    const type = typeOf(name);

    return {
      column: { name, type },
      expression: answer(cast(name), type),
    };
  });

  const aggregate = query.aggregates !== undefined;
  const outputs = aggregate ? [...groups, ...aggregated] : rowColumns;
  const names = outputs.map((output) => output.column.name);

  // Group and order by output position: Drizzle renders each use of an expression with new
  // parameter numbers, so a repeated CASE would not match its select item (Postgres 42803).
  const groupBy = groups.map((_, index) => String(index + 1)).join(", ");

  const orderBy = query.orderBy?.length
    ? sql.raw(
        query.orderBy
          .map(
            (order) =>
              `${names.indexOf(order.column) + 1} ${DIRECTION[order.direction]}`
          )
          .join(", ")
      )
    : aggregate
      ? groupBy === ""
        ? undefined
        : sql.raw(groupBy)
      : sql`${field(declaration.recordKey.field)}`;

  const limit = query.limit ?? DATASET_ROW_CAP;
  const where = and(...conditions);
  const currencyField = declaration.currencyField;

  const currencyGrouped = (query.groupBy ?? []).some(
    (entry) =>
      entry.field === currencyField &&
      !("bucket" in entry) &&
      !("ranges" in entry)
  );

  // Every money aggregate gets a currency label; only a sum or an average is refused when its
  // rows mix currencies (R-8). A count is a number, not money.
  const moneyAggregates =
    currencyField === undefined || currencyGrouped
      ? []
      : (query.aggregates ?? []).flatMap((entry) =>
          entry.fn !== "count" &&
          entry.field !== undefined &&
          typeOf(entry.field) === "money"
            ? [
                {
                  as: entry.as,
                  field: entry.field,
                  refuses: entry.fn === "sum" || entry.fn === "avg",
                },
              ]
            : []
        );

  const moneyFields = [...new Set(moneyAggregates.map((entry) => entry.field))];

  try {
    return await tenant.db.transaction(
      async (tx) => {
        await tx.execute(
          sql.raw(`set local statement_timeout = ${DATASET_TIME_LIMIT_MS}`)
        );

        const currencyOf = new Map<string, string>();

        if (currencyField !== undefined && moneyFields.length > 0) {
          const currency = field(currencyField);

          // Per money field, only the rows it covers count (amount not null), and a null currency
          // counts as one currency of its own beside the real ones.
          const [check] = await tx
            .select(
              Object.fromEntries(
                moneyFields.flatMap((name, index) => {
                  const covered = sql`${field(name)} is not null`;

                  return [
                    [
                      `currencies${index}`,
                      sql<number>`(count(distinct ${currency}) filter (where ${covered}) + coalesce((bool_or(${currency} is null) filter (where ${covered}))::int, 0))::int`,
                    ],
                    [
                      `currency${index}`,
                      sql<
                        string | null
                      >`min(${currency}) filter (where ${covered})`,
                    ],
                  ];
                })
              )
            )
            .from(ds)
            .where(where);

          const byField = new Map<string, string>();

          moneyFields.forEach((name, index) => {
            const currencies = Number(check?.[`currencies${index}`] ?? 0);

            if (
              currencies > 1 &&
              moneyAggregates.some(
                (entry) => entry.field === name && entry.refuses
              )
            ) {
              throw new AppError(CORE_ERRORS["dataset-mixed-currency"]);
            }

            const one = check?.[`currency${index}`];

            // A min or max over mixed currencies, or over null currencies only, gets no label.
            // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a driver value, text or null
            if (currencies === 1 && typeof one === "string") {
              byField.set(name, one);
            }
          });

          for (const entry of moneyAggregates) {
            const one = byField.get(entry.field);

            if (one !== undefined) currencyOf.set(entry.as, one);
          }
        }

        const selection = Object.fromEntries(
          outputs.map((output) => [output.column.name, output.expression])
        );

        const base = tx.select(selection).from(ds).where(where).$dynamic();

        if (groupBy !== "") base.groupBy(sql.raw(groupBy));

        if (orderBy !== undefined) base.orderBy(orderBy);

        const fetched = await base.limit(limit + 1);

        const rows = fetched.slice(0, limit).map((row) =>
          Object.fromEntries(
            outputs.map((output) => {
              const value = row[output.column.name] ?? null;

              return [
                output.column.name,
                output.labels === undefined
                  ? value
                  : (output.labels[Number(value)] ?? null),
              ];
            })
          )
        );

        const columns = outputs.map(({ column }) => {
          const currency = aggregated.some((entry) => entry.column === column)
            ? currencyOf.get(column.name)
            : undefined;

          return currency === undefined
            ? column
            : { name: column.name, type: column.type, currency };
        });

        return { columns, rows, truncated: fetched.length > limit };
      },
      { accessMode: "read only" }
    );
  } catch (error) {
    if (error instanceof Error && pgErrorCode(error) === QUERY_CANCELED) {
      throw new AppError(CORE_ERRORS["dataset-timeout"], { cause: error });
    }

    throw error;
  }
}
