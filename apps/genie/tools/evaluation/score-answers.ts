import { isDeepStrictEqual } from "node:util";

import {
  CHART_CASES,
  type ChartRows,
  question,
  READERS,
} from "../../testing/invoice-answer-readers.ts";

export type CaseScore = { readonly pass: boolean; readonly reason?: string };

/** A chart the R-15 gate refused, by the title its config gave it. */
export type RefusedChart = { readonly title: string; readonly refused: string };

/**
 * Scores one answer exactly (R-58): its checked charts, read back by the question's reader, equal
 * the question's rows in `expected-answers.json`, and its total where the file has one.
 */
export function scoreAnswer(
  questionId: string,
  charts: readonly ChartRows[]
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

/** One score per chart case of the question: the chart is there and the gate accepted it. */
export function scoreCharts(
  questionId: string,
  checked: readonly (ChartRows | RefusedChart)[]
): readonly (CaseScore & { readonly title: string })[] {
  return CHART_CASES.filter((item) => item.questionId === questionId).map(
    ({ title }) => {
      const found = checked.find((chart) => chart.title === title);

      if (found === undefined) return { title, pass: false, reason: "missing" };

      return "refused" in found
        ? { title, pass: false, reason: found.refused }
        : { title, pass: true };
    }
  );
}
