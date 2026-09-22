import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

const CONFIG_PRESET = "packages/config/src/vitest/unit.ts";

/** A shared schema `tools/generators` is allowed to import (R-31, R-7a). */
const EXPOSED_GENERATOR_SCHEMA =
  "packages/core/src/lib/tenant-config/tenant-yaml.ts";

/**
 * Lists the projects Nx would mark affected if only one file changed.
 * `--files` ignores the git working tree, so the assertion tests the graph edge alone.
 * The default affected base would instead report every branch commit and make the
 * assertion pass even without the edge.
 */
function affectedBy(file: string): readonly string[] {
  const raw = execFileSync(
    "pnpm",
    ["exec", "nx", "show", "projects", "--affected", "--json", "--files", file],
    {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
    }
  );

  // SAFETY: Nx prints one JSON array of project names. Every element is a string,
  // so the readonly string array shape holds for this exact output.
  return JSON.parse(raw) as readonly string[];
}

describe("the affected graph", () => {
  it("computes the real workspace root", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "pnpm-workspace.yaml"))).toBe(true);
  });

  it("marks every consumer affected when the shared config preset changes", () => {
    const affected = affectedBy(CONFIG_PRESET);

    expect(affected).toContain("@genie/config");
    expect(affected).toContain("@genie/generators");
    expect(affected).toContain("@genie/core");
    expect(affected).toContain("@genie/ui");
    expect(affected).toContain("@genie/app");
  });

  // AC-1's second half, carried from S0-06: a change to an exposed generator
  // schema invalidates the tasks that consume it, not only the package that owns
  // the file. The tenant-config schema is the one core entrypoint the generators
  // may import (R-7a, R-31), so it is the right file to pin this on.
  it("marks the generators affected when an exposed core schema changes", () => {
    const affected = affectedBy(EXPOSED_GENERATOR_SCHEMA);

    expect(affected).toContain("@genie/core");
    expect(affected).toContain("@genie/generators");
  });
});
