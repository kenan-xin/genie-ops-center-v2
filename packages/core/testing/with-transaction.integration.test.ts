import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { withTransaction } from "../src/index.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
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

async function startTransactionFixture(): Promise<TransactionFixture> {
  const postgres = await startDisposablePostgres();

  const context = createTenantContext(
    {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
    },
    silentLogger()
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
    const { context } = await startTransactionFixture();
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
