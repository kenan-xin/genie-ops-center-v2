import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { type AfterCommit, withTransaction } from "../src/index.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import {
  type RedactingLogger,
  createLogger,
  silentLogger,
} from "../src/services/logging/index.ts";
import { startDisposablePostgres } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/**
 * One disposable Postgres, the context over it, and a second connection the test itself
 * owns. The observer proves what another session can and cannot see, so no assertion
 * depends on the transaction's own connection answering for the whole database.
 */
type TransactionFixture = {
  readonly context: TenantContext;
  readonly observer: Client;
};

async function startTransactionFixture(
  logger: Pick<RedactingLogger, "error" | "info" | "debug"> = silentLogger()
): Promise<TransactionFixture> {
  const postgres = await startDisposablePostgres();

  const context = createTenantContext(
    {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
    },
    logger,
    []
  );

  const observer = new Client({ connectionString: postgres.url });

  cleanups.push(async () => {
    await observer.end();
    await context.db.$client.end();
    await postgres.stop();
  });

  await observer.connect();

  return { context, observer };
}

/**
 * The withTransaction seam (D-5, D-6). `fn` receives the one transaction over the context's
 * own pool and an after-commit registration. A thrown fn rolls the write back and the
 * after-commit list is discarded; a commit runs each entry exactly once, only once the row
 * is visible to a separate session (the bead's acceptance, R-33, R-54). A throwing after-commit
 * entry is best effort and must not prevent later entries or turn a committed result into a failure.
 */
