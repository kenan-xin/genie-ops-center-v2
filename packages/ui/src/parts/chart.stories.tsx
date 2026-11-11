import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { chartColors, type ThemeName } from "../theme/tokens.ts";
import { axisLabelIndexes } from "./chart-axis.ts";
import { formatChartValue } from "./chart-data.ts";
import { Chart, type ChartProps } from "./chart.tsx";

const invoiced = {
  kind: "bar",
  title: "Invoiced and collected",
  x: { key: "x", label: "Recorded on", type: "date", bucket: "month" },
  columns: [
    { key: "Invoiced", label: "Invoiced", type: "money", currency: "EUR" },
    // A name with a space and brackets is a valid series name, never a data key.
    {
      key: "Collected (EUR)",
      label: "Collected (EUR)",
      type: "money",
      currency: "EUR",
    },
  ],
  rows: [
    { "x": "2026-01-01", "Invoiced": 150_000, "Collected (EUR)": 90_000 },
    { "x": "2026-02-01", "Invoiced": 120_000, "Collected (EUR)": null },
    { "x": "2026-03-01", "Invoiced": 80_000, "Collected (EUR)": 100_000 },
  ],
  datasets: ["placeholder.records"],
  readAt: "2026-10-30T06:05:00Z",
  truncated: false,
  timeZone: "UTC",
} as const satisfies ChartProps;

const meta = {
  title: "UI/Chart",
  component: Chart,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The one chart of Analytics, Slides and chat (Spec 7 R-16), on the shadcn Chart. It draws the `ChartData` that the core chart gate answers: series in the fixed slots `--chart-1` to `--chart-8` (tokens.md, "Chart series colors"), a Chart and a Table view, and a caption that names the sources by title (the dataset names for a stored chart without them) and the read time, or only the sources with `caption="source"`. A multi-series chart shows its legend above the plot, and a KPI with `change` shows a neutral change line against the prior period. No rows show the compact empty state. A table whose `recordPaths` names a row\'s page links that row\'s first cell, and on a phone its card title, through `linkComponent`; a row without a page stays plain text. The x axis labels the first and the last point, and the points between at an even step from the first, without one closer to the last than a step. Import it from `@genie/ui/chart`, so a page with no chart never loads Recharts.',
      },
    },
  },
  args: invoiced,
} satisfies Meta<typeof Chart>;

export default meta;

type Story = StoryObj<typeof meta>;

const CAPTION = "Source: placeholder.records · Read 30 Oct 2026, 06:05";

/** The computed form of a slot color, as `getComputedStyle` answers it. */
function slotColor(theme: ThemeName, slot: number): string {
  const hex = chartColors[theme][slot - 1] ?? "";

  const channels = [1, 3, 5].map((at) =>
    Number.parseInt(hex.slice(at, at + 2), 16)
  );

  return `rgb(${channels.join(", ")})`;
}

function themeOf(theme: string | undefined): ThemeName {
  return theme === "dark" ? "dark" : "light";
}

function noPageScroll() {
  return expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth
  );
}

const barPlay: Story["play"] = async ({ canvas, canvasElement, globals }) => {
  const theme = themeOf(globals["theme"]);

  // ResponsiveContainer measures before it draws.
  const series = await waitFor(() => {
    const layers = canvasElement.querySelectorAll(".recharts-bar-rectangles");

    expect(layers).toHaveLength(2);

    return [...layers];
  });

  // Every bar of a series wears its slot: January and March of "Collected (EUR)", 3 of "Invoiced".
  const fills = series.map((layer) =>
    [...layer.querySelectorAll("path")].map((bar) => getComputedStyle(bar).fill)
  );

  await expect(fills).toEqual([
    Array.from({ length: 3 }, () => slotColor(theme, 1)),
    Array.from({ length: 2 }, () => slotColor(theme, 2)),
  ]);

  const legend = canvasElement.querySelector<HTMLElement>(
    ".recharts-legend-wrapper"
  );

  await expect(legend).not.toBeNull();
  await expect(within(legend!).getByText("Invoiced")).toBeVisible();
  await expect(within(legend!).getByText("Collected (EUR)")).toBeVisible();

  // Recharts 3 keyboard layer: focus opens the tooltip on the first month, an arrow key moves it.
  const chart = canvas.getByRole("application", {
    name: "Invoiced and collected",
  });

  const tooltip = (text: string) =>
    waitFor(() => {
      const box = canvasElement.querySelector<HTMLElement>(
        ".recharts-tooltip-wrapper"
      );

      expect(box).toHaveTextContent(text);

      return box!;
    });

  chart.focus();

  const january = await tooltip("Jan 2026");

  await expect(january).toHaveTextContent("Invoiced€1,500.00");
  await expect(january).toHaveTextContent("Collected (EUR)€900.00");

  await userEvent.keyboard("{ArrowRight}");

  const february = await tooltip("Feb 2026");

  // February has no collected value: the tooltip leaves it out, never 0.
  await expect(february).toHaveTextContent("Invoiced€1,200.00");
  await expect(february).not.toHaveTextContent("Collected");
  await expect(canvas.getByText(CAPTION)).toBeVisible();
};

