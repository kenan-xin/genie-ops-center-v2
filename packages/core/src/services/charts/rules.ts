import type { ChartColumn, ChartData } from "@genie/ui";

import type { AppErrorIssue } from "../../lib/errors/index.ts";
import type { DatasetQuery } from "../datasets/query.ts";
import { CHART_SERIES_LIMIT, type PanelConfig } from "./panel-config.ts";

/**
 * The chart-type rules of the chart gate (Spec 7 R-15). `queryRuleIssues` runs before any query,
 * and `dataIssues` on the columns and rows the queries answered. No rows never fails a rule.
 */

/** The columns a checked query answers: its group fields, then its aggregates. */
function answered(query: DatasetQuery): readonly string[] {
  return [
    ...(query.groupBy ?? []).map((group) => group.field),
    ...(query.aggregates ?? []).map((aggregate) => aggregate.as),
  ];
}

function notAnswered(
  path: string,
  name: string,
  query: DatasetQuery
): AppErrorIssue {
  return {
    path,
    message: `Field "${name}" is not a column of this query. It answers: ${answered(query).join(", ")}.`,
  };
}

function isAggregate(query: DatasetQuery, name: string): boolean {
  return (query.aggregates ?? []).some((aggregate) => aggregate.as === name);
}

/** The rules a panel config meets before any query runs. */
export function queryRuleIssues(config: PanelConfig): readonly AppErrorIssue[] {
  const issues: AppErrorIssue[] = [];

  switch (config.type) {
    case "bar":
    case "line":
    case "area":
      config.series.forEach((series, index) => {
        const at = `series.${index}`;
        const { query } = series;
        const groups = query.groupBy ?? [];

        if (query.aggregates === undefined || query.select !== undefined) {
          issues.push({
            path: `${at}.query`,
            message: `A ${config.type} chart needs an aggregate query grouped by its x field, with no select.`,
          });

          return;
        }

        if (groups.length !== 1) {
          issues.push({
            path: `${at}.query.groupBy`,
            message: `A ${config.type} chart groups by exactly one field, its x field.`,
          });

          return;
        }

        if (groups[0]?.field !== series.x) {
          issues.push(notAnswered(`${at}.x`, series.x, query));
        }

        if (!isAggregate(query, series.y)) {
          issues.push(notAnswered(`${at}.y`, series.y, query));
        }

        const order = query.orderBy ?? [];

        if (
          config.type !== "bar" &&
          order.length > 0 &&
          (order.length !== 1 ||
            order[0]?.column !== series.x ||
            order[0].direction !== "asc")
        ) {
          issues.push({
            path: `${at}.query.orderBy`,
            message: `A ${config.type} chart draws x in ascending order. Order by "${series.x}" ascending, or remove orderBy.`,
          });
        }
      });

      return issues;
    case "donut": {
      const [series] = config.series;
      const { query } = series;
      const groups = query.groupBy ?? [];

      if (
        query.select !== undefined ||
        groups.length !== 1 ||
        groups[0]?.field !== series.category
      ) {
        issues.push({
          path: "series.0.category",
          message: `A donut groups by one field, its category "${series.category}", with no select.`,
        });
      }

      const aggregate = query.aggregates?.find(
        (entry) => entry.as === series.value
      );

      if (aggregate === undefined) {
        issues.push(notAnswered("series.0.value", series.value, query));
      } else if (aggregate.fn !== "sum" && aggregate.fn !== "count") {
        issues.push({
          path: "series.0.value",
          message: `A donut adds its parts up to a whole. Use sum or count for "${series.value}".`,
        });
      }

      // Every part, in a fixed order, so the parts are the whole and keep their colors.
      if (query.orderBy !== undefined) {
        issues.push({
          path: "series.0.query.orderBy",
          message: "A donut shows every part in a fixed order. Remove orderBy.",
        });
      }

      if (query.limit !== undefined) {
        issues.push({
          path: "series.0.query.limit",
          message: "A donut shows every part of the whole. Remove limit.",
        });
      }

      return issues;
    }

    case "kpi": {
      const [series] = config.series;
      const { query } = series;

      if ((query.groupBy ?? []).length > 0) {
        issues.push({
          path: "series.0.query.groupBy",
          message: "A KPI shows one value. Remove groupBy.",
        });
      }

      if (query.select !== undefined) {
        issues.push({
          path: "series.0.query.select",
          message: "A KPI shows one aggregate. Remove select.",
        });
      }

      if (!isAggregate(query, series.value)) {
        issues.push(notAnswered("series.0.value", series.value, query));
      }

      return issues;
    }

    case "table":
      return issues;
  }
}

