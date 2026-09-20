import type { OxlintConfig, OxlintOverride } from "oxlint";

import { importBoundaryOverrides } from "./boundaries.ts";

/**
 * Reserved entrypoints. Each file exists so its package resolves, and stays
 * empty until the ticket that owns it adds real exports. Delete a path from
 * this list when that happens, and delete the whole entry when the list
 * empties.
 *
 * The override suppresses a real diagnostic. Verified 2026-09-20
 * (genie-ops-center-v2-k3c): without it, oxlint reports
 * `unicorn(require-module-specifiers): Empty export specifier is not allowed`
 * on all four files. Removing the `export {}` line does not avoid the
 * override, because oxlint then reports `unicorn(no-empty-file): Empty files
 * are not allowed` on the same files.
 */
const reservedEntrypointOverride: OxlintOverride = {
  files: [
    "apps/genie/src/index.ts",
    "packages/core/src/index.ts",
    "packages/core/src/lib/tenant-config/index.ts",
  ],
  rules: {
    "unicorn/require-module-specifiers": "off",
  },
};

/**
 * The one Oxlint configuration for this repository.
 * Task 5 adds the import-direction overrides. Task 6 adds the vendored rules.
 *
 * The vendored anti-slop plugin lives at `packages/config/oxlint/anti-slop/`
 * with its licence and provenance beside it. The five Effect rules are not
 * registered; Effect adoption needs separate approval (Spec 0 R-5a).
 */
export const sharedOxlintConfig: OxlintConfig = {
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.nx/**",
    "**/coverage/**",
    "apps/genie/src/modules.ts",
    "packages/config/oxlint/anti-slop/**",
    // Test fixtures the resolver must never evaluate. The throwing fixture exists
    // to explode on evaluation, so no gate may process it.
    "tools/generators/src/selection/__fixtures__/**",
  ],
  jsPlugins: [
    {
      name: "anti-slop",
      specifier: "./packages/config/oxlint/anti-slop/index.ts",
    },
  ],
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "error",
  },
  rules: {
    "oxc/no-accumulating-spread": "error",
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-readable-spacing": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
  overrides: [reservedEntrypointOverride, ...importBoundaryOverrides],
};
