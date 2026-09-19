import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKSPACE_ROOT, lintAt } from "./__testing__/lint-at.ts";

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
      "tooling uses the build-safe core schema entrypoints only, never the runtime entrypoint (R-7a)."
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
});
