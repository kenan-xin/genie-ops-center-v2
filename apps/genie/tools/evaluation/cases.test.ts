import { readFileSync } from "node:fs";

import { panelConfigSchema } from "@genie/core";
import {
  DEMO_PACK,
  READING_SYSTEM_PROMPT,
} from "@genie/module-invoices/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  type AnswerChart,
  type ChartSpec,
  QUESTIONS,
  READERS,
} from "../../testing/invoice-answer-readers.ts";
import {
  ANSWER_CASES,
  CHART_CASES,
  casesWithin,
  EXTRACTION_CASES,
} from "./cases.ts";

/** An empty chart of the spec's first type that shows its fields, under an unrelated title. */
function chart({ types, dataset, columns }: ChartSpec): AnswerChart {
  const fields = Object.values(columns);
  const plain = fields.filter((field) => !field.endsWith(")"));

  const aggregates = fields
    .filter((field) => field.endsWith(")"))
    .map((field, index) => {
      const [fn, of] = field.slice(0, -1).split("(");

      return { fn, field: of, as: `value${index}` };
    });

  const series = {
    name: "Series",
    dataset,
    query:
      aggregates.length === 0
        ? { select: plain }
        : { groupBy: plain.map((field) => ({ field })), aggregates },
  };

  const [type] = types;

  return {
    config: panelConfigSchema.parse({
      type,
      title: "Any title",
      series: [
        type === "table"
          ? series
          : type === "kpi"
            ? { ...series, value: "value0" }
            : { ...series, x: plain[0], y: "value0" },
      ],
    }),
    data: { rows: [] },
  };
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
  it("holds the seven live uploads, the nine questions in six sessions and fourteen chart cases", () => {
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
    expect(CHART_CASES).toHaveLength(14);
  });

  it("keeps the first cases of each track under a limit, with whole earlier session turns", () => {
    expect(casesWithin()).toEqual({
      extraction: EXTRACTION_CASES,
      answers: ANSWER_CASES,
      charts: CHART_CASES,
    });

    const one = casesWithin(1);

    expect(one.extraction.map((item) => item.id)).toEqual(["01"]);
    expect(one.answers).toEqual([["overdue-invoices"]]);
    expect(one.charts.map((item) => item.questionId)).toEqual(
      CHART_CASES.filter((item) => item.questionId === "overdue-invoices").map(
        (item) => item.questionId
      )
    );

    // The second session is cut after its first question.
    expect(casesWithin(2).answers).toEqual([
      ["overdue-invoices"],
      ["repeated-late-payers"],
    ]);
  });

  it.each(CHART_CASES)(
    "the reader of $questionId asks for the chart $title",
    ({ questionId, title }) => {
      const reader = READERS.get(questionId);

      const cases = CHART_CASES.filter(
        (item) => item.questionId === questionId
      );

      expect(reader).toBeDefined();
      expect(() => reader?.(cases.map(chart))).not.toThrow();
      expect(() =>
        reader?.(cases.filter((item) => item.title !== title).map(chart))
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
