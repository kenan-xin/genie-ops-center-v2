import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  WORKSPACE_ROOT,
  lintAt,
  lintAtIsolated,
} from "./__testing__/lint-at.ts";
import { importBoundaryOverrides } from "./boundaries.ts";

describe("the import direction, proved through the oxlint binary", () => {
  it("runs against the real repository root", () => {
    expect(existsSync(join(WORKSPACE_ROOT, "pnpm-workspace.yaml"))).toBe(true);
  });

  it("stops packages/ui from importing core", () => {
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.ts",
      `import "@genie/core";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "ui imports nothing internal. Move the shared piece into ui."
    );
  });

  it("stops packages/ui from reaching core through a package subpath", () => {
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.ts",
      `import "@genie/core/services/mailer";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("only core opens a connection (DEC-34).");
  });

  it("stops packages/ui from reaching core through a relative spelling", () => {
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.ts",
      `import "../../core/src/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "ui imports nothing internal. Move the shared piece into ui."
    );
  });

  it("allows packages/core to import ui, which is the declared direction", () => {
    const result = lintAt(
      "packages/core/__boundary__/__boundary__.ts",
      `import "@genie/ui";\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("stops one module from importing another module", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__/__boundary__.ts",
      `import "@genie/modules/beta";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("a module never imports another module.");
  });

  it("stops one module from importing another module through the real package spelling", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__/__boundary__.ts",
      `import "@genie/modules-beta";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("a module never imports another module.");
  });

  // The singular `@genie/module-<id>` spelling is the naming contract
  // (`docs/architecture/repository-layout.md`, Module package naming). The plural
  // and slash cases above stay as defensive cover; these are the reachable ones.

  it("stops one module from importing another by the singular package name", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__/__boundary__.ts",
      `import "@genie/module-beta";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("a module never imports another module.");
  });

  it("stops one module reaching into another through a singular public subpath", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__/__boundary__.ts",
      `import "@genie/module-beta/schema";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("a module never imports another module.");
  });

  // DEFERRED (genie-ops-center-v2-1rd.1.5): the id's character set is not checked
  // here. Kebab-case belongs to the module declaration contract, which is not
  // built yet, so today no layer enforces it. An off-contract id still lands
  // inside `@genie/module-*`, so nothing escapes the boundary meanwhile.

  it("stops a module importing a hyphenated module id by the singular name", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__/__boundary__.ts",
      `import "@genie/module-contract-data";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("a module never imports another module.");
  });

  it("stops ui importing a module by the singular package name", () => {
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.ts",
      `import "@genie/module-alpha";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("ui imports no module.");
  });

  it("stops core importing a module by the singular package name", () => {
    const result = lintAt(
      "packages/core/__boundary__/__boundary__.ts",
      `import "@genie/module-alpha";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "core never imports a module. Extend the module contract instead."
    );
  });

  it("stops config importing a module by the singular package name", () => {
    const result = lintAt(
      "packages/config/__boundary__/__boundary__.ts",
      `import "@genie/module-alpha";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "config imports no internal project (R-7a)."
    );
  });

  it("stops tooling importing a module by the singular package name", () => {
    const result = lintAt(
      "tools/generators/src/__boundary__.ts",
      `import "@genie/module-alpha";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "tooling reads module metadata as data. It never imports a module."
    );
  });

  // The two path spellings in the module group carry no package name, so no
  // package pattern can see them. They are what stops a module being reached by
  // walking the tree instead of naming it.

  it("stops ui reaching a module by climbing into the modules folder", () => {
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.ts",
      `import "../../modules/alpha/src/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("ui imports no module.");
  });

  it("stops core reaching a module by its repository path", () => {
    const result = lintAt(
      "packages/core/__boundary__/__boundary__.ts",
      `import "../../../packages/modules/alpha/src/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "core never imports a module. Extend the module contract instead."
    );
  });

  // The positive half, with one honest limit. Only the module-imports-core case
  // can catch a widened module group: the app layer bans drivers and tooling and
  // never consults that group, so widening it to `@genie/**` leaves both app
  // cases passing. They are regression cover for the app layer itself, not for
  // the module group.

  it("lets an app compose a module by the singular package name", () => {
    const result = lintAt(
      "apps/genie/src/__boundary__.ts",
      `import "@genie/module-alpha";\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("lets an app compose a module through a public subpath", () => {
    const result = lintAt(
      "apps/genie/src/__boundary__.ts",
      `import "@genie/module-alpha/pages";\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("lets a module import core, which the module contract depends on", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__/__boundary__.ts",
      `import "@genie/core";\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("stops a module from importing the application", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__/__boundary__.ts",
      `import "apps/genie/src/context.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("a module never imports an app.");
  });

  it("stops the database driver in a module", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__/__boundary__.ts",
      `import "pg";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "a module reads the database through ctx.tenant.db (DEC-34)."
    );
  });

  it("stops the drizzle node-postgres binding in ui", () => {
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.ts",
      `import "drizzle-orm/node-postgres";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("only core opens a connection (DEC-34).");
  });

  it("stops packages/ui from importing a customer folder", () => {
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.ts",
      `import "customers/acme/app/src/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("ui imports no customer folder.");
  });

  it("rejects ui importing the app package by name", () => {
    // `@genie/app` is what `apps/genie/package.json` calls itself, and the bare
    // specifier contains no `apps/`, so no path glob can stand in for it.
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.ts",
      `import "@genie/app";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("ui imports no app");
  });

  it("rejects ui reaching into the app package through a subpath", () => {
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.ts",
      `import "@genie/app/src/context.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("ui imports no app");
  });

  it("rejects ui importing the storybook host package by name", () => {
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.ts",
      `import "@genie/storybook";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("ui imports no app");
  });

  it("rejects ui reaching into the storybook host through a subpath", () => {
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.ts",
      `import "@genie/storybook/preview";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("ui imports no app");
  });

  it("allows core to import the database driver, because core owns the pool", () => {
    const result = lintAt(
      "packages/core/__boundary__/__boundary__.ts",
      `import "pg";\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("stops packages/config from importing any internal project", () => {
    const result = lintAt(
      "packages/config/__boundary__/__boundary__.ts",
      `import "@genie/ui";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "config imports no internal project (R-7a)."
    );
  });

  it("rejects config importing its own package by name", () => {
    // A file inside the config package reaches its siblings relatively, as
    // `packages/config/vitest.config.ts` does, so the package specifier is
    // always the wrong spelling there.
    const result = lintAt(
      "packages/config/__boundary__/__boundary__.ts",
      `import "@genie/config";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("config imports no internal project");
  });

  it("rejects config importing a generator by package name", () => {
    const result = lintAt(
      "packages/config/__boundary__/__boundary__.ts",
      `import "@genie/generators";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("config imports no internal project");
  });

  it("rejects config importing a generator subpath", () => {
    const result = lintAt(
      "packages/config/__boundary__/__boundary__.ts",
      `import "@genie/generators/selection";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("config imports no internal project");
  });

  it("rejects config importing a generator by relative path", () => {
    const result = lintAt(
      "packages/config/__boundary__/__boundary__.ts",
      `import "../../tools/generators/src/selection/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("config imports no internal project");
  });

  it("stops tools/generators from importing a module implementation", () => {
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "@genie/modules/alpha";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "tooling reads module metadata as data. It never imports a module."
    );
  });

  it("stops tools/generators from importing the core runtime entrypoint", () => {
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "@genie/core";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "tooling imports only the build-safe core schema entrypoints of R-7a."
    );
  });

  it("allows tools/generators to import the build-safe core tenant-config schemas", () => {
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "@genie/core/tenant-config";\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("rejects tooling importing an unlisted core subpath", () => {
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "@genie/core/tenant-config/nested";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("build-safe core schema entrypoints");
  });

  it("rejects tooling importing core by relative path", () => {
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "../../packages/core/src/lib/tenant-config/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("build-safe core schema entrypoints");
  });

  it("rejects tooling importing core through a bare sibling climb", () => {
    // The raw-string spelling that only `**/../core/**` can see: it names `core`
    // directly, with no `packages/` segment for the folder glob to match. It is
    // the same climb CORE reserves for the folder glob's relative twin.
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "../../core/src/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("build-safe core schema entrypoints");
  });

  it("rejects tooling importing the core index entrypoint", () => {
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "@genie/core/index";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("build-safe core schema entrypoints");
  });

  it("rejects tooling importing the app package by name", () => {
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "@genie/app";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("tooling never imports an app");
  });

  it("lets tooling consume the shared config preset", () => {
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "@genie/config/vitest/unit";\n`
    );

    expect(result.failed).toBe(false);
  });

  it("stops contracts from importing anything but zod", () => {
    const result = lintAt(
      "packages/core/contracts/__boundary__/__boundary__.ts",
      `import "node:fs";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "contracts import only zod and types (DEC-42)."
    );
  });

  it("allows contracts to import zod, which is the one dependency DEC-42 grants", () => {
    const result = lintAt(
      "packages/core/contracts/__boundary__/__boundary__.ts",
      `import "zod";\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("lets contracts import a type from a runtime module", () => {
    // The blank line is the repository's own spacing rule, not the boundary rule:
    // without it this fixture fails on `require-readable-spacing` and would pass
    // for the wrong reason.
    const result = lintAt(
      "packages/core/contracts/__boundary__/__boundary__.ts",
      `import type { Stats } from "node:fs";\n\nexport type Echo = Stats;\n`
    );

    expect(result.failed).toBe(false);
  });

  it("still rejects a value import from the same runtime module", () => {
    const result = lintAt(
      "packages/core/contracts/__boundary__/__boundary__.ts",
      `import { readFileSync } from "node:fs";\n\nexport const read = readFileSync;\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "contracts import only zod and types (DEC-42)."
    );
  });

  it("still rejects a mixed type and value import from the same runtime module", () => {
    const result = lintAt(
      "packages/core/contracts/__boundary__/__boundary__.ts",
      `import { type Stats, readFileSync } from "node:fs";\n\nexport const read: Stats | null = readFileSync;\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "contracts import only zod and types (DEC-42)."
    );
  });

  it("stops a module from importing a core service through the package subpath", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__/__boundary__.ts",
      `import "@genie/core/services/database";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "a module reads the database through ctx.tenant.db (DEC-34)."
    );
  });

  it("stops tools/generators from importing a database driver", () => {
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "pg";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "tooling opens no database connection (DEC-34)."
    );
  });

  it("stops tools/generators from importing an application", () => {
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "apps/genie/src/context.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("tooling never imports an app.");
  });

  it("stops tools/generators from importing a customer folder", () => {
    const result = lintAt(
      "tools/generators/__boundary__/__boundary__.ts",
      `import "customers/acme/app/src/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("tooling never imports a customer folder.");
  });

  it("stops an app from importing a database driver", () => {
    const result = lintAt(
      "apps/genie/__boundary__/__boundary__.ts",
      `import "pg";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("an app opens no connection (DEC-34).");
  });

  it("applies the rules to a test file as well as to source", () => {
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.test.ts",
      `import "@genie/core";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "ui imports nothing internal. Move the shared piece into ui."
    );
  });

  // R-7a. Configuration and tooling are build-time surfaces. Nothing that ships
  // or runs reaches them, and only a package configuration file consumes a preset.

  it("rejects core importing the config package", () => {
    const result = lintAt(
      "packages/core/__boundary__/__boundary__.ts",
      `import "@genie/config";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports the shared configuration");
  });

  it("rejects core importing a config subpath", () => {
    const result = lintAt(
      "packages/core/__boundary__/__boundary__.ts",
      `import "@genie/config/vitest/unit";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports the shared configuration");
  });

  it("rejects core importing a generator", () => {
    const result = lintAt(
      "packages/core/__boundary__/__boundary__.ts",
      `import "@genie/generators";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports a generator");
  });

  it("rejects ui importing config by relative path", () => {
    const result = lintAt(
      "packages/ui/__boundary__/__boundary__.ts",
      `import "../../config/src/vitest/unit.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports the shared configuration");
  });

  it("rejects an app importing config", () => {
    const result = lintAt(
      "apps/genie/__boundary__/__boundary__.ts",
      `import "@genie/config";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports the shared configuration");
  });

  it("rejects an app importing a generator by relative path", () => {
    const result = lintAt(
      "apps/genie/__boundary__/__boundary__.ts",
      `import "../../tools/generators/src/selection/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports a generator");
  });

  it("rejects a module importing a generator", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__/__boundary__.ts",
      `import "@genie/generators";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports a generator");
  });

  it("rejects a root-level core test file importing a generator", () => {
    const result = lintAt(
      "packages/core/__boundary__.test.ts",
      `import "@genie/generators";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports a generator");
  });

  it("rejects an app end-to-end file importing config", () => {
    const result = lintAt(
      "apps/genie/e2e/__boundary__.spec.ts",
      `import "@genie/config";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports the shared configuration");
  });

  it("rejects a core src test file importing config", () => {
    const result = lintAt(
      "packages/core/src/__boundary__.test.ts",
      `import "@genie/config";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports the shared configuration");
  });

  it("rejects a core src test file importing a generator", () => {
    const result = lintAt(
      "packages/core/src/__boundary__.test.ts",
      `import "@genie/generators";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports a generator");
  });

  it("rejects a top-level testing folder test file importing config", () => {
    const result = lintAt(
      "packages/core/testing/__boundary__.test.ts",
      `import "@genie/config";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports the shared configuration");
  });

  it("rejects a top-level testing folder test file importing a generator", () => {
    const result = lintAt(
      "packages/core/testing/__boundary__.test.ts",
      `import "@genie/generators";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports a generator");
  });

  // The package configuration files are the one exception, and they keep every
  // other ban. A nested source file that merely ends in `.config.ts` does not.

  it("lets a ui package configuration file consume a preset", () => {
    const result = lintAt(
      "packages/ui/__boundary__.config.ts",
      `import "@genie/config/vitest/unit";\n`
    );

    expect(result.failed).toBe(false);
  });

  it("lets an app package configuration file consume a preset", () => {
    const result = lintAt(
      "apps/genie/__boundary__.config.ts",
      `import "@genie/config/vitest/unit";\n`
    );

    expect(result.failed).toBe(false);
  });

  it("lets the real package Vitest configuration shape lint unchanged", () => {
    // Byte-for-byte the body of `packages/core/vitest.config.ts`, at an isolated
    // name because `lintAt` refuses a path that already exists.
    const result = lintAt(
      "packages/core/vitest.__boundary__.config.ts",
      `import { unitTestPreset } from "@genie/config/vitest/unit";\nimport { defineConfig } from "vitest/config";\n\nexport default defineConfig(unitTestPreset);\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("still bans config from a nested source file that ends in .config.ts", () => {
    const result = lintAt(
      "packages/ui/src/__boundary__.config.ts",
      `import "@genie/config";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports the shared configuration");
  });

  it("still bans core from a ui package configuration file", () => {
    const result = lintAt(
      "packages/ui/__boundary__.config.ts",
      `import "@genie/core";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("ui imports nothing internal");
  });

  it("still bans a module from a core package configuration file", () => {
    const result = lintAt(
      "packages/core/__boundary__.config.ts",
      `import "@genie/modules-alpha";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("core never imports a module");
  });

  it("still bans a driver from a module package configuration file", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__.config.ts",
      `import "pg";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("ctx.tenant.db");
  });

  it("lets a module package configuration file consume a preset", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__.config.ts",
      `import "@genie/config/vitest/unit";\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("lets a customer app package configuration file consume a preset", () => {
    // The glob for this path is spelled once and shared with the apps globs, so
    // the apps fixture proves the pattern list but never this nesting.
    const result = lintAt(
      "customers/acme/app/vitest.__boundary__.config.ts",
      `import { unitTestPreset } from "@genie/config/vitest/unit";\nimport { defineConfig } from "vitest/config";\n\nexport default defineConfig(unitTestPreset);\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("still bans a sibling module from a module package configuration file", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__.config.ts",
      `import "../beta/src/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("a module never imports another module.");
  });

  it("still bans a driver from an app package configuration file", () => {
    const result = lintAt(
      "apps/genie/__boundary__.config.ts",
      `import "pg";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("an app opens no connection");
  });

  // A sibling module is reached by climbing out of the module's own folder, and
  // that spelling never contains `modules/`, so the folder globs cannot see it.

  it("rejects a sibling module reached by a relative path from src", () => {
    const result = lintAt(
      "packages/modules/alpha/src/__boundary__.ts",
      `import "../../beta/src/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("a module never imports another module.");
  });

  it("rejects a sibling module reached by a relative path from the module root", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__.ts",
      `import "../beta/src/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("a module never imports another module.");
  });

  it("rejects a sibling module reached by a relative path from a nested folder", () => {
    const result = lintAt(
      "packages/modules/alpha/src/nested/__boundary__.ts",
      `import "../../../beta/src/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("a module never imports another module.");
  });

  it("rejects a sibling module reached from the deepest covered folder", () => {
    // The deepest entry in `MODULE_FOLDER_DEPTHS`. Without it this climb is
    // matched by no depth entry at all.
    const result = lintAt(
      "packages/modules/alpha/src/a/b/__boundary__.ts",
      `import "../../../../beta/src/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("a module never imports another module.");
  });

  it("keeps the module layer on a file past the deepest depth entry", () => {
    // `packages/modules/*/**` is the fallback for a module file more than three
    // folders below its own root. Every `MODULE_FOLDER_DEPTHS` entry repeats the
    // whole layer but matches one exact depth, so this depth-4 path is covered by
    // that fallback alone. Delete it and the file loses `MODULE_LAYER` and
    // `NO_CONFIG` entirely. The sibling climb at this depth stays allowed: that is
    // the documented ceiling, not a defect.
    const result = lintAt(
      "packages/modules/alpha/src/a/b/c/__boundary__.ts",
      `import "pg";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "a module reads the database through ctx.tenant.db (DEC-34)."
    );
  });

  it("keeps the NO_CONFIG restriction on a module file past the deepest depth entry", () => {
    // `packages/modules/*/**` is the fallback for a module file more than three
    // folders below its own root. The depth-4 entry repeats the whole layer,
    // including `NO_CONFIG`. This test proves `NO_CONFIG` fires at that depth
    // so the restriction list on entry 250 is not test-invisible.
    const result = lintAt(
      "packages/modules/alpha/src/a/b/c/__boundary__.ts",
      `import "@genie/config";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "product code never imports the shared configuration package (R-7a)."
    );
  });

  it("still allows a module its own relative import from src", () => {
    const result = lintAt(
      "packages/modules/alpha/src/__boundary__.ts",
      `import "../lib/__boundary_target__.ts";\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("still allows a module its own relative import from a nested folder", () => {
    // `../../` from `src/nested/` lands back in the module root, so this is the
    // exact string a sibling import uses one level shallower. The ban is keyed on
    // the importing file's depth, which is what keeps these two apart.
    const result = lintAt(
      "packages/modules/alpha/src/nested/__boundary__.ts",
      `import "../../utils/__boundary_target__.ts";\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("rejects core reaching a customer app through a relative path", () => {
    const result = lintAt(
      "packages/core/src/__boundary__.ts",
      `import "../../../customers/acme/app/src/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("core never imports a customer folder.");
  });

  it("rejects core importing a named binding from the storybook host", () => {
    const result = lintAt(
      "packages/core/__boundary__/__boundary__.ts",
      `import { preview } from "@genie/storybook";\n\nexport const echo = preview;\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("core never imports an app.");
  });

  it("rejects a module importing a storybook host subpath", () => {
    const result = lintAt(
      "packages/modules/alpha/__boundary__/__boundary__.ts",
      `import "@genie/storybook/preview";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("a module never imports an app.");
  });

  // The Storybook host's main configuration is build-time composition, so it is
  // the one product path that consumes shared config and the public selector.
  //
  // These cases name paths the host itself owns, so they lint in an isolated
  // root rather than the checkout. The rule under test matches one exact path,
  // and the fixture has to carry that path to reach it. Writing it into the
  // checkout would collide with the host's real file the moment it lands.

  it("lets the storybook host main file compose config and the selectors", () => {
    const result = lintAtIsolated(
      "apps/storybook/.storybook/main.ts",
      `import { sharedStorybookConfig } from "@genie/config/storybook";\nimport { readModuleInventory, resolveModuleSelection } from "@genie/generators";\n\nexport const main = {\n  preset: sharedStorybookConfig,\n  readModuleInventory,\n  resolveModuleSelection,\n};\n`
    );

    expect(result.failed).toBe(false);

    expect(result.output).not.toMatch(/no-restricted-imports/);
  });

  it("rejects a generator subpath from the storybook host main file", () => {
    const result = lintAtIsolated(
      "apps/storybook/.storybook/main.ts",
      `import "@genie/generators/selection";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "Storybook main consumes only the public selector entrypoint."
    );
  });

  it("rejects a relative generator path from the storybook host main file", () => {
    const result = lintAtIsolated(
      "apps/storybook/.storybook/main.ts",
      `import "../../../tools/generators/src/selection/index.ts";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain(
      "Storybook main consumes only the public selector entrypoint."
    );
  });

  it("rejects a database driver from the storybook host main file", () => {
    const result = lintAtIsolated(
      "apps/storybook/.storybook/main.ts",
      `import "pg";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("an app opens no connection (DEC-34).");
  });

  it("rejects the selector import from the storybook preview file", () => {
    // This is not a blanket `.storybook/**` exemption. Only `main.ts` composes.
    const result = lintAtIsolated(
      "apps/storybook/.storybook/preview.tsx",
      `import "@genie/generators";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports a generator");
  });

  it("rejects shared config from the storybook preview file", () => {
    const result = lintAtIsolated(
      "apps/storybook/.storybook/preview.tsx",
      `import "@genie/config/storybook";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports the shared configuration");
  });

  it("rejects tooling from ordinary app source", () => {
    const result = lintAt(
      "apps/storybook/src/__boundary__.ts",
      `import "@genie/generators";\n`
    );

    expect(result.failed).toBe(true);

    expect(result.output).toContain("never imports a generator");
  });
});

describe("the serialized oxlint configuration", () => {
  it("keeps allowTypeImports on the contracts pattern", () => {
    const entry = importBoundaryOverrides.find((o) =>
      o.files?.includes("packages/core/contracts/**")
    );

    expect(entry).toBeDefined();

    // `restrict()` always writes the rule as this two-element array, so matching it
    // directly proves the field survived serialization. Oxlint exports no type for
    // the rule's configuration, and its declared type is a union that includes a
    // bare severity string, so reading it back needs no assertion.
    expect(entry?.rules?.["no-restricted-imports"]).toMatchObject([
      "error",
      { patterns: [expect.objectContaining({ allowTypeImports: true })] },
    ]);
  });
});
