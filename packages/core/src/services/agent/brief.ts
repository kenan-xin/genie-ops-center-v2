import { z } from "zod";

import type { PanelConfig } from "../charts/panel-config.ts";
import { CHAT_TITLE_LIMIT } from "./contract.ts";

/**
 * The brief of a handoff (R-42b, tech plan wave 5, "The brief"): what Ask passes to a surface's
 * agent, and what it leaves out. The target reads only the brief, never the Ask chat, and reads
 * each dataset again before it uses a figure.
 */

export const BRIEF_PART = "data-brief";

export const BRIEF_LIMITS = {
  goal: 500,
  factText: 300,
  facts: 10,
  datasets: 10,
  artifacts: 5,
  notPassed: 5,
  notPassedText: 200,
  period: 100,
} as const;

export type Brief = {
  readonly surface: string;
  readonly title: string;
  readonly goal: string;
  readonly facts: readonly {
    readonly text: string;
    readonly dataset: string;
    readonly asOf: string;
  }[];
  readonly datasets: readonly string[];
  readonly period?: string | undefined;
  /** This chat's artifact numbers. */
  readonly artifacts: readonly number[];
  readonly notPassed: readonly string[];
};

const text = (max: number) => z.string().trim().min(1).max(max);

const datasetName = z.string().min(1).max(100);

/** A strict object, so an unknown key is refused; `surface` is one of the listed handoff surfaces. */
export function briefSchema(
  surfaceIds: readonly [string, ...string[]]
): z.ZodType<Brief> {
  return z.strictObject({
    surface: z.enum(surfaceIds),
    title: text(CHAT_TITLE_LIMIT),
    goal: text(BRIEF_LIMITS.goal),
    facts: z
      .array(
        z.strictObject({
          text: text(BRIEF_LIMITS.factText),
          dataset: datasetName,
          asOf: z.iso.date(),
        })
      )
      .max(BRIEF_LIMITS.facts),
    datasets: z.array(datasetName).max(BRIEF_LIMITS.datasets),
    period: text(BRIEF_LIMITS.period).optional(),
    artifacts: z.array(z.int().min(1)).max(BRIEF_LIMITS.artifacts),
    notPassed: z
      .array(text(BRIEF_LIMITS.notPassedText))
      .max(BRIEF_LIMITS.notPassed),
  });
}

export type BriefIssue = { readonly path: string; readonly message: string };

const UNKNOWN_DATASET =
  "No dataset has this name. Call list-datasets for the names.";

/** Each dataset this person cannot read, and each artifact number this chat does not hold. */
export function briefProblems(
  brief: Brief,
  known: {
    readonly datasets: ReadonlySet<string>;
    readonly artifacts: ReadonlySet<number>;
  }
): readonly BriefIssue[] {
  const unknownDataset = (path: string, name: string) =>
    known.datasets.has(name) ? [] : [{ path, message: UNKNOWN_DATASET }];

  return [
    ...brief.facts.flatMap(({ dataset }, index) =>
      unknownDataset(`facts.${index}.dataset`, dataset)
    ),
    ...brief.datasets.flatMap((name, index) =>
      unknownDataset(`datasets.${index}`, name)
    ),
    ...brief.artifacts.flatMap((number, index) =>
      known.artifacts.has(number)
        ? []
        : [
            {
              path: `artifacts.${index}`,
              message: `This chat has no artifact ${number}.`,
            },
          ]
    ),
  ];
}

export type BriefChart = {
  readonly title: string;
  readonly config: PanelConfig;
};

/** A heading and its lines; nothing when there are no lines. */
function section(heading: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : [heading, ...lines];
}

/** The brief as the target's first message reads it; it holds no record id and no session id. */
export function briefText(brief: Brief, charts: readonly BriefChart[]): string {
  return [
    "Ask handed this work over to you, on the person's own request.",
    `Title: ${brief.title}`,
    `Goal: ${brief.goal}`,
    ...(brief.period === undefined ? [] : [`Period: ${brief.period}`]),
    ...section(
      "Facts from the Ask chat, each with its dataset and date:",
      brief.facts.map(
        ({ text: fact, dataset, asOf }) =>
          `- ${fact} (${dataset}, as of ${asOf})`
      )
    ),
    ...(brief.datasets.length === 0
      ? []
      : [`Datasets to read: ${brief.datasets.join(", ")}`]),
    ...section(
      "Charts from the Ask chat, each as its chart config:",
      charts.map(({ title, config }) => `- ${title}: ${JSON.stringify(config)}`)
    ),
    "Not passed:",
    ...brief.notPassed.map((item) => `- ${item}`),
    "- The rest of the Ask chat",
    "Read every figure again with query-dataset before you use it.",
  ].join("\n");
}

/** The `data-brief` part's data: the brief without `surface` and `artifacts`, with the charts' titles. */
export type BriefPartData = Omit<Brief, "surface" | "artifacts"> & {
  readonly charts: readonly string[];
};
