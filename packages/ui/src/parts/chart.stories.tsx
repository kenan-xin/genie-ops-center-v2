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
          'The one chart of Analytics, Slides and chat (Spec 7 R-16), on the shadcn Chart. It draws the `ChartData` that the core chart gate answers: series in the fixed slots `--chart-1` to `--chart-8` (tokens.md, "Chart series colors"), a Chart and a Table view, and a caption that names the dataset and the read time. No rows show the compact empty state. Import it from `@genie/ui/chart`, so a page with no chart never loads Recharts.',
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
