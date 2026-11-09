import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import {
  bulletsWithTwoVisualsSlide,
  deckPage,
  hiddenSlide,
  imageSlide,
  largeKpiSlide,
  longestSlide,
  tableWithVisualSlide,
  textOnlySlide,
  textWithChartSlide,
  titleOnlySlide,
} from "./__fixtures__/decks.ts";
import { SlideCanvas } from "./slide-canvas.tsx";

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const TITLE_ONLY = "Cash in moved ahead of the plan this quarter";

const phone = { viewport: { value: "phone390", isRotated: false } };

const meta = {
  title: "Modules/Slides/Slide canvas",
  component: SlideCanvas,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "One slide at 960 x 540 (Spec 7 R-52, D10), scaled to the width of its container, so a phone and a desktop show the same slide. The title is the claim of R-56 under a 4 px rule in the tenant color; a figure, chart or table draws the one `@genie/ui/chart` part and the footer names the figures date and the company. A data element whose dataset the person can no longer read draws a note in its place (D15).",
      },
    },
    a11y: { test: "error" },
  },
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SlideCanvas>;

export default meta;

type Story = StoryObj<typeof meta>;

const canvasProps = {
  figuresAsOf: deckPage.deck.figuresAsOf,
  timeZone: deckPage.timeZone,
  theme: deckPage.theme,
  logoUrl: deckPage.logoUrl,
  images: deckPage.deck.images,
};

/** The overflow of one element, or null when its content fits. */
function overflowOf(element: HTMLElement): string | null {
  if (element.scrollWidth > element.clientWidth + 1) return "horizontally";

  if (element.scrollHeight > element.clientHeight + 1) return "vertically";

  return null;
}

/**
 * B4.2: no box clips its content, and no child that clips or scrolls hides content either, at
 * either viewport. A chart's table sits in a scrolling box, so the box's own size is not enough.
 */
async function noOverflow(canvasElement: HTMLElement) {
  const failures: string[] = [];

  for (const element of canvasElement.querySelectorAll<HTMLElement>(
    "[data-slide-box]"
  )) {
    const label = element.dataset["slideBox"] ?? "box";
    const own = overflowOf(element);

    if (own !== null) failures.push(`${label} overflows ${own}`);

    for (const child of element.querySelectorAll<HTMLElement>("*")) {
      // The 1 x 1 sr-only node of a table caption clips on purpose; it is not slide content.
      if (child.clientWidth <= 1 && child.clientHeight <= 1) continue;

      const style = getComputedStyle(child);

      const clips = [style.overflowX, style.overflowY].some(
        (value) => value !== "visible"
      );

      const overflow = clips ? overflowOf(child) : null;

      if (overflow !== null) {
        failures.push(
          `${label} hides content inside ${child.tagName.toLowerCase()} (${overflow})`
        );
      }
    }
  }

  await expect(failures).toEqual([]);
}

/** The number of line boxes a text node draws; a wrapped KPI value has more than one. */
function lineCount(element: HTMLElement): number {
  const range = document.createRange();

  range.selectNodeContents(element);

  return range.getClientRects().length;
}

/** A dark blue slide: a white centered title, and a white bordered text in its own box (S7-43). */
const styledSlide = {
  ...textWithChartSlide,
  background: "#1E3A8A",
  elements: textWithChartSlide.elements.map((element, index) => {
    if (index === 0) {
      return {
        ...element,
        style: { color: "#FFFFFF", align: "center" as const },
      };
    }

    if (element.kind === "text") {
      return {
        ...element,
        box: { x: 96, y: 192, w: 320, h: 160 },
        style: {
          color: "#FFFFFF",
          weight: "semibold" as const,
          border: { color: "#F59E0B", width: 4 as const },
        },
      };
    }

    return element;
  }),
};

