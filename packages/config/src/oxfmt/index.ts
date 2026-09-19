import type { OxfmtConfig } from "oxfmt";

/**
 * The one formatter configuration for this repository.
 *
 * It sets no style option. Every rule this repository states is already an oxfmt
 * default: 2 spaces, semicolons, double quotes, trailing commas, print width 100.
 * See https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html
 */
export const sharedOxfmtConfig: OxfmtConfig = {
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.nx/**",
    "**/coverage/**",
    "pnpm-lock.yaml",
    // Generated from MODULE_INCLUDE. The generator owns its shape (ADR 0008).
    "apps/genie/src/modules.ts",
    // Vendored upstream source. Reformatting it would corrupt the three-way merge
    // that an anti-slop update depends on (R-5a).
    "packages/config/oxlint/anti-slop/**",
    // Approved planning documents. Reformatting every table in docs/ would bury this
    // ticket's real diff. Reopen by deleting this line once the code tree is stable.
    "docs/**",
    // Tool state and documents that predate this ticket. oxfmt formats what this
    // repository owns as source.
    ".beads/**",
    ".claude/**",
    ".agents/**",
    ".impeccable/**",
    "graft/**",
    "plans/**",
    "README.md",
    "DESIGN.md",
    "PRODUCT.md",
  ],
  // Built in, so it replaces an import-sorting lint plugin at no cost.
  sortImports: true,
};
