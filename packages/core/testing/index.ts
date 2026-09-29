import type { EnvironmentProfile } from "../src/lib/environment/index.ts";
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
import { startDisposablePostgres } from "./postgres.ts";

export { enableModules } from "./enable-modules.ts";

export {
  assignRole,
  insertGroup,
  insertPersonWith,
  insertRole,
  insertUser,
} from "./access-fixtures.ts";

export { insertCredentialPerson } from "./auth-fixtures.ts";

export { insertSession, signedSessionCookie } from "./session-fixtures.ts";

// The Better Auth password hasher, for a test harness that must write a credential account by SQL
// (the e2e global setup) rather than through a context.
export { hashPassword } from "better-auth/crypto";

export { markSetupDone } from "./mark-setup-done.ts";

export { startDisposablePostgres } from "./postgres.ts";

export type { DisposablePostgres } from "./postgres.ts";

export type DisposableDeployment = {
  readonly context: TenantContext;
  /** Closes the pool and removes the container. Always call it, in a `finally` or an `afterAll`. */
  readonly stop: () => Promise<void>;
};

export type DisposableDeploymentOptions = {
  /** Extra environment values; a test whose subject is authentication supplies the auth set. */
  readonly env?: Readonly<Record<string, string>>;
  /** The environment profile the context is built with. The default builds no auth member. */
  readonly profile?: EnvironmentProfile;
};

/**
 * One disposable Postgres with the same histories the image applies, in the same order (R-28,
 * R-38). Every integration test takes one of these; none mocks the database.
 *
 * A module's declaration is passed in by the caller, because core imports no module (R-39).
 * The app harness composes this helper with the included modules' declarations.
 */
export async function startDisposableDeployment(
  modules: readonly ModuleHistorySource[] = [],
  options: DisposableDeploymentOptions = {}
): Promise<DisposableDeployment> {
  const postgres = await startDisposablePostgres();

  const compiledModuleIds = modules.map((module) => module.identity.id);

  const context = createTenantContext(
    {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://test.example.invalid",
      ...options.env,
    },
    silentLogger(),
    compiledModuleIds,
    undefined,
    options.profile ?? "core"
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
