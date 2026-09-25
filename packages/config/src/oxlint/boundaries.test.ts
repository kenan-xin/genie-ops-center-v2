import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  WORKSPACE_ROOT,
  lintAt,
  lintAtIsolated,
} from "./__testing__/lint-at.ts";
import { importBoundaryOverrides } from "./boundaries.ts";

const LINT_TIMEOUT = 120_000;

describe.concurrent(
  "the import direction, proved through the oxlint binary",
  { timeout: LINT_TIMEOUT },
  () => {
    it("runs against the real repository root", async () => {
      expect(existsSync(join(WORKSPACE_ROOT, "pnpm-workspace.yaml"))).toBe(
        true
      );
    });

    it("stops packages/ui from importing core", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__/__boundary__.ts",
        `import "@genie/core";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "ui imports nothing internal. Move the shared piece into ui."
      );
    });

    it("stops packages/ui from reaching core through a package subpath", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__/__boundary__.ts",
        `import "@genie/core/services/mailer";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("only core opens a connection (DEC-34).");
    });

    it("stops packages/ui from reaching core through a relative spelling", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__/__boundary__.ts",
        `import "../../core/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "ui imports nothing internal. Move the shared piece into ui."
      );
    });

    it("allows packages/core to import ui, which is the declared direction", async () => {
      const result = await lintAt(
        "packages/core/__boundary__/__boundary__.ts",
        `import "@genie/ui";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("stops one module from importing another module", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__/__boundary__.ts",
        `import "@genie/modules/beta";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("stops one module from importing another module through the real package spelling", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__/__boundary__.ts",
        `import "@genie/modules-beta";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    // The singular `@genie/module-<id>` spelling is the naming contract
    // (`docs/architecture/repository-layout.md`, Module package naming). The plural
    // and slash cases above stay as defensive cover; these are the reachable ones.

    it("stops one module from importing another by the singular package name", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__/__boundary__.ts",
        `import "@genie/module-beta";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("stops one module reaching into another through a singular public subpath", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__/__boundary__.ts",
        `import "@genie/module-beta/schema";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    // DEFERRED (genie-ops-center-v2-1rd.1.5, owned by S0-03): the id's character
    // set is not checked here. Kebab-case belongs to the module declaration
    // contract, and no layer enforces it yet. An off-contract id still lands
    // inside `@genie/module-*`, so nothing escapes the boundary meanwhile.

    it("stops a module importing a hyphenated module id by the singular name", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__/__boundary__.ts",
        `import "@genie/module-contract-data";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("stops ui importing a module by the singular package name", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__/__boundary__.ts",
        `import "@genie/module-alpha";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("ui imports no module.");
    });

    it("stops core importing a module by the singular package name", async () => {
      const result = await lintAt(
        "packages/core/__boundary__/__boundary__.ts",
        `import "@genie/module-alpha";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "core never imports a module. Extend the module contract instead."
      );
    });

    it("stops config importing a module by the singular package name", async () => {
      const result = await lintAt(
        "packages/config/__boundary__/__boundary__.ts",
        `import "@genie/module-alpha";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "config imports no internal project (R-7a)."
      );
    });

    it("stops tooling importing a module by the singular package name", async () => {
      const result = await lintAt(
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

    it("stops ui reaching a module by climbing into the modules folder", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__/__boundary__.ts",
        `import "../../modules/alpha/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("ui imports no module.");
    });

    it("stops core reaching a module by its repository path", async () => {
      const result = await lintAt(
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

    it("lets an app compose a module by the singular package name", async () => {
      const result = await lintAt(
        "apps/genie/src/__boundary__.ts",
        `import "@genie/module-alpha";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("lets an app compose a module through a public subpath", async () => {
      const result = await lintAt(
        "apps/genie/src/__boundary__.ts",
        `import "@genie/module-alpha/pages";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("lets a module import core, which the module contract depends on", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__/__boundary__.ts",
        `import "@genie/core";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("stops a module from importing the application", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__/__boundary__.ts",
        `import "apps/genie/src/context.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports an app.");
    });

    it("stops the database driver in a module", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__/__boundary__.ts",
        `import "pg";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "a module reads the database through ctx.tenant.db (DEC-34)."
      );
    });

    it("stops the drizzle node-postgres binding in ui", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__/__boundary__.ts",
        `import "drizzle-orm/node-postgres";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("only core opens a connection (DEC-34).");
    });

    it("stops packages/ui from importing a customer folder", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__/__boundary__.ts",
        `import "customers/acme/app/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("ui imports no customer folder.");
    });

    it("rejects ui importing the app package by name", async () => {
      // `@genie/app` is what `apps/genie/package.json` calls itself, and the bare
      // specifier contains no `apps/`, so no path glob can stand in for it.
      const result = await lintAt(
        "packages/ui/__boundary__/__boundary__.ts",
        `import "@genie/app";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("ui imports no app.");
    });

    it("rejects ui reaching into the app package through a subpath", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__/__boundary__.ts",
        `import "@genie/app/src/context.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("ui imports no app.");
    });

    it("rejects ui importing the storybook host package by name", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__/__boundary__.ts",
        `import "@genie/storybook";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("ui imports no app.");
    });

    it("rejects ui reaching into the storybook host through a subpath", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__/__boundary__.ts",
        `import "@genie/storybook/preview";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("ui imports no app.");
    });

    it("allows core to import the database driver, because core owns the pool", async () => {
      const result = await lintAt(
        "packages/core/__boundary__/__boundary__.ts",
        `import "pg";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("stops packages/config from importing any internal project", async () => {
      const result = await lintAt(
        "packages/config/__boundary__/__boundary__.ts",
        `import "@genie/ui";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "config imports no internal project (R-7a)."
      );
    });

    it("rejects config importing its own package by name", async () => {
      // A file inside the config package reaches its siblings relatively, as
      // `packages/config/vitest.config.ts` does, so the package specifier is
      // always the wrong spelling there.
      const result = await lintAt(
        "packages/config/__boundary__/__boundary__.ts",
        `import "@genie/config";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("config imports no internal project");
    });

    it("rejects config importing a generator by package name", async () => {
      const result = await lintAt(
        "packages/config/__boundary__/__boundary__.ts",
        `import "@genie/generators";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("config imports no internal project");
    });

    it("rejects config importing a generator subpath", async () => {
      const result = await lintAt(
        "packages/config/__boundary__/__boundary__.ts",
        `import "@genie/generators/selection";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("config imports no internal project");
    });

    it("rejects config importing a generator by relative path", async () => {
      const result = await lintAt(
        "packages/config/__boundary__/__boundary__.ts",
        `import "../../tools/generators/src/selection/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("config imports no internal project");
    });

    it("stops tools/generators from importing a module implementation", async () => {
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "@genie/modules/alpha";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "tooling reads module metadata as data. It never imports a module."
      );
    });

    it("stops tools/generators from importing the core runtime entrypoint", async () => {
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "@genie/core";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "tooling imports only the build-safe core schema entrypoints of R-7a."
      );
    });

    it("allows tools/generators to import the build-safe core tenant-config schemas", async () => {
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "@genie/core/tenant-config";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("rejects tooling importing an unlisted core subpath", async () => {
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "@genie/core/tenant-config/nested";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("build-safe core schema entrypoints");
    });

    it("rejects tooling importing core by relative path", async () => {
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "../../packages/core/src/lib/tenant-config/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("build-safe core schema entrypoints");
    });

    it("rejects tooling importing core through a bare sibling climb", async () => {
      // The raw-string spelling that only `**/../core/**` can see: it names `core`
      // directly, with no `packages/` segment for the folder glob to match. It is
      // the same climb CORE reserves for the folder glob's relative twin.
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "../../core/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("build-safe core schema entrypoints");
    });

    it("rejects tooling importing the core index entrypoint", async () => {
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "@genie/core/index";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("build-safe core schema entrypoints");
    });

    it("rejects tooling importing the app package by name", async () => {
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "@genie/app";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("tooling never imports an app");
    });

    it("lets tooling consume the shared config preset", async () => {
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "@genie/config/vitest/unit";\n`
      );

      expect(result.failed).toBe(false);
    });

    it("stops contracts from importing anything but zod", async () => {
      const result = await lintAt(
        "packages/core/contracts/__boundary__/__boundary__.ts",
        `import "node:fs";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "contracts import only zod and types (DEC-42)."
      );
    });

    it("allows contracts to import zod, which is the one dependency DEC-42 grants", async () => {
      const result = await lintAt(
        "packages/core/contracts/__boundary__/__boundary__.ts",
        `import "zod";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("lets contracts import a type from a runtime module", async () => {
      // The blank line is the repository's own spacing rule, not the boundary rule:
      // without it this fixture fails on `require-readable-spacing` and would pass
      // for the wrong reason.
      const result = await lintAt(
        "packages/core/contracts/__boundary__/__boundary__.ts",
        `import type { Stats } from "node:fs";\n\nexport type Echo = Stats;\n`
      );

      expect(result.failed).toBe(false);
    });

    it("still rejects a value import from the same runtime module", async () => {
      const result = await lintAt(
        "packages/core/contracts/__boundary__/__boundary__.ts",
        `import { readFileSync } from "node:fs";\n\nexport const read = readFileSync;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "contracts import only zod and types (DEC-42)."
      );
    });

    it("still rejects a mixed type and value import from the same runtime module", async () => {
      const result = await lintAt(
        "packages/core/contracts/__boundary__/__boundary__.ts",
        `import { type Stats, readFileSync } from "node:fs";\n\nexport const read: Stats | null = readFileSync;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "contracts import only zod and types (DEC-42)."
      );
    });

    it("stops a module from importing a core service through the package subpath", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__/__boundary__.ts",
        `import "@genie/core/services/database";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "a module reads the database through ctx.tenant.db (DEC-34)."
      );
    });

    it("stops tools/generators from importing a database driver", async () => {
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "pg";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "tooling opens no database connection (DEC-34)."
      );
    });

    it("stops tools/generators from importing an application", async () => {
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "apps/genie/src/context.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("tooling never imports an app.");
    });

    it("stops tools/generators from importing a customer folder", async () => {
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "customers/acme/app/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "tooling never imports a customer folder."
      );
    });

    it("stops an app from importing a database driver", async () => {
      const result = await lintAt(
        "apps/genie/__boundary__/__boundary__.ts",
        `import "pg";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("an app opens no connection (DEC-34).");
    });

    it("applies the rules to a test file as well as to source", async () => {
      const result = await lintAt(
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

    it("rejects core importing the config package", async () => {
      const result = await lintAt(
        "packages/core/__boundary__/__boundary__.ts",
        `import "@genie/config";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports the shared configuration");
    });

    it("rejects core importing a config subpath", async () => {
      const result = await lintAt(
        "packages/core/__boundary__/__boundary__.ts",
        `import "@genie/config/vitest/unit";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports the shared configuration");
    });

    it("rejects core importing a generator", async () => {
      const result = await lintAt(
        "packages/core/__boundary__/__boundary__.ts",
        `import "@genie/generators";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports a generator");
    });

    it("rejects ui importing config by relative path", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__/__boundary__.ts",
        `import "../../config/src/vitest/unit.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports the shared configuration");
    });

    it("rejects an app importing config", async () => {
      const result = await lintAt(
        "apps/genie/__boundary__/__boundary__.ts",
        `import "@genie/config";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports the shared configuration");
    });

    it("lets an app's build tooling consume the public generators entrypoint", async () => {
      // ADR 0008 puts registry generation in the app, so this script has to reach
      // the selector. It is build-time composition and ships nothing.
      const result = await lintAt(
        "apps/genie/tools/__boundary__.ts",
        `import "@genie/generators";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("still stops an app's build tooling reaching a generator subpath", async () => {
      const result = await lintAt(
        "apps/genie/tools/__boundary__.ts",
        `import "@genie/generators/selection";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "consumes only the public generators entrypoint"
      );
    });

    it("still stops an app's build tooling opening a database connection", async () => {
      // The exception widens one ban and no other. Without this the entry could
      // drop the driver ban and every remaining test would still pass.
      const result = await lintAt(
        "apps/genie/tools/__boundary__.ts",
        `import "pg";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("an app opens no connection (DEC-34).");
    });

    it("keeps the ban for app source, which is not build tooling", async () => {
      const result = await lintAt(
        "apps/genie/src/tools/__boundary__.ts",
        `import "@genie/generators";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports a generator");
    });

    it("rejects an app importing a generator by relative path", async () => {
      const result = await lintAt(
        "apps/genie/__boundary__/__boundary__.ts",
        `import "../../tools/generators/src/selection/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports a generator");
    });

    it("rejects a module importing a generator", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__/__boundary__.ts",
        `import "@genie/generators";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports a generator");
    });

    it("rejects a root-level core test file importing a generator", async () => {
      const result = await lintAt(
        "packages/core/__boundary__.test.ts",
        `import "@genie/generators";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports a generator");
    });

    it("rejects an app end-to-end file importing config", async () => {
      const result = await lintAt(
        "apps/genie/e2e/__boundary__.spec.ts",
        `import "@genie/config";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports the shared configuration");
    });

    it("rejects a core src test file importing config", async () => {
      const result = await lintAt(
        "packages/core/src/__boundary__.test.ts",
        `import "@genie/config";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports the shared configuration");
    });

    it("rejects a core src test file importing a generator", async () => {
      const result = await lintAt(
        "packages/core/src/__boundary__.test.ts",
        `import "@genie/generators";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports a generator");
    });

    // The package configuration files are the one exception, and they keep every
    // other ban. A nested source file that merely ends in `.config.ts` does not.

    it("lets a ui package configuration file consume a preset", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__.config.ts",
        `import "@genie/config/vitest/unit";\n`
      );

      expect(result.failed).toBe(false);
    });

    it("lets an app package configuration file consume a preset", async () => {
      const result = await lintAt(
        "apps/genie/__boundary__.config.ts",
        `import "@genie/config/vitest/unit";\n`
      );

      expect(result.failed).toBe(false);
    });

    it("lets the real package Vitest configuration shape lint unchanged", async () => {
      // Byte-for-byte the body of `packages/core/vitest.config.ts`, at an isolated
      // name because `lintAt` refuses a path that already exists.
      const result = await lintAt(
        "packages/core/vitest.__boundary__.config.ts",
        `import { unitTestPreset } from "@genie/config/vitest/unit";\nimport { defineConfig } from "vitest/config";\n\nexport default defineConfig(unitTestPreset);\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("still bans config from a nested source file that ends in .config.ts", async () => {
      const result = await lintAt(
        "packages/ui/src/__boundary__.config.ts",
        `import "@genie/config";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports the shared configuration");
    });

    it("still bans core from a ui package configuration file", async () => {
      const result = await lintAt(
        "packages/ui/__boundary__.config.ts",
        `import "@genie/core";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("ui imports nothing internal");
    });

    it("still bans a module from a core package configuration file", async () => {
      const result = await lintAt(
        "packages/core/__boundary__.config.ts",
        `import "@genie/modules-alpha";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("core never imports a module");
    });

    it("still bans a driver from a module package configuration file", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__.config.ts",
        `import "pg";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("ctx.tenant.db");
    });

    it("lets a module package configuration file consume a preset", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__.config.ts",
        `import "@genie/config/vitest/unit";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("lets a customer app package configuration file consume a preset", async () => {
      // The glob for this path is spelled once and shared with the apps globs, so
      // the apps fixture proves the pattern list but never this nesting.
      const result = await lintAt(
        "customers/acme/app/vitest.__boundary__.config.ts",
        `import { unitTestPreset } from "@genie/config/vitest/unit";\nimport { defineConfig } from "vitest/config";\n\nexport default defineConfig(unitTestPreset);\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    // Every exception above is spelled twice, once for `.config.ts` and once for
    // `.config.mts`, and the cases above exercise only the first spelling. One
    // fixture per `.mts` glob, so a dropped or mistyped spelling fails here.
    it.each([
      "packages/ui/__boundary__.config.mts",
      "packages/core/__boundary__.config.mts",
      "packages/modules/alpha/__boundary__.config.mts",
      "apps/genie/__boundary__.config.mts",
      "customers/acme/app/__boundary__.config.mts",
    ])(
      "lets the package configuration at %s consume a preset",
      async (path) => {
        const result = await lintAt(
          path,
          `import "@genie/config/vitest/unit";\n`
        );

        expect(result.failed).toBe(false);

        expect(result.output).not.toMatch(/no-restricted-imports/);
      }
    );

    it("still bans a sibling module from a module package configuration file", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__.config.ts",
        `import "../beta/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("still bans a driver from an app package configuration file", async () => {
      const result = await lintAt(
        "apps/genie/__boundary__.config.ts",
        `import "pg";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("an app opens no connection");
    });

    // A sibling module is reached by climbing out of the module's own folder, and
    // that spelling never contains `modules/`, so the folder globs cannot see it.

    it("rejects a sibling module reached by a relative path from src", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/__boundary__.ts",
        `import "../../beta/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("rejects a sibling module reached by a relative path from the module root", async () => {
      const result = await lintAt(
        "packages/modules/alpha/__boundary__.ts",
        `import "../beta/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("rejects a sibling module reached by a relative path from a nested folder", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/nested/__boundary__.ts",
        `import "../../../beta/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("rejects a sibling module reached from the deepest covered folder", async () => {
      // The deepest entry in `MODULE_FOLDER_DEPTHS`. Without it this climb is
      // matched by no depth entry at all.
      const result = await lintAt(
        "packages/modules/alpha/src/a/b/__boundary__.ts",
        `import "../../../../beta/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("rejects a sibling module reached from a folder four deep", async () => {
      // CLAUDE.md prescribes `src/lib/<name>/`, so this depth is ordinary once a
      // module grows. The ban may not stop at a fixed depth.
      const result = await lintAt(
        "packages/modules/alpha/src/lib/widgets/components/__boundary__.ts",
        `import "../../../../../beta/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("rejects a sibling module reached from a folder seven deep", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/a/b/c/d/e/f/__boundary__.ts",
        `import "../../../../../../../../beta/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("never calls a climb into core a sibling-module import", async () => {
      // R-7 bans another module, an app and a customer folder for a module, and
      // core is on none of those lists: a module imports core by design. The old
      // depth glob used `../*`, which also matched `..`, so this climb was
      // rejected with the sibling-module message, the wrong diagnosis (bead
      // genie-ops-center-v2-ft5). No rule here bans the spelling itself, because
      // no requirement does.
      const result = await lintAt(
        "packages/modules/alpha/src/__boundary__.ts",
        `import "../../../core/src/index.ts";\n`
      );

      expect(result.output).not.toContain(
        "a module never imports another module."
      );

      expect(result.failed).toBe(false);
    });

    it("rejects a sibling module reached by a re-export", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/lib/__boundary__.ts",
        `export { thing } from "../../../beta/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("rejects a sibling module reached by a star re-export", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/lib/__boundary__.ts",
        `export * from "../../../beta/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("reads the outermost module folder as the package root", async () => {
      // A module may hold a folder named like the workspace layout, for a fixture
      // or a template. A greedy root match would take that nested folder for the
      // package root and then call this ordinary alpha-internal import a sibling.
      const result = await lintAt(
        "packages/modules/alpha/src/packages/modules/beta/__boundary__.ts",
        `import "../../../../utils/__boundary_target__.ts";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports|boundaries\//);
    });

    it("still sees a real sibling from inside such a folder", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/packages/modules/beta/__boundary__.ts",
        `import "../../../../../beta/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("rejects a sibling module reached by a dynamic import", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/lib/__boundary__.ts",
        `export const load = () => import("../../../beta/src/index.ts");\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("rejects a sibling module reached by a literal require", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/lib/__boundary__.ts",
        `export const beta = require("../../../beta/src/index.ts");\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("a module never imports another module.");
    });

    it("leaves a local function named require alone, which loads nothing", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/lib/__boundary__.ts",
        [
          `function require(name: string): string {`,
          `  return name.toUpperCase();`,
          `}`,
          ``,
          `export const label = require("../../../beta/src/index.ts");`,
          ``,
        ].join("\n")
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports|boundaries\//);
    });

    it("leaves a computed specifier unjudged, because it needs the program to run", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/lib/__boundary__.ts",
        [
          `export const load = (name: string) =>`,
          "  import(`../../../${name}/src/index.ts`);",
          ``,
        ].join("\n")
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports|boundaries\//);
    });

    // The value narrowing must reject every non-string literal variant, not only
    // a template literal, which is a different AST node. Each case runs the real
    // oxlint binary, so a crash in the narrowing fails here.
    it.each([
      `export const beta = require(42);\n`,
      `export const load = () => import(42);\n`,
      `export const load = () => import(true);\n`,
    ])(
      "leaves a non-string literal specifier unjudged, because it names no module",
      async (source) => {
        const result = await lintAt(
          "packages/modules/alpha/src/lib/__boundary__.ts",
          source
        );

        expect(result.failed).toBe(false);

        expect(result.output).not.toMatch(/no-restricted-imports|boundaries\//);
      }
    );

    it("leaves a local re-export alone, which carries no specifier at all", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/lib/__boundary__.ts",
        `const thing = 1;\n\nexport { thing };\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports|boundaries\//);
    });

    it("still allows a module its own relative import from a folder four deep", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/lib/widgets/components/__boundary__.ts",
        `import "../../../../utils/__boundary_target__.ts";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports|boundaries\//);
    });

    it("still allows a module its own relative import that climbs to its root", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/lib/__boundary__.ts",
        `import "../../package.json";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports|boundaries\//);
    });

    it("keeps the module layer on a file past the deepest depth entry", async () => {
      // `packages/modules/*/**` is the fallback for a module file more than three
      // folders below its own root. Every `MODULE_FOLDER_DEPTHS` entry repeats the
      // whole layer but matches one exact depth, so this depth-4 path is covered by
      // that fallback alone. Delete it and the file loses `MODULE_LAYER` and
      // `NO_CONFIG` entirely. The sibling climb at this depth stays allowed: that is
      // the documented ceiling, not a defect.
      const result = await lintAt(
        "packages/modules/alpha/src/a/b/c/__boundary__.ts",
        `import "pg";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "a module reads the database through ctx.tenant.db (DEC-34)."
      );
    });

    it("keeps the NO_CONFIG restriction on a module file past the deepest depth entry", async () => {
      // `packages/modules/*/**` is the fallback for a module file more than three
      // folders below its own root. The depth-4 entry repeats the whole layer,
      // including `NO_CONFIG`. This test proves `NO_CONFIG` fires at that depth
      // so the restriction list on entry 250 is not test-invisible.
      const result = await lintAt(
        "packages/modules/alpha/src/a/b/c/__boundary__.ts",
        `import "@genie/config";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "product code never imports the shared configuration package (R-7a)."
      );
    });

    it("still allows a module its own relative import from src", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/__boundary__.ts",
        `import "../lib/__boundary_target__.ts";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("still allows a module its own relative import from a nested folder", async () => {
      // `../../` from `src/nested/` lands back in the module root, so this is the
      // exact string a sibling import uses one level shallower. The ban is keyed on
      // the importing file's depth, which is what keeps these two apart.
      const result = await lintAt(
        "packages/modules/alpha/src/nested/__boundary__.ts",
        `import "../../utils/__boundary_target__.ts";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("rejects core reaching a customer app through a relative path", async () => {
      const result = await lintAt(
        "packages/core/src/__boundary__.ts",
        `import "../../../customers/acme/app/src/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("core never imports a customer folder.");
    });

    it("rejects core importing a named binding from the storybook host", async () => {
      const result = await lintAt(
        "packages/core/__boundary__/__boundary__.ts",
        `import { preview } from "@genie/storybook";\n\nexport const echo = preview;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("core never imports an app.");
    });

    it("rejects a module importing a storybook host subpath", async () => {
      const result = await lintAt(
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

    it("lets the storybook host main file compose config and the selectors", async () => {
      const result = await lintAtIsolated(
        "apps/storybook/.storybook/main.ts",
        `import { sharedStorybookConfig } from "@genie/config/storybook";\nimport { readModuleInventory, resolveModuleSelection } from "@genie/generators";\n\nexport const main = {\n  preset: sharedStorybookConfig,\n  readModuleInventory,\n  resolveModuleSelection,\n};\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("rejects a generator subpath from the storybook host main file", async () => {
      const result = await lintAtIsolated(
        "apps/storybook/.storybook/main.ts",
        `import "@genie/generators/selection";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "Storybook main consumes only the public selector entrypoint."
      );
    });

    it("rejects a relative generator path from the storybook host main file", async () => {
      const result = await lintAtIsolated(
        "apps/storybook/.storybook/main.ts",
        `import "../../../tools/generators/src/selection/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "Storybook main consumes only the public selector entrypoint."
      );
    });

    it("rejects a database driver from the storybook host main file", async () => {
      const result = await lintAtIsolated(
        "apps/storybook/.storybook/main.ts",
        `import "pg";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("an app opens no connection (DEC-34).");
    });

    it("rejects the selector import from the storybook preview file", async () => {
      // This is not a blanket `.storybook/**` exemption. Only `main.ts` composes.
      const result = await lintAtIsolated(
        "apps/storybook/.storybook/preview.tsx",
        `import "@genie/generators";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports a generator");
    });

    it("rejects shared config from the storybook preview file", async () => {
      const result = await lintAtIsolated(
        "apps/storybook/.storybook/preview.tsx",
        `import "@genie/config/storybook";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports the shared configuration");
    });

    it("rejects tooling from ordinary app source", async () => {
      const result = await lintAt(
        "apps/storybook/src/__boundary__.ts",
        `import "@genie/generators";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain("never imports a generator");
    });
  }
);

describe.concurrent(
  "the contracts and schema subpaths",
  { timeout: LINT_TIMEOUT },
  () => {
    it("lets tooling import the build-safe tenant schemas", async () => {
      const result = await lintAt(
        "tools/generators/__boundary__/__boundary__.ts",
        `import "@genie/core/tenant-config";\n`
      );

      expect(result.failed).toBe(false);
    });

    it("lets a module import the contracts surface", async () => {
      const result = await lintAt(
        "packages/modules/example/__boundary__/__boundary__.ts",
        `import "@genie/core/contracts";\n`
      );

      expect(result.failed).toBe(false);
    });

    it("lets the contracts surface import zod", async () => {
      const result = await lintAt(
        "packages/core/contracts/__boundary__/__boundary__.ts",
        `import "zod";\n`
      );

      expect(result.failed).toBe(false);
    });

    it("stops the contracts surface importing anything else", async () => {
      const result = await lintAt(
        "packages/core/contracts/__boundary__/__boundary__.ts",
        `import "node:fs";\n`
      );

      expect(result.failed).toBe(true);
      expect(result.output).toContain(
        "contracts import only zod and types (DEC-42)."
      );
    });

    it("stops the tenant schemas importing a database driver", async () => {
      const result = await lintAt(
        "packages/core/src/lib/tenant-config/__boundary__/__boundary__.ts",
        `import "pg";\n`
      );

      expect(result.failed).toBe(true);
    });

    it("stops core testing helpers importing a module", async () => {
      const result = await lintAt(
        "packages/core/testing/__boundary__/__boundary__.ts",
        `import "@genie/module-placeholder";\n`
      );

      expect(result.failed).toBe(true);
      expect(result.output).toContain("core never imports a module");
    });
  }
);

/** The serialized pattern shape `restrict()` writes into every override. */
type SerializedPattern = {
  group: string[];
  message: string;
  allowTypeImports?: boolean;
};

/** Reads the patterns back out of one override. */
function patternsOf(
  override: (typeof importBoundaryOverrides)[number]
): SerializedPattern[] {
  // SAFETY: every entry in `importBoundaryOverrides` comes from `restrict()`, which
  // writes this rule as exactly this two-element array. Oxlint exports no type for
  // the rule's configuration, and its declared type is a union that includes a bare
  // severity string, so reading the patterns back needs the assertion.
  const rule = override.rules?.["no-restricted-imports"] as [
    "error",
    { patterns: SerializedPattern[] },
  ];

  return rule[1].patterns;
}

describe("the serialized oxlint configuration", () => {
  it("keeps allowTypeImports on the contracts pattern", async () => {
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

  it("omits allowTypeImports from every other pattern", async () => {
    const carriers = importBoundaryOverrides
      .flatMap(patternsOf)
      .filter((pattern) => "allowTypeImports" in pattern);

    // `toEqual` on the whole list, not `objectContaining` on one entry: an extra
    // serialized field on any other pattern lengthens this list and fails here.
    expect(carriers).toEqual([
      {
        group: ["*", "!zod", "!zod/**"],
        message: "contracts import only zod and types (DEC-42).",
        allowTypeImports: true,
      },
    ]);
  });
});

describe.concurrent(
  "the tooling relative-path glob",
  { timeout: LINT_TIMEOUT },
  () => {
    it("rejects a generators climb without the tools path segment", async () => {
      const result = await lintAt(
        "packages/core/src/__boundary__.ts",
        'import "../generators/index.ts";\n'
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "product code never imports a generator (R-7a)."
      );
    });

    it("allows a legitimate relative climb within core", async () => {
      const result = await lintAt(
        "packages/core/src/nested/__boundary__.ts",
        'import "../lib/index.ts";\n'
      );

      expect(result.failed).toBe(false);
    });
  }
);

// The helpers under `packages/core/testing` are test-only (R-39), so a production
// `src/` file may not reach them. Test and fixture files still may, because that
// is where the helpers belong.
describe.concurrent(
  "the test-only import ban",
  { timeout: LINT_TIMEOUT },
  () => {
    it("stops a src file importing the core testing entrypoint", async () => {
      const result = await lintAt(
        "packages/core/src/__boundary__.ts",
        `import "@genie/core/testing";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "never imports the test-only helpers under @genie/core/testing"
      );
    });

    it("stops a src file importing a named binding from a core testing subpath", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/__boundary__.ts",
        `import { startDisposableDeployment } from "@genie/core/testing";\n\nexport const start = startDisposableDeployment;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "never imports the test-only helpers under @genie/core/testing"
      );
    });

    it("stops a src file reaching core testing by a relative climb", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/__boundary__.ts",
        `import "../../../core/testing/index.ts";\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toContain(
        "never imports the test-only helpers under @genie/core/testing"
      );
    });

    it("leaves a colocated test file free to import the core testing helpers", async () => {
      const result = await lintAt(
        "packages/core/src/__boundary__.test.ts",
        `import "@genie/core/testing";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("leaves a module test file free to import the core testing helpers", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/__boundary__.test.ts",
        `import "@genie/core/testing";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });

    it("leaves a story file free to import the core testing helpers", async () => {
      const result = await lintAt(
        "packages/modules/alpha/src/__boundary__.stories.tsx",
        `import "@genie/core/testing";\n`
      );

      expect(result.failed).toBe(false);

      expect(result.output).not.toMatch(/no-restricted-imports/);
    });
  }
);
