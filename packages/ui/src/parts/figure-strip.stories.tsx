import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { FigureStrip, StatusPill } from "../index.ts";

const meta = {
  title: "UI/FigureStrip",
  component: FigureStrip,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The header strip of figures under a page header (Section 7 redesign, part 2): no card, a hairline below. One figure can lead in large type with a status pill beside its value. Each figure is a `dt` label and a `dd` value; the status and the note follow as their own `dd`, so the first `dd` after a label is always the value. Below `md` the figures take two columns and the lead spans both.",
      },
    },
  },
  args: {
    label: "Figures",
    figures: [
      {
        label: "Outstanding",
        value: "SGD 2,000.00",
        lead: true,
        status: <StatusPill tone="danger">Overdue</StatusPill>,
        note: "Due 27 Oct 2026",
      },
      { label: "Total", value: "SGD 5,200.00" },
      { label: "Allocated", value: "SGD 3,200.00" },
    ],
  },
} satisfies Meta<typeof FigureStrip>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The value a reader of `dt` then the first `dd` gets, as the dev e2e helper `fact()` reads it. */
function factOf(root: HTMLElement, label: string): string | null {
  const term = within(root).getByText(label, { selector: "dt" });
  let next = term.nextElementSibling;

  while (next !== null && next.tagName !== "DD") next = next.nextElementSibling;

  return next?.textContent ?? null;
}

/** A record's strip: Outstanding leads with its pill and due date, the totals follow. */
export const Record: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("region", { name: "Figures" })).toBeVisible();
    await expect(factOf(canvasElement, "Outstanding")).toBe("SGD 2,000.00");
    await expect(factOf(canvasElement, "Total")).toBe("SGD 5,200.00");
    await expect(canvas.getByText("Overdue")).toBeVisible();
    await expect(canvas.getByText("Due 27 Oct 2026")).toBeVisible();
  },
};

/** Large amounts with a pill fit a 390 px phone without sideways scroll. */
export const LongValuesPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  args: {
    figures: [
      {
        label: "Outstanding",
        value: "SGD 1,234,567.89",
        lead: true,
        status: <StatusPill tone="warning">Partly paid</StatusPill>,
        note: "Due 27 Oct 2026",
      },
      { label: "Total", value: "SGD 12,345,678.90" },
      { label: "Allocated", value: "SGD 11,111,111.01" },
    ],
  },
  play: async ({ canvas }) => {
    const strip = canvas.getByRole("region", { name: "Figures" });

    await expect(strip.scrollWidth).toBeLessThanOrEqual(strip.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    );
  },
};

/**
 * At 1440 px the four figures of a record share one row, as the prototype draws them. The page
 * column is 1100 px wide there: the window less the rail and the page padding.
 */
export const OneRowOnDesktop: Story = {
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  decorators: [
    (Story) => (
      <div className="w-[1100px]">
        <Story />
      </div>
    ),
  ],
  args: {
    figures: [
      {
        label: "Outstanding",
        value: "SGD 5,200.00",
        lead: true,
        status: <StatusPill tone="danger">Overdue · 40 days</StatusPill>,
      },
      { label: "Total", value: "SGD 7,200.00" },
      { label: "Allocated", value: "SGD 2,000.00" },
      { label: "Due date", value: "17 Sep 2026", note: "From the document" },
    ],
  },
  play: async ({ canvas }) => {
    const strip = canvas.getByRole("region", { name: "Figures" });

    const bottoms = [...strip.querySelectorAll("dl > div")].map((figure) =>
      Math.round(figure.getBoundingClientRect().bottom)
    );

    // One row: every figure ends on the same line (the strip aligns them at the bottom).
    await expect(new Set(bottoms).size).toBe(1);
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
