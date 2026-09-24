import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";

import {
  type TenantContext,
  createTenantContext,
} from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import {
  type ModuleHistorySource,
  migrationPlan,
  moduleHistory,
  runMigrations,
} from "../src/services/migrator/index.ts";

/** The Postgres the image is built against (tech stack, Database row). */
const POSTGRES_IMAGE = "postgres:18-alpine";

export { enableModules } from "./enable-modules.ts";

export type DisposableDeployment = {
  readonly context: TenantContext;
  /** Closes the pool and removes the container. Always call it, in a `finally` or an `afterAll`. */
  readonly stop: () => Promise<void>;
};

export type DisposablePostgres = {
  /** The connection string of a database with nothing in it. */
  readonly url: string;
  /** Removes the container. Always call it, in a `finally` or an `afterEach`. */
  readonly stop: () => Promise<void>;
};

/**
 * One disposable Postgres with no history applied. A test that proves the migrator itself takes
 * this, because it must decide when and how the histories run; every other test takes
 * `startDisposableDeployment`, which applies them the way the image does.
 */
export async function startDisposablePostgres(): Promise<DisposablePostgres> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    POSTGRES_IMAGE
  ).start();

  return {
    url: container.getConnectionUri(),
    stop: () => container.stop().then(() => undefined),
  };
}

/**
 * One disposable Postgres with the same histories the image applies, in the same order (R-28,
 * R-38). Every integration test takes one of these; none mocks the database.
 *
 * A module's declaration is passed in by the caller, because core imports no module (R-39).
 * The app harness composes this helper with the included modules' declarations.
 */
export async function startDisposableDeployment(
  modules: readonly ModuleHistorySource[] = []
): Promise<DisposableDeployment> {
  const postgres = await startDisposablePostgres();

  const compiledModuleIds = modules.map((module) => module.identity.id);

  const context = createTenantContext(
    {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
    },
    silentLogger(),
    compiledModuleIds
  );

  const stop = async () => {
    await context.db.$client.end();
    await postgres.stop();
  };

  try {
    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan(modules.map(moduleHistory)),
      compiledModuleIds,
    });
  } catch (error) {
    await stop();

    throw error;
  }

  return { context, stop };
}
