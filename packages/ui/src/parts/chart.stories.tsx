import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { chartColors, type ThemeName } from "../theme/tokens.ts";
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
          "The one chart of Analytics, Slides and chat (Spec 7 R-16), on the shadcn Chart. It draws the `ChartData` that the core chart gate answers: series in the fixed slots `--chart-1` to `--chart-8` (tokens.md, \"Chart series colors\"), a Chart and a Table view, and a caption that names the dataset and the read time. No rows show the compact empty state. A table whose `recordPaths` names a row's page links that row's first cell, and on a phone its card title, through `linkComponent`; a row without a page stays plain text. Import it from `@genie/ui/chart`, so a page with no chart never loads Recharts.",
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
  await expect(canvas.getByText("Jan 2026")).toBeVisible();
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

// Row B has no page for this person, so it stays plain text and never a dead link. The label is
// `x`, because the meta's `x` reaches every story and would take the first column.
const linked = {
  ...records,
  x: { key: "label", label: "Label", type: "text" },
  columns: records.columns.slice(1),
  recordPaths: ["/placeholder/a", null],
} as const satisfies ChartProps;

export const TableRecordLinks: Story = {
  args: linked,
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: async ({ canvas }) => {
    const table = canvas.getByRole("table");

    await expect(
      within(table).getByRole("link", { name: "A" })
    ).toHaveAttribute("href", "/placeholder/a");
    await expect(within(table).queryByRole("link", { name: "B" })).toBeNull();
    await expect(within(table).getByRole("cell", { name: "B" })).toBeVisible();
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
