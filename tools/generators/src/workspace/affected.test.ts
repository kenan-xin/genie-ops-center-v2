import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../..");

const CONFIG_PRESET = "packages/config/src/vitest/unit.ts";

/**
 * Lists the projects Nx would mark affected if only the shared vitest preset changed.
 * `--files` ignores the git working tree, so the assertion tests the graph edge alone.
 * The default affected base would instead report every branch commit and make the
 * assertion pass even without the edge.
 */
function affectedByConfigPresetChange(): readonly string[] {
  const raw = execFileSync(
    "pnpm",
    [
      "exec",
      "nx",
      "show",
      "projects",
      "--affected",
      "--json",
      "--files",
      CONFIG_PRESET,
    ],
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
  it("marks every consumer affected when the shared config preset changes", () => {
    const affected = affectedByConfigPresetChange();
    expect(affected).toContain("@genie/config");
    expect(affected).toContain("@genie/generators");
    expect(affected).toContain("@genie/core");
    expect(affected).toContain("@genie/ui");
    expect(affected).toContain("@genie/app");
  });
});
