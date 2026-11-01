import { test } from "vitest";

import { runEvaluation } from "./run.ts";

// The model evaluation (R-58). Collected only by `vitest.evaluation.config.ts`, never by a gate.
test("the model evaluation", () =>
  runEvaluation(
    (process.env["EVALUATION_ARGS"] ?? "").split(/\s+/).filter(Boolean),
    process.env
  ));
