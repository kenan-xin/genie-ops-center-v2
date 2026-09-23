import type { OxfmtConfig } from "oxfmt";

/**
 * The one formatter configuration for this repository.
 *
 * Only the owner's three choices and the ignore list are stated. Everything else
 * keeps the oxfmt default. See
 * https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html
 */
export const sharedOxfmtConfig: OxfmtConfig = {
  // Owner's choices, 2026-09-19. Everything not listed keeps the oxfmt default.
  // Narrower than the oxfmt default of 100, which the tool recommends for
  // TypeScript. The owner prefers 80.
  printWidth: 80,
  // Trailing commas in arrays and objects, but not in function parameter lists.
  trailingComma: "es5",
  // Quote every property in an object once any one of them needs quoting.
  quoteProps: "consistent",
  // oxfmt recommends ignorePatterns over a separate ignore file for a new
  // project, and it is the stronger guard: a path listed here cannot be
  // formatted even when a caller names it directly, which is how the
  // pre-commit hook invokes the formatter.
  // https://oxc.rs/docs/guide/usage/formatter/ignore-files.html
  ignorePatterns: [
    // Prose. Markdown is written by hand, and reflowing it churns documents
    // without improving them.
    "**/*.md",
    "**/*.mdx",

    // State owned by other tools.
    ".beads/**",
    ".claude/**",
    ".cursor/**",
    ".agents/**",
    ".impeccable/**",
    ".supercov/**",
    "graft/**",

    // Diagram sources and generated HTML live here beside the prose.
    "docs/**",

    // Vendored upstream source. Reformatting it would break the three-way
    // merge that an anti-slop update depends on (R-5a).
    "packages/config/oxlint/anti-slop/**",

    // A test fixture that must throw on evaluation. A formatter rewriting it
    // could only ever make that proof weaker.
    "tools/generators/src/selection/__fixtures__/**",

    // Transient lint fixtures. The boundary, wiring and anti-slop suites write
    // these into a real project path to prove one override glob, then delete
    // them, while a concurrent `format:check` walks the same tree and reads what
    // it finds. The anti-slop suite's chained-assertion body is not oxfmt-clean,
    // so a check overlapping it fails on the fixture itself
    // (genie-ops-center-v2-bew). The prefixes are the same ones the root tsconfig,
    // `.eslintignore` and the shared Vitest preset exclude, and no tracked file
    // carries them, so the guard hides no source.
    "**/__boundary__*",
    "**/__wiring__*",
    "**/__antislop__*",

    // Generated at build time from MODULE_INCLUDE (ADR 0008).
    "apps/genie/src/modules.ts",

    // Build output. Also gitignored, but repeated here so a direct
    // invocation cannot reach it.
    "**/dist/**",
    "**/coverage/**",
    "**/.nx/**",

    // Playwright's own output. Written by every browser run, so a `--check`
    // after one would otherwise report formatting inside a JSON trace file
    // the runner owns.
    "**/test-results/**",
    "**/playwright-report/**",
  ],
  // Built in, so it replaces an import-sorting lint plugin at no cost.
  sortImports: true,
};
