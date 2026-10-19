import type { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { databaseClient } from "./database-client.ts";
import { startDisposablePostgres } from "./postgres.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/** Resolves when the client's socket has closed. `events.once` is not used: it adds an error listener. */
function ended(client: Client): Promise<void> {
  return new Promise((resolve) => {
    client.once("end", () => resolve());
  });
}

describe("a database client a test owns", () => {
  it("stays handled when the backend of its idle session is terminated", async () => {
    const postgres = await startDisposablePostgres();
    const idle = databaseClient(postgres.url);
    const terminator = databaseClient(postgres.url);

    cleanups.push(async () => {
      await idle.end();
      await terminator.end();
      await postgres.stop();
    });

    await idle.connect();
    await terminator.connect();

    const identity = await idle.query<{ pid: number }>(
      "select pg_backend_pid() as pid"
    );

    const closed = ended(idle);

    // Postgres sends FATAL 57P01 to the idle session, the same message every open session gets
    // when a test stops its container. Nothing awaits the client here, so pg emits `error` on
    // it. With no listener, Node raises that as an uncaught exception and Vitest fails the run
    // even though every test passed (genie-ops-center-v2-lcst).
    await terminator.query("select pg_terminate_backend($1)", [
      identity.rows[0]?.pid,
    ]);

    await closed;

    // The session is gone, and a later query still reports that to the test that sends it.
    await expect(idle.query("select 1")).rejects.toThrow();
  });
});
