import type { OxlintConfig } from "oxlint";

/**
 * The one Oxlint configuration for this repository.
 * Task 5 adds the import-direction overrides. Task 6 adds the vendored rules.
 */
export const sharedOxlintConfig: OxlintConfig = {
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.nx/**",
    "**/coverage/**",
    "apps/genie/src/modules.ts",
    "packages/config/oxlint/anti-slop/**",
  ],
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "error",
  },
  rules: {
    "oxc/no-accumulating-spread": "error",
  },
  overrides: [
    // Reserved entrypoints. Each file exists so its package resolves, and stays
    // empty until the ticket that owns it adds real exports. Delete a path from
    // this list when that happens, and delete the whole entry when the list
    // empties.
    {
      files: [
        "apps/genie/src/index.ts",
        "packages/core/src/index.ts",
        "packages/ui/src/index.ts",
        "packages/core/src/lib/tenant-config/index.ts",
      ],
      rules: {
        "unicorn/require-module-specifiers": "off",
      },
    },
  ],
};
