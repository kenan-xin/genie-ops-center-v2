import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";

import {
  type TenantContext,
  createTenantContext,
} from "../src/lib/tenant-context/index.ts";
import {
  type ModuleHistorySource,
  migrationPlan,
  moduleHistory,
  runMigrations,
} from "../src/services/migrator/index.ts";

/** The Postgres the image is built against (tech stack, Database row). */
const POSTGRES_IMAGE = "postgres:18-alpine";

export type DisposableDeployment = {
  readonly context: TenantContext;
  /** Closes the pool and removes the container. Always call it, in a `finally` or an `afterAll`. */
  readonly stop: () => Promise<void>;
};

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
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    POSTGRES_IMAGE
  ).start();

  const context = createTenantContext({
    DATABASE_URL: container.getConnectionUri(),
    PUBLIC_URL: "https://test.example.invalid",
  });

  try {
    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan(modules.map(moduleHistory)),
    });
  } catch (error) {
    await context.db.$client.end();
    await container.stop();

    throw error;
  }

  return {
    context,
    stop: async () => {
      await context.db.$client.end();
      await container.stop();
    },
  };
}
