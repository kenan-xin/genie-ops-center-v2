import type { ChartTextRows } from "@genie/ui/chart-data";
// papaparse is CommonJS, so plain Node (the worker, the ops command) reads it only as a default import.
import Papa from "papaparse";

/**
 * A cell that a spreadsheet would run as a formula gets a leading `'` (CSV injection). A plain
 * number such as "-6,500.00" stays as it is, which papaparse's default pattern would also mark.
 */
export const FORMULA = /^[=+\-@\t\r](?![\d.,]*$)/;

/** The rows as CSV or tab-separated text: the panel's Copy and Download, and a chat's CSV file. */
export function delimitedText(
  rows: ChartTextRows,
  delimiter: "," | "\t"
): string {
  return Papa.unparse(
    { fields: [...rows.header], data: rows.rows.map((row) => [...row]) },
    { delimiter, escapeFormulae: FORMULA }
  );
}