const styledPlay: Story["play"] = async ({ canvasElement }) => {
  const slide = canvasElement.querySelector<HTMLElement>("[data-slide-canvas]");

  const title = canvasElement.querySelector<HTMLElement>(
    '[data-slide-box="title"] p'
  );

  const text = canvasElement.querySelector<HTMLElement>(
    '[data-slide-box="text"]'
  );

  const footer = canvasElement.querySelector<HTMLElement>("footer span");

  await expect(getComputedStyle(slide!).backgroundColor).toBe(
    "rgb(30, 58, 138)"
  );
  await expect(getComputedStyle(title!).color).toBe("rgb(255, 255, 255)");
  await expect(getComputedStyle(title!).textAlign).toBe("center");

  const textStyle = getComputedStyle(text!);

  // The stored box, in canvas pixels before the scale.
  await expect(textStyle.left).toBe("96px");
  await expect(textStyle.top).toBe("192px");
  await expect(textStyle.borderTopWidth).toBe("4px");
  await expect(textStyle.borderTopColor).toBe("rgb(245, 158, 11)");
  await expect(textStyle.paddingTop).toBe("12px");
  await expect(getComputedStyle(text!.querySelector("p")!).fontWeight).toBe(
    "600"
  );

  // A chart keeps the theme's text, so on a background it draws on the theme background (P13-6).
  const chart = canvasElement.querySelector<HTMLElement>(
    '[data-slide-box="chart"]'
  );

  await expect(getComputedStyle(chart!).backgroundColor).toBe(
    "rgb(255, 255, 255)"
  );
  // The footer on a background takes the one foreground rule (white on dark blue).
  await expect(getComputedStyle(footer!).color).toBe("rgb(255, 255, 255)");
};

// S7-43: the background, each box and each style draw as stored, on screen and in present mode.
export const Styled: Story = {
  name: "Styled slide",
  args: { ...canvasProps, slide: styledSlide },
  globals: desktop,
  play: styledPlay,
};

export const StyledOnPhone: Story = {
  name: "Styled slide on a phone",
  args: { ...canvasProps, slide: styledSlide },
  globals: phone,
  play: styledPlay,
};

const longestPlay: Story["play"] = async ({ canvasElement }) => {
  await noOverflow(canvasElement);
};

export const TitleOnly: Story = {
  args: { ...canvasProps, slide: titleOnlySlide },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("group", { name: TITLE_ONLY })).toBeVisible();
    await expect(canvas.queryByText(/Figures as of/)).toBeNull();
    await expect(canvas.getByText("Genie Ops")).toBeVisible();
    await noOverflow(canvasElement);
  },
};

// czjw.46: a logo whose link expired draws no broken image, and the company name still shows.
export const BrokenLogo: Story = {
  name: "Broken logo",
  args: {
    ...canvasProps,
    logoUrl: "data:image/png;base64,bm90LWFuLWltYWdl",
    slide: titleOnlySlide,
  },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector("footer img")).toBeNull()
    );
    await expect(canvas.getByText("Genie Ops")).toBeVisible();
  },
};

export const TitleOnlyOnPhone: Story = {
  name: "Title only on a phone",
  args: { ...canvasProps, slide: titleOnlySlide },
  globals: phone,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("group", { name: TITLE_ONLY })).toBeVisible();
    await noOverflow(canvasElement);
  },
};

// B4.4: a data slide names its freeze date and the chart names its source. 7.4: the axis labels
// take the base size (15 px on the default root), never the 12 px that read as tiny on a slide.
export const TextWithChart: Story = {
  name: "Text with a chart",
  args: { ...canvasProps, slide: textWithChartSlide },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Figures as of 27 Oct 2026")).toBeVisible();
    await expect(
      canvas.getByText(/Source: placeholder\.records/)
    ).toBeVisible();
    await noOverflow(canvasElement);

    const tick = await waitFor(() => {
      const element = canvasElement.querySelector<SVGElement>(
        "[data-slide-box] .recharts-cartesian-axis-tick-value"
      );

      expect(element).not.toBeNull();

      return element!;
    });

    await expect(
      Number.parseFloat(getComputedStyle(tick).fontSize)
    ).toBeGreaterThanOrEqual(15);
  },
};

export const TextWithChartOnPhone: Story = {
  name: "Text with a chart on a phone",
  args: { ...canvasProps, slide: textWithChartSlide },
  globals: phone,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Figures as of 27 Oct 2026")).toBeVisible();
    await expect(
      canvas.getByText(/Source: placeholder\.records/)
    ).toBeVisible();
    await noOverflow(canvasElement);
  },
};

export const BulletsWithTwoVisuals: Story = {
  name: "Bullets with two visuals",
  args: { ...canvasProps, slide: bulletsWithTwoVisualsSlide },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("list")).toBeVisible();
    await expect(
      canvas.getByRole("img", {
        name: "A photograph of the finance team meeting at a table.",
      })
    ).toBeVisible();
    await noOverflow(canvasElement);
  },
};

export const BulletsWithTwoVisualsOnPhone: Story = {
  name: "Bullets with two visuals on a phone",
  args: { ...canvasProps, slide: bulletsWithTwoVisualsSlide },
  globals: phone,
  play: async ({ canvasElement }) => {
    await noOverflow(canvasElement);
  },
};

