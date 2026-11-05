import { isDeepStrictEqual } from "node:util";

import { AppError, panelConfigSchema } from "@genie/core";
import type { AnswerBlock } from "@genie/core/testing";

import {
  type AnswerChart,
  answerIssues,
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
 * The app code of the `AppError` that refused a chart, also when a transport wrapped it as the
 * cause. Any other error is no refusal, so its message names it, never a database or system code.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a caught error; this function is its parser
export function refusalCode(error: unknown): string {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause instanceof AppError) return cause.code;
  }

  return String(error);
}

/**
 * Scores one answer exactly (R-58): the checked charts of its session, read back by the question's
 * reader, equal the question's rows in `expected-answers.json`, and its prose keeps the answer
 * rules (R-44): it opens with a sentence, states a money total first, and names no internal name
 * and no ISO date.
 */
export function scoreAnswer(
  questionId: string,
  answer: {
    readonly charts: readonly AnswerChart[];
    readonly blocks: readonly AnswerBlock[];
    readonly internalNames: readonly string[];
  }
): CaseScore {
  const reader = READERS.get(questionId);

  if (reader === undefined) throw new Error(`No reader for ${questionId}.`);

  let answered: unknown;

  try {
    answered = reader(answer.charts);
  } catch (error) {
    return { pass: false, reason: String(error).replace(/^Error: /, "") };
  }

  if (!isDeepStrictEqual(answered, { rows: question(questionId).rows })) {
    return { pass: false, reason: "wrong-answer" };
  }

  const issues = answerIssues({ questionId, ...answer });

  return issues.length === 0
    ? { pass: true }
    : { pass: false, reason: issues.join("; ") };
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
