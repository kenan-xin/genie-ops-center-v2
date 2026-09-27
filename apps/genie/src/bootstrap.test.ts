import {
  type RedactingLogger,
  createLogger,
  validateEnvironment,
} from "@genie/core";
import { describe, expect, it, vi } from "vitest";

import { runBootstrap } from "./bootstrap.ts";
import type { AppContext } from "./context.ts";

const VALID_SOURCE = {
  DATABASE_URL: "postgres://u:p@h:5432/d",
  PUBLIC_URL: "https://example.invalid",
  // The Section 2 application profile requires the authentication values; the realm address is
  // unreachable, so the built context has an auth member in the `degraded` discovery state.
  BETTER_AUTH_SECRET: "test-better-auth-secret-at-least-32-characters",
  KEYCLOAK_URL: "http://127.0.0.1:1",
  KEYCLOAK_REALM: "genie",
  KEYCLOAK_CLIENT_ID: "genie-ops-center",
  KEYCLOAK_CLIENT_SECRET: "test-client-secret",
};

// SAFETY: the bootstrap reads only `tenant.db.$client.end` from the context it
// is handed, and this fixture supplies exactly that member. Nothing else of the
// context is read, and the member never settles so the cleanup budget is spent.
const hangingContext = {
  tenant: { db: { $client: { end: () => new Promise(() => {}) } } },
} as never;

// SAFETY: as above, but `end` settles at once, so only the flush half of the
// budget is left to hang.
const settledContext = {
  tenant: { db: { $client: { end: async () => {} } } },
} as never;

// SAFETY: as `settledContext`, but `end` throws before a promise exists, so the
// failure is the cleanup step itself rather than an unsettled one. Nothing else
// of the context is read.
const syncThrowingEndContext = {
  tenant: {
    db: {
      $client: {
        end: () => {
          throw new Error("pool end failed");
        },
      },
    },
  },
} as never;

// SAFETY: as `settledContext`, but `end` is a counted spy that settles at
// once, so the test observes the cleanup attempt; nothing else of the context
// is read.
const spiedSettledContext = (end: () => Promise<void>) =>
  ({ tenant: { db: { $client: { end } } } }) as never;

/**
 * A logger whose `flush` never calls back, so the flush half of the one total
 * budget can be exercised. The image never injects one, so no fault-injection
 * switch ships in production code.
 */
function stuckLogger(): RedactingLogger {
  const logger = createLogger(validateEnvironment(VALID_SOURCE));

  // A real logger settles its flush. This one deliberately never calls back, so
  // the flush half of the budget is what the test measures.
  logger.flush = () => {};

  return logger;
}

/**
 * A real logger whose failure diagnostic throws, the way a broken or closed
 * transport can. The failure handler's contract is never-throws/always-exits,
 * so a diagnostic that fails must not be the thing that decides whether the
 * process exits.
 */
function diagnosticThrowingLogger(): RedactingLogger {
  const logger = createLogger(validateEnvironment(VALID_SOURCE));

  logger.error = () => {
    throw new Error("diagnostic failed");
  };

  return logger;
}

/**
 * The one total budget the failure cases exercise (R-19b), and the wall-clock
 * bound that proves it is one budget rather than one per phase. See the
 * decisive case below for why the bound sits where it does.
 */
const BUDGET_MS = 1000;

const BUDGET_BOUND_MS = 1800;

