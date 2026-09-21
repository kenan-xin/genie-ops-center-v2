import { describe, expect, it } from "vitest";

import { CORE_HISTORY, MIGRATION_LOCK_KEY, migrationPlan } from "./index.ts";

describe("the migration plan", () => {
  it("applies core first, then each module in registry order", () => {
    const alpha = {
      name: "alpha",
      folder: "packages/modules/alpha/drizzle",
      table: "__drizzle_migrations_alpha",
    };

    const beta = {
      name: "beta",
      folder: "packages/modules/beta/drizzle",
      table: "__drizzle_migrations_beta",
    };

    expect(migrationPlan([alpha, beta]).map((entry) => entry.name)).toEqual([
      "core",
      "alpha",
      "beta",
    ]);
  });

  it("applies core alone when no module is included", () => {
    expect(migrationPlan([])).toEqual([CORE_HISTORY]);
  });

  it("gives core its own folder and the core ledger table", () => {
    expect(CORE_HISTORY.table).toBe("__drizzle_migrations");
    expect(CORE_HISTORY.folder).toBe("packages/core/drizzle");
  });
});

describe("the advisory lock key", () => {
  it("is one fixed value for the whole application", () => {
    expect(MIGRATION_LOCK_KEY).toBe(7562301498120384n);
  });

  it("fits in a signed 64 bit integer, which is what Postgres takes", () => {
    expect(MIGRATION_LOCK_KEY).toBeGreaterThan(0n);
    expect(MIGRATION_LOCK_KEY).toBeLessThan(2n ** 63n);
  });
});
