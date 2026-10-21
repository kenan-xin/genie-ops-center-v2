import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CONFIG_ROOT = join(import.meta.dirname, "../..");

/**
 * The repository-owned Oxlint plugin. It is loaded by the `jsPlugins` specifier
 * in `packages/config/src/oxlint/index.ts`, which is a string, so nothing else
 * pulls it into the compiler program.
 */
const PLUGIN_FILES = [
  "oxlint/boundaries/index.ts",
  "oxlint/boundaries/rules/no-relative-package-escape.ts",
];

describe("the boundary plugin compiler coverage", () => {
  it("includes the authored plugin files in the typecheck program", () => {
    const listed = execFileSync("pnpm", ["exec", "tsc", "--listFilesOnly"], {
      cwd: CONFIG_ROOT,
      encoding: "utf8",
    });

    for (const file of PLUGIN_FILES) {
      expect(listed).toContain(join(CONFIG_ROOT, file));
    }
  });
});
