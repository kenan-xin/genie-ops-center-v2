import { foregroundFor } from "@genie/core/features/branding";
import type { ChartData } from "@genie/ui";
import { describe, expect, it } from "vitest";

import type { ElementKind } from "../contract.ts";
import { BLUE_THEME, DARK_THEME } from "./__fixtures__/themes.ts";
import {
  CANVAS,
  comparisonMax,
  contrastLimit,
  elementBoxes,
  figureBoxes,
  figuresDate,
  fitFontPx,
  isPrioritiesList,
  isSecondVisual,
  listItemBoxes,
  placedBoxes,
  regionOf,
  type Box,
  type SlideFrame,
  slideFooterColor,
  slideFrame,
  slideLayout,
  textGround,
} from "./slide-layout.ts";

describe("elementBoxes", () => {
  it("places each stored box over its computed one and keeps the rest", () => {
    const computed = slideLayout(["title", "text", "chart"]);
    const titleBox = { x: 40, y: 200, w: 400, h: 80 };
    const chartBox = { x: 480, y: 24, w: 456, h: 240 };

    expect(
      elementBoxes([
        { kind: "title", box: titleBox },
        { kind: "text" },
        { kind: "chart", box: chartBox },
      ])
    ).toEqual({
      title: titleBox,
      body: [computed.body[0], { index: 2, box: chartBox }],
    });
  });

  it("equals the computed layout when no element has a box", () => {
    const { title, body } = slideLayout(["title", "bullets", "table"]);

    expect(
      elementBoxes([{ kind: "title" }, { kind: "bullets" }, { kind: "table" }])
    ).toEqual({ title, body });
  });
});

const cellsOf = (kinds: readonly ElementKind[]) => {
  const layout = slideLayout(kinds);

  return [
    { id: "title", box: layout.title },
    { id: "rule", box: layout.rule },
    ...layout.body.map(({ index, box }) => ({
      id: `body ${index}`,
      box,
    })),
    { id: "footer", box: layout.footer },
  ];
};

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const inside = ({ x, y, w, h }: Box) =>
  x >= 0 && y >= 0 && x + w <= CANVAS.width && y + h <= CANVAS.height;

// B4.1: an element drawn off the slide, or over another one, on screen and in PowerPoint.
describe("slideLayout", () => {
  it.each([
    ["title only", ["title"]],
    ["text with a chart", ["title", "text", "chart"]],
    ["bullets with two visuals", ["title", "bullets", "figure", "chart"]],
    ["two visuals alone", ["title", "chart", "figure"]],
    ["bullets with a table", ["title", "bullets", "table"]],
    ["two visuals alone with a table", ["title", "chart", "table"]],
  ] as const)("keeps every box on the canvas and apart for %s", (_, kinds) => {
    const cells = cellsOf(kinds);

    for (const { box } of cells) expect(inside(box)).toBe(true);

    for (const [index, left] of cells.entries()) {
      for (const right of cells.slice(index + 1)) {
        expect(
          overlaps(left.box, right.box),
          `${left.id} overlaps ${right.id}`
        ).toBe(false);
      }
    }
  });

  it("gives a text and a visual their own columns", () => {
    const layout = slideLayout(["title", "text", "chart"]);

    expect(layout.body.map(({ box }) => [box.x, box.w])).toEqual([
      [40, 320],
      [384, 536],
    ]);
  });

  it("puts two visuals side by side with a 16 px gap", () => {
    const withBody = slideLayout(["title", "bullets", "figure", "chart"]);
    const alone = slideLayout(["title", "chart", "figure"]);

    expect(withBody.body.map(({ box }) => [box.x, box.w])).toEqual([
      [40, 320],
      [384, 260],
      [660, 260],
    ]);
    expect(alone.body.map(({ box }) => [box.x, box.w])).toEqual([
      [40, 432],
      [488, 432],
    ]);
  });

  // I1: a 12 x 5 table needs about 400 px of column, so it takes the wide visual column and the
  // other box, a body or one visual (T4-FIT), takes the text column.
  it("gives a table the wide visual column", () => {
    const withBody = slideLayout(["title", "bullets", "table"]);
    const alone = slideLayout(["title", "chart", "table"]);

    expect(withBody.body).toEqual([
      { index: 1, box: { x: 40, y: 136, w: 320, h: 348 } },
      { index: 2, box: { x: 384, y: 136, w: 536, h: 348 } },
    ]);
    expect(alone.body).toEqual([
      { index: 1, box: { x: 40, y: 136, w: 320, h: 348 } },
      { index: 2, box: { x: 384, y: 136, w: 536, h: 348 } },
    ]);
  });

  it("gives a lone kind the full body width", () => {
    const layout = slideLayout(["title", "text"]);

    expect(layout.body).toEqual([
      { index: 1, box: { x: 40, y: 136, w: 880, h: 348 } },
    ]);
  });

  it("writes the figures date in UTC", () => {
    expect(figuresDate("2026-10-27")).toBe("27 Oct 2026");
  });
});