export const Bar: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: barPlay,
};

/** A legend at the top of every multi-series chart, so it shows before the plot (6.2). */
export const TwoSeriesLegend: Story = {
  name: "Two series, legend on top",
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvasElement }) => {
    const [legend, plot] = await waitFor(() => {
      const found = [
        canvasElement.querySelector(".recharts-legend-wrapper"),
        canvasElement.querySelector(".recharts-cartesian-grid"),
      ];

      expect(found).not.toContain(null);

      // SAFETY: the line above checked that both elements exist.
      return found as [Element, Element];
    });

    await expect(legend.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      plot.getBoundingClientRect().top
    );
  },
};

export const BarDark: Story = {
  globals: { viewport: { value: "desktop", isRotated: false }, theme: "dark" },
  play: barPlay,
};

const phonePlay: Story["play"] = async ({ canvas, canvasElement }) => {
  await waitFor(() =>
    expect(
      canvasElement.querySelector(".recharts-bar-rectangles")
    ).not.toBeNull()
  );
  await noPageScroll();

  await userEvent.click(canvas.getByRole("tab", { name: "Table" }));
  await expect(
    canvas.getByRole("list", { name: "Invoiced and collected" })
  ).toBeVisible();
  await noPageScroll();
};

export const BarPhone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: phonePlay,
};

/** The phone cards name a column's one currency once, above the list (design review 5.5). */
export const TableCardsOneCurrency: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Table" }));

    const list = canvas.getByRole("list", { name: "Invoiced and collected" });

    await expect(canvas.getByText("Amounts in EUR")).toBeVisible();
    await expect(within(list).getByText("1,500.00")).toBeVisible();
    await expect(within(list).queryByText(/€/)).toBeNull();
  },
};

export const BarPhoneDark: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false }, theme: "dark" },
  play: phonePlay,
};

const line = {
  ...invoiced,
  kind: "line",
  title: "Invoiced by month",
  columns: [invoiced.columns[0]],
} as const satisfies ChartProps;

const linePlay: Story["play"] = async ({ canvas, canvasElement, globals }) => {
  const curve = await waitFor(() => {
    const path = canvasElement.querySelector<SVGPathElement>(
      ".recharts-line-curve"
    );

    expect(path).not.toBeNull();

    return path!;
  });

  await expect(getComputedStyle(curve).stroke).toBe(
    slotColor(themeOf(globals["theme"]), 1)
  );
  // The axis label is the compact month; the tooltip and the table keep "Jan 2026".
  await expect(canvas.getByText("Jan 26")).toBeVisible();
};

export const Line: Story = {
  args: line,
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: linePlay,
};

export const LineDark: Story = {
  args: line,
  globals: { viewport: { value: "desktop", isRotated: false }, theme: "dark" },
  play: linePlay,
};

// The marks code is the line's, so these stories render and run axe only.
const area = { ...line, kind: "area" } as const satisfies ChartProps;

export const Area: Story = {
  args: area,
  globals: { viewport: { value: "desktop", isRotated: false } },
};

export const AreaDark: Story = {
  args: area,
  globals: { viewport: { value: "desktop", isRotated: false }, theme: "dark" },
};

