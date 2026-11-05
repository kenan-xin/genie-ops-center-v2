import type { ChartColumn } from "@genie/ui/chart-data";
import { parse } from "papaparse";
import { readSheet } from "read-excel-file/node";
import { extractText } from "unpdf";
import { describe, expect, it } from "vitest";

import { fileBytes, type FileTable } from "./file-formats.ts";

const name: ChartColumn = { key: "name", label: "Name", type: "text" };

describe("fileBytes", () => {
  it("escapes a formula cell in CSV and keeps a negative amount as a number", async () => {
    const table: FileTable = {
      title: "Balances",
      columns: [
        name,
        { key: "balance", label: "Balance", type: "money", currency: "SGD" },
      ],
      rows: [{ name: '=HYPERLINK("x")', balance: -650_000 }],
    };

    const { bytes, mimeType } = await fileBytes("csv", table);

    expect(mimeType).toBe("text/csv");
    expect(parse(bytes.toString("utf8")).data).toEqual([
      ["Name", "Balance (SGD)"],
      [`'=HYPERLINK("x")`, "-6,500.00"],
    ]);
  });

  it("keeps a cell with a pipe and a line break as one Markdown table cell", async () => {
    const table: FileTable = {
      title: "Records",
      columns: [name, { key: "note", label: "Note", type: "text" }],
      rows: [{ name: "A|B\nC", note: "back\\slash" }],
    };

    const { bytes } = await fileBytes("md", table);

    expect(bytes.toString("utf8")).toBe(
      [
        "# Records",
        "",
        "| Name | Note |",
        "| --- | --- |",
        "| A\\|B C | back\\\\slash |",
        "",
      ].join("\n")
    );
  });

  it("writes typed Excel cells: money in major units, a date, and a formula as text", async () => {
    const table: FileTable = {
      title: "Invoices",
      columns: [
        name,
        {
          key: "total",
          label: "Total",
          type: "money",
          currencyKey: "currency",
        },
        { key: "currency", label: "Currency", type: "text" },
        { key: "issuedOn", label: "Issued on", type: "date" },
      ],
      rows: [
        {
          name: "=1+1",
          total: 120_000,
          currency: "SGD",
          issuedOn: "2026-10-01",
        },
      ],
    };

    const { bytes } = await fileBytes("xlsx", table);

    const [header, row] = await readSheet(bytes);

    expect(header).toEqual(["Name", "Total", "Currency", "Issued on"]);
    expect(row).toEqual([
      "=1+1",
      1200,
      "SGD",
      new Date("2026-10-01T00:00:00Z"),
    ]);
  });

  it("prints every row of a long list over its PDF pages, with Greek and accented names", async () => {
    const labels = [
      "Ελλάδα Trading",
      "Société Générale",
      ...Array.from({ length: 118 }, (_, index) => `Customer ${index + 1}`),
    ];

    const table: FileTable = {
      title: "All customers",
      columns: [name],
      rows: labels.map((label) => ({ name: label })),
    };

    const { bytes, mimeType } = await fileBytes("pdf", table);

    expect(mimeType).toBe("application/pdf");

    const { totalPages, text } = await extractText(new Uint8Array(bytes));

    const lines = new Set(text.flatMap((page) => page.split("\n")));

    expect(totalPages).toBeGreaterThan(1);
    expect(text[0]).toContain("All customers");
    expect(labels.filter((label) => !lines.has(label))).toEqual([]);
  });
});