describe("contrastLimit", () => {
  it.each([
    ["title", undefined, 3],
    ["text", undefined, 4.5],
    ["bullets", undefined, 4.5],
    ["text", 24, 3],
    ["title", 18, 4.5],
  ] as const)("%s at size %s needs %s:1", (kind, fontSize, limit) => {
    expect(contrastLimit(kind, fontSize)).toBe(limit);
  });
});

const frameCells = (frame: SlideFrame) => [
  { id: "title", box: frame.title },
  ...(frame.ring === null ? [] : [{ id: "ring", box: frame.ring }]),
  ...frame.body.map(({ index, box }) => ({ id: `body ${index}`, box })),
  ...(frame.footer === null ? [] : [{ id: "footer", box: frame.footer }]),
];

const LAYOUT_CASES = [
  ["title only, first", ["title"], true],
  ["title only, later", ["title"], false],
  ["title and text, first", ["title", "text"], true],
  ["title and text, later", ["title", "text"], false],
  ["text beside a chart", ["title", "text", "chart"], false],
  ["text beside a figure", ["title", "text", "figure"], false],
  ["bullets beside a chart", ["title", "bullets", "chart"], false],
  ["bullets with no visual", ["title", "bullets"], false],
  ["one chart", ["title", "chart"], false],
  ["one figure", ["title", "figure"], false],
  ["one table", ["title", "table"], false],
  ["one image", ["title", "image"], false],
  ["two charts", ["title", "chart", "chart"], false],
  ["two visuals, not two charts", ["title", "chart", "figure"], false],
  ["a chart and a table", ["title", "chart", "table"], false],
  ["a text and an image", ["title", "text", "image"], false],
] as const;

