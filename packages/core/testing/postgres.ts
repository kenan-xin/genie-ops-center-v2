import { PostgreSqlContainer } from "@testcontainers/postgresql";

import { startWithPortBindRetry } from "./container-start.ts";

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
 * several integration files run at once, so the start goes through
 * `startWithPortBindRetry`, which retries the transient host port-bind timeout.
 */
export async function startDisposablePostgres(): Promise<DisposablePostgres> {
  const container = await startWithPortBindRetry(
    () => new PostgreSqlContainer(POSTGRES_IMAGE)
  );

  return {
    url: container.getConnectionUri(),
    stop: () => container.stop().then(() => undefined),
  };
}
