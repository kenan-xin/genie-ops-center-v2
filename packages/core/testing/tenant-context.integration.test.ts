import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { startDisposablePostgres } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("tenant context database clients", () => {
  it("keeps an error listener while a client is checked out", async () => {
    const postgres = await startDisposablePostgres();

    const context = createTenantContext({
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
    });

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

    const context = createTenantContext({
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
    });

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
