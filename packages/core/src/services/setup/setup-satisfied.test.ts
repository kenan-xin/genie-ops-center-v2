import { describe, expect, it } from "vitest";

import { type SetupStepView, setupSatisfied, stepSettled } from "./index.ts";

function step(name: string, state: SetupStepView["state"]): SetupStepView {
  return { step: name, state, detail: null };
}

describe("the setup gate (R-15, R-54a)", () => {
  it("is satisfied when every step is done", () => {
    expect(
      setupSatisfied([
        step("migrations", "done"),
        step("seed", "done"),
        step("realm", "done"),
        step("clients", "done"),
      ])
    ).toBe(true);
  });

  it("is satisfied when the realm and clients steps are skipped in client-only mode", () => {
    expect(
      setupSatisfied([
        step("migrations", "done"),
        step("seed", "done"),
        step("realm", "skipped"),
        step("clients", "skipped"),
        step("roles", "done"),
      ])
    ).toBe(true);
  });

  it("is not satisfied while a step is pending or failed", () => {
    expect(
      setupSatisfied([step("migrations", "done"), step("seed", "pending")])
    ).toBe(false);

    expect(
      setupSatisfied([step("migrations", "done"), step("seed", "failed")])
    ).toBe(false);
  });

  it("treats skipped as settled only for realm and clients (one predicate)", () => {
    expect(stepSettled("realm", "skipped")).toBe(true);
    expect(stepSettled("clients", "skipped")).toBe(true);
    expect(stepSettled("roles", "skipped")).toBe(false);

    // The gate uses the same predicate, so a stray `skipped` row on another step does not open it.
    expect(
      setupSatisfied([step("migrations", "done"), step("roles", "skipped")])
    ).toBe(false);
  });
});
