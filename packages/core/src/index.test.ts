import { describe, expect, it } from "vitest";

import * as core from "./index.ts";
import { silentLogger } from "./services/logging/index.ts";

/** `createLogger` reads only the level. */
const MINIMAL_ENV = { logLevel: "info" } as const;

/**
 * The package root is what an app and a module import. A member missing here is unreachable
 * however complete its implementation is, which is how `createTenantContext` was unreachable at
 * commit 0cec072 while its own tests passed (R-17).
 */
describe("the core package root", () => {
  it("exports the tenant-context factory", () => {
    expect(core.createTenantContext).toBeTypeOf("function");
  });

  it("builds a context through the package root and holds its fixed members", async () => {
    const context = core.createTenantContext(
      {
        DATABASE_URL: "postgres://genie:secret@db.invalid:5432/genie",
        PUBLIC_URL: "https://genie.example.com",
      },
      silentLogger(),
      []
    );

    try {
      expect(Object.keys(context).toSorted()).toEqual([
        "branding",
        "db",
        "entitlements",
        "env",
        "fileStorage",
        "jobQueue",
        "settings",
      ]);
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

  it("exports the logger a deployment builds and the execution seam a request takes", () => {
    expect(core.createLogger).toBeTypeOf("function");
    expect(core.forExecution).toBeTypeOf("function");
  });

  it("writes one execution's ids on the lines of a logger taken through the package root", () => {
    const lines: unknown[] = [];

    const destination = {
      write(line: string) {
        lines.push(JSON.parse(line));
      },
    };

    const bindings: core.LogBindings = {
      requestId: "r1",
      tenantId: "t1",
      userId: "u1",
    };

    const logger = core.forExecution(
      core.createLogger(MINIMAL_ENV, destination),
      bindings
    );

    logger.info("one line through the root");

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject(bindings);
  });

  it("exports no connection, database, settings, branding or storage singleton", () => {
    for (const name of [
      "db",
      "pool",
      "settings",
      "branding",
      "entitlements",
      "storage",
    ]) {
      expect(Object.hasOwn(core, name)).toBe(false);
    }
  });
});
