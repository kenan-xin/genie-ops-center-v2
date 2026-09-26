import { describe, expect, it } from "vitest";

import { renderModule } from "./render.ts";

/**
 * The generated integration guard, beside the other rendered-output suites.
 *
 * A generated module's `test:integration` must not be a bare vitest run: that
 * cannot see a mandatory case a `-t` filter removed while the file still
 * collects, so a generated module's router and schema proof could stop running
 * while the package reports green. The generator therefore emits the same three
 * pieces the placeholder carries: the manifest of mandatory cases beside the
 * integration test it names, the runner entrypoint that shares core's runner,
 * and the manifest script that goes through the entrypoint.
 */
const files = renderModule({ id: "demo" });

function read(path: string): string {
  const content = files.get(path);

  if (content === undefined) {
    throw new Error(`the generator rendered no ${path}`);
  }

  return content;
}

/**
 * The integration cases of the generated `testing/router.integration.test.ts`,
 * as vitest reports their full names, derived from the same template that
 * writes the file.
 */
const ROUTER_CASES = [
  "the demo schema against a real database applies its own migration and holds a real row",
  "the demo schema against a real database records its history in its own ledger, apart from core's",
  "the demo read procedure refuses a caller the stub grants nothing, and returns no row",
  "the demo read procedure refuses the Section 0 stub principal, which holds another module's key",
];

describe("the rendered integration guard", () => {
  it("routes test:integration through the required-execution runner", () => {
    // SAFETY: the bytes are the generator's own JSON template; the one field
    // read below is asserted against an expected value rather than trusted.
    const manifest = JSON.parse(read("packages/modules/demo/package.json")) as {
      scripts: Record<string, string>;
    };

    expect(manifest.scripts["test:integration"]).toBe(
      "node tools/run-required-tests.ts"
    );
  });

  it("renders a runner entrypoint that shares core's runner", () => {
    const runner = read("packages/modules/demo/tools/run-required-tests.ts");

    expect(runner).toContain("@genie/core/testing/required-tests-runner");
    expect(runner).toContain("runRequiredTests");
    expect(runner).toContain("vitest.integration.config.ts");
    expect(runner).toContain("genie-module-demo-required-");
  });

  it("renders the module's own required-case manifest", () => {
    const guard = read("packages/modules/demo/testing/required-tests-guard.ts");

    expect(guard).toContain("export const REQUIRED_TESTS");
    expect(guard).toContain("testing/router.integration.test.ts");

    for (const name of ROUTER_CASES) {
      expect(guard, name).toContain(name);
    }
  });
});
