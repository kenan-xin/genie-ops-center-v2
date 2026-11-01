import { test } from "vitest";

import { splitArgs } from "./options.ts";
import { runEvaluation } from "./run.ts";

// The model evaluation (R-58). Collected only by `vitest.evaluation.config.ts`, never by a gate.
test("the model evaluation", () =>
  runEvaluation(splitArgs(process.env["EVALUATION_ARGS"] ?? ""), process.env));
