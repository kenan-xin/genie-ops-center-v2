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
};
