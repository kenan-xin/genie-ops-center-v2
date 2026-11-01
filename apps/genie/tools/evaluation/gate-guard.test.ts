import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const SKIPPED = new Set(["node_modules", ".git", ".nx", ".next", "dist"]);

/**
 * Every file that can name a script or an Nx target: the root and package manifests, the project
 * files and `nx.json`. `gate:merge` runs only scripts and targets these files define.
 */
const MANIFESTS = globSync("**/{package.json,project.json,nx.json}", {
  cwd: ROOT,
  exclude: (path) => SKIPPED.has(String(path).split("/").at(-1) ?? ""),
});

describe("the model evaluation and the gates", () => {
  it("is started by no script and no Nx target, so no gate calls a live model", () => {
    expect(MANIFESTS).toContain("package.json");
    expect(MANIFESTS).toContain("apps/genie/package.json");

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
