import { lowerCase, lowerFirst, upperFirst } from "es-toolkit";

import type { DatasetFieldType } from "../../lib/module-contract/module.ts";
import type { DatasetColumn, DatasetSummary } from "../datasets/index.ts";
import type { DatasetQuery } from "../datasets/query.ts";

/** "recordedOn" reads "Recorded on", and a money "amountCents" reads "Amount". */
function inWords(name: string, type: DatasetFieldType): string {
  const words = lowerCase(name);

  return upperFirst(type === "money" ? words.replace(/ cents$/, "") : words);
}

function extremeWord(fn: "min" | "max", type: DatasetFieldType): string {
  const dated = type === "date" || type === "instant";

  if (fn === "min") return dated ? "Earliest" : "Lowest";

  return dated ? "Latest" : "Highest";
}

/**
 * The header a person reads for a column (D33): `avg`, `min` and `max` read a word and the field's
 * label, a `sum` or a `count` keeps its alias in words because the alias carries its meaning, and
 * a plain field reads its declared label, else its name in words.
 */
export function columnLabel(
  column: Pick<DatasetColumn, "name" | "type">,
  fields: DatasetSummary["fields"],
  aggregates?: DatasetQuery["aggregates"]
): string {
  const aggregate = aggregates?.find((entry) => entry.as === column.name);

  if (aggregate !== undefined) {
    const { fn, field } = aggregate;

    if (field === undefined || fn === "sum" || fn === "count") {
      return inWords(column.name, column.type);
    }

    const declared = fields[field];

    const label = lowerFirst(
      declared?.label ?? inWords(field, declared?.type ?? column.type)
    );

    const word = fn === "avg" ? "Average" : extremeWord(fn, column.type);

    return `${word} ${label}`;
  }

  return fields[column.name]?.label ?? inWords(column.name, column.type);
}
