import { describe, expect, it } from "vitest";

import {
  type DeckContent,
  deckContentSchema,
  type StoredSlide,
  textContrastIssues,
} from "../content.ts";
import type { DeckChange } from "../contract.ts";
import { applyChanges } from "../services/decks/changes.ts";
import { textWithChartSlide } from "./__fixtures__/decks.ts";
import { BLUE_THEME } from "./__fixtures__/themes.ts";
import { backgroundSteps, fillChange } from "./style-toolbar.tsx";

// The nine swatches of the toolbar, and #EF4444 of the bead.
const COLORS = [
  "#111827",
  "#4B5563",
  "#FFFFFF",
  "#F3F4F6",
  "#2563EB",
  "#1E3A8A",
  "#EFF6FF",
  "#047857",
  "#9A3412",
  "#EF4444",
];

// A split slide whose title and text sit right of the panel, so both draw on the slide background.
const TITLE_BOX = { x: 432, y: 32, w: 480, h: 88 };

const TEXT_BOX = { x: 432, y: 136, w: 480, h: 96 };

const IMAGE = {
  kind: "image",
  fileId: "0b7c9a52-3a8e-4b8e-9d0a-2f6f1c2d3e4f",
  alt: "The office",
} as const;

const plain: StoredSlide = {
  id: "s1",
  elements: [
    { kind: "title", text: "Claim", box: TITLE_BOX },
    { kind: "text", text: "Sales rose.", box: TEXT_BOX },
    IMAGE,
  ],
};

const whiteOnDark: StoredSlide = {
  id: "s1",
  background: "#1E3A8A",
  elements: [
    {
      kind: "title",
      text: "Claim",
      box: TITLE_BOX,
      style: { color: "#FFFFFF" },
    },
    {
      kind: "text",
      text: "Sales rose.",
      box: TEXT_BOX,
      style: { color: "#FFFFFF" },
    },
    IMAGE,
  ],
};

const SLIDES = [
  ["default", plain],
  ["white", whiteOnDark],
] as const;

const CASES = COLORS.flatMap((color) =>
  SLIDES.map(([name, slide]) => [color, name, slide] as const)
);

/** The deck after the steps, through the save's own step rules and parse. */
const after = (slide: StoredSlide, changes: DeckChange[]) =>
  deckContentSchema.parse({
    slides: applyChanges(
      { title: "Deck", content: { slides: [slide] } },
      changes
    ).slides,
  });

/** The save's contrast check under the blue brand. */
const issuesOf = (content: DeckContent) =>
  textContrastIssues(content, BLUE_THEME, "all");

describe("backgroundSteps", () => {
  it("a dark background recolors a small text and keeps a large title", () => {
    const slide: StoredSlide = {
      id: "s1",
      elements: [
        { kind: "title", text: "Claim", style: { color: "#60A5FA" } },
        { kind: "text", text: "Sales rose.", style: { color: "#60A5FA" } },
      ],
    };

    expect(backgroundSteps(slide, "#1E3A8A")).toEqual([
      { op: "change-slide-fields", slideId: "s1", background: "#1E3A8A" },
      {
        op: "change-element",
        slideId: "s1",
        index: 1,
        style: { color: "#FFFFFF" },
      },
    ]);
  });

  it.each(CASES)(
    "background %s from %s texts leaves no text below its limit",
    (color, _name, slide) => {
      expect(issuesOf(after(slide, backgroundSteps(slide, color)))).toEqual([]);
    }
  );
});

describe("fillChange", () => {
  it.each(CASES)(
    "a fill of %s on the text from %s texts leaves no text below its limit",
    (color, _name, slide) => {
      const steps: DeckChange[] = [
        {
          op: "change-element",
          slideId: "s1",
          index: 1,
          style: fillChange(slide.elements[1]!, slide.background, color),
        },
      ];

      expect(issuesOf(after(slide, steps))).toEqual([]);
    }
  );

  it("No fill on white text on a white slide sets the theme color", () => {
    expect(
      fillChange(
        {
          kind: "text",
          text: "Sales rose.",
          style: { color: "#FFFFFF", fill: "#1E3A8A" },
        },
        undefined,
        null
      )
    ).toEqual({ fill: null, color: null });
  });

  it("a gray fill that neither ink nor white can read on takes black", () => {
    expect(
      fillChange({ kind: "text", text: "Sales rose." }, undefined, "#777777")
    ).toEqual({ fill: "#777777", color: "#000000" });
  });

  it("a fill on a chart sends only the fill", () => {
    const chart = textWithChartSlide.elements[2]!;

    expect(fillChange(chart, undefined, "#111827")).toEqual({
      fill: "#111827",
    });
  });
});
