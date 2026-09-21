import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CORE_HISTORY,
  MIGRATION_LOCK_KEY,
  migrationPlan,
  moduleHistory,
  releaseMode,
  runFailure,
  sessionCleanupPlan,
} from "./index.ts";

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

  it("gives core its own ledger table", () => {
    expect(CORE_HISTORY.table).toBe("__drizzle_migrations");
  });

  it("names core's folder so that it resolves from any working directory", () => {
    expect(isAbsolute(CORE_HISTORY.folder)).toBe(true);

    expect(existsSync(join(CORE_HISTORY.folder, "meta", "_journal.json"))).toBe(
      true
    );
  });

  it("reads a module's history from its declaration, not from its schema shape", () => {
    const history = moduleHistory({
      identity: { id: "alpha" },
      schema: {
        migrationsFolder: "/somewhere/alpha/drizzle",
        migrationsTable: "__drizzle_migrations_alpha",
      },
    });

    expect(history).toEqual({
      name: "alpha",
      folder: "/somewhere/alpha/drizzle",
      table: "__drizzle_migrations_alpha",
    });
  });
});

describe("the session cleanup plan", () => {
  it("resets the setting after a lock the run never got", () => {
    // The failure the review found: `SET lock_timeout` succeeded, the lock timed
    // out, and the old code left the setting on a client it returned to the pool.
    expect(sessionCleanupPlan({ settingApplied: true, locked: false })).toEqual(
      ["reset"]
    );
  });

  it("unlocks first and resets after, when the run held the lock", () => {
    expect(sessionCleanupPlan({ settingApplied: true, locked: true })).toEqual([
      "unlock",
      "reset",
    ]);
  });

  it("does nothing when the setting never applied", () => {
    expect(
      sessionCleanupPlan({ settingApplied: false, locked: false })
    ).toEqual([]);
  });

  it("still unlocks when the setting failed but the lock was taken", () => {
    expect(sessionCleanupPlan({ settingApplied: false, locked: true })).toEqual(
      ["unlock"]
    );
  });
});

describe("the outcome of a run", () => {
  it.each([
    { migrationFailed: true, cleanupConfirmed: true, expected: "original" },
    { migrationFailed: true, cleanupConfirmed: false, expected: "original" },
    { migrationFailed: false, cleanupConfirmed: false, expected: "cleanup" },
    { migrationFailed: false, cleanupConfirmed: true, expected: "none" },
  ])(
    "answers $expected when the migration failed is $migrationFailed and cleanup confirmed is $cleanupConfirmed",
    (matrix) => {
      expect(
        runFailure({
          migrationFailed: matrix.migrationFailed,
          cleanupConfirmed: matrix.cleanupConfirmed,
        })
      ).toBe(matrix.expected);
    }
  );

  it("fails the start when every history applied and the session would not restore", () => {
    // The case the review found: the client was destroyed, and the run still
    // resolved, so a container started on a session nobody could account for.
    expect(
      runFailure({ migrationFailed: false, cleanupConfirmed: false })
    ).toBe("cleanup");
  });
});

describe("the release decision", () => {
  it("returns a confirmed session to the pool", () => {
    expect(releaseMode(true)).toBe("reuse");
  });

  it("destroys a session whose restoration did not confirm", () => {
    expect(releaseMode(false)).toBe("destroy");
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