describe("withTransaction against a real database", () => {
  it("rolls a thrown fn's write back and runs no after-commit entry", async () => {
    const { context, observer } = await startTransactionFixture();
    await context.db.$client.query(
      "create table wt_note (id integer primary key, label text)"
    );

    const afterCommitRan: string[] = [];

    await expect(
      withTransaction(context, async (tx, afterCommit) => {
        afterCommit(() => {
          afterCommitRan.push("entry");
        });

        await tx.execute(
          sql`insert into wt_note (id, label) values (1, 'rolled back')`
        );

        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    const left = await observer.query<{ count: number }>(
      "select count(*)::int as count from wt_note"
    );

    expect(left.rows[0]?.count).toBe(0);
    expect(afterCommitRan).toEqual([]);
  });

  it("rejects and runs no entry when a deferred constraint fails at the commit", async () => {
    const { context, observer } = await startTransactionFixture();
    await context.db.$client.query(
      "create table wt_unique (id integer primary key, code integer, constraint wt_unique_code unique (code) deferrable initially deferred)"
    );

    const afterCommitRan: string[] = [];

    await expect(
      withTransaction(context, async (tx, afterCommit) => {
        afterCommit(() => {
          afterCommitRan.push("entry");
        });

        // Both rows pass their own insert; the unique violation surfaces only when the
        // transaction commits, so this pins that a failed commit runs no entry.
        await tx.execute(sql`insert into wt_unique (id, code) values (1, 7)`);
        await tx.execute(sql`insert into wt_unique (id, code) values (2, 7)`);

        return "never-returned";
      })
    ).rejects.toThrow();

    const left = await observer.query<{ count: number }>(
      "select count(*)::int as count from wt_unique"
    );

    expect(left.rows[0]?.count).toBe(0);
    expect(afterCommitRan).toEqual([]);
  });

  it("commits the write and runs each after-commit entry exactly once, after the commit", async () => {
    const { context, observer } = await startTransactionFixture();
    await context.db.$client.query(
      "create table wt_note (id integer primary key, label text)"
    );

    const rowsSeenWhileEntryRan: number[] = [];
    const runCounts = new Map<string, number>();

    const countFromObserver = async () => {
      const left = await observer.query<{ count: number }>(
        "select count(*)::int as count from wt_note"
      );

      rowsSeenWhileEntryRan.push(left.rows[0]?.count ?? -1);
    };

    const result = await withTransaction(context, async (tx, afterCommit) => {
      await tx.execute(
        sql`insert into wt_note (id, label) values (1, 'committed')`
      );

      afterCommit(() => {
        runCounts.set("first", (runCounts.get("first") ?? 0) + 1);

        return countFromObserver();
      });

      afterCommit(() => {
        runCounts.set("second", (runCounts.get("second") ?? 0) + 1);

        return countFromObserver();
      });

      return "transaction-result";
    });

    // Each entry saw the committed row from its own separate query, so both ran only
    // after the commit was durable, and each entry's own counter shows exactly one run.
    expect(result).toBe("transaction-result");
    expect(rowsSeenWhileEntryRan).toEqual([1, 1]);
    expect(runCounts.get("first")).toBe(1);
    expect(runCounts.get("second")).toBe(1);
  });

  it("keeps the committed result and runs later entries when an after-commit entry throws", async () => {
    const lines: string[] = [];

    const logger = createLogger(
      { logLevel: "error" },
      { write: (line: string) => void lines.push(line) }
    );

    const { context } = await startTransactionFixture(logger);
    const entriesRan: string[] = [];

    const result = await withTransaction(context, async (_tx, afterCommit) => {
      afterCommit(() => {
        entriesRan.push("throwing");
        throw new Error("after-commit failure");
      });

      afterCommit(() => {
        entriesRan.push("later");
      });

      return "transaction-result";
    });

    // TenantContext does not expose its constructor logger, so this pins the observable seam:
    // best-effort handlers cannot turn a committed result into a caller-visible failure.
    expect(result).toBe("transaction-result");
    expect(entriesRan).toEqual(["throwing", "later"]);

    // The factory kept the logger off the context and the seam records the failure through it,
    // so a best-effort entry is never swallowed silently.
    const logged = lines.join("");
    expect(logged).toContain("after-commit entry failed");
    expect(logged).toContain("after-commit failure");
  });

  it("refuses a nested call on the same context and opens no second connection", async () => {
    const { context, observer } = await startTransactionFixture();

    let poolDuring:
      | { readonly total: number; readonly idle: number }
      | undefined;

    let otherBackendsDuring: number[] = [];

    const result = await withTransaction(context, async (tx) => {
      await expect(
        withTransaction(context, async () => "inner")
      ).rejects.toThrow(/cannot be nested/);

      await tx.execute(sql`select 1`);

      poolDuring = {
        total: context.db.$client.totalCount,
        idle: context.db.$client.idleCount,
      };

      const backends = await observer.query<{ pid: number }>(
        "select pid from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()"
      );

      otherBackendsDuring = backends.rows.map((row) => row.pid);

      return "outer";
    });

    expect(result).toBe("outer");
    // The refused inner call never reached the pool: only the outer transaction's client exists.
    expect(poolDuring).toEqual({ total: 1, idle: 0 });
    expect(otherBackendsDuring).toHaveLength(1);
  });

  it("runs two parallel top-level calls on one context, each committing and running its entries", async () => {
    const { context, observer } = await startTransactionFixture();
    await context.db.$client.query(
      "create table wt_parallel (id integer primary key, label text)"
    );

    const entriesRan: string[] = [];

    const [first, second] = await Promise.all([
      withTransaction(context, async (tx, afterCommit) => {
        await tx.execute(
          sql`insert into wt_parallel (id, label) values (1, 'first')`
        );

        afterCommit(() => {
          entriesRan.push("first");
        });

        return "first-result";
      }),
      withTransaction(context, async (tx, afterCommit) => {
        await tx.execute(
          sql`insert into wt_parallel (id, label) values (2, 'second')`
        );

        afterCommit(() => {
          entriesRan.push("second");
        });

        return "second-result";
      }),
    ]);

    // Two concurrent top-level calls are not nesting: the guard marks only the call's own async
    // tree, so each call opens its own transaction and both run their own after-commit entry.
    expect(first).toBe("first-result");
    expect(second).toBe("second-result");
    expect(entriesRan.toSorted()).toEqual(["first", "second"]);

    const left = await observer.query<{ count: number }>(
      "select count(*)::int as count from wt_parallel"
    );

    expect(left.rows[0]?.count).toBe(2);
  });

  it("refuses an afterCommit registration once fn has settled", async () => {
    const { context } = await startTransactionFixture();

    let late: AfterCommit | undefined;

    const result = await withTransaction(context, async (_tx, afterCommit) => {
      late = afterCommit;

      return "transaction-result";
    });

    expect(result).toBe("transaction-result");
    expect(late).toBeDefined();

    // fn has settled, so the seam has already taken the list: a late registration is a
    // programming error, not a silently dropped side effect.
    expect(() => late?.(() => {})).toThrow(/while fn runs/);
  });

  it("refuses an afterCommit kept from a finished transaction inside a second one", async () => {
    const { context } = await startTransactionFixture();

    let kept: AfterCommit | undefined;
    let ran = false;

    await withTransaction(context, async (_tx, afterCommit) => {
      kept = afterCommit;
    });

    // The second transaction's scope is running, but the entry belongs to the first one, whose
    // list is closed: joining the second one's commit would run it for the wrong transaction.
    await withTransaction(context, async () => {
      expect(() =>
        kept?.(() => {
          ran = true;
        })
      ).toThrow(/another withTransaction/);
    });

    expect(ran).toBe(false);
  });

  it("keeps a second context's transaction independent inside the first (DEC-34)", async () => {
    const first = await startTransactionFixture();
    const second = await startTransactionFixture();

    await first.context.db.$client.query(
      "create table wt_a (id integer primary key, label text)"
    );
    await second.context.db.$client.query(
      "create table wt_b (id integer primary key, label text)"
    );

    await expect(
      withTransaction(first.context, async (txA) => {
        await txA.execute(sql`insert into wt_a (id, label) values (1, 'a')`);

        // A transaction on another context is not this context's nested transaction: it opens on
        // its own pool and commits on its own, while the outer one may still roll back (DEC-34).
        const inner = await withTransaction(second.context, async (txB) => {
          await txB.execute(sql`insert into wt_b (id, label) values (1, 'b')`);

          return "second-context";
        });

        expect(inner).toBe("second-context");

        throw new Error("roll a back");
      })
    ).rejects.toThrow("roll a back");

    const [a] = (
      await first.observer.query<{ count: number }>(
        "select count(*)::int as count from wt_a"
      )
    ).rows;

    const [b] = (
      await second.observer.query<{ count: number }>(
        "select count(*)::int as count from wt_b"
      )
    ).rows;

    expect(a?.count).toBe(0);
    expect(b?.count).toBe(1);
  });

  it("refuses re-entering the first context through a second one (A to B to A)", async () => {
    const first = await startTransactionFixture();
    const second = await startTransactionFixture();

    await expect(
      withTransaction(first.context, async (txA) => {
        await txA.execute(sql`select 1`);

        await withTransaction(second.context, async (txB) => {
          await txB.execute(sql`select 1`);

          // The chain is A -> B, so a second A is a nested transaction on a context already
          // active: the guard walks every ancestor, not only the nearest scope.
          await expect(
            withTransaction(first.context, async () => "inner")
          ).rejects.toThrow(/cannot be nested/);

          return "second";
        });

        return "first";
      })
    ).resolves.toBe("first");
  });

  it("serves the transaction from the context's own pool and opens no second connection", async () => {
    const { context, observer } = await startTransactionFixture();

    let txPid: number | undefined;

    let poolDuring:
      | { readonly total: number; readonly idle: number }
      | undefined;

    let otherBackendsDuring: number[] = [];

    await withTransaction(context, async (tx) => {
      const identity = await tx.execute<{ pid: number }>(
        sql`select pg_backend_pid() as pid`
      );

      txPid = identity.rows[0]?.pid;

      poolDuring = {
        total: context.db.$client.totalCount,
        idle: context.db.$client.idleCount,
      };

      // Every backend on this database except the observer itself. While fn runs there
      // must be exactly one, and it must be the transaction's own.
      const backends = await observer.query<{ pid: number }>(
        "select pid from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()"
      );

      otherBackendsDuring = backends.rows.map((row) => row.pid);
    });

    expect(txPid).toBeDefined();
    // The pool owns exactly one client, and it is checked out serving the transaction.
    expect(poolDuring).toEqual({ total: 1, idle: 0 });
    // That pool client is the transaction's backend: no second pool, no outside connection.
    expect(otherBackendsDuring).toEqual([txPid]);

    // The transaction's client returned to the context pool; still exactly one connection.
    expect(context.db.$client.totalCount).toBe(1);
    expect(context.db.$client.idleCount).toBe(1);
  });
});
