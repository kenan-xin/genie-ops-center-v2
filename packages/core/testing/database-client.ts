import { Client, type ClientConfig } from "pg";

/**
 * A plain pg client for a test that needs its own session beside the context pool: an observer,
 * a lock holder, a session that terminates another. It is not connected yet.
 *
 * Postgres ends every open session with FATAL 57P01 when a test stops its container, and when a
 * test terminates a backend on purpose. A cleanup that ends the client at the same time as the
 * container stops does not prevent this: pg skips only the socket-close error after `end()`, not
 * the server's own error message if that arrives first. pg then emits `error` on the client, and
 * Node turns an `error` event with no listener into an uncaught exception. Vitest fails the whole
 * run on it even when every test passed (genie-ops-center-v2-lcst).
 *
 * The listener only keeps the process up. A query that is running or sent later still rejects
 * with the failure, so a test loses nothing it could assert on. Production clients come from the
 * tenant context pool, which has its own listeners.
 */
export function databaseClient(config: string | ClientConfig): Client {
  const client = new Client(config);

  client.on("error", () => {});

  return client;
}
