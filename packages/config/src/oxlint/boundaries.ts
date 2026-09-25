import type { OxlintOverride } from "oxlint";

import { NON_PRODUCT_FILE_PATTERNS } from "./non-product-files.ts";

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
  patterns: readonly RestrictedGroup[],
  excludeFiles?: readonly string[]
): OxlintOverride {
  const override: OxlintOverride = {
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

  if (excludeFiles !== undefined) {
    override.excludeFiles = [...excludeFiles];
  }

  return override;
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

// The test-only helpers under `packages/core/testing` (R-39). A production src
// file may not import them; a test or fixture may. The forms mirror `CORE`: the
// package specifier, its subpaths, and the two raw spellings a relative climb
// carries. A same-package climb from `packages/core/src/` itself carries no
// `core` segment for any glob to see, so that spelling stays uncaught here.
const CORE_TESTING = [
  "@genie/core/testing",
  "@genie/core/testing/**",
  "**/packages/core/testing/**",
  "**/../core/testing/**",
];

// `@genie/module-<id>` is the module package name, for the capability folder
// `packages/modules/<id>` (`docs/architecture/repository-layout.md`, Module
// package naming). Those two entries are the reachable ones.
//
// The rest are defensive and stay. `@genie/modules-*` is the superseded plural
// spelling, which a hand-edited manifest could still carry. A scoped name holds
// one slash, so `@genie/modules/<id>` denotes a subpath of an umbrella package
// this architecture does not define. The two path forms catch relative
// spellings, which carry no package name at all.
//
// `@genie/module-*` does not match `@genie/modules-*`: the literal prefix
// `module-` fails at the `s`. The entries are distinct, not redundant.
const MODULES = [
  "@genie/module-*",
  "@genie/module-*/**",
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

const NO_TESTING_IMPORTS: RestrictedGroup = {
  group: CORE_TESTING,
  message:
    "production src code never imports the test-only helpers under @genie/core/testing; keep the import in a test or fixture (R-39).",
};

// The build-safe tenant schemas. One rule, shared by the whole schema folder and
// the src slice that repeats it so the testing ban reaches schema src too.
const TENANT_SCHEMA_DRIVERS: RestrictedGroup = {
  group: DRIVERS,
  message:
    "the tenant schemas stay build-safe: no driver, no connection (R-19a, R-7a).",
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

// The shared configuration package is an internal project too, so a file inside
// it reaches its siblings relatively, as `packages/config/vitest.config.ts`
// does, and never through the `@genie/config` specifier.
const CONFIG_LAYER: readonly RestrictedGroup[] = [
  {
    group: [...INTERNAL, ...CONFIG],
    message: "config imports no internal project (R-7a).",
  },
  { group: DRIVERS, message: "config opens no database connection (DEC-34)." },
];

// Tooling reads module metadata as data, ships nothing, and reaches core only
// through the build-safe schema entrypoints of R-7a.
const TOOLS_LAYER: readonly RestrictedGroup[] = [
  {
    group: MODULES,
    message:
      "tooling reads module metadata as data. It never imports a module.",
  },
  { group: APPS, message: "tooling never imports an app." },
  { group: CUSTOMERS, message: "tooling never imports a customer folder." },
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
];

// A sibling module is reached by climbing out of the module's own folder, and
// that spelling carries no `modules/` segment, so no folder glob in `MODULES`
// can see it. How far `..` has to climb depends on how deep the importing file
// sits, and oxlint matches the raw specifier and never a resolved path, so no
// glob here can tell `../../beta/src/index.ts` (a sibling, from `alpha/src/`)
// from `../../utils/x.ts` (inside alpha, from `alpha/src/nested/`). That case
// belongs to the `boundaries/no-relative-package-escape` rule in
// `packages/config/oxlint/boundaries/`, which resolves the specifier against
// the importing file. It has no depth ceiling and names the right remedy for a
// climb that lands outside every module.

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
  restrict(["packages/core/src/lib/tenant-config/**"], [TENANT_SCHEMA_DRIVERS]),
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
  // A colocated test is not the shipping surface, so it adds vitest and the
  // file under test in the same folder. Every other ban holds, including the
  // one on climbing into `src/` or `testing/`.
  restrict(
    ["packages/core/contracts/*.test.ts"],
    [
      ...CORE_LAYER,
      NO_CONFIG,
      {
        group: ["*", "!zod", "!zod/**", "!vitest", "!./*"],
        message:
          "a contracts test imports vitest, zod and the file under test, nothing else (DEC-42).",
      },
    ]
  ),
  restrict(["packages/modules/*/**"], [...MODULE_LAYER, NO_CONFIG]),
  restrict(
    ["packages/modules/*/*.config.ts", "packages/modules/*/*.config.mts"],
    MODULE_LAYER
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
  // An app's own build tooling, which ADR 0008 requires: the app generates its
  // registry, so the generation script must reach the selector. It runs at build
  // time and ships nothing, so it reads the generators through their one public
  // entrypoint and nothing else. Every other app ban holds, the database driver
  // included. The glob is `tools/` only, so nothing under `src/` gains this.
  restrict(
    ["apps/*/tools/**", "customers/*/app/tools/**"],
    [
      { group: DRIVERS, message: "an app opens no connection (DEC-34)." },
      {
        group: [...TOOLING, "!@genie/generators"],
        message:
          "an app's build tooling consumes only the public generators entrypoint (R-7a).",
      },
    ]
  ),
  restrict(["packages/config/**"], CONFIG_LAYER),
  restrict(["tools/**"], TOOLS_LAYER),
  // The test-only helpers under `packages/core/testing` (R-39) are the one ban a
  // layer entry above cannot carry: an import of them is fine in a test, so the
  // ban has to exempt the test surface while every other layer ban still holds.
  // Each layer's `src/` files get it as an extra pattern on top of their own
  // layer list, because a later matching entry replaces the whole rule. The test,
  // story and fixture files are excluded, so they keep the layer list alone.
  restrict(
    ["packages/ui/src/**"],
    [...UI_LAYER, NO_CONFIG, NO_TESTING_IMPORTS],
    NON_PRODUCT_FILE_PATTERNS
  ),
  restrict(
    ["packages/core/src/**"],
    [...CORE_LAYER, NO_CONFIG, NO_TESTING_IMPORTS],
    NON_PRODUCT_FILE_PATTERNS
  ),
  // The schema folder's own entry above wins over the core entry, so this slice
  // repeats its one rule and adds the testing ban.
  restrict(
    ["packages/core/src/lib/tenant-config/**"],
    [TENANT_SCHEMA_DRIVERS, NO_TESTING_IMPORTS],
    NON_PRODUCT_FILE_PATTERNS
  ),
  restrict(
    ["packages/modules/*/src/**"],
    [...MODULE_LAYER, NO_CONFIG, NO_TESTING_IMPORTS],
    NON_PRODUCT_FILE_PATTERNS
  ),
  restrict(
    ["apps/*/src/**", "customers/*/app/src/**"],
    [...APP_LAYER, NO_CONFIG, NO_TESTING_IMPORTS],
    NON_PRODUCT_FILE_PATTERNS
  ),
  restrict(
    ["packages/config/src/**"],
    [...CONFIG_LAYER, NO_TESTING_IMPORTS],
    NON_PRODUCT_FILE_PATTERNS
  ),
  restrict(
    ["tools/**/src/**"],
    [...TOOLS_LAYER, NO_TESTING_IMPORTS],
    NON_PRODUCT_FILE_PATTERNS
  ),
];
