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
import { BLUE_THEME, DARK_THEME } from "./__fixtures__/themes.ts";
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

/** The title slide: its title and text draw on the brand panel, which a background replaces (P14-15). */
const titleSlide: StoredSlide = {
  id: "s1",
  elements: [
    { kind: "title", text: "Receivables at a glance" },
    { kind: "text", text: "Genie Ops, October 2026" },
  ],
};

const SLIDES = [
  ["default", plain],
  ["white", whiteOnDark],
  ["title slide", titleSlide],
] as const;

const CASES = COLORS.flatMap((color) =>
  SLIDES.map(([name, slide]) => [color, name, slide] as const)
);

/** The deck after the steps, through the save's own step rules and parse. Its one slide is the first. */
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
        {
          kind: "title",
          text: "Claim",
          box: TITLE_BOX,
          style: { color: "#60A5FA" },
        },
        {
          kind: "text",
          text: "Sales rose.",
          box: TEXT_BOX,
          style: { color: "#60A5FA" },
        },
        IMAGE,
      ],
    };

    expect(backgroundSteps(slide, "#1E3A8A", BLUE_THEME, true)).toEqual([
      { op: "change-slide-fields", slideId: "s1", background: "#1E3A8A" },
      {
        op: "change-element",
        slideId: "s1",
        index: 1,
        style: { color: "#FFFFFF" },
      },
    ]);
  });

  it("a light background on the title slide turns its white title and text dark", () => {
    expect(backgroundSteps(titleSlide, "#F3F4F6", BLUE_THEME, true)).toEqual([
      { op: "change-slide-fields", slideId: "s1", background: "#F3F4F6" },
      {
        op: "change-element",
        slideId: "s1",
        index: 0,
        style: { color: "#111827" },
      },
      {
        op: "change-element",
        slideId: "s1",
        index: 1,
        style: { color: "#111827" },
      },
    ]);
  });

  it.each(CASES)(
    "background %s from %s texts leaves no text below its limit",
    (color, _name, slide) => {
      expect(
        issuesOf(after(slide, backgroundSteps(slide, color, BLUE_THEME, true)))
      ).toEqual([]);
    }
  );
});

describe("backgroundSteps on a light layout", () => {
  // P14-33: a light title slide has no panel, so its title draws on the slide background.
  it.each(COLORS)(
    "background %s on the dark and minimal title slide leaves no text below its limit",
    (color) => {
      const steps = backgroundSteps(titleSlide, color, DARK_THEME, true);

      expect(
        textContrastIssues(after(titleSlide, steps), DARK_THEME, "all")
      ).toEqual([]);
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
          style: fillChange(slide, 1, BLUE_THEME, true, color),
        },
      ];

      expect(issuesOf(after(slide, steps))).toEqual([]);
    }
  );

  it("a dark fill on the title slide's title keeps its white panel text", () => {
    expect(fillChange(titleSlide, 0, BLUE_THEME, true, "#1E3A8A")).toEqual({
      fill: "#1E3A8A",
    });
  });

  it("No fill on white text on a white slide sets the theme color", () => {
    const slide: StoredSlide = {
      ...plain,
      elements: [
        plain.elements[0]!,
        {
          kind: "text",
          text: "Sales rose.",
          box: TEXT_BOX,
          style: { color: "#FFFFFF", fill: "#1E3A8A" },
        },
        IMAGE,
      ],
    };

    expect(fillChange(slide, 1, BLUE_THEME, true, null)).toEqual({
      fill: null,
      color: null,
    });
  });

  it("a gray fill that neither ink nor white can read on takes black", () => {
    expect(fillChange(plain, 1, BLUE_THEME, true, "#777777")).toEqual({
      fill: "#777777",
      color: "#000000",
    });
  });

  it("a fill on a chart sends only the fill", () => {
    expect(
      fillChange(textWithChartSlide, 2, BLUE_THEME, false, "#111827")
    ).toEqual({ fill: "#111827" });
  });
});
