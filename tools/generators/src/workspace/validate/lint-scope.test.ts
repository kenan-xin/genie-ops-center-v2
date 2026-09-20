import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

type ConfigManifest = { readonly scripts: { readonly lint: string } };

describe("the config package lint scope", () => {
  // `tsconfig.base.json` is not here: it is JSONC, which oxlint does not lint.
  // The compiler reads it through `extends`, so `nx typecheck` is its check.
  it("lints the root TypeScript config files, which no other Nx target reads", () => {
    // SAFETY: this is the repository's own tracked manifest; the assertions
    // below fail loudly when the lint script is absent.
    const manifest = JSON.parse(
      readFileSync(join(WORKSPACE_ROOT, "packages/config/package.json"), "utf8")
    ) as ConfigManifest;

    // Tokens, not substrings: the script also names `oxlint.config.ts` as the
    // `--config` value, and only a positional token proves it is linted.
    const tokens = manifest.scripts.lint.split(/\s+/u);

    expect(tokens).toContain("oxlint.config.ts");
    expect(tokens).toContain("oxfmt.config.ts");
  });
});
