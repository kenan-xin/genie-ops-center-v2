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
};

type Failure = { readonly match: string; readonly error: Error };

/** A client that records its statements, fails the ones it was told to, and notes its release. */
function recordingPool(failures: readonly Failure[] = []) {
  const statements: string[] = [];
  const released: boolean[] = [];

  // SAFETY: pg's `query` carries several overloads, and the run uses one of them, the text
  // with an optional parameter list. The double answers that one.
  const query = ((text: string) => {
    statements.push(text);

    const failure = failures.find((entry) => text.includes(entry.match));

    if (failure !== undefined) return Promise.reject(failure.error);

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

describe("runMigrations, watched through a recording client", () => {
  it("applies every history, unlocks and returns the client", async () => {
    const applied: string[] = [];
    const recorder = recordingPool();

    await runMigrations({
      env: ENV,
      pool: recorder.pool,
      histories: [CORE_HISTORY],
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
        apply: () => Promise.resolve(),
      })
    ).rejects.toMatchObject({ code: "migration-failed" });

    expect(recorder.released).toEqual([true]);
  });
});