const emptyPlay: Story["play"] = async ({ canvas, canvasElement }) => {
  await expect(canvas.getByText("No data")).toBeVisible();
  await expect(canvas.getByText("No records match this chart.")).toBeVisible();
  await expect(canvas.getByText(CAPTION)).toBeVisible();
  await expect(canvasElement.querySelector(".recharts-surface")).toBeNull();
};

export const Empty: Story = {
  args: { ...invoiced, rows: [] },
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: emptyPlay,
};

export const EmptyDark: Story = {
  args: { ...invoiced, rows: [] },
  globals: { viewport: { value: "desktop", isRotated: false }, theme: "dark" },
  play: emptyPlay,
};

const outstanding = {
  ...invoiced,
  kind: "donut",
  title: "Outstanding by customer",
  x: { key: "x", label: "Customer", type: "text" },
  columns: [
    {
      key: "Outstanding",
      label: "Outstanding",
      type: "money",
      currency: "EUR",
    },
  ],
  rows: [
    { x: "Acme", Outstanding: 50_000 },
    { x: "Globex", Outstanding: 30_000 },
    { x: null, Outstanding: 20_000 },
  ],
} as const satisfies ChartProps;

const donutPlay: Story["play"] = async ({ canvasElement, globals }) => {
  const theme = themeOf(globals["theme"]);

  const parts = await waitFor(() => {
    const sectors = canvasElement.querySelectorAll(".recharts-pie-sector path");

    expect(sectors).toHaveLength(3);

    return [...sectors];
  });

  // Parts take the slots in row order, so a part keeps its color while the rows keep their order.
  await expect(parts.map((part) => getComputedStyle(part).fill)).toEqual([
    slotColor(theme, 1),
    slotColor(theme, 2),
    slotColor(theme, 3),
  ]);

  const legend = canvasElement.querySelector<HTMLElement>(
    ".recharts-legend-wrapper"
  );

  await expect(legend).not.toBeNull();
  await expect(
    within(legend!)
      .getAllByRole("listitem")
      .map((item) => item.textContent)
  ).toEqual(["Acme", "Globex", "No value"]);
};

export const Donut: Story = {
  args: outstanding,
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: donutPlay,
};

export const DonutDark: Story = {
  args: outstanding,
  globals: { viewport: { value: "desktop", isRotated: false }, theme: "dark" },
  play: donutPlay,
};

const { x: _x, ...noAxis } = outstanding;

const kpi = {
  ...noAxis,
  kind: "kpi",
  title: "Outstanding",
  rows: [{ Outstanding: 1_234_567 }],
} as const satisfies ChartProps;

const kpiPlay: Story["play"] = async ({ canvas }) => {
  const value = canvas.getByText("€12,345.67");

  await expect(value).toBeVisible();
  await expect(
    canvas.getByText("Outstanding").getBoundingClientRect().bottom
  ).toBeLessThanOrEqual(value.getBoundingClientRect().top);
  await expect(canvas.queryByRole("tab")).toBeNull();
};

export const Kpi: Story = {
  args: kpi,
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: kpiPlay,
};

/**
 * A dashboard KPI: the source by title without the read time, which the page names once (6.1),
 * and the change against the prior period.
 */
export const KpiSourceOnly: Story = {
  name: "KPI, source only, with its change",
  args: {
    ...kpi,
    sources: ["Records"],
    caption: "source",
    change: { previous: 1_000_000, label: "September" },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("+23.5% on September")).toBeVisible();
    await expect(
      canvas.getByText("Source: Records", { exact: true })
    ).toBeVisible();
    await expect(canvas.queryByText(/Read /)).toBeNull();
  },
};

export const KpiDark: Story = {
  args: kpi,
  globals: { viewport: { value: "desktop", isRotated: false }, theme: "dark" },
  play: kpiPlay,
};

const records = {
  ...noAxis,
  kind: "table",
  title: "Records",
  columns: [
    { key: "label", label: "Label", type: "text" },
    {
      key: "amountCents",
      label: "Amount",
      type: "money",
      currencyKey: "currency",
    },
    { key: "currency", label: "Currency", type: "text" },
  ],
  rows: [
    { label: "A", amountCents: 1500, currency: "EUR" },
    { label: "B", amountCents: 700, currency: "USD" },
  ],
} as const satisfies ChartProps;

