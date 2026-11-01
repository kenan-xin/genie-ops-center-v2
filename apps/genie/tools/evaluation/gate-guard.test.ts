import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const SKIPPED = new Set(["node_modules", ".git", ".nx", ".next", "dist"]);

/**
 * Every file that can start a command in a gate: the root and package manifests, the project
 * files, `nx.json`, the CI workflows and the git hooks (the dispatchers in `.githooks/`, the Beads
 * hooks they call, and `lefthook.yml`).
 */
const MANIFESTS = globSync(
  [
    "**/{package.json,project.json,nx.json}",
    ".github/workflows/*",
    ".githooks/*",
    ".beads/hooks/*",
    "lefthook.yml",
  ],
  {
    cwd: ROOT,
    exclude: (path) => SKIPPED.has(String(path).split("/").at(-1) ?? ""),
  }
);

describe("the model evaluation and the gates", () => {
  it("is started by no script, Nx target, workflow or hook, so no gate calls a live model", () => {
    expect(MANIFESTS).toContain("package.json");
    expect(MANIFESTS).toContain("apps/genie/package.json");
    expect(MANIFESTS).toContain(".github/workflows/develop.yml");
    expect(MANIFESTS).toContain(".githooks/pre-commit");
    expect(MANIFESTS).toContain("lefthook.yml");

    expect(
      MANIFESTS.filter((file) => {
        const text = readFileSync(`${ROOT}${file}`, "utf8");

        return (
          text.includes("tools/evaluation") ||
          text.includes("vitest.evaluation") ||
          text.includes("run.eval")
        );
      })
    ).toEqual([]);
  });
});
