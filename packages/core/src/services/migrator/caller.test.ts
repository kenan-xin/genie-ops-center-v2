import type { Pool, PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/errors/index.ts";
import type { DeploymentEnvironment } from "../../lib/tenant-context/index.ts";
import { CORE_HISTORY, runMigrations } from "./index.ts";

/**
 * Caller-level unit proofs. They watch which statements `runMigrations` sends and how it
 * releases its client, with a recording client in place of a database.
 *
 * They are not a Postgres acceptance and prove nothing about Postgres itself: no lock is
 * taken, no ledger is written and no migration is applied. The real behavior is the
 * integration target, which needs a container runtime and has not run (bead
 * `genie-ops-center-v2-2tc`). What these prove is this function's own sequence: the reset
 * after an acquisition that failed, the destroy after a cleanup that failed, and which error
 * a caller ends up with.
 */
const ENV: DeploymentEnvironment = {
  databaseUrl: "postgres://genie:secret@db.invalid:5432/genie",
  publicUrl: "https://genie.example.com",
  fileStorageAdapter: "postgres",
  fileMaxBytes: 15728640,
  chatAllowedOrigins: [],
  authTrustedProxies: [],
  lockTimeoutMs: 1000,
  logLevel: "silent",
  port: 3000,
  mailProvider: "none",
  mailFrom: undefined,
  resendApiKey: undefined,
  smtpUrl: undefined,
};

type Script = {
  /** A fragment of the statement text this entry answers. */
  readonly match: string;
  /** The entry rejects with this error when it matches. */
  readonly error?: Error;
  /** The entry answers with these rows when it matches and has no error. */
  readonly rows?: readonly unknown[];
};

/**
 * A client that records its statements, answers the ones it was scripted to, and notes its
 * release. The rows are the only way to say what a real `pg_advisory_unlock` answers, so a
 * test can describe an unlock that reports the lock was not held here. An unscripted unlock
 * answers the one-row boolean PostgreSQL always gives: true, this session held the lock.
 */
function recordingPool(script: readonly Script[] = []) {
  const statements: string[] = [];
  const released: boolean[] = [];

  // SAFETY: pg's `query` carries several overloads, and the run uses one of them, the text
  // with an optional parameter list. The double answers that one.
  const query = ((text: string) => {
    statements.push(text);

    const entry = script.find((candidate) => text.includes(candidate.match));

    if (entry?.error !== undefined) return Promise.reject(entry.error);

    if (entry?.rows !== undefined) return Promise.resolve({ rows: entry.rows });

    if (text.includes("pg_advisory_unlock")) {
      return Promise.resolve({ rows: [{ pg_advisory_unlock: true }] });
    }

    return Promise.resolve({ rows: [] });
  }) as PoolClient["query"];

  const client: Partial<PoolClient> = {
    query,
    release: (destroy?: boolean) => {
      released.push(destroy === true);
    },
  };

  // SAFETY: the run reads `query` and `release` on the client it reserves and nothing else,
  // so those two members are the whole surface this double has to answer.
  const reserved = client as PoolClient;

  const pool: Pick<Pool, "connect"> = {
    connect: () => Promise.resolve(reserved),
  };

  return { pool, statements, released };
}

/** The error Postgres raises when the lock wait limit expires. */
function lockTimeout(): Error {
  return Object.assign(new Error("canceling statement due to lock timeout"), {
    code: "55P03",
  });
}

/** A logger that throws exactly when the run reports a cleanup failure, as a broken one would. */
function brokenLogger(event: { readonly event: string }): void {
  if (event.event === "migration-cleanup-failed") {
    throw new Error("the logger is down");
  }
}

describe("runMigrations, watched through a recording client", () => {
  it("applies every history, unlocks and returns the client", async () => {
    const applied: string[] = [];
    const recorder = recordingPool();

    await runMigrations({
      env: ENV,
      pool: recorder.pool,
      histories: [CORE_HISTORY],
      compiledModuleIds: [],
      apply: (_db, history) => {
        applied.push(history.name);

        return Promise.resolve();
      },
    });

    expect(applied).toEqual(["core"]);
    expect(recorder.statements[0]).toContain("SET lock_timeout = 1000");
    expect(recorder.statements[1]).toContain("pg_advisory_lock");
    expect(recorder.statements.at(-2)).toContain("pg_advisory_unlock");
    expect(recorder.statements.at(-1)).toBe("RESET lock_timeout");
    expect(recorder.released).toEqual([false]);
  });

  it("resets the setting and takes no history when the lock times out", async () => {
    const recorder = recordingPool([
      { match: "pg_advisory_lock", error: lockTimeout() },
    ]);

    let applied = 0;

    await expect(
      runMigrations({
        env: ENV,
        pool: recorder.pool,
        histories: [CORE_HISTORY],
        compiledModuleIds: [],
        apply: () => {
          applied += 1;

          return Promise.resolve();
        },
      })
    ).rejects.toMatchObject({ code: "migration-lock-timeout" });

    expect(applied).toBe(0);
    expect(recorder.statements).toContain("RESET lock_timeout");
    expect(recorder.statements.join(" ")).not.toContain("pg_advisory_unlock");
    expect(recorder.released).toEqual([false]);
  });

  it("destroys the client when the reset after a timeout also fails", async () => {
    const recorder = recordingPool([
      { match: "pg_advisory_lock", error: lockTimeout() },
      { match: "RESET", error: new Error("connection terminated") },
    ]);

    await expect(
      runMigrations({
        env: ENV,
        pool: recorder.pool,
        histories: [CORE_HISTORY],
        compiledModuleIds: [],
        apply: () => Promise.resolve(),
      })
    ).rejects.toMatchObject({ code: "migration-lock-timeout" });

    // The acquisition error survives the second failure, and the client goes away.
    expect(recorder.released).toEqual([true]);
  });

  it("keeps the migration error when the unlock afterwards fails", async () => {
    const recorder = recordingPool([
      { match: "pg_advisory_unlock", error: new Error("connection lost") },
    ]);

    const cause = new Error('relation "placeholder_record" does not exist');

    const raised: Error | undefined = await runMigrations({
      env: ENV,
      pool: recorder.pool,
      histories: [CORE_HISTORY],
      compiledModuleIds: [],
      apply: () => Promise.reject(cause),
    }).then(
      () => undefined,
      (error: Error) => error
    );

    expect(raised).toBeInstanceOf(AppError);
    expect(raised).toMatchObject({ code: "migration-failed", cause });
    expect(recorder.released).toEqual([true]);
  });

  it("fails the run when every history applied and the session would not restore", async () => {
    const recorder = recordingPool([
      { match: "pg_advisory_unlock", error: new Error("connection lost") },
    ]);

    await expect(
      runMigrations({
        env: ENV,
        pool: recorder.pool,
        histories: [CORE_HISTORY],
        compiledModuleIds: [],
        apply: () => Promise.resolve(),
      })
    ).rejects.toMatchObject({ code: "migration-failed" });

    expect(recorder.released).toEqual([true]);
  });

  it("raises the setting's own error and destroys the client when the setting itself fails", async () => {
    const setting = new Error("could not set lock_timeout");

    const recorder = recordingPool([
      { match: "SET lock_timeout", error: setting },
    ]);

    // The run never became valid on this session, so the error it started with is the one
    // the caller sees, and the session is destroyed rather than handed back to the pool.
    await expect(
      runMigrations({
        env: ENV,
        pool: recorder.pool,
        histories: [CORE_HISTORY],
        compiledModuleIds: [],
        apply: () => Promise.resolve(),
      })
    ).rejects.toBe(setting);

    expect(recorder.released).toEqual([true]);
  });

  it("fails closed and destroys the client when the unlock answers false", async () => {
    const recorder = recordingPool([
      { match: "pg_advisory_unlock", rows: [{ pg_advisory_unlock: false }] },
    ]);

    let applied = 0;

    // An unlock that answers false means this session does not hold, and so did not
    // release, the one advisory lock of the application: the state of the session is
    // unknown, the run cannot pass, and the client goes away.
    await expect(
      runMigrations({
        env: ENV,
        pool: recorder.pool,
        histories: [CORE_HISTORY],
        compiledModuleIds: [],
        apply: () => {
          applied += 1;

          return Promise.resolve();
        },
      })
    ).rejects.toMatchObject({ code: "migration-failed" });

    expect(applied).toBe(1);
    expect(recorder.released).toEqual([true]);
  });

  it("keeps the migration failure and still destroys the client when the cleanup cannot be logged", async () => {
    const recorder = recordingPool([
      { match: "RESET", error: new Error("connection terminated") },
    ]);

    const cause = new Error('relation "placeholder_record" does not exist');

    const raised: Error | undefined = await runMigrations({
      env: ENV,
      pool: recorder.pool,
      histories: [CORE_HISTORY],
      compiledModuleIds: [],
      log: brokenLogger,
      apply: () => Promise.reject(cause),
    }).then(
      () => undefined,
      (error: Error) => error
    );

    // A logger that throws during the cleanup report must not replace the migration error
    // the caller already had, and the unusable session still goes away.
    expect(raised).toBeInstanceOf(AppError);
    expect(raised).toMatchObject({ code: "migration-failed", cause });
    expect(recorder.released).toEqual([true]);
  });

  it("reports the cleanup error it swallowed to the log", async () => {
    const reset = new Error("connection terminated");

    const recorder = recordingPool([{ match: "RESET", error: reset }]);

    const events: Array<{
      event: string;
      history?: string;
      error?: unknown;
    }> = [];

    await expect(
      runMigrations({
        env: ENV,
        pool: recorder.pool,
        histories: [CORE_HISTORY],
        compiledModuleIds: [],
        log: (event) => {
          events.push(event);
        },
        apply: () => Promise.resolve(),
      })
    ).rejects.toMatchObject({ code: "migration-failed" });

    // The step that failed is named, and the original error is carried whole, so the
    // operator sees the cleanup problem the run chose not to raise.
    expect(events).toContainEqual(
      expect.objectContaining({
        event: "migration-cleanup-failed",
        history: "reset",
        error: reset,
      })
    );
  });
});
