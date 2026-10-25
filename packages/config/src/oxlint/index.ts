import type { OxlintConfig, OxlintOverride } from "oxlint";

import { importBoundaryOverrides } from "./boundaries.ts";
import { NON_PRODUCT_FILE_PATTERNS } from "./non-product-files.ts";

/**
 * Reserved entrypoints. Each file exists so its package resolves, and stays
 * empty until the ticket that owns it adds real exports. Delete a path from
 * this list when that happens, and delete the whole entry when the list
 * empties.
 *
 * The override suppresses a real diagnostic. Verified 2026-09-20
 * (genie-ops-center-v2-k3c) against the four paths the list held then:
 * without it, oxlint reports `unicorn(require-module-specifiers): Empty
 * export specifier is not allowed` on every one of them. Removing the
 * `export {}` line does not avoid the override, because oxlint then reports
 * `unicorn(no-empty-file): Empty files are not allowed` on the same files.
 * That four is the historical probe result, not the current entry count:
 * `packages/ui/src/index.ts` left the list once it gained real exports.
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
 * The six Tailwind design-system rules `@shadcn/lint` ships, all at error. They
 * read JSX class strings, helper calls, and style props, so a TypeScript file
 * with no JSX simply produces no findings.
 */
const shadcnDesignSystemRules: OxlintOverride["rules"] = {
  // Layout may place a component; heights stay closed (R-5, tokens.md "Control heights").
  "shadcn/no-restyle": [
    "error",
    { allow: ["layout"], deny: ["h-*", "min-h-*", "max-h-*", "size-*"] },
  ],
  "shadcn/no-raw-colors": "error",
  "shadcn/no-arbitrary-values": "error",
  "shadcn/no-inline-styles": "error",
  "shadcn/no-unknown-classes": "error",
  "shadcn/require-static-classes": "error",
};

/**
 * Product code that renders UI, where the design-system rules apply. The
 * arbitrary-value ban matches the fixed token layer, which forbids arbitrary
 * pixel sizes in every component (`docs/design/design-system/tokens.md`).
 */
const shadcnProductOverride: OxlintOverride = {
  files: [
    "packages/ui/src/**",
    // Browser-safe core feature UI (docs/architecture/ui-development.md). Placement must not
    // decide whether a screen follows the design system, so these files get the same rules as an
    // app screen: tokens, no raw palette classes.
    "packages/core/src/features/**",
    "apps/genie/src/**",
    "packages/modules/*/src/**",
    "customers/*/app/**",
  ],
  rules: shadcnDesignSystemRules,
};

/**
 * Tests, stories, and fixtures are not the shipping surface: a story sets up a
 * state with classes the product would not ship, so the design-system rules are
 * turned off there. This entry follows the product entry, and the last matching
 * entry wins for a rule it sets.
 */
const shadcnNonProductOverride: OxlintOverride = {
  files: [...NON_PRODUCT_FILE_PATTERNS],
  rules: Object.fromEntries(
    Object.keys(shadcnDesignSystemRules).map((rule) => [rule, "off"])
  ),
};

/**
 * The one accepted exception to the design-system rules, and the reason it is accepted. The core
 * branding head writes the tenant branding layer per request in one `<style>` element (Spec 3
 * R-12, R-16, D3-5): the declarations on `:root`, unlayered so they beat the fixed defaults. A
 * theme CSS file cannot hold them, because they differ per deployment and change at run time. The
 * exception is one exact file and one rule.
 */
const shadcnBrandingStyleException: OxlintOverride = {
  files: ["packages/core/src/features/shell/branding-head.tsx"],
  rules: {
    "shadcn/no-inline-styles": "off",
  },
};

/**
 * Fixed status tones (tokens.md "Forms": field error red-700; "Color roles": status is semantic)
 * have no role, so these files may name a palette color: the pills, the field error and the toast icons.
 */
const shadcnFixedToneException: OxlintOverride = {
  files: [
    "packages/ui/src/components/badge.tsx",
    "packages/ui/src/components/field.tsx",
    "packages/ui/src/parts/toast.tsx",
  ],
  rules: {
    "shadcn/no-raw-colors": "off",
  },
};

/** `@genie/ui` is the owner that `design-system/single-owner` protects, so it may declare the parts. */
const designSystemOwnerOverride: OxlintOverride = {
  files: ["packages/ui/**"],
  rules: { "design-system/single-owner": "off" },
};

/**
 * The one Oxlint configuration for this repository.
 *
 * The vendored anti-slop plugin lives at `packages/config/oxlint/anti-slop/`
 * with its licence and provenance beside it. The five Effect rules are not
 * registered; Effect adoption needs separate approval (Spec 0 R-5a).
 *
 * The `shadcn` plugin is the published `@shadcn/lint`, resolved from the
 * workspace root, where the config that names it lives. This change installs
 * neither of its optional peers: `@typescript-eslint/parser` is absent, and
 * the `eslint` 10.11.0 pnpm binds that peer to is a pre-existing root
 * devDependency kept only for `@nx/eslint`'s peer contract (556289c), with no
 * ESLint configuration or target, so no ESLint runs.
 */
export const sharedOxlintConfig: OxlintConfig = {
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.nx/**",
    "**/coverage/**",
    // Scratch state a local coverage tool writes. It is JSON, never source.
    ".supercov/**",
    // The plain-Node CommonJS check of the optional Codex hooks. It sits
    // outside every package and runs under `node`, not under this toolchain.
    ".claude/helpers/**",
    // Agent skills installed from upstream. The install-anti-slop skill ships its
    // own copy of the rule source as assets, which the vendored copy below
    // already covers, so linting the assets would only double the findings.
    ".claude/skills/**",
    ".agents/skills/**",
    ".opencode/skills/**",
    // Screen-design sketches kept as a visual reference, never built on
    // (docs/design/reference/README.md). No project lints them, so the
    // pre-commit hook must not either, or a one-line copy edit fails on
    // unrelated sketch code.
    "docs/design/reference/**",
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
    {
      name: "boundaries",
      specifier: "./packages/config/oxlint/boundaries/index.ts",
    },
    {
      name: "design-system",
      specifier: "./packages/config/oxlint/design-system/index.ts",
    },
    {
      name: "shadcn",
      specifier: "@shadcn/lint",
    },
  ],
  settings: {
    // The plugin reads `settings.shadcn`. `ui` names the design-system package
    // prefix, so `@genie/ui` and `@genie/ui/...` imports are recognized as
    // components. The built-in class-function list already covers `cn`,
    // `twMerge`, `clsx` and `classNames`, so `mergeFunctions` stays unset: this
    // repository has no custom class-merge helper to add (2026-09-24).
    shadcn: {
      ui: "@genie/ui",
    },
  },
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "error",
  },
  rules: {
    "oxc/no-accumulating-spread": "error",
    "boundaries/no-relative-package-escape": "error",
    "design-system/single-owner": "error",
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
  overrides: [
    reservedEntrypointOverride,
    ...importBoundaryOverrides,
    shadcnProductOverride,
    shadcnNonProductOverride,
    shadcnBrandingStyleException,
    shadcnFixedToneException,
    designSystemOwnerOverride,
  ],
};
