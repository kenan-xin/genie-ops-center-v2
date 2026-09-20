import type { OxlintOverride } from "oxlint";

type RestrictedGroup = {
  readonly group: readonly string[];
  readonly message: string;
  /** Oxlint defaults this to false. Only the contracts entry sets it (R-7, DEC-42). */
  readonly allowTypeImports?: boolean;
};

/** The shape Oxlint's `no-restricted-imports` schema accepts, ready to serialize. */
type SerializedRestrictedGroup = {
  group: string[];
  message: string;
  allowTypeImports?: boolean;
};

/**
 * Copies one restricted group into the shape Oxlint accepts. Oxlint's schema wants
 * mutable string arrays, so each group is copied. `allowTypeImports` is added only
 * when the caller set it, so every other entry keeps the exact shape it had before.
 */
function serializeRestrictedGroup(
  pattern: RestrictedGroup
): SerializedRestrictedGroup {
  const serialized: SerializedRestrictedGroup = {
    group: [...pattern.group],
    message: pattern.message,
  };

  if (pattern.allowTypeImports !== undefined) {
    serialized.allowTypeImports = pattern.allowTypeImports;
  }

  return serialized;
}

function restrict(
  files: readonly string[],
  patterns: readonly RestrictedGroup[]
): OxlintOverride {
  return {
    files: [...files],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: patterns.map(serializeRestrictedGroup),
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
// at all, so the path spellings here are the realizable ones. `@genie/app` is
// what `apps/genie/package.json` calls itself and `@genie/storybook` is the
// host's reserved name; a bare specifier contains no `apps/`, so no path glob
// can stand in for either, and both need their own two spellings.
const APPS = [
  "@genie/app",
  "@genie/app/**",
  "@genie/storybook",
  "@genie/storybook/**",
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

// The shared configuration package. A product package reaches it from a package
// configuration file only, never from code that ships or runs (R-7a).
const CONFIG = [
  "@genie/config",
  "@genie/config/**",
  "**/packages/config/**",
  "**/../config/**",
];

// The generators. These run at build time, so nothing that ships may reach them (R-7a).
const TOOLING = [
  "@genie/generators",
  "@genie/generators/**",
  "**/tools/generators/**",
  "**/../generators/**",
  "**/../tools/**",
];

const INTERNAL = [
  ...CORE,
  ...MODULES,
  ...APPS,
  ...CUSTOMERS,
  ...TOOLING,
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
        allowTypeImports: true,
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
        // The config package is an internal project too, so a file inside it
        // reaches its siblings relatively, as `packages/config/vitest.config.ts`
        // does, and never through the `@genie/config` specifier.
        group: [...INTERNAL, ...CONFIG],
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
