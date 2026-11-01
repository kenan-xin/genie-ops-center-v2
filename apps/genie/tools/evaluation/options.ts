import { parseArgs } from "node:util";

/** The candidate models of S7-14, verbatim from the ticket. */
export const EVALUATION_MODELS: readonly string[] = [
  "anthropic/claude-opus-5.5",
  "openai/gpt-6.1-terra",
  "deepseek/deepseek-v4.1-flash-1017",
];

export type EvaluationOptions = {
  readonly transport: "recorded" | "live";
  readonly models: readonly string[];
  readonly runs: number;
  readonly out: string;
  readonly key?: string;
};

export type Refusal = { readonly refused: string };

/**
 * The runner's options. Recorded is the default and never reads the key. A live run needs
 * `--transport live`, the owner's `MODEL_RECORDING_KEY`, and a shell outside CI.
 */
export function parseOptions(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
): EvaluationOptions | Refusal {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      transport: { type: "string", default: "recorded" },
      model: { type: "string", multiple: true },
      runs: { type: "string", default: "3" },
      out: { type: "string" },
    },
    strict: true,
  });

  if (values.transport !== "recorded" && values.transport !== "live") {
    return { refused: "--transport must be recorded or live." };
  }

  if (values.out === undefined) {
    return { refused: "Pass --out <directory> for the report." };
  }

  const runs = Number(values.runs);

  if (!/^\d+$/.test(values.runs) || runs < 1 || runs > 10) {
    return { refused: "--runs must be a whole number from 1 to 10." };
  }

  const options = {
    transport: values.transport,
    models: values.model ?? EVALUATION_MODELS,
    runs,
    out: values.out,
  } satisfies EvaluationOptions;

  if (options.transport === "recorded") return options;

  if (env["CI"] !== undefined) {
    return { refused: "The evaluation never runs live in CI." };
  }

  const key = env["MODEL_RECORDING_KEY"];

  if (!key) {
    return {
      refused:
        "Set MODEL_RECORDING_KEY in this shell first: read -rs MODEL_RECORDING_KEY && export MODEL_RECORDING_KEY",
    };
  }

  return { ...options, key };
}