// P14 bugs 1-4: the wrong look for a slide, or a box off the slide, over another one or off the design.
describe("slideFrame", () => {
  it.each([
    [["title"], "title", true],
    [["title", "text"], "title", true],
    [["title"], "statement", false],
    [["title", "text"], "statement", false],
    [["title", "chart"], "split", true],
    [["title", "chart"], "split", false],
  ] as const)("names %j as %s when first is %s", (kinds, name, first) => {
    expect(slideFrame(kinds, first).name).toBe(name);
  });

  it.each(LAYOUT_CASES)(
    "keeps every box on the canvas and apart for %s",
    (_, kinds, first) => {
      const frame = slideFrame(kinds, first);
      const cells = frameCells(frame);

      expect(inside(frame.panel)).toBe(true);

      for (const { box } of cells) expect(inside(box)).toBe(true);

      for (const [index, left] of cells.entries()) {
        for (const right of cells.slice(index + 1)) {
          expect(
            overlaps(left.box, right.box),
            `${left.id} overlaps ${right.id}`
          ).toBe(false);
        }
      }
    }
  );

  it("lays out a title slide", () => {
    expect(slideFrame(["title", "text"], true)).toEqual({
      name: "title",
      panel: { x: 0, y: 0, w: 960, h: 540 },
      ring: { x: 758, y: 67, w: 135, h: 135 },
      title: { x: 67, y: 67, w: 578, h: 247 },
      body: [{ index: 1, box: { x: 67, y: 337, w: 826, h: 117 } }],
      footer: null,
    });
  });

  it("lays out a statement slide", () => {
    expect(slideFrame(["title", "text"], false)).toEqual({
      name: "statement",
      panel: { x: 0, y: 0, w: 960, h: 540 },
      ring: { x: 758, y: 338, w: 135, h: 135 },
      title: { x: 67, y: 67, w: 611, h: 212 },
      body: [{ index: 1, box: { x: 67, y: 302, w: 611, h: 151 } }],
      footer: null,
    });
  });

  it("lays out a split slide's fixed parts", () => {
    expect(slideFrame(["title", "chart"], false)).toEqual({
      name: "split",
      panel: { x: 0, y: 0, w: 384, h: 540 },
      ring: null,
      title: { x: 43, y: 58, w: 298, h: 184 },
      body: [{ index: 1, box: { x: 432, y: 117, w: 480, h: 288 } }],
      footer: { x: 422, y: 488, w: 490, h: 24 },
    });
  });

  it.each([
    [
      "text beside a visual",
      ["title", "text", "chart"],
      [
        { index: 1, box: { x: 43, y: 265, w: 298, h: 217 } },
        { index: 2, box: { x: 432, y: 117, w: 480, h: 288 } },
      ],
    ],
    [
      "bullets beside a visual",
      ["title", "bullets", "figure"],
      [
        { index: 1, box: { x: 43, y: 265, w: 298, h: 217 } },
        { index: 2, box: { x: 432, y: 58, w: 480, h: 405 } },
      ],
    ],
    [
      "bullets with no visual",
      ["title", "bullets"],
      [{ index: 1, box: { x: 432, y: 58, w: 480, h: 405 } }],
    ],
    [
      "one figure",
      ["title", "figure"],
      [{ index: 1, box: { x: 432, y: 58, w: 480, h: 405 } }],
    ],
    [
      "one table",
      ["title", "table"],
      [{ index: 1, box: { x: 432, y: 58, w: 480, h: 405 } }],
    ],
    [
      "one image",
      ["title", "image"],
      [{ index: 1, box: { x: 432, y: 58, w: 480, h: 405 } }],
    ],
    [
      "two charts",
      ["title", "chart", "chart"],
      [
        { index: 1, box: { x: 432, y: 115, w: 225, h: 292 } },
        { index: 2, box: { x: 687, y: 115, w: 225, h: 292 } },
      ],
    ],
    [
      "two visuals, not two charts",
      ["title", "chart", "figure"],
      [
        { index: 1, box: { x: 432, y: 58, w: 225, h: 405 } },
        { index: 2, box: { x: 687, y: 58, w: 225, h: 405 } },
      ],
    ],
    [
      "text beside two charts",
      ["title", "text", "chart", "chart"],
      [
        { index: 1, box: { x: 43, y: 265, w: 298, h: 217 } },
        { index: 2, box: { x: 432, y: 115, w: 225, h: 292 } },
        { index: 3, box: { x: 687, y: 115, w: 225, h: 292 } },
      ],
    ],
    // P14-12 deviation: a 5-column table needs 437 px, so it takes the content side and its partner the panel body slot (T4-FIT).
    [
      "a figure beside a table",
      ["title", "figure", "table"],
      [
        { index: 1, box: { x: 43, y: 265, w: 298, h: 217 } },
        { index: 2, box: { x: 432, y: 58, w: 480, h: 405 } },
      ],
    ],
    [
      "a chart beside a table",
      ["title", "chart", "table"],
      [
        { index: 1, box: { x: 43, y: 265, w: 298, h: 217 } },
        { index: 2, box: { x: 432, y: 58, w: 480, h: 405 } },
      ],
    ],
  ] as const)("lays out the body of %s", (_, kinds, body) => {
    expect(slideFrame(kinds, false).body).toEqual(body);
  });
});

describe("placedBoxes", () => {
  it("keeps a stored box over the frame box, the title included", () => {
    const titleBox = { x: 10, y: 20, w: 300, h: 60 };
    const chartBox = { x: 500, y: 100, w: 200, h: 200 };

    expect(
      placedBoxes(
        [
          { kind: "title", box: titleBox },
          { kind: "text" },
          { kind: "chart", box: chartBox },
        ],
        false
      )
    ).toEqual({
      name: "split",
      title: titleBox,
      body: [
        { index: 1, box: { x: 43, y: 265, w: 298, h: 217 } },
        { index: 2, box: chartBox },
      ],
    });
  });
});

