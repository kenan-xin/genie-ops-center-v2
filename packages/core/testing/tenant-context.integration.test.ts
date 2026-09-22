import { Client } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { validateEnvironment } from "../src/lib/environment/index.ts";
import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import type { LogValue } from "../src/services/logging/index.ts";
import { createLogger, silentLogger } from "../src/services/logging/index.ts";
import { startDisposablePostgres } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("tenant context database clients", () => {
  it("contains an idle client's failure, logs it and recovers the pool when its backend is terminated", async () => {
    const postgres = await startDisposablePostgres();

    const source = {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
    };

    // The deployment's own redacting logger, not a test stub, so the line this case reads is the
    // line production writes (R-45).
    const lines: LogValue[] = [];

    const logger = createLogger(validateEnvironment(source), {
      write(line: string) {
        lines.push(JSON.parse(line));
      },
    });

    const context = createTenantContext(source, logger);
    const terminator = new Client({ connectionString: postgres.url });

    cleanups.push(async () => {
      await context.db.$client.end();
      await terminator.end();
      await postgres.stop();
    });

    const idle = await context.db.$client.connect();

    const identity = await idle.query<{ pid: number }>(
      "select pg_backend_pid() as pid"
    );

    const terminatedPid = identity.rows[0]?.pid;

    if (terminatedPid === undefined) {
      throw new Error("the reserved client reported no backend pid");
    }

    // Back to the pool, where pg-pool attaches its own idle listener. That is the window this
    // fix covers: a checked-out listener is not attached while a client sits idle.
    idle.release();

    await terminator.connect();
    await terminator.query("select pg_terminate_backend($1)", [terminatedPid]);

    // pg-pool re-emits the idle client's failure on the Pool. Without a pool listener Node
    // turns that into an uncaught exception and the process exits, so this wait is also the
    // proof that the process stayed up.
    await vi.waitFor(
      () => {
        expect(lines).toContainEqual(
          expect.objectContaining({ msg: "idle database client error" })
        );
      },
      { timeout: 10000, interval: 100 }
    );

    // The pool discarded the broken client synchronously before it emitted, so it holds none.
    expect(context.db.$client.totalCount).toBe(0);

    const recovered = await context.db.$client.connect();

    try {
      const next = await recovered.query<{ pid: number }>(
        "select pg_backend_pid() as pid"
      );

      expect(next.rows[0]?.pid).toBeDefined();
      expect(next.rows[0]?.pid).not.toBe(terminatedPid);
    } finally {
      recovered.release();
    }
  });

  it("keeps an error listener while a client is checked out", async () => {
    const postgres = await startDisposablePostgres();

    const context = createTenantContext(
      {
        DATABASE_URL: postgres.url,
        PUBLIC_URL: "https://test.example.invalid",
      },
      silentLogger()
    );

    cleanups.push(async () => {
      await context.db.$client.end();
      await postgres.stop();
    });

    const client = await context.db.$client.connect();

    try {
      expect(client.listenerCount("error")).toBeGreaterThan(0);
    } finally {
      client.release(true);
    }
  });

  it("rejects the active query when its backend terminates", async () => {
    const postgres = await startDisposablePostgres();

    const context = createTenantContext(
      {
        DATABASE_URL: postgres.url,
        PUBLIC_URL: "https://test.example.invalid",
      },
      silentLogger()
    );

    const terminator = new Client({ connectionString: postgres.url });

    cleanups.push(async () => {
      await context.db.$client.end();
      await terminator.end();
      await postgres.stop();
    });

    await terminator.connect();

    const client = await context.db.$client.connect();

    try {
      const identity = await client.query<{ pid: number }>(
        "select pg_backend_pid() as pid"
      );

      const backendPid = identity.rows[0]?.pid;

      expect(backendPid).toBeDefined();

      const clientError = new Promise<Error>((resolve) => {
        client.once("error", resolve);
      });

      const queryFailure = client.query("select pg_sleep(30)").then(
        () => undefined,
        (error: Error) => error
      );

      await terminator.query("select pg_terminate_backend($1)", [backendPid]);

      const [queryError, emittedError] = await Promise.all([
        queryFailure,
        clientError,
      ]);

      expect(queryError).toMatchObject({
        code: "57P01",
        message: "terminating connection due to administrator command",
      });
      expect(emittedError).toMatchObject({
        message: "Connection terminated unexpectedly",
      });
    } finally {
      client.release(true);
    }
  });
});
