import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKSPACE_ROOT, probe } from "./__testing__/target-probe.ts";

const VITEST = join(WORKSPACE_ROOT, "node_modules/.bin/vitest");

const OXLINT = join(WORKSPACE_ROOT, "node_modules/.bin/oxlint");

const TSC = join(WORKSPACE_ROOT, "node_modules/.bin/tsc");

const PASSING = `import { expect, it } from "vitest";\nit("passes", () => { expect(1).toBe(1); });\n`;

const FAILING = `import { expect, it } from "vitest";\nit("fails", () => { expect(1).toBe(2); });\n`;

function vitestConfig(): string {
  return readFileSync(
    join(WORKSPACE_ROOT, "packages/core/vitest.config.ts"),
    "utf8"
  );
}

describe("unit collection, run through the real vitest binary", () => {
  it("collects src and contracts and leaves testing alone", () => {
    const result = probe(
      [
        { path: "package.json", source: `{\n  "type": "module"\n}\n` },
        { path: "vitest.config.ts", source: vitestConfig() },
        { path: "src/in-src.test.ts", source: PASSING },
        { path: "contracts/in-contracts.test.ts", source: PASSING },
        { path: "testing/in-testing.test.ts", source: FAILING },
        { path: "src/excluded.stories.test.ts", source: FAILING },
        { path: "contracts/excluded.stories.test.ts", source: FAILING },
      ],
      VITEST,
      ["run", "--reporter=json", "--outputFile=report.json"],
      join(WORKSPACE_ROOT, "packages/core/node_modules")
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
    expect(collected.some((name) => name.includes("stories"))).toBe(false);
  });
});

function coreLintPaths(): readonly string[] {
  const manifest: { scripts: { lint: string } } = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "packages/core/package.json"), "utf8")
  );

  const tokens: readonly string[] = manifest.scripts.lint.split(" ");

  // Anchor on the --config flag, not token position, so a reordered script
  // still yields the scope paths.
  return tokens
    .slice(tokens.indexOf("--config") + 2)
    .filter((token) => !token.startsWith("-"));
}

function coreTsconfigInclude(): readonly string[] {
  const config: { include: readonly string[] } = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "packages/core/tsconfig.json"), "utf8")
  );

  return config.include;
}

function coreSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    return entry.isDirectory() ? coreSourceFiles(path) : [path];
  });
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

describe("the core integration UI boundary", () => {
  it("ships no integration page component", () => {
    const sourceRoot = join(WORKSPACE_ROOT, "packages/core/src");

    const integrationComponents = coreSourceFiles(sourceRoot).filter((path) => {
      if (!/\.(?:tsx|jsx)$/i.test(path)) return false;

      return (
        /integration/i.test(relative(sourceRoot, path)) ||
        /integration/i.test(readFileSync(path, "utf8"))
      );
    });

    expect(
      integrationComponents.map((path) => relative(sourceRoot, path))
    ).toEqual([]);
  });
});
