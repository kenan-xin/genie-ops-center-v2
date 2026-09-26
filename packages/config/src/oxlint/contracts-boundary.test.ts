import { describe, expect, it } from "vitest";

import { lintAt } from "./__testing__/lint-at.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- keep the lint fixture beside its assertion. */

describe("the core contracts import boundary", () => {
  it("reports a runtime import outside zod from packages/core/contracts", async () => {
    const path = `packages/core/contracts/__lint-fixture-${process.pid}.ts`;
    const result = await lintAt(
      path,
      'import { createTenantContext } from "@genie/core";\n\nvoid createTenantContext;\n'
    );

    expect(result.failed).toBe(true);
    expect(result.output).toContain("no-restricted-imports");
  });
});
