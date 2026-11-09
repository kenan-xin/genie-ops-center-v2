import { AppError } from "@genie/core";
import { describe, expect, it } from "vitest";

import { frozenElement } from "../../../testing/factories.ts";
import type { DeckContent, UndoEntry } from "../../content.ts";
import type { DeckChange } from "../../contract.ts";
import { applyChanges, pushUndo } from "./changes.ts";

const title = (text: string) => ({ kind: "title" as const, text });

/** A deck whose slides have the given ids, each a title only. */
function deckOf(ids: readonly string[]) {
  return {
    title: "Q3",
    content: { slides: ids.map((id) => ({ id, elements: [title(id)] })) },
  };
}

const ids = (
  current: ReturnType<typeof deckOf>,
  changes: readonly DeckChange[]
) => applyChanges(current, changes).slides.map((slide) => slide.id);

const addSlide = {
  op: "add-slide" as const,
  slide: { elements: [title("New")] },
} satisfies DeckChange;

const refusalOf = (run: () => void): AppError => {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error;

    throw error;
  }

  throw new Error("the change did not refuse");
};

const figure = frozenElement("figure");

/** One slide `s1` with a title and the frozen figure. */
const withFigure = {
  title: "Q3",
  content: {
    slides: [{ id: "s1", elements: [title("Claim"), figure] }],
  } satisfies DeckContent,
};

const chartOf = (element: typeof figure) =>
  "chart" in element ? element.chart : undefined;

/** One slide `s1`: a styled title, a boxed text and the frozen figure. */
const styledDeck = {
  title: "Q3",
  content: {
    slides: [
      {
        id: "s1",
        elements: [
          { ...title("Claim"), style: { color: "#1E3A8A", weight: "bold" } },
          {
            kind: "text",
            text: "Sales rose.",
            box: { x: 40, y: 136, w: 320, h: 96 },
          },
          figure,
        ],
      },
    ],
  } satisfies DeckContent,
};

const elementsOf = (
  current: typeof styledDeck,
  changes: readonly DeckChange[]
) => applyChanges(current, changes).slides[0]?.elements ?? [];

describe("the element and slide field steps", () => {
  it("sets one style key and keeps the others and the box", () => {
    const [first] = elementsOf(styledDeck, [
      {
        op: "change-element",
        slideId: "s1",
        index: 0,
        style: { color: "#FFFFFF" },
      },
    ]);

    expect(first).toEqual({
      kind: "title",
      text: "Claim",
      style: { color: "#FFFFFF", weight: "bold" },
    });
  });

  it("clears one style key with null, all keys with style null, the box with box null", () => {
    const [first, second] = elementsOf(styledDeck, [
      {
        op: "change-element",
        slideId: "s1",
        index: 0,
        style: { weight: null },
      },
      { op: "change-element", slideId: "s1", index: 1, box: null },
    ]);

    expect(first).toEqual({
      kind: "title",
      text: "Claim",
      style: { color: "#1E3A8A" },
    });
    expect(second).toEqual({ kind: "text", text: "Sales rose." });

    const [cleared] = elementsOf(styledDeck, [
      { op: "change-element", slideId: "s1", index: 0, style: null },
    ]);

    expect(cleared).toEqual({ kind: "title", text: "Claim" });
  });

  it("sets and clears a slide background and keeps the elements", () => {
    const set = applyChanges(styledDeck, [
      { op: "change-slide-fields", slideId: "s1", background: "#1E3A8A" },
    ]).slides[0];

    expect(set?.background).toBe("#1E3A8A");
    expect(set?.elements).toEqual(styledDeck.content.slides[0]?.elements);

    const dark = {
      title: "Q3",
      content: {
        slides: [
          { id: "s1", background: "#1E3A8A", elements: [title("Claim")] },
        ],
      },
    };

    const cleared = applyChanges(dark, [
      { op: "change-slide-fields", slideId: "s1", background: null },
    ]).slides[0];

    expect(cleared?.background).toBeUndefined();
  });

  it("refuses an element index past the slide's elements", () => {
    const error = refusalOf(() =>
      applyChanges(styledDeck, [
        { op: "change-element", slideId: "s1", index: 3, box: null },
      ])
    );

    expect(error.issues).toEqual([
      { path: "changes.0.index", message: "Slide s1 has no element 3." },
    ]);
  });

  it("refuses a step that names no field", () => {
    const error = refusalOf(() =>
      applyChanges(styledDeck, [
        { op: "change-element", slideId: "s1", index: 0 },
      ])
    );

    expect(error.issues).toEqual([
      {
        path: "changes.0",
        message: "Name a box, a style or a background to change.",
      },
    ]);
  });

  it("keeps a resent figure's frozen data and takes its new box, with no chart check", () => {
    const box = { x: 384, y: 136, w: 536, h: 348 };

    const applied = applyChanges(styledDeck, [
      {
        op: "change-slide",
        slideId: "s1",
        slide: {
          elements: [
            title("Claim"),
            { kind: "figure", chart: chartOf(figure), box },
          ],
        },
      },
    ]);

    expect(applied.slides[0]?.elements[1]).toEqual({ ...figure, box });
    expect(applied.checks.size).toBe(0);
  });
});

