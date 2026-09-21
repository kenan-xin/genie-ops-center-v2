import { describe, expect, it } from "vitest";

import * as core from "./index.ts";

/**
 * The package root is what an app and a module import. A member missing here is unreachable
 * however complete its implementation is, which is how `createTenantContext` was unreachable at
 * commit 0cec072 while its own tests passed (R-17).
 */
describe("the core package root", () => {
  it("exports the tenant-context factory", () => {
    expect(core.createTenantContext).toBeTypeOf("function");
  });

  it("builds a context through the package root and holds its two members", async () => {
    const context = core.createTenantContext({
      DATABASE_URL: "postgres://genie:secret@db.invalid:5432/genie",
      PUBLIC_URL: "https://genie.example.com",
    });

    try {
      expect(Object.keys(context).toSorted()).toEqual(["db", "env"]);
    } finally {
      await context.db.$client.end();
    }
  });

  it("exports the one authorization seam", () => {
    expect(core.can).toBeTypeOf("function");
    expect(core.scopesFor).toBeTypeOf("function");
    expect(core.createRequestPrincipal).toBeTypeOf("function");
  });

  it("exports the environment, error and module-contract surface a module needs", () => {
    expect(core.validateEnvironment).toBeTypeOf("function");
    expect(core.safeBodyFor).toBeTypeOf("function");
    expect(core.defineModuleErrors).toBeTypeOf("function");
    expect(core.validateModule).toBeTypeOf("function");
    expect(core.permissionKeyFor).toBeTypeOf("function");
  });

  it("exports no connection, database, settings, branding or storage singleton", () => {
    for (const name of ["db", "pool", "settings", "branding", "storage"]) {
      expect(Object.hasOwn(core, name)).toBe(false);
    }
  });
});
