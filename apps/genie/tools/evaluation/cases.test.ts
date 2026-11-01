import { readFileSync } from "node:fs";

import {
  DEMO_PACK,
  READING_SYSTEM_PROMPT,
} from "@genie/module-invoices/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type ChartRows,
  QUESTIONS,
  READERS,
} from "../../testing/invoice-answer-readers.ts";
import { ANSWER_CASES, CHART_CASES, EXTRACTION_CASES } from "./cases.ts";

/** An empty chart with only the title a reader looks for. */
function chart(title: string): ChartRows {
  return { title, rows: [] };
}

const entity = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.null()])
);

const entities = z.record(z.string(), z.union([entity, z.array(entity)]));

/**
 * Every answer value of the live entities, as text. `source_pdf` names the input file, and the
 * receipt `status` is not a read field (its word "paid" is also a kind in the instructions).
 */
function entityValues(text: string): string[] {
  return Object.values(entities.parse(JSON.parse(text)))
    .flat()
    .flatMap((item) => Object.entries(item))
    .filter(
      ([key, value]) =>
        key !== "source_pdf" && key !== "status" && value !== null
    )
    .map(([, value]) => String(value));
}

describe("the evaluation cases", () => {
  it("holds the seven live uploads, the nine questions in six sessions and thirteen chart cases", () => {
    expect(EXTRACTION_CASES.map((item) => item.id)).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
    ]);
    expect(ANSWER_CASES).toHaveLength(6);
    expect(ANSWER_CASES.flat().toSorted()).toEqual(
      QUESTIONS.map((item) => item.id).toSorted()
    );
    expect(CHART_CASES).toHaveLength(13);
  });

  it.each(CHART_CASES)(
    "the reader of $questionId asks for the chart $title",
    ({ questionId, title }) => {
      const reader = READERS.get(questionId);

      const titles = CHART_CASES.filter(
        (item) => item.questionId === questionId
      ).map((item) => item.title);

      expect(reader).toBeDefined();
      expect(() => reader?.(titles.map(chart))).not.toThrow();
      expect(() =>
        reader?.(titles.filter((item) => item !== title).map(chart))
      ).toThrow(title);
    }
  );

  it("puts no value of the live entities into a prompt or a case the model sees", () => {
    const values = entityValues(
      readFileSync(
        new URL(
          "04_Demo_Guide/live_expected_entities_DO_NOT_PRELOAD.json",
          DEMO_PACK
        ),
        "utf8"
      )
    ).filter((value) => value.length >= 4);

    const seen = [
      READING_SYSTEM_PROMPT,
      ...QUESTIONS.map((item) => item.prompt),
      JSON.stringify(EXTRACTION_CASES),
    ].join("\n");

    expect(values.length).toBeGreaterThan(0);
    expect(values.filter((value) => seen.includes(value))).toEqual([]);
  });
});
