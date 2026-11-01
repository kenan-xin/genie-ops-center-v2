import { describe, expect, it } from "vitest";

import { EVALUATION_MODELS, parseOptions } from "./options.ts";

const KEY_TEXT =
  "Set MODEL_RECORDING_KEY in this shell first: read -rs MODEL_RECORDING_KEY && export MODEL_RECORDING_KEY";

describe("the evaluation options", () => {
  it("refuses a live run without the key, and any live run in CI", () => {
    expect(
      parseOptions(["--transport", "live", "--out", "/tmp/x"], {})
    ).toEqual({ refused: KEY_TEXT });
    expect(
      parseOptions(["--transport", "live", "--out", "/tmp/x"], {
        CI: "true",
        MODEL_RECORDING_KEY: "sk-test",
      })
    ).toEqual({ refused: "The evaluation never runs live in CI." });
  });

  it("runs recorded by default, even with the key in the environment, and never keeps the key", () => {
    expect(
      parseOptions(["--out", "/tmp/x"], { MODEL_RECORDING_KEY: "sk-test" })
    ).toEqual({
      transport: "recorded",
      models: EVALUATION_MODELS,
      runs: 3,
      out: "/tmp/x",
    });
  });

  it("keeps the key only for an explicit live run", () => {
    expect(
      parseOptions(["--transport", "live", "--out", "/tmp/x"], {
        MODEL_RECORDING_KEY: "sk-test",
      })
    ).toMatchObject({ transport: "live", key: "sk-test" });
  });

  it("refuses a missing report directory and a bad run count", () => {
    expect(parseOptions([], {})).toEqual({
      refused: "Pass --out <directory> for the report.",
    });

    for (const runs of ["0", "x", "11", "1.5"]) {
      expect(parseOptions(["--out", "/tmp/x", "--runs", runs], {})).toEqual({
        refused: "--runs must be a whole number from 1 to 10.",
      });
    }
  });

  it("names the three candidate models of the ticket", () => {
    expect(EVALUATION_MODELS).toEqual([
      "anthropic/claude-opus-5.5",
      "openai/gpt-6.1-terra",
      "deepseek/deepseek-v4.1-flash-1017",
    ]);
  });
});
