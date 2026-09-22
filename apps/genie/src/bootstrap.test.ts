import {
  type RedactingLogger,
  createLogger,
  validateEnvironment,
} from "@genie/core";
import { describe, expect, it, vi } from "vitest";

import { runBootstrap } from "./bootstrap.ts";

const VALID_SOURCE = {
  DATABASE_URL: "postgres://u:p@h:5432/d",
  PUBLIC_URL: "https://example.invalid",
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

describe("runBootstrap failure handling", () => {
  it("exits nonzero when validation fails, without connecting", async () => {
    const exit = vi.fn();
    const connect = vi.fn();

    await runBootstrap({
      source: {},
      connect,
      migrate: vi.fn(),
      exit,
      budgetMs: 500,
    });

    expect(connect).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  // R-19b says ONE total budget covering diagnostics, cleanup and logger
  // flushing. So the decisive case hangs both, and the bound must reject a
  // per-phase implementation. With a 500 ms total, a shared deadline finishes
  // near 500 ms while a timer per phase takes at least 1000 ms. A bound of
  // 900 ms separates them; an earlier 900 ms bound against a 300 ms budget did
  // not, because it accepted two 300 ms phases plus overhead.
  it("spends one total budget when cleanup and the flush both hang", async () => {
    const exit = vi.fn();
    const started = Date.now();

    await runBootstrap({
      source: VALID_SOURCE,
      logger: stuckLogger(),
      connect: () => hangingContext,
      migrate: () => Promise.reject(new Error("migration failed")),
      exit,
      budgetMs: 500,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(900);
  });

  it("exits nonzero inside the budget when cleanup never settles", async () => {
    const exit = vi.fn();
    const started = Date.now();

    await runBootstrap({
      source: VALID_SOURCE,
      connect: () => hangingContext,
      migrate: () => Promise.reject(new Error("migration failed")),
      exit,
      budgetMs: 500,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(900);
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
      budgetMs: 500,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(900);
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
      budgetMs: 500,
    });

    expect(end).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(900);
  });

  it("reaches exit when the pool end throws synchronously", async () => {
    const exit = vi.fn();
    const started = Date.now();

    await runBootstrap({
      source: VALID_SOURCE,
      connect: () => syncThrowingEndContext,
      migrate: () => Promise.reject(new Error("migration failed")),
      exit,
      budgetMs: 500,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(Date.now() - started).toBeLessThan(900);
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
      budgetMs: 500,
    });

    expect(order).toEqual(["connect", "migrate", "publish"]);
  });
});