describe("regionOf", () => {
  it.each([
    ["ends before the panel edge", "panel", { x: 0, y: 0, w: 767, h: 10 }],
    ["starts at the panel edge", "content", { x: 0, y: 0, w: 768, h: 10 }],
  ] as const)("puts a split box that %s in the %s", (_, region, box) => {
    expect(regionOf(box, "split")).toBe(region);
  });

  it.each(["title", "statement"] as const)(
    "puts every box of a %s frame in the panel",
    (frame) => {
      expect(regionOf({ x: 800, y: 400, w: 100, h: 100 }, frame)).toBe("panel");
    }
  );
});

describe("textGround", () => {
  const split = [
    { kind: "title" as const },
    { kind: "text" as const },
    { kind: "chart" as const },
  ];

  it.each([
    [
      "puts a split title on the panel in the panel text",
      split,
      undefined,
      BLUE_THEME,
      { behind: "#2563EB", color: "#FFFFFF", where: "panel" },
    ],
    [
      "puts a title moved to x 500 on the background in the text color",
      [
        { kind: "title" as const, box: { x: 500, y: 32, w: 400, h: 88 } },
        ...split.slice(1),
      ],
      undefined,
      BLUE_THEME,
      { behind: "#FFFFFF", color: "#111827", where: "background" },
    ],
    [
      "puts the title of a title slide on its slide background",
      [{ kind: "title" as const }, { kind: "text" as const }],
      "#FDE68A",
      BLUE_THEME,
      { behind: "#FDE68A", where: "background" },
    ],
    [
      "puts a title with a fill on its fill, over a slide background",
      [
        {
          kind: "title" as const,
          style: { fill: "#000000", color: "#FFFFFF" },
        },
        { kind: "text" as const },
      ],
      "#FDE68A",
      BLUE_THEME,
      { behind: "#000000", color: "#FFFFFF", where: "fill" },
    ],
    [
      "gives a split title with a light fill and no color a dark color on its fill",
      [
        { kind: "title" as const, style: { fill: "#EFF6FF" } },
        ...split.slice(1),
      ],
      undefined,
      BLUE_THEME,
      { behind: "#EFF6FF", color: "#111827", where: "fill" },
    ],
    [
      "puts the panel text of a light theme on the background in the text color",
      split,
      undefined,
      DARK_THEME,
      { behind: "#030712", color: "#F3F4F6", where: "background" },
    ],
  ])("%s", (_, elements, background, theme, expected) => {
    expect(textGround({ background, elements }, 0, theme, true)).toMatchObject(
      expected
    );
  });
});

describe("fitFontPx", () => {
  it("shrinks a 90-character split title to 28 px", () => {
    expect(
      fitFontPx({
        texts: ["x".repeat(90)],
        width: 298,
        height: 184,
        maxPx: 32,
        minPx: 20,
        lineHeight: 1.15,
      })
    ).toBe(28);
  });

  it("keeps 32 px for a 58-character split title", () => {
    expect(
      fitFontPx({
        texts: ["x".repeat(58)],
        width: 298,
        height: 184,
        maxPx: 32,
        minPx: 20,
        lineHeight: 1.15,
      })
    ).toBe(32);
  });

  it("shrinks a 280-character panel text to 16 px", () => {
    expect(
      fitFontPx({
        texts: ["x".repeat(280)],
        width: 298,
        height: 217,
        maxPx: 17,
        minPx: 12,
        lineHeight: 1.45,
      })
    ).toBe(16);
  });

  it("keeps the maximum size for empty text", () => {
    expect(
      fitFontPx({
        texts: [""],
        width: 298,
        height: 184,
        maxPx: 32,
        minPx: 20,
        lineHeight: 1.15,
      })
    ).toBe(32);
  });

  it("never answers under the minimum", () => {
    expect(
      fitFontPx({
        texts: ["x".repeat(10_000)],
        width: 298,
        height: 184,
        maxPx: 32,
        minPx: 20,
        lineHeight: 1.15,
      })
    ).toBe(20);
  });
});

const CONTENT_BOX = { x: 432, y: 58, w: 480, h: 405 };

const within = (a: Box, b: Box) =>
  a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

describe("listItemBoxes", () => {
  it("fits five items in the content box with circles apart from texts", () => {
    const items = listItemBoxes(5, CONTENT_BOX);

    expect(items.map(({ circle }) => circle.y)).toEqual([
      104, 170, 236, 302, 368,
    ]);

    for (const { circle, text } of items) {
      expect(within(circle, CONTENT_BOX)).toBe(true);
      expect(within(text, CONTENT_BOX)).toBe(true);
      expect(overlaps(circle, text)).toBe(false);
    }
  });

  it("centers one item", () => {
    expect(listItemBoxes(1, CONTENT_BOX)).toEqual([
      {
        circle: { x: 432, y: 236, w: 31, h: 31 },
        text: { x: 476, y: 236, w: 436, h: 49 },
      },
    ]);
  });
});