const hasValue = (data: ChartData, column: ChartColumn) =>
  data.rows.some((row) => (row[column.key] ?? null) !== null);

/** The rules the answered columns and rows meet. */
export function dataIssues(
  config: PanelConfig,
  data: ChartData
): readonly AppErrorIssue[] {
  const issues: AppErrorIssue[] = [];
  const { type } = config;

  if (type === "table") {
    for (const column of data.columns) {
      if (
        column.type === "money" &&
        column.currency === undefined &&
        column.currencyKey === undefined &&
        hasValue(data, column)
      ) {
        issues.push({
          path: "series.0.query",
          message: `Column "${column.label}" holds amounts with no currency. Select the dataset's currency field too.`,
        });
      }
    }

    return issues;
  }

  const cartesian = type === "bar" || type === "line" || type === "area";

  const valuePath = (index: number) =>
    cartesian ? `series.${index}.y` : "series.0.value";

  if ((type === "bar" || type === "donut") && data.x?.type === "money") {
    issues.push({
      path: type === "bar" ? "series.0.x" : "series.0.category",
      message: `A ${type} chart cannot group by an amount. Group by a date, a number, ranges or a text field.`,
    });
  }

  if (
    (type === "line" || type === "area") &&
    data.x !== undefined &&
    data.x.type !== "date" &&
    data.x.type !== "number" &&
    data.x.bucket !== "ranges"
  ) {
    issues.push({
      path: "series.0.x",
      message: `A ${type} chart needs an ordered x-axis. Group x by a date, a number or ranges.`,
    });
  }

  const plotted = data.columns.every(
    (column) => column.type === "number" || column.type === "money"
  );

  data.columns.forEach((column, index) => {
    if (column.type !== "number" && column.type !== "money") {
      issues.push({
        path: valuePath(index),
        message: `"${column.label}" is ${column.type}. A chart plots number or money values.`,
      });
    } else if (
      column.type === "money" &&
      column.currency === undefined &&
      hasValue(data, column)
    ) {
      issues.push({
        path: valuePath(index),
        message: `"${column.label}" holds amounts in more than one currency, or in none. Filter one currency.`,
      });
    }
  });

  // No second y-axis: every series shares one type, and one currency for money.
  const [first] = data.columns;

  if (cartesian && plotted && first !== undefined) {
    const priced = data.columns.find((column) => column.currency !== undefined);

    const index = data.columns.findIndex(
      (column) =>
        column.type !== first.type ||
        (column.currency !== undefined && column.currency !== priced?.currency)
    );

    const other = data.columns[index];

    if (other !== undefined) {
      issues.push({
        path: valuePath(index),
        message:
          other.type === first.type && priced !== undefined
            ? `Every series shares one y-axis. "${priced.label}" is in ${priced.currency} and "${other.label}" is in ${other.currency}. Filter one currency.`
            : `Every series shares one y-axis. "${first.label}" is ${first.type} and "${other.label}" is ${other.type}.`,
      });
    }
  }

  if (type === "donut") {
    if (data.rows.length > CHART_SERIES_LIMIT) {
      issues.push({
        path: "series.0.category",
        message: `A donut shows at most ${CHART_SERIES_LIMIT} parts, and this query answers ${data.rows.length}. Filter the query, or group by a field with fewer values.`,
      });
    }

    const negative = data.columns.some((column) =>
      data.rows.some((row) => Number(row[column.key] ?? 0) < 0)
    );

    if (negative) {
      issues.push({
        path: "series.0.value",
        message:
          "A donut shows parts of one whole, so no part can be below 0. Filter out the negative parts.",
      });
    }
  }

  return issues;
}
