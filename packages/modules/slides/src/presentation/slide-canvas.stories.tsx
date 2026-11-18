import { chartColors } from "@genie/ui/tokens";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import type { SlideTheme } from "../contract.ts";
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
  textWithTableSlide,
  titleOnlySlide,
  twoFiguresSlide,
} from "./__fixtures__/decks.ts";
import {
  BLUE_THEME,
  DARK_THEME,
  GREEN_THEME,
  VIOLET_THEME,
} from "./__fixtures__/themes.ts";
import { SlideCanvas } from "./slide-canvas.tsx";
import type { Box } from "./slide-layout.ts";
import type { ShownElement, ShownSlide } from "./views.ts";

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
          'One slide at 960 x 540 (Spec 7 R-52, D10), scaled to the width of its container, so a phone and a desktop show the same slide. It draws in its deck theme (czjw.183). The first slide with a title and a text is the title slide, and a later one is a statement slide. Every other slide is a split slide, with the brand panel at the left and a footer: "Figures as of <date>", the logo and "<company> · <n> / <count>". A figure, chart or table draws the one `@genie/ui/chart` part. A data element whose dataset the person can no longer read draws a note in its place (D15).',
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
  place: { index: 1, count: 8 },
  figuresAsOf: deckPage.deck.figuresAsOf,
  timeZone: deckPage.timeZone,
  theme: BLUE_THEME,
  logoUrl: null,
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

type Play = NonNullable<Story["play"]>;