describe("figureBoxes", () => {
  it("centers an unpaired figure's number, label and caption", () => {
    expect(figureBoxes({ x: 432, y: 58, w: 225, h: 405 }, 42, false)).toEqual({
      rule: null,
      number: { x: 432, y: 214, w: 225, h: 42 },
      label: { x: 432, y: 266, w: 225, h: 20 },
      caption: { x: 432, y: 290, w: 225, h: 17 },
    });
  });

  it("puts a paired figure's rule above the number", () => {
    expect(figureBoxes({ x: 432, y: 58, w: 225, h: 405 }, 42, true)).toEqual({
      rule: { x: 432, y: 203, w: 225, h: 4 },
      number: { x: 432, y: 226, w: 225, h: 42 },
      label: { x: 432, y: 278, w: 225, h: 20 },
      caption: { x: 432, y: 302, w: 225, h: 17 },
    });
  });
});

/** A bar chart of one value column; `top` is its largest value. */
const barOf = (
  column: ChartData["columns"][number],
  top: number
): ChartData => ({
  kind: "bar",
  title: column.label,
  x: { key: "month", label: "Month", type: "date", bucket: "month" },
  columns: [column],
  rows: [
    { month: "2026-09-01", [column.key]: top / 2 },
    { month: "2026-10-01", [column.key]: top },
  ],
  datasets: ["placeholder.records"],
  readAt: "2026-10-27T09:00:00.000Z",
  truncated: false,
});

const sgd = {
  key: "total",
  label: "Invoiced",
  type: "money",
  currency: "SGD",
} as const;

describe("comparisonMax", () => {
  // P14-45: one scale only for one measure; a sum beside a count, or two currencies, would flatten one chart.
  it.each([
    ["two SGD sums", sgd, 600, 600],
    [
      "an SGD sum and a count",
      { key: "count", label: "Invoices issued", type: "number" } as const,
      40,
      undefined,
    ],
    ["an SGD sum and a EUR sum", { ...sgd, currency: "EUR" }, 600, undefined],
    // A bar below 0 needs the axis below 0, which a shared [0, max] cuts off.
    ["an SGD sum and a loss", sgd, -300, undefined],
  ] as const)("compares %s", (_, column, top, max) => {
    expect(
      comparisonMax([
        { kind: "title" },
        { kind: "chart", data: barOf(sgd, 200) },
        { kind: "chart", data: barOf(column, top) },
      ])
    ).toBe(max);
  });
});

describe("isSecondVisual", () => {
  it("counts only the charts the person can read", () => {
    const shown = { kind: "chart", data: barOf(sgd, 200) } as const;

    const elements = [
      { kind: "title" },
      { kind: "chart" },
      shown,
      shown,
    ] as const;

    expect([2, 3].map((index) => isSecondVisual(elements, index))).toEqual([
      false,
      true,
    ]);
  });
});

describe("slideFooterColor", () => {
  it("takes the secondary text, or the readable color on a slide background", () => {
    expect(
      [undefined, "#111827"].map((background) =>
        slideFooterColor(BLUE_THEME, background, foregroundFor)
      )
    ).toEqual([BLUE_THEME.secondaryText, "#ffffff"]);
  });
});

describe("isPrioritiesList", () => {
  const content = { x: 432, y: 58, w: 480, h: 405 };

  it.each([
    [
      "bullets on the content side with no visual",
      ["title", "bullets"],
      1,
      content,
      true,
    ],
    [
      "bullets beside a chart",
      ["title", "bullets", "chart"],
      1,
      content,
      false,
    ],
    [
      "bullets in the panel",
      ["title", "bullets"],
      1,
      { x: 43, y: 265, w: 298, h: 217 },
      false,
    ],
    ["a text on the content side", ["title", "text"], 1, content, false],
  ] as const)("knows %s", (_, kinds, index, box, priorities) => {
    expect(isPrioritiesList(kinds, index, box, "split")).toBe(priorities);
  });
});
