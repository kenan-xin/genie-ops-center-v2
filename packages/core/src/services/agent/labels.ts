import type { StepWords } from "../../../contracts/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import { listDatasets } from "../datasets/index.ts";
import { offeredModuleTools } from "./tools.ts";

/** The words a chat shows for a tool call and a dataset, so it never prints an internal name. */
export type ChatLabels = {
  /** A module tool's name to its `step` lines. */
  readonly steps: Readonly<Record<string, StepWords>>;
  /** A dataset's name to its `title`. */
  readonly datasets: Readonly<Record<string, string>>;
};

/** At most this many starter questions above the composer. */
const SUGGESTION_LIMIT = 3;

/**
 * The chat's labels and starter questions for this person: the steps of the module tools they are
 * offered, and the titles and questions of the datasets they may read, so a title never names a
 * dataset the person cannot read.
 */
export async function chatLabels(ctx: ModuleRequestContext): Promise<{
  readonly labels: ChatLabels;
  readonly suggestions: readonly string[];
}> {
  const [tools, datasets] = await Promise.all([
    offeredModuleTools(ctx),
    listDatasets(ctx),
  ]);

  return {
    labels: {
      steps: Object.fromEntries(
        tools.flatMap(({ name, step }) =>
          step === undefined ? [] : [[name, step]]
        )
      ),
      datasets: Object.fromEntries(
        datasets.flatMap(({ name, title }) =>
          title === undefined ? [] : [[name, title]]
        )
      ),
    },
    suggestions: [
      ...new Set(datasets.flatMap(({ questions }) => questions ?? [])),
    ].slice(0, SUGGESTION_LIMIT),
  };
}
