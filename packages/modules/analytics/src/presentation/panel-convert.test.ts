import {
  type DatasetQuery,
  type PanelConfig,
  panelConfigSchema,
} from "@genie/core";
import { describe, expect, it } from "vitest";

import { convertibleTypes, convertPanel } from "./panel-convert.ts";

const query = (): DatasetQuery => ({
  aggregates: [{ fn: "sum", field: "totalCents", as: "total" }],
});

const cartesian = (
  type: "bar" | "line" | "area",
  x = "invoiceDate",
  y = "total"
): PanelConfig => ({
  type,
  title: "Sales",
  series: [
    { name: "Invoiced", dataset: "invoices.invoices", query: query(), x, y },
  ],
});

const twoSeriesBar = (): PanelConfig => ({
  type: "bar",
  title: "Sales",
  series: [
    {
      name: "Invoiced",
      dataset: "invoices.invoices",
      query: query(),
      x: "invoiceDate",
      y: "total",
    },
    {
      name: "Paid",
      dataset: "invoices.invoices",
      query: query(),
      x: "invoiceDate",
      y: "paid",
    },
  ],
});

const donut = (): PanelConfig => ({
  type: "donut",
  title: "Sales",
  series: [
    {
      name: "Invoiced",
      dataset: "invoices.invoices",
      query: query(),
      category: "customerName",
      value: "total",
    },
  ],
});

const kpi = (): PanelConfig => ({
  type: "kpi",
  title: "Sales",
  series: [
    {
      name: "Invoiced",
      dataset: "invoices.invoices",
      query: query(),
      value: "total",
    },
  ],
});

const table = (): PanelConfig => ({
  type: "table",
  title: "Sales",
  series: [{ name: "Invoiced", dataset: "invoices.invoices", query: query() }],
});

describe("convertibleTypes", () => {
  it("offers a bar with two series line and area, without donut or table", () => {
    expect(convertibleTypes(twoSeriesBar())).toEqual(["line", "area"]);
  });

  it("offers a one-series bar line, area, donut and table", () => {
    expect(convertibleTypes(cartesian("bar"))).toEqual([
      "line",
      "area",
      "donut",
      "table",
    ]);
  });

  it("offers a donut bar, line, area and table", () => {
    expect(convertibleTypes(donut())).toEqual(["bar", "line", "area", "table"]);
  });

  it("offers a KPI only table", () => {
    expect(convertibleTypes(kpi())).toEqual(["table"]);
  });

  it("offers a table no type", () => {
    expect(convertibleTypes(table())).toEqual([]);
  });
});

describe("convertPanel", () => {
  it("keeps every series when a bar becomes a line", () => {
    const source = twoSeriesBar();
    const converted = convertPanel(source, "line");

    expect(converted).toEqual({ ...source, type: "line" });
    expect(panelConfigSchema.safeParse(converted).success).toBe(true);
  });

  it("converts a one-series bar to a donut with x as category and y as value", () => {
    const converted = convertPanel(
      cartesian("bar", "customerName", "total"),
      "donut"
    );

    expect(converted).toEqual({
      type: "donut",
      title: "Sales",
      series: [
        {
          name: "Invoiced",
          dataset: "invoices.invoices",
          query: query(),
          category: "customerName",
          value: "total",
        },
      ],
    });
    expect(panelConfigSchema.safeParse(converted).success).toBe(true);
  });

  it("drops x and y when a one-series area becomes a table", () => {
    const converted = convertPanel(cartesian("area"), "table");

    expect(converted).toEqual({
      type: "table",
      title: "Sales",
      series: [
        { name: "Invoiced", dataset: "invoices.invoices", query: query() },
      ],
    });
    expect(panelConfigSchema.safeParse(converted).success).toBe(true);
  });

  it("converts a donut to a bar with category as x and value as y", () => {
    const converted = convertPanel(donut(), "bar");

    expect(converted).toEqual({
      type: "bar",
      title: "Sales",
      series: [
        {
          name: "Invoiced",
          dataset: "invoices.invoices",
          query: query(),
          x: "customerName",
          y: "total",
        },
      ],
    });
    expect(panelConfigSchema.safeParse(converted).success).toBe(true);
  });

  it("converts a KPI to a table without its value", () => {
    const converted = convertPanel(kpi(), "table");

    expect(converted).toEqual({
      type: "table",
      title: "Sales",
      series: [
        { name: "Invoiced", dataset: "invoices.invoices", query: query() },
      ],
    });
    expect(panelConfigSchema.safeParse(converted).success).toBe(true);
  });

  it("refuses a conversion that convertibleTypes does not offer", () => {
    expect(() => convertPanel(table(), "bar")).toThrow();
    expect(() => convertPanel(cartesian("bar"), "bar")).toThrow();
  });
});