/** A hex color as the browser reports a computed color. */
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(", ")})`;

const part = (canvasElement: HTMLElement, selector: string) =>
  canvasElement.querySelector<HTMLElement>(selector);

/** One drawn element's box in canvas pixels: its place in the slide over the slide's scale. */
function canvasBoxOf(canvasElement: HTMLElement, element: Element): Box {
  const slide = part(
    canvasElement,
    "[data-slide-canvas]"
  )!.getBoundingClientRect();

  const rect = element.getBoundingClientRect();
  const scale = slide.width / 960;

  return {
    x: (rect.left - slide.left) / scale,
    y: (rect.top - slide.top) / scale,
    w: rect.width / scale,
    h: rect.height / scale,
  };
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The page itself never scrolls sideways on a phone. */
async function noPageScroll() {
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    window.innerWidth
  );
}

/** The first slide: the deck's name and the company line (P14-2). */
const titleSlide: ShownSlide = {
  id: "t1",
  elements: [
    { kind: "title", text: "Receivables at a glance" },
    { kind: "text", text: "Genie Ops · October 2026 collections update" },
  ],
};

/** The closing: a title and a text on a later slide. */
const statementSlide: ShownSlide = {
  id: "t8",
  elements: [
    { kind: "title", text: "Collections are back on the plan line" },
    {
      kind: "text",
      text: "Two follow-ups remain open: the Delta Works balance and the August late fees.",
    },
  ],
};

/** Five 80-character bullets and no visual: the Priorities list (P14-13). */
const prioritiesSlide: ShownSlide = {
  id: "t7",
  elements: [
    { kind: "title", text: "Five steps keep collections on the plan line" },
    {
      kind: "bullets",
      items: [
        "Chase the three customers whose balances run past their agreed terms this month.",
        "Move the two largest accounts to thirty day terms before the next billing cycle.",
        "Send every reminder on the due date instead of a week after the invoice is late.",
        "Report collected cash beside invoiced sales in each monthly finance team update.",
        "Review the open balances with the sales leads every Monday before the team call.",
      ],
    },
  ],
};

/** The longest split slide: a 90-character title, a 280-character text and a chart (Review Focus 3). */
const longestSplitSlide: ShownSlide = {
  ...textWithChartSlide,
  elements: [
    {
      kind: "title",
      text: "Collections covered four fifths of invoiced sales while three late customers paid in full.",
    },
    {
      kind: "text",
      text: "Cash in grew in every month of the quarter, and the two customers that paid late in August settled in September, so the gap between invoiced sales and collected cash narrowed to its smallest point of the year. The plan line was met for the first time, and no invoice is in dispute",
    },
    textWithChartSlide.elements[2]!,
  ],
};

/** The title moved to the content side: it draws in the text color, sized to its own 400 x 60 box. */
const movedTitleSlide: ShownSlide = {
  ...textWithChartSlide,
  elements: textWithChartSlide.elements.map((element, at) =>
    at === 0 ? { ...element, box: { x: 500, y: 40, w: 400, h: 60 } } : element
  ),
};

/** The title slide in one theme: the panel fills the slide, the title in the panel text, a ring, no footer. */
const titleSlidePlay =
  (theme: SlideTheme): Play =>
  async ({ canvasElement }) => {
    await expect(part(canvasElement, "[data-slide-canvas]")).toHaveAttribute(
      "data-frame",
      "title"
    );
    await expect(
      getComputedStyle(part(canvasElement, "[data-slide-panel]")!)
        .backgroundColor
    ).toBe(rgb(theme.panel));
    await expect(
      getComputedStyle(part(canvasElement, '[data-slide-box="title"] p')!).color
    ).toBe(rgb(theme.panelText));
    await expect(part(canvasElement, "[data-slide-ring]")).not.toBeNull();
    await expect(part(canvasElement, "footer")).toBeNull();
    await noOverflow(canvasElement);
  };

/** A split slide in one theme: the 384 px brand panel, and the footer with the company and the place. */
const splitPlay =
  (theme: SlideTheme): Play =>
  async ({ canvas, canvasElement }) => {
    await expect(part(canvasElement, "[data-slide-canvas]")).toHaveAttribute(
      "data-frame",
      "split"
    );

    const panel = part(canvasElement, "[data-slide-panel]")!;

    await expect(getComputedStyle(panel).backgroundColor).toBe(
      rgb(theme.panel)
    );
    await expect(canvasBoxOf(canvasElement, panel).w).toBeCloseTo(384, 0);
    await expect(canvas.getByText("Figures as of 27 Oct 2026")).toBeVisible();
    await expect(canvas.getByText("Genie Ops · 2 / 8")).toBeVisible();
    await noOverflow(canvasElement);
  };

/** Five numbered circles in the accent; no item runs into the next one or into the footer (P14-13). */
const prioritiesPlay =
  (theme: SlideTheme): Play =>
  async ({ canvasElement }) => {
    const circles = [
      ...canvasElement.querySelectorAll<HTMLElement>("[data-list-circle]"),
    ];

    await expect(circles.map((circle) => circle.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);

    const circle = getComputedStyle(circles[0]!);

    if (theme.layout === "solid") {
      await expect(circle.backgroundColor).toBe(rgb(theme.accent));
      await expect(circle.color).toBe(rgb(theme.accentText));
    } else {
      await expect(circle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      await expect(circle.borderTopColor).toBe(rgb(theme.accent));
      await expect(
        Number.parseFloat(circle.borderTopWidth)
      ).toBeGreaterThanOrEqual(1);
      await expect(circle.color).toBe(rgb(theme.accent));
    }

    const texts = [
      ...canvasElement.querySelectorAll<HTMLElement>("[data-list-text]"),
    ].map((text) => canvasBoxOf(canvasElement, text));

    const footer = canvasBoxOf(canvasElement, part(canvasElement, "footer")!);

    const overruns = texts.flatMap((text, at) => {
      const limit = texts[at + 1]?.y ?? footer.y;

      return text.y + text.h > limit
        ? [`item ${at + 1} ends at ${text.y + text.h}, past ${limit}`]
        : [];
    });

    await expect(overruns).toEqual([]);
    await noOverflow(canvasElement);
  };

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
    await expect(canvasElement.querySelector("footer")).toBeNull();
    await noOverflow(canvasElement);
  },
};

// czjw.46: a logo whose link expired draws no broken image, and the split footer still names the company and the place.
export const BrokenLogo: Story = {
  name: "Broken logo",
  args: {
    ...canvasProps,
    logoUrl: "data:image/png;base64,bm90LWFuLWltYWdl",
    slide: textWithChartSlide,
  },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector("footer img")).toBeNull()
    );
    await expect(canvas.getByText("Genie Ops · 2 / 8")).toBeVisible();
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

// I1: a six-figure KPI stays on one line in the 225 px box of two visuals (plan Task 2 split table).
const largeKpiPlay: Story["play"] = async ({ canvasElement }) => {
  await noOverflow(canvasElement);

  const box = part(canvasElement, '[data-slide-box="figure"]')!;

  await expect(box.clientWidth).toBe(225);

  const number = box.querySelector<HTMLElement>("[data-figure-number]")!;

  await expect(number).toHaveTextContent("SGD 141,200");
  await expect(number).not.toHaveTextContent(".00");

  // The digits' own line boxes: a wrapped value has more than one.
  const digits = document.createRange();

  digits.selectNodeContents(number.lastChild!);

  await expect(digits.getClientRects().length).toBe(1);

  // 7.4: the label sits right under the value (figureBoxes: a 10 px gap). Canvas px, so the
  // check holds at the phone's scale too.
  const label = canvasBoxOf(
    canvasElement,
    box.querySelector("[data-figure-label]")!
  );

  const value = canvasBoxOf(canvasElement, number);
  const gap = label.y - (value.y + value.h);

  await expect(gap).toBeGreaterThanOrEqual(0);
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

// P14-12 deviation: a 5-column table needs about 437 px, so beside a visual it takes the content
// side, and the visual takes the panel body slot on a white card (T4-FIT, README Limits).
const tableWithVisualPlay: Story["play"] = async ({ canvasElement }) => {
  await noOverflow(canvasElement);

  const table = part(canvasElement, '[data-slide-box="table"]')!;
  const figure = part(canvasElement, '[data-slide-box="figure"]')!;
  const slot = canvasBoxOf(canvasElement, figure);

  await expect(table.clientWidth).toBe(480);
  await expect(slot.x).toBeCloseTo(43, 0);
  await expect(slot.y).toBeCloseTo(265, 0);
  await expect(getComputedStyle(figure).backgroundColor).toBe(
    rgb(BLUE_THEME.background)
  );
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

// czjw.183: the first slide with a title and a text is the title slide: the brand panel fills it,
// the title is white on it, a ring sits at the top right, and it has no footer (P14-2, P14-14).
export const TitleSlide: Story = {
  name: "Title slide",
  args: { ...canvasProps, place: { index: 0, count: 8 }, slide: titleSlide },
  globals: desktop,
  play: titleSlidePlay(BLUE_THEME),
};

export const TitleSlideGreen: Story = {
  name: "Title slide in a green brand",
  args: {
    ...canvasProps,
    place: { index: 0, count: 8 },
    theme: GREEN_THEME,
    slide: titleSlide,
  },
  globals: desktop,
  play: titleSlidePlay(GREEN_THEME),
};

export const TitleSlideViolet: Story = {
  name: "Title slide in a violet brand",
  args: {
    ...canvasProps,
    place: { index: 0, count: 8 },
    theme: VIOLET_THEME,
    slide: titleSlide,
  },
  globals: desktop,
  play: titleSlidePlay(VIOLET_THEME),
};

// A later title and text is the statement slide: its ring sits at the bottom right, clear of the
// title and the text, and it has no footer.
export const StatementSlide: Story = {
  name: "Statement slide",
  args: {
    ...canvasProps,
    place: { index: 7, count: 8 },
    slide: statementSlide,
  },
  globals: desktop,
  play: async ({ canvasElement }) => {
    await expect(part(canvasElement, "[data-slide-canvas]")).toHaveAttribute(
      "data-frame",
      "statement"
    );

    const ring = canvasBoxOf(
      canvasElement,
      part(canvasElement, "[data-slide-ring]")!
    );

    const title = canvasBoxOf(
      canvasElement,
      part(canvasElement, '[data-slide-box="title"]')!
    );

    const text = canvasBoxOf(
      canvasElement,
      part(canvasElement, '[data-slide-box="text"]')!
    );

    await expect(ring.x).toBeCloseTo(758, 0);
    await expect(ring.y).toBeCloseTo(338, 0);
    await expect(ring.y).toBeGreaterThan(title.y + title.h);
    await expect(overlaps(ring, title)).toBe(false);
    await expect(overlaps(ring, text)).toBe(false);
    await expect(part(canvasElement, "footer")).toBeNull();
    await noOverflow(canvasElement);
  },
};

// The split slide: the 384 px brand panel at the left, the footer "<company> · <n> / <count>" (P14-14).
export const SplitTextAndChart: Story = {
  name: "Split slide with a text and a chart",
  args: { ...canvasProps, slide: textWithChartSlide },
  globals: desktop,
  play: splitPlay(BLUE_THEME),
};

export const SplitTextAndChartGreen: Story = {
  name: "Split slide in a green brand",
  args: { ...canvasProps, theme: GREEN_THEME, slide: textWithChartSlide },
  globals: desktop,
  play: splitPlay(GREEN_THEME),
};

export const SplitTextAndChartViolet: Story = {
  name: "Split slide in a violet brand",
  args: { ...canvasProps, theme: VIOLET_THEME, slide: textWithChartSlide },
  globals: desktop,
  play: splitPlay(VIOLET_THEME),
};

export const PrioritiesList: Story = {
  name: "Priorities list",
  args: { ...canvasProps, slide: prioritiesSlide },
  globals: desktop,
  play: prioritiesPlay(BLUE_THEME),
};

export const PrioritiesListDark: Story = {
  name: "Priorities list, dark and minimal",
  args: { ...canvasProps, theme: DARK_THEME, slide: prioritiesSlide },
  globals: desktop,
  play: prioritiesPlay(DARK_THEME),
};

// The dark and minimal sample: the slide is #030712, the panel has no fill, only a 1 px line at x 384.
export const SplitDarkAndMinimal: Story = {
  name: "Split slide, dark and minimal",
  args: { ...canvasProps, theme: DARK_THEME, slide: textWithChartSlide },
  globals: desktop,
  play: async ({ canvasElement }) => {
    await expect(
      getComputedStyle(part(canvasElement, "[data-slide-canvas]")!)
        .backgroundColor
    ).toBe(rgb(DARK_THEME.background));

    const panel = part(canvasElement, "[data-slide-panel]")!;
    const style = getComputedStyle(panel);
    const box = canvasBoxOf(canvasElement, panel);

    await expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await expect(style.borderRightWidth).toBe("1px");
    await expect(style.borderRightColor).toBe(rgb(DARK_THEME.panel));
    await expect(box.x + box.w).toBeCloseTo(384, 0);
    await expect(
      getComputedStyle(part(canvasElement, '[data-slide-box="title"] p')!).color
    ).toBe(rgb(DARK_THEME.panelText));
    await noOverflow(canvasElement);
  },
};

export const TitleSlideDarkAndMinimal: Story = {
  name: "Title slide, dark and minimal",
  args: {
    ...canvasProps,
    place: { index: 0, count: 8 },
    theme: DARK_THEME,
    slide: titleSlide,
  },
  globals: desktop,
  play: async ({ canvasElement }) => {
    await expect(
      getComputedStyle(part(canvasElement, "[data-slide-canvas]")!)
        .backgroundColor
    ).toBe(rgb(DARK_THEME.background));
    await expect(part(canvasElement, "[data-slide-panel]")).toBeNull();
    await expect(
      getComputedStyle(part(canvasElement, "[data-slide-ring]")!).borderTopWidth
    ).toBe("3px");
    await expect(
      getComputedStyle(part(canvasElement, '[data-slide-box="title"] p')!)
        .fontWeight
    ).toBe("400");
    await expect(part(canvasElement, "footer")).toBeNull();
  },
};

// Review Focus 3. `defaultTextPx` has no unit test, so this story is its only guard: keep it strict.
// A title sits on its box's bottom edge, so a title too tall for its box runs out of the top,
// where no scroll size shows it; the height check catches that.
export const LongestSplitSlide: Story = {
  name: "Longest split slide",
  args: { ...canvasProps, slide: longestSplitSlide },
  globals: desktop,
  play: async ({ canvasElement }) => {
    await noOverflow(canvasElement);

    const titleBox = part(canvasElement, '[data-slide-box="title"]')!;

    await expect(titleBox.querySelector("p")!.offsetHeight).toBeLessThanOrEqual(
      titleBox.clientHeight
    );
  },
};

/** The first slide at the schema's longest: a 90-character title and a 170-character text. */
const longestTitleSlide: ShownSlide = {
  id: "t1",
  elements: [
    {
      kind: "title",
      text: "Collections covered four fifths of invoiced sales while three late customers paid in full.",
    },
    {
      kind: "text",
      text: "Genie Ops finance team, October 2026 collections update for the leadership meeting, with the quarter's cash in, the open balances and the two follow-ups that remain open.",
    },
  ],
};

// Review Focus 3 on the title slide: the 60 px title shrinks to fit its box.
export const LongestTitleSlide: Story = {
  name: "Longest title slide",
  args: {
    ...canvasProps,
    place: { index: 0, count: 8 },
    slide: longestTitleSlide,
  },
  globals: desktop,
  play: async ({ canvasElement }) => {
    await noOverflow(canvasElement);

    const titleBox = part(canvasElement, '[data-slide-box="title"]')!;
    const title = titleBox.querySelector("p")!;

    await expect(title.offsetHeight).toBeLessThanOrEqual(titleBox.clientHeight);
  },
};

// A stored box whose center is right of the panel is content: the title takes the theme text, and
// `defaultTextPx` fits its 45 characters to the 400 x 60 box at 26 px.
export const MovedTitleOnTheContent: Story = {
  name: "A title moved onto the content side",
  args: { ...canvasProps, slide: movedTitleSlide },
  globals: desktop,
  play: async ({ canvasElement }) => {
    const title = getComputedStyle(
      part(canvasElement, '[data-slide-box="title"] p')!
    );

    await expect(title.color).toBe(rgb(BLUE_THEME.text));
    await expect(title.fontSize).toBe("26px");
  },
};

// R14-2: a title color picked on white draws in the panel text on the panel, as in the export.
export const StoredTitleColorOnThePanel: Story = {
  name: "A stored title color that fails on the panel",
  args: {
    ...canvasProps,
    slide: {
      ...textWithChartSlide,
      elements: textWithChartSlide.elements.map((element, at) =>
        at === 0 ? { ...element, style: { color: "#1E3A8A" } } : element
      ),
    },
  },
  globals: desktop,
  play: async ({ canvasElement }) => {
    await expect(
      getComputedStyle(part(canvasElement, '[data-slide-box="title"] p')!).color
    ).toBe(rgb(BLUE_THEME.panelText));
  },
};

// Review Focus 4: in the app's dark mode a brand slide stays white, as in its PowerPoint file.
export const BrandLookInDarkMode: Story = {
  name: "The brand look in the app's dark mode",
  args: { ...canvasProps, slide: textWithChartSlide },
  globals: { ...desktop, theme: "dark" },
  play: async ({ canvasElement }) => {
    const slide = part(canvasElement, "[data-slide-canvas]")!;

    await expect(slide).toHaveAttribute("data-theme", "light");
    await expect(getComputedStyle(slide).backgroundColor).toBe(
      "rgb(255, 255, 255)"
    );
    await expect(
      getComputedStyle(part(canvasElement, "[data-slide-panel]")!)
        .backgroundColor
    ).toBe(rgb(BLUE_THEME.panel));
  },
};

export const TitleSlideOnPhone: Story = {
  name: "Title slide on a phone",
  args: { ...canvasProps, place: { index: 0, count: 8 }, slide: titleSlide },
  globals: phone,
  play: async (context) => {
    await titleSlidePlay(BLUE_THEME)(context);
    await noPageScroll();
  },
};

export const SplitTextAndChartOnPhone: Story = {
  name: "Split slide with a text and a chart on a phone",
  args: { ...canvasProps, slide: textWithChartSlide },
  globals: phone,
  play: async (context) => {
    await splitPlay(BLUE_THEME)(context);
    await noPageScroll();
  },
};

/** A fixture element with its frozen data: a figure, chart or table the person can read. */
function dataElement(element: ShownElement | undefined) {
  if (element === undefined || !("data" in element)) {
    throw new Error("The fixture has no data element here.");
  }

  return element;
}

const kpi = dataElement(bulletsWithTwoVisualsSlide.elements[2]);

const bar = dataElement(textWithChartSlide.elements[2]);

const table = dataElement(textWithTableSlide.elements[2]);

const insight = textWithChartSlide.elements[1]!;

/** Big number: a text in the panel and one figure on the content side. */
const bigNumberSlide: ShownSlide = {
  id: "t2",
  elements: [
    { kind: "title", text: "Invoiced sales reached a new high this quarter" },
    insight,
    kpi,
  ],
};

const twoFiguresStorySlide: ShownSlide = {
  id: "t4",
  elements: [
    { kind: "title", text: "Invoiced sales and collected cash both rose" },
    insight,
    kpi,
    dataElement(twoFiguresSlide.elements[2]),
  ],
};

/** Comparison: two bar charts whose own maxima differ about threefold. */
const comparisonSlide: ShownSlide = {
  id: "t5",
  elements: [
    { kind: "title", text: "Collections trail invoiced sales every month" },
    insight,
    bar,
    {
      ...bar,
      data: {
        ...bar.data,
        title: "Collected by month",
        rows: bar.data.rows.map((row) =>
          Object.assign({}, row, { total: Number(row["total"]) / 3 })
        ),
      },
    },
  ],
};

/** The comparison with a second series on the second chart. */
const comparisonTwoSeriesSlide: ShownSlide = {
  ...comparisonSlide,
  elements: comparisonSlide.elements.map((element, at) =>
    at === 3 && "data" in element
      ? {
          ...element,
          data: {
            ...element.data,
            columns: [
              ...element.data.columns,
              {
                key: "paid",
                label: "Paid on time",
                type: "money",
                currency: "SGD",
              },
            ],
            rows: element.data.rows.map((row) =>
              Object.assign({}, row, { paid: Number(row["total"]) / 2 })
            ),
          },
        }
      : element
  ),
};

const HARBOR = "Harbor Foods, average days from invoice to payment by month";

const ABC = "ABC Trading, average days from invoice to payment by month";

/** The comparison at its longest: long titles, two sources and a row cap in the 225 px pair. */
const comparisonLongSlide: ShownSlide = {
  ...comparisonSlide,
  elements: comparisonSlide.elements.map((element, at) =>
    "data" in element
      ? {
          ...element,
          data: {
            ...element.data,
            title: at === 2 ? HARBOR : ABC,
            sources: ["Invoices and payments", "Customer accounts"],
            truncated: true,
          },
        }
      : element
  ),
};

const tableWithNoteSlide: ShownSlide = {
  id: "t6",
  elements: [
    { kind: "title", text: "Five customers paid late this quarter" },
    {
      kind: "text",
      text: "Most late payments settled within two weeks of the due date.",
    },
    { ...table, data: { ...table.data, rows: table.data.rows.slice(0, 5) } },
  ],
};

const twelveRowsSlide: ShownSlide = {
  id: "t9",
  elements: [{ kind: "title", text: "Twelve customers paid late" }, table],
};

const noValueSlide: ShownSlide = {
  ...bigNumberSlide,
  elements: [
    bigNumberSlide.elements[0]!,
    insight,
    { ...kpi, data: { ...kpi.data, rows: [{ total: null }] } },
  ],
};

/** The text of the highest y-axis label of one chart, or null before it draws. */
function topTick(root: Element): string | null {
  const ticks = [
    ...root.querySelectorAll(
      ".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value"
    ),
  ];

  if (ticks.length === 0) return null;

  return ticks.reduce((top, tick) =>
    tick.getBoundingClientRect().top < top.getBoundingClientRect().top
      ? tick
      : top
  ).textContent;
}

/** P14-16: the number in the accent at the theme weight, "SGD" as a raised small run, and its source line. */
const bigNumberPlay =
  (theme: SlideTheme): Play =>
  async ({ canvas, canvasElement }) => {
    const number = part(canvasElement, "[data-figure-number]")!;
    const code = number.querySelector("span")!;
    const style = getComputedStyle(number);
    const digits = document.createRange();

    digits.selectNodeContents(number.lastChild!);

    const drawn = digits.getBoundingClientRect();

    await expect(style.color).toBe(rgb(theme.accent));
    await expect(style.fontWeight).toBe(
      theme.weight === "bold" ? "700" : "400"
    );
    await expect(style.fontVariantNumeric).toBe("proportional-nums");
    await expect(code.textContent?.trim()).toBe("SGD");
    await expect(
      Number.parseFloat(getComputedStyle(code).fontSize)
    ).toBeCloseTo(Number.parseFloat(style.fontSize) * 0.36, 0);
    await expect(code.getBoundingClientRect().bottom).toBeLessThan(
      drawn.bottom - 0.3 * drawn.height
    );
    await expect(
      canvas.getByRole("figure", { name: "Invoiced sales" })
    ).toBeVisible();
    await expect(
      canvas.getByText(/^Source: placeholder\.records · as of/)
    ).toBeVisible();
    await noOverflow(canvasElement);
  };

/** P14-17: one scale (the same top label), the accent first and the neutral second, both titles shown (P14-11). */
const comparisonPlay =
  (theme: SlideTheme): Play =>
  async ({ canvasElement }) => {
    const boxes = [
      ...canvasElement.querySelectorAll<HTMLElement>(
        '[data-slide-box="chart"]'
      ),
    ];

    await expect(boxes).toHaveLength(2);

    const tops = await waitFor(() => {
      const found = boxes.map(topTick);

      for (const top of found) expect(top).not.toBeNull();

      return found;
    });

    await expect(tops[1]).toBe(tops[0]);

    await expect(
      boxes.map(
        (box) =>
          box
            .querySelector<HTMLElement>("figure > div")!
            .getBoundingClientRect().width > 1
      )
    ).toEqual([true, true]);

    await expect(
      boxes.map(
        (box) =>
          getComputedStyle(box.querySelector(".recharts-rectangle")!).fill
      )
    ).toEqual([rgb(theme.accent), rgb(theme.neutral)]);
    await noOverflow(canvasElement);
  };

export const BigNumber: Story = {
  name: "Big number",
  args: { ...canvasProps, slide: bigNumberSlide },
  globals: desktop,
  play: bigNumberPlay(BLUE_THEME),
};

export const BigNumberGreen: Story = {
  name: "Big number in a green brand",
  args: { ...canvasProps, theme: GREEN_THEME, slide: bigNumberSlide },
  globals: desktop,
  play: bigNumberPlay(GREEN_THEME),
};

export const BigNumberViolet: Story = {
  name: "Big number in a violet brand",
  args: { ...canvasProps, theme: VIOLET_THEME, slide: bigNumberSlide },
  globals: desktop,
  play: bigNumberPlay(VIOLET_THEME),
};

export const BigNumberDark: Story = {
  name: "Big number, dark and minimal",
  args: { ...canvasProps, theme: DARK_THEME, slide: bigNumberSlide },
  globals: desktop,
  play: bigNumberPlay(DARK_THEME),
};

export const BigNumberOnPhone: Story = {
  name: "Big number on a phone",
  args: { ...canvasProps, slide: bigNumberSlide },
  globals: phone,
  play: async (context) => {
    await bigNumberPlay(BLUE_THEME)(context);
    await noPageScroll();
  },
};

// Two figures: each under a rule, the accent first; the second number in the text color and its
// rule in the second rule color (prototype `.two`).
export const TwoFigures: Story = {
  name: "Two figures",
  args: { ...canvasProps, slide: twoFiguresStorySlide },
  globals: desktop,
  play: async ({ canvasElement }) => {
    const rules = [
      ...canvasElement.querySelectorAll<HTMLElement>("[data-figure-rule]"),
    ];

    const numbers = [
      ...canvasElement.querySelectorAll<HTMLElement>("[data-figure-number]"),
    ];

    await expect(
      rules.map((rule) => getComputedStyle(rule).backgroundColor)
    ).toEqual([rgb(BLUE_THEME.accent), rgb(BLUE_THEME.rule)]);
    await expect(
      numbers.map((number) => getComputedStyle(number).color)
    ).toEqual([rgb(BLUE_THEME.accent), rgb(BLUE_THEME.text)]);
    await noOverflow(canvasElement);
  },
};

// P14-11: a slide with one chart hides the chart title, which stays the figure's name.
export const ChartWithInsight: Story = {
  name: "Chart with insight",
  args: { ...canvasProps, slide: textWithChartSlide },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    const figure = canvas.getByRole("figure", { name: "Invoiced by month" });

    const title = document.getElementById(
      figure.getAttribute("aria-labelledby")!
    )!;

    // Canvas px: the canvas is scaled, so a drawn 1 px box measures more on screen.
    await expect(title.clientWidth).toBeLessThanOrEqual(1);
    await noOverflow(canvasElement);
  },
};

export const Comparison: Story = {
  args: { ...canvasProps, slide: comparisonSlide },
  globals: desktop,
  play: comparisonPlay(BLUE_THEME),
};

export const ComparisonDark: Story = {
  name: "Comparison, dark and minimal",
  args: { ...canvasProps, theme: DARK_THEME, slide: comparisonSlide },
  globals: desktop,
  play: comparisonPlay(DARK_THEME),
};

export const ComparisonOnPhone: Story = {
  name: "Comparison on a phone",
  args: { ...canvasProps, slide: comparisonSlide },
  globals: phone,
  play: async (context) => {
    await comparisonPlay(BLUE_THEME)(context);
    await noPageScroll();
  },
};

// Deferred findings of plan Task 1: in the 225 px pair, the full title and the full source line
// show, "First 6 rows" included; the title stays the figure's name.
export const ComparisonLongText: Story = {
  name: "Comparison with long titles and sources",
  args: { ...canvasProps, slide: comparisonLongSlide },
  globals: desktop,
  play: async ({ canvas, canvasElement }) => {
    await noOverflow(canvasElement);

    await Promise.all(
      [HARBOR, ABC].map((name) =>
        expect(canvas.getByRole("figure", { name })).toBeVisible()
      )
    );

    const drawn = [
      ...canvasElement.querySelectorAll<HTMLElement>(
        '[data-slide-box="chart"]'
      ),
    ].map((box) => {
      const figure = box.querySelector("figure")!;

      const title = document.getElementById(
        figure.getAttribute("aria-labelledby")!
      )!;

      const caption = box.querySelector<HTMLElement>("figcaption")!;

      return {
        titleFits: title.scrollWidth <= title.clientWidth + 1,
        caption: caption.textContent,
        captionFits: caption.scrollHeight <= caption.clientHeight + 1,
      };
    });

    const full = {
      titleFits: true,
      caption: expect.stringMatching(/ · First 6 rows$/),
      captionFits: true,
    };

    await expect(drawn).toEqual([full, full]);
  },
};

// The table: a header with no fill and a text-color rule under it, numbers right-aligned at 15 px,
// the table right under its title, as the prototype's title row sits on the table (C14-7).
export const TableWithNote: Story = {
  name: "Table with note",
  args: { ...canvasProps, slide: tableWithNoteSlide },
  globals: desktop,
  play: async ({ canvasElement }) => {
    const drawn = part(canvasElement, '[data-slide-box="table"] table')!;
    const header = getComputedStyle(drawn.querySelectorAll("th")[3]!);

    const amount = getComputedStyle(
      drawn.querySelector("tbody tr")!.querySelectorAll("td")[3]!
    );

    await expect(header.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await expect(header.borderBottomColor).toBe(rgb(BLUE_THEME.text));
    await expect(
      Number.parseFloat(header.borderBottomWidth)
    ).toBeGreaterThanOrEqual(1);
    await expect(header.textAlign).toBe("right");
    await expect(amount.textAlign).toBe("right");
    await expect(amount.fontSize).toBe("15px");

    const box = drawn.parentElement!.getBoundingClientRect();
    const rect = drawn.getBoundingClientRect();

    await expect(Math.abs(rect.top - box.top)).toBeLessThanOrEqual(1);
    await noOverflow(canvasElement);
  },
};

// P14-12: 10 to 12 rows draw dense, so a 12 x 5 table fits its box.
export const TableOfTwelveRows: Story = {
  name: "Table of twelve rows",
  args: { ...canvasProps, slide: twelveRowsSlide },
  globals: desktop,
  play: async ({ canvasElement }) => {
    await noOverflow(canvasElement);
    await expect(
      canvasElement.querySelectorAll('[data-slide-box="table"] tbody tr')
    ).toHaveLength(12);
    await expect(
      getComputedStyle(part(canvasElement, '[data-slide-box="table"] td')!)
        .fontSize
    ).toBe("13px");
  },
};

// A figure whose sum read no records says "No data", as the chart's empty state did.
export const FigureWithNoValue: Story = {
  name: "Figure with no value",
  args: { ...canvasProps, slide: noValueSlide },
  globals: desktop,
  play: async ({ canvasElement }) => {
    const number = part(canvasElement, "[data-figure-number]")!;

    await expect(number).toHaveTextContent("No data");
    await expect(number.querySelector("span")).toBeNull();
    await noOverflow(canvasElement);
  },
};

// The second chart leads with the neutral, and its second series keeps a color of its own.
export const ComparisonWithTwoSeries: Story = {
  name: "Comparison whose second chart has two series",
  args: { ...canvasProps, slide: comparisonTwoSeriesSlide },
  globals: desktop,
  play: async ({ canvasElement }) => {
    const second = canvasElement.querySelectorAll<HTMLElement>(
      '[data-slide-box="chart"]'
    )[1]!;

    const fills = await waitFor(() => {
      const found = [...second.querySelectorAll(".recharts-rectangle")].map(
        (rect) => getComputedStyle(rect).fill
      );

      expect(found.length).toBeGreaterThan(0);

      return found;
    });

    await expect(new Set(fills)).toEqual(
      new Set([rgb(BLUE_THEME.neutral), rgb(BLUE_THEME.accent)])
    );
    await noOverflow(canvasElement);
  },
};

/** A donut of four parts: the third and fourth take series colors 3 and 4. */
const donutSlide: ShownSlide = {
  id: "t10",
  elements: [
    { kind: "title", text: "Four customers hold the open balance" },
    insight,
    {
      ...bar,
      data: {
        ...bar.data,
        kind: "donut",
        title: "Outstanding by customer",
        x: { key: "month", label: "Customer", type: "text" },
        rows: ["Harbor Foods", "ABC Trading", "Lim & Co", "Northwind"].map(
          (month, at) => ({ month, total: 40_000 - at * 8_000 })
        ),
      },
    },
  ],
};

// A dark deck in the app's dark mode: series 3 and up take the light palette the export draws,
// not the app's dark palette that `data-theme="dark"` on the canvas would give them.
export const DonutInDarkMode: Story = {
  name: "A donut on a dark deck in the app's dark mode",
  args: { ...canvasProps, theme: DARK_THEME, slide: donutSlide },
  globals: { ...desktop, theme: "dark" },
  play: async ({ canvasElement }) => {
    const fills = await waitFor(() => {
      const sectors = canvasElement.querySelectorAll(
        ".recharts-pie-sector path"
      );

      expect(sectors).toHaveLength(4);

      return [...sectors].map((sector) => getComputedStyle(sector).fill);
    });

    await expect(fills).toEqual([
      rgb(DARK_THEME.accent),
      rgb(DARK_THEME.neutral),
      rgb(chartColors.light[2]!),
      rgb(chartColors.light[3]!),
    ]);
  },
};
