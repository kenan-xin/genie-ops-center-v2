import type { CaseResult } from "./case-result.ts";

type Track = CaseResult["track"];

/** One model on one track, over every run (R-58: pass rate, variance, cost and time). */
export type ModelSummary = {
  readonly model: string;
  readonly track: Track;
  readonly cases: number;
  readonly runs: number;
  readonly passRate: number;
  /** The cases whose runs disagree: the variance of the model on this track. */
  readonly unstableCases: readonly string[];
  readonly meanCostUsd: number | null;
  readonly meanMs: number;
};

/** A track's default, or `null` when no model passed one of its cases. */
export type Defaults = {
  readonly chat: string | null;
  readonly document: string | null;
};

const TRACKS: readonly Track[] = ["extraction", "answers", "charts"];

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarize(
  results: readonly CaseResult[]
): readonly ModelSummary[] {
  const models = [...new Set(results.map((item) => item.model))];

  return models.flatMap((model) =>
    TRACKS.flatMap((track) => {
      const own = results.filter(
        (item) => item.model === model && item.track === track
      );

      if (own.length === 0) return [];

      const caseIds = [...new Set(own.map((item) => item.caseId))];

      const costs = own.flatMap((item) =>
        item.costUsd === null ? [] : [item.costUsd]
      );

      return [
        {
          model,
          track,
          cases: caseIds.length,
          runs: Math.max(...own.map((item) => item.run)),
          passRate: own.filter((item) => item.pass).length / own.length,
          unstableCases: caseIds.filter(
            (caseId) =>
              new Set(
                own.flatMap((item) =>
                  item.caseId === caseId ? [item.pass] : []
                )
              ).size > 1
          ),
          meanCostUsd: costs.length === 0 ? null : mean(costs),
          meanMs: mean(own.map((item) => item.ms)),
        },
      ];
    })
  );
}

type Standing = {
  readonly model: string;
  readonly passRate: number;
  readonly cost: number | null;
  readonly ms: number;
};

/**
 * The highest pass rate; a tie goes to the lower cost (a known cost beats none), then the lower
 * time. No model when the best passed nothing: a default must have passed a case.
 */
function best(standings: readonly Standing[]): string | null {
  const [first] = standings.toSorted(
    (left, right) =>
      right.passRate - left.passRate ||
      (left.cost ?? Number.POSITIVE_INFINITY) -
        (right.cost ?? Number.POSITIVE_INFINITY) ||
      left.ms - right.ms
  );

  if (first === undefined) throw new Error("No model was evaluated.");

  return first.passRate > 0 ? first.model : null;
}

function standing(
  model: string,
  own: readonly ModelSummary[]
): Standing | undefined {
  const weights = own.map((item) => item.cases * item.runs);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  if (total === 0) return undefined;

  const costs = own.flatMap((item) =>
    item.meanCostUsd === null ? [] : [item.meanCostUsd]
  );

  return {
    model,
    passRate:
      own.reduce(
        (sum, item, index) => sum + item.passRate * (weights[index] ?? 0),
        0
      ) / total,
    cost: costs.length === 0 ? null : mean(costs),
    ms: mean(own.map((item) => item.meanMs)),
  };
}

/** Plan D6: the chat model by answers and charts, the document model by extraction. */
export function recommendDefaults(
  summaries: readonly ModelSummary[]
): Defaults {
  const models = [...new Set(summaries.map((item) => item.model))];

  const by = (tracks: readonly Track[]) =>
    best(
      models.flatMap((model) => {
        const found = standing(
          model,
          summaries.filter(
            (item) => item.model === model && tracks.includes(item.track)
          )
        );

        return found === undefined ? [] : [found];
      })
    );

  return { chat: by(["answers", "charts"]), document: by(["extraction"]) };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

function dollars(value: number | null): string {
  return value === null ? "not given" : `$${value.toFixed(4)}`;
}

const TRACK_TITLES = {
  extraction: "Extraction of the seven live uploads",
  answers: "Answers to the nine read questions",
  charts: "Chart cases of the nine answers",
} satisfies Record<Track, string>;

/** The report as Markdown: transport first, one table per track, the unstable cases, the defaults. */
export function renderReport(input: {
  readonly transport: "recorded" | "live";
  readonly models: readonly string[];
  readonly runs: number;
  readonly summaries: readonly ModelSummary[];
  readonly defaults: Defaults;
  readonly date: string;
}): string {
  const source =
    input.transport === "live"
      ? "live models through the provider"
      : "the recorded test model (a proof of the suite, not a model choice)";

  const lines = [
    "# Model evaluation report",
    "",
    `Run on ${input.date} against ${source}. ${input.runs} runs per case. Models: ${input.models.join(", ")}. Reporting date 2026-10-27 (R-58).`,
    "",
  ];

  for (const track of TRACKS) {
    const rows = input.summaries.filter((item) => item.track === track);

    if (rows.length === 0) continue;

    lines.push(
      `## ${TRACK_TITLES[track]}`,
      "",
      "| Model | Cases | Pass rate | Unstable cases | Mean cost | Mean time |",
      "| --- | --- | --- | --- | --- | --- |",
      ...rows.map(
        (item) =>
          `| ${item.model} | ${item.cases} | ${percent(item.passRate)} | ${item.unstableCases.length === 0 ? "none" : item.unstableCases.join(", ")} | ${dollars(item.meanCostUsd)} | ${(item.meanMs / 1000).toFixed(1)} s |`
      ),
      ""
    );
  }

  lines.push(
    "## Recommended defaults",
    "",
    input.defaults.chat === null
      ? "- Chat model: none, because no model passed an answer or chart case."
      : `- Chat model: ${input.defaults.chat} (the highest pass rate on answers and charts).`,
    input.defaults.document === null
      ? "- Document model: none, because no model passed an extraction case."
      : `- Document model: ${input.defaults.document} (the highest pass rate on extraction).`,
    "",
    "A tie goes to the lower mean cost, then the lower mean time.",
    ""
  );

  return lines.join("\n");
}
