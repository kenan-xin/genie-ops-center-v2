import { describe, expect, it } from "vitest";

import { frozenElement } from "../../testing/factories.ts";
import {
  bulletsWithTwoVisualsSlide,
  textWithChartSlide,
} from "./__fixtures__/decks.ts";
import { previewSlide, slideInputOf } from "./slide-editor.tsx";
import type { ShownSlide } from "./views.ts";

describe("the hand edit of a styled slide", () => {
  it("sends back every box, style and the background, so a text edit keeps them", () => {
    const figure = frozenElement("figure");
    const box = { x: 384, y: 136, w: 536, h: 348 };

    const input = slideInputOf({
      id: "s1",
      background: "#1E3A8A",
      elements: [
        { kind: "title", text: "Claim", style: { color: "#FFFFFF" } },
        { ...figure, box, style: { fill: "#EFF6FF" } },
      ],
    });

    expect(input).toEqual({
      background: "#1E3A8A",
      elements: [
        { kind: "title", text: "Claim", style: { color: "#FFFFFF" } },
        {
          kind: "figure",
          chart: "chart" in figure ? figure.chart : undefined,
          box,
          style: { fill: "#EFF6FF" },
        },
      ],
    });
  });

  it("sends no notes, so a sheet save keeps the stored notes", () => {
    const input = slideInputOf({
      id: "s1",
      notes: "Say hello.",
      elements: [{ kind: "title", text: "Claim" }],
    });

    expect(input).not.toHaveProperty("notes");
  });
});

describe("the live preview of the edit sheet", () => {
  it("previewSlide draws the form's title and keeps each chart's frozen data", () => {
    const chart = textWithChartSlide.elements[2];
    const [, ...rest] = slideInputOf(textWithChartSlide).elements;

    const preview = previewSlide(textWithChartSlide, {
      elements: [{ kind: "title", text: "Sales rose." }, ...rest],
    });

    expect(preview.elements[0]).toMatchObject({ text: "Sales rose." });
    expect(preview.elements[2]).toBe(chart);
  });

  it("previewSlide drops a removed chart and keeps the other one's data", () => {
    const bar = textWithChartSlide.elements[2];
    const kpi = bulletsWithTwoVisualsSlide.elements[2];

    if (bar?.kind !== "chart" || kpi?.kind !== "figure" || "hidden" in kpi) {
      throw new Error("the chart fixtures lost their elements");
    }

    const second = { ...kpi, kind: "chart" as const };

    const slide: ShownSlide = {
      id: "s9",
      elements: [{ kind: "title", text: "Two charts" }, bar, second],
    };

    for (const chart of [second.chart, structuredClone(second.chart)]) {
      const preview = previewSlide(slide, {
        elements: [
          { kind: "title", text: "Two charts" },
          { kind: "chart", chart },
        ],
      });

      const charts = preview.elements.filter((e) => e.kind === "chart");

      expect(charts).toHaveLength(1);
      expect(charts[0]).toHaveProperty("data", second.data);
    }
  });
});
