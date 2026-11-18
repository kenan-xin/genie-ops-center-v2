import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { cn } from "cn";
import { useState } from "react";
import { expect, userEvent, waitFor } from "storybook/test";

import { Button, horizontalStrip, horizontalStripWheel } from "../index.ts";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A row as a place builds it: the strip's classes beside its own, and the strip's wheel ref. */
function HorizontalStrip(props: {
  readonly label: string;
  readonly months: readonly string[];
  /** A place's own classes, for example a column from `md`. */
  readonly className?: string;
}) {
  return (
    <ul
      ref={horizontalStripWheel}
      aria-label={props.label}
      className={cn(horizontalStrip, "flex gap-2 py-1.5", props.className)}
    >
      {props.months.map((month) => (
        <li key={month} className="shrink-0">
          <Button variant="secondary" size="sm">
            {month}
          </Button>
        </li>
      ))}
    </ul>
  );
}

const meta = {
  title: "UI/HorizontalStrip",
  component: HorizontalStrip,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One row that scrolls sideways: the slide strip, the filter chips and the Branding tab row. A horizontal swipe scrolls the row and never hands the swipe to the page at its ends (`overscroll-behavior-x: contain`, `touch-action: pan-x pan-y`). A vertical mouse wheel over the row scrolls it sideways while it can move that way, and scrolls the page at either end or when the row does not overflow. A trackpad's sideways scroll is left to the browser. A place puts `horizontalStrip` beside its own classes and `horizontalStripWheel` as the element's ref; a column from `md` that does not scroll sideways (`md:overflow-visible`) leaves the wheel to the page.",
      },
    },
  },
  globals: { viewport: { value: "phone390", isRotated: false } },
  args: { label: "Months", months: MONTHS },
} satisfies Meta<typeof HorizontalStrip>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A wheel event as a mouse sends it; a synthetic event scrolls nothing by itself. */
function wheel(strip: HTMLElement, init: WheelEventInit): WheelEvent {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...init,
  });

  strip.dispatchEvent(event);

  return event;
}

/** T20-a: a vertical wheel over a strip that can still move scrolls it sideways, not the page. */
export const WheelScrollsSideways: Story = {
  play: async ({ canvas }) => {
    const strip = canvas.getByRole("list", { name: "Months" });

    await expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth);

    const down = wheel(strip, { deltaY: 100 });

    await expect(strip.scrollLeft).toBe(100);
    // A cancelled wheel leaves the page where it is.
    await expect(down.defaultPrevented).toBe(true);

    const up = wheel(strip, { deltaY: -40 });

    await expect(strip.scrollLeft).toBe(60);
    await expect(up.defaultPrevented).toBe(true);
  },
};

/** T20-b: at either end, with no overflow, or with a sideways delta, the wheel goes on to the page. */
export const WheelScrollsThePageAtTheEnds: Story = {
  render: () => (
    <div className="grid gap-4">
      <HorizontalStrip label="Months" months={MONTHS} />
      <HorizontalStrip label="Short" months={["May"]} />
      {/* A strip that turns into a column, as the slide rail from 768 px: its content still
          reaches past its box, but it does not scroll. */}
      <HorizontalStrip
        label="Column"
        months={MONTHS}
        className="min-w-0 overflow-visible"
      />
    </div>
  ),
  play: async ({ canvas }) => {
    const strip = canvas.getByRole("list", { name: "Months" });

    await expect(wheel(strip, { deltaY: -100 }).defaultPrevented).toBe(false);
    await expect(strip.scrollLeft).toBe(0);

    // A trackpad sends its own sideways delta; the browser scrolls the strip with it.
    await expect(
      wheel(strip, { deltaX: 30, deltaY: 10 }).defaultPrevented
    ).toBe(false);
    await expect(strip.scrollLeft).toBe(0);

    const end = strip.scrollWidth - strip.clientWidth;

    strip.scrollLeft = end;

    await expect(wheel(strip, { deltaY: 100 }).defaultPrevented).toBe(false);
    await expect(strip.scrollLeft).toBe(end);

    const short = canvas.getByRole("list", { name: "Short" });

    await expect(wheel(short, { deltaY: 100 }).defaultPrevented).toBe(false);

    const column = canvas.getByRole("list", { name: "Column" });

    await expect(column.scrollWidth).toBeGreaterThan(column.clientWidth);
    await expect(wheel(column, { deltaY: 100 }).defaultPrevented).toBe(false);
  },
};

/** T20-c: the strip keeps a sideways swipe to itself, also at its ends. */
export const SwipeStaysInTheStrip: Story = {
  play: async ({ canvas }) => {
    const style = getComputedStyle(
      canvas.getByRole("list", { name: "Months" })
    );

    await expect(style.overscrollBehaviorX).toBe("contain");
    await expect(style.touchAction).toBe("pan-x pan-y");
  },
};

/** A strip of fixed 80 px boxes in a 300 px row, so its overflow does not hang on a font. */
function Boxes(props: { readonly label: string; readonly count: number }) {
  return (
    <ul
      ref={horizontalStripWheel}
      aria-label={props.label}
      className={cn(horizontalStrip, "flex w-75 gap-2")}
    >
      {Array.from({ length: props.count }, (_, item) => (
        <li key={item} className="w-20 shrink-0">
          <Button variant="secondary" size="sm" className="w-full">
            {item + 1}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** A strip that the page fills later, as the slide strip while Ask drafts slides. */
function GrowingBoxes() {
  const [count, setCount] = useState(2);

  return (
    <div className="grid gap-2">
      <Boxes label="Boxes" count={count} />
      <Button size="sm" onClick={() => setCount(12)}>
        Add ten
      </Button>
    </div>
  );
}

/** czjw.176: while more of the row lies past its end, the strip is marked and fades that edge. */
export const ShowsMoreAtTheEnd: Story = {
  render: () => <Boxes label="Boxes" count={12} />,
  play: async ({ canvas }) => {
    const strip = canvas.getByRole("list", { name: "Boxes" });

    await waitFor(() => expect(strip).toHaveAttribute("data-strip-more"));
    await expect(getComputedStyle(strip).maskImage).not.toBe("none");

    strip.scrollLeft = strip.scrollWidth - strip.clientWidth;

    await waitFor(() => expect(strip).not.toHaveAttribute("data-strip-more"));
    await expect(getComputedStyle(strip).maskImage).toBe("none");
  },
};

/** czjw.176: a strip with no overflow is marked once items join it past its end. */
export const MarksItemsAddedLater: Story = {
  render: () => <GrowingBoxes />,
  play: async ({ canvas }) => {
    const strip = canvas.getByRole("list", { name: "Boxes" });

    await expect(strip).not.toHaveAttribute("data-strip-more");

    await userEvent.click(canvas.getByRole("button", { name: "Add ten" }));

    await waitFor(() => expect(strip).toHaveAttribute("data-strip-more"));
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
