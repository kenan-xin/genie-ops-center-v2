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

const NO_CONFIG = {
  group: CONFIG,
  message:
    "product code never imports the shared configuration package (R-7a). Only a package configuration file consumes a preset.",
};

const NO_TOOLING = {
  group: TOOLING,
  message: "product code never imports a generator (R-7a).",
};

// Each layer list is used twice: once for the whole package, and once for the
// package configuration files, which keep every ban except the one on config.
const UI_LAYER: readonly RestrictedGroup[] = [
  {
    group: CORE,
    message: "ui imports nothing internal. Move the shared piece into ui.",
  },
  { group: MODULES, message: "ui imports no module." },
  { group: APPS, message: "ui imports no app." },
  { group: CUSTOMERS, message: "ui imports no customer folder." },
  { group: DRIVERS, message: "only core opens a connection (DEC-34)." },
  NO_TOOLING,
];

const CORE_LAYER: readonly RestrictedGroup[] = [
  {
    group: MODULES,
    message: "core never imports a module. Extend the module contract instead.",
  },
  {
    group: APPS,
    message:
      "core never imports an app. A capability that needs one is a defect in core.",
  },
  { group: CUSTOMERS, message: "core never imports a customer folder." },
  NO_TOOLING,
];

const MODULE_LAYER: readonly RestrictedGroup[] = [
  { group: MODULES, message: "a module never imports another module." },
  { group: APPS, message: "a module never imports an app." },
  { group: CUSTOMERS, message: "a module never imports a customer folder." },
  {
    group: DRIVERS,
    message: "a module reads the database through ctx.tenant.db (DEC-34).",
  },
  NO_TOOLING,
];

const APP_LAYER: readonly RestrictedGroup[] = [
  { group: DRIVERS, message: "an app opens no connection (DEC-34)." },
  NO_TOOLING,
];

// A sibling module is reached by climbing out of the module's own folder, and
// that spelling carries no `modules/` segment, so no folder glob in `MODULES`
// can see it. How far `..` has to climb depends on how deep the importing file
// sits, and oxlint matches the raw specifier, never a resolved path. The ban is
// therefore owner-aware by being depth-aware: one entry per depth, each one
// banning exactly the climb that leaves that file's own module. From
// `alpha/src/x.ts` that rejects `../../beta/src/index.ts` while leaving
// `../lib/x.ts` alone, and from `alpha/src/nested/x.ts` the identical string
// `../../utils/x.ts` stays allowed, because there it lands inside alpha.
// Ceiling: a file more than three folders below its module root is not covered.
// Add the next depth here when a module grows one.
const MODULE_FOLDER_DEPTHS = [0, 1, 2, 3];

/** Files exactly `depth` directories below a module's own root. */
function moduleFilesAtDepth(depth: number): string {
  return `packages/modules/*/${"*/".repeat(depth)}*`;
}

/** The climb that leaves a module whose importing file sits at `depth`. */
function siblingModulesAtDepth(depth: number): RestrictedGroup {
  const climb = "../".repeat(depth + 1);

  return {
    group: [`${climb}*`, `${climb}*/**`],
    message: "a module never imports another module.",
  };
}

// One entry per layer, in this order: when two entries match one file, the last
// entry wins for a rule it sets, so a layer's drivers entry lives inside the
// layer's own entry and the contracts entry follows the core entry. An exception
// entry repeats its whole layer list for the same reason, and follows the entry
// it excepts. These globs use no brace expansion, because that behavior is not
// proved here.

export const importBoundaryOverrides: OxlintOverride[] = [
  restrict(["packages/ui/**"], [...UI_LAYER, NO_CONFIG]),
  restrict(["packages/ui/*.config.ts", "packages/ui/*.config.mts"], UI_LAYER),
  restrict(["packages/core/**"], [...CORE_LAYER, NO_CONFIG]),
  restrict(
    ["packages/core/*.config.ts", "packages/core/*.config.mts"],
    CORE_LAYER
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
  restrict(["packages/modules/*/**"], [...MODULE_LAYER, NO_CONFIG]),
  ...MODULE_FOLDER_DEPTHS.map((depth) =>
    restrict(
      [moduleFilesAtDepth(depth)],
      [...MODULE_LAYER, NO_CONFIG, siblingModulesAtDepth(depth)]
    )
  ),
  restrict(
    ["packages/modules/*/*.config.ts", "packages/modules/*/*.config.mts"],
    // A module configuration file sits at the module root, so it keeps the
    // depth-zero sibling ban along with the rest of the layer.
    [...MODULE_LAYER, siblingModulesAtDepth(0)]
  ),
  restrict(["apps/**", "customers/**"], [...APP_LAYER, NO_CONFIG]),
  restrict(
    [
      "apps/*/*.config.ts",
      "apps/*/*.config.mts",
      "customers/*/app/*.config.ts",
      "customers/*/app/*.config.mts",
    ],
    APP_LAYER
  ),
  // The host's main configuration is build-time composition, not product runtime.
  // It keeps every app driver restriction, may read the shared configuration, and
  // may reach the generators through their one public entrypoint and nothing else.
  // This is not a blanket `.storybook/**` exemption: `preview` and every other
  // file under the host stay on the ordinary app entry above.
  restrict(
    ["apps/storybook/.storybook/main.ts"],
    [
      { group: DRIVERS, message: "an app opens no connection (DEC-34)." },
      {
        group: [...TOOLING, "!@genie/generators"],
        message: "Storybook main consumes only the public selector entrypoint.",
      },
    ]
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
          "@genie/core/**",
          "!@genie/core/tenant-config",
          "**/packages/core/**",
          "**/../core/**",
        ],
        message:
          "tooling imports only the build-safe core schema entrypoints of R-7a.",
      },
      {
        group: DRIVERS,
        message: "tooling opens no database connection (DEC-34).",
      },
    ]
  ),
];
