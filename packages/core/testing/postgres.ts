import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";

/** The Postgres the image is built against (tech stack, Database row). */
export const POSTGRES_IMAGE = "postgres:18-alpine";

export type DisposablePostgres = {
  /** The connection string of a database with nothing in it. */
  readonly url: string;
  /** Removes the container. Always call it, in a `finally` or an `afterEach`. */
  readonly stop: () => Promise<void>;
};

/**
 * One disposable Postgres with no history applied. A test that proves the
 * migrator itself takes this, because it must decide when and how the histories
 * run; every other test takes `startDisposableDeployment`, which applies them
 * the way the image does.
 *
 * Each call starts its own container rather than sharing one per run. Sharing
 * was tried and rejected on evidence: `pg_locks` is cluster-wide, so the
 * migrator's `select count(*) from pg_locks where locktype = 'advisory'` saw a
 * sibling database's lock on a shared cluster and failed ("holds no advisory
 * lock once a run has finished" got 1). A cluster per caller is what makes those
 * assertions about this run's own lock and no other.
 *
 * Because every caller starts a container, the starts are what contend when
 * several integration files run at once. Testcontainers 12.1.0 waits a fixed
 * 10 s for the daemon to report each published host port
 * (`inspectContainerUntilPortsExposed`), and `withStartupTimeout` does not
 * reach it, so a loaded daemon fails a start that would succeed moments later
 * with `Timed out after 10000ms while waiting for container ports to be bound
 * to the host`. `startContainerWithRetry` retries exactly that failure a bounded
 * number of times.
 */
export async function startDisposablePostgres(): Promise<DisposablePostgres> {
  const container = await startContainerWithRetry();

  return {
    url: container.getConnectionUri(),
    stop: () => container.stop().then(() => undefined),
  };
}

/**
 * How many starts one call may make, and how long it waits between them.
 *
 * The retry exists only for the transient host port-bind timeout, whose wait is
 * a fixed 10 s inside testcontainers and cannot be raised through the public
 * API. A loaded daemon can miss even a second attempt, so there are three: the
 * worst case is 10 s, 1 s, 10 s, 1 s, 10 s — 32 s, over the 30 s line, and the
 * reason is that each attempt is the library's own fixed wait rather than a
 * timeout this helper raises. A real failure (no daemon, a bad image) still
 * throws on the first attempt, and the integration configs bound how many of
 * these starts overlap (`maxWorkers`), so the retry is a safety net.
 */
const START_ATTEMPTS = 3;

const RETRY_BACKOFF_MS = 1000;

async function startContainerWithRetry(): Promise<StartedPostgreSqlContainer> {
  let lastError: Error | undefined;

  /* oxlint-disable no-await-in-loop -- the retry is sequential by definition: each attempt exists only because the previous one timed out. */
  for (let attempt = 1; attempt <= START_ATTEMPTS; attempt += 1) {
    try {
      return await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const portBindTimedOut = lastError.message.includes(
        "waiting for container ports to be bound to the host"
      );

      if (attempt === START_ATTEMPTS || !portBindTimedOut) {
        throw lastError;
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    }
  }
  /* oxlint-enable no-await-in-loop */

  throw lastError ?? new Error("the Postgres container never started");
}
