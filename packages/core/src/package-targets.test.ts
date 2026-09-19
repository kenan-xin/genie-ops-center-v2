import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  UNIT_TEST_EXCLUDE,
  UNIT_TEST_INCLUDE,
} from "@genie/config/vitest/unit";
import { afterAll, describe, expect, it } from "vitest";

import {
  WORKSPACE_ROOT,
  cleanUpProbeRoots,
  probe,
} from "./__testing__/target-probe.ts";

const VITEST = join(WORKSPACE_ROOT, "node_modules/.bin/vitest");

const OXLINT = join(WORKSPACE_ROOT, "node_modules/.bin/oxlint");

const TSC = join(WORKSPACE_ROOT, "node_modules/.bin/tsc");

const PASSING = `import { expect, it } from "vitest";\nit("passes", () => { expect(1).toBe(1); });\n`;

const FAILING = `import { expect, it } from "vitest";\nit("fails", () => { expect(1).toBe(2); });\n`;

function vitestConfig(): string {
  return [
    `import { defineConfig } from "vitest/config";`,
    `export default defineConfig({ test: {`,
    `  environment: "node",`,
    `  include: ${JSON.stringify([...UNIT_TEST_INCLUDE])},`,
    `  exclude: ${JSON.stringify([...UNIT_TEST_EXCLUDE])},`,
    `  passWithNoTests: false,`,
    `} });`,
  ].join("\n");
}

// Vitest ends a passing worker without firing "exit", so the probe's own exit
// handler cannot be the only cleanup path. afterAll still runs.
afterAll(() => {
  cleanUpProbeRoots();
});

describe("unit collection, run through the real vitest binary", () => {
  it("collects src and contracts and leaves testing alone", () => {
    const result = probe(
      [
        { path: "package.json", source: `{\n  "type": "module"\n}\n` },
        { path: "vitest.config.ts", source: vitestConfig() },
        { path: "src/in-src.test.ts", source: PASSING },
        { path: "contracts/in-contracts.test.ts", source: PASSING },
        { path: "testing/in-testing.test.ts", source: FAILING },
      ],
      VITEST,
      ["run", "--reporter=json", "--outputFile=report.json"]
    );

    expect(result.failed).toBe(false);

    const report: { testResults: readonly { name: string }[] } = JSON.parse(
      readFileSync(join(result.root, "report.json"), "utf8")
    );

    const collected = report.testResults.map((entry) => entry.name);

    expect(collected).toHaveLength(2);
    expect(collected.some((name) => name.includes("in-src"))).toBe(true);
    expect(collected.some((name) => name.includes("in-contracts"))).toBe(true);
    expect(collected.some((name) => name.includes("in-testing"))).toBe(false);
  });
});

function coreLintPaths(): readonly string[] {
  const manifest: { scripts: { lint: string } } = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "packages/core/package.json"), "utf8")
  );

  return manifest.scripts.lint.split(" ").slice(3);
}

function coreTsconfigInclude(): readonly string[] {
  const config: { include: readonly string[] } = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "packages/core/tsconfig.json"), "utf8")
  );

  return config.include;
}

// One `let` per statement is the rule the formatter applies, so the violation is stable.
const LINT_VIOLATION = `export const value: string = "x" as string as string;\n`;

const TYPE_ERROR = `export const value: number = "not a number";\n`;

describe("the core lint scope", () => {
  it.each(["contracts", "testing"])("reaches %s", (folder) => {
    const result = probe(
      [{ path: `${folder}/offender.ts`, source: LINT_VIOLATION }],
      OXLINT,
      ["--config", join(WORKSPACE_ROOT, "oxlint.config.ts"), ...coreLintPaths()]
    );

    expect(result.failed).toBe(true);
    expect(result.output).toContain("offender.ts");
  });
});

describe("the core typecheck scope", () => {
  it.each(["contracts", "testing"])("reaches %s", (folder) => {
    const tsconfig = JSON.stringify({
      extends: join(WORKSPACE_ROOT, "tsconfig.base.json"),
      include: coreTsconfigInclude().filter(
        (pattern) => pattern !== "vitest.config.ts"
      ),
    });

    const result = probe(
      [
        { path: "tsconfig.json", source: tsconfig },
        { path: `${folder}/offender.ts`, source: TYPE_ERROR },
      ],
      TSC,
      ["--noEmit", "-p", "tsconfig.json"]
    );

    expect(result.failed).toBe(true);
    expect(result.output).toContain("offender.ts");
  });
});
