import { isDeepStrictEqual } from "node:util";

import { panelConfigSchema } from "@genie/core";

import {
  type AnswerChart,
  CHART_CASES,
  question,
  READERS,
  showsChart,
} from "../../testing/invoice-answer-readers.ts";

export type CaseScore = { readonly pass: boolean; readonly reason?: string };

/** A chart the R-15 gate refused: the model's raw config and the refusal code. */
export type RefusedChart = {
  readonly config: unknown;
  readonly refused: string;
};

/**
 * Scores one answer exactly (R-58): its checked charts, read back by the question's reader, equal
 * the question's rows in `expected-answers.json`, and its total where the file has one.
 */
export function scoreAnswer(
  questionId: string,
  charts: readonly AnswerChart[]
): CaseScore {
  const reader = READERS.get(questionId);

  if (reader === undefined) throw new Error(`No reader for ${questionId}.`);

  const { rows, totalCents } = question(questionId);

  let answered: unknown;

  try {
    answered = reader(charts);
  } catch (error) {
    return { pass: false, reason: String(error).replace(/^Error: /, "") };
  }

  const expected = totalCents === undefined ? { rows } : { rows, totalCents };

  return isDeepStrictEqual(answered, expected)
    ? { pass: true }
    : { pass: false, reason: "wrong-answer" };
}

/**
 * One score per chart case of the question: a chart shows it and the gate accepted it. Else a
 * refused chart whose config parses and shows it gives its refusal; a refused config that does
 * not parse shows nothing, so its case is `missing`.
 */
export function scoreCharts(
  questionId: string,
  checked: readonly (AnswerChart | RefusedChart)[]
): readonly (CaseScore & { readonly title: string })[] {
  const accepted = checked.flatMap((chart) =>
    "refused" in chart ? [] : [chart.config]
  );

  const refused = checked.flatMap((chart) => {
    if (!("refused" in chart)) return [];

    const config = panelConfigSchema.safeParse(chart.config).data;

    return config === undefined ? [] : [{ config, code: chart.refused }];
  });

  return CHART_CASES.filter((item) => item.questionId === questionId).map(
    (spec) => {
      const { title } = spec;

      if (accepted.some((config) => showsChart(config, spec) !== undefined)) {
        return { title, pass: true };
      }

      const refusal = refused.find(
        ({ config }) => showsChart(config, spec) !== undefined
      );

      return { title, pass: false, reason: refusal?.code ?? "missing" };
    }
  );
}