describe("runBootstrap failure handling", () => {
  it("exits nonzero when validation fails, without connecting", async () => {
    const exit = vi.fn();
    const connect = vi.fn();

    await runBootstrap({
      source: {},
      connect,
      migrate: vi.fn(),
      exit,
      budgetMs: BUDGET_MS,
    });

    expect(connect).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  // R-19b says ONE total budget covering diagnostics, cleanup and logger
  // flushing. So the decisive case hangs both, and the bound must reject a
  // per-phase implementation: a shared deadline finishes in about BUDGET_MS
  // while a timer per phase takes at least twice that.
  //
  // The bound is wall-clock, so it also has to absorb the scheduler delay of a
  // loaded machine. Measured: against a 500 ms budget and a 900 ms bound a
  // correct run took 902 ms while several worktrees ran suites and failed, the
  // 400 ms of slack consumed by event-loop delay. A 1000 ms budget with an
  // 1800 ms bound keeps the same discrimination — a per-phase implementation
  // still needs at least 2000 ms — and doubles the slack to 800 ms.
  it("spends one total budget when cleanup and the flush both hang", async () => {
    const exit = vi.fn();
    const started = Date.now();

    await runBootstrap({
      source: VALID_SOURCE,
      logger: stuckLogger(),
      connect: () => hangingContext,
      migrate: () => Promise.reject(new Error("migration failed")),
      exit,
      budgetMs: BUDGET_MS,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(BUDGET_BOUND_MS);
  });

  it("exits nonzero inside the budget when cleanup never settles", async () => {
    const exit = vi.fn();
    const started = Date.now();

    await runBootstrap({
      source: VALID_SOURCE,
      connect: () => hangingContext,
      migrate: () => Promise.reject(new Error("migration failed")),
      exit,
      budgetMs: BUDGET_MS,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(BUDGET_BOUND_MS);
  });

  it("exits nonzero inside the budget when the logger flush never settles", async () => {
    const exit = vi.fn();
    const started = Date.now();

    // The flush half on its own. The image cannot be made to hang here without
    // shipping a fault-injection switch, so it is proven at this level.
    await runBootstrap({
      source: VALID_SOURCE,
      logger: stuckLogger(),
      connect: () => settledContext,
      migrate: () => Promise.reject(new Error("migration failed")),
      exit,
      budgetMs: BUDGET_MS,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(BUDGET_BOUND_MS);
  });

  // The failure handler promises never-throws/always-exits, so a secondary
  // failure on the failure path itself — the diagnostic, or the cleanup it
  // calls — must not be what decides whether the process exits. Each test
  // below breaks one secondary step while the migration failure is the real
  // cause, and the same shared-budget bound as the hanging tests applies.
  it("reaches cleanup and exit when the failure diagnostic throws", async () => {
    const exit = vi.fn();
    const end = vi.fn(async () => {});
    const started = Date.now();

    await runBootstrap({
      source: VALID_SOURCE,
      logger: diagnosticThrowingLogger(),
      connect: () => spiedSettledContext(end),
      migrate: () => Promise.reject(new Error("migration failed")),
      exit,
      budgetMs: BUDGET_MS,
    });

    expect(end).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(BUDGET_BOUND_MS);
  });

  it("reaches exit when the pool end throws synchronously", async () => {
    const exit = vi.fn();
    const started = Date.now();

    await runBootstrap({
      source: VALID_SOURCE,
      connect: () => syncThrowingEndContext,
      migrate: () => Promise.reject(new Error("migration failed")),
      exit,
      budgetMs: BUDGET_MS,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(BUDGET_BOUND_MS);
  });

  it("publishes the context only after migrations succeed", async () => {
    const order: string[] = [];

    await runBootstrap({
      source: VALID_SOURCE,
      connect: () => {
        order.push("connect");

        return settledContext;
      },
      migrate: async () => {
        order.push("migrate");
      },
      publish: () => order.push("publish"),
      exit: vi.fn(),
      budgetMs: BUDGET_MS,
    });

    expect(order).toEqual(["connect", "migrate", "publish"]);
  });
});

/**
 * The real composition root, with no `connect` injected, so `buildContext` calls
 * `createTenantContext` the way the image does. This is the wiring the pool's
 * idle-error containment depends on: the context is built with the process
 * logger, so a dropped idle connection reaches the log instead of exiting.
 */
describe("runBootstrap production wiring", () => {
  it("builds the tenant context with the process logger, so an idle pool error is recorded", async () => {
    const lines: unknown[] = [];

    const logger = createLogger(
      { logLevel: "info" },
      {
        write(line: string) {
          lines.push(JSON.parse(line));
        },
      }
    );

    let published: AppContext | undefined;

    await runBootstrap({
      source: VALID_SOURCE,
      logger,
      // The source names a database this test never opens, so migration is stubbed;
      // the pool itself stays lazy, and nothing here connects.
      migrate: async () => {},
      publish: (context) => {
        published = context;
      },
      exit: () => {
        throw new Error("a successful bootstrap must not exit");
      },
      budgetMs: BUDGET_MS,
    });

    const pool = published?.tenant.db.$client;

    expect(pool?.listenerCount("error")).toBeGreaterThan(0);

    pool?.emit("error", new Error("the backend went away"));

    expect(lines).toContainEqual(
      expect.objectContaining({ msg: "idle database client error" })
    );

    await pool?.end();
  });
});

/**
 * The bootstrap owns the `runMigrations` call in production, so the migrator's
 * diagnostics reach the container log only if this call passes the process
 * logger in as the run's `log`. The real migrator runs here against a scripted
 * session client and no database, and the injected process logger's sink is
 * what the assertions read: every migration event must arrive through it, a
 * failed history must be named by the log the run wrote before failing, and a
 * cleanup failure must carry its cause.
 */

/** The two outcomes a migration run can be scripted to reach without a database. */
type MigrationDouble = {
  onMigrationSql: "resolve" | "reject";
  onUnlock: "confirm" | "deny";
};

const sqlOf = (query: string | { text: string }) =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- pg's query argument is a string or a config object, and this double must read either
  (typeof query === "string" ? query : query.text).replace(/\s+/g, " ").trim();

/**
 * A session client that answers the migrator's own control statements and
 * scripts everything else: the ledger and history SQL drizzle's apply sends,
 * and the advisory-unlock reply the cleanup reads.
 */
function migrationClientDouble(behavior: MigrationDouble) {
  return {
    query: async (query: string | { text: string }) => {
      const sql = sqlOf(query);

      if (sql.startsWith("SET lock_timeout")) return { rows: [] };

      if (sql.startsWith("SELECT pg_advisory_lock")) return { rows: [] };

      if (sql.startsWith("SELECT pg_advisory_unlock")) {
        return behavior.onUnlock === "deny"
          ? { rows: [{ pg_advisory_unlock: false }] }
          : { rows: [{ pg_advisory_unlock: true }] };
      }

      if (sql.startsWith("RESET lock_timeout")) return { rows: [] };

      // A read is not the migration SQL this double scripts. The run reads the catalog for the
      // omission check and reads `setup_step` before registering, so both answer empty here and
      // the run reaches the history it is meant to fail.
      if (sql.toLowerCase().startsWith("select")) return { rows: [] };

      if (behavior.onMigrationSql === "reject") {
        throw new Error("migration sql refused by the double");
      }

      return { rows: [] };
    },
    release: () => {},
  };
}

function migrationContextDouble(behavior: MigrationDouble) {
  const client = migrationClientDouble(behavior);

  // SAFETY: the bootstrap's default migrate reads only `tenant.env` and
  // `tenant.db.$client` from the context, and the failure shutdown reads only
  // the same client's `end`. This fixture supplies exactly those members, and
  // `connect` bypasses `buildContext`, so no pool is created and the run never
  // leaves the process.
  return {
    tenant: {
      env: validateEnvironment(VALID_SOURCE),
      db: { $client: { connect: async () => client, end: async () => {} } },
    },
  } as never;
}

/** A real redacting logger at the production default level, captured raw. */
function sinkLogger(lines: string[]): RedactingLogger {
  return createLogger(
    { logLevel: "info" },
    {
      write(line: string) {
        // Whitespace-normalized, so the assertions read one serialized shape
        // regardless of how the sink lays a line out.
        lines.push(JSON.stringify(JSON.parse(line)));
      },
    }
  );
}

const countLinesWith = (log: string, needle: string) =>
  log.split("\n").filter((line) => line.includes(needle)).length;

describe("runBootstrap migration diagnostics", () => {
  it("writes every migration event through the process logger", async () => {
    const lines: string[] = [];

    await runBootstrap({
      source: VALID_SOURCE,
      logger: sinkLogger(lines),
      connect: () =>
        migrationContextDouble({
          onMigrationSql: "resolve",
          onUnlock: "confirm",
        }),
      publish: () => {},
      exit: () => {
        throw new Error("a successful bootstrap must not exit");
      },
      budgetMs: BUDGET_MS,
    });

    const log = lines.join("\n");

    expect(log).toContain("migration-lock-held");
    expect(log).toContain("migration-history-start");
    expect(log).toContain('"history":"core"');
    expect(log).toContain("migration-history-done");

    // Every history that started also finished: the run reached its normal end.
    expect(countLinesWith(log, "migration-history-start")).toBe(
      countLinesWith(log, "migration-history-done")
    );

    expect(log).toContain("bootstrap complete");
  });

  it("names the failing history in the log and exits when a history fails", async () => {
    const lines: string[] = [];
    const exit = vi.fn();

    await runBootstrap({
      source: VALID_SOURCE,
      logger: sinkLogger(lines),
      connect: () =>
        migrationContextDouble({
          onMigrationSql: "reject",
          onUnlock: "confirm",
        }),
      publish: () => {
        throw new Error("a failed migration must not publish");
      },
      exit,
      budgetMs: BUDGET_MS,
    });

    expect(exit).toHaveBeenCalledWith(1);

    const log = lines.join("\n");

    const startLines = log
      .split("\n")
      .filter((line) => line.includes("migration-history-start"));

    expect(startLines.length).toBeGreaterThanOrEqual(1);

    // The history the run was applying when it failed is the one its last
    // start line names, and no done line may name it afterwards.
    const failing = /"history":"([^"]+)"/.exec(startLines.at(-1) ?? "")?.[1];

    expect(failing).toBeDefined();

    expect(
      log
        .split("\n")
        .some(
          (line) =>
            line.includes("migration-history-done") &&
            line.includes(`"history":"${failing}"`)
        )
    ).toBe(false);

    expect(log).toContain("bootstrap failed");
  });

  it("carries the cleanup cause when the session cannot be restored", async () => {
    const lines: string[] = [];
    const exit = vi.fn();

    await runBootstrap({
      source: VALID_SOURCE,
      logger: sinkLogger(lines),
      connect: () =>
        migrationContextDouble({ onMigrationSql: "resolve", onUnlock: "deny" }),
      publish: () => {
        throw new Error("a failed migration must not publish");
      },
      exit,
      budgetMs: BUDGET_MS,
    });

    expect(exit).toHaveBeenCalledWith(1);

    // The generic failure the caller sees never holds the cause; the cleanup
    // event in the log is the only place it can reach an operator, so the
    // message must be there, serialized by the redacting logger.
    const cleanupLines = lines
      .join("\n")
      .split("\n")
      .filter((line) => line.includes("migration-cleanup-failed"));

    expect(cleanupLines).toHaveLength(1);
    expect(cleanupLines[0]).toContain("did not hold the advisory lock");
  });
});
