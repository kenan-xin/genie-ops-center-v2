import type { StepWords } from "../../../contracts/index.ts";
import type {
  DatasetFieldType,
  ModuleRequestContext,
} from "../../lib/module-contract/module.ts";
import { listDatasets } from "../datasets/index.ts";
import { offeredModuleTools } from "./tools.ts";

/** A labelled field of a readable dataset, for the sentence and the rows of a read (czjw.108). */
export type ChatFieldLabel = {
  readonly label: string;
  readonly type: DatasetFieldType;
  /** On a money field: the dataset's currency field, for a row read's table. */
  readonly currencyKey?: string;
};

/** The words a chat shows for a tool call and a dataset, so it never prints an internal name. */
export type ChatLabels = {
  /** A module tool's name to its `step` lines. */
  readonly steps: Readonly<Record<string, StepWords>>;
  /** A dataset's name to its `title`. */
  readonly datasets: Readonly<Record<string, string>>;
  /** A readable dataset's name to its labelled fields by field name. Never sent to the model. */
  readonly fields: Readonly<
    Record<string, Readonly<Record<string, ChatFieldLabel>>>
  >;
};

function fieldLabels(
  dataset: Awaited<ReturnType<typeof listDatasets>>[number]
): Readonly<Record<string, ChatFieldLabel>> {
  return Object.fromEntries(
    Object.entries(dataset.fields).flatMap(([name, field]) => {
      // A field hidden from the agent's dataset list still reaches a query through the page's
      // context, such as a list's status tab, and labels never reach the model.
      if (field.label === undefined) return [];

      const entry: ChatFieldLabel =
        field.type === "money" && dataset.currencyField !== undefined
          ? {
              label: field.label,
              type: field.type,
              currencyKey: dataset.currencyField,
            }
          : { label: field.label, type: field.type };

      return [[name, entry]];
    })
  );
}

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
      fields: Object.fromEntries(
        datasets.map((dataset) => [dataset.name, fieldLabels(dataset)])
      ),
    },
    suggestions: [
      ...new Set(datasets.flatMap(({ questions }) => questions ?? [])),
    ].slice(0, SUGGESTION_LIMIT),
  };
}
