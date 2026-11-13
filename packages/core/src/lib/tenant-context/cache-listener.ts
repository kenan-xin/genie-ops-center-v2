import { Client } from "pg";

import type { RedactingLogger } from "../../services/logging/index.ts";
import { TENANT_CACHE_CHANNEL } from "./readers.ts";

/** The first wait before a reconnect; each failed attempt doubles it up to the cap (DEC-58). */
const FIRST_RETRY_MS = 500;

const MAX_RETRY_MS = 10_000;

/**
 * The one listening connection of a process (DEC-58). The app and the worker start it after their
 * migrations and stop it before their pool closes; a command or a test never starts it and relies
 * on the ten-second expiry. Neither call rejects.
 */
export type CacheListener = {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
};

/**
 * Builds the listener. It opens nothing until `start`: then one dedicated `pg.Client`, never a
 * pool client, runs `LISTEN` on `TENANT_CACHE_CHANNEL` and clears every cache on each
 * notification. After each successful (re)connect it clears every cache once, because a
 * notification sent while it was down is lost. A dropped connection logs one line and reconnects
 * with a capped backoff.
 */
export function createCacheListener(input: {
  readonly connectionString: string;
  readonly applicationName: string | undefined;
  readonly connectionTimeoutMillis: number;
  readonly clearAll: () => void;
  readonly logger: Pick<RedactingLogger, "error">;
}): CacheListener {
  let started = false;
  // The client of the attempt in progress or the live connection. Each handler acts only while
  // its own client is still this one, so a stopped or replaced client never reconnects.
  let current: Client | undefined;
  let retry: NodeJS.Timeout | undefined;
  let delay = FIRST_RETRY_MS;

  function reconnectLater(): void {
    retry = setTimeout(() => {
      retry = undefined;
      void connect();
    }, delay);
    // A forgotten listener must not hold a test process open.
    retry.unref();
    delay = Math.min(delay * 2, MAX_RETRY_MS);
  }

  async function connect(): Promise<void> {
    const client = new Client({
      connectionString: input.connectionString,
      application_name: input.applicationName,
      connectionTimeoutMillis: input.connectionTimeoutMillis,
      keepAlive: true,
    });

    current = client;

    // A terminated backend raises `error`, then `end`: the first one reconnects, the second finds
    // the client already replaced. The connection string is never part of the line.
    const dropped = (error: Error | undefined) => {
      if (current !== client) return;

      current = undefined;
      input.logger.error(
        { err: error },
        "tenant cache listener lost its connection; reconnecting"
      );
      reconnectLater();
    };

    // Attached before `connect`, because an `error` with no listener is an uncaught exception.
    client.on("error", dropped);
    client.on("notification", () => input.clearAll());

    try {
      await client.connect();
      await client.query(`LISTEN ${TENANT_CACHE_CHANNEL}`);
    } catch (error) {
      // pg rejects a failed connect rather than raising `error` (pg 8 client.js).
      dropped(error instanceof Error ? error : undefined);
      // A half-open client after a failed connect or LISTEN; its end needs no wait.
      client.end().catch(() => {});

      return;
    }

    // Attached only now, so a failed attempt logs its own cause and not this ending.
    client.on("end", () => dropped(new Error("connection ended")));
    input.clearAll();
    delay = FIRST_RETRY_MS;
  }

  return {
    async start(): Promise<void> {
      if (started) return;

      started = true;
      delay = FIRST_RETRY_MS;
      await connect();
    },
    async stop(): Promise<void> {
      started = false;
      clearTimeout(retry);
      retry = undefined;

      const client = current;

      current = undefined;
      await client?.end().catch(() => {});
    },
  };
}