const tablePlay: Story["play"] = async ({ canvas }) => {
  const table = canvas.getByRole("table");

  await expect(
    within(table).getByRole("cell", { name: "€15.00" })
  ).toBeVisible();
  await expect(
    within(table).getByRole("cell", { name: "US$7.00" })
  ).toBeVisible();
};

export const Table: Story = {
  args: records,
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: tablePlay,
};

export const TableDark: Story = {
  args: records,
  globals: { viewport: { value: "desktop", isRotated: false }, theme: "dark" },
  play: tablePlay,
};

// Row B has no page for this person, so it stays plain text and never a dead link. Row C has a
// page but no label, so it stays plain text and never a link without a name. The label is `x`,
// because the meta's `x` reaches every story and would take the first column.
const linked = {
  ...records,
  x: { key: "label", label: "Label", type: "text" },
  columns: records.columns.slice(1),
  rows: [...records.rows, { label: null, amountCents: 300, currency: "EUR" }],
  recordPaths: ["/placeholder/a", null, "/placeholder/c"],
} as const satisfies ChartProps;

export const TableRecordLinks: Story = {
  args: linked,
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas }) => {
    const table = canvas.getByRole("table");
    const link = within(table).getByRole("link", { name: "A" });

    await expect(link).toHaveAttribute("href", "/placeholder/a");
    // A linked row reads different from a plain row (R-44).
    await expect(link).toHaveStyle({ textDecorationLine: "underline" });
    await expect(within(table).queryByRole("link", { name: "B" })).toBeNull();
    await expect(within(table).getByRole("cell", { name: "B" })).toBeVisible();
    await expect(within(table).getAllByRole("link")).toHaveLength(1);
  },
};

export const TableRecordLinksPhone: Story = {
  args: linked,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    const list = canvas.getByRole("list", { name: "Records" });

    await expect(within(list).getByRole("link", { name: "A" })).toHaveAttribute(
      "href",
      "/placeholder/a"
    );
    await expect(within(list).queryByRole("link", { name: "B" })).toBeNull();
    await expect(within(list).getAllByRole("link")).toHaveLength(1);
  },
};

const tableViewPlay: Story["play"] = async ({ canvas }) => {
  // From the keyboard: Tab to the tabs, move to "Table" and choose it.
  await userEvent.tab();
  await expect(canvas.getByRole("tab", { name: "Chart" })).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  await expect(canvas.getByRole("tab", { name: "Table" })).toHaveFocus();
  await userEvent.keyboard("{Enter}");

  const table = await canvas.findByRole("table");

  await expect(
    within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent)
  ).toEqual(["Recorded on", "Invoiced", "Collected (EUR)", "Actions"]);

  const february = within(table)
    .getAllByRole("row")
    .find((row) => row.textContent?.includes("Feb 2026"));

  await expect(february).toBeDefined();

  // A missing value is an empty cell, never 0.
  await expect(
    within(february!)
      .getAllByRole("cell")
      .map((cell) => cell.textContent)
  ).toEqual(["Feb 2026", "€1,200.00", "", ""]);
  await expect(canvas.getByText(CAPTION)).toBeVisible();
};

export const TableView: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: tableViewPlay,
};

export const TableViewDark: Story = {
  globals: { viewport: { value: "desktop", isRotated: false }, theme: "dark" },
  play: tableViewPlay,
};

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

// A slide's body box is 536 x 348, so the chart fills the height its slide gives it (F1).
const SLIDE_FRAME = { width: "100%", maxWidth: 536, height: 348 } as const;

const slideChart = { ...invoiced, slide: true } as const satisfies ChartProps;

const slideChartPlay: Story["play"] = async ({ canvas, canvasElement }) => {
  // A slide chooses the kind, so there are no Chart and Table tabs.
  await expect(canvas.queryByRole("tab")).toBeNull();
  await waitFor(() =>
    expect(
      canvasElement.querySelector(".recharts-bar-rectangles")
    ).not.toBeNull()
  );

  const figure = canvas.getByRole("figure", {
    name: "Invoiced and collected",
  });

  await expect(Math.abs(figure.clientHeight - 348)).toBeLessThanOrEqual(1);
  await expect(canvas.getByText(CAPTION)).toBeVisible();
};

