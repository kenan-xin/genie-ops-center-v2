import { describe, expect, it } from "vitest";

import { lintAt } from "./__testing__/lint-at.ts";
import { sharedOxlintConfig } from "./index.ts";

describe("the vendored anti-slop rules run through the shared lint target", () => {
  it("rejects an adjacent filter and map pair", () => {
    const result = lintAt(
      "packages/config/src/__antislop__.ts",
      `export const a = [1, 2].filter((n) => n > 1).map((n) => n + 1);\n`,
    );

    expect(result.failed).toBe(true);

    expect(result.output).toMatch(/no-array-filter-map/);
  });

  it("rejects a chained type assertion that fabricates evidence", () => {
    const result = lintAt(
      "packages/config/src/__antislop__.ts",
      `export const a = ({} as unknown) as { id: string };\n`,
    );

    expect(result.failed).toBe(true);

    expect(result.output).toMatch(/no-chained-type-assertions/);
  });

  it("rejects module mocking, because this repository uses real seams", () => {
    const result = lintAt(
      "packages/config/src/__antislop__.test.ts",
      `import { vi } from "vitest";\nvi.mock("node:fs");\n`,
    );

    expect(result.failed).toBe(true);

    expect(result.output).toMatch(/no-module-mocking/);
  });

  it("leaves ordinary code alone", () => {
    const result = lintAt(
      "packages/config/src/__antislop__.ts",
      `export function add(left: number, right: number): number {\n  return left + right;\n}\n`,
    );

    expect(result.failed).toBe(false);
  });

  it("does not enable any Effect rule, because this repository has not adopted Effect", () => {
    const ruleNames = Object.keys(sharedOxlintConfig.rules ?? {});
    expect(ruleNames.filter((name) => name.startsWith("anti-slop-effect/"))).toEqual([]);
  });

  it("does not register the Effect plugin entry point", () => {
    const serialized = JSON.stringify(sharedOxlintConfig.jsPlugins ?? []);

    expect(serialized.includes("effect")).toBe(false);
  });
});
