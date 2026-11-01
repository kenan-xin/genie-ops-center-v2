import { describe, expect, it } from "vitest";

import type { CaseResult } from "./case-result.ts";
import { recommendDefaults, renderReport, summarize } from "./report.ts";

function result(
  model: string,
  track: CaseResult["track"],
  caseId: string,
  run: number,
  pass: boolean,
  costUsd: number | null = 0.01,
  ms = 1000
): CaseResult {
  return { model, track, caseId, run, pass, ms, costUsd };
}

/** One passing case on every track, at the given cost and time. */
function tied(model: string, cost: number | null, ms: number): CaseResult[] {
  return (
    ["extraction", "answers", "charts"] satisfies CaseResult["track"][]
  ).map((track) => result(model, track, "01", 1, true, cost, ms));
}

describe("the evaluation report", () => {
  it("gives the pass rate over every run and lists the cases whose runs disagree", () => {
    const [summary] = summarize([
      result("m", "extraction", "01", 1, true),
      result("m", "extraction", "01", 2, true),
      result("m", "extraction", "01", 3, true),
      result("m", "extraction", "02", 1, true),
      result("m", "extraction", "02", 2, false),
      result("m", "extraction", "02", 3, true),
    ]);

    expect(summary).toEqual({
      model: "m",
      track: "extraction",
      cases: 2,
      runs: 3,
      passRate: 5 / 6,
      unstableCases: ["02"],
      meanCostUsd: 0.01,
      meanMs: 1000,
    });
  });

  it("breaks a tie on pass rate by the lower cost, then the lower time, and a model with no cost loses a tie", () => {
    expect(
      recommendDefaults(
        summarize([
          ...tied("dear", 0.05, 100),
          ...tied("cheap", 0.01, 900),
          ...tied("cheap-fast", 0.01, 100),
        ])
      )
    ).toEqual({ chat: "cheap-fast", document: "cheap-fast" });

    expect(
      recommendDefaults(
        summarize([...tied("unknown", null, 10), ...tied("known", 0.9, 999)])
      )
    ).toEqual({ chat: "known", document: "known" });
  });

  it("picks the chat model by answers and charts and the document model by extraction", () => {
    expect(
      recommendDefaults(
        summarize([
          result("reader", "extraction", "01", 1, true),
          result("reader", "answers", "q", 1, false),
          result("reader", "charts", "q: c", 1, false),
          result("talker", "extraction", "01", 1, false),
          result("talker", "answers", "q", 1, true),
          result("talker", "charts", "q: c", 1, true),
        ])
      )
    ).toEqual({ chat: "talker", document: "reader" });
  });

  it("names its transport in the header, so a recorded report cannot pass as the live one", () => {
    const summaries = summarize([result("m", "extraction", "01", 1, true)]);

    const text = renderReport({
      transport: "recorded",
      models: ["m"],
      runs: 1,
      summaries,
      defaults: { chat: "m", document: "m" },
      date: "2026-11-01",
    });

    expect(text.split("\n").slice(0, 3).join("\n")).toContain(
      "recorded test model"
    );
    expect(text).not.toContain("live models");
  });
});
