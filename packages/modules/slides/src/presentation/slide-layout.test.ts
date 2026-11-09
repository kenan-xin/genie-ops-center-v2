import { describe, expect, it } from "vitest";

import type { ElementKind } from "../contract.ts";
import {
  CANVAS,
  elementBoxes,
  figuresDate,
  type Box,
  slideLayout,
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