// B4.5: a chart the person can no longer read shows a note and draws no chart.
export const HiddenElement: Story = {
  name: "Hidden element",
  args: { ...canvasProps, slide: hiddenSlide },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("note")).toHaveTextContent(
      "You can no longer read the data of this chart."
    );
    await expect(canvas.queryByRole("figure")).toBeNull();
    await noOverflow(canvasElement);
  },
};

export const HiddenElementOnPhone: Story = {
  name: "Hidden element on a phone",
  args: { ...canvasProps, slide: hiddenSlide },
  globals: phone,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("note")).toHaveTextContent(
      "You can no longer read the data of this chart."
    );
    await expect(canvas.queryByRole("figure")).toBeNull();
    await noOverflow(canvasElement);
  },
};

export const Image: Story = {
  args: { ...canvasProps, slide: imageSlide },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("img", {
        name: "A photograph of the finance team meeting at a table.",
      })
    ).toBeVisible();
    await noOverflow(canvasElement);
  },
};

// I1: an image whose link has not arrived draws its placeholder, never an `img` with no source.
export const ImageBeforeItsLink: Story = {
  name: "Image before its link",
  args: { ...canvasProps, images: {}, slide: imageSlide },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelector("img")).toBeNull();
    await expect(
      canvas.getByRole("img", {
        name: "A photograph of the finance team meeting at a table.",
      })
    ).toBeVisible();
  },
};

export const ImageOnPhone: Story = {
  name: "Image on a phone",
  args: { ...canvasProps, slide: imageSlide },
  globals: phone,
  play: async ({ canvasElement }) => {
    await noOverflow(canvasElement);
  },
};

// B4.2: the longest title, bullets and table the schema allows all fit their boxes.
export const LongestContent: Story = {
  name: "Longest content",
  args: { ...canvasProps, slide: longestSlide },
  globals: desktop,
  play: longestPlay,
};

export const LongestContentOnPhone: Story = {
  name: "Longest content on a phone",
  args: { ...canvasProps, slide: longestSlide },
  globals: phone,
  play: longestPlay,
};

export const TextOnly: Story = {
  name: "Text only",
  args: { ...canvasProps, slide: textOnlySlide },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByText(/Figures as of/)).toBeNull();
    await noOverflow(canvasElement);
  },
};

export const TextOnlyOnPhone: Story = {
  name: "Text only on a phone",
  args: { ...canvasProps, slide: textOnlySlide },
  globals: phone,
  play: async ({ canvasElement }) => {
    await noOverflow(canvasElement);
  },
};

// I1: a six-figure KPI stays on one line in the 260 px box of two visuals.
const largeKpiPlay: Story["play"] = async ({ canvas, canvasElement }) => {
  await noOverflow(canvasElement);

  const box = canvasElement.querySelector<HTMLElement>(
    '[data-slide-box="figure"]'
  );

  await expect(box?.clientWidth).toBe(260);

  const value = canvas.getByText("SGD 141,200.00");

  await expect(lineCount(value)).toBe(1);

  // 7.4: the value sits right under its label, never centred far below it. Canvas px, so the
  // check holds at the phone's scale too.
  const label = box!.querySelector<HTMLElement>("figure > div")!;
  const scale = box!.getBoundingClientRect().width / box!.clientWidth;

  // The text's own line, not its element: a full-height element centres the text inside it.
  const text = document.createRange();

  text.selectNodeContents(value);

  const gap =
    (text.getBoundingClientRect().top - label.getBoundingClientRect().bottom) /
    scale;

  await expect(gap).toBeLessThanOrEqual(16);
};

export const LargeKpi: Story = {
  name: "Large KPI",
  args: { ...canvasProps, slide: largeKpiSlide },
  globals: desktop,
  play: largeKpiPlay,
};

export const LargeKpiOnPhone: Story = {
  name: "Large KPI on a phone",
  args: { ...canvasProps, slide: largeKpiSlide },
  globals: phone,
  play: largeKpiPlay,
};

// I1: a 12 x 5 table takes the wide visual column, never a 260 px one.
const tableWithVisualPlay: Story["play"] = async ({ canvasElement }) => {
  await noOverflow(canvasElement);

  const box = canvasElement.querySelector<HTMLElement>(
    '[data-slide-box="table"]'
  );

  await expect(box?.clientWidth).toBe(536);
};

export const TableWithVisual: Story = {
  name: "Table with a visual",
  args: { ...canvasProps, slide: tableWithVisualSlide },
  globals: desktop,
  play: tableWithVisualPlay,
};

export const TableWithVisualOnPhone: Story = {
  name: "Table with a visual on a phone",
  args: { ...canvasProps, slide: tableWithVisualSlide },
  globals: phone,
  play: tableWithVisualPlay,
};