const slideFrame = (args: ChartProps) => (
  <div style={SLIDE_FRAME}>
    <Chart {...args} />
  </div>
);

/** A currency shown as its code makes the longest tick, for example "SGD 60k". */
const sgdSlideChart = {
  ...slideChart,
  columns: [
    { key: "Invoiced", label: "Invoiced", type: "money", currency: "SGD" },
  ],
  rows: [
    { x: "2026-05-01", Invoiced: 34_900 },
    { x: "2026-06-01", Invoiced: 58_200 },
  ],
} as const satisfies ChartProps;

/**
 * A slide's labels take the base size, so the fixed 60 px axis cut "SGD 60k" at its left edge
 * (Phase 10 captures): every tick starts inside the plot.
 */
export const SlideChartLongTicks: Story = {
  name: "Slide chart with long axis labels",
  args: sgdSlideChart,
  globals: desktop,
  render: slideFrame,
  play: async (context) => longTicksPlay(context),
};

/**
 * A phone scales the 960 px slide canvas with a CSS transform. A measured axis width reads the
 * scaled labels and comes out too small, so the labels must fit at a scale of 0.4 too.
 */
export const SlideChartLongTicksScaled: Story = {
  name: "Slide chart with long axis labels, scaled as on a phone",
  args: sgdSlideChart,
  globals: desktop,
  render: (args) => (
    <div className="origin-top-left scale-40">{slideFrame(args)}</div>
  ),
  play: async (context) => longTicksPlay(context),
};

const longTicksPlay: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  const plot = await waitFor(() => {
    const element = canvasElement.querySelector("svg.recharts-surface");

    expect(element).not.toBeNull();

    return element!;
  });

  const lefts = await waitFor(() => {
    const found = [
      ...canvasElement.querySelectorAll(".recharts-cartesian-axis-tick-value"),
    ].map((tick) => tick.getBoundingClientRect().left);

    expect(found.length).toBeGreaterThan(0);

    return found;
  });

  await expect(Math.min(...lefts)).toBeGreaterThanOrEqual(
    plot.getBoundingClientRect().left
  );
};

export const SlideChart: Story = {
  args: slideChart,
  globals: desktop,
  render: slideFrame,
  play: slideChartPlay,
};

export const SlideChartOnPhone: Story = {
  name: "Slide chart on a phone",
  args: slideChart,
  globals: phone,
  render: slideFrame,
  play: async (context) => {
    await slideChartPlay(context);
    await noPageScroll();
  },
};

/** Monthly SGD sales from `from` (an ISO month), as the Ask panel draws them (czjw.106). */
function monthlySales(from: string, count: number): ChartProps {
  const start = new Date(`${from}-01T00:00:00Z`);

  return {
    ...sgdSlideChart,
    slide: false,
    title: "Invoiced sales by month (SGD)",
    rows: Array.from({ length: count }, (_, index) => {
      const month = new Date(start);

      month.setUTCMonth(start.getUTCMonth() + index);

      return {
        x: month.toISOString().slice(0, 10),
        Invoiced: 12_345_600 + index * 1_250_000,
      };
    }),
  };
}

/**
 * The axis rule (czjw.144): the first and the last month always keep a label, the months between
 * step evenly from the first, no two labels overlap and every label stays inside the chart.
 * Recharts kept only one end and hid the rest at random (czjw.106). `minimum` keeps a sample taken
 * before the label width is measured, which shows only the first and the last label, from passing.
 */
