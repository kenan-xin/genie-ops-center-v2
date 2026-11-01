import { describe, expect, it } from "vitest";

import { frozenElement } from "../testing/factories.ts";
import {
  type DeckContent,
  deckContentSchema,
  type StoredElement,
} from "./content.ts";
import type { ElementKind } from "./contract.ts";

const ELEMENT: Record<ElementKind, () => StoredElement> = {
  title: () => ({ kind: "title", text: "Overdue invoices doubled in October" }),
  text: () => ({ kind: "text", text: "Most of the rise is one customer." }),
  bullets: () => ({ kind: "bullets", items: ["North", "South"] }),
  figure: () => frozenElement("figure"),
  chart: () => frozenElement("chart"),
  table: () => frozenElement("table"),
  image: () => ({
    kind: "image",
    fileId: "0b7c9a52-3a8e-4b8e-9d0a-2f6f1c2d3e4f",
    alt: "The office",
  }),
};

/** One deck of one slide, built from element kinds, with an element swapped in where given. */
function deckOf(
  kinds: readonly ElementKind[],
  replace: Record<number, StoredElement> = {}
): DeckContent {
  return {
    slides: [
      {
        id: "s1",
        elements: kinds.map((kind, index) => replace[index] ?? ELEMENT[kind]()),
      },
    ],
  };
}

const tableWithSixColumns = (): StoredElement => {
  const table = frozenElement("table");

  if (table.kind !== "table") throw new Error("not a table");

  return {
    ...table,
    data: {
      ...table.data,
      columns: [
        ...table.data.columns,
        { key: "c6", label: "Column 6", type: "text" },
      ],
    },
  };
};

/** A frozen element of one kind carried under another kind's name. */
const retyped = (
  from: "figure" | "chart",
  to: "figure" | "chart"
): StoredElement => {
  const element = frozenElement(from);

  if (!("chart" in element)) throw new Error("not a data element");

  return { ...element, kind: to };
};

const largestSlide = (id: string) => ({
  id,
  elements: [
    { kind: "title", text: "t".repeat(90) },
    { kind: "bullets", items: Array.from({ length: 5 }, () => "b".repeat(80)) },
    frozenElement("chart", 60),
    frozenElement("chart", 60),
  ] satisfies StoredElement[],
});

const slides = (count: number) =>
  Array.from({ length: count }, (_, index) => largestSlide(`s${index + 1}`));

describe("the deck content schema", () => {
  it.each<readonly [string, DeckContent, string | null]>([
    [
      "refuses a slide that does not start with a title",
      deckOf(["text", "title"]),
      "slides.0.elements.0: A slide starts with its title, the one claim of the slide.",
    ],
    [
      "refuses a slide with two titles",
      deckOf(["title", "text", "title"]),
      "slides.0.elements.2: A slide has one title.",
    ],
    [
      "refuses a slide with two texts",
      deckOf(["title", "text", "bullets"]),
      "slides.0.elements.2: A slide holds at most one text or bullet list.",
    ],
    [
      "refuses a slide with three visuals",
      deckOf(["title", "figure", "image", "table"]),
      "slides.0.elements.3: A slide holds at most two figures, charts, tables or images.",
    ],
    [
      "refuses a table beside a text and another visual",
      deckOf(["title", "text", "table", "figure"]),
      "slides.0.elements.3: A table shares its slide with one text or one other figure, chart or image, not both.",
    ],
    [
      "refuses a figure with a bar config",
      deckOf(["title", "figure"], { 1: retyped("chart", "figure") }),
      "slides.0.elements.1.chart: A figure takes a KPI chart.",
    ],
    [
      "refuses a chart with a KPI config",
      deckOf(["title", "chart"], { 1: retyped("figure", "chart") }),
      "slides.0.elements.1.chart: A chart element takes a bar, line, area or donut chart.",
    ],
    [
      "refuses a table with 13 rows",
      deckOf(["title", "table"], { 1: frozenElement("table", 13) }),
      "slides.0.elements.1.data: A slide table shows at most 12 rows and 5 columns. Limit or group the query.",
    ],
    [
      "refuses a table with 6 columns",
      deckOf(["title", "table"], { 1: tableWithSixColumns() }),
      "slides.0.elements.1.data: A slide table shows at most 12 rows and 5 columns. Limit or group the query.",
    ],
    [
      "refuses a chart with 61 points",
      deckOf(["title", "chart"], { 1: frozenElement("chart", 61) }),
      "slides.0.elements.1.data: A slide chart shows at most 60 points. Group the query by month or limit it.",
    ],
    [
      "refuses two slides with one id",
      { slides: [largestSlide("s1"), largestSlide("s1")] },
      "slides.1.id: Two slides share the id s1.",
    ],
    [
      "refuses 21 slides",
      { slides: slides(21) },
      "slides: A deck holds at most 20 slides.",
    ],
    [
      "parses 20 slides of the largest allowed shape",
      { slides: slides(20) },
      null,
    ],
  ])("%s", (_, content, expected) => {
    const result = deckContentSchema.safeParse(content);

    const issues = (result.error?.issues ?? []).map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    );

    expect(issues).toEqual(expected === null ? [] : [expected]);
  });
});