describe("applyChanges", () => {
  it("adds a slide to an empty deck as s1", () => {
    expect(ids(deckOf([]), [addSlide])).toEqual(["s1"]);
  });

  it("gives a slide added after s1 is removed from s1, s2 the id s3", () => {
    expect(
      ids(deckOf(["s1", "s2"]), [
        { op: "remove-slide", slideId: "s1" },
        addSlide,
      ])
    ).toEqual(["s2", "s3"]);
  });

  it("adds a slide at index 2 of two, after the last slide", () => {
    expect(ids(deckOf(["s1", "s2"]), [{ ...addSlide, toIndex: 2 }])).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
  });

  it("moves s1 to index 1 of s1, s2, s3", () => {
    expect(
      ids(deckOf(["s1", "s2", "s3"]), [
        { op: "move-slide", slideId: "s1", toIndex: 1 },
      ])
    ).toEqual(["s2", "s1", "s3"]);
  });

  it.each([
    [
      "a move to index 3 of three slides",
      deckOf(["s1", "s2", "s3"]),
      { op: "move-slide", slideId: "s1", toIndex: 3 },
      "changes.0.toIndex",
      undefined,
    ],
    [
      "an unknown slide id",
      deckOf(["s1", "s2", "s3"]),
      { op: "remove-slide", slideId: "s9" },
      "changes.0.slideId",
      "No slide s9 in this deck.",
    ],
    [
      "a 21st slide",
      deckOf(Array.from({ length: 20 }, (_, i) => `s${i + 1}`)),
      addSlide,
      "changes.0",
      "A deck holds at most 20 slides.",
    ],
  ] as const)("refuses %s", (_, current, change, path, message) => {
    expect(
      refusalOf(() => {
        applyChanges(current, [change]);
      })
    ).toMatchObject({
      code: "slides:change-invalid",
      issues: [message === undefined ? { path } : { path, message }],
    });
  });

  it("keeps the stored data of a figure whose chart is equal in another key order, and checks none", () => {
    const chart = chartOf(figure);

    const reordered = Object.fromEntries(
      Object.entries(chart ?? {}).toReversed()
    );

    const applied = applyChanges(withFigure, [
      {
        op: "change-slide",
        slideId: "s1",
        slide: {
          elements: [title("New claim"), { kind: "figure", chart: reordered }],
        },
      },
    ]);

    expect(applied.slides[0]?.elements).toEqual([title("New claim"), figure]);
    expect([...applied.checks]).toEqual([]);
  });

  it("checks a figure whose chart changed", () => {
    const applied = applyChanges(withFigure, [
      { op: "rename", title: "Q4" },
      {
        op: "change-slide",
        slideId: "s1",
        slide: {
          elements: [
            title("Claim"),
            { kind: "figure", chart: { ...chartOf(figure), title: "Other" } },
          ],
        },
      },
    ]);

    expect([...applied.checks]).toEqual([["s1.1", 1]]);
  });

  it("applies no step of a list whose second step fails", () => {
    const current = deckOf(["s1", "s2"]);
    const before = structuredClone(current);

    expect(
      refusalOf(() => {
        applyChanges(current, [
          { op: "remove-slide", slideId: "s1" },
          { op: "remove-slide", slideId: "s9" },
        ]);
      })
    ).toMatchObject({
      code: "slides:change-invalid",
      issues: [{ path: "changes.1.slideId" }],
    });
    expect(current).toEqual(before);
  });
});

const save = (n: number): UndoEntry => ({
  title: `Save ${n}`,
  content: { slides: [] },
  frozenOn: "2026-10-27",
});

describe("pushUndo", () => {
  it("keeps the newest 10 entries and drops the oldest", () => {
    const stack = Array.from({ length: 10 }, (_, i) => save(10 - i));

    expect(pushUndo(stack, save(11)).map((entry) => entry.title)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Save ${11 - i}`)
    );
  });
});
