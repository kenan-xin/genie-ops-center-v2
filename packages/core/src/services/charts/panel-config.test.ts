import { describe, expect, it } from "vitest";

import { CHART_TYPES, checkPanelConfig } from "./panel-config.ts";

const count = { aggregates: [{ fn: "count", as: "n" }] };

const monthly = {
  groupBy: [{ field: "recordedOn", bucket: "month" }],
  ...count,
};

const base = { name: "Records", dataset: "placeholder.records" };

const cartesian = { ...base, query: monthly, x: "recordedOn", y: "n" };

const minimal = {
  kpi: {
    type: "kpi",
    title: "Records",
    series: [{ ...base, query: count, value: "n" }],
  },
  bar: { type: "bar", title: "Records", series: [cartesian] },
  line: { type: "line", title: "Records", series: [cartesian] },
  area: { type: "area", title: "Records", series: [cartesian] },
  donut: {
    type: "donut",
    title: "Records",
    series: [
      {
        ...base,
        query: { groupBy: [{ field: "label" }], ...count },
        category: "label",
        value: "n",
      },
    ],
  },
  table: {
    type: "table",
    title: "Records",
    series: [{ ...base, query: { select: ["label"] } }],
  },
};

const barSeries = (length: number) =>
  Array.from({ length }, (_, index) => ({
    ...cartesian,
    name: `S${index + 1}`,
  }));

const { y: _y, ...withoutY } = cartesian;

describe("checkPanelConfig", () => {
  it.each(CHART_TYPES)("accepts the minimal %s config", (type) =>
    expect(checkPanelConfig(minimal[type]).issues).toEqual([])
  );

  it("accepts a bar chart of 8 series", () =>
    expect(
      checkPanelConfig({ ...minimal.bar, series: barSeries(8) }).issues
    ).toEqual([]));

  it.each<readonly [string, unknown, string, string]>([
    [
      "an unknown panel key",
      { ...minimal.bar, stacked: true },
      "stacked",
      'Remove "stacked". A bar chart takes only: type, title, series.',
    ],
    [
      "an unknown series key",
      { ...minimal.bar, series: [{ ...cartesian, color: "red" }] },
      "series.0.color",
      'Remove "color". A bar series takes only: name, dataset, query, x, y.',
    ],
    [
      "a missing axis field",
      { ...minimal.bar, series: [withoutY] },
      "series.0.y",
      'Add "y".',
    ],
    [
      "an unknown chart type",
      { ...minimal.bar, type: "pie" },
      "type",
      "Use one of: kpi, bar, line, area, donut, table.",
    ],
    [
      "a ninth series",
      { ...minimal.bar, series: barSeries(9) },
      "series",
      "A bar chart draws 1 to 8 series.",
    ],
    [
      "a second KPI series",
      {
        ...minimal.kpi,
        series: [...minimal.kpi.series, ...minimal.kpi.series],
      },
      "series",
      "A kpi chart draws one series.",
    ],
    [
      "a series named x",
      { ...minimal.bar, series: [{ ...cartesian, name: "x" }] },
      "series.0.name",
      'Rename the series: "x" names the x-axis.',
    ],
    [
      "a blank title",
      { ...minimal.bar, title: "  " },
      "title",
      '"title" cannot be blank.',
    ],
  ])("refuses %s and names the fix", (_, input, path, message) =>
    expect(checkPanelConfig(input)).toEqual({ issues: [{ path, message }] })
  );
});
