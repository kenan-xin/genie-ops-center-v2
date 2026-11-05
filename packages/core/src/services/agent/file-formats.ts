import {
  chartRows,
  currencyDigits,
  type ChartColumn,
  type ChartRow,
} from "@genie/ui/chart-data";
import pdfMake from "pdfmake";
import vfs from "pdfmake/build/vfs_fonts.js";
import writeXlsxFile, { type Cell } from "write-excel-file/node";

import { delimitedText } from "./delimited.ts";
import type { FileFormat } from "./file-kinds.ts";

/**
 * The bytes of a chat's list file in one of core's four kinds (R-44a). CSV, Markdown and PDF hold
 * the text that the chat's table shows. Excel holds typed cells, so a person can sum and sort.
 * This module imports the writers, so no browser module imports it.
 */

export type FileTable = {
  readonly title: string;
  readonly columns: readonly ChartColumn[];
  readonly rows: readonly ChartRow[];
};

const MIME_TYPES: Readonly<Record<FileFormat, string>> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  md: "text/markdown",
  pdf: "application/pdf",
};

// The Roboto that pdfmake bundles as code, so the image carries it with no loose font path. It
// covers Greek and accented Latin, which the standard PDF fonts (ANSI only) drop. pdfmake finds a
// font by name in its virtual file system, and a Buffer in `setFonts` breaks its URL step, so the
// two fonts go into that file system first.
const FONT_FILES = ["Roboto-Regular.ttf", "Roboto-Medium.ttf"] as const;

// SAFETY: the Node build of pdfmake 0.3 holds `virtualfs` on the instance (js/base.js), and its
// types declare only the browser's `addVirtualFileSystem`.
const fontFiles = (
  pdfMake as typeof pdfMake & {
    readonly virtualfs: {
      readonly writeFileSync: (name: string, content: Buffer) => void;
    };
  }
).virtualfs;

for (const name of FONT_FILES) {
  fontFiles.writeFileSync(name, Buffer.from(vfs[name] ?? "", "base64"));
}

pdfMake.setFonts({
  Roboto: { normal: "Roboto-Regular.ttf", bold: "Roboto-Medium.ttf" },
});

// A list file reads no URL and no local file.
pdfMake.setUrlAccessPolicy(() => false);

pdfMake.setLocalAccessPolicy(() => false);

/** The title as a file name: whitespace collapsed, at most 80 characters, then the extension. */
export function fileNameOf(title: string, format: FileFormat): string {
  const base = title.replace(/\s+/g, " ").trim().slice(0, 80).trim();

  return `${base === "" ? "Export" : base}.${format}`;
}

function markdownCell(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replace(/\r?\n|\r/g, " ");
}

function markdownLine(cells: readonly string[]): string {
  return `| ${cells.map(markdownCell).join(" | ")} |`;
}

function markdown(table: FileTable): string {
  const { header, rows } = chartRows(table);

  return [
    `# ${table.title}`,
    "",
    markdownLine(header),
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map(markdownLine),
    "",
  ].join("\n");
}

function currencyOf(column: ChartColumn, row: ChartRow): string | null {
  if (column.currency !== undefined) return column.currency;

  const value =
    column.currencyKey === undefined ? null : row[column.currencyKey];

  return value === null || value === undefined ? null : String(value);
}

/** One typed cell: a number as a number, money in major units, a day as a date, the rest as text. */
function excelCell(column: ChartColumn, row: ChartRow): Cell {
  const value = row[column.key] ?? null;

  if (value === null) return null;

  if (column.type === "number") {
    return { type: Number, value: Number(value) };
  }

  if (column.type === "money") {
    const currency = currencyOf(column, row);

    const digits = currency === null ? 2 : currencyDigits(currency);

    return {
      type: Number,
      value: Number(value) / 10 ** digits,
      format: digits === 0 ? "#,##0" : `#,##0.${"0".repeat(digits)}`,
    };
  }

  if (column.type === "date") {
    return {
      type: Date,
      value: new Date(`${String(value)}T00:00:00Z`),
      format: "d mmm yyyy",
    };
  }

  if (column.type === "boolean") {
    return { type: String, value: value === true ? "Yes" : "No" };
  }

  // A String cell is never a formula, so "=1+1" stays text.
  return { type: String, value: String(value) };
}

/** Excel's sheet name: at most 31 characters, none of []:*?/\. */
function sheetName(title: string): string {
  const name = title
    .replace(/[[\]:*?/\\]/g, " ")
    .trim()
    .slice(0, 31);

  return name === "" ? "Export" : name;
}

async function excel(table: FileTable): Promise<Buffer> {
  const { header } = chartRows({ ...table, rows: [] });

  const data: Cell[][] = [
    header.map((label) => ({ type: String, value: label, fontWeight: "bold" })),
    ...table.rows.map((row) =>
      table.columns.map((column) => excelCell(column, row))
    ),
  ];

  return writeXlsxFile(data, { sheet: sheetName(table.title) }).toBuffer();
}

async function pdf(table: FileTable): Promise<Buffer> {
  const { header, rows } = chartRows(table);

  return pdfMake
    .createPdf({
      pageSize: "A4",
      pageOrientation: header.length > 5 ? "landscape" : "portrait",
      defaultStyle: { font: "Roboto", fontSize: 9 },
      content: [
        { text: table.title, bold: true, fontSize: 14, margin: [0, 0, 0, 8] },
        {
          table: {
            headerRows: 1,
            body: [
              header.map((label) => ({ text: label, bold: true })),
              ...rows.map((cells) => cells.slice()),
            ],
          },
          layout: "lightHorizontalLines",
        },
      ],
    })
    .getBuffer();
}

export async function fileBytes(
  format: FileFormat,
  table: FileTable
): Promise<{ readonly bytes: Buffer; readonly mimeType: string }> {
  const mimeType = MIME_TYPES[format];

  switch (format) {
    case "csv":
      return {
        bytes: Buffer.from(delimitedText(chartRows(table), ","), "utf8"),
        mimeType,
      };
    case "md":
      return { bytes: Buffer.from(markdown(table), "utf8"), mimeType };
    case "xlsx":
      return { bytes: await excel(table), mimeType };
    case "pdf":
      return { bytes: await pdf(table), mimeType };
  }
}