const axisRulePlay =
  (count: number, minimum: number): NonNullable<Story["play"]> =>
  async ({ args, canvasElement }) => {
    // The months, as the axis names them.
    const months = args.rows.map((row) =>
      formatChartValue(args.x!, row["x"] ?? null, { compact: true })
    );

    await expect(months).toHaveLength(count);

    await waitFor(() => {
      const labels = [
        ...canvasElement.querySelectorAll(
          ".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value"
        ),
      ];

      expect(labels.length).toBeGreaterThanOrEqual(minimum);

      const texts = labels.map((label) => label.textContent);
      const step = months.indexOf(texts[1] ?? "");

      expect(texts).toEqual(
        axisLabelIndexes(count, step).map((index) => months[index])
      );

      const boxes = labels.map((label) => label.getBoundingClientRect());

      // The gap from each label to the one before it.
      const gaps = boxes
        .slice(1)
        .map((box, index) => box.left - boxes[index]!.right);

      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0);

      const surface = canvasElement
        .querySelector("svg.recharts-surface")!
        .getBoundingClientRect();

      expect(Math.min(...boxes.map((box) => box.left))).toBeGreaterThanOrEqual(
        surface.left
      );
      expect(Math.max(...boxes.map((box) => box.right))).toBeLessThanOrEqual(
        surface.right
      );

      noPageScroll();
    });
  };

// The Ask artifact panel's body: `w-120` less its 1 px border and `p-4`, in 16 px rem units.
const panelFrame = (args: ChartProps) => (
  <div style={{ width: 447 }}>
    <Chart {...args} />
  </div>
);

export const SixMonthsInThePanel: Story = {
  name: "Six months in the Ask panel",
  args: monthlySales("2026-05", 6),
  globals: desktop,
  render: panelFrame,
  play: axisRulePlay(6, 6),
};

export const SixMonthsOnPhone: Story = {
  name: "Six months on a phone",
  args: monthlySales("2026-05", 6),
  globals: phone,
  play: axisRulePlay(6, 6),
};

export const TwelveMonthsInThePanel: Story = {
  name: "Twelve months in the Ask panel",
  args: monthlySales("2025-11", 12),
  globals: desktop,
  render: panelFrame,
  play: axisRulePlay(12, 6),
};

export const TwelveMonthsOnPhone: Story = {
  name: "Twelve months on a phone",
  args: monthlySales("2025-11", 12),
  globals: phone,
  play: axisRulePlay(12, 4),
};

/** A line's last point sits on the plot's right edge, so its label must still fit the chart. */
export const TwelveMonthsLineOnPhone: Story = {
  name: "Twelve months as a line on a phone",
  args: { ...monthlySales("2025-11", 12), kind: "line" },
  globals: phone,
  play: axisRulePlay(12, 4),
};

export const SixMonthsOnAPhoneTile: Story = {
  name: "Six months on a phone dashboard tile",
  args: monthlySales("2026-05", 6),
  globals: phone,
  // 390 px less the 16 px page padding and the 16 px card padding on each side (czjw.145).
  render: (args) => (
    <div style={{ width: 326 }}>
      <Chart {...args} />
    </div>
  ),
  play: axisRulePlay(6, 3),
};

/**
 * A phone scales the slide canvas to 0.4 with a CSS transform, so a label width read from the
 * scaled box comes out too small and the labels overlap.
 */
export const TwelveMonthsOnAScaledSlide: Story = {
  name: "Twelve months on a slide scaled as on a phone",
  args: { ...monthlySales("2025-11", 12), slide: true },
  globals: desktop,
  render: (args) => (
    <div className="origin-top-left scale-40">{slideFrame(args)}</div>
  ),
  play: axisRulePlay(12, 4),
};

const slideTable = { ...records, slide: true } as const satisfies ChartProps;

const slideTablePlay: Story["play"] = async ({ canvas }) => {
  await expect(canvas.queryByRole("tab")).toBeNull();

  const table = canvas.getByRole("table", { name: "Records" });

  await expect(
    within(table).getByRole("cell", { name: "€15.00" })
  ).toBeVisible();
  // At a phone viewport it is still a table, never the card list (F1).
  await expect(canvas.queryByRole("list", { name: "Records" })).toBeNull();
};

export const SlideTable: Story = {
  args: slideTable,
  globals: desktop,
  render: slideFrame,
  play: slideTablePlay,
};

export const SlideTableOnPhone: Story = {
  name: "Slide table on a phone",
  args: slideTable,
  globals: phone,
  render: slideFrame,
  play: async (context) => {
    await slideTablePlay(context);
    await noPageScroll();
  },
};
