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

  it("recommends no default for a track on which no model passed a case", () => {
    const defaults = recommendDefaults(
      summarize([
        result("a", "extraction", "01", 1, false),
        result("a", "answers", "q", 1, true),
        result("b", "extraction", "01", 1, false),
      ])
    );

    expect(defaults).toEqual({ chat: "a", document: null });
    expect(
      renderReport({
        transport: "live",
        models: ["a", "b"],
        runs: 1,
        summaries: [],
        results: [],
        defaults,
        date: "2026-11-01",
      })
    ).toContain(
      "Document model: none, because no model passed an extraction case."
    );
  });

  it("leaves the answers' cost and time out of the charts table", () => {
    const text = renderReport({
      transport: "recorded",
      models: ["m"],
      runs: 1,
      summaries: summarize([
        result("m", "charts", "q: c", 1, true, 0.0123, 4567),
      ]),
      results: [],
      defaults: { chat: "m", document: null },
      date: "2026-11-01",
    });

    expect(text).toContain("Chart cases of the nine answers");
    expect(text).not.toContain("$0.0123");
    expect(text).not.toContain("4.6 s");
  });

  it("lists every failure reason once, with the runs that gave it", () => {
    const results = [
      { ...result("m", "extraction", "02", 1, false), reason: "amount" },
      { ...result("m", "extraction", "02", 2, true), reason: "" },
      { ...result("m", "extraction", "02", 3, false), reason: "amount" },
      { ...result("m", "answers", "q", 1, false), reason: "Error: a\nb" },
      result("m", "charts", "q: c", 1, false),
      { ...result("m", "answers", "r", 1, false), reason: "x".repeat(301) },
    ];

    const text = renderReport({
      transport: "recorded",
      models: ["m"],
      runs: 3,
      summaries: summarize(results),
      results,
      defaults: { chat: null, document: "m" },
      date: "2026-11-01",
    });

    expect(text.split("## Failures\n\n")[1]?.trimEnd()).toBe(
      [
        "- m, extraction 02, runs 1, 3: amount",
        "- m, answers q, runs 1: Error: a b",
        "- m, charts q: c, runs 1: no reason given",
        `- m, answers r, runs 1: ${"x".repeat(300)}... (cut, full text in results.json)`,
      ].join("\n")
    );
  });

  it("names its transport in the header, so a recorded report cannot pass as the live one", () => {
    const summaries = summarize([result("m", "extraction", "01", 1, true)]);

    const text = renderReport({
      transport: "recorded",
      models: ["m"],
      runs: 1,
      summaries,
      results: [],
      defaults: { chat: "m", document: "m" },
      date: "2026-11-01",
    });

    expect(text.split("\n").slice(0, 3).join("\n")).toContain(
      "recorded test model"
    );
    expect(text).not.toContain("live models");
  });
});
