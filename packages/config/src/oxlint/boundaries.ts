import type { OxlintOverride } from "oxlint";

type RestrictedGroup = {
  readonly group: readonly string[];
  readonly message: string;
};

function restrict(
  files: readonly string[],
  patterns: readonly RestrictedGroup[]
): OxlintOverride {
  return {
    files: [...files],
    rules: {
      "no-restricted-imports": [
        "error",
        // Oxlint's schema wants mutable string arrays, so each group is copied.
        {
          patterns: patterns.map((p) => ({
            group: [...p.group],
            message: p.message,
          })),
        },
      ],
    },
  };
}

// Each layer is caught under every spelling: the package specifier, its subpaths,
// the folder glob for a specifier-free path, and the `..` form for a relative
// import that names a sibling folder. Oxlint matches the raw specifier string,
// so `../../core/src/index.ts` never contains `packages/` and needs its own glob.
const CORE = [
  "@genie/core",
  "@genie/core/**",
  "**/packages/core/**",
  "**/../core/**",
];

// A scoped package name holds exactly one slash, so `@genie/modules/<id>` is
// not a legal package name and can never appear in a real import. The hyphen
// form is the realizable spelling, as `tools/generators` fixtures already use.
// The slash forms stay only because the boundary table in
// `docs/specs/00-monorepo-foundation.md` writes them.
const MODULES = [
  "@genie/modules-*",
  "@genie/modules-*/**",
  "@genie/modules/*",
  "@genie/modules/**",
  "**/packages/modules/**",
  "**/../modules/**",
];

// `apps/*` is a folder glob, not a package name. Apps are imported by path, if
// at all, so the path spellings here are the realizable ones.
const APPS = [
  "apps/*",
  "apps/**",
  "**/apps/genie/**",
  "**/apps/storybook/**",
  "**/../apps/**",
];

const CUSTOMERS = [
  "customers/*",
  "customers/**",
  "**/customers/**",
  "**/../customers/**",
];

const DRIVERS = [
  "pg",
  "pg/**",
  "drizzle-orm/node-postgres",
  "@genie/core/services/**",
  "**/packages/core/src/services/database/**",
  "**/../core/src/services/database/**",
];

const INTERNAL = [
  ...CORE,
  ...MODULES,
  ...APPS,
  ...CUSTOMERS,
  "@genie/ui",
  "@genie/ui/**",
  "**/packages/ui/**",
  "**/../ui/**",
];

// One entry per layer, in this order: when two entries match one file, the last
// entry wins for a rule it sets, so a layer's drivers entry lives inside the
// layer's own entry and the contracts entry follows the core entry.

export const importBoundaryOverrides: OxlintOverride[] = [
  restrict(
    ["packages/ui/**"],
    [
      {
        group: CORE,
        message: "ui imports nothing internal. Move the shared piece into ui.",
      },
      { group: MODULES, message: "ui imports no module." },
      { group: APPS, message: "ui imports no app." },
      { group: CUSTOMERS, message: "ui imports no customer folder." },
      { group: DRIVERS, message: "only core opens a connection (DEC-34)." },
    ]
  ),
  restrict(
    ["packages/core/**"],
    [
      {
        group: MODULES,
        message:
          "core never imports a module. Extend the module contract instead.",
      },
      {
        group: APPS,
        message:
          "core never imports an app. A capability that needs one is a defect in core.",
      },
      {
        group: CUSTOMERS,
        message: "core never imports a customer folder.",
      },
    ]
  ),
  restrict(
    ["packages/core/contracts/**"],
    [
      {
        group: ["*", "!zod", "!zod/**"],
        message: "contracts import only zod and types (DEC-42).",
      },
    ]
  ),
  restrict(
    ["packages/modules/*/**"],
    [
      { group: MODULES, message: "a module never imports another module." },
      { group: APPS, message: "a module never imports an app." },
      {
        group: CUSTOMERS,
        message: "a module never imports a customer folder.",
      },
      {
        group: DRIVERS,
        message: "a module reads the database through ctx.tenant.db (DEC-34).",
      },
    ]
  ),
  restrict(
    ["apps/**", "customers/**"],
    [{ group: DRIVERS, message: "an app opens no connection (DEC-34)." }]
  ),
  restrict(
    ["packages/config/**"],
    [
      {
        group: INTERNAL,
        message: "config imports no internal project (R-7a).",
      },
      {
        group: DRIVERS,
        message: "config opens no database connection (DEC-34).",
      },
    ]
  ),
  restrict(
    ["tools/**"],
    [
      {
        group: MODULES,
        message:
          "tooling reads module metadata as data. It never imports a module.",
      },
      { group: APPS, message: "tooling never imports an app." },
      {
        group: [
          "@genie/core",
          "@genie/core/index",
          "**/packages/core/src/index.ts",
          "**/../core/src/index.ts",
        ],
        message:
          "tooling uses the build-safe core schema entrypoints only, never the runtime entrypoint (R-7a).",
      },
      {
        group: DRIVERS,
        message: "tooling opens no database connection (DEC-34).",
      },
    ]
  ),
];
